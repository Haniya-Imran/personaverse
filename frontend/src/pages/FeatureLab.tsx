import { useNavigate } from "react-router-dom";
import { Banner, EmptyState } from "../components/ui";
import { useWorkspace } from "../state/Workspace";

export default function FeatureLab() {
  const ws = useWorkspace();
  const nav = useNavigate();
  if (!ws.features) {
    if (ws.busy) return <div className="card"><div className="skeleton" style={{ height: 300 }} /></div>;
    return <EmptyState title="No data loaded yet" body="Feature recommendations appear once a dataset is loaded." to="/app/data" cta="Go to Data workspace" />;
  }
  const usable = ws.features.features.filter((f) => f.usable && f.kind !== "binary" || (f.kind === "binary" && f.usable));
  const blocked = ws.features.features.filter((f) => !f.usable);
  const isOn = (name: string) => ws.numeric.includes(name) || ws.categorical.includes(name);
  const toggle = (name: string, type: "numeric" | "categorical") => {
    if (type === "numeric") ws.setSelection(isOn(name) ? ws.numeric.filter((x) => x !== name) : [...ws.numeric, name], ws.categorical);
    else ws.setSelection(ws.numeric, isOn(name) ? ws.categorical.filter((x) => x !== name) : [...ws.categorical, name]);
  };
  const total = ws.numeric.length + ws.categorical.length;
  const run = async () => { if (await ws.runSegmentation({ algorithm: "auto" })) nav("/app/segmentation"); };
  const recommended = ws.features.recommended;
  const changed = recommended.length !== ws.numeric.length || recommended.some((r) => !ws.numeric.includes(r)) || ws.categorical.length > 0;

  return (
    <>
      <div className="between">
        <div>
          <span className="label">Module C · Feature engineering lab</span>
          <h1 style={{ marginTop: 6 }}>Choose what <span className="serif" style={{ color: "var(--accent-deep)" }}>defines</span> a segment.</h1>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {changed && <button className="btn" onClick={() => ws.setSelection(recommended, [])}>Restore recommended</button>}
          <button className="btn primary" onClick={run} disabled={total < 2 || ws.busy !== null}>
            {ws.busy === "analysis" ? "Running…" : `Run segmentation with ${total} features`}
          </button>
        </div>
      </div>
      {total < 2 && <Banner kind="warn">Select at least two features.</Banner>}

      <div className="row" style={{ alignItems: "flex-start" }}>
        <section className="card stack" style={{ flex: "2 1 560px" }} aria-labelledby="sel-h">
          <h2 id="sel-h">Features ({total} selected)</h2>
          <p className="body" style={{ margin: 0, fontSize: 14 }}>Pre-selected features describe spending, buying frequency, recency and household — and don't repeat each other. Tick or untick to change them.</p>
          <div className="stack" style={{ gap: 8 }}>
            {usable.map((f) => (
              <label key={f.name} className="well" style={{ display: "flex", gap: 12, padding: "12px 14px", alignItems: "flex-start", cursor: "pointer", outline: isOn(f.name) ? "2px solid var(--accent)" : "none" }}>
                <input type="checkbox" checked={isOn(f.name)} onChange={() => toggle(f.name, f.type)} style={{ marginTop: 2 }} />
                <span style={{ flex: 1 }}>
                  <span style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <b>{f.name}</b>
                    <span className="badge">{f.type === "categorical" ? "Category" : f.kind === "binary" ? "Yes/No" : "Number"}</span>
                    {f.role && <span className="badge" style={{ background: "transparent", boxShadow: "none", border: "1px solid var(--line)", color: "var(--body)" }}>{f.role.replace("_", " ")}</span>}
                    {recommended.includes(f.name) && <span className="badge obs">Recommended</span>}
                  </span>
                  <span className="body" style={{ display: "block", fontSize: 13, marginTop: 4 }}>{f.reason}</span>
                </span>
              </label>
            ))}
          </div>
          {blocked.length > 0 && (
            <details>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>Not usable for clustering ({blocked.length})</summary>
              <ul className="body" style={{ fontSize: 13, lineHeight: 1.7 }}>{blocked.map((f) => <li key={f.name}><b>{f.name}</b> — {f.reason}</li>)}</ul>
            </details>
          )}
        </section>

        <section className="dark-card stack" style={{ flex: "1 1 320px" }} aria-labelledby="pipe-h">
          <h2 id="pipe-h" style={{ color: "#fff" }}>What happens to the data</h2>
          <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            {ws.features.steps.map((s) => (
              <li key={s.step} style={{ lineHeight: 1.5 }}>
                <b style={{ color: "#fff" }}>{s.step}.</b> <span style={{ color: "#CDD3DC" }}>{s.how}</span>
                <div style={{ color: "#AEB6C4", fontSize: 13, marginTop: 2 }}>Why: {s.why}</div>
              </li>
            ))}
          </ol>
          <p style={{ color: "#AEB6C4", fontSize: 13, margin: 0 }}>The exact same fitted steps are reused when new customers are assigned to a segment.</p>
        </section>
      </div>
    </>
  );
}
