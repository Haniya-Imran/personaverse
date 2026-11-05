"""3D projection for visualisation only (clustering runs in the full feature space).

PCA is used: it is deterministic, fast, and its axes can be explained through
feature loadings. UMAP was considered but not used: it adds a heavy dependency
(numba) and its distances are harder to explain to business users.
"""
from __future__ import annotations

import numpy as np
from sklearn.decomposition import PCA


def project(X: np.ndarray, feature_names: list[str]) -> dict:
    n_comp = min(3, X.shape[1])
    pca = PCA(n_components=n_comp, random_state=42).fit(X)
    coords = pca.transform(X)
    if n_comp < 3:
        coords = np.hstack([coords, np.zeros((len(X), 3 - n_comp))])
    axes = []
    for i in range(n_comp):
        load = pca.components_[i]
        order = np.argsort(-np.abs(load))[:3]
        axes.append({
            "axis": ["x", "y", "z"][i], "component": f"PC{i + 1}",
            "explained_variance": round(float(pca.explained_variance_ratio_[i]), 4),
            "top_loadings": [{"feature": feature_names[j], "loading": round(float(load[j]), 3)} for j in order],
        })
    return {
        "coords": coords,
        "axes": axes,
        "explained_total": round(float(pca.explained_variance_ratio_.sum()), 4),
        "method": "PCA",
        "note": "The 3D view squeezes all selected features into three axes. It shows the general shape of the "
                "segments, but distances are approximate — the clusters were computed on all features, not on "
                "these three axes.",
    }


def sample_indices(labels: np.ndarray, max_points: int, seed: int = 7) -> np.ndarray:
    """Stratified sample so small segments stay visible in large datasets."""
    n = len(labels)
    if n <= max_points:
        return np.arange(n)
    rng = np.random.default_rng(seed)
    out = []
    for lab in np.unique(labels):
        idx = np.flatnonzero(labels == lab)
        take = max(30, int(round(max_points * len(idx) / n)))
        out.append(rng.choice(idx, min(take, len(idx)), replace=False))
    return np.sort(np.concatenate(out))
