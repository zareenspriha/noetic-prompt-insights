"use client";

import { RotateCcw } from "lucide-react";
import { TOPIC_LABEL, SEVERITY_LABEL } from "@/lib/tokens";
import { SEVERITIES, TOPICS, type Severity, type Topic } from "@/types/api";

export type Filters = {
  model: "knn" | "keyword" | "llm";
  team: string | null;
  topic: Topic | null;
  severity: Severity | null;
};
export const DEFAULT_FILTERS: Filters = { model: "knn", team: null, topic: null, severity: null };

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  allLabel,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T | null) => void;
  allLabel?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select
        value={value ?? ""}
        onChange={(e) => onChange((e.target.value || null) as T | null)}
        className="h-9 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {allLabel && <option value="">{allLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FilterBar({
  filters,
  setFilters,
  teams,
  week,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  teams: string[];
  week: string;
}) {
  const active = filters.team || filters.topic || filters.severity || filters.model !== "knn";
  return (
    <div className="panel flex flex-wrap items-end gap-3 p-3">
      <Select
        label="Week"
        value={week}
        options={[{ value: week, label: week }]}
        onChange={() => {}}
      />
      <Select
        label="Labels from"
        value={filters.model}
        options={[
          { value: "knn", label: "kNN (embedding)" },
          { value: "keyword", label: "Keyword baseline" },
          { value: "llm", label: "LLM zero-shot" },
        ]}
        onChange={(v) => setFilters({ ...filters, model: v ?? "knn" })}
      />
      <Select
        label="Team"
        value={filters.team}
        allLabel="All teams"
        options={teams.map((t) => ({ value: t, label: t }))}
        onChange={(v) => setFilters({ ...filters, team: v })}
      />
      <Select
        label="Topic"
        value={filters.topic}
        allLabel="All topics"
        options={TOPICS.map((t) => ({ value: t, label: TOPIC_LABEL[t] }))}
        onChange={(v) => setFilters({ ...filters, topic: v })}
      />
      <Select
        label="Flag severity"
        value={filters.severity}
        allLabel="All severities"
        options={[...SEVERITIES].reverse().map((s) => ({ value: s, label: SEVERITY_LABEL[s] }))}
        onChange={(v) => setFilters({ ...filters, severity: v })}
      />
      {active && (
        <button
          type="button"
          onClick={() => setFilters(DEFAULT_FILTERS)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
        >
          <RotateCcw className="size-3.5" aria-hidden /> Reset
        </button>
      )}
    </div>
  );
}
