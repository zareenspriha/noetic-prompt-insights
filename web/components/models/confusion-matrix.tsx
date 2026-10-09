"use client";

import { useState } from "react";
import { TOPIC_LABEL } from "@/lib/tokens";
import { cn } from "@/lib/utils";

const label = (l: string) => TOPIC_LABEL[l as keyof typeof TOPIC_LABEL] ?? l.charAt(0).toUpperCase() + l.slice(1);

/** Rows = true label, columns = predicted. Click a cell to read it as a sentence. */
export function ConfusionMatrix({ labels, matrix }: { labels: string[]; matrix: number[][] }) {
  const [sel, setSel] = useState<[number, number] | null>(null);
  const max = Math.max(1, ...matrix.flat());
  const [r, c] = sel ?? [-1, -1];
  const rowTotal = r >= 0 ? matrix[r].reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] table-fixed border-separate border-spacing-1 text-xs">
          <caption className="sr-only">Confusion matrix. Rows are the true label, columns the predicted label.</caption>
          <thead>
            <tr>
              <th scope="col" className="w-28 text-left font-normal text-muted-foreground">
                true ↓ / predicted →
              </th>
              {labels.map((l, j) => (
                <th key={l} scope="col" className={cn("truncate pb-1 text-center font-normal text-muted-foreground", c === j && "text-primary")}>
                  {label(l)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={labels[i]}>
                <th scope="row" className={cn("truncate pr-2 text-left font-normal text-muted-foreground", r === i && "text-primary")}>
                  {label(labels[i])}
                </th>
                {row.map((n, j) => {
                  const diag = i === j;
                  const a = n === 0 ? 0 : 0.12 + 0.6 * (n / max);
                  return (
                    <td key={j} className="p-0">
                      <button
                        type="button"
                        onClick={() => setSel(r === i && c === j ? null : [i, j])}
                        aria-label={`True ${label(labels[i])}, predicted ${label(labels[j])}: ${n}`}
                        aria-pressed={r === i && c === j}
                        className={cn(
                          "grid h-10 w-full place-items-center rounded-md tabular-nums transition-shadow hover:ring-1 hover:ring-primary/60 focus-visible:ring-2 focus-visible:ring-ring",
                          n === 0 && "text-muted-foreground/40",
                          r === i && c === j && "ring-2 ring-primary",
                        )}
                        style={{
                          background: n === 0 ? "rgb(255 255 255 / 0.02)" : diag ? `rgb(52 211 153 / ${a})` : `rgb(249 115 22 / ${a})`,
                        }}
                      >
                        {n}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="min-h-5 text-sm text-muted-foreground" aria-live="polite">
        {sel
          ? r === c
            ? `${matrix[r][c]} of ${rowTotal} ${label(labels[r])} prompts were labelled correctly.`
            : `${matrix[r][c]} of ${rowTotal} ${label(labels[r])} prompts were labelled ${label(labels[c])}.`
          : "Green = correct (diagonal), orange = mistakes. Click a cell for details."}
      </p>
    </div>
  );
}
