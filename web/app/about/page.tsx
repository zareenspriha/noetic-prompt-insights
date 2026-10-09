"use client";

// OWNER: F1 (feat/data-trust). Policy text mirrors docs/DATA_GOVERNANCE.md; keep the two in sync.
import { Check, CircleAlert } from "lucide-react";
import { errorMessage, useSources } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { ChartCard } from "@/components/shared/chart-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/shared/skeleton";
import { SourceStats } from "@/components/about/source-stats";
import { OwaspCoverage } from "@/components/about/owasp-coverage";

const PIPELINE = [
  {
    title: "The gateway redacts",
    text: "The AI Gateway (Project 1) logs each request and masks the prompt before it reaches us. Raw prompt text has no field in the contract.",
  },
  {
    title: "We validate the export",
    text: "Strict schema, unknown fields rejected, 2 MB and 1,000-event limits, duplicates removed by event ID, impossible timestamps refused.",
  },
  {
    title: "We classify",
    text: "kNN on sentence embeddings picks the topic. Fixed rules, not a model, decide sensitivity and severity, and secrets are masked again.",
  },
  {
    title: "We publish aggregates",
    text: "A count appears only if it covers at least 10 events and 3 different people. Smaller groups show as hidden.",
  },
];

const PROTECTIONS = [
  "No prompt text, user IDs or event IDs in any summary or export",
  "Counts need ≥ 10 events and ≥ 3 distinct people, otherwise hidden",
  "If one cell is hidden, the next-smallest is hidden too, so totals can't reveal it",
  "Failed and blocked requests are counted but never classified",
  "Real prompt text is refused today: only synthetic=true exports carry text",
  "The gateway token lives in an environment variable and is never written to disk",
  "Paid LLM calls run only after someone switches them on, and only redacted text is sent",
];

const LIMITS = [
  "Comparing overlapping tables (org-wide vs per-team, or consecutive weeks) can sometimes narrow down a hidden cell",
  "Pseudonymous isn't anonymous: whoever runs the gateway can link user and team IDs to people",
  "The flags list shows individual redacted prompts with team and time, so in small teams it can point to a person",
  "Redaction quality depends on the gateway, and names are not detected or masked",
  "Offline exports aren't authenticated, so we can't verify who produced a file",
];

const RETENTION = [
  ["Redacted prompt text", "Until classified, max 30 days", "Deleted; labels kept"],
  ["Event metadata and labels", "90 days", "Deleted"],
  ["Published aggregates", "13 months", "Deleted"],
  ["Consent records", "While active + 1 year after withdrawal", "Deleted"],
];

export default function DataTrustPage() {
  const { data, isLoading, error } = useSources();

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="Governance"
        title="Data & Trust"
        description="Where the data comes from, how it's handled, and what it can't tell you."
      >
      </PageHeader>

      <div className="grid gap-4">
        <ChartCard title="Where the report's events came from" description="Counts only. No text or user IDs leave the importer.">
          {error ? (
            <EmptyState
              variant="error"
              title="Couldn't load import stats"
              message={errorMessage(error)}
            />
          ) : isLoading || !data ? (
            <Skeleton className="h-40" />
          ) : (
            <SourceStats sources={data} />
          )}
        </ChartCard>

        <ChartCard title="How a prompt is handled" description="From the gateway log to the weekly report.">
          <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {PIPELINE.map((step, i) => (
              <li key={step.title} className="rounded-lg bg-foreground/[0.025] p-4">
                <p className="flex items-center gap-2 font-medium">
                  <span className="grid size-6 place-items-center rounded-full bg-primary/15 text-xs text-primary tabular-nums">
                    {i + 1}
                  </span>
                  {step.title}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
              </li>
            ))}
          </ol>
        </ChartCard>

        <ChartCard
          title="OWASP LLM Top 10 coverage"
          description="Which of the ten risks a gateway prompt log can show. We only claim what we can see."
        >
          <OwaspCoverage />
        </ChartCard>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Protections in place" description="Enforced in code and covered by tests.">
            <ul className="grid gap-2.5 text-sm">
              {PROTECTIONS.map((p) => (
                <li key={p} className="flex gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-good" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          </ChartCard>
          <ChartCard title="Known limits" description="Gaps we know about and haven't closed.">
            <ul className="grid gap-2.5 text-sm">
              {LIMITS.map((l) => (
                <li key={l} className="flex gap-2.5">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-sev-medium" aria-hidden />
                  {l}
                </li>
              ))}
            </ul>
          </ChartCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          <ChartCard
            className="lg:col-span-3"
            title="Retention (proposed)"
            description="Team proposal, not legal advice. Must be confirmed before any real data is imported."
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <caption className="sr-only">Proposed retention periods</caption>
                <thead>
                  <tr className="border-b border-foreground/5 text-left text-xs text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">Data</th>
                    <th scope="col" className="px-3 py-2 font-medium">Kept for</th>
                    <th scope="col" className="py-2 pl-3 font-medium">Then</th>
                  </tr>
                </thead>
                <tbody>
                  {RETENTION.map(([what, keep, then]) => (
                    <tr key={what} className="border-b border-foreground/[0.04] last:border-0">
                      <th scope="row" className="py-2.5 pr-3 text-left font-normal">{what}</th>
                      <td className="px-3 py-2.5">{keep}</td>
                      <td className="py-2.5 pl-3 text-muted-foreground">{then}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Required before real data, not built yet: anyone can ask for everything linked to their ID to be deleted,
              including from the review queue and the kNN index, within 30 days.
            </p>
          </ChartCard>

          <section aria-label="What this data can't tell you" className="panel flex flex-col gap-3 p-5 lg:col-span-2">
            <h2 className="font-medium tracking-tight">What this can&apos;t tell you</h2>
            <p className="text-sm text-muted-foreground">
              Topic labels describe text. They can&apos;t show whether someone did their job, broke a policy or leaked a
              secret.
            </p>
            <p className="text-sm text-muted-foreground">
              This data must never be used for performance reviews, discipline or monitoring individuals. Before any
              real text is collected, people must opt in, and declining must have no consequence.
            </p>
            <p className="text-sm text-muted-foreground">
              &quot;Public&quot; means no sensitive pattern was found, not that the text is safe to share.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
