import { Masked } from "@/components/shared/masked";
import { TopicBadge } from "@/components/shared/topic-badge";
import type { Neighbor } from "@/types/api";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The labelled examples kNN voted with. Similarity is shown as a score, never as "% confident". */
export function NeighborsList({ neighbors }: { neighbors: Neighbor[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {neighbors.map((n) => {
        const width = `${Math.round(Math.min(Math.max(n.similarity, 0), 1) * 100)}%`;
        return (
          <li key={n.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-foreground/[0.025] px-3 py-2.5">
            <span className="min-w-0 flex-[1_1_280px] font-mono text-[12.5px] text-foreground/85"><Masked text={n.textRedacted} /></span>
            <TopicBadge topic={n.topic} />
            <span className="w-24 text-xs text-muted-foreground">{capitalize(n.sensitivity)}</span>
            <span className="flex w-36 items-center gap-2" aria-label={`Similarity ${n.similarity.toFixed(2)}`}>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
                <span className="block h-full rounded-full bg-primary" style={{ width }} />
              </span>
              <span className="text-xs tabular-nums text-foreground/80">{n.similarity.toFixed(2)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
