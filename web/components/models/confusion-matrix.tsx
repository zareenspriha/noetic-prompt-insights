/** Rows = true label, columns = predicted. Cell shade = share of that row, so rows of different
 *  sizes are comparable; the count is always printed. Diagonal cells are correct answers. */
export function ConfusionMatrix({
  labels,
  matrix,
  format,
}: {
  labels: string[];
  matrix: number[][];
  format: (label: string) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="text-xs" style={{ borderCollapse: "separate", borderSpacing: 2 }}>
        <caption className="sr-only">Confusion matrix: rows are the true label, columns the predicted label</caption>
        <thead>
          <tr>
            <th scope="col" className="px-2 pb-1 text-left font-medium text-muted-foreground">
              True ↓ / Predicted →
            </th>
            {labels.map((l) => (
              <th key={l} scope="col" className="max-w-20 px-1 pb-1 text-center font-medium text-muted-foreground">
                {format(l)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => {
            const total = row.reduce((s, n) => s + n, 0);
            return (
              <tr key={labels[i]}>
                <th scope="row" className="whitespace-nowrap px-2 text-left font-medium text-muted-foreground">
                  {format(labels[i])}
                </th>
                {row.map((n, j) => {
                  const share = total ? n / total : 0;
                  const correct = i === j;
                  return (
                    <td
                      key={labels[j]}
                      title={`True ${format(labels[i])}, predicted ${format(labels[j])}: ${n} of ${total}`}
                      className="size-11 min-w-11 rounded-md text-center tabular-nums"
                      style={{
                        backgroundColor: n
                          ? `color-mix(in srgb, var(--primary) ${Math.round(12 + share * 68)}%, var(--card))`
                          : "rgb(31 35 55 / 0.025)",
                        color: share > 0.5 ? "var(--primary-foreground)" : "var(--foreground)",
                        outline: correct ? "1px solid rgb(31 35 55 / 0.25)" : undefined,
                        outlineOffset: -1,
                      }}
                    >
                      {n || <span className="text-muted-foreground/50">·</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">Outlined cells are correct. Shade shows the share of each true label.</p>
    </div>
  );
}
