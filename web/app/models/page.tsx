"use client";

// OWNER: F2 (feat/model-comparison)
import { useState } from "react";
import { errorMessage, useMetrics } from "@/lib/api";
import { useDemoMode } from "@/lib/demo-mode";
import { TOPIC_LABEL } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { ChartCard } from "@/components/shared/chart-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/shared/skeleton";
import { ScoreTable } from "@/components/models/score-table";
import { PerClassTable } from "@/components/models/per-class-table";
import { ConfusionMatrix } from "@/components/models/confusion-matrix";
import { MODEL_LABEL, headline } from "@/components/models/labels";
import { QualityScatter } from "@/components/models/quality-scatter";
import type { Metrics, ModelId, Topic } from "@/types/api";

type Target = "topic" | "sensitivity";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const formatLabel = (target: Target) => (label: string) =>
  target === "topic" ? (TOPIC_LABEL[label as Topic] ?? label) : capitalize(label);

/** Cohen's kappa in words (Landis & Koch bands), so a reader doesn't need to know the scale. */
function kappaWords(k: number) {
  if (k < 0.2) return "barely better than chance";
  if (k < 0.4) return "fair agreement";
  if (k < 0.6) return "moderate agreement";
  if (k < 0.8) return "substantial agreement";
  return "near-perfect agreement";
}

const pill = (on: boolean) =>
  cn(
    "min-h-9 rounded-lg border px-3 text-sm transition-colors",
    on
      ? "border-primary/55 bg-primary/15 text-accent-foreground"
      : "border-foreground/10 bg-foreground/[0.03] text-foreground/80 hover:bg-foreground/[0.06]",
  );

export default function ModelsPage() {
  const { data, isLoading, error } = useMetrics();

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="Classifier"
        title="Model Comparison"
        description="Every model scored on the same frozen benchmark. Synthetic and public data only, so these are development results, not production accuracy."
      >
        {data && (
          <span
            className="rounded-full border border-foreground/10 bg-foreground/[0.03] px-2.5 py-1 font-mono text-xs text-muted-foreground"
            title={`sha256 ${data.benchmark.sha256}`}
          >
            {data.n} rows · frozen {data.benchmark.frozenAt.slice(0, 10)} · {data.benchmark.sha256.slice(0, 8)}
          </span>
        )}
      </PageHeader>

      {error ? (
        <EmptyState
          variant="error"
          title="Couldn't load the benchmark results"
          message={errorMessage(error)}
        />
      ) : isLoading || !data ? (
        <div className="grid gap-4">
          <Skeleton className="h-56" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
          <Skeleton className="h-96" />
        </div>
      ) : (
        <Results data={data} />
      )}
    </div>
  );
}

function Results({ data }: { data: Metrics }) {
  const [modelId, setModelId] = useState<ModelId>(data.models.find((m) => m.model === "knn")?.model ?? data.models[0].model);
  const [target, setTarget] = useState<Target>("topic");
  const model = data.models.find((m) => m.model === modelId) ?? data.models[0];
  const hasLlm = data.models.some((m) => m.model === "llm");
  const confusion = target === "topic" ? model.topicConfusion : model.sensitivityConfusion;
  const [a, b] = data.agreement.between;
  const { demo } = useDemoMode();

  return (
    <div className="grid gap-4">
      {demo && (
        <div role="alert" className="rounded-xl border border-sev-medium/40 bg-sev-medium/10 px-4 py-3 text-sm text-sev-medium">
          Demo mode: these are placeholder numbers to show the layout, not results. Turn Demo mode off to see real scores.
        </div>
      )}
      <div role="status" className="panel border-primary/25 px-5 py-4">
        <p className="eyebrow mb-1">Headline</p>
        <p className="text-lg leading-snug">{headline(data.models)}</p>
      </div>

      <ChartCard
        title="Headline scores"
        description="Higher is better for F1 and confidential caught. Macro-F1 weights every class equally."
      >
        <ScoreTable models={data.models} />
      </ChartCard>

      <div className="grid gap-4 md:grid-cols-2">
        <section aria-label="Model agreement" className="panel flex flex-col gap-3 p-5">
          <h2 className="font-medium tracking-tight">
            Agreement: {MODEL_LABEL[a]} vs {MODEL_LABEL[b]}
          </h2>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <p>
              <span className="text-3xl font-semibold tabular-nums">{data.agreement.pct.toFixed(1)}%</span>
              <span className="ml-2 text-sm text-muted-foreground">same topic</span>
            </p>
            <p>
              <span className="text-xl font-semibold tabular-nums">κ {data.agreement.cohensKappa.toFixed(2)}</span>
              <span className="ml-2 text-sm text-muted-foreground">{kappaWords(data.agreement.cohensKappa)}</span>
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Cohen&apos;s κ corrects for agreement you&apos;d get by chance. Prompts where the models disagree go to the
            Review Queue.
          </p>
        </section>

        <section aria-label="What is being compared" className="panel flex flex-col gap-3 p-5">
          <h2 className="font-medium tracking-tight">What&apos;s in this comparison</h2>
          <ul className="grid gap-2 text-sm">
            {data.models.map((m) => (
              <li key={m.model} className="flex items-baseline justify-between gap-3">
                <span>{MODEL_LABEL[m.model]}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">{m.modelVersion}</span>
              </li>
            ))}
            {!hasLlm && (
              <li className="flex items-baseline justify-between gap-3 text-muted-foreground">
                <span>LLM zero-shot</span>
                <span className="text-xs">Not scored on the benchmark yet</span>
              </li>
            )}
          </ul>
          <p className="text-sm text-muted-foreground">
            The benchmark mixes paraphrases, hidden secrets, mixed topics, prompt injection and harmless lookalikes. It
            was frozen before tuning and is checksum-locked.
          </p>
        </section>
      </div>

      <ChartCard
        title="Per-class detail"
        description="Where each model gets it right and what it confuses."
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            <div role="group" aria-label="Model" className="flex flex-wrap gap-1.5">
              {data.models.map((m) => (
                <button key={m.model} type="button" aria-pressed={m.model === model.model} onClick={() => setModelId(m.model)} className={pill(m.model === model.model)}>
                  {MODEL_LABEL[m.model]}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Label" className="flex gap-1.5">
              {(["topic", "sensitivity"] as const).map((t) => (
                <button key={t} type="button" aria-pressed={t === target} onClick={() => setTarget(t)} className={pill(t === target)}>
                  {capitalize(t)}
                </button>
              ))}
            </div>
          </div>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <PerClassTable
            rows={target === "topic" ? model.topicPerClass : model.sensitivityPerClass}
            format={formatLabel(target)}
          />
          <ConfusionMatrix labels={confusion.labels} matrix={confusion.matrix} format={formatLabel(target)} />
        </div>
      </ChartCard>

      <ChartCard title="Quality vs cost" description="Topic macro-F1 for each model. Up and to the left is better.">
        <QualityScatter models={data.models} />
      </ChartCard>
    </div>
  );
}
