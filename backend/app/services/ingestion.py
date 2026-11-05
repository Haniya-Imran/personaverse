"""Dataset ingestion: safe CSV parsing, light cleaning and customer-level shaping.

Two shapes are supported:
* customer-level  - one row per customer (e.g. the bundled iFood marketing data)
* transaction-level - many rows per customer with a date and an amount; these are
  aggregated into Recency / Frequency / Monetary (RFM) features per customer.
"""
from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from ..config import get_settings
from .semantics import looks_like_id, looks_like_pii


class IngestionError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class Dataset:
    name: str
    source: str  # "sample" | "upload"
    raw: pd.DataFrame
    data: pd.DataFrame  # customer-level working frame
    kind: str  # "customer" | "transaction"
    id_column: str | None
    derivations: list[dict] = field(default_factory=list)
    cleaning: list[dict] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None).isoformat() + "Z")


def _decode(content: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return content.decode(enc)
        except UnicodeDecodeError:
            continue
    raise IngestionError("encoding", "The file could not be decoded as text. Save it as UTF-8 CSV and try again.")


def _sniff_delimiter(text: str) -> str:
    head = text[:65536]
    try:
        return csv.Sniffer().sniff(head, delimiters=",;\t|").delimiter
    except csv.Error:
        counts = {d: head.count(d) for d in (",", ";", "\t", "|")}
        return max(counts, key=counts.get)


def _clean_columns(cols) -> list[str]:
    seen: dict[str, int] = {}
    out = []
    for c in cols:
        name = re.sub(r"\s+", "_", str(c).strip()) or "column"
        name = re.sub(r"[^\w\-]", "", name) or "column"
        if name in seen:
            seen[name] += 1
            name = f"{name}_{seen[name]}"
        else:
            seen[name] = 0
        out.append(name)
    return out


def parse_csv(content: bytes, filename: str) -> pd.DataFrame:
    s = get_settings()
    if not filename.lower().endswith((".csv", ".tsv", ".txt")):
        raise IngestionError("file_type", "Only .csv, .tsv or .txt files are accepted.")
    if len(content) > s.max_upload_mb * 1024 * 1024:
        raise IngestionError("file_size", f"The file is larger than {s.max_upload_mb:g} MB.")
    if b"\x00" in content[:4096]:
        raise IngestionError("binary", "This looks like a binary file, not a CSV.")
    text = _decode(content)
    delim = _sniff_delimiter(text)
    try:
        df = pd.read_csv(io.StringIO(text), sep=delim, nrows=s.max_rows + 1, low_memory=False)
    except Exception as exc:  # pandas raises many parser error types
        raise IngestionError("parse", f"The CSV could not be read: {exc}") from exc
    if len(df) > s.max_rows:
        df = df.iloc[: s.max_rows]
    df.columns = _clean_columns(df.columns)
    if df.shape[1] < 2:
        raise IngestionError("too_few_columns", "The file needs at least two columns.")
    if len(df) < 20:
        raise IngestionError("too_few_rows", "The file needs at least 20 rows to find customer groups.")
    return df


def _try_dates(series: pd.Series) -> pd.Series | None:
    if pd.api.types.is_numeric_dtype(series):
        return None
    sample = series.dropna().astype(str).head(200)
    if sample.empty or not sample.str.contains(r"\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}").mean() > 0.8:
        return None
    for dayfirst in (False, True):
        parsed = pd.to_datetime(series, errors="coerce", dayfirst=dayfirst, format="mixed")
        if parsed.notna().mean() > 0.9:
            return parsed
    return None


def _find(df: pd.DataFrame, pattern: str, numeric: bool | None = None) -> str | None:
    for c in df.columns:
        if re.search(pattern, c, re.I):
            if numeric is None or pd.api.types.is_numeric_dtype(df[c]) == numeric:
                return c
    return None


def _detect_transactions(df: pd.DataFrame) -> dict | None:
    cust = _find(df, r"customer.?id|client.?id|user.?id|customerid")
    if not cust:
        return None
    nunique = df[cust].nunique(dropna=True)
    if nunique == 0 or len(df) / nunique < 1.5:
        return None
    date_col = None
    for c in df.columns:
        if re.search(r"date|time", c, re.I) and _try_dates(df[c]) is not None:
            date_col = c
            break
    amount = _find(df, r"^amount$|total|revenue|sales|line_?value|price_?total", numeric=True)
    qty = _find(df, r"quantity|qty", numeric=True)
    price = _find(df, r"unit_?price|price", numeric=True)
    if not date_col or not (amount or (qty and price)):
        return None
    invoice = _find(df, r"invoice|order.?id|transaction.?id|basket")
    return {"customer": cust, "date": date_col, "amount": amount, "qty": qty, "price": price, "invoice": invoice}


def _aggregate_rfm(df: pd.DataFrame, spec: dict, cleaning: list[dict]) -> tuple[pd.DataFrame, list[dict]]:
    t = df.copy()
    t["_date"] = _try_dates(t[spec["date"]])
    t["_amount"] = t[spec["amount"]] if spec["amount"] else t[spec["qty"]] * t[spec["price"]]
    before = len(t)
    t = t[t[spec["customer"]].notna() & t["_date"].notna()]
    returns = int((t["_amount"] <= 0).sum())
    t = t[t["_amount"] > 0]
    cleaning.append({"step": "Transaction filtering",
                     "detail": f"Removed {before - len(t)} rows without customer/date or with zero/negative amounts "
                               f"({returns} of them looked like returns or cancellations)."})
    ref = t["_date"].max() + pd.Timedelta(days=1)
    g = t.groupby(spec["customer"])
    freq = g[spec["invoice"]].nunique() if spec["invoice"] else g.size()
    out = pd.DataFrame({
        "Recency_Days": (ref - g["_date"].max()).dt.days,
        "Frequency": freq,
        "Monetary": g["_amount"].sum().round(2),
        "Avg_Order_Value": (g["_amount"].sum() / freq).round(2),
        "Tenure_Days": (ref - g["_date"].min()).dt.days,
    }).reset_index()
    derivations = [
        {"feature": "Recency_Days", "formula": f"days between the customer's last {spec['date']} and {ref.date()}",
         "meaning": "Recency (R): how recently the customer bought. Lower is better."},
        {"feature": "Frequency", "formula": f"number of distinct {spec['invoice'] or 'transaction rows'}",
         "meaning": "Frequency (F): how often the customer buys."},
        {"feature": "Monetary", "formula": f"sum of {spec['amount'] or spec['qty'] + ' × ' + spec['price']}",
         "meaning": "Monetary (M): total money spent."},
        {"feature": "Avg_Order_Value", "formula": "Monetary / Frequency", "meaning": "Average value of one purchase."},
        {"feature": "Tenure_Days", "formula": "days since first purchase", "meaning": "How long they have been buying."},
    ]
    return out, derivations


def _derive_customer_features(df: pd.DataFrame, cleaning: list[dict]) -> tuple[pd.DataFrame, list[dict]]:
    """Add explainable aggregate features when the expected source columns exist."""
    d = df.copy()
    derivations: list[dict] = []
    date_cols = {}
    for c in d.columns:
        if d[c].dtype == object or pd.api.types.is_string_dtype(d[c]):
            parsed = _try_dates(d[c])
            if parsed is not None:
                date_cols[c] = parsed
    ref_date = max((s.max() for s in date_cols.values()), default=None)
    ref_year = ref_date.year if ref_date is not None else datetime.now(timezone.utc).replace(tzinfo=None).year

    birth = _find(d, r"year_?birth|birth_?year", numeric=True)
    if birth and "Age" not in d.columns:
        d["Age"] = ref_year - d[birth]
        implausible = int(((d["Age"] < 16) | (d["Age"] > 100)).sum())
        if implausible:
            d.loc[(d["Age"] < 16) | (d["Age"] > 100), "Age"] = np.nan
            cleaning.append({"step": "Implausible ages",
                             "detail": f"{implausible} customers had an age outside 16–100 (from {birth}); "
                                       "set to missing so they are imputed instead of distorting clusters."})
        derivations.append({"feature": "Age", "formula": f"{ref_year} − {birth}",
                            "meaning": f"Age at the latest date in the data ({ref_year})."})

    spend = [c for c in d.columns if re.match(r"mnt", c, re.I) and pd.api.types.is_numeric_dtype(d[c])]
    if len(spend) >= 2:
        d["Total_Spend"] = d[spend].sum(axis=1)
        derivations.append({"feature": "Total_Spend", "formula": " + ".join(spend),
                            "meaning": "Total money spent across all product categories."})

    purch = [c for c in d.columns if re.match(r"num\w*purchases", c, re.I) and not re.search(r"deal", c, re.I)
             and pd.api.types.is_numeric_dtype(d[c])]
    if len(purch) >= 2:
        d["Total_Purchases"] = d[purch].sum(axis=1)
        derivations.append({"feature": "Total_Purchases", "formula": " + ".join(purch),
                            "meaning": "Total number of purchases across channels."})
        deals = _find(d, r"num\w*deals", numeric=True)
        if deals:
            d["Deal_Share"] = (d[deals] / d["Total_Purchases"].replace(0, np.nan)).clip(0, 1)
            derivations.append({"feature": "Deal_Share", "formula": f"{deals} / Total_Purchases",
                                "meaning": "Share of purchases made with a discount (price sensitivity)."})
        web = _find(d, r"num\w*web\w*purchases", numeric=True)
        if web:
            d["Web_Share"] = (d[web] / d["Total_Purchases"].replace(0, np.nan)).clip(0, 1)
            derivations.append({"feature": "Web_Share", "formula": f"{web} / Total_Purchases",
                                "meaning": "Share of purchases made online."})
        if "Total_Spend" in d:
            d["Avg_Spend_Per_Purchase"] = (d["Total_Spend"] / d["Total_Purchases"].replace(0, np.nan)).round(2)
            derivations.append({"feature": "Avg_Spend_Per_Purchase", "formula": "Total_Spend / Total_Purchases",
                                "meaning": "Average basket value."})

    kids = [c for c in d.columns if re.search(r"kidhome|teenhome|children|kids", c, re.I)
            and pd.api.types.is_numeric_dtype(d[c])]
    if len(kids) >= 2:
        d["Children"] = d[kids].sum(axis=1)
        derivations.append({"feature": "Children", "formula": " + ".join(kids),
                            "meaning": "Number of children in the household."})

    cmps = [c for c in d.columns if re.search(r"accepted\w*cmp|acceptedcmp", c, re.I)]
    if len(cmps) >= 2:
        d["Campaigns_Accepted"] = d[cmps].sum(axis=1)
        derivations.append({"feature": "Campaigns_Accepted", "formula": " + ".join(cmps),
                            "meaning": "How many past marketing campaigns the customer accepted."})

    for c, parsed in date_cols.items():
        if re.search(r"customer|join|signup|since|enrol|registr", c, re.I) and ref_date is not None:
            d["Tenure_Days"] = (ref_date - parsed).dt.days
            derivations.append({"feature": "Tenure_Days", "formula": f"{ref_date.date()} − {c}",
                                "meaning": "Days since the customer joined."})
            break
    return d, derivations


def build_dataset(df: pd.DataFrame, name: str, source: str) -> Dataset:
    cleaning: list[dict] = []
    raw = df.copy()
    pii = [c for c in df.columns if looks_like_pii(c)]
    if pii:
        df = df.drop(columns=pii)
        cleaning.append({"step": "Personal data removed",
                         "detail": f"Dropped columns that look like personal identifiers: {', '.join(pii)}. "
                                   "They are never used for clustering or sent to the AI."})
    before = len(df)
    df = df.drop_duplicates()
    if before - len(df):
        cleaning.append({"step": "Exact duplicates",
                         "detail": f"Removed {before - len(df)} rows that were exact copies of another row."})
    for c in df.columns:  # normalise string columns
        if df[c].dtype == object or pd.api.types.is_string_dtype(df[c]):
            df[c] = df[c].astype("string").str.strip()

    spec = _detect_transactions(df)
    if spec:
        data, derivations = _aggregate_rfm(df, spec, cleaning)
        kind, id_col = "transaction", spec["customer"]
    else:
        data, derivations = _derive_customer_features(df, cleaning)
        kind = "customer"
        id_col = next((c for c in data.columns if looks_like_id(c) and data[c].is_unique), None)
    data = data.reset_index(drop=True)
    return Dataset(name=name, source=source, raw=raw, data=data, kind=kind, id_column=id_col,
                   derivations=derivations, cleaning=cleaning)


def load_sample() -> Dataset:
    s = get_settings()
    path = s.data_dir / s.sample_dataset
    if not path.exists():
        raise IngestionError("sample_missing", f"The bundled sample dataset was not found at {path}.")
    df = parse_csv(path.read_bytes(), path.name)
    return build_dataset(df, "Customer Personality Analysis (iFood marketing data)", "sample")
