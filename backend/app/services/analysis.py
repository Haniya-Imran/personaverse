"""Orchestrates one segmentation analysis: preprocess → compare → fit → project → describe."""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from . import clustering, intelligence, reduction
from .features import build_preprocessor, prepare_frame, validate_selection
from .ingestion import Dataset


@dataclass
class Analysis:
    dataset_id: str
    dataset: Dataset
    numeric: list[str]
    categorical: list[str]
    preprocessor: object
    X: np.ndarray
    feature_names: list[str]
    comparison: dict
    model: clustering.FittedModel
    metrics: dict
    projection: dict
    insights: dict
    requested: dict
    runtime_s: float
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None).isoformat() + "Z")


_comparison_cache: dict[tuple, dict] = {}


def run(dataset_id: str, ds: Dataset, numeric: list[str], categorical: list[str],
        algorithm: str = "auto", n_clusters: int | None = None, eps: float | None = None,
        min_samples: int | None = None) -> Analysis:
    t0 = time.time()
    validate_selection(ds.data, numeric, categorical)
    pre = build_preprocessor(numeric, categorical)
    X = pre.fit_transform(prepare_frame(ds.data, numeric, categorical)).astype(float)
    names = list(pre.get_feature_names_out())

    key = (dataset_id, tuple(numeric), tuple(categorical))
    comp = _comparison_cache.get(key)
    if comp is None:
        comp = clustering.compare(X)
        _comparison_cache[key] = comp
        if len(_comparison_cache) > 50:
            _comparison_cache.pop(next(iter(_comparison_cache)))

    if algorithm == "auto":
        algo, params = comp["selection"]["algorithm"], dict(comp["selection"]["params"])
    elif algorithm in ("kmeans", "agglomerative"):
        if not n_clusters or not 2 <= n_clusters <= 12:
            raise ValueError("Choose between 2 and 12 segments.")
        if n_clusters >= len(X):
            raise ValueError("More segments than customers.")
        algo, params = algorithm, {"n_clusters": int(n_clusters)}
        if algo == "agglomerative":
            params["linkage"] = "ward"
    elif algorithm == "dbscan":
        ms = int(min_samples or max(5, 2 * X.shape[1]))
        e = float(eps or clustering.dbscan_eps_candidates(X, ms)[1])
        if e <= 0:
            raise ValueError("eps must be positive.")
        algo, params = "dbscan", {"eps": e, "min_samples": ms}
    else:
        raise ValueError("Unknown algorithm.")

    model = clustering.fit(X, algo, params)
    metrics = clustering.evaluate(X, model.labels)
    if metrics["n_clusters"] < 1:
        raise ValueError("This configuration put every customer into noise. Increase eps or lower min_samples.")
    if algo == "kmeans":
        metrics["stability"] = round(clustering.kmeans_stability(X[clustering._subsample(len(X), 6000)], params["n_clusters"]), 4)
    projection = reduction.project(X, names)
    insights = intelligence.compute_segments(ds.data, model.labels, numeric, categorical, metrics["silhouette"])
    return Analysis(dataset_id=dataset_id, dataset=ds, numeric=numeric, categorical=categorical, preprocessor=pre,
                    X=X, feature_names=names, comparison=comp, model=model, metrics=metrics, projection=projection,
                    insights=insights, requested={"algorithm": algorithm, "n_clusters": n_clusters, "eps": eps,
                                                  "min_samples": min_samples},
                    runtime_s=round(time.time() - t0, 2))


def assign(a: Analysis, records: pd.DataFrame) -> np.ndarray:
    missing = [c for c in a.numeric + a.categorical if c not in records.columns]
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")
    X = a.preprocessor.transform(prepare_frame(records, a.numeric, a.categorical)).astype(float)
    return a.model.assign(X)


def summary(analysis_id: str, a: Analysis) -> dict:
    sel = a.comparison["selection"]
    chosen_auto = a.requested["algorithm"] == "auto"
    return {
        "analysis_id": analysis_id, "dataset_id": a.dataset_id, "created_at": a.created_at,
        "runtime_seconds": a.runtime_s,
        "features": {"numeric": a.numeric, "categorical": a.categorical, "encoded": a.feature_names},
        "model": {"algorithm": a.model.algorithm, "params": a.model.params,
                  "selected_automatically": chosen_auto,
                  "assignment_note": clustering.ASSIGNMENT_NOTES[a.model.algorithm]},
        "metrics": a.metrics,
        "comparison": {"candidates": a.comparison["candidates"], "elbow": a.comparison["elbow"],
                       "elbow_k": a.comparison["elbow_k"],
                       "recommended": {"algorithm": sel["algorithm"], "params": sel["params"]},
                       "explanation": sel["explanation"]},
        "projection": {k: v for k, v in a.projection.items() if k != "coords"},
        "segments": [{"id": s["id"], "statistical_name": s["statistical_name"], "size": s["size"],
                      "share": s["share"], "is_noise": s["is_noise"]} for s in a.insights["segments"]],
    }
