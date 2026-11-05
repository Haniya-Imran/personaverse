from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile

from ..config import get_settings
from ..core import store
from ..core.ratelimit import upload_limit
from ..services.features import recommend_features
from ..services.ingestion import build_dataset, load_sample, parse_csv
from ..services.profiling import profile_dataset
from .deps import clean, get_dataset

router = APIRouter(prefix="/datasets", tags=["Data Workspace"])

SAMPLE_INFO = {
    "name": "Customer Personality Analysis (iFood marketing data)",
    "rows": 2240, "columns": 29,
    "description": "One row per customer of a food & grocery retailer: demographics (birth year, education, "
                   "marital status, income, children), spend on six product categories over two years, purchases "
                   "by channel (web, catalogue, store, deals), website visits, recency and responses to five campaigns.",
    "source": "https://github.com/nailson/ifood-data-business-analyst-test (ml_project1_data.csv); also published on Kaggle as 'Customer Personality Analysis'",
    "license": "Kaggle listing states CC0 (public domain). The original GitHub repository has no licence file — verify before commercial use.",
}


def _summary(dataset_id: str, ds) -> dict:
    return clean({"dataset_id": dataset_id, "name": ds.name, "source": ds.source, "kind": ds.kind,
                  "rows": len(ds.data), "columns": ds.data.shape[1], "id_column": ds.id_column,
                  "derivations": ds.derivations, "cleaning": ds.cleaning, "created_at": ds.created_at})


@router.get("/sample-info")
def sample_info():
    return SAMPLE_INFO


@router.post("/sample", dependencies=[Depends(upload_limit)])
def use_sample():
    ds = load_sample()
    return _summary(store.datasets.put(ds), ds)


@router.post("/upload", dependencies=[Depends(upload_limit)])
async def upload(file: UploadFile = File(...)):
    limit = int(get_settings().max_upload_mb * 1024 * 1024) + 1
    content = await file.read(limit)
    df = parse_csv(content, file.filename or "upload.csv")
    ds = build_dataset(df, file.filename or "Uploaded data", "upload")
    return _summary(store.datasets.put(ds), ds)


@router.get("/{dataset_id}")
def get(dataset_id: str):
    return _summary(dataset_id, get_dataset(dataset_id))


@router.delete("/{dataset_id}")
def delete(dataset_id: str):
    return {"deleted": store.datasets.delete(dataset_id)}


@router.get("/{dataset_id}/profile")
def profile(dataset_id: str):
    return clean(profile_dataset(get_dataset(dataset_id)))


@router.get("/{dataset_id}/features")
def features(dataset_id: str):
    return clean(recommend_features(get_dataset(dataset_id).data))
