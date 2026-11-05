import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { ClusterSceneHandle } from "../components/ClusterScene";
import { EmptyState, Info, ZBar } from "../components/ui";
import { humanize, num, pct, segColor, segmentTitle } from "../lib/format";
import type { Visualization } from "../lib/types";
import { useWorkspace } from "../state/Workspace";

const ClusterScene = lazy(() => import("../components/ClusterScene").then((m) => ({ default: m.ClusterScene })));

function Scatter2D({ viz, selected, hidden }: { viz: Visualization; selected: number | null; hidden: Set<number> }) {
  const W = 760, H = 540, P = 20;
  const xs = viz.points.map((p) => p.x), ys = viz.points.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" role="img" aria-label="2D view of customers on the first two principal components">
      {viz.points.filter((p) => !hidden.has(p.s)).map((p) => (
        <circle key={p.i} cx={P + ((p.x - x0) / (x1 - x0 || 1)) * (W - 2 * P)} cy={H - P - ((p.y - y0) / (y1 - y0 || 1)) * (H - 2 * P)} r={3.2}
          fill={segColor(p.s).color} opacity={selected === null || selected === p.s ? 0.85 : 0.12} />
      ))}
    </svg>
  );
}

export default function Explorer() {
  const ws = useWorkspace();
  const scene = useRef<ClusterSceneHandle>(null);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [rotate, setRotate] = useState(true);
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  const names = useMemo(() => Object.fromEntries((ws.insights?.segments ?? []).map((s) => [s.id, segmentTitle(s)])), [ws.insights]);
  if (!ws.viz || !ws.insights) return <EmptyState title="No segments yet" body="Run segmentation to explore your customers in 3D." to="/app/segmentation" cta="Go to Segmentation" />;
  const viz = ws.viz;
  const sel = ws.selectedSegment;
  const seg = ws.insights.segments.find((s) => s.id === sel);
  const toggle = (id: number) => setHidden((h) => { const n = new Set(h); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <>
      <div className="between">
        <div>
          <span className="label">Module E · 3D cluster explorer</span>
          <h1 style={{ marginTop: 6 }}>Every customer, <span className="serif" style={{ color: "var(--accent-deep)" }}>in space.</span></h1>
        </div>
        <Link className="btn primary" to="/app/personas">Meet the personas →</Link>
      </div>

      <div className="row" style={{ alignItems: "stretch" }}>
        <section className="card" style={{ flex: "2.2 1 600px", minWidth: 0, position: "relative", height: 660, padding: 0, overflow: "hidden", background: "var(--well)" }} aria-label="Cluster visualisation">
          {mode === "3d" ? (
            <Suspense fallback={<div className="skeleton" style={{ position: "absolute", inset: 20 }} />}>
              <ClusterScene ref={scene} viz={viz} selected={sel} hidden={hidden} names={names} autoRotate={rotate}
                onPick={(s) => ws.selectSegment(s === sel ? null : s)} />
            </Suspense>
          ) : <div style={{ position: "absolute", inset: "70px 20px 90px" }}><Scatter2D viz={viz} selected={sel} hidden={hidden} /></div>}
          <div style={{ position: "absolute", top: 16, left: 18, right: 18, display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, pointerEvents: "none" }}>
            <div>
              <h2>{mode === "3d" ? "3D cluster space" : "2D view (PC1 × PC2)"}</h2>
              <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{viz.shown.toLocaleString()} of {viz.total.toLocaleString()} customers · {viz.method} · drag to rotate, scroll to zoom, right-drag to pan</span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", pointerEvents: "auto" }}>
              <button className="btn small" onClick={() => setMode(mode === "3d" ? "2d" : "3d")}>{mode === "3d" ? "2D view" : "3D view"}</button>
              {mode === "3d" && <>
                <button className="btn small" onClick={() => setRotate(!rotate)} aria-pressed={rotate}>{rotate ? "Pause spin" : "Auto spin"}</button>
                <button className="btn small" onClick={() => { scene.current?.resetView(); ws.selectSegment(null); setHidden(new Set()); }}>Reset view</button>
                <button className="btn small" onClick={() => scene.current?.downloadPng("personaverse-clusters.png")}>Download PNG</button>
              </>}
            </div>
          </div>
          <div style={{ position: "absolute", left: 18, bottom: 18, right: 18, display: "flex", flexWrap: "wrap", gap: 8 }} role="group" aria-label="Segment filters">
            <button className={`pill ${sel === null ? "on" : ""}`} onClick={() => ws.selectSegment(null)}>All</button>
            {viz.segments.map((s) => (
              <span key={s.id} style={{ display: "inline-flex" }}>
                <button className={`pill ${sel === s.id ? "on" : ""} ${hidden.has(s.id) ? "off" : ""}`} onClick={() => ws.selectSegment(sel === s.id ? null : s.id)} style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
                  <span className="dot" style={{ background: segColor(s.id).color }} />{s.is_noise ? "Noise" : names[s.id]} · {pct(s.share)}
                </button>
                <button className="pill" onClick={() => toggle(s.id)} aria-label={`${hidden.has(s.id) ? "Show" : "Hide"} ${names[s.id] ?? "noise"}`} title={hidden.has(s.id) ? "Show" : "Hide"} style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, paddingLeft: 10, paddingRight: 10 }}>
                  {hidden.has(s.id) ? "◌" : "●"}
                </button>
              </span>
            ))}
          </div>
        </section>

        <aside className="stack" style={{ flex: "1 1 320px", minWidth: 0 }}>
          <section className="card stack">
            {seg ? (
              <>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span className="orb" style={{ width: 44, height: 44, background: `radial-gradient(circle at 35% 30%, ${segColor(seg.id).light}, ${segColor(seg.id).color} 50%, ${segColor(seg.id).dark})` }} />
                  <div><h2>{segmentTitle(seg)}</h2><span className="muted" style={{ fontSize: 13 }}>{seg.size.toLocaleString()} customers · {pct(seg.share, 1)}</span></div>
                </div>
                <h3>Most distinctive</h3>
                {seg.distinguishing.slice(0, 5).map((f) => (
                  <div key={f.feature} style={{ fontSize: 13 }}>
                    <div className="between"><span>{f.label}</span><span className="muted">{num(f.segment_mean)} vs {num(f.overall_mean)}</span></div>
                    <ZBar z={f.z} />
                  </div>
                ))}
                <Link to="/app/insights" className="btn small">Open segment insights</Link>
              </>
            ) : (
              <>
                <h2>Pick a segment</h2>
                <p className="body" style={{ margin: 0, fontSize: 14 }}>Click any customer in the 3D view, or a pill below it, to focus on that segment.</p>
              </>
            )}
          </section>
          <section className="card stack">
            <h2>What the axes mean <Info text={viz.note} /></h2>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>{viz.method} keeps {pct(viz.explained_total)} of the variation in three axes.</p>
            {viz.axes.map((ax) => (
              <div key={ax.axis} className="well" style={{ padding: 12, fontSize: 13 }}>
                <b>{ax.axis.toUpperCase()} · {ax.component}</b> <span className="muted">({pct(ax.explained_variance)} of variation)</span>
                <div style={{ marginTop: 4 }}>{ax.top_loadings.map((l) => `${humanize(l.feature)} ${l.loading > 0 ? "↑" : "↓"}`).join(" · ")}</div>
              </div>
            ))}
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>{viz.note}</p>
          </section>
        </aside>
      </div>
    </>
  );
}
