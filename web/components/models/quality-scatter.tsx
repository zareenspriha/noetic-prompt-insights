"use client";

import { CartesianGrid, LabelList, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { ModelMetrics } from "@/types/api";
const SHORT = { keyword: "Keyword", knn: "kNN", llm: "LLM" } as const;

/** Cost vs quality when cost is measured for some model; otherwise latency vs quality. */
export function QualityScatter({ models }: { models: ModelMetrics[] }) {
  const byCost = models.some((m) => m.costPer1kUsd !== null);
  const points = models.map((m) => ({
    name: SHORT[m.model],
    x: byCost ? (m.costPer1kUsd ?? 0) : m.p50LatencyMs,
    y: m.topicMacroF1,
  }));
  const xLabel = byCost ? "Cost per 1,000 prompts ($)" : "p50 latency per prompt (ms)";
  return (
    <div className="flex flex-col gap-2">
      <div className="h-64" role="img" aria-label={`Scatter of topic macro-F1 against ${xLabel}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 16, right: 24, bottom: 20, left: -8 }}>
            <CartesianGrid stroke="rgb(255 255 255 / 0.06)" />
            <XAxis
              type="number"
              dataKey="x"
              name={xLabel}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              label={{ value: xLabel, position: "insideBottom", offset: -10, fill: "var(--muted-foreground)", fontSize: 12 }}
            />
            <YAxis type="number" dataKey="y" name="Topic macro-F1" domain={[0, 1]} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
            <ZAxis range={[160, 160]} />
            <Tooltip
              cursor={{ stroke: "rgb(255 255 255 / 0.15)" }}
              contentStyle={{ background: "#0a0e13", border: "1px solid rgb(255 255 255 / 0.1)", borderRadius: 10, fontSize: 12 }}
              formatter={(v) => (typeof v === "number" ? v.toFixed(2) : v)}
            />
            <Scatter data={points} fill="var(--primary)" isAnimationActive={false}>
              <LabelList dataKey="name" position="right" offset={10} style={{ fill: "var(--foreground)", fontSize: 12 }} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted-foreground">
        {byCost
          ? "Up and to the left is better: more accurate for less money."
          : "Showing latency until the LLM's cost is measured. Up and to the left is better."}
      </p>
    </div>
  );
}
