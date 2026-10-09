import { cn } from "@/lib/utils";
import type { ModelMetrics } from "@/types/api";
import { MODEL_LABEL, f2, pct } from "./labels";

type Col = {
  label: string;
  hint: string;
  get: (m: ModelMetrics) => number | null;
  show: (v: number | null) => string;
  higherIsBetter: boolean;
};

const COLS: Col[] = [
  { label: "Topic macro-F1", hint: "Average F1 over the 7 topics", get: (m) => m.topicMacroF1, show: (v) => f2(v!), higherIsBetter: true },
  { label: "Sensitivity macro-F1", hint: "Average F1 over public / internal / confidential", get: (m) => m.sensitivityMacroF1, show: (v) => f2(v!), higherIsBetter: true },
  { label: "Confidential recall", hint: "Share of confidential prompts caught. The safety metric.", get: (m) => m.confidentialRecall, show: (v) => pct(v!), higherIsBetter: true },
  { label: "Confidential missed", hint: "False negatives: leaks the model did not flag", get: (m) => m.confidentialFalseNegatives, show: (v) => String(v), higherIsBetter: false },
  { label: "Cost / 1k prompts", hint: "Measured API cost. Local models have none.", get: (m) => m.costPer1kUsd, show: (v) => (v === null ? "$0 (local)" : `$${v.toFixed(2)}`), higherIsBetter: false },
  { label: "p50 latency", hint: "Median time per prompt on the machine that ran /metrics", get: (m) => m.p50LatencyMs, show: (v) => `${v! < 1 ? v!.toFixed(2) : v!.toFixed(1)} ms`, higherIsBetter: false },
];

export function MetricsTable({ models, llmPending }: { models: ModelMetrics[]; llmPending: boolean }) {
  const best = (c: Col) => {
    const vals = models.map((m) => c.get(m) ?? (c.label.startsWith("Cost") ? 0 : null)).filter((v): v is number => v !== null);
    return c.higherIsBetter ? Math.max(...vals) : Math.min(...vals);
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <caption className="sr-only">Quality, safety, cost and speed for each model on the frozen benchmark</caption>
        <thead>
          <tr className="border-b border-white/5">
            <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Model</th>
            {COLS.map((c) => (
              <th key={c.label} scope="col" title={c.hint} className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.model} className="border-b border-white/[0.04]">
              <th scope="row" className="px-3 py-3 text-left font-medium">
                {MODEL_LABEL[m.model]}
                <span className="block font-mono text-[11px] font-normal text-muted-foreground">{m.modelVersion}</span>
              </th>
              {COLS.map((c) => {
                const v = c.get(m);
                const isBest = models.length > 1 && (v ?? (c.label.startsWith("Cost") ? 0 : null)) === best(c);
                return (
                  <td key={c.label} className={cn("px-3 py-3 text-right tabular-nums", isBest && "font-semibold text-primary")}>
                    {c.show(v)}
                  </td>
                );
              })}
            </tr>
          ))}
          {llmPending && (
            <tr>
              <th scope="row" className="px-3 py-3 text-left font-medium text-muted-foreground">
                {MODEL_LABEL.llm}
                <span className="block text-[11px] font-normal">Pending: runs once an API key is set</span>
              </th>
              {COLS.map((c) => (
                <td key={c.label} className="px-3 py-3 text-right text-muted-foreground">
                  —
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
      <p className="mt-2 px-3 text-xs text-muted-foreground">Best value in each column is highlighted. Hover a column title for what it means.</p>
    </div>
  );
}
