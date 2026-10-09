import type { ClassMetrics } from "@/types/api";

export function PerClassTable({ rows, format }: { rows: ClassMetrics[]; format: (label: string) => string }) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Precision, recall and F1 for each class</caption>
      <thead>
        <tr className="border-b border-foreground/5 text-xs text-muted-foreground">
          <th scope="col" className="py-2 pr-3 text-left font-medium">Class</th>
          <th scope="col" className="px-2 py-2 text-right font-medium">Precision</th>
          <th scope="col" className="px-2 py-2 text-right font-medium">Recall</th>
          <th scope="col" className="px-2 py-2 text-right font-medium">F1</th>
          <th scope="col" className="py-2 pl-2 text-right font-medium">Rows</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-foreground/[0.04] last:border-0 tabular-nums">
            <th scope="row" className="py-2 pr-3 text-left font-normal">{format(r.label)}</th>
            <td className="px-2 py-2 text-right">{r.precision.toFixed(2)}</td>
            <td className="px-2 py-2 text-right">{r.recall.toFixed(2)}</td>
            <td className="px-2 py-2 text-right font-medium">{r.f1.toFixed(2)}</td>
            <td className="py-2 pl-2 text-right text-muted-foreground">{r.support}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
