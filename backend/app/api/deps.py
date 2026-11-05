from __future__ import annotations

import math

import numpy as np
from fastapi import HTTPException

from ..core import store


def clean(obj):
    """Make numpy / NaN values JSON-safe."""
    if isinstance(obj, dict):
        return {str(k): clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [clean(v) for v in obj]
    if isinstance(obj, np.ndarray):
        return clean(obj.tolist())
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating, float)):
        f = float(obj)
        return None if math.isnan(f) or math.isinf(f) else f
    if isinstance(obj, np.bool_):
        return bool(obj)
    return obj


def get_dataset(dataset_id: str):
    ds = store.datasets.get(dataset_id)
    if ds is None:
        raise HTTPException(404, {"code": "dataset_not_found",
                                  "message": "This dataset is no longer in memory (sessions expire after inactivity). Load it again."})
    return ds


def get_analysis(analysis_id: str):
    a = store.analyses.get(analysis_id)
    if a is None:
        raise HTTPException(404, {"code": "analysis_not_found",
                                  "message": "This analysis has expired or does not exist. Run segmentation again."})
    return a
