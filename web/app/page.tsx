"use client";

// OWNER: F1 (feat/weekly-report). KPIs, trend and a flags preview are wired to mocks.
// TODO: team × topic heatmap, full flags table, filters (date/team/topic/model), PDF/CSV export.
import { AlertOctagon, Download, Lock, MessageSquareText, Sparkles } from "lucide-react";
import { useWeeklyReport } from "@/lib/api";
import { TOPIC_LABEL } from "@/lib/tokens";
import { SEVERITIES } from "@/types/api";
import { KpiTile } from "@/components/shared/kpi-tile";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/shared/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ChartCard } from "@/components/shared/chart-card";
import { SeverityBadge } from "@/components/shared/severity-badge";
import { TrendChart } from "@/components/report/trend-chart";

export default function WeeklyReportPage() {
  const { data, isLoading, error } = useWeeklyReport();

  const weeklyTotals = data
    ? [...new Set(data.trend.map((p) => p.week))].map((w) =>
        data.trend.filter((p) => p.week === w).reduce((s, p) => s + p.count, 0),
      )
    : [];
  const topFlags = data
    ? [...data.flags].sort((a, b) => SEVERITIES.indexOf(b.severity) - SEVERITIES.indexOf(a.severity)).slice(0, 5)
    : [];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow={data ? `Week ${data.week}` : "Weekly report"}
        title="What people used AI for this week"
        description="Topics and risk across every team, from the AI gateway log. No prompt text leaves the pipeline unredacted."
      >
        {data?.synthetic && (
          <span className="rounded-full border border-sev-medium/30 bg-sev-medium/10 px-2.5 py-1 text-xs text-sev-medium">
            Synthetic data
          </span>
        )}
        <button
          type="button"
          disabled
          title="Coming soon"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-muted-foreground disabled:cursor-not-allowed"
        >
          <Download className="size-4" aria-hidden /> Export
        </button>
      </PageHeader>

      {error ? (
        <EmptyState variant="error" title="Couldn't load the report" message={String(error)} />
      ) : isLoading || !data ? (
        <div className="grid gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-36" />
            ))}
          </div>
          <Skeleton className="h-80" />
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile
              label="Total prompts"
              icon={MessageSquareText}
              value={data.kpis.totalPrompts.value}
              prev={data.kpis.totalPrompts.prevValue}
              spark={weeklyTotals}
            />
            <KpiTile
              label="Confidential"
              icon={Lock}
              value={data.kpis.pctConfidential.value}
              prev={data.kpis.pctConfidential.prevValue}
              format={(n) => `${n.toFixed(1)}%`}
              goodWhen="down"
            />
            <KpiTile
              label="Top topic"
              icon={Sparkles}
              value={0}
              prev={null}
              display={TOPIC_LABEL[data.kpis.topTopic.value]}
              note={data.kpis.topTopic.prevValue ? `Last week: ${TOPIC_LABEL[data.kpis.topTopic.prevValue]}` : undefined}
            />
            <KpiTile
              label="Critical flags"
              icon={AlertOctagon}
              value={data.kpis.criticalFlags.value}
              prev={data.kpis.criticalFlags.prevValue}
              goodWhen="down"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <ChartCard
              className="lg:col-span-3"
              title="Weekly trend"
              description="Prompt volume by topic, last 6 weeks"
            >
              <TrendChart data={data.trend} />
            </ChartCard>

            <ChartCard className="lg:col-span-2" title="Highest-risk flags" description="Redacted, sorted by severity">
              <ul className="grid gap-2">
                {topFlags.map((f) => (
                  <li key={f.eventId} className="min-w-0 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                    <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <SeverityBadge severity={f.severity} />
                      <span>{f.teamId}</span>
                      <span aria-hidden>·</span>
                      <span>{TOPIC_LABEL[f.topic]}</span>
                      <span className="ml-auto">{f.reason}</span>
                    </div>
                    <p className="truncate font-mono text-xs text-foreground/80" title={f.textRedacted}>{f.textRedacted}</p>
                  </li>
                ))}
              </ul>
            </ChartCard>
          </div>

          <EmptyState
            variant="building"
            title="Team × topic heatmap"
            message={`Groups under ${data.minGroupSize} prompts will show as "insufficient data".`}
          />
        </div>
      )}
    </div>
  );
}
