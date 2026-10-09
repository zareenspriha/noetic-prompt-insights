"use client";

// OWNER: F1 (feat/weekly-report)
import { useMemo, useState } from "react";
import { AlertOctagon, FileDown, Lock, MessageSquareText, Printer, Sparkles } from "lucide-react";
import { errorMessage, useWeeklyReport } from "@/lib/api";
import { exportReportCsv } from "@/lib/export";
import { TOPIC_LABEL } from "@/lib/tokens";
import { KpiTile } from "@/components/shared/kpi-tile";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/shared/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ChartCard } from "@/components/shared/chart-card";
import { TrendChart } from "@/components/report/trend-chart";
import { TeamTopicHeatmap } from "@/components/report/team-topic-heatmap";
import { FlagsTable } from "@/components/report/flags-table";
import { DEFAULT_FILTERS, FilterBar, type Filters } from "@/components/report/filter-bar";
import { OwaspBreakdown } from "@/components/report/owasp-breakdown";
import { OWASP, owaspForFlag, type OwaspId } from "@/lib/owasp";

const btn =
  "no-print inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

export default function WeeklyReportPage() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [owasp, setOwasp] = useState<OwaspId | null>(null);
  // Week + model are server-side filters; team/topic/severity filter the loaded report.
  const { data, isLoading, error } = useWeeklyReport({ model: filters.model });

  const weeklyTotals = useMemo(
    () =>
      data
        ? [...new Set(data.trend.map((p) => p.week))].map((w) =>
            // Suppressed (null) cells are left out, so this is a lower bound.
            data.trend.filter((p) => p.week === w).reduce((s, p) => s + (p.count ?? 0), 0),
          )
        : [],
    [data],
  );

  // Flags after team/topic/severity filters; the OWASP card counts these.
  const scoped = useMemo(
    () =>
      (data?.flags ?? []).filter(
        (f) =>
          (!filters.team || f.teamId === filters.team) &&
          (!filters.topic || f.topic === filters.topic) &&
          (!filters.severity || f.severity === filters.severity),
      ),
    [data, filters],
  );
  const flags = useMemo(() => (owasp ? scoped.filter((f) => owaspForFlag(f).includes(owasp)) : scoped), [scoped, owasp]);

  const selectCell = (team: string, topic: (typeof DEFAULT_FILTERS)["topic"]) =>
    setFilters(
      filters.team === team && filters.topic === topic
        ? { ...filters, team: null, topic: null }
        : { ...filters, team, topic },
    );

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow={data ? data.week.replace(/^(\d{4})-W0?(\d+)$/, "Week $2 of $1") : "Weekly report"}
        title="What people used AI for this week"
        description="Topics and risk across every team, from the AI gateway log. Secrets are blacked out and groups under ten prompts are hidden."
      >
        <button type="button" className={btn} disabled={!data} onClick={() => data && exportReportCsv(data, flags)}>
          <FileDown className="size-4" aria-hidden /> CSV
        </button>
        <button type="button" className={btn} disabled={!data} onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden /> PDF
        </button>
      </PageHeader>

      {error ? (
        <EmptyState
          variant="error"
          title="Couldn't load the report"
          message={errorMessage(error)}
        />
      ) : isLoading || !data ? (
        <div className="grid gap-4">
          <Skeleton className="h-16" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-36" />
            ))}
          </div>
          <Skeleton className="h-80" />
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="no-print">
            <FilterBar filters={filters} setFilters={setFilters} teams={data.teams} week={data.week} />
          </div>

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

          <div className="grid gap-4 xl:grid-cols-5">
            <ChartCard
              className="xl:col-span-3"
              title="Top topics per team"
              description="Prompts this week. Click a cell to filter."
            >
              <TeamTopicHeatmap
                cells={data.heatmap}
                teams={data.teams}
                minGroupSize={data.minGroupSize}
                selected={{ team: filters.team, topic: filters.topic }}
                onSelect={selectCell}
              />
            </ChartCard>
            <ChartCard
              className="xl:col-span-2"
              title="Weekly trend"
              description={`${filters.topic ? `${TOPIC_LABEL[filters.topic]}, all teams` : "Prompts by topic"}, last 6 weeks. Gaps are weeks hidden for privacy.`}
            >
              <TrendChart data={data.trend} topic={filters.topic} />
            </ChartCard>
          </div>

          <ChartCard
            title="Risk by OWASP category"
            description="Flags mapped to the OWASP Top 10 for LLM Applications (2025). Severity comes from our rules; OWASP names the type of risk."
          >
            <OwaspBreakdown flags={scoped} selected={owasp} onSelect={setOwasp} />
          </ChartCard>

          <ChartCard
            title="Flagged prompts"
            description={`${flags.length} of ${data.flags.length} flags${filters.team || filters.topic || filters.severity || owasp ? " (filtered)" : ""}${owasp ? `, ${owasp} ${OWASP[owasp].name}` : ""}. Text is redacted; exports leave it out entirely.`}
          >
            {flags.length ? (
              <FlagsTable flags={flags} />
            ) : (
              <EmptyState title="No flags match these filters" message="Try another team, topic or severity." />
            )}
          </ChartCard>
        </div>
      )}
    </div>
  );
}
