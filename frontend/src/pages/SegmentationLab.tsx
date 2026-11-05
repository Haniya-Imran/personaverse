import { useState } from "react";
import { Link } from "react-router-dom";
import { LineChart, ShareBars } from "../components/charts";
import { Banner, EmptyState, Info, Stat } from "../components/ui";
import { api } from "../lib/api";
import { ALGO_NAMES, num, pct, segColor, segmentTitle } from "../lib/format";
import { useWorkspace } from "../state/Workspace";

type Algo = "auto" | "kmeans" | "agglomerative" | "dbscan";

export default function SegmentationLab() {
  const ws = useWorkspace();
  const a = ws.analysis;
  const [algo, setAlgo] = useState<Algo>("auto");
  const [k, setK] = useState(4);
  const [eps, setEps] = useState(1.8);
  const [minS, setMinS] = useState(16);
  const [newCust, setNewCust] = useState<Record<string, string>>({});
  const [assignRes, setAssignRes] = useState<{ text: string; id: number } | null>(null);
  const [assignErr, setAssignErr] = useState<string | null>(null);

  if (!ws.dataset) return <EmptyState title="No data loaded yet" body="Load data and pick features first." to="/app/data" cta="Go to Data workspace" />;

  const run = () => ws.runSegmentation(algo === "auto" ? { algorithm: "auto" } : algo === "dbscan" ? { algorithm: "dbscan", eps, min_samples: minS } : { algorithm: algo, n_clusters: k });
  const kmeans = a?.comparison.candidates.filter((c) => c.algorithm === "kmeans") ?? [];
  const agg = a?.comparison.candidates.filter((c) => c.algorithm === "agglomerative") ?? [];
  const names = Object.fromEntries((ws.insights?.segments ?? []).map((s) => [s.id, segmentTitle(s)]));

  const assign = async () => {
    if (!a) return;
    setAssignErr(null); setAssignRes(null);
    const rec: Record<string, unknown> = {};
    for (const f of a.features.numeric) {
      const v = newCust[f];
      if (v === undefined || v === "" || Number.isNaN(Number(v))) { setAssignErr(`Enter a number for ${f}.`); return; }
      rec[f] = Number(v);
    }
    for (const f of a.features.categorical) rec[f] = newCust[f] ?? null;
    try {
      const r = await api.assign(a.analysis_id, [rec]);
      const s = r.assignments[0];
      setAssignRes({ id: s.segment_id, text: s.segment_id < 0 ? "Noise — does not fit any segment" : `Segment ${s.segment_id}: ${names[s.segment_id] ?? s.segment_name}` });
    } catch (e) { setAssignErr((e as Error).message); }
  };

  return (
    <>
      <div className="between">
        <div>
          <span className="label">Module D · Segmentation engine</span>
          <h1 style={{ marginTop: 6 }}>{a ? <>{a.metrics.n_clusters} segments, <span className="serif" style={{ color: "var(--accent-deep)" }}>chosen with evidence.</span></> : "Find the segments"}</h1>
        </div>
        {a && <Link className="btn primary" to="/app/explorer">Explore in 3D →</Link>}
      </div>

      <section className="card stack" aria-labelledby="ctl-h">
        <h2 id="ctl-h">Run settings</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "flex-end" }}>
          <label className="field">Algorithm
            <select value={algo} onChange={(e) => setAlgo(e.target.value as Algo)}>
              <option value="auto">Automatic (compare all, pick best)</option>
              <option value="kmeans">K-Means</option>
              <option value="agglomerative">Agglomerative (Ward)</option>
              <option value="dbscan">DBSCAN (density)</option>
            </select>
          </label>
          {(algo === "kmeans" || algo === "agglomerative") && (
            <label className="field" style={{ minWidth: 220 }}>Number of segments: {k}
              <input type="range" min={2} max={10} step={1} value={k} onChange={(e) => setK(Number(e.target.value))} />
            </label>
          )}
          {algo === "dbscan" && (
            <>
              <label className="field">eps (neighbourhood radius) <input type="number" step={0.1} min={0.1} value={eps} onChange={(e) => setEps(Number(e.target.value))} /></label>
              <label className="field">min_samples <input type="number" step={1} min={2} value={minS} onChange={(e) => setMinS(Number(e.target.value))} /></label>
            </>
          )}
          <button className="btn dark" onClick={run} disabled={ws.busy !== null || ws.numeric.length + ws.categorical.length < 2}>
            {ws.busy === "analysis" ? "Running…" : a ? "Run again" : "Run segmentation"}
          </button>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Features: {[...ws.numeric, ...ws.categorical].join(", ") || "none selected"} · <Link to="/app/features">change</Link></p>
      </section>

      {!a ? (ws.busy === "analysis" ? <div className="card"><div className="skeleton" style={{ height: 240 }} /></div> : <Banner>Press <b>Run segmentation</b> to compare algorithms on your data.</Banner>) : (
        <>
          <div className="row">
            <section className="card stack" style={{ flex: "1 1 340px" }}>
              <div className="between"><h2>Selected model</h2><span className="badge">{a.model.selected_automatically ? "Chosen automatically" : "Your choice"}</span></div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{ALGO_NAMES[a.model.algorithm]} <span className="muted" style={{ fontSize: 15, fontWeight: 500 }}>{Object.entries(a.model.params).map(([k2, v]) => `${k2}=${v}`).join(", ")}</span></div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
                <Stat label="Silhouette" value={num(a.metrics.silhouette, 3)} hint="−1 to 1. How much closer customers are to their own segment than to the next one. Higher is better." />
                <Stat label="Davies-Bouldin" value={num(a.metrics.davies_bouldin, 3)} hint="Average similarity between each segment and its closest neighbour. Lower is better." />
                <Stat label="Calinski-Harabasz" value={num(a.metrics.calinski_harabasz, 0)} hint="Between-segment spread divided by within-segment spread. Higher is better." />
                {a.metrics.stability != null && <Stat label="Stability (ARI)" value={num(a.metrics.stability, 3)} hint="Re-run on random 80% samples; 1.0 means the same grouping every time." />}
                {a.model.algorithm === "dbscan" && <Stat label="Noise" value={pct(a.metrics.noise_share, 1)} hint="Customers DBSCAN could not place in a dense group." />}
              </div>
              <ShareBars items={(ws.insights?.segments ?? a.segments).map((s) => ({ id: s.id, label: s.is_noise ? "Noise" : names[s.id] ?? s.statistical_name, share: s.share, size: s.size }))} />
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>Ran in {a.runtime_seconds}s on {ws.dataset.rows.toLocaleString()} customers.</p>
            </section>
            <section className="dark-card stack" style={{ flex: "1.2 1 400px" }}>
              <h2 style={{ color: "#fff" }}>Why this model</h2>
              <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 10, color: "#CDD3DC", lineHeight: 1.55, fontSize: 14 }}>
                {a.comparison.explanation.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </section>
          </div>

          <div className="row">
            <section className="card stack" style={{ flex: "1 1 420px" }}>
              <h2>Elbow method <Info text="Inertia = total distance of customers to their segment centre. The 'elbow' is where adding segments stops helping much." /></h2>
              <LineChart xLabel="Number of segments (k)" yLabel="Inertia" marker={a.comparison.elbow_k}
                series={[{ name: "K-Means inertia", color: "#4F6BF0", points: a.comparison.elbow.map((e) => ({ x: e.k, y: e.inertia })) }]} />
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>Dashed line: elbow at k = {a.comparison.elbow_k ?? "—"}.</p>
            </section>
            <section className="card stack" style={{ flex: "1 1 420px" }}>
              <h2>Silhouette by k</h2>
              <LineChart xLabel="Number of segments (k)" yLabel="Silhouette"
                series={[{ name: "K-Means", color: "#4F6BF0", points: kmeans.map((c) => ({ x: Number(c.params.n_clusters), y: c.metrics.silhouette })) },
                  { name: "Agglomerative", color: "#EE7D4E", points: agg.map((c) => ({ x: Number(c.params.n_clusters), y: c.metrics.silhouette })) }]} />
              <div style={{ display: "flex", gap: 16, fontSize: 13 }}><span><span className="dot" style={{ background: "#4F6BF0" }} /> K-Means</span><span><span className="dot" style={{ background: "#EE7D4E" }} /> Agglomerative</span></div>
            </section>
          </div>

          <section className="card stack">
            <h2>All configurations compared</h2>
            <div className="table-wrap"><table className="data">
              <thead><tr><th>Algorithm</th><th>Settings</th><th>Segments</th><th>Silhouette ↑</th><th>Davies-Bouldin ↓</th><th>Calinski-H. ↑</th><th>Smallest</th><th>Noise</th><th>Stability</th><th>Status</th></tr></thead>
              <tbody>
                {a.comparison.candidates.map((c, i) => {
                  const chosen = c.algorithm === a.comparison.recommended.algorithm && JSON.stringify(c.params) === JSON.stringify(a.comparison.recommended.params);
                  return (
                    <tr key={i} className={c.valid ? "" : "dim"} style={chosen ? { background: "rgba(79,107,240,.12)" } : undefined}>
                      <td><b>{ALGO_NAMES[c.algorithm]}</b></td>
                      <td className="mono">{Object.entries(c.params).filter(([k2]) => k2 !== "linkage").map(([k2, v]) => `${k2}=${v}`).join(" ")}</td>
                      <td>{c.metrics.n_clusters}</td><td>{num(c.metrics.silhouette, 3)}</td><td>{num(c.metrics.davies_bouldin, 3)}</td>
                      <td>{num(c.metrics.calinski_harabasz, 0)}</td><td>{pct(c.metrics.min_cluster_share, 1)}</td><td>{pct(c.metrics.noise_share, 1)}</td>
                      <td>{num(c.metrics.stability, 3)}</td>
                      <td style={{ whiteSpace: "normal", minWidth: 180 }}>{chosen ? <span className="badge obs">Recommended</span> : c.valid ? "Passed checks" : `Rejected: ${c.rejected_because}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </section>

          <section className="card stack" aria-labelledby="as-h">
            <h2 id="as-h">Assign a new customer</h2>
            <p className="body" style={{ margin: 0, fontSize: 14 }}>{a.model.assignment_note}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
              {a.features.numeric.map((f) => (
                <label key={f} className="field" style={{ width: 150 }}>{f}
                  <input type="number" value={newCust[f] ?? ""} onChange={(e) => { setNewCust({ ...newCust, [f]: e.target.value }); setAssignErr(null); }} />
                </label>
              ))}
              {a.features.categorical.map((f) => (
                <label key={f} className="field" style={{ width: 150 }}>{f}
                  <input type="text" value={newCust[f] ?? ""} onChange={(e) => setNewCust({ ...newCust, [f]: e.target.value })} />
                </label>
              ))}
              <button className="btn primary" onClick={assign}>Find segment</button>
            </div>
            {assignErr && <p role="alert" style={{ color: "var(--danger)", margin: 0, fontSize: 13 }}>{assignErr}</p>}
            {assignRes && <div className="banner info" role="status"><span className="dot" style={{ background: segColor(assignRes.id).color, marginTop: 5 }} /> {assignRes.text}</div>}
          </section>
        </>
      )}
    </>
  );
}
