import type { ModelId, ModelMetrics } from "@/types/api";

export const MODEL_LABEL: Record<ModelId, string> = {
  keyword: "Keyword baseline",
  knn: "kNN (MiniLM embeddings)",
  llm: "LLM zero-shot",
};

export const pct = (n: number) => `${Math.round(n * 100)}%`;
export const f2 = (n: number) => n.toFixed(2);

/** One honest sentence built only from the numbers in the response. */
export function headline(models: ModelMetrics[]): string {
  const by = Object.fromEntries(models.map((m) => [m.model, m])) as Partial<Record<ModelId, ModelMetrics>>;
  const { knn, llm, keyword } = by;
  if (knn && llm && llm.costPer1kUsd) {
    const share = knn.topicMacroF1 / llm.topicMacroF1;
    return `kNN reaches ${pct(share)} of the LLM's topic macro-F1 (${f2(knn.topicMacroF1)} vs ${f2(
      llm.topicMacroF1,
    )}) at no API cost, against $${llm.costPer1kUsd.toFixed(2)} per 1,000 prompts for the LLM.`;
  }
  if (knn && keyword) {
    return `kNN beats the keyword baseline on topic macro-F1 (${f2(knn.topicMacroF1)} vs ${f2(
      keyword.topicMacroF1,
    )}) and catches ${knn.confidentialRecall > keyword.confidentialRecall ? "more" : "as many"} confidential prompts (recall ${pct(
      knn.confidentialRecall,
    )} vs ${pct(keyword.confidentialRecall)}), with no API cost.`;
  }
  return "Scores on the frozen benchmark.";
}
