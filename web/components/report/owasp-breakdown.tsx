"use client";

import { OWASP, owaspForFlag, type OwaspId } from "@/lib/owasp";
import { cn } from "@/lib/utils";
import type { Flag } from "@/types/api";

/** Flags this week per OWASP category. A flag with two categories counts in both. */
export function OwaspBreakdown({
  flags,
  selected,
  onSelect,
}: {
  flags: Flag[];
  selected: OwaspId | null;
  onSelect: (id: OwaspId | null) => void;
}) {
  const counts = new Map<OwaspId, number>();
  for (const f of flags) for (const id of owaspForFlag(f)) counts.set(id, (counts.get(id) ?? 0) + 1);
  const shown: OwaspId[] = ["LLM01", "LLM02", "LLM07"];
  const max = Math.max(1, ...counts.values());

  return (
    <div className="flex flex-col gap-3">
      <ul className="grid gap-2 sm:grid-cols-3">
        {shown.map((id) => {
          const n = counts.get(id) ?? 0;
          const on = selected === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onSelect(on ? null : id)}
                aria-pressed={on}
                className={cn(
                  "grid w-full grid-cols-[3.5rem_1fr_auto] items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted",
                  on ? "border-primary bg-accent" : "border-transparent",
                )}
              >
                <span className="font-mono text-xs font-semibold text-accent-foreground">{id}</span>
                <span className="min-w-0">
                  <span className="block truncate">{OWASP[id].name}</span>
                  <span className="mt-1 block h-1.5 rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${(n / max) * 100}%` }} />
                  </span>
                </span>
                <span className="text-lg font-semibold tabular-nums">{n}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Click a category to filter the flags below. LLM10 (unusual token use) needs a backend check; the other six
        categories can’t be seen in prompts. See Data &amp; Trust.
      </p>
    </div>
  );
}
