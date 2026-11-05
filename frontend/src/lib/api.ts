import type {
  AnalysisSummary, DatasetSummary, FeatureRecommendation, Insights, LlmStatus, PersonaResult, Profile, SampleInfo,
  Segment, Visualization,
} from "./types";

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "http://localhost:8000";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      ...init,
      headers: init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    throw new ApiError(0, "network", "Cannot reach the analysis server. Check your connection — a sleeping free server can take up to a minute to wake up.");
  }
  if (!res.ok) {
    let code = "error";
    let message = `Request failed (${res.status}).`;
    try {
      const body = await res.json();
      const d = body.detail;
      if (d && typeof d === "object") { code = d.code ?? code; message = d.message ?? message; }
      else if (typeof d === "string") message = d;
    } catch { /* non-JSON body */ }
    throw new ApiError(res.status, code, message);
  }
  return res.json() as Promise<T>;
}

export function uploadDataset(file: File, onProgress?: (pct: number) => void): Promise<DatasetSummary> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    xhr.open("POST", `${API_URL}/api/datasets/upload`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onerror = () => reject(new ApiError(0, "network", "Upload failed — cannot reach the analysis server."));
    xhr.onload = () => {
      let body: any = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new ApiError(xhr.status, body?.detail?.code ?? "error", body?.detail?.message ?? `Upload failed (${xhr.status}).`));
    };
    xhr.send(form);
  });
}

export interface RunOptions { algorithm?: "auto" | "kmeans" | "agglomerative" | "dbscan"; n_clusters?: number; eps?: number; min_samples?: number }

export const api = {
  health: () => request<{ status: string; llm: LlmStatus }>("/health"),
  sampleInfo: () => request<SampleInfo>("/datasets/sample-info"),
  useSample: () => request<DatasetSummary>("/datasets/sample", { method: "POST" }),
  dataset: (id: string) => request<DatasetSummary>(`/datasets/${id}`),
  deleteDataset: (id: string) => request<{ deleted: boolean }>(`/datasets/${id}`, { method: "DELETE" }),
  profile: (id: string) => request<Profile>(`/datasets/${id}/profile`),
  features: (id: string) => request<FeatureRecommendation>(`/datasets/${id}/features`),
  runAnalysis: (dataset_id: string, numeric: string[], categorical: string[], opts: RunOptions = {}) =>
    request<AnalysisSummary>("/analyses", {
      method: "POST",
      body: JSON.stringify({ dataset_id, numeric_features: numeric, categorical_features: categorical, algorithm: opts.algorithm ?? "auto", ...opts }),
    }),
  analysis: (id: string) => request<AnalysisSummary>(`/analyses/${id}`),
  visualization: (id: string, max = 3000) => request<Visualization>(`/analyses/${id}/visualization?max_points=${max}`),
  segments: (id: string) => request<Insights>(`/analyses/${id}/segments`),
  segment: (id: string, sid: number) => request<Segment & { persona: PersonaResult | null }>(`/analyses/${id}/segments/${sid}`),
  llmStatus: (id: string) => request<LlmStatus>(`/analyses/${id}/llm-status`),
  persona: (id: string, sid: number, regenerate = false) =>
    request<PersonaResult>(`/analyses/${id}/segments/${sid}/persona`, { method: "POST", body: JSON.stringify({ regenerate }) }),
  personaInput: (id: string, sid: number) => request<unknown>(`/analyses/${id}/segments/${sid}/persona/summary`),
  assign: (id: string, records: Record<string, unknown>[]) =>
    request<{ assignments: { segment_id: number; segment_name: string }[]; note: string }>(`/analyses/${id}/assign`, {
      method: "POST", body: JSON.stringify({ records }),
    }),
  reportUrl: (id: string, file: "segments.csv" | "assignments.csv" | "personas.md" | "report.html" | "report.json", download = false) =>
    `${API_URL}/api/analyses/${id}/reports/${file}${download ? "?download=true" : ""}`,
};
