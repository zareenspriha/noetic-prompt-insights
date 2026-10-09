"use client";

// Model Comparison: keyword vs kNN (vs LLM once a key is set) on the frozen benchmark.
import { useState } from "react";
import { Check, Copy, FlaskConical, Handshake } from "lucide-react";
import { errorMessage, useMetrics } from "@/lib/api";
import { useDemoMode } from "@/lib/demo-mode";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/shared/skeleton";
import { ChartCard } from "@/components/shared/chart-card";
import { MetricsTable } from "@/components/models/metrics-table";
import { ConfusionMatrix } from "@/components/models/confusion-matrix";
import { QualityScatter } from "@/components/models/quality-scatter";
import { MODEL_LABEL, headline } from "@/components/models/labels";
import type { ModelId } from "@/types/api";

function Tabs<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
            value === o.value && "bg-primary/15 text-accent-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function ModelsPage() {
  const { data, isLoading, error } = useMetrics();
  const { demo } = useDemoMode();
  const [model, setModel] = useState<ModelId>("knn");
  const [target, setTarget] = useState<"topic" | "sensitivity">("topic");
  const [copied, setCopied] = useState(false);

  const selected = data?.models.find((m) => m.model === model) ?? data?.models[0];
  const llmPending = !!data && !data.models.some((m) => m.model === "llm");
  const copyHash = () => {
    if (!data) return;
    navigator.clipboard?.writeText(data.benchmark.sha256).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="Classifier"
        title="Model Comparison"
        description="Every model scored on the same frozen benchmark it was never tuned on."
      />

      {error ? (
        <EmptyState variant="error" title="Couldn't load metrics" message={errorMessage(error)} />
      ) : isLoading || !data || !selected ? (
        <div className="grid gap-4">
          <Skeleton className="h-16" />
          <Skeleton className="h-56" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
        </div>
      ) : (
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

          <ChartCard title="Scores" description={`Frozen benchmark, ${data.n} prompts. Development results on synthetic data, not production accuracy.`}>
            <MetricsTable models={data.models} llmPending={llmPending} />
          </ChartCard>

          <div className="grid gap-4 md:grid-cols-2">
            <section aria-label="Agreement" className="panel flex gap-4 p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Handshake className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="font-medium tracking-tight">
                  Agreement: {MODEL_LABEL[data.agreement.between[0]]} vs {MODEL_LABEL[data.agreement.between[1]]}
                </h2>
                <p className="mt-1 text-3xl font-semibold tabular-nums">
                  {data.agreement.pct.toFixed(1)}%
                  <span className="ml-3 text-base font-normal text-muted-foreground">Cohen&apos;s κ {data.agreement.cohensKappa.toFixed(2)}</span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Same topic on this share of prompts. κ corrects for chance agreement. Where models disagree, the prompt goes to the Review Queue.
                </p>
              </div>
            </section>
            <section aria-label="Benchmark" className="panel flex gap-4 p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <FlaskConical className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-medium tracking-tight">Frozen benchmark</h2>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Size</dt>
                  <dd className="tabular-nums">{data.benchmark.size} hand-labelled prompts</dd>
                  <dt className="text-muted-foreground">Frozen</dt>
                  <dd>{data.benchmark.frozenAt.slice(0, 10)}</dd>
                  <dt className="text-muted-foreground">SHA-256</dt>
                  <dd className="flex min-w-0 items-center gap-2">
                    <code className="truncate font-mono text-xs" title={data.benchmark.sha256}>
                      {data.benchmark.sha256}
                    </code>
                    <button type="button" onClick={copyHash} aria-label="Copy hash" className="shrink-0 text-muted-foreground hover:text-foreground">
                      {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                    </button>
                  </dd>
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">Tests fail if the file changes, so nobody can tune on it after seeing results.</p>
              </div>
            </section>
          </div>

          <div className="grid gap-4 xl:grid-cols-5">
            <ChartCard
              className="xl:col-span-3"
              title="Confusion matrix"
              description="Where each model gets labels wrong."
              actions={
                <div className="flex flex-wrap justify-end gap-2">
                  <Tabs
                    label="Model"
                    value={selected.model}
                    onChange={setModel}
                    options={data.models.map((m) => ({ value: m.model, label: m.model === "knn" ? "kNN" : m.model === "llm" ? "LLM" : "Keyword" }))}
                  />
                  <Tabs
                    label="Label"
                    value={target}
                    onChange={setTarget}
                    options={[
                      { value: "topic", label: "Topic" },
                      { value: "sensitivity", label: "Sensitivity" },
                    ]}
                  />
                </div>
              }
            >
              <ConfusionMatrix
                key={`${selected.model}-${target}`}
                labels={target === "topic" ? selected.topicConfusion.labels : selected.sensitivityConfusion.labels}
                matrix={target === "topic" ? selected.topicConfusion.matrix : selected.sensitivityConfusion.matrix}
              />
            </ChartCard>
            <ChartCard className="xl:col-span-2" title="Quality vs cost" description="Topic macro-F1 for each model.">
              <QualityScatter models={data.models} />
            </ChartCard>
          </div>
        </div>
      )}
    </div>
  );
}
