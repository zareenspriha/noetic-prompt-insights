// Shared API contract (DRAFT). Frontend and FastAPI must match this file.
// Change it only in its own small PR, merged before anything that depends on it.

export const TOPICS = [
  "coding", "writing", "data_analysis", "customer_email", "legal", "hr", "other",
] as const;
export type Topic = (typeof TOPICS)[number];

export const SENSITIVITIES = ["public", "internal", "confidential"] as const;
export type Sensitivity = (typeof SENSITIVITIES)[number];

// critical = credentials/keys, high = customer PII or confidential legal/HR,
// medium = internal, low = public. Computed by our rules, never by the LLM.
export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export type ModelId = "keyword" | "knn" | "llm";

/** A risky span found by the regex layer. Offsets index into the redacted text. */
export interface RiskSpan {
  start: number;
  end: number;
  kind: "api_key" | "password" | "email" | "phone" | "ssn" | "salary" | "card" | "injection";
}

export interface Neighbor {
  id: string;
  textRedacted: string;
  topic: Topic;
  sensitivity: Sensitivity;
  /** Cosine similarity. NOT a probability; never render as "% confident". */
  similarity: number;
}

export interface Prediction {
  model: ModelId;
  topic: Topic;
  sensitivity: Sensitivity;
  severity: Severity;
  latencyMs: number;
  /** null for local models; measured from provider usage for the LLM. */
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  modelVersion: string; // e.g. "all-MiniLM-L6-v2+k5", "claude-…", "bart-large-mnli"
}

// ---------- POST /classify ----------
export interface ClassifyRequest {
  text: string;
  /** Must be true before any paid LLM call. Default false → kNN only. */
  allowLlm: boolean;
}
export interface ClassifyResponse {
  knn: Prediction & { neighbors: Neighbor[] };
  llm: Prediction | null;           // null when allowLlm=false
  agree: boolean | null;            // null when llm is null
  needsReview: boolean;             // disagreement → human review
  riskSpans: RiskSpan[];
  textRedacted: string;
  /** Estimated LLM cost shown in the consent toggle before calling. */
  llmCostEstimateUsd: number;
}

// ---------- GET /report/weekly?week=YYYY-Www&team=&topic=&model= ----------
export interface KpiDelta {
  value: number;
  prevValue: number | null; // null if no previous week
}
export interface TeamTopicCell {
  teamId: string;
  topic: Topic;
  count: number | null;     // null = suppressed (group < MIN_GROUP_SIZE)
}
export interface TrendPoint {
  week: string;             // ISO week, e.g. "2026-W40"
  topic: Topic;
  count: number | null;     // null = suppressed, same rule as the heatmap
}
export interface Flag {
  eventId: string;
  timestamp: string;        // ISO, Z
  teamId: string;
  topic: Topic;
  sensitivity: Sensitivity;
  severity: Severity;
  reason: string;           // e.g. "API key pattern", "salary figure"
  textRedacted: string;     // secrets masked; never raw text
}
export interface WeeklyReport {
  week: string;
  minGroupSize: number;     // 10
  kpis: {
    totalPrompts: KpiDelta;
    pctConfidential: KpiDelta;
    criticalFlags: KpiDelta;
    topTopic: { value: Topic; prevValue: Topic | null };
  };
  heatmap: TeamTopicCell[];
  trend: TrendPoint[];
  flags: Flag[];
  teams: string[];
  synthetic: boolean;       // true → show "synthetic data" banner
}

// ---------- GET /review ----------
export interface ReviewItem {
  id: string;
  textRedacted: string;
  knn: Prediction;
  llm: Prediction | null;
  reason: "disagreement" | "low_similarity" | "flagged";
}

// ---------- POST /feedback ----------
export interface Correction {
  itemId: string;
  topic: Topic;
  sensitivity: Sensitivity;
}
export interface FeedbackResponse {
  ok: boolean;
  indexSize: number;        // kNN index size after append
  correctionsTotal: number;
  undoToken: string;        // POST /feedback/undo { undoToken }
}

// ---------- GET /metrics ----------
export interface ClassMetrics {
  label: string;
  precision: number;
  recall: number;
  f1: number;
  support: number;
}
export interface ModelMetrics {
  model: ModelId;
  modelVersion: string;
  topicMacroF1: number;
  sensitivityMacroF1: number;
  confidentialRecall: number;
  confidentialFalseNegatives: number;
  topicPerClass: ClassMetrics[];
  sensitivityPerClass: ClassMetrics[];
  topicConfusion: { labels: Topic[]; matrix: number[][] };       // rows=true, cols=pred
  sensitivityConfusion: { labels: Sensitivity[]; matrix: number[][] };
  costPer1kUsd: number | null;
  p50LatencyMs: number;
}
export interface Metrics {
  evalSet: "validation" | "benchmark";
  n: number;
  models: ModelMetrics[];
  agreement: { pct: number; cohensKappa: number; between: [ModelId, ModelId] };
  benchmark: { size: number; sha256: string; frozenAt: string };
}

// ---------- GET /sources ----------
export interface Sources {
  received: number;
  deduped: number;
  failed: number;
  blocked: number;
  classified: number;       // succeeded only; failed/blocked are never classified
  gateway: { connected: boolean; url: string | null; lastImportAt: string | null };
  project1DashboardUrl: string | null;
}
