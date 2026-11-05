"""Segmentation Engine: compare algorithms, select a model, fit and assign.

Algorithms: K-Means, Agglomerative (Ward) and DBSCAN.
Metrics: inertia (elbow), silhouette, Davies-Bouldin, Calinski-Harabasz, cluster
size balance, noise share (DBSCAN) and K-Means stability (adjusted Rand index
across re-runs on subsamples). Accuracy is never used — there are no labels.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.cluster import DBSCAN, AgglomerativeClustering, KMeans
from sklearn.metrics import (adjusted_rand_score, calinski_harabasz_score, davies_bouldin_score,
                             silhouette_score)
from sklearn.neighbors import NearestNeighbors

SEED = 42
SIL_SAMPLE = 3000
AGG_MAX = 6000
DBSCAN_MAX = 15000
MIN_CLUSTER_SHARE = 0.03
MAX_INTERPRETABLE_K = 8


def _round(x, n=4):
    return None if x is None or not np.isfinite(x) else round(float(x), n)


def evaluate(X: np.ndarray, labels: np.ndarray) -> dict:
    mask = labels >= 0
    ks = np.unique(labels[mask])
    sizes = {int(k): int((labels == k).sum()) for k in ks}
    noise = float((~mask).mean())
    out = {"n_clusters": int(len(ks)), "noise_share": _round(noise), "sizes": sizes,
           "min_cluster_share": _round(min(sizes.values()) / len(labels)) if sizes else None,
           "silhouette": None, "davies_bouldin": None, "calinski_harabasz": None}
    if len(ks) < 2 or mask.sum() <= len(ks):
        return out
    Xm, lm = X[mask], labels[mask]
    sample = min(SIL_SAMPLE, len(Xm))
    out["silhouette"] = _round(silhouette_score(Xm, lm, sample_size=sample, random_state=SEED))
    out["davies_bouldin"] = _round(davies_bouldin_score(Xm, lm))
    out["calinski_harabasz"] = _round(calinski_harabasz_score(Xm, lm), 1)
    return out


def _subsample(n: int, size: int, seed: int = SEED) -> np.ndarray:
    if n <= size:
        return np.arange(n)
    return np.random.default_rng(seed).choice(n, size, replace=False)


def _nearest_centroid(X: np.ndarray, centroids: np.ndarray) -> np.ndarray:
    d = ((X[:, None, :] - centroids[None, :, :]) ** 2).sum(-1)
    return d.argmin(1)


def kmeans_stability(X: np.ndarray, k: int, runs: int = 4) -> float:
    base = KMeans(k, n_init=10, random_state=SEED).fit(X).labels_
    scores = []
    for r in range(runs):
        idx = _subsample(len(X), int(len(X) * 0.8), seed=SEED + r + 1)
        m = KMeans(k, n_init=5, random_state=SEED + r + 1).fit(X[idx])
        scores.append(adjusted_rand_score(base, m.predict(X)))
    return float(np.mean(scores))


def run_kmeans(X: np.ndarray, k: int) -> tuple[np.ndarray, KMeans]:
    m = KMeans(k, n_init=10, random_state=SEED).fit(X)
    return m.labels_, m


def run_agglomerative(X: np.ndarray, k: int) -> tuple[np.ndarray, dict]:
    idx = _subsample(len(X), AGG_MAX)
    m = AgglomerativeClustering(n_clusters=k, linkage="ward").fit(X[idx])
    centroids = np.vstack([X[idx][m.labels_ == c].mean(0) for c in range(k)])
    labels = np.empty(len(X), dtype=int)
    labels[idx] = m.labels_
    rest = np.setdiff1d(np.arange(len(X)), idx)
    if len(rest):
        labels[rest] = _nearest_centroid(X[rest], centroids)
    return labels, {"centroids": centroids, "fitted_on": int(len(idx))}


def dbscan_eps_candidates(X: np.ndarray, min_samples: int) -> list[float]:
    idx = _subsample(len(X), 5000)
    nn = NearestNeighbors(n_neighbors=min_samples).fit(X[idx])
    dist = np.sort(nn.kneighbors(X[idx])[0][:, -1])
    return sorted({round(float(np.percentile(dist, p)), 3) for p in (60, 75, 88, 94)})


def run_dbscan(X: np.ndarray, eps: float, min_samples: int) -> tuple[np.ndarray, dict]:
    idx = _subsample(len(X), DBSCAN_MAX)
    m = DBSCAN(eps=eps, min_samples=min_samples).fit(X[idx])
    labels = np.full(len(X), -1, dtype=int)
    labels[idx] = m.labels_
    core = X[idx][m.core_sample_indices_] if len(m.core_sample_indices_) else np.empty((0, X.shape[1]))
    core_labels = m.labels_[m.core_sample_indices_]
    rest = np.setdiff1d(np.arange(len(X)), idx)
    if len(rest) and len(core):
        labels[rest] = _assign_dbscan(X[rest], core, core_labels, eps)
    return labels, {"core": core, "core_labels": core_labels, "eps": eps, "min_samples": min_samples}


def _assign_dbscan(X: np.ndarray, core: np.ndarray, core_labels: np.ndarray, eps: float) -> np.ndarray:
    nn = NearestNeighbors(n_neighbors=1).fit(core)
    d, i = nn.kneighbors(X)
    out = core_labels[i[:, 0]].copy()
    out[d[:, 0] > eps] = -1
    return out


def compare(X: np.ndarray, k_min: int = 2, k_max: int = 10) -> dict:
    n = len(X)
    k_max = int(max(k_min, min(k_max, n // 15)))
    ks = list(range(k_min, k_max + 1))
    stab_X = X[_subsample(n, 6000)]
    elbow, candidates = [], []
    for k in ks:
        labels, m = run_kmeans(X, k)
        met = evaluate(X, labels)
        met["inertia"] = _round(m.inertia_, 2)
        met["stability"] = _round(kmeans_stability(stab_X, k))
        elbow.append({"k": k, "inertia": met["inertia"]})
        candidates.append({"algorithm": "kmeans", "params": {"n_clusters": k}, "metrics": met})
    for k in ks:
        labels, _ = run_agglomerative(X, k)
        candidates.append({"algorithm": "agglomerative", "params": {"n_clusters": k, "linkage": "ward"},
                           "metrics": evaluate(X, labels)})
    min_samples = max(5, 2 * X.shape[1])
    for eps in dbscan_eps_candidates(X, min_samples):
        labels, _ = run_dbscan(X, eps, min_samples)
        candidates.append({"algorithm": "dbscan", "params": {"eps": eps, "min_samples": min_samples},
                           "metrics": evaluate(X, labels)})
    elbow_k = _elbow_k(elbow)
    selection = select(candidates, elbow_k)
    return {"candidates": candidates, "elbow": elbow, "elbow_k": elbow_k, "selection": selection}


def _elbow_k(elbow: list[dict]) -> int | None:
    if len(elbow) < 3:
        return None
    k = np.array([e["k"] for e in elbow], float)
    y = np.array([e["inertia"] for e in elbow], float)
    kn = (k - k.min()) / (k.max() - k.min())
    yn = (y - y.min()) / (y.max() - y.min() or 1)
    dist = np.abs(kn + yn - 1) / np.sqrt(2)  # distance from the straight line first→last
    return int(k[int(dist.argmax())])


def _validity(c: dict) -> tuple[bool, str | None]:
    m = c["metrics"]
    if m["n_clusters"] < 2 or m["silhouette"] is None:
        return False, "found fewer than two groups"
    if c["algorithm"] == "dbscan" and (m["noise_share"] or 0) > 0.25:
        return False, f"labels {m['noise_share']:.0%} of customers as noise"
    if m["n_clusters"] > MAX_INTERPRETABLE_K:
        return False, f"{m['n_clusters']} groups is too many to act on"
    if (m["min_cluster_share"] or 0) < MIN_CLUSTER_SHARE:
        return False, f"its smallest group holds only {m['min_cluster_share']:.1%} of customers"
    return True, None


def select(candidates: list[dict], elbow_k: int | None) -> dict:
    valid = []
    for c in candidates:
        ok, why = _validity(c)
        c["valid"], c["rejected_because"] = ok, why
        if ok:
            valid.append(c)
    if not valid:
        best = max(candidates, key=lambda c: c["metrics"]["silhouette"] or -1)
        best["score"] = None
        return {"algorithm": best["algorithm"], "params": best["params"],
                "explanation": ["No configuration passed every quality check, so the highest-silhouette option was used. Treat the segments with caution."]}

    def rank(values, higher_better=True):
        arr = np.array(values, float)
        order = arr.argsort()
        if higher_better:
            order = order[::-1]
        r = np.empty(len(arr))
        r[order] = np.arange(len(arr))
        return 1 - r / max(len(arr) - 1, 1)

    sil = rank([c["metrics"]["silhouette"] for c in valid])
    db = rank([c["metrics"]["davies_bouldin"] for c in valid], higher_better=False)
    ch = rank([c["metrics"]["calinski_harabasz"] for c in valid])
    for i, c in enumerate(valid):
        m = c["metrics"]
        score = 0.4 * sil[i] + 0.3 * db[i] + 0.15 * ch[i]
        if c["algorithm"] == "kmeans":
            score += 0.1 * (m.get("stability") or 0)
        if elbow_k and c["params"].get("n_clusters") == elbow_k:
            score += 0.05
        c["score"] = round(float(score), 4)
    best = max(valid, key=lambda c: c["score"])
    interpretability_note = None
    if best["metrics"]["n_clusters"] == 2:
        # Two groups usually just split "high vs low" and give little to act on.
        # Prefer a richer solution only when its quality stays close to the best.
        richer = [c for c in valid if c["metrics"]["n_clusters"] >= 3
                  and c["metrics"]["silhouette"] >= 0.7 * best["metrics"]["silhouette"]
                  and (c["algorithm"] != "kmeans" or (c["metrics"].get("stability") or 0) >= 0.85)]
        if richer:
            alt = max(richer, key=lambda c: c["score"])
            interpretability_note = (
                f"Two groups scored highest ({best['algorithm']}, silhouette {best['metrics']['silhouette']}), "
                f"but two groups mostly split customers into 'high' and 'low'. A {alt['metrics']['n_clusters']}-segment "
                f"solution keeps {alt['metrics']['silhouette'] / best['metrics']['silhouette']:.0%} of that separation "
                "and gives more actionable segments, so it was chosen. You can still run k = 2 in the Segmentation Lab.")
            best = alt
    m = best["metrics"]
    expl = [
        f"Compared {len(candidates)} configurations (K-Means and Agglomerative for k = "
        f"{min(c['params'].get('n_clusters', 99) for c in candidates)}–{max(c['params'].get('n_clusters', 0) for c in candidates)}, "
        f"and DBSCAN at {sum(c['algorithm'] == 'dbscan' for c in candidates)} density settings).",
        f"{len(valid)} passed the quality checks (at least {MIN_CLUSTER_SHARE:.0%} of customers per group, "
        f"no more than {MAX_INTERPRETABLE_K} groups, under 25% noise).",
        f"The chosen {best['algorithm']} model with {m['n_clusters']} segments had the best combined rank: "
        f"silhouette {m['silhouette']} (higher = better separated), Davies-Bouldin {m['davies_bouldin']} "
        f"(lower = more distinct), Calinski-Harabasz {m['calinski_harabasz']}.",
    ]
    if best["algorithm"] == "kmeans" and m.get("stability") is not None:
        expl.append(f"Re-running it on random 80% samples reproduced the same grouping with an adjusted Rand index of {m['stability']} (1.0 = identical).")
    if elbow_k:
        expl.append(f"The elbow of the inertia curve is at k = {elbow_k}" +
                    (", which matches the choice." if best["params"].get("n_clusters") == elbow_k else
                     "; the final choice weighs separation quality above the elbow alone."))
    if interpretability_note:
        expl.append(interpretability_note)
    if not any(c["algorithm"] == "dbscan" and c.get("valid") for c in candidates):
        expl.append("DBSCAN found no usable density gaps: at the tested settings it merged almost everyone into one group or marked most customers as noise. That means the customers form one continuous cloud, which suits centroid-based methods better.")
    expl.append("Silhouette values between 0.2 and 0.4 are typical for real customer data, where groups overlap rather than form clean islands.")
    return {"algorithm": best["algorithm"], "params": best["params"], "explanation": expl}


@dataclass
class FittedModel:
    algorithm: str
    params: dict
    labels: np.ndarray
    state: dict
    label_map: dict  # raw label -> ordered segment id

    def assign(self, X: np.ndarray) -> np.ndarray:
        if self.algorithm == "kmeans":
            raw = self.state["model"].predict(X)
        elif self.algorithm == "agglomerative":
            raw = _nearest_centroid(X, self.state["centroids"])
        else:
            if not len(self.state["core"]):
                return np.full(len(X), -1)
            raw = _assign_dbscan(X, self.state["core"], self.state["core_labels"], self.state["eps"])
        return np.array([self.label_map.get(int(r), -1) for r in raw])


ASSIGNMENT_NOTES = {
    "kmeans": "New customers are assigned to the nearest K-Means centre — exactly how the model groups customers.",
    "agglomerative": "Agglomerative clustering has no built-in predict step; new customers are assigned to the nearest segment average (centroid). This is an approximation.",
    "dbscan": "DBSCAN has no built-in predict step; a new customer joins a segment only if it lies within eps of that segment's core customers, otherwise it is marked as noise.",
}


def fit(X: np.ndarray, algorithm: str, params: dict) -> FittedModel:
    if algorithm == "kmeans":
        raw, m = run_kmeans(X, int(params["n_clusters"]))
        state = {"model": m}
    elif algorithm == "agglomerative":
        raw, state = run_agglomerative(X, int(params["n_clusters"]))
    elif algorithm == "dbscan":
        raw, state = run_dbscan(X, float(params["eps"]), int(params["min_samples"]))
    else:
        raise ValueError(f"Unknown algorithm {algorithm}")
    # Relabel by size (0 = largest) so colours/ids are stable and comparable.
    ids, counts = np.unique(raw[raw >= 0], return_counts=True)
    order = ids[np.argsort(-counts, kind="stable")]
    label_map = {int(r): i for i, r in enumerate(order)}
    labels = np.array([label_map.get(int(r), -1) for r in raw])
    return FittedModel(algorithm, params, labels, state, label_map)
