import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Histogram } from "../components/charts";
import { Banner, EmptyState, Info, Stat } from "../components/ui";
import { num } from "../lib/format";
import { useWorkspace } from "../state/Workspace";

const KIND_LABEL: Record<string, string> = { numeric: "Number", binary: "Yes/No", categorical: "Category", identifier: "ID", constant: "Constant", datetime: "Date", text: "Text" };

export default function Profiling() {
  const { profile, busy } = useWorkspace();
  const numericCols = useMemo(() => profile?.columns.filter((c) => c.histogram) ?? [], [profile]);
  const [col, setCol] = useState<string | null>(null);
  if (!profile) {
    if (busy) return <div className="card"><div className="skeleton" style={{ height: 260 }} /></div>;
    return <EmptyState title="No data loaded yet" body="Load the sample dataset or upload a CSV to see a profile of your customers." to="/app/data" cta="Go to Data workspace" />;
  }
  const current = numericCols.find((c) => c.name === (col ?? profile.behaviour.rfm.monetary ?? numericCols[0]?.name)) ?? numericCols[0];
  const rfm = profile.behaviour.rfm;
  const cat = profile.columns.filter((c) => c.top_values);

  return (
    <>
      <div className="between">
        <div>
          <span className="label">Module B · Customer profiling</span>
          <h1 style={{ marginTop: 6 }}>{profile.dataset.rows.toLocaleString()} customers, <span className="serif" style={{ color: "var(--accent-deep)" }}>{profile.dataset.columns} signals.</span></h1>
        </div>
        <Link className="btn primary" to="/app/features">Continue to feature lab →</Link>
      </div>

      <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: 32 }}>
        <Stat label="Customers" value={profile.dataset.rows.toLocaleString()} />
        <Stat label="Columns" value={profile.dataset.columns} hint="Includes features we derived, like Total_Spend or Age." />
        <Stat label="Numeric / category" value={`${(profile.summary.by_kind.numeric ?? 0) + (profile.summary.by_kind.binary ?? 0)} / ${profile.summary.by_kind.categorical ?? 0}`} />
        <Stat label="Missing values" value={profile.summary.total_missing.toLocaleString()} />
        <Stat label="Look-alike rows" value={profile.summary.duplicate_rows_excluding_id} hint="Customers with identical values apart from their ID. Kept, because different people can look the same in the data." />
        <Stat label="Data quality" value={`${profile.summary.quality_score}/100`} hint="Starts at 100; reduced by missing values and serious warnings." />
      </div>

      <div className="row">
        <section className="card stack" style={{ flex: "1 1 360px" }}>
          <h2>Customer behaviour</h2>
          {profile.behaviour.metrics.length ? (
            <div className="grid-auto" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
              {profile.behaviour.metrics.map((m) => <div key={m.label} className="well" style={{ padding: 14 }}><Stat label={m.label} value={num(m.value)} hint={`From column: ${m.column}`} /></div>)}
            </div>
          ) : <p className="muted">No spend, frequency or recency columns were recognised.</p>}
          {profile.behaviour.lifetime_value && <Banner kind="info"><b>{profile.behaviour.lifetime_value.label}:</b> {num(profile.behaviour.lifetime_value.value)} — {profile.behaviour.lifetime_value.note}</Banner>}
          <h3>RFM analysis</h3>
          {rfm.available && typeof rfm.explanation === "object" ? (
            <ul className="body" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 14 }}>
              <li><b>Recency</b> ({rfm.recency}): {rfm.explanation.recency}</li>
              <li><b>Frequency</b> ({rfm.frequency}): {rfm.explanation.frequency}</li>
              <li><b>Monetary</b> ({rfm.monetary}): {rfm.explanation.monetary}</li>
              <li className="muted">Computed from {rfm.source}.</li>
            </ul>
          ) : <p className="muted" style={{ margin: 0 }}>{String(rfm.explanation)}</p>}
        </section>

        <section className="card stack" style={{ flex: "1.4 1 460px" }}>
          <div className="between">
            <h2>Distribution</h2>
            <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <span>Column</span>
              <select value={current?.name} onChange={(e) => setCol(e.target.value)}>
                {numericCols.map((c) => <option key={c.name}>{c.name}</option>)}
              </select>
            </label>
          </div>
          {current?.histogram && <Histogram bins={current.histogram} label={current.name} />}
          {current && (
            <div className="muted" style={{ fontSize: 13, display: "flex", flexWrap: "wrap", gap: 16 }}>
              <span>Mean {num(current.mean)}</span><span>Median {num(current.median)}</span><span>Min {num(current.min as number)}</span>
              <span>Max {num(current.max as number)}</span><span>Outliers {current.outliers ?? 0}</span><span>Missing {current.missing}</span>
            </div>
          )}
        </section>
      </div>

      <section className="card stack">
        <h2>Data quality notes</h2>
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          {profile.notes.map((n, i) => (
            <li key={i} className={`banner ${n.level === "warning" ? "warn" : "info"}`} style={{ padding: "10px 14px" }}>
              {n.column && <b style={{ marginRight: 6 }}>{n.column}:</b>}{n.message}
            </li>
          ))}
        </ul>
      </section>

      <section className="card stack">
        <h2>All columns</h2>
        <div className="table-wrap"><table className="data">
          <thead><tr><th>Column</th><th>Type <Info text="Detected automatically from the values." /></th><th>Meaning</th><th>Missing</th><th>Unique</th><th>Mean</th><th>Median</th><th>Min</th><th>Max</th></tr></thead>
          <tbody>
            {profile.columns.map((c) => (
              <tr key={c.name} className={["identifier", "constant"].includes(c.kind) ? "dim" : ""}>
                <td><b>{c.name}</b></td><td><span className="badge">{KIND_LABEL[c.kind] ?? c.kind}</span></td>
                <td style={{ whiteSpace: "normal", minWidth: 160 }}>{c.role_description ?? "—"}</td>
                <td>{c.missing ? `${c.missing} (${num(c.missing_pct, 1)}%)` : "0"}</td><td>{c.unique}</td>
                <td>{num(c.mean)}</td><td>{num(c.median)}</td>
                <td>{typeof c.min === "number" ? num(c.min) : c.min ?? "—"}</td><td>{typeof c.max === "number" ? num(c.max) : c.max ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>

      {cat.length > 0 && (
        <section className="card stack">
          <h2>Categories</h2>
          <div className="grid-auto">
            {cat.map((c) => (
              <div key={c.name} className="well" style={{ padding: 14 }}>
                <b>{c.name}</b>
                {c.top_values!.slice(0, 6).map((t) => (
                  <div key={t.value} style={{ marginTop: 8 }}>
                    <div className="between" style={{ fontSize: 13 }}><span>{t.value}</span><span>{num(t.pct, 1)}%</span></div>
                    <div style={{ height: 6, background: "var(--line)", borderRadius: 99 }}><div style={{ height: 6, width: `${t.pct}%`, background: "var(--accent)", borderRadius: 99 }} /></div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
