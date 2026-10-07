import { SeverityBadge } from "@/components/shared/severity-badge";
import { TopicBadge } from "@/components/shared/topic-badge";
import type { Prediction } from "@/types/api";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function formatCost(p: Prediction) {
  if (p.costUsd === null) return "Free (local)";
  const tokens =
    p.inputTokens !== null && p.outputTokens !== null ? ` · ${p.inputTokens} in / ${p.outputTokens} out` : "";
  return `$${p.costUsd.toFixed(5)}${tokens}`;
}

/** One model's answer: topic, sensitivity, severity, latency and measured cost. */
export function PredictionCard({ title, subtitle, prediction }: { title: string; subtitle: string; prediction: Prediction }) {
  return (
    <section aria-label={`${title} prediction`} className="panel flex flex-col gap-4 p-5">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-medium tracking-tight">
            {title} <span className="font-normal text-muted-foreground">· {subtitle}</span>
          </h2>
          <p className="font-mono text-xs text-muted-foreground">{prediction.modelVersion}</p>
        </div>
        <SeverityBadge severity={prediction.severity} />
      </header>
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Topic</dt>
          <dd className="mt-1.5">
            <TopicBadge topic={prediction.topic} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Sensitivity</dt>
          <dd className="mt-1.5 font-medium">{capitalize(prediction.sensitivity)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Latency</dt>
          <dd className="mt-1.5 tabular-nums">{prediction.latencyMs} ms</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{prediction.costUsd === null ? "Cost" : "Cost (measured)"}</dt>
          <dd className="mt-1.5 tabular-nums">{formatCost(prediction)}</dd>
        </div>
      </dl>
    </section>
  );
}
