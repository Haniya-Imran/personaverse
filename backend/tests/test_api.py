import json

from app.services import persona as P


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_upload_and_profile(client):
    rows = "\n".join(f"{i},{(i * 37) % 500},{i % 7},{(i * 13) % 90}" for i in range(60))
    r = client.post("/api/datasets/upload", files={"file": ("c.csv", "customer_id,spend,orders,recency\n" + rows, "text/csv")})
    assert r.status_code == 200, r.text
    did = r.json()["dataset_id"]
    p = client.get(f"/api/datasets/{did}/profile").json()
    assert p["dataset"]["rows"] == 60
    f = client.get(f"/api/datasets/{did}/features").json()
    assert "customer_id" not in f["recommended"]


def test_upload_rejects_bad_type(client):
    r = client.post("/api/datasets/upload", files={"file": ("c.exe", b"MZ", "application/octet-stream")})
    assert r.status_code == 400 and r.json()["detail"]["code"] == "file_type"


def test_full_flow(client, analysis_ids):
    did, aid, feats = analysis_ids
    a = client.get(f"/api/analyses/{aid}").json()
    assert a["metrics"]["n_clusters"] >= 2 and a["comparison"]["explanation"]
    v = client.get(f"/api/analyses/{aid}/visualization").json()
    assert v["shown"] == v["total"] == 2240 and len(v["points"][0]["v"]) == len(v["fields"])
    s = client.get(f"/api/analyses/{aid}/segments").json()
    assert sum(x["size"] for x in s["segments"]) == 2240
    assert client.get(f"/api/analyses/{aid}/segments/0").status_code == 200
    assert client.get(f"/api/analyses/{aid}/segments/99").status_code == 404
    csv = client.get(f"/api/analyses/{aid}/reports/assignments.csv")
    assert csv.status_code == 200 and csv.text.count("\n") == 2241
    assert "segment_id" in client.get(f"/api/analyses/{aid}/reports/segments.csv").text
    html = client.get(f"/api/analyses/{aid}/reports/report.html").text
    assert "Customer Segmentation Report" in html
    assert client.get(f"/api/analyses/{aid}/reports/report.json").status_code == 200
    r = client.post(f"/api/analyses/{aid}/assign", json={"records": [{f: 1 for f in feats}]})
    assert r.status_code == 200 and "segment_id" in r.json()["assignments"][0]


def test_persona_endpoint(client, analysis_ids, monkeypatch):
    _, aid, _ = analysis_ids
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    r = client.post(f"/api/analyses/{aid}/segments/1/persona", json={})
    assert r.status_code == 503 and r.json()["detail"]["code"] == "llm_not_configured"
    seg = client.get(f"/api/analyses/{aid}/segments/1").json()
    feats = [f["feature"] for f in seg["features"]]
    from tests.test_persona import _valid
    monkeypatch.setattr(P, "call_llm", lambda s, u: _valid(feats))
    r = client.post(f"/api/analyses/{aid}/segments/1/persona", json={})
    assert r.status_code == 200 and r.json()["persona"]["persona_name"]
    md = client.get(f"/api/analyses/{aid}/reports/personas.md")
    assert md.status_code == 200 and "AI-generated persona" in md.text
    summary = client.get(f"/api/analyses/{aid}/segments/1/persona/summary").json()
    assert "features" in summary and "ID" not in json.dumps([f["feature"] for f in summary["features"]])


def test_invalid_requests(client, analysis_ids):
    did, _, feats = analysis_ids
    assert client.get("/api/analyses/nope").status_code == 404
    assert client.get("/api/datasets/nope/profile").status_code == 404
    r = client.post("/api/analyses", json={"dataset_id": did, "numeric_features": ["Nope", "Income"]})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "invalid_request"
    r = client.post("/api/analyses", json={"dataset_id": did, "numeric_features": feats, "algorithm": "kmeans"})
    assert r.status_code == 422
    r = client.post("/api/analyses", json={"dataset_id": did, "numeric_features": feats, "algorithm": "kmeans", "n_clusters": 50})
    assert r.status_code == 422


def test_custom_algorithms(client, analysis_ids):
    did, _, feats = analysis_ids
    for body in ({"algorithm": "agglomerative", "n_clusters": 4}, {"algorithm": "kmeans", "n_clusters": 5},
                 {"algorithm": "dbscan", "eps": 2.2, "min_samples": 10}):
        r = client.post("/api/analyses", json={"dataset_id": did, "numeric_features": feats, **body})
        assert r.status_code == 200, r.text
