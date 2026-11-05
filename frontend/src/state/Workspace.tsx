import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError, uploadDataset, type RunOptions } from "../lib/api";
import type {
  AnalysisSummary, DatasetSummary, FeatureRecommendation, Insights, LlmStatus, PersonaResult, Profile, Visualization,
} from "../lib/types";

type Busy = "dataset" | "profile" | "analysis" | null;

interface WorkspaceState {
  dataset: DatasetSummary | null;
  profile: Profile | null;
  features: FeatureRecommendation | null;
  numeric: string[];
  categorical: string[];
  analysis: AnalysisSummary | null;
  viz: Visualization | null;
  insights: Insights | null;
  personas: Record<number, PersonaResult>;
  personaBusy: Record<number, boolean>;
  personaErrors: Record<number, string | undefined>;
  llm: LlmStatus | null;
  busy: Busy;
  uploadPct: number | null;
  error: string | null;
  notice: string | null;
  selectedSegment: number | null;
}

interface WorkspaceApi extends WorkspaceState {
  useSample(): Promise<void>;
  upload(file: File): Promise<void>;
  setSelection(numeric: string[], categorical: string[]): void;
  runSegmentation(opts?: RunOptions): Promise<boolean>;
  generatePersona(segmentId: number, regenerate?: boolean): Promise<void>;
  selectSegment(id: number | null): void;
  reset(): Promise<void>;
  clearError(): void;
}

const Ctx = createContext<WorkspaceApi | null>(null);
const KEY = "personaverse.session";

const empty: WorkspaceState = {
  dataset: null, profile: null, features: null, numeric: [], categorical: [], analysis: null, viz: null,
  insights: null, personas: {}, personaBusy: {}, personaErrors: {}, llm: null, busy: null, uploadPct: null,
  error: null, notice: null, selectedSegment: null,
};

const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong.");

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<WorkspaceState>(empty);
  const ref = useRef(s);
  ref.current = s;
  const patch = useCallback((p: Partial<WorkspaceState>) => setS((prev) => ({ ...prev, ...p })), []);

  const loadDataset = useCallback(async (ds: DatasetSummary) => {
    patch({ ...empty, dataset: ds, busy: "profile", llm: ref.current.llm });
    sessionStorage.setItem(KEY, JSON.stringify({ dataset: ds.dataset_id }));
    try {
      const [profile, features] = await Promise.all([api.profile(ds.dataset_id), api.features(ds.dataset_id)]);
      const numeric = features.features.filter((f) => f.selected && f.type === "numeric").map((f) => f.name);
      patch({ profile, features, numeric, categorical: [], busy: null });
    } catch (e) {
      patch({ busy: null, error: msg(e) });
    }
  }, [patch]);

  const loadAnalysis = useCallback(async (a: AnalysisSummary) => {
    const [viz, insights, llm] = await Promise.all([
      api.visualization(a.analysis_id), api.segments(a.analysis_id), api.llmStatus(a.analysis_id),
    ]);
    const personas: Record<number, PersonaResult> = {};
    patch({ analysis: a, viz, insights, llm, personas, personaErrors: {}, selectedSegment: insights.segments.find((x) => !x.is_noise)?.id ?? null });
    sessionStorage.setItem(KEY, JSON.stringify({ dataset: a.dataset_id, analysis: a.analysis_id, numeric: a.features.numeric, categorical: a.features.categorical }));
    // pull any personas generated earlier in this server session
    const cached = await Promise.all(insights.segments.filter((x) => x.persona_name).map((x) => api.segment(a.analysis_id, x.id)));
    const map: Record<number, PersonaResult> = {};
    cached.forEach((c) => { if (c.persona) map[c.id] = c.persona; });
    if (Object.keys(map).length) patch({ personas: map });
  }, [patch]);

  // Restore the previous session after a page reload.
  useEffect(() => {
    api.health().then((h) => patch({ llm: h.llm })).catch(() => undefined);
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { dataset?: string; analysis?: string; numeric?: string[]; categorical?: string[] };
    (async () => {
      try {
        if (!saved.dataset) return;
        patch({ busy: "dataset" });
        const ds = await api.dataset(saved.dataset);
        await loadDataset(ds);
        if (saved.analysis) {
          const a = await api.analysis(saved.analysis);
          patch({ numeric: saved.numeric ?? a.features.numeric, categorical: saved.categorical ?? [] });
          await loadAnalysis(a);
        }
      } catch (e) {
        sessionStorage.removeItem(KEY);
        patch({ ...empty, notice: e instanceof ApiError && e.status === 404 ? "Your previous session expired (data is kept in memory for 2 hours only). Load the data again to continue." : msg(e) });
      }
    })();
  }, [loadDataset, loadAnalysis, patch]);

  const value = useMemo<WorkspaceApi>(() => ({
    ...s,
    async useSample() {
      patch({ busy: "dataset", error: null, notice: null });
      try { await loadDataset(await api.useSample()); } catch (e) { patch({ busy: null, error: msg(e) }); }
    },
    async upload(file) {
      patch({ busy: "dataset", error: null, notice: null, uploadPct: 0 });
      try {
        const ds = await uploadDataset(file, (p) => patch({ uploadPct: p }));
        patch({ uploadPct: null });
        await loadDataset(ds);
      } catch (e) { patch({ busy: null, uploadPct: null, error: msg(e) }); }
    },
    setSelection(numeric, categorical) { patch({ numeric, categorical }); },
    async runSegmentation(opts) {
      const cur = ref.current;
      if (!cur.dataset) return false;
      patch({ busy: "analysis", error: null });
      try {
        const a = await api.runAnalysis(cur.dataset.dataset_id, cur.numeric, cur.categorical, opts);
        await loadAnalysis(a);
        patch({ busy: null });
        return true;
      } catch (e) {
        patch({ busy: null, error: msg(e) });
        return false;
      }
    },
    async generatePersona(segmentId, regenerate = false) {
      const cur = ref.current;
      if (!cur.analysis) return;
      setS((p) => ({ ...p, personaBusy: { ...p.personaBusy, [segmentId]: true }, personaErrors: { ...p.personaErrors, [segmentId]: undefined } }));
      try {
        const r = await api.persona(cur.analysis.analysis_id, segmentId, regenerate);
        setS((p) => ({
          ...p, personas: { ...p.personas, [segmentId]: r }, personaBusy: { ...p.personaBusy, [segmentId]: false },
          insights: p.insights && { ...p.insights, segments: p.insights.segments.map((x) => (x.id === segmentId ? { ...x, persona_name: r.persona.persona_name } : x)) },
        }));
      } catch (e) {
        setS((p) => ({ ...p, personaBusy: { ...p.personaBusy, [segmentId]: false }, personaErrors: { ...p.personaErrors, [segmentId]: msg(e) } }));
      }
    },
    selectSegment(id) { patch({ selectedSegment: id }); },
    async reset() {
      const id = ref.current.dataset?.dataset_id;
      sessionStorage.removeItem(KEY);
      patch({ ...empty, llm: ref.current.llm });
      if (id) await api.deleteDataset(id).catch(() => undefined);
    },
    clearError() { patch({ error: null, notice: null }); },
  }), [s, patch, loadDataset, loadAnalysis]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return v;
}
