import { lazy, Suspense, useMemo } from "react";
import { Link } from "react-router-dom";
import { EmptyState, Orb } from "../components/ui";
import { num, pct, segColor, segmentTitle } from "../lib/format";
import { useWorkspace } from "../state/Workspace";

const ClusterScene = lazy(() => import("../components/ClusterScene").then((m) => ({ default: m.ClusterScene })));

export default function Overview() {
  const ws = useWorkspace();
  const names = useMemo(() => Object.fromEntries((ws.insights?.segments ?? []).map((s) => [s.id, segmentTitle(s)])), [ws.insights]);
  if (!ws.analysis || !ws.insights || !ws.viz) {
    if (ws.dataset) return <EmptyState title="Data loaded — no segments yet" body="Check the profile, adjust features if you like, then run the segmentation engine." to="/app/features" cta="Open the feature lab" />;
    return <EmptyState title="Start your first analysis" body="Use the real sample dataset (2,240 customers) or upload your own CSV. No account needed." to="/app/data" cta="Go to Data workspace" />;
  }
  const a = ws.analysis;
  const segs = ws.insights.segments.filter((s) => !s.is_noise);
  const sel = segs.find((s) => s.id === ws.selectedSegment) ?? segs[0];
  const p = ws.personas[sel.id];
  const vr = ws.insights.value_rank;

  return (
    <>
      <div className="between" style={{ alignItems: "flex-end" }}>
        <h1>{ws.dataset!.rows.toLocaleString()} customers, <span className="serif" style={{ color: "var(--accent-deep)" }}>{segs.length} personalities.</span></h1>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24, fontSize: 13, color: "var(--body)" }}>
          <div><div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>{num(a.metrics.silhouette, 2)}</div>Silhouette score</div>
          <div><div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>k = {a.metrics.n_clusters}</div>{a.model.algorithm === "kmeans" ? "K-Means" : a.model.algorithm === "agglomerative" ? "Agglomerative" : "DBSCAN"}</div>
          <div><div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>{a.features.numeric.length + a.features.categorical.length}</div>Features</div>
        </div>
      </div>

      <div className="row">
        <section className="card" style={{ flex: "2 1 600px", minWidth: 0, position: "relative", height: 580, padding: 0, overflow: "hidden", background: "var(--well)" }} aria-label="Cluster space">
          <Suspense fallback={<div className="skeleton" style={{ position: "absolute", inset: 20 }} />}>
            <ClusterScene viz={ws.viz} selected={ws.selectedSegment} names={names} onPick={(s) => ws.selectSegment(s)} />
          </Suspense>
          <div style={{ position: "absolute", top: 20, left: 20, right: 20, display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 10, pointerEvents: "none" }}>
            <h2>Cluster space</h2>
            <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{ws.viz.method} 3D view · drag to rotate · <Link to="/app/explorer" style={{ pointerEvents: "auto" }}>open explorer</Link></span>
          </div>
          <div style={{ position: "absolute", left: 20, bottom: 20, right: 20, display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button className={`pill ${ws.selectedSegment === null ? "on" : ""}`} onClick={() => ws.selectSegment(null)}>All</button>
            {segs.map((s) => (
              <button key={s.id} className={`pill ${ws.selectedSegment === s.id ? "on" : ""}`} onClick={() => ws.selectSegment(s.id)}>
                <span className="dot" style={{ background: segColor(s.id).color }} />{names[s.id]}
              </button>
            ))}
          </div>
        </section>

        <div className="stack" style={{ flex: "1 1 340px", minWidth: 0, gap: 20 }}>
          <section className="card stack">
            <div className="between">
              <span className="label">AI persona</span>
              <span className={`badge ${p ? "" : "bad"}`}>{p ? "LLM-generated" : "Not generated yet"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <Orb id={sel.id} size={64} />
              <div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{p ? p.persona.persona_name : sel.statistical_name}</div>
                <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>Segment {sel.id} · {sel.size.toLocaleString()} customers · {pct(sel.share)}</div>
              </div>
            </div>
            {p ? (
              <>
                <p className="serif" style={{ margin: 0, fontSize: 22, lineHeight: 1.28 }}>{p.persona.segment_overview}</p>
                <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                  <h3 style={{ marginBottom: 6 }}>What to do next</h3>
                  {p.persona.suggested_offers.slice(0, 3).map((o) => <div key={o} className="body" style={{ fontSize: 14, display: "flex", gap: 10 }}><b style={{ color: segColor(sel.id).dark }}>→</b>{o}</div>)}
                </div>
              </>
            ) : (
              <>
                <p className="body" style={{ margin: 0, fontSize: 14 }}>The label above is calculated from the data. Generate an AI persona to describe this group in plain words.</p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="btn primary small" onClick={() => ws.generatePersona(sel.id)} disabled={!!ws.personaBusy[sel.id] || (ws.llm !== null && !ws.llm.configured)}>
                    {ws.personaBusy[sel.id] ? "Generating…" : "Generate persona"}
                  </button>
                  <Link className="btn small" to="/app/personas">Persona studio</Link>
                </div>
                {ws.llm && !ws.llm.configured && <p className="muted" style={{ margin: 0, fontSize: 12 }}>AI provider not configured on the server.</p>}
                {ws.personaErrors[sel.id] && <p role="alert" style={{ margin: 0, color: "var(--danger)", fontSize: 13 }}>{ws.personaErrors[sel.id]}</p>}
              </>
            )}
          </section>
          <section className="dark-card stack" style={{ gap: 10 }}>
            <div className="label" style={{ color: "#AEB6C4" }}>Top recommendation</div>
            {sel.recommendations[0] ? (
              <>
                <b style={{ color: "#fff", fontSize: 16 }}>{sel.recommendations[0].title}</b>
                <p style={{ margin: 0, color: "#CDD3DC", fontSize: 14 }}>{sel.recommendations[0].action}</p>
                <pre className="mono" style={{ margin: 0, fontSize: 12, color: "#AEB6C4", whiteSpace: "pre-wrap" }}>why → {sel.recommendations[0].why.join("\n      ")}</pre>
              </>
            ) : <p style={{ margin: 0 }}>—</p>}
            <Link className="btn ghost-dark small" style={{ alignSelf: "flex-start" }} to="/app/insights">All insights</Link>
          </section>
        </div>
      </div>

      <div className="grid-auto" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))" }}>
        {segs.map((s) => {
          const vf = vr ? s.features.find((f) => f.feature === vr.column) : null;
          return (
            <button key={s.id} className="card tight" onClick={() => ws.selectSegment(s.id)}
              style={{ textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: 10, border: `2px solid ${s.id === sel.id ? segColor(s.id).color : "var(--edge)"}`, color: "var(--ink)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600 }}><Orb id={s.id} size={26} />{names[s.id]}</span>
              <span style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-0.03em" }}>{pct(s.share)}</span>
              <span style={{ height: 6, background: "var(--line)", borderRadius: 99, overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${s.share * 100}%`, background: segColor(s.id).color }} /></span>
              <span className="muted" style={{ fontSize: 13 }}>{s.size.toLocaleString()} customers{vf ? ` · avg ${vf.label.toLowerCase()} ${num(vf.segment_mean)}` : ""}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
