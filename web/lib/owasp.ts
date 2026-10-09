import type { Flag, RiskSpan } from "@/types/api";

/** OWASP Top 10 for LLM Applications, 2025 (genai.owasp.org/llm-top-10).
 *  OWASP names categories; it does not rank severity. Severity stays our own rules
 *  (critical / high / medium / low); this file only says which category a finding belongs to. */
export type OwaspId =
  | "LLM01" | "LLM02" | "LLM03" | "LLM04" | "LLM05"
  | "LLM06" | "LLM07" | "LLM08" | "LLM09" | "LLM10";

export type Coverage = "detected" | "partial" | "not_yet" | "out_of_scope";

export const OWASP: Record<OwaspId, { name: string; short: string; coverage: Coverage; how: string }> = {
  LLM01: { name: "Prompt Injection", short: "Prompt Injection", coverage: "detected", how: "Injection phrases in the prompt, such as “ignore previous instructions” or “you are now…”." },
  LLM02: { name: "Sensitive Information Disclosure", short: "Sensitive Info", coverage: "detected", how: "Keys, passwords, SSNs, card numbers, salaries, emails and phone numbers in the prompt, plus prompts labelled confidential or internal." },
  LLM03: { name: "Supply Chain", short: "Supply Chain", coverage: "out_of_scope", how: "About models, packages and vendors, not anything in a prompt." },
  LLM04: { name: "Data and Model Poisoning", short: "Poisoning", coverage: "out_of_scope", how: "Happens in training or fine-tuning data, which a gateway log never sees." },
  LLM05: { name: "Improper Output Handling", short: "Output Handling", coverage: "out_of_scope", how: "Needs the model's responses and what the app does with them. We only see prompts." },
  LLM06: { name: "Excessive Agency", short: "Excessive Agency", coverage: "not_yet", how: "Needs tool-call data. The gateway's policy actions could support it later." },
  LLM07: { name: "System Prompt Leakage", short: "System Prompt Leakage", coverage: "partial", how: "Attempts to extract the system prompt (“print your system prompt”). Whether it actually leaked needs the response." },
  LLM08: { name: "Vector and Embedding Weaknesses", short: "Vector & Embedding", coverage: "out_of_scope", how: "About RAG stores and embeddings behind the app, not the prompt." },
  LLM09: { name: "Misinformation", short: "Misinformation", coverage: "out_of_scope", how: "Needs the model's answers and a fact check." },
  LLM10: { name: "Unbounded Consumption", short: "Unbounded Consumption", coverage: "not_yet", how: "Detectable from the gateway's token and cost fields; needs a backend check for unusual usage." },
};

export const OWASP_IDS = Object.keys(OWASP) as OwaspId[];

export const COVERAGE_LABEL: Record<Coverage, string> = {
  detected: "Detected",
  partial: "Attempts only",
  not_yet: "Not yet",
  out_of_scope: "Not visible in prompts",
};

const LEAK = /\b(system|initial|hidden|developer)\s+prompt\b|\byour\s+(instructions|rules|guidelines)\b/i;

/** Injection that tries to get the system prompt out is LLM07; any other injection is LLM01. */
const injectionCategory = (text: string): OwaspId => (LEAK.test(text) ? "LLM07" : "LLM01");

/** Categories for a flag, from the backend's reason text (e.g. "API key pattern, email address"). */
export function owaspForFlag(flag: Pick<Flag, "reason" | "textRedacted">): OwaspId[] {
  const parts = flag.reason
    .split(/,|\+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const ids = new Set<OwaspId>();
  for (const part of parts) ids.add(/inject/i.test(part) ? injectionCategory(flag.textRedacted) : "LLM02");
  return sortIds(ids);
}

/** Category for one risky span on the Classify page. */
export function owaspForSpan(kind: RiskSpan["kind"], text: string): OwaspId {
  return kind === "injection" ? injectionCategory(text) : "LLM02";
}

const sortIds = (ids: Iterable<OwaspId>) => [...ids].sort();
