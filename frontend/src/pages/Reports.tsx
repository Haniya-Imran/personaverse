import { EmptyState } from "../components/ui";
import { api } from "../lib/api";
import { useWorkspace } from "../state/Workspace";

export default function Reports() {
  const ws = useWorkspace();
  const a = ws.analysis;
  if (!a) return <EmptyState title="Nothing to export yet" body="Run a segmentation first; reports are built from its real results." to="/app/segmentation" cta="Go to Segmentation" />;
  const nPersonas = Object.keys(ws.personas).length;
  const items = [
    { t: "Full business report", d: "Method, model choice, metrics, every segment with recommendations, risks and any AI personas. Open it and use your browser's Print → Save as PDF.", href: api.reportUrl(a.analysis_id, "report.html"), cta: "Open report", target: "_blank" },
    { t: "Download report (HTML file)", d: "The same report as a file you can email or archive.", href: api.reportUrl(a.analysis_id, "report.html", true), cta: "Download .html" },
    { t: "Segment statistics", d: "One row per segment: size, share, and the average and standardised difference of every feature.", href: api.reportUrl(a.analysis_id, "segments.csv"), cta: "Download .csv" },
    { t: "Customer assignments", d: "Every customer with their segment and the features used. Use it to target campaigns in your CRM.", href: api.reportUrl(a.analysis_id, "assignments.csv"), cta: "Download .csv" },
    { t: "Persona report", d: nPersonas ? `${nPersonas} AI persona(s) as Markdown, with evidence and hypothesis labels.` : "Generate at least one persona in the Persona studio first.", href: nPersonas ? api.reportUrl(a.analysis_id, "personas.md") : undefined, cta: "Download .md" },
    { t: "Raw results (JSON)", d: "Everything the API computed, for developers.", href: api.reportUrl(a.analysis_id, "report.json"), cta: "Download .json" },
  ];
  return (
    <>
      <div>
        <span className="label">Reports</span>
        <h1 style={{ marginTop: 6 }}>Take the results <span className="serif" style={{ color: "var(--accent-deep)" }}>with you.</span></h1>
      </div>
      <div className="grid-auto" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))" }}>
        {items.map((it) => (
          <section key={it.t} className="card stack">
            <h2>{it.t}</h2>
            <p className="body" style={{ margin: 0, fontSize: 14, flex: 1 }}>{it.d}</p>
            <a className={`btn ${it.href ? "primary" : ""}`} href={it.href} target={it.target} rel="noreferrer" aria-disabled={!it.href}
              onClick={(e) => { if (!it.href) e.preventDefault(); }} style={{ alignSelf: "flex-start" }}>{it.cta}</a>
          </section>
        ))}
      </div>
    </>
  );
}
