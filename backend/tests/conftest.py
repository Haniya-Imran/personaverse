import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services.features import recommend_features  # noqa: E402
from app.services.ingestion import load_sample  # noqa: E402


@pytest.fixture(scope="session")
def sample():
    return load_sample()


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


@pytest.fixture(scope="session")
def analysis_ids(client):
    d = client.post("/api/datasets/sample").json()
    feats = client.get(f"/api/datasets/{d['dataset_id']}/features").json()["recommended"]
    a = client.post("/api/analyses", json={"dataset_id": d["dataset_id"], "numeric_features": feats}).json()
    return d["dataset_id"], a["analysis_id"], feats


@pytest.fixture(scope="session")
def recommended(sample):
    return recommend_features(sample.data)["recommended"]
