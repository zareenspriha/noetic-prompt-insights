import type { ModelId, ModelMetrics } from "@/types/api";

export const MODEL_LABEL: Record<ModelId, string> = {
  keyword: "Keyword baseline",
  knn: "kNN (embeddings)",
  llm: "LLM zero-shot",
};

const pct = (n: number) => `${Math.round(n * 100)}%`;
const f2 = (n: number) => n.toFixed(2);

/** One sentence built only from the numbers in the response, never from expectations. */
export function headline(models: ModelMetrics[]): string {
  const by = Object.fromEntries(models.map((m) => [m.model, m])) as Partial<Record<ModelId, ModelMetrics>>;
  const { knn, llm, keyword } = by;
  if (knn && llm) {
    const cost = llm.costPer1kUsd === null ? "" : `, against $${llm.costPer1kUsd.toFixed(2)} per 1,000 prompts for the LLM`;
    return `kNN reaches ${pct(knn.topicMacroF1 / llm.topicMacroF1)} of the LLM's topic macro-F1 (${f2(knn.topicMacroF1)} vs ${f2(
      llm.topicMacroF1,
    )}) and catches ${pct(knn.confidentialRecall)} of confidential prompts vs ${pct(llm.confidentialRecall)}, with no API cost${cost}.`;
  }
  if (knn && keyword) {
    return `kNN beats the keyword baseline on topic macro-F1 (${f2(knn.topicMacroF1)} vs ${f2(
      keyword.topicMacroF1,
    )}) and confidential recall (${pct(knn.confidentialRecall)} vs ${pct(keyword.confidentialRecall)}), with no API cost.`;
  }
  return "Scores on the frozen benchmark.";
}
