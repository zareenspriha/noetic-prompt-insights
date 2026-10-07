"use client";

import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

/** KPI with week-over-week change. `goodWhen` decides whether up is green or red
 *  (e.g. more confidential prompts = bad). Optional sparkline of recent weeks. */
export function KpiTile({
  label,
  value,
  prev,
  icon: Icon,
  format = (n) => n.toLocaleString(),
  goodWhen = "up",
  spark,
  display,
  note,
}: {
  label: string;
  value: number;
  prev: number | null;
  icon?: LucideIcon;
  format?: (n: number) => string;
  goodWhen?: "up" | "down";
  spark?: number[];
  /** Override the big value (e.g. a topic name). */
  display?: string;
  /** Override the change pill text (e.g. "Last week: Coding"). */
  note?: string;
}) {
  const delta = prev === null || prev === 0 ? null : (value - prev) / prev;
  const up = delta !== null && delta > 0;
  const good = delta === null || delta === 0 ? null : goodWhen === "up" ? up : !up;
  const Arrow = delta === null || delta === 0 ? Minus : up ? ArrowUpRight : ArrowDownRight;

  return (
    <div className={cn("panel relative min-w-0 overflow-hidden p-4", spark && spark.length > 1 && "pb-14")}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        {Icon && (
          <span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
            <Icon className="size-4" aria-hidden />
          </span>
        )}
      </div>
      <p className="mt-2 truncate text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{display ?? format(value)}</p>
      <span
        className={cn(
          "mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
          good === true && "bg-emerald-400/10 text-emerald-400",
          good === false && "bg-sev-critical/10 text-sev-critical",
          good === null && "bg-white/5 text-muted-foreground",
        )}
      >
        <Arrow className="size-3.5" aria-hidden />
        {note ?? (delta === null ? "No previous week" : `${(Math.abs(delta) * 100).toFixed(0)}% vs last week`)}
      </span>
      {spark && spark.length > 1 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-11 opacity-70" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark.map((v, i) => ({ i, v }))} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--primary)" stopOpacity={0.35} />
                  <stop offset="1" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke="var(--primary)" strokeWidth={1.5} fill={`url(#spark-${label})`} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
