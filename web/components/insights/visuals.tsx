import { OwaspBadge } from "@/components/shared/owasp-badge";
import { owaspForFlag } from "@/lib/owasp";
import { SEVERITY_LABEL, TOPIC_LABEL } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import { SEVERITIES, type AskResponse, type Topic } from "@/types/api";

const HATCH = "repeating-linear-gradient(135deg, var(--input) 0 3px, transparent 3px 7px)";

/** Horizontal bars, one hue: the label names the topic, length shows the count.
 *  Hidden (null) counts are hatched and say why, never drawn as zero. */
export function TopicBars({
  rows,
  total,
  label,
}: {
  rows: { topic: Topic; count: number | null }[];
  total: number;
  label: string;
}) {
  const sorted = [...rows].sort((a, b) => (b.count ?? -1) - (a.count ?? -1));
  const max = Math.max(1, ...sorted.map((r) => r.count ?? 0));
  return (
    <figure aria-label={label} className="grid gap-2.5">
      {sorted.map((r) => (
        <div
          key={r.topic}
          className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-3 text-sm"
          title={r.count === null ? `${TOPIC_LABEL[r.topic]}: hidden (fewer than 10 prompts)` : `${TOPIC_LABEL[r.topic]}: ${r.count} prompts (${Math.round((100 * r.count) / total)}%)`}
        >
          <span className="truncate text-muted-foreground">{TOPIC_LABEL[r.topic]}</span>
          <span className="h-3 rounded-r bg-muted">
            {r.count === null ? (
              <span className="block h-full w-full rounded-r" style={{ background: HATCH }} />
            ) : (
              <span className="block h-full rounded-r bg-primary" style={{ width: `${(r.count / max) * 100}%` }} />
            )}
          </span>
          <span className="text-right tabular-nums">{r.count === null ? "<10" : r.count}</span>
        </div>
      ))}
      <figcaption className="text-xs text-muted-foreground">
        Hatched bars are topics with fewer than 10 prompts, hidden for privacy.
      </figcaption>
    </figure>
  );
}

const SEV_BG: Record<(typeof SEVERITIES)[number], string> = {
  low: "bg-sev-low/35",
  medium: "bg-sev-medium",
  high: "bg-sev-high",
  critical: "bg-sev-critical",
};

/** One stacked bar of every prompt by severity, with a labelled legend (never color alone). */
export function SeverityStrip({ severity, total }: { severity: AskResponse["severity"]; total: number }) {
  const order = [...SEVERITIES].reverse();
  return (
    <figure aria-label="Prompts by risk severity" className="grid gap-3">
      <div className="flex h-4 gap-0.5 overflow-hidden rounded">
        {order.map((s) =>
          severity[s] ? (
            <span
              key={s}
              className={SEV_BG[s]}
              style={{ flexGrow: severity[s] }}
              title={`${SEVERITY_LABEL[s]}: ${severity[s]} of ${total}`}
            />
          ) : null,
        )}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {order.map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span className={cn("size-2.5 rounded-sm", SEV_BG[s])} aria-hidden />
            <span className="text-muted-foreground">{SEVERITY_LABEL[s]}</span>
            <span className="ml-auto tabular-nums">{severity[s]}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Why prompts were flagged, with the OWASP category for each reason. */
export function ReasonList({ reasons }: { reasons: AskResponse["reasons"] }) {
  if (!reasons.length) return <p className="text-sm text-muted-foreground">No prompts were flagged.</p>;
  return (
    <ul className="grid gap-2 text-sm">
      {reasons.map((r) => (
        <li key={r.reason} className="flex flex-wrap items-center gap-2">
          <span className="highlighter">{r.reason}</span>
          {owaspForFlag({ reason: r.reason, textRedacted: "" }).map((id) => (
            <OwaspBadge key={id} id={id} />
          ))}
          <span className="ml-auto tabular-nums text-muted-foreground">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

/** Hero number: one headline figure with its context. */
export function Hero({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div>
      <p className="text-4xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-sm">{label}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
