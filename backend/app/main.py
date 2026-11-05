"""PersonaVerse — Customer Segmentation & Persona Intelligence API."""
from __future__ import annotations

import logging
import time

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api import analyses, datasets
from .config import get_settings
from .services.ingestion import IngestionError
from .services.persona import PersonaError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("personaverse")

settings = get_settings()
app = FastAPI(title="PersonaVerse API", version="1.0.0",
              description="Customer Intelligence Workspace: data profiling, feature lab, segmentation engine, "
                          "3D cluster explorer, LLM persona studio and segment strategy.")

app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins,
                   allow_origin_regex=settings.allowed_origin_regex, allow_credentials=False,
                   allow_methods=["GET", "POST", "DELETE"], allow_headers=["Content-Type"])


@app.middleware("http")
async def log_requests(request: Request, call_next):
    t0 = time.time()
    response = await call_next(request)
    log.info("%s %s -> %s (%.0f ms)", request.method, request.url.path, response.status_code, (time.time() - t0) * 1000)
    return response


def _err(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"detail": {"code": code, "message": message}})


@app.exception_handler(IngestionError)
async def ingestion_error(_: Request, exc: IngestionError):
    return _err(400, exc.code, exc.message)


@app.exception_handler(PersonaError)
async def persona_error(_: Request, exc: PersonaError):
    return _err(exc.status, exc.code, exc.message)


@app.exception_handler(ValueError)
async def value_error(_: Request, exc: ValueError):
    return _err(422, "invalid_request", str(exc))


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    where = ".".join(str(x) for x in first.get("loc", [])[1:])
    return _err(422, "invalid_request", f"{where}: {first.get('msg', 'invalid input')}".strip(": "))


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception):
    log.exception("Unhandled error")
    return _err(500, "server_error", "Something went wrong on the server. Please try again.")


@app.get("/api/health", tags=["Health"])
def health():
    s = get_settings()
    return {"status": "ok", "version": app.version,
            "llm": {"configured": s.resolved_provider is not None, "provider": s.resolved_provider,
                    "model": s.resolved_model}}


app.include_router(datasets.router, prefix="/api")
app.include_router(analyses.router, prefix="/api")
