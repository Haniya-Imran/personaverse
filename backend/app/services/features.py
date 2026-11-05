"""Feature Engineering Lab: explainable feature recommendation + preprocessing pipeline.

The same fitted sklearn Pipeline is used to transform data at fit time and when
new customers are assigned later, so preprocessing can never drift.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from .profiling import column_kind
from .semantics import role_of

ROLE_PRIORITY = ["monetary", "frequency", "recency", "income", "age", "household", "price_sensitivity",
                 "digital", "tenure", "catalog", "store", "campaign", "score"]
DERIVED_FIRST = ["Total_Spend", "Monetary", "Total_Purchases", "Frequency", "Recency", "Recency_Days", "Income",
                 "Age", "Children", "Deal_Share", "Web_Share", "NumWebVisitsMonth", "Tenure_Days",
                 "Avg_Order_Value"]
MAX_DEFAULT = 8
CORR_LIMIT = 0.85


class QuantileClipper(BaseEstimator, TransformerMixin):
    """Caps each column at learned lower/upper quantiles (winsorising)."""

    def __init__(self, lower: float = 0.01, upper: float = 0.99):
        self.lower = lower
        self.upper = upper

    def fit(self, X, y=None):
        X = np.asarray(X, dtype=float)
        self.low_ = np.nanquantile(X, self.lower, axis=0)
        self.high_ = np.nanquantile(X, self.upper, axis=0)
        return self

    def transform(self, X):
        return np.clip(np.asarray(X, dtype=float), self.low_, self.high_)

    def get_feature_names_out(self, input_features=None):
        return np.asarray(input_features, dtype=object)


def recommend_features(df: pd.DataFrame) -> dict:
    kinds = {c: column_kind(df[c], c) for c in df.columns}
    numeric = [c for c, k in kinds.items() if k == "numeric"]
    items: dict[str, dict] = {}
    for c, k in kinds.items():
        role = role_of(c)
        miss = float(df[c].isna().mean())
        reason, usable = None, True
        if k in ("identifier", "constant", "datetime", "text"):
            usable = False
            reason = {"identifier": "Identifier — never used for clustering.",
                      "constant": "Same value for everyone — carries no information.",
                      "datetime": "Raw date — converted into a numeric feature (e.g. tenure) when possible.",
                      "text": "Free text / too many unique values to encode."}[k]
        elif miss > 0.4:
            usable = False
            reason = f"{miss:.0%} missing — too incomplete to cluster on."
        items[c] = {"name": c, "kind": k, "role": role, "usable": usable, "selected": False,
                    "type": "categorical" if k == "categorical" else "numeric", "reason": reason}

    def priority(c: str) -> tuple:
        derived = DERIVED_FIRST.index(c) if c in DERIVED_FIRST else 99
        role = ROLE_PRIORITY.index(role_of(c)) if role_of(c) in ROLE_PRIORITY else 99
        return (derived, role, -float(df[c].std() or 0))

    candidates = sorted([c for c in numeric if items[c]["usable"]], key=priority)
    corr = df[candidates].corr().abs() if candidates else pd.DataFrame()
    chosen: list[str] = []
    for c in candidates:
        clash = next((s for s in chosen if corr.loc[c, s] > CORR_LIMIT), None)
        if clash:
            items[c]["reason"] = f"Strongly overlaps with {clash} (correlation {corr.loc[c, clash]:.2f}); left out to avoid double-counting."
            continue
        if len(chosen) >= MAX_DEFAULT:
            items[c]["reason"] = "Usable, but left out of the default set to keep segments easy to interpret."
            continue
        chosen.append(c)
        items[c]["selected"] = True
        r = role_of(c)
        items[c]["reason"] = (f"Describes {_role_text(r)}; varies a lot between customers." if r
                              else "Numeric behaviour column with useful variation.")
    for c, it in items.items():
        if it["kind"] == "binary" and it["usable"] and not it["reason"]:
            it["reason"] = "Yes/no flag — optional; flags can dominate distance-based clustering, so off by default."
        if it["kind"] == "categorical" and it["usable"] and not it["reason"]:
            it["reason"] = "Category — optional; will be one-hot encoded if selected."
    return {"features": list(items.values()), "recommended": chosen,
            "steps": pipeline_steps()}


def _role_text(role: str | None) -> str:
    from .semantics import role_description
    return role_description(role) or "customer behaviour"


def pipeline_steps() -> list[dict]:
    return [
        {"step": "Missing values", "how": "Numbers → median, categories → most common value.",
         "why": "Clustering needs complete rows; the median is not pulled by extreme values."},
        {"step": "Outliers", "how": "Numbers are capped at their 1st and 99th percentile (learned on this data).",
         "why": "A few extreme customers (e.g. income 666,666) would otherwise stretch the space and form their own clusters."},
        {"step": "Encoding", "how": "Categories → one column per value (one-hot); values under 2% share are grouped as 'infrequent'.",
         "why": "Distance-based algorithms only understand numbers."},
        {"step": "Scaling", "how": "Every numeric feature is standardised to mean 0 and standard deviation 1.",
         "why": "So income (thousands) does not outweigh number of children (0–3)."},
        {"step": "Identifiers", "how": "ID and personal columns are removed before clustering.",
         "why": "An ID number says nothing about behaviour and must never influence a segment."},
    ]


def build_preprocessor(numeric: list[str], categorical: list[str]) -> ColumnTransformer:
    transformers = []
    if numeric:
        transformers.append(("num", Pipeline([
            ("impute", SimpleImputer(strategy="median")),
            ("clip", QuantileClipper(0.01, 0.99)),
            ("scale", StandardScaler()),
        ]), numeric))
    if categorical:
        transformers.append(("cat", Pipeline([
            ("impute", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="infrequent_if_exist", min_frequency=0.02, sparse_output=False)),
        ]), categorical))
    return ColumnTransformer(transformers, remainder="drop", verbose_feature_names_out=False)


def validate_selection(df: pd.DataFrame, numeric: list[str], categorical: list[str]) -> None:
    missing = [c for c in numeric + categorical if c not in df.columns]
    if missing:
        raise ValueError(f"Unknown columns: {', '.join(missing)}")
    if len(numeric) + len(categorical) < 2:
        raise ValueError("Select at least two features.")
    for c in numeric:
        if not pd.api.types.is_numeric_dtype(df[c]):
            raise ValueError(f"{c} is not numeric; select it as a category instead.")


def prepare_frame(df: pd.DataFrame, numeric: list[str], categorical: list[str]) -> pd.DataFrame:
    X = df[numeric + categorical].copy()
    for c in categorical:
        X[c] = X[c].astype(object).where(X[c].notna(), np.nan)
    return X
