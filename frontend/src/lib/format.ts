// Segment palette from the chosen design (clay colours). Index = segment id; -1 = noise.
export const PALETTE = [
  { color: "#4F6BF0", light: "#DCE3FF", dark: "#2B3FA8" },
  { color: "#EE7D4E", light: "#FFE1D2", dark: "#B4502A" },
  { color: "#2FA889", light: "#D3F3EA", dark: "#1A6E58" },
  { color: "#A46BE0", light: "#EDDDFF", dark: "#6B3AA6" },
  { color: "#E0A82E", light: "#FFF0CC", dark: "#94690C" },
  { color: "#D9577B", light: "#FFDDE6", dark: "#9A2A4B" },
  { color: "#3A9BD0", light: "#D5ECF8", dark: "#1D6890" },
  { color: "#7C8C3A", light: "#ECF1D0", dark: "#4E5A1C" },
];
export const NOISE = { color: "#8A93A3", light: "#E1E5EB", dark: "#5A6272" };

export const segColor = (id: number) => (id < 0 ? NOISE : PALETTE[id % PALETTE.length]);
export const orb = (id: number) => {
  const c = segColor(id);
  return `radial-gradient(circle at 35% 30%, ${c.light}, ${c.color} 50%, ${c.dark})`;
};

export function num(v: number | null | undefined, digits?: number): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const a = Math.abs(v);
  const d = digits ?? (a >= 1000 ? 0 : a >= 10 ? 1 : 2);
  return v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 });
}
export const pct = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined ? "—" : `${(v * 100).toFixed(digits)}%`;

export function humanize(name: string): string {
  let s = name.replace(/^(Mnt|Num)/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").trim();
  s = s.replace(/\bProds?\b/, "products");
  return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : name;
}

export const ALGO_NAMES: Record<string, string> = { kmeans: "K-Means", agglomerative: "Agglomerative (Ward)", dbscan: "DBSCAN" };

export function segmentTitle(s: { id: number; statistical_name: string; persona_name?: string | null; is_noise?: boolean }) {
  if (s.is_noise) return "Outliers (noise)";
  return s.persona_name || s.statistical_name;
}
