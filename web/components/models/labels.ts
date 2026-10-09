import type { ModelId } from "@/types/api";

export const MODEL_LABEL: Record<ModelId, string> = {
  keyword: "Keyword baseline",
  knn: "kNN (embeddings)",
  llm: "LLM zero-shot",
};
