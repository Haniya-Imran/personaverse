import { useRef } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Banner, Orb, Spinner } from "../components/ui";
import { useWorkspace } from "../state/Workspace";

const AUTHOR = (import.meta.env.VITE_AUTHOR_NAME as string | undefined) || "Haniya Imran";

export default function WorkspaceLayout() {
  const ws = useWorkspace();
  const file = useRef<HTMLInputElement>(null);
  const hasData = !!ws.dataset;
  const hasModel = !!ws.analysis;
  const steps = [
    { to: "/app/data", label: "Data", done: hasData },
    { to: "/app/profile", label: "Profile", done: !!ws.profile },
    { to: "/app/features", label: "Features", done: hasModel },
    { to: "/app/segmentation", label: "Segmentation", done: hasModel },
    { to: "/app/explorer", label: "3D explorer", done: hasModel },
    { to: "/app/personas", label: "Personas", done: Object.keys(ws.personas).length > 0 },
    { to: "/app/insights", label: "Insights", done: hasModel },
  ];
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ background: "var(--card)", borderBottom: "1px solid rgba(255,255,255,.6)", boxShadow: "0 6px 20px rgba(70,80,98,.18)", position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 24px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
            <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "var(--ink)" }}>
              <Orb id={0} size={28} /><b style={{ fontSize: 17 }}>PersonaVerse</b>
            </Link>
            <NavLink to="/app" end className={({ isActive }) => `pill ${isActive ? "on" : ""}`} style={{ boxShadow: "none" }}>Overview</NavLink>
            <NavLink to="/app/reports" className={({ isActive }) => `pill ${isActive ? "on" : ""}`} style={{ boxShadow: "none" }}>Reports</NavLink>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            {ws.busy && <Spinner label={ws.busy === "analysis" ? "Running segmentation…" : ws.uploadPct !== null ? `Uploading ${ws.uploadPct}%` : "Loading…"} />}
            {ws.dataset && (
              <span className="badge" title={ws.dataset.name}>
                {ws.dataset.source === "sample" ? "Sample data" : ws.dataset.name.slice(0, 28)} · {ws.dataset.rows.toLocaleString()} customers
              </span>
            )}
            <input ref={file} type="file" accept=".csv,.tsv,.txt" className="sr-only" aria-label="Upload a CSV file"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) ws.upload(f); e.target.value = ""; }} />
            <button className="btn small primary" onClick={() => file.current?.click()} disabled={ws.busy !== null}>Upload CSV</button>
            {hasData && <button className="btn small" onClick={() => ws.reset()}>Reset analysis</button>}
          </div>
        </div>
        <nav aria-label="Analysis pipeline" style={{ display: "flex", gap: 6, padding: "0 24px 12px", overflowX: "auto" }}>
          {steps.map((s, i) => (
            <NavLink key={s.to} to={s.to} className={({ isActive }) => `pill ${isActive ? "on" : ""}`}
              style={{ boxShadow: "none", flex: "none", fontSize: 13 }}>
              <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, background: s.done ? "var(--accent)" : "var(--well)", color: s.done ? "#fff" : "var(--muted)" }}>
                {s.done ? "✓" : i + 1}
              </span>
              {s.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main style={{ flex: 1, width: "100%", maxWidth: 1440, margin: "0 auto", padding: "24px 24px 40px", display: "flex", flexDirection: "column", gap: 20 }}>
        {ws.error && <Banner kind="error" onClose={ws.clearError}>{ws.error}</Banner>}
        {ws.notice && <Banner kind="warn" onClose={ws.clearError}>{ws.notice}</Banner>}
        <Outlet />
      </main>
      <footer style={{ padding: "0 24px 28px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 10, fontSize: 13, color: "var(--body)", maxWidth: 1440, margin: "0 auto", width: "100%" }}>
        <span>Data stays in server memory for up to 2 hours and is never written to disk. Only aggregate statistics are sent to the AI.</span>
        <span>Built by {AUTHOR}</span>
      </footer>
    </div>
  );
}
