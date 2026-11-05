import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { orb, segColor } from "../lib/format";

export function Info({ text }: { text: string }) {
  return (
    <span className="info-tip" tabIndex={0} role="note" aria-label={text}>
      ?<span className="tip">{text}</span>
    </span>
  );
}

export function Orb({ id, size = 28 }: { id: number; size?: number }) {
  return <span className="orb" aria-hidden="true" style={{ width: size, height: size, background: orb(id), display: "inline-block" }} />;
}

export function Dot({ id }: { id: number }) {
  return <span className="dot" aria-hidden="true" style={{ background: segColor(id).color }} />;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }} role="status">
      <span className="spinner" aria-hidden="true" />
      {label && <span>{label}</span>}
    </span>
  );
}

export function Banner({ kind = "info", children, onClose }: { kind?: "info" | "warn" | "error"; children: ReactNode; onClose?: () => void }) {
  return (
    <div className={`banner ${kind}`} role={kind === "error" ? "alert" : "status"}>
      <div style={{ flex: 1 }}>{children}</div>
      {onClose && (
        <button className="btn small" onClick={onClose} aria-label="Dismiss message">Dismiss</button>
      )}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>{value}</div>
      <div className="muted" style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
        {label}
        {hint && <Info text={hint} />}
      </div>
    </div>
  );
}

export function EmptyState({ title, body, to, cta }: { title: string; body: string; to: string; cta: string }) {
  return (
    <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 18 }}>
        <Orb id={0} size={34} /><Orb id={1} size={26} /><Orb id={2} size={30} />
      </div>
      <h2 style={{ fontSize: 22 }}>{title}</h2>
      <p className="body" style={{ maxWidth: 520, margin: "10px auto 20px" }}>{body}</p>
      <Link className="btn primary" to={to}>{cta}</Link>
    </div>
  );
}

export function Claim({ text, basis }: { text: string; basis: "observed" | "hypothesis" }) {
  return (
    <li style={{ display: "flex", gap: 10, alignItems: "flex-start", lineHeight: 1.5 }}>
      <span className={`badge ${basis === "observed" ? "obs" : "hyp"}`} title={basis === "observed" ? "Restates a measured statistic" : "AI interpretation — not directly measured"}>
        {basis === "observed" ? "Observed" : "Hypothesis"}
      </span>
      <span>{text}</span>
    </li>
  );
}

export function ZBar({ z }: { z: number }) {
  const w = Math.min(Math.abs(z) / 2, 1) * 50;
  const col = z >= 0 ? "#4F6BF0" : "#EE7D4E";
  return (
    <span aria-label={`${z >= 0 ? "+" : ""}${z.toFixed(2)} standard deviations`} style={{ position: "relative", display: "inline-block", width: 120, height: 10, background: "var(--well)", borderRadius: 99, boxShadow: "var(--inset)" }}>
      <span style={{ position: "absolute", left: "50%", top: -2, bottom: -2, width: 1, background: "var(--muted)" }} />
      <span style={{ position: "absolute", top: 0, bottom: 0, borderRadius: 99, background: col, width: `${w}%`, left: z >= 0 ? "50%" : `${50 - w}%` }} />
    </span>
  );
}
