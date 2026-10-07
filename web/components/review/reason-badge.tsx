import { cn } from "@/lib/utils";
import type { ReviewItem } from "@/types/api";

export const REASON: Record<ReviewItem["reason"], { label: string; why: string; className: string }> = {
  disagreement: {
    label: "Disagreement",
    why: "kNN and the LLM picked different labels.",
    className: "border-sev-high/40 bg-sev-high/10 text-orange-300",
  },
  low_similarity: {
    label: "Unfamiliar",
    why: "No labelled example is close, so kNN was guessing.",
    className: "border-sev-medium/40 bg-sev-medium/10 text-yellow-200",
  },
  flagged: {
    label: "High risk",
    why: "Risk rules found a high or critical pattern. Confirm the label.",
    className: "border-sev-critical/40 bg-sev-critical/10 text-red-300",
  },
};

export function ReasonBadge({ reason }: { reason: ReviewItem["reason"] }) {
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", REASON[reason].className)}>
      {REASON[reason].label}
    </span>
  );
}
