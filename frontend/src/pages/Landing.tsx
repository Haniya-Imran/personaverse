import { lazy, Suspense } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Orb } from "../components/ui";
import { useWorkspace } from "../state/Workspace";

const HeroScene = lazy(() => import("../components/HeroScene"));
const AUTHOR = (import.meta.env.VITE_AUTHOR_NAME as string | undefined) || "Haniya Imran";

const MODULES = [
  { n: "01", t: "Data workspace", d: "Use the bundled real dataset or upload your own CSV. Files are checked, cleaned and kept in memory only." },
  { n: "02", t: "Customer profiling", d: "Column types, missing values, distributions and RFM behaviour — before any model runs." },
  { n: "03", t: "Feature lab", d: "See which features are recommended and why. Missing values, outliers and scaling are handled for you." },
  { n: "04", t: "Segmentation engine", d: "K-Means, Agglomerative and DBSCAN compared on silhouette, Davies-Bouldin, Calinski-Harabasz and stability." },
  { n: "05", t: "3D cluster explorer", d: "Rotate, zoom and pan through every customer. Hover for details, click a group to focus it." },
  { n: "06", t: "Persona studio", d: "An LLM turns each segment's real statistics into a persona — with observed facts and hypotheses labelled." },
  { n: "07", t: "Strategy and reports", d: "Segment comparison, evidence-backed recommendations and CSV, Markdown and HTML exports." },
];

export default function Landing() {
  const ws = useWorkspace();
  const nav = useNavigate();
  const start = async () => {
    await ws.useSample();
    nav("/app/data");
  };
  return (
    <div>
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 24px", background: "var(--card)", borderBottom: "1px solid rgba(255,255,255,.6)", boxShadow: "0 6px 20px rgba(70,80,98,.18)", position: "sticky", top: 0, zIndex: 10 }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "var(--ink)" }}>
          <Orb id={0} size={28} /><b style={{ fontSize: 17 }}>PersonaVerse</b>
        </Link>
        <nav aria-label="Landing" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <a className="btn small" href="#how" style={{ boxShadow: "none", background: "transparent", border: "none" }}>How it works</a>
          <a className="btn small" href="#modules" style={{ boxShadow: "none", background: "transparent", border: "none" }}>Modules</a>
          <Link className="btn small dark" to="/app">Open workspace</Link>
        </nav>
      </header>

      <main>
        <section style={{ maxWidth: 1320, margin: "0 auto", padding: "56px 24px 40px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))", gap: 32, alignItems: "center" }}>
          <div className="stack" style={{ gap: 22 }}>
            <span className="badge" style={{ alignSelf: "flex-start" }}>Customer segmentation · 3D clusters · AI personas</span>
            <h1 style={{ fontSize: "clamp(42px, 6.4vw, 78px)", lineHeight: 0.98 }}>
              Know every customer group <span className="serif" style={{ color: "var(--accent-deep)" }}>by name.</span>
            </h1>
            <p className="body" style={{ fontSize: 19, maxWidth: 560, margin: 0 }}>
              PersonaVerse finds natural groups in your customer data, lets you explore them in 3D, and asks an AI to describe
              each group as a persona — built only from that group's real numbers.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <button className="btn primary" onClick={start} disabled={ws.busy === "dataset"} style={{ fontSize: 16, padding: "14px 26px" }}>
                {ws.busy === "dataset" ? "Loading data…" : "Try it with real data"}
              </button>
              <Link className="btn" to="/app/data" style={{ fontSize: 16, padding: "14px 26px" }}>Upload your CSV</Link>
            </div>
            {ws.error && <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>{ws.error}</p>}
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>No sign-up. Sample: 2,240 real customers of a food retailer (public dataset).</p>
          </div>
          <div className="card" style={{ position: "relative", height: 520, padding: 0, overflow: "hidden", background: "var(--well)" }}>
            <Suspense fallback={<div className="skeleton" style={{ position: "absolute", inset: 20 }} />}>
              <HeroScene />
            </Suspense>
            <div className="card tight" style={{ position: "absolute", left: 20, bottom: 20, width: 260, pointerEvents: "none" }}>
              <div className="label">Example output</div>
              <div style={{ fontWeight: 700, marginTop: 6 }}>Premium loyal customers</div>
              <p className="serif" style={{ fontSize: 19, margin: "6px 0 0", lineHeight: 1.3 }}>“Spend about twice the average, rarely wait for a discount.”</p>
            </div>
            <span className="muted" style={{ position: "absolute", top: 18, right: 22, fontSize: 12, fontWeight: 600 }}>Drag to rotate</span>
          </div>
        </section>

        <section id="how" style={{ maxWidth: 1320, margin: "0 auto", padding: "40px 24px" }}>
          <h2 style={{ fontSize: "clamp(30px, 4vw, 48px)", letterSpacing: "-0.035em", lineHeight: 1.05, marginBottom: 28 }}>
            From a spreadsheet to <span className="serif">people</span>, in three steps.
          </h2>
          <div className="grid-auto" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 22 }}>
            {[["1", "Load your data", "Upload customers or transactions. We detect what each column means and compute RFM when possible."],
              ["2", "Find the groups", "Three algorithms are compared fairly; the best-supported number of segments is chosen and explained."],
              ["3", "Meet the personas", "Each group gets an evidence-based persona and practical, segment-specific marketing ideas."]].map(([n, t, d]) => (
              <div key={n} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <span className="serif" style={{ fontSize: 44, lineHeight: 1, color: "var(--accent-deep)" }}>0{n}</span>
                <h3 style={{ fontSize: 21 }}>{t}</h3>
                <p className="body" style={{ margin: 0 }}>{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="modules" style={{ maxWidth: 1320, margin: "0 auto", padding: "40px 24px" }}>
          <h2 style={{ fontSize: "clamp(26px, 3.2vw, 38px)", letterSpacing: "-0.03em", marginBottom: 22 }}>One workspace, seven connected modules</h2>
          <div className="grid-auto" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))" }}>
            {MODULES.map((m, i) => (
              <div key={m.n} className="card tight" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Orb id={i % 4} size={22} /><span className="label">{m.n}</span></div>
                <h3 style={{ fontSize: 17 }}>{m.t}</h3>
                <p className="body" style={{ margin: 0, fontSize: 14 }}>{m.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={{ maxWidth: 1320, margin: "0 auto", padding: "40px 24px 56px" }}>
          <div className="dark-card" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 24, padding: "44px 36px" }}>
            <h2 style={{ fontSize: "clamp(28px, 3.6vw, 44px)", letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 640, color: "#fff" }}>
              Ready to meet your <span className="serif" style={{ color: "#9FB0FF" }}>customers?</span>
            </h2>
            <button className="btn" onClick={start}>Start with the sample data</button>
          </div>
        </section>
      </main>
      <footer style={{ maxWidth: 1320, margin: "0 auto", padding: "0 24px 40px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, fontSize: 14, color: "var(--body)" }}>
        <span>PersonaVerse — Customer Segmentation & Persona Intelligence</span>
        <span>Built by {AUTHOR}</span>
      </footer>
    </div>
  );
}
