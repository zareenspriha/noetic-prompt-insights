"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TOPIC_COLOR, TOPIC_LABEL } from "@/lib/tokens";
import { TOPICS, type Topic, type TrendPoint } from "@/types/api";

/** Stacked weekly prompt volume by topic. */
export function TrendChart({ data, topic }: { data: TrendPoint[]; topic?: Topic | null }) {
  const shown = topic ? [topic] : TOPICS;
  const weeks = [...new Set(data.map((d) => d.week))];
  const rows = weeks.map((week) => {
    const row: Record<string, string | number> = { week: week.replace(/^\d{4}-/, "") };
    for (const p of data) if (p.week === week) row[p.topic] = p.count;
    return row;
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="h-72" role="img" aria-label="Stacked area chart of weekly prompts by topic">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
            <CartesianGrid stroke="rgb(255 255 255 / 0.06)" vertical={false} />
            <XAxis dataKey="week" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ stroke: "rgb(255 255 255 / 0.15)" }}
              contentStyle={{ background: "#0a0e13", border: "1px solid rgb(255 255 255 / 0.1)", borderRadius: 10, fontSize: 12 }}
              labelStyle={{ color: "var(--foreground)" }}
              formatter={(v, name) => [v, TOPIC_LABEL[name as keyof typeof TOPIC_LABEL] ?? name]}
            />
            {shown.map((t) => (
              <Area
                key={t}
                type="monotone"
                dataKey={t}
                stackId="1"
                stroke={TOPIC_COLOR[t]}
                fill={TOPIC_COLOR[t]}
                fillOpacity={0.22}
                strokeWidth={1.5}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
        {shown.map((t) => (
          <li key={t} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: TOPIC_COLOR[t] }} />
            {TOPIC_LABEL[t]}
          </li>
        ))}
      </ul>
    </div>
  );
}
