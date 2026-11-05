import { Heatmap } from "../components/charts";
import { EmptyState, Orb, ZBar } from "../components/ui";
import { num, pct, segColor, segmentTitle } from "../lib/format";
import { useWorkspace } from "../state/Workspace";

export default function Insights() {
  const ws = useWorkspace();
  const ins = ws.insights;
  if (!ins) return <EmptyState title="No segments yet" body="Run segmentation to get segment comparisons and recommendations." to="/app/segmentation" cta="Go to Segmentation" />;
  const names = Object.fromEntries(ins.segments.map((s) => [s.id, segmentTitle(s)]));
  const segs = ins.segments.filter((s) => !s.is_noise);
  const sel = ins.segments.find((s) => s.id === ws.selectedSegment) ?? segs[0];

  return (
    <>
      <div>
        <span className="label">Module G · Segment strategy and insights</span>
        <h1 style={{ marginTop: 6 }}>What to <span className="serif" style={{ color: "var(--accent-deep)" }}>do</span> with each segment.</h1>
      </div>

      <section className="card stack">
        <h2>Compare segments</h2>
        <Heatmap rows={ins.comparison.rows} cols={ins.comparison.features} names={names} />
        <div className="row" style={{ gap: 14 }}>
          {[ins.value_rank, ins.frequency_rank].filter(Boolean).map((r) => (
            <div key={r!.column} className="well" style={{ padding: 14, flex: "1 1 280px", fontSize: 14 }}>
              <div className="label" style={{ marginBottom: 8 }}>Ranked by {r!.metric}</div>
              <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
                {r!.order.map((id) => {
                  const s = ins.segments.find((x) => x.id === id)!;
                  const f = s.features.find((x) => x.feature === r!.column)!;
                  return <li key={id}><span className="dot" style={{ background: segColor(id).color, marginRight: 6 }} />{names[id]} — <b>{num(f.segment_mean)}</b></li>;
                })}
              </ol>
            </div>
          ))}
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>{ins.stats_note}</p>
      </section>

      <div role="tablist" aria-label="Segments" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {ins.segments.map((s) => (
          <button key={s.id} role="tab" aria-selected={s.id === sel.id} className={`pill ${s.id === sel.id ? "on" : ""}`} onClick={() => ws.selectSegment(s.id)}>
            <span className="dot" style={{ background: segColor(s.id).color }} />{names[s.id]}
          </button>
        ))}
      </div>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <section className="card stack" style={{ flex: "2 1 560px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Orb id={sel.id} size={52} />
            <div>
              <h2 style={{ fontSize: 22 }}>Segment {sel.id}: {names[sel.id]}</h2>
              <div className="muted" style={{ fontSize: 14 }}>{sel.size.toLocaleString()} customers · {pct(sel.share, 1)} · statistical label: {sel.statistical_name}</div>
            </div>
          </div>
          <h3>Recommended actions</h3>
          {sel.recommendations.length === 0 && <p className="muted">No recommendations for noise points.</p>}
          <div className="stack" style={{ gap: 12 }}>
            {sel.recommendations.map((r) => (
              <div key={r.title} className="well" style={{ padding: 16 }}>
                <div className="between">
                  <b style={{ fontSize: 16 }}>{r.title}</b>
                  <span style={{ display: "flex", gap: 6 }}>
                    <span className="badge">{r.category}</span>
                    {r.priority === "high" && <span className="badge bad">High priority</span>}
                  </span>
                </div>
                <p className="body" style={{ margin: "6px 0", fontSize: 14 }}>{r.action}</p>
                <div className="muted" style={{ fontSize: 13 }}><b>Why:</b> {r.why.join(" · ")}</div>
              </div>
            ))}
          </div>
        </section>

        <aside className="stack" style={{ flex: "1 1 320px" }}>
          <section className="card stack">
            <h2>Distinguishing features</h2>
            {sel.distinguishing.map((f) => (
              <div key={f.feature} style={{ fontSize: 13 }}>
                <div className="between"><span>{f.label}</span><span className="muted">{num(f.segment_mean)} vs {num(f.overall_mean)}</span></div>
                <ZBar z={f.z} />
              </div>
            ))}
          </section>
          {sel.opportunities.length > 0 && (
            <section className="card stack"><h2>Opportunities</h2><ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 14 }}>{sel.opportunities.map((o) => <li key={o}>{o}</li>)}</ul></section>
          )}
          <section className="card stack"><h2>Risks and limits</h2><ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 14 }}>{(sel.risks.length ? sel.risks : ["None flagged by the data."]).map((r) => <li key={r}>{r}</li>)}</ul></section>
          {sel.product_mix.length > 0 && (
            <section className="card stack">
              <h2>Where their money goes</h2>
              {sel.product_mix.map((p) => (
                <div key={p.feature} style={{ fontSize: 13 }}>
                  <div className="between"><span>{p.category}</span><span>{pct(p.segment_share)} <span className="muted">vs {pct(p.overall_share)}</span></span></div>
                  <div style={{ height: 6, background: "var(--line)", borderRadius: 99, marginTop: 4 }}><div style={{ height: 6, width: `${p.segment_share * 100}%`, background: segColor(sel.id).color, borderRadius: 99 }} /></div>
                </div>
              ))}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
