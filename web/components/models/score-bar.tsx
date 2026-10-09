/** A 0–1 score as a thin bar with its value. The value is always printed, so color is never the only cue. */
export function ScoreBar({ value, label, note }: { value: number; label: string; note?: string }) {
  const pct = `${Math.round(Math.min(Math.max(value, 0), 1) * 100)}%`;
  return (
    <div className="flex min-w-36 items-center gap-2.5" title={`${label}: ${value.toFixed(2)}${note ? ` (${note})` : ""}`}>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]" aria-hidden>
        <span className="block h-full rounded-full bg-primary" style={{ width: pct }} />
      </span>
      <span className="w-10 text-right text-sm tabular-nums">{value.toFixed(2)}</span>
    </div>
  );
}
