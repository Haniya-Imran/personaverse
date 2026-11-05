"""Customer data profiling: column types, quality, distributions and behaviour."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .ingestion import Dataset, _try_dates
from .semantics import looks_like_id, role_description, role_of


def _num(x) -> float | None:
    if x is None:
        return None
    try:
        f = float(x)
    except (TypeError, ValueError):
        return None
    return None if (np.isnan(f) or np.isinf(f)) else round(f, 4)


def column_kind(s: pd.Series, name: str) -> str:
    non_null = s.dropna()
    if non_null.nunique() <= 1:
        return "constant"
    if pd.api.types.is_numeric_dtype(s):
        if looks_like_id(name) and non_null.is_unique:
            return "identifier"
        if set(non_null.unique()).issubset({0, 1}):
            return "binary"
        return "numeric"
    if _try_dates(s) is not None:
        return "datetime"
    ratio = non_null.nunique() / max(len(non_null), 1)
    if looks_like_id(name) and ratio > 0.9:
        return "identifier"
    if non_null.nunique() <= 30 or ratio < 0.05:
        return "categorical"
    return "text"


def profile_column(s: pd.Series, name: str) -> dict:
    kind = column_kind(s, name)
    role = role_of(name)
    out = {
        "name": name, "kind": kind, "role": role, "role_description": role_description(role),
        "missing": int(s.isna().sum()), "missing_pct": _num(s.isna().mean() * 100),
        "unique": int(s.nunique(dropna=True)),
    }
    if kind in ("numeric", "binary"):
        v = pd.to_numeric(s, errors="coerce").dropna()
        q1, q3 = v.quantile([0.25, 0.75])
        iqr = q3 - q1
        outliers = int(((v < q1 - 1.5 * iqr) | (v > q3 + 1.5 * iqr)).sum()) if iqr > 0 else 0
        counts, edges = np.histogram(v, bins=min(20, max(5, int(v.nunique()))))
        out.update({
            "mean": _num(v.mean()), "std": _num(v.std()), "min": _num(v.min()), "q1": _num(q1),
            "median": _num(v.median()), "q3": _num(q3), "max": _num(v.max()), "skew": _num(v.skew()),
            "outliers": outliers,
            "histogram": [{"start": _num(edges[i]), "end": _num(edges[i + 1]), "count": int(counts[i])}
                          for i in range(len(counts))],
        })
    elif kind == "categorical":
        vc = s.value_counts(dropna=True)
        out["top_values"] = [{"value": str(k), "count": int(c), "pct": _num(c / max(len(s.dropna()), 1) * 100)}
                             for k, c in vc.head(12).items()]
        rare = vc[vc / max(vc.sum(), 1) < 0.01]
        out["rare_categories"] = [str(k) for k in rare.index[:10]]
    elif kind == "datetime":
        d = _try_dates(s)
        out.update({"min": str(d.min().date()), "max": str(d.max().date())})
    return out


def profile_dataset(ds: Dataset) -> dict:
    df = ds.data
    cols = [profile_column(df[c], c) for c in df.columns]
    by_kind: dict[str, int] = {}
    for c in cols:
        by_kind[c["kind"]] = by_kind.get(c["kind"], 0) + 1

    id_cols = [c["name"] for c in cols if c["kind"] == "identifier"]
    dup_ex_id = int(df.drop(columns=id_cols).duplicated().sum()) if id_cols else int(df.duplicated().sum())

    notes: list[dict] = []
    for c in cols:
        if c["kind"] == "constant":
            notes.append({"level": "info", "column": c["name"], "message": "Has a single value for everyone, so it cannot separate customers. It is ignored."})
        elif c["missing_pct"] and c["missing_pct"] > 30:
            notes.append({"level": "warning", "column": c["name"], "message": f"{c['missing_pct']:.0f}% of values are missing."})
        elif c["missing"]:
            notes.append({"level": "info", "column": c["name"], "message": f"{c['missing']} missing values will be filled with the median (numbers) or most common value (categories)."})
        if c.get("outliers") and c["kind"] == "numeric" and c["outliers"] / len(df) > 0.01:
            notes.append({"level": "info", "column": c["name"], "message": f"{c['outliers']} unusually high/low values. Extreme values are capped at the 1st/99th percentile before clustering."})
        if c.get("rare_categories"):
            notes.append({"level": "info", "column": c["name"], "message": "Rare categories (" + ", ".join(c["rare_categories"]) + ") will be grouped as 'infrequent' if this column is used."})
        if c["kind"] == "identifier":
            notes.append({"level": "info", "column": c["name"], "message": "Looks like a customer identifier. Kept only to label results; never used for clustering."})
    if dup_ex_id:
        notes.append({"level": "info", "column": None, "message": f"{dup_ex_id} customers have exactly the same values as another customer (ignoring the ID). They are kept, as different people can look the same in the data."})

    behaviour = _behaviour(df, cols, ds.kind)
    total_missing = int(df.isna().sum().sum())
    quality = max(0.0, 100 - (total_missing / df.size * 100) * 2 - sum(1 for n in notes if n["level"] == "warning") * 5)
    preview = ds.data.head(25).replace({np.nan: None})
    return {
        "dataset": {"name": ds.name, "source": ds.source, "kind": ds.kind, "id_column": ds.id_column,
                    "rows": int(len(df)), "columns": int(df.shape[1]), "raw_rows": int(len(ds.raw)),
                    "raw_columns": int(ds.raw.shape[1])},
        "summary": {"by_kind": by_kind, "total_missing": total_missing, "duplicate_rows_excluding_id": dup_ex_id,
                    "quality_score": round(quality, 1)},
        "columns": cols,
        "notes": notes,
        "cleaning": ds.cleaning,
        "derivations": ds.derivations,
        "behaviour": behaviour,
        "preview": {"columns": list(preview.columns), "rows": preview.astype(object).values.tolist()},
    }


def _behaviour(df: pd.DataFrame, cols: list[dict], kind: str) -> dict:
    by_role: dict[str, str] = {}
    preferred = {"monetary": ["Total_Spend", "Monetary"], "frequency": ["Total_Purchases", "Frequency"],
                 "recency": ["Recency", "Recency_Days"]}
    for role, names in preferred.items():
        for n in names:
            if n in df.columns:
                by_role[role] = n
                break
    for c in cols:
        if c["kind"] == "numeric" and c["role"] and c["role"] not in by_role:
            by_role[c["role"]] = c["name"]

    metrics = []
    m, f, r = by_role.get("monetary"), by_role.get("frequency"), by_role.get("recency")
    if m:
        metrics.append({"label": "Average spend per customer", "value": _num(df[m].mean()), "column": m})
    if f:
        metrics.append({"label": "Average number of purchases", "value": _num(df[f].mean()), "column": f})
    if m and f:
        aov = df[m].sum() / max(df[f].sum(), 1)
        metrics.append({"label": "Average purchase value", "value": _num(aov), "column": f"{m} / {f}"})
    if r:
        metrics.append({"label": "Average days since last purchase", "value": _num(df[r].mean()), "column": r})
    clv = None
    if kind == "transaction" and m and "Tenure_Days" in df.columns:
        clv = {"label": "Historical value per customer per year",
               "value": _num((df[m] / (df["Tenure_Days"].clip(lower=30) / 365)).median()),
               "note": "Median of spend divided by years as a customer. Historical, not a prediction."}
    rfm = None
    if m and f and r:
        rfm = {"available": True, "recency": r, "frequency": f, "monetary": m,
               "source": "transactions" if kind == "transaction" else "customer-level aggregates",
               "explanation": {
                   "recency": "How many days since the customer last bought. Recent buyers are more engaged.",
                   "frequency": "How many purchases the customer made. Frequent buyers are habitual.",
                   "monetary": "How much the customer spent in total. High spenders bring most revenue."}}
    else:
        rfm = {"available": False, "explanation": "This data has no combination of purchase date, purchase count and spend, so RFM is not computed."}
    return {"roles": by_role, "metrics": metrics, "lifetime_value": clv, "rfm": rfm}
