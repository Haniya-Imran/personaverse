import numpy as np
from sklearn.datasets import make_blobs

from app.services import clustering, reduction
from app.services.analysis import assign, run
from app.services.features import build_preprocessor, prepare_frame


def test_metrics_on_clear_blobs():
    X, _ = make_blobs(600, centers=4, cluster_std=0.6, random_state=1)
    m = clustering.fit(X, "kmeans", {"n_clusters": 4})
    met = clustering.evaluate(X, m.labels)
    assert met["n_clusters"] == 4 and met["silhouette"] > 0.6 and met["davies_bouldin"] < 0.6


def test_labels_ordered_by_size():
    X, _ = make_blobs([300, 100, 50], centers=None, cluster_std=0.5, random_state=3)
    m = clustering.fit(X, "kmeans", {"n_clusters": 3})
    sizes = [int((m.labels == k).sum()) for k in range(3)]
    assert sizes == sorted(sizes, reverse=True)


def test_dbscan_noise_kept_separate():
    X, _ = make_blobs(400, centers=3, cluster_std=0.4, random_state=2)
    X = np.vstack([X, np.random.default_rng(0).uniform(-30, 30, (20, 2))])
    m = clustering.fit(X, "dbscan", {"eps": 0.8, "min_samples": 5})
    met = clustering.evaluate(X, m.labels)
    assert (m.labels == -1).sum() >= 15
    assert met["noise_share"] > 0 and met["n_clusters"] == 3


def test_reproducible_and_assignment_consistent(sample, recommended):
    a1 = run("t", sample, recommended, [])
    a2 = run("t", sample, recommended, [])
    assert (a1.model.labels == a2.model.labels).all()
    assert (assign(a1, sample.data) == a1.model.labels).all()


def test_agglomerative_assignment_uses_centroids(sample, recommended):
    a = run("t2", sample, recommended, [], algorithm="agglomerative", n_clusters=4)
    agree = (assign(a, sample.data) == a.model.labels).mean()
    assert agree > 0.85  # nearest-centroid approximation of hierarchical labels


def test_selection_explains_and_respects_constraints(sample, recommended):
    a = run("t3", sample, recommended, [])
    sel = a.comparison["selection"]
    assert sel["explanation"]
    assert 2 <= a.metrics["n_clusters"] <= 8
    assert a.metrics["min_cluster_share"] >= 0.03
    algos = {c["algorithm"] for c in a.comparison["candidates"]}
    assert algos == {"kmeans", "agglomerative", "dbscan"}


def test_pca_projection_shape(sample, recommended):
    pre = build_preprocessor(recommended, [])
    X = pre.fit_transform(prepare_frame(sample.data, recommended, []))
    p = reduction.project(X, recommended)
    assert p["coords"].shape == (len(X), 3)
    assert 0 < p["explained_total"] <= 1


def test_stratified_sample_keeps_small_segments():
    labels = np.array([0] * 9900 + [1] * 100)
    idx = reduction.sample_indices(labels, 1000)
    assert (labels[idx] == 1).sum() >= 30


def test_recommendations_cite_evidence(sample, recommended):
    a = run("t4", sample, recommended, [])
    for s in a.insights["segments"]:
        assert s["recommendations"], "every segment gets at least one recommendation"
        for r in s["recommendations"]:
            assert r["why"]
    titles = [tuple(sorted(r["title"] for r in s["recommendations"])) for s in a.insights["segments"]]
    assert len(set(titles)) == len(titles), "segments must not receive identical generic recommendations"
