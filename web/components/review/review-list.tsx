import { cn } from "@/lib/utils";
import type { ReviewItem } from "@/types/api";
import { ReasonBadge } from "./reason-badge";

export function ReviewList({
  items,
  selectedId,
  onSelect,
}: {
  items: ReviewItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section aria-label="Items to review" className="panel min-w-0 flex-[1_1_340px] p-2">
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const on = item.id === selectedId;
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-current={on ? "true" : undefined}
                onClick={() => onSelect(item.id)}
                className={cn(
                  "flex w-full flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors",
                  on ? "border-primary/50 bg-primary/[0.08]" : "border-transparent hover:bg-white/[0.03]",
                )}
              >
                <ReasonBadge reason={item.reason} />
                <span className="font-mono text-[12.5px] leading-normal text-foreground/85">{item.textRedacted}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
