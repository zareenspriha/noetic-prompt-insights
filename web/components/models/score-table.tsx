import type { ModelMetrics } from "@/types/api";
import { MODEL_LABEL } from "./labels";
import { ScoreBar } from "./score-bar";

function cost(m: ModelMetrics) {
  if (m.costPer1kUsd !== null) return `$${m.costPer1kUsd.toFixed(3)}`;
  return m.model === "llm" ? "Not measured" : "Free (local)";
}

function latency(ms: number) {
  return ms < 1 ? `${ms.toFixed(2)} ms` : `${Math.round(ms).toLocaleString()} ms`;
}

/** One row per model, same frozen benchmark for all of them. */
export function ScoreTable({ models }: { models: ModelMetrics[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <caption className="sr-only">Benchmark scores per model</caption>
        <thead>
          <tr className="border-b border-foreground/5 text-left text-xs text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-medium">Model</th>
            <th scope="col" className="px-3 py-2 font-medium">Topic macro-F1</th>
            <th scope="col" className="px-3 py-2 font-medium">Sensitivity macro-F1</th>
            <th scope="col" className="px-3 py-2 font-medium">Confidential caught</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">p50 latency</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Cost / 1k prompts</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => {
            const total =
              m.sensitivityPerClass.find((c) => c.label === "confidential")?.support ??
              m.confidentialFalseNegatives;
            const caught = total - m.confidentialFalseNegatives;
            return (
              <tr key={m.model} className="border-b border-foreground/[0.04] last:border-0">
                <th scope="row" className="px-3 py-3 text-left align-middle font-normal">
                  <span className="block font-medium">{MODEL_LABEL[m.model]}</span>
                  <span className="block font-mono text-xs text-muted-foreground">{m.modelVersion}</span>
                </th>
                <td className="px-3 py-3">
                  <ScoreBar value={m.topicMacroF1} label="Topic macro-F1" />
                </td>
                <td className="px-3 py-3">
                  <ScoreBar value={m.sensitivityMacroF1} label="Sensitivity macro-F1" />
                </td>
                <td className="px-3 py-3">
                  <ScoreBar value={m.confidentialRecall} label="Confidential recall" note={`${caught} of ${total}`} />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {caught} of {total} caught · <span className="text-foreground/80">{m.confidentialFalseNegatives} missed</span>
                  </span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{latency(m.p50LatencyMs)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{cost(m)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
