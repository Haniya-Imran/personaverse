import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Banner, Orb } from "../components/ui";
import { api } from "../lib/api";
import type { SampleInfo } from "../lib/types";
import { useWorkspace } from "../state/Workspace";

export default function DataWorkspace() {
  const ws = useWorkspace();
  const [info, setInfo] = useState<SampleInfo | null>(null);
  const [drag, setDrag] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { api.sampleInfo().then(setInfo).catch(() => undefined); }, []);
  const preview = ws.profile?.preview;

  return (
    <>
      <div className="between">
        <div>
          <span className="label">Module A · Data workspace</span>
          <h1 style={{ marginTop: 6 }}>Bring your <span className="serif" style={{ color: "var(--accent-deep)" }}>customers.</span></h1>
        </div>
        {ws.dataset && <Link className="btn primary" to="/app/profile">Continue to profiling →</Link>}
      </div>

      <div className="row">
        <section className="card stack" style={{ flex: "1 1 380px" }} aria-labelledby="sample-h">
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}><Orb id={2} size={34} /><h2 id="sample-h">Real sample dataset</h2></div>
          {info ? (
            <>
              <b>{info.name}</b>
              <p className="body" style={{ margin: 0, fontSize: 14 }}>{info.description}</p>
              <div className="well" style={{ padding: 12, fontSize: 13, lineHeight: 1.6 }}>
                <div><b>{info.rows.toLocaleString()}</b> customers · <b>{info.columns}</b> columns</div>
                <div>Source: {info.source}</div>
                <div>Licence: {info.license}</div>
              </div>
            </>
          ) : <div className="skeleton" style={{ height: 120 }} />}
          <button className="btn dark" onClick={() => ws.useSample()} disabled={ws.busy !== null} style={{ alignSelf: "flex-start" }}>
            {ws.dataset?.source === "sample" ? "Reload sample data" : "Use sample data"}
          </button>
        </section>

        <section className="card stack" style={{ flex: "1 1 380px" }} aria-labelledby="up-h">
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}><Orb id={1} size={34} /><h2 id="up-h">Upload your own CSV</h2></div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) ws.upload(f); }}
            className="well" style={{ padding: 28, textAlign: "center", border: `2px dashed ${drag ? "var(--accent)" : "var(--line)"}` }}>
            <p style={{ margin: "0 0 12px" }}>Drop a .csv file here, or</p>
            <input ref={file} type="file" accept=".csv,.tsv,.txt" className="sr-only" id="csv-input"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) ws.upload(f); e.target.value = ""; }} />
            <button className="btn primary" onClick={() => file.current?.click()} disabled={ws.busy !== null}>Choose file</button>
            {ws.uploadPct !== null && (
              <div style={{ marginTop: 14 }} role="progressbar" aria-valuenow={ws.uploadPct} aria-valuemin={0} aria-valuemax={100}>
                <div style={{ height: 8, background: "var(--line)", borderRadius: 99 }}><div style={{ height: 8, width: `${ws.uploadPct}%`, background: "var(--accent)", borderRadius: 99 }} /></div>
              </div>
            )}
          </div>
          <ul className="body" style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
            <li><b>One row per customer</b> (e.g. spend, visits, age) — used as is.</li>
            <li><b>Transactions</b> (customer ID + date + amount, or quantity × price) — turned into Recency, Frequency and Monetary per customer.</li>
            <li>Up to 20 MB · at least 20 rows · columns that look like names, emails or phones are removed automatically.</li>
          </ul>
        </section>
      </div>

      {ws.dataset && (
        <section className="card stack" aria-labelledby="cur-h">
          <div className="between">
            <h2 id="cur-h">Current dataset</h2>
            <span className="badge">{ws.dataset.kind === "transaction" ? "Transactions → customer RFM" : "One row per customer"}</span>
          </div>
          <div className="body">{ws.dataset.name} · {ws.dataset.rows.toLocaleString()} customers · {ws.dataset.columns} columns{ws.dataset.id_column ? ` · ID column: ${ws.dataset.id_column}` : ""}</div>
          {ws.dataset.cleaning.length > 0 && (
            <Banner kind="info">
              <b>Validation and cleaning</b>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{ws.dataset.cleaning.map((c) => <li key={c.step}><b>{c.step}:</b> {c.detail}</li>)}</ul>
            </Banner>
          )}
          {ws.dataset.derivations.length > 0 && (
            <div>
              <h3 style={{ marginBottom: 8 }}>Features we derived</h3>
              <div className="table-wrap"><table className="data">
                <thead><tr><th>Feature</th><th>How</th><th>Meaning</th></tr></thead>
                <tbody>{ws.dataset.derivations.map((d) => <tr key={d.feature}><td><b>{d.feature}</b></td><td className="mono" style={{ whiteSpace: "normal" }}>{d.formula}</td><td style={{ whiteSpace: "normal" }}>{d.meaning}</td></tr>)}</tbody>
              </table></div>
            </div>
          )}
          {preview && (
            <div>
              <h3 style={{ marginBottom: 8 }}>Preview (first {preview.rows.length} rows)</h3>
              <div className="table-wrap well" style={{ maxHeight: 360, overflow: "auto", padding: 4 }}>
                <table className="data">
                  <thead><tr>{preview.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                  <tbody>{preview.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v === null ? <span className="muted">—</span> : String(v)}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
