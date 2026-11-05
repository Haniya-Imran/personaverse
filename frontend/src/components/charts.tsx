import { useState } from "react";
import { num, segColor } from "../lib/format";

export function Histogram({ bins, label }: { bins: { start: number; end: number; count: number }[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 520, H = 180, P = 28;
  const max = Math.max(...bins.map((b) => b.count), 1);
  const bw = (W - P * 2) / bins.length;
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H + 24}`} width="100%" role="img" aria-label={`Distribution of ${label}`}>
        {bins.map((b, i) => {
          const h = (b.count / max) * (H - P);
          return (
            <rect key={i} x={P + i * bw + 1} y={H - h} width={Math.max(bw - 2, 1)} height={h} rx={3}
              fill={hover === i ? "#2B3FA8" : "#4F6BF0"} opacity={hover === null || hover === i ? 1 : 0.6}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          );
        })}
        <line x1={P} x2={W - P} y1={H} y2={H} stroke="#4B5468" strokeWidth={1} />
        <text x={P} y={H + 18} fontSize="12" fill="#4B5468">{num(bins[0]?.start)}</text>
        <text x={W - P} y={H + 18} fontSize="12" fill="#4B5468" textAnchor="end">{num(bins[bins.length - 1]?.end)}</text>
      </svg>
      <figcaption className="muted" style={{ fontSize: 13, minHeight: 20 }}>
        {hover !== null ? `${num(bins[hover].start)} – ${num(bins[hover].end)}: ${bins[hover].count} customers` : "Hover a bar to see the range and count."}
      </figcaption>
    </figure>
  );
}

interface Series { name: string; color: string; points: { x: number; y: number | null }[] }

export function LineChart({ series, xLabel, yLabel, marker }: { series: Series[]; xLabel: string; yLabel: string; marker?: number | null }) {
  const W = 520, H = 220, L = 52, B = 34, T = 12, R = 14;
  const xs = series.flatMap((s) => s.points.map((p) => p.x));
  const ys = series.flatMap((s) => s.points.map((p) => p.y).filter((v): v is number => v !== null));
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const sx = (x: number) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - R);
  const sy = (y: number) => T + (1 - (y - y0) / (y1 - y0 || 1)) * (H - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${yLabel} by ${xLabel}`}>
      {marker != null && <line x1={sx(marker)} x2={sx(marker)} y1={T} y2={H - B} stroke="#2B3FA8" strokeDasharray="4 4" />}
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="#4B5468" />
      <line x1={L} x2={L} y1={T} y2={H - B} stroke="#4B5468" />
      {[...new Set(xs)].map((x) => <text key={x} x={sx(x)} y={H - B + 16} fontSize="11" textAnchor="middle" fill="#4B5468">{x}</text>)}
      <text x={L - 8} y={sy(y1) + 4} fontSize="11" textAnchor="end" fill="#4B5468">{num(y1)}</text>
      <text x={L - 8} y={sy(y0) + 4} fontSize="11" textAnchor="end" fill="#4B5468">{num(y0)}</text>
      <text x={(W + L) / 2} y={H - 4} fontSize="12" textAnchor="middle" fill="#2B3345">{xLabel}</text>
      {series.map((s) => {
        const pts = s.points.filter((p) => p.y !== null) as { x: number; y: number }[];
        return (
          <g key={s.name}>
            <polyline fill="none" stroke={s.color} strokeWidth={2.5} points={pts.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")} />
            {pts.map((p) => <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r={4} fill={s.color}><title>{`${s.name} — ${xLabel} ${p.x}: ${num(p.y, 3)}`}</title></circle>)}
          </g>
        );
      })}
    </svg>
  );
}

export function Heatmap({ rows, cols, names }: { rows: { segment: number; values: number[]; means: number[] }[]; cols: { label: string }[]; names: Record<number, string> }) {
  const color = (z: number) => {
    const t = Math.max(-1.5, Math.min(1.5, z)) / 1.5;
    return t >= 0 ? `rgba(79,107,240,${0.12 + t * 0.75})` : `rgba(238,125,78,${0.12 + -t * 0.75})`;
  };
  return (
    <div className="table-wrap">
      <table className="data" style={{ minWidth: 560 }}>
        <thead>
          <tr><th>Segment</th>{cols.map((c) => <th key={c.label}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.segment}>
              <td style={{ fontWeight: 600 }}><span className="dot" style={{ background: segColor(r.segment).color, marginRight: 8 }} />{names[r.segment]}</td>
              {r.values.map((z, i) => (
                <td key={i} style={{ background: color(z), color: Math.abs(z) > 1 ? "#fff" : "var(--ink)", fontWeight: 600 }}
                  title={`${cols[i].label}: average ${num(r.means[i])} (${z >= 0 ? "+" : ""}${z.toFixed(2)} SD vs all customers)`}>
                  {num(r.means[i])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>Cells show segment averages. Blue = above the overall average, orange = below; stronger colour = bigger difference.</p>
    </div>
  );
}

export function ShareBars({ items }: { items: { id: number; label: string; share: number; size: number }[] }) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      {items.map((it) => (
        <div key={it.id}>
          <div className="between" style={{ fontSize: 13, fontWeight: 600 }}>
            <span><span className="dot" style={{ background: segColor(it.id).color, marginRight: 8 }} />{it.label}</span>
            <span>{it.size.toLocaleString()} · {(it.share * 100).toFixed(1)}%</span>
          </div>
          <div style={{ height: 8, background: "var(--line)", borderRadius: 99, marginTop: 6, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${it.share * 100}%`, background: segColor(it.id).color, borderRadius: 99 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
