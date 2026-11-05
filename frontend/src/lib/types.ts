export interface DatasetSummary {
  dataset_id: string; name: string; source: "sample" | "upload"; kind: "customer" | "transaction";
  rows: number; columns: number; id_column: string | null;
  derivations: { feature: string; formula: string; meaning: string }[];
  cleaning: { step: string; detail: string }[];
}

export interface SampleInfo { name: string; rows: number; columns: number; description: string; source: string; license: string }

export interface ColumnProfile {
  name: string; kind: string; role: string | null; role_description: string | null;
  missing: number; missing_pct: number; unique: number;
  mean?: number; std?: number; min?: number | string; median?: number; max?: number | string; q1?: number; q3?: number;
  skew?: number; outliers?: number;
  histogram?: { start: number; end: number; count: number }[];
  top_values?: { value: string; count: number; pct: number }[];
}

export interface Profile {
  dataset: { name: string; kind: string; rows: number; columns: number; raw_rows: number; raw_columns: number; id_column: string | null };
  summary: { by_kind: Record<string, number>; total_missing: number; duplicate_rows_excluding_id: number; quality_score: number };
  columns: ColumnProfile[];
  notes: { level: "info" | "warning"; column: string | null; message: string }[];
  cleaning: { step: string; detail: string }[];
  derivations: { feature: string; formula: string; meaning: string }[];
  behaviour: {
    metrics: { label: string; value: number; column: string }[];
    lifetime_value: { label: string; value: number; note: string } | null;
    rfm: { available: boolean; recency?: string; frequency?: string; monetary?: string; source?: string; explanation: Record<string, string> | string };
  };
  preview: { columns: string[]; rows: (string | number | null)[][] };
}

export interface FeatureItem { name: string; kind: string; role: string | null; usable: boolean; selected: boolean; type: "numeric" | "categorical"; reason: string | null }
export interface FeatureRecommendation { features: FeatureItem[]; recommended: string[]; steps: { step: string; how: string; why: string }[] }

export interface Metrics {
  n_clusters: number; noise_share: number | null; sizes: Record<string, number>; min_cluster_share: number | null;
  silhouette: number | null; davies_bouldin: number | null; calinski_harabasz: number | null; inertia?: number; stability?: number;
}
export interface Candidate { algorithm: string; params: Record<string, number | string>; metrics: Metrics; valid?: boolean; rejected_because?: string | null; score?: number | null }

export interface AnalysisSummary {
  analysis_id: string; dataset_id: string; created_at: string; runtime_seconds: number;
  features: { numeric: string[]; categorical: string[]; encoded: string[] };
  model: { algorithm: string; params: Record<string, number | string>; selected_automatically: boolean; assignment_note: string };
  metrics: Metrics;
  comparison: { candidates: Candidate[]; elbow: { k: number; inertia: number }[]; elbow_k: number | null;
    recommended: { algorithm: string; params: Record<string, number | string> }; explanation: string[] };
  projection: { axes: Axis[]; explained_total: number; method: string; note: string };
  segments: { id: number; statistical_name: string; size: number; share: number; is_noise: boolean }[];
}

export interface Axis { axis: string; component: string; explained_variance: number; top_loadings: { feature: string; loading: number }[] }

export interface Visualization {
  points: { i: number; x: number; y: number; z: number; s: number; v: (number | string | null)[]; id?: string }[];
  fields: string[]; id_field: string | null; total: number; shown: number;
  centroids: { segment: number; x: number; y: number; z: number }[];
  axes: Axis[]; explained_total: number; method: string; note: string;
  segments: { id: number; name: string; size: number; share: number; is_noise: boolean }[];
}

export interface SegFeature { feature: string; label: string; role: string | null; selected: boolean; segment_mean: number; segment_median: number; overall_mean: number; z: number }
export interface Recommendation { title: string; action: string; category: string; why: string[]; kind: string; priority: string }
export interface Segment {
  id: number; is_noise: boolean; statistical_name: string; size: number; share: number;
  features: SegFeature[]; distinguishing: SegFeature[];
  categorical: { feature: string; label: string; top_value: string; segment_share: number; overall_share: number }[];
  product_mix: { category: string; feature: string; segment_share: number; overall_share: number; lift: number | null }[];
  recommendations: Recommendation[]; opportunities: string[]; risks: string[]; persona_name?: string | null;
}
export interface Insights {
  segments: Segment[];
  value_rank: { metric: string; column: string; order: number[] } | null;
  frequency_rank: { metric: string; column: string; order: number[] } | null;
  comparison: { features: { feature: string; label: string }[]; rows: { segment: number; values: number[]; means: number[] }[] };
  stats_note: string;
}

export interface Claim { text: string; basis: "observed" | "hypothesis" }
export interface PersonaBody {
  persona_name: string; segment_overview: string; customer_characteristics: Claim[]; behavioral_patterns: Claim[];
  purchasing_habits: string | null; spending_behavior: string | null; engagement_patterns: string | null;
  needs_and_preferences: Claim[]; motivations: Claim[]; pain_points: Claim[]; product_interests: Claim[];
  marketing_approach: string; communication_style: string; suggested_offers: string[];
  evidence_summary: { claim: string; feature: string; statistic: string }[];
}
export interface PersonaResult { segment_id: number; persona: PersonaBody; source: "llm"; provider: string; model: string; generated_at: string; input_summary: unknown; cached: boolean }
export interface LlmStatus { configured: boolean; provider: string | null; model: string | null }
