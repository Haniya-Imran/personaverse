"""Runtime configuration, read from environment variables each time settings are built."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]


def _env(name: str, default: str | None = None):
    return field(default_factory=lambda: os.getenv(name, default) or default)


def _env_list(name: str, default: str):
    return field(default_factory=lambda: [v.strip() for v in os.getenv(name, default).split(",") if v.strip()])


@dataclass(frozen=True)
class Settings:
    data_dir: str = _env("DATA_DIR", str(ROOT_DIR / "data"))
    sample_dataset: str = _env("SAMPLE_DATASET", "customer_personality_ifood.csv")
    allowed_origins: list[str] = _env_list(
        "ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173")
    allowed_origin_regex: str | None = _env("ALLOWED_ORIGIN_REGEX", None)
    max_upload_mb: str = _env("MAX_UPLOAD_MB", "20")
    max_rows: str = _env("MAX_ROWS", "200000")
    session_ttl_minutes: str = _env("SESSION_TTL_MINUTES", "120")
    max_sessions: str = _env("MAX_SESSIONS", "50")
    llm_provider: str = _env("LLM_PROVIDER", "auto")  # auto | gemini | openai | none
    gemini_api_key: str | None = _env("GEMINI_API_KEY", None)
    gemini_model: str = _env("GEMINI_MODEL", "gemini-2.5-flash")
    openai_api_key: str | None = _env("OPENAI_API_KEY", None)
    openai_base_url: str = _env("OPENAI_BASE_URL", "https://api.openai.com/v1")
    openai_model: str = _env("OPENAI_MODEL", "gpt-4o-mini")
    llm_timeout: str = _env("LLM_TIMEOUT_SECONDS", "45")

    def __post_init__(self):
        conv = {"data_dir": Path, "max_upload_mb": float, "max_rows": int, "session_ttl_minutes": int,
                "max_sessions": int, "llm_timeout": float}
        for k, fn in conv.items():
            object.__setattr__(self, k, fn(getattr(self, k)))
        object.__setattr__(self, "llm_provider", (self.llm_provider or "auto").lower())

    @property
    def llm_timeout_s(self) -> float:
        return float(self.llm_timeout)

    @property
    def resolved_provider(self) -> str | None:
        p = self.llm_provider
        if p == "none":
            return None
        if p == "gemini":
            return "gemini" if self.gemini_api_key else None
        if p == "openai":
            return "openai" if self.openai_api_key else None
        if self.gemini_api_key:
            return "gemini"
        if self.openai_api_key:
            return "openai"
        return None

    @property
    def resolved_model(self) -> str | None:
        return {"gemini": self.gemini_model, "openai": self.openai_model}.get(self.resolved_provider or "")


def get_settings() -> Settings:
    return Settings()
