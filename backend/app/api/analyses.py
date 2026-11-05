from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse, PlainTextResponse

from ..config import get_settings
from ..core import store
from ..core.ratelimit import analysis_limit, persona_limit
from ..schemas import AnalysisRequest, AssignRequest, PersonaRequest
from ..services import analysis as engine
from ..services import persona as persona_svc
from ..services import reports
from ..services.reduction import sample_indices
from ..services.semantics import looks_like_pii
from .deps import clean, get_analysis, get_dataset

router = APIRouter(prefix="/analyses", tags=["Segmentation"])


@router.post("", dependencies=[Depends(analysis_limit)])
def run_analysis(req: AnalysisRequest):
    ds = get_dataset(req.dataset_id)
    a = engine.run(req.dataset_id, ds, req.numeric_features, req.categorical_features, req.algorithm,
                   req.n_clusters, req.eps, req.min_samples)
    aid = store.analyses.put(a)
    return clean(engine.summary(aid, a))


@router.get("/{analysis_id}")
def get(analysis_id: str):
    return clean(engine.summary(analysis_id, get_analysis(analysis_id)))


@router.get("/{analysis_id}/visualization")
def visualization(analysis_id: str, max_points: int = Query(3000, ge=100, le=10000)):
    a = get_analysis(analysis_id)
    labels = a.model.labels
    idx = sample_indices(labels, max_points)
    coords = a.projection["coords"][idx]
    df = a.dataset.data
    hover_cols = [c for c in a.numeric + a.categorical if not looks_like_pii(c)][:6]
    id_col = a.dataset.id_column
    sub = df.iloc[idx]
    cols_vals = []
    for c in hover_cols:
        col = sub[c]
        if pd.api.types.is_numeric_dtype(col):
            cols_vals.append([None if pd.isna(v) else round(float(v), 2) for v in col.to_numpy()])
        else:
            cols_vals.append([None if pd.isna(v) else str(v) for v in col.to_numpy()])
    ids = [str(v) for v in sub[id_col].to_numpy()] if id_col else None
    coords = np.round(coords, 4)
    points = []
    for j, i in enumerate(idx):
        rec = {"i": int(i), "x": float(coords[j, 0]), "y": float(coords[j, 1]), "z": float(coords[j, 2]),
               "s": int(labels[i]), "v": [cv[j] for cv in cols_vals]}
        if ids:
            rec["id"] = ids[j]
        points.append(rec)
    centroids = []
    for s in a.insights["segments"]:
        m = labels == s["id"]
        c = a.projection["coords"][m].mean(0)
        centroids.append({"segment": s["id"], "x": float(c[0]), "y": float(c[1]), "z": float(c[2])})
    return clean({"points": points, "fields": hover_cols, "id_field": id_col, "total": int(len(labels)),
                  "shown": int(len(idx)), "centroids": centroids,
                  "axes": a.projection["axes"], "explained_total": a.projection["explained_total"],
                  "method": a.projection["method"], "note": a.projection["note"],
                  "segments": [{"id": s["id"], "name": s["statistical_name"], "size": s["size"], "share": s["share"],
                                "is_noise": s["is_noise"]} for s in a.insights["segments"]]})


@router.get("/{analysis_id}/segments")
def segments(analysis_id: str):
    a = get_analysis(analysis_id)
    cached = persona_svc.cached_personas(analysis_id)
    ins = dict(a.insights)
    ins["segments"] = [{**s, "persona_name": cached[s["id"]]["persona"]["persona_name"] if s["id"] in cached else None}
                       for s in ins["segments"]]
    return clean(ins)


def _segment(a, segment_id: int) -> dict:
    seg = next((s for s in a.insights["segments"] if s["id"] == segment_id), None)
    if seg is None:
        raise HTTPException(404, {"code": "segment_not_found", "message": f"Segment {segment_id} does not exist."})
    return seg


@router.get("/{analysis_id}/segments/{segment_id}")
def segment(analysis_id: str, segment_id: int):
    a = get_analysis(analysis_id)
    seg = _segment(a, segment_id)
    p = persona_svc.cached_personas(analysis_id).get(segment_id)
    return clean({**seg, "persona": p})


@router.get("/{analysis_id}/llm-status")
def llm_status(analysis_id: str):
    get_analysis(analysis_id)
    s = get_settings()
    return {"configured": s.resolved_provider is not None, "provider": s.resolved_provider, "model": s.resolved_model}


@router.post("/{analysis_id}/segments/{segment_id}/persona", dependencies=[Depends(persona_limit)])
def persona(analysis_id: str, segment_id: int, req: PersonaRequest):
    a = get_analysis(analysis_id)
    seg = _segment(a, segment_id)
    if seg["is_noise"]:
        raise HTTPException(400, {"code": "noise_segment",
                                  "message": "Noise points are not a real segment, so no persona is generated for them."})
    n = sum(1 for s in a.insights["segments"] if not s["is_noise"])
    return clean(persona_svc.generate(analysis_id, seg, len(a.dataset.data), a.dataset.kind, n, req.regenerate))


@router.get("/{analysis_id}/segments/{segment_id}/persona/summary")
def persona_input(analysis_id: str, segment_id: int):
    """Exactly what would be sent to the LLM — useful for transparency."""
    a = get_analysis(analysis_id)
    seg = _segment(a, segment_id)
    n = sum(1 for s in a.insights["segments"] if not s["is_noise"])
    return clean(persona_svc.build_summary(seg, len(a.dataset.data), a.dataset.kind, n))


@router.post("/{analysis_id}/assign", dependencies=[Depends(analysis_limit)])
def assign(analysis_id: str, req: AssignRequest):
    a = get_analysis(analysis_id)
    labels = engine.assign(a, pd.DataFrame(req.records))
    names = {s["id"]: s["statistical_name"] for s in a.insights["segments"]}
    return clean({"assignments": [{"segment_id": int(l), "segment_name": names.get(int(l), "Noise")} for l in labels],
                  "note": engine.clustering.ASSIGNMENT_NOTES[a.model.algorithm]})


@router.get("/{analysis_id}/reports/segments.csv")
def export_segments(analysis_id: str):
    a = get_analysis(analysis_id)
    return PlainTextResponse(reports.segments_csv(a), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="segments_{analysis_id}.csv"'})


@router.get("/{analysis_id}/reports/assignments.csv")
def export_assignments(analysis_id: str):
    a = get_analysis(analysis_id)
    return PlainTextResponse(reports.assignments_csv(a), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="assignments_{analysis_id}.csv"'})


@router.get("/{analysis_id}/reports/personas.md")
def export_personas(analysis_id: str):
    a = get_analysis(analysis_id)
    cached = persona_svc.cached_personas(analysis_id)
    if not cached:
        raise HTTPException(404, {"code": "no_personas", "message": "Generate at least one persona first."})
    segs = {s["id"]: s for s in a.insights["segments"]}
    body = "\n---\n\n".join(reports.persona_markdown(p, segs[sid]) for sid, p in sorted(cached.items()))
    return PlainTextResponse(body, media_type="text/markdown",
                             headers={"Content-Disposition": f'attachment; filename="personas_{analysis_id}.md"'})


@router.get("/{analysis_id}/reports/report.html")
def export_report(analysis_id: str, download: bool = False):
    a = get_analysis(analysis_id)
    body = reports.report_html(analysis_id, a, persona_svc.cached_personas(analysis_id))
    headers = {"Content-Disposition": f'attachment; filename="segmentation_report_{analysis_id}.html"'} if download else {}
    return HTMLResponse(body, headers=headers)


@router.get("/{analysis_id}/reports/report.json")
def export_json(analysis_id: str):
    a = get_analysis(analysis_id)
    return clean({"analysis": engine.summary(analysis_id, a), "insights": a.insights,
                  "personas": persona_svc.cached_personas(analysis_id)})
