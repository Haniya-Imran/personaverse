import numpy as np
import pandas as pd
import pytest

from app.services.features import build_preprocessor, prepare_frame, recommend_features
from app.services.ingestion import IngestionError, build_dataset, parse_csv
from app.services.profiling import profile_dataset


def test_sample_loads_real_file(sample):
    assert len(sample.raw) == 2240
    assert {"Income", "Recency", "MntWines"}.issubset(sample.raw.columns)
    assert sample.id_column == "ID"
    assert {"Total_Spend", "Total_Purchases", "Age", "Children"}.issubset(sample.data.columns)


def test_derived_total_spend_is_sum(sample):
    mnt = [c for c in sample.data.columns if c.startswith("Mnt")]
    assert np.allclose(sample.data["Total_Spend"], sample.data[mnt].sum(axis=1))


def test_implausible_ages_removed(sample):
    assert sample.data["Age"].max() <= 100


def test_profile_detects_kinds_and_missing(sample):
    p = profile_dataset(sample)
    cols = {c["name"]: c for c in p["columns"]}
    assert cols["ID"]["kind"] == "identifier"
    assert cols["Z_Revenue"]["kind"] == "constant"
    assert cols["Education"]["kind"] == "categorical"
    assert cols["Income"]["missing"] == 24
    assert p["behaviour"]["rfm"]["available"] is True


def test_recommendation_excludes_identifiers_and_constants(sample):
    rec = recommend_features(sample.data)
    assert "ID" not in rec["recommended"]
    assert "Z_Revenue" not in rec["recommended"]
    assert 2 <= len(rec["recommended"]) <= 8
    corr = sample.data[rec["recommended"]].corr().abs().to_numpy().copy()
    np.fill_diagonal(corr, 0)
    assert corr.max() <= 0.85 + 1e-9


def test_preprocessing_is_reusable(sample, recommended):
    pre = build_preprocessor(recommended, ["Education"])
    X1 = pre.fit_transform(prepare_frame(sample.data, recommended, ["Education"]))
    X2 = pre.transform(prepare_frame(sample.data.head(50), recommended, ["Education"]))
    assert np.allclose(X1[:50], X2)
    assert not np.isnan(X1).any()


@pytest.mark.parametrize("content,name,code", [
    (b"a,b\n1,2\n", "x.csv", "too_few_rows"),
    (b"hello", "x.xlsx", "file_type"),
    (b"\x00\x01\x02binary", "x.csv", "binary"),
])
def test_invalid_files_rejected(content, name, code):
    with pytest.raises(IngestionError) as e:
        parse_csv(content, name)
    assert e.value.code == code


def test_semicolon_csv_parses():
    rows = "\n".join(f"{i};{i * 2};{i % 3}" for i in range(30))
    df = parse_csv(("id;spend;visits\n" + rows).encode(), "x.csv")
    assert list(df.columns) == ["id", "spend", "visits"]


def test_pii_columns_dropped():
    df = pd.DataFrame({"email": [f"a{i}@x.com" for i in range(30)], "spend": range(30), "visits": range(30)})
    ds = build_dataset(df, "t", "upload")
    assert "email" not in ds.data.columns


def test_transaction_data_aggregated_to_rfm():
    rng = np.random.default_rng(0)
    n = 400
    df = pd.DataFrame({
        "InvoiceNo": rng.integers(1000, 1300, n),
        "CustomerID": rng.integers(1, 60, n),
        "InvoiceDate": pd.date_range("2024-01-01", periods=n, freq="6h").strftime("%Y-%m-%d %H:%M"),
        "Quantity": rng.integers(1, 5, n),
        "UnitPrice": rng.uniform(1, 20, n).round(2),
    })
    df.loc[0, "Quantity"] = -2  # a return
    ds = build_dataset(df, "tx", "upload")
    assert ds.kind == "transaction"
    assert {"Recency_Days", "Frequency", "Monetary"}.issubset(ds.data.columns)
    assert len(ds.data) == df["CustomerID"].nunique()
    assert (ds.data["Monetary"] > 0).all()
