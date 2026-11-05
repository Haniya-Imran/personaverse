"""Persona Intelligence Studio: LLM personas grounded in aggregate segment statistics.

Privacy: only the aggregated, anonymised summary built by `build_summary` is sent
to the model — never raw rows, IDs or personal columns.
"""
from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from typing import Literal

import httpx
from pydantic import BaseModel, Field, ValidationError, field_validator

from ..config import get_settings

log = logging.getLogger("personaverse.persona")


class PersonaError(Exception):
    def __init__(self, code: str, message: str, status: int = 502):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


class Claim(BaseModel):
    text: str = Field(min_length=3, max_length=400)
    basis: Literal["observed", "hypothesis"]


class Evidence(BaseModel):
    claim: str = Field(min_length=3, max_length=300)
    feature: str
    statistic: str = Field(min_length=1, max_length=200)


class Persona(BaseModel):
    persona_name: str = Field(min_length=3, max_length=60)
    segment_overview: str = Field(min_length=20, max_length=900)
    customer_characteristics: list[Claim] = Field(min_length=2, max_length=7)
    behavioral_patterns: list[Claim] = Field(min_length=1, max_length=7)
    purchasing_habits: str | None = None
    spending_behavior: str | None = None
    engagement_patterns: str | None = None
    needs_and_preferences: list[Claim] = Field(default_factory=list, max_length=6)
    motivations: list[Claim] = Field(default_factory=list, max_length=6)
    pain_points: list[Claim] = Field(default_factory=list, max_length=6)
    product_interests: list[Claim] = Field(default_factory=list, max_length=6)
    marketing_approach: str = Field(min_length=10, max_length=700)
    communication_style: str = Field(min_length=5, max_length=400)
    suggested_offers: list[str] = Field(min_length=1, max_length=6)
    evidence_summary: list[Evidence] = Field(min_length=2, max_length=10)

    @field_validator("persona_name")
    @classmethod
    def _title_not_blank(cls, v: str) -> str:
        return v.strip()


PERSONA_SCHEMA_HINT = {
    "persona_name": "2-5 word descriptive title, e.g. 'Value-Conscious Regulars' (not a person's name)",
    "segment_overview": "2-3 sentences",
    "customer_characteristics": [{"text": "...", "basis": "observed|hypothesis"}],
    "behavioral_patterns": [{"text": "...", "basis": "observed|hypothesis"}],
    "purchasing_habits": "string or null if not supported by the data",
    "spending_behavior": "string or null",
    "engagement_patterns": "string or null",
    "needs_and_preferences": [{"text": "...", "basis": "hypothesis"}],
    "motivations": [{"text": "...", "basis": "hypothesis"}],
    "pain_points": [{"text": "...", "basis": "hypothesis"}],
    "product_interests": [{"text": "...", "basis": "observed|hypothesis"}],
    "marketing_approach": "string",
    "communication_style": "string",
    "suggested_offers": ["..."],
    "evidence_summary": [{"claim": "...", "feature": "exact feature name from the input", "statistic": "e.g. 1,240 vs 606 overall (+1.6 SD)"}],
}

SYSTEM_PROMPT = """You are a careful customer-analytics assistant. You write marketing personas for customer
segments using ONLY the aggregate statistics provided. Rules:
1. Never invent facts that the statistics do not support (no made-up demographics, jobs, cities, income levels or names).
2. Mark every list item with "basis": "observed" when it restates a statistic, "hypothesis" when it is an interpretation.
   Needs, motivations and pain points are almost always "hypothesis".
3. If a field cannot be supported by the data (e.g. no purchase data), return null or an empty list for it.
4. The persona describes a GROUP, not a real individual. Do not give the persona a human first name.
5. Every evidence_summary item must reference a feature name exactly as given and quote its numbers.
6. Respond with a single JSON object only, matching the requested keys. No markdown."""


def build_summary(segment: dict, total_customers: int, dataset_kind: str, n_segments: int) -> dict:
    """Aggregate-only payload sent to the LLM (no rows, ids or personal data)."""
    feats = sorted(segment["features"], key=lambda f: -abs(f["z"]))[:16]
    return {
        "segment_id": segment["id"],
        "segment_statistical_label": segment["statistical_name"],
        "customers_in_segment": segment["size"],
        "share_of_all_customers": f"{segment['share']:.1%}",
        "total_customers": total_customers,
        "number_of_segments": n_segments,
        "data_type": "one row per customer" if dataset_kind == "customer" else "customer-level RFM aggregated from transactions",
        "features": [{"feature": f["feature"], "meaning": f["label"], "role": f["role"],
                      "segment_average": f["segment_mean"], "overall_average": f["overall_mean"],
                      "difference_in_standard_deviations": f["z"]} for f in feats],
        "category_mix": [{"feature": c["feature"], "most_common": c["top_value"],
                          "share_in_segment": c["segment_share"], "share_overall": c["overall_share"]}
                         for c in segment.get("categorical", [])],
        "product_spend_mix": [{"category": p["category"], "share_of_segment_spend": p["segment_share"],
                               "share_of_all_spend": p["overall_share"]} for p in segment.get("product_mix", [])],
        "notes": "Averages computed after capping the most extreme 1% of values. Positive difference = above average.",
    }


def _user_prompt(summary: dict, retry_error: str | None = None) -> str:
    msg = ("Create a persona for this customer segment.\n\nSEGMENT STATISTICS (aggregated, anonymised):\n"
           + json.dumps(summary, indent=1) + "\n\nReturn JSON with exactly these keys:\n"
           + json.dumps(PERSONA_SCHEMA_HINT, indent=1))
    if retry_error:
        msg += f"\n\nYour previous answer was rejected: {retry_error[:500]}. Fix it and return valid JSON only."
    return msg


def _call_gemini(system: str, user: str) -> str:
    s = get_settings()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{s.gemini_model}:generateContent"
    body = {"systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {"temperature": 0.4, "responseMimeType": "application/json"}}
    r = httpx.post(url, json=body, headers={"x-goog-api-key": s.gemini_api_key or ""}, timeout=s.llm_timeout_s)
    if r.status_code == 429:
        raise PersonaError("llm_rate_limited", "The AI provider is rate-limiting requests. Try again in a minute.", 429)
    if r.status_code >= 400:
        raise PersonaError("llm_provider_error", f"The AI provider returned an error ({r.status_code}).")
    data = r.json()
    try:
        return "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"])
    except (KeyError, IndexError) as exc:
        raise PersonaError("llm_empty", "The AI provider returned no content (it may have blocked the request).") from exc


def _call_openai(system: str, user: str) -> str:
    s = get_settings()
    r = httpx.post(f"{s.openai_base_url.rstrip('/')}/chat/completions",
                   headers={"Authorization": f"Bearer {s.openai_api_key}"},
                   json={"model": s.openai_model, "temperature": 0.4, "response_format": {"type": "json_object"},
                         "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]},
                   timeout=s.llm_timeout_s)
    if r.status_code == 429:
        raise PersonaError("llm_rate_limited", "The AI provider is rate-limiting requests. Try again in a minute.", 429)
    if r.status_code >= 400:
        raise PersonaError("llm_provider_error", f"The AI provider returned an error ({r.status_code}).")
    try:
        return r.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as exc:
        raise PersonaError("llm_empty", "The AI provider returned no content.") from exc


def call_llm(system: str, user: str) -> str:
    provider = get_settings().resolved_provider
    if provider is None:
        raise PersonaError("llm_not_configured",
                           "No AI provider is configured. Set GEMINI_API_KEY (or OPENAI_API_KEY) on the server to enable personas.",
                           503)
    try:
        return _call_gemini(system, user) if provider == "gemini" else _call_openai(system, user)
    except httpx.TimeoutException as exc:
        raise PersonaError("llm_timeout", "The AI provider took too long to answer. Try again.", 504) from exc
    except httpx.HTTPError as exc:
        raise PersonaError("llm_network", "Could not reach the AI provider.", 502) from exc


def _parse(text: str, allowed_features: set[str]) -> Persona:
    raw = text.strip()
    if raw.startswith("```"):
        raw = raw.strip("`").split("\n", 1)[-1].rsplit("```", 1)[0]
    data = json.loads(raw)
    persona = Persona.model_validate(data)
    # Grounding check: keep only evidence that cites real features from the summary.
    persona.evidence_summary = [e for e in persona.evidence_summary if e.feature in allowed_features]
    if len(persona.evidence_summary) < 2:
        raise ValueError("evidence_summary must cite at least two feature names exactly as given in the input")
    for group in (persona.motivations, persona.pain_points, persona.needs_and_preferences):
        for c in group:
            c.basis = "hypothesis"  # motives/needs/pains are never directly observed in this data
    return persona


_cache: dict[str, dict] = {}
_lock = threading.Lock()


def generate(analysis_id: str, segment: dict, total: int, kind: str, n_segments: int,
             regenerate: bool = False) -> dict:
    summary = build_summary(segment, total, kind, n_segments)
    key = analysis_id + ":" + str(segment["id"])
    digest = hashlib.sha256(json.dumps(summary, sort_keys=True).encode()).hexdigest()[:16]
    with _lock:
        cached = _cache.get(key)
    if cached and not regenerate and cached["summary_hash"] == digest:
        return {**cached, "cached": True}
    allowed = {f["feature"] for f in summary["features"]}
    error = None
    for attempt in range(2):
        text = call_llm(SYSTEM_PROMPT, _user_prompt(summary, error))
        try:
            persona = _parse(text, allowed)
            break
        except (json.JSONDecodeError, ValidationError, ValueError) as exc:
            error = str(exc)
            log.warning("persona validation failed (attempt %s): %s", attempt + 1, error[:200])
    else:
        raise PersonaError("llm_invalid_output", "The AI answer did not match the required persona format twice. Try regenerating.")
    s = get_settings()
    result = {"segment_id": segment["id"], "persona": persona.model_dump(), "source": "llm",
              "provider": s.resolved_provider, "model": s.resolved_model,
              "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
              "input_summary": summary, "summary_hash": digest, "cached": False}
    with _lock:
        _cache[key] = result
    return result


def cached_personas(analysis_id: str) -> dict[int, dict]:
    with _lock:
        return {v["segment_id"]: v for k, v in _cache.items() if k.startswith(analysis_id + ":")}
