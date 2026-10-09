"use client";

// OWNER: F1. Data & Trust: where data comes from, how it is classified, privacy rules and limits.
// Content mirrors docs/DATA_GOVERNANCE.md and docs/EVALUATION.md; keep them in sync.
import { ArrowRight, Ban, CircleCheck, CircleDashed, Database, FileText, ExternalLink, Filter, PlugZap, ShieldCheck, Tags } from "lucide-react";
import { errorMessage, useSources } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/shared/skeleton";
import { ChartCard } from "@/components/shared/chart-card";

const STEPS = [
  { icon: PlugZap, title: "Import", text: "Gateway events are validated against the shared contract. Unknown fields, bad timestamps and oversized files are rejected." },
  { icon: Filter, title: "Filter", text: "Duplicates are dropped. Failed and blocked requests are counted but never classified." },
  { icon: Tags, title: "Classify", text: "kNN over MiniLM embeddings picks the topic and shows the 5 examples behind it. Risk rules find keys, passwords and personal data, mask them, and set severity." },
  { icon: ShieldCheck, title: "Report", text: "Only aggregates reach the report. Small groups are hidden. Flags show redacted text only." },
];

const RULES = [
  "A count is shown only if it covers at least 10 prompts from at least 3 different people. Otherwise it reads “insufficient data”.",
  "If exactly one cell in a table is hidden, the next-smallest is hidden too, so it can’t be worked out by subtraction.",
  "Filters that narrow the report below those thresholds are refused, not answered.",
  "Secrets and personal data (API keys, passwords, emails, phone numbers, card numbers, SSNs, salaries) are masked before display.",
  "CSV exports contain counts and flag metadata only, never prompt text.",
  "Human corrections store labels only, never the prompt.",
  "Paid LLM calls happen only after someone switches them on, and only redacted text is sent.",
];

const LIMITS = [
  "All data is synthetic or public (Dolly-15k). No real employee prompts were used.",
  "The benchmark is small: 70 prompts, 19 confidential. One prompt moves recall by about 5 points.",
  "Risk rules catch secrets with a recognisable shape. Business secrets in plain prose (layoffs, acquisitions) are mostly missed.",
  "Names are not detected, so they stay visible after redaction.",
  "Similarity scores are not confidence. “Other” is a topic, not an uncertainty score.",
  "Topic labels describe text. They can’t show whether someone did their job, broke a policy or leaked a secret, and must not be used to judge people.",
  "Flags are event-level. In a small team, team plus time can point to a person, so access to flags should be narrower than access to aggregates.",
];

const RETENTION = [
  ["Redacted prompt text", "Until classified, max 30 days"],
  ["Event metadata + labels", "90 days"],
  ["Published aggregates", "13 months"],
  ["Gateway token", "Environment variable only, never written to disk"],
];

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="panel p-4" title={hint}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{value.toLocaleString()}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export default function DataTrustPage() {
  const { data, isLoading, error } = useSources();

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="Governance"
        title="Data & Trust"
        description="Where the data comes from, how it is classified, what is hidden, and what this tool can't tell you."
      />

      <div className="grid gap-4">
        {error ? (
          <EmptyState variant="error" title="Couldn't load import stats" message={errorMessage(error)} />
        ) : isLoading || !data ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <Stat label="Received" value={data.received} hint="Events in the import" />
              <Stat label="Duplicates dropped" value={data.deduped} hint="Repeats of the same event ID" />
              <Stat label="Failed" value={data.failed} hint="Counted, never classified" />
              <Stat label="Blocked" value={data.blocked} hint="Counted, never classified" />
              <Stat label="Classified" value={data.classified} hint="Succeeded and had redacted text" />
            </div>

            <section aria-label="Gateway connection" className="panel flex flex-wrap items-center gap-4 p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Database className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="flex items-center gap-2 font-medium tracking-tight">
                  <span className={data.gateway.connected ? "size-2 rounded-full bg-emerald-400" : "size-2 rounded-full bg-sev-medium"} aria-hidden />
                  {data.gateway.connected ? "Connected to the Project 1 AI Gateway" : "Reading a gateway export file"}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {data.gateway.connected
                    ? `Live from ${data.gateway.url}.`
                    : "The gateway's GET /events returns metadata only, so prompt text comes from its synthetic NDJSON export."}
                  {data.gateway.lastImportAt && ` Export file dated ${new Date(data.gateway.lastImportAt).toLocaleString()}.`}
                </p>
              </div>
              {data.project1DashboardUrl ? (
                <a
                  href={data.project1DashboardUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
                >
                  Open Project 1 dashboard <ExternalLink className="size-3.5" aria-hidden />
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">Set PI_PROJECT1_URL on the backend to link the Project 1 dashboard.</span>
              )}
            </section>
          </>
        )}

        <ChartCard title="How it works" description="From gateway log to weekly report.">
          <ol className="grid gap-3 md:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="relative rounded-lg border border-white/5 bg-white/[0.02] p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="font-medium">
                    {i + 1}. {title}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{text}</p>
                {i < STEPS.length - 1 && (
                  <ArrowRight className="absolute top-1/2 -right-3 hidden size-4 -translate-y-1/2 text-primary/60 md:block" aria-hidden />
                )}
              </li>
            ))}
          </ol>
        </ChartCard>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Privacy rules" description="Enforced in code and covered by tests.">
            <ul className="grid gap-2 text-sm">
              {RULES.map((r) => (
                <li key={r} className="flex gap-2">
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
                  {r}
                </li>
              ))}
            </ul>
          </ChartCard>
          <ChartCard title="Known limits" description="Read these before trusting any number.">
            <ul className="grid gap-2 text-sm">
              {LIMITS.map((l) => (
                <li key={l} className="flex gap-2">
                  <Ban className="mt-0.5 size-4 shrink-0 text-sev-high" aria-hidden />
                  {l}
                </li>
              ))}
            </ul>
          </ChartCard>
        </div>

        <ChartCard title="Before real prompts" description="Proposed retention and consent requirements. Not yet in place; this build only uses synthetic and public data.">
          <div className="grid gap-4 md:grid-cols-2">
            <table className="w-full text-sm">
              <caption className="sr-only">Proposed retention periods</caption>
              <tbody>
                {RETENTION.map(([what, when]) => (
                  <tr key={what} className="border-b border-white/[0.04] last:border-0">
                    <th scope="row" className="py-2 pr-4 text-left font-normal text-muted-foreground">
                      {what}
                    </th>
                    <td className="py-2">{when}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="grid content-start gap-2 text-sm">
              {[
                "Opt-in consent per person, revocable any time, with no consequence for declining",
                "Per-person deletion within 30 days, including the kNN index and review queue",
                "A consent check at import before any real prompt text is accepted",
              ].map((t) => (
                <li key={t} className="flex gap-2 text-muted-foreground">
                  <CircleDashed className="mt-0.5 size-4 shrink-0 text-primary/70" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="size-3" aria-hidden /> Full details in docs/DATA_GOVERNANCE.md
          </p>
        </ChartCard>
      </div>
    </div>
  );
}
