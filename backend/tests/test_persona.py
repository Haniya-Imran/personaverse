import json

import pytest

from app.services import persona as P
from app.services.analysis import run


def _valid(features):
    return json.dumps({
        "persona_name": "Premium Loyal Customers",
        "segment_overview": "High-spending customers who buy often across channels and rarely use discounts.",
        "customer_characteristics": [{"text": "Spend about twice the average", "basis": "observed"},
                                     {"text": "Higher income than average", "basis": "observed"}],
        "behavioral_patterns": [{"text": "Buy frequently through catalogue and store", "basis": "observed"}],
        "purchasing_habits": "Frequent", "spending_behavior": "High", "engagement_patterns": None,
        "needs_and_preferences": [{"text": "Value quality", "basis": "observed"}],
        "motivations": [{"text": "Convenience", "basis": "observed"}],
        "pain_points": [], "product_interests": [{"text": "Wine", "basis": "observed"}],
        "marketing_approach": "Loyalty perks, not discounts.", "communication_style": "Personal and premium.",
        "suggested_offers": ["Early access"],
        "evidence_summary": [{"claim": "High spend", "feature": features[0], "statistic": "1185 vs 604"},
                             {"claim": "Income", "feature": features[1], "statistic": "x"},
                             {"claim": "Made up", "feature": "NotAFeature", "statistic": "x"}],
    })


@pytest.fixture
def seg(sample, recommended):
    a = run("p", sample, recommended, [])
    return a.insights["segments"][0]


def test_summary_is_aggregate_only(seg, sample):
    s = P.build_summary(seg, 2240, "customer", 3)
    text = json.dumps(s)
    assert "5524" not in text  # first customer's ID
    assert "rows" not in s and "records" not in s
    assert all(set(f) == {"feature", "meaning", "role", "segment_average", "overall_average",
                          "difference_in_standard_deviations"} for f in s["features"])


def test_missing_key_gives_clear_error(seg, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    with pytest.raises(P.PersonaError) as e:
        P.generate("x1", seg, 2240, "customer", 3)
    assert e.value.code == "llm_not_configured" and e.value.status == 503


def test_valid_output_is_parsed_grounded_and_cached(seg, monkeypatch):
    calls = []
    feats = [f["feature"] for f in seg["features"]]

    def fake(system, user):
        calls.append(user)
        return _valid(feats)

    monkeypatch.setattr(P, "call_llm", fake)
    r = P.generate("x2", seg, 2240, "customer", 3)
    assert r["source"] == "llm"
    ev = r["persona"]["evidence_summary"]
    assert all(e["feature"] in feats for e in ev) and len(ev) == 2  # invented feature dropped
    assert all(c["basis"] == "hypothesis" for c in r["persona"]["motivations"])
    assert "5524" not in calls[0]
    P.generate("x2", seg, 2240, "customer", 3)
    assert len(calls) == 1  # cached
    P.generate("x2", seg, 2240, "customer", 3, regenerate=True)
    assert len(calls) == 2


def test_invalid_output_retried_then_fails(seg, monkeypatch):
    calls = []

    def bad(system, user):
        calls.append(user)
        return "not json"

    monkeypatch.setattr(P, "call_llm", bad)
    with pytest.raises(P.PersonaError) as e:
        P.generate("x3", seg, 2240, "customer", 3)
    assert e.value.code == "llm_invalid_output" and len(calls) == 2
    assert "rejected" in calls[1]


def test_retry_recovers(seg, monkeypatch):
    feats = [f["feature"] for f in seg["features"]]
    answers = iter(["{}", _valid(feats)])
    monkeypatch.setattr(P, "call_llm", lambda s, u: next(answers))
    assert P.generate("x4", seg, 2240, "customer", 3)["persona"]["persona_name"]


def test_provider_http_error_mapped(seg, monkeypatch):
    import httpx
    monkeypatch.setenv("GEMINI_API_KEY", "k")

    def boom(*a, **kw):
        raise httpx.ConnectTimeout("t")

    monkeypatch.setattr(httpx, "post", boom)
    with pytest.raises(P.PersonaError) as e:
        P.generate("x5", seg, 2240, "customer", 3)
    assert e.value.code == "llm_timeout"
