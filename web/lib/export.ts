import type { Flag, WeeklyReport } from "@/types/api";

function toCsv(rows: (string | number | null)[][]) {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v === null ? "" : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

/** Aggregates + flag metadata only. Prompt text (even redacted) is deliberately
 *  left out of exports: files leave the app, so they get the strictest rule. */
export function exportReportCsv(report: WeeklyReport, flags: Flag[]) {
  const heat = toCsv([
    ["week", "team", "topic", "prompts"],
    ...report.heatmap.map((c) => [
      report.week,
      c.teamId,
      c.topic,
      c.count ?? `suppressed (<${report.minGroupSize})`,
    ]),
  ]);
  const fl = toCsv([
    ["event_id", "timestamp", "team", "topic", "sensitivity", "severity", "reason"],
    ...flags.map((f) => [f.eventId, f.timestamp, f.teamId, f.topic, f.sensitivity, f.severity, f.reason]),
  ]);
  const note = report.synthetic ? "# synthetic data\n" : "";
  download(`prompt-insights-${report.week}-team-topic.csv`, note + heat);
  download(`prompt-insights-${report.week}-flags.csv`, note + fl);
}
