from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class AnalysisRequest(BaseModel):
    dataset_id: str = Field(min_length=1, max_length=40)
    numeric_features: list[str] = Field(min_length=0, max_length=40)
    categorical_features: list[str] = Field(default_factory=list, max_length=10)
    algorithm: Literal["auto", "kmeans", "agglomerative", "dbscan"] = "auto"
    n_clusters: int | None = Field(default=None, ge=2, le=12)
    eps: float | None = Field(default=None, gt=0, le=100)
    min_samples: int | None = Field(default=None, ge=2, le=500)


class PersonaRequest(BaseModel):
    regenerate: bool = False


class AssignRequest(BaseModel):
    records: list[dict[str, Any]] = Field(min_length=1, max_length=1000)
