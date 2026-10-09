import { OWASP, type OwaspId } from "@/lib/owasp";
import { cn } from "@/lib/utils";

/** "LLM02 · Sensitive Info". Hover shows the full OWASP name. */
export function OwaspBadge({ id, full = false, className }: { id: OwaspId; full?: boolean; className?: string }) {
  return (
    <span
      title={`OWASP ${id}:2025 ${OWASP[id].name}`}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-primary/25 bg-accent px-1.5 py-0.5 text-[11px] font-medium text-accent-foreground",
        className,
      )}
    >
      <span className="font-mono">{id}</span>
      <span aria-hidden>·</span>
      {full ? OWASP[id].name : OWASP[id].short}
    </span>
  );
}
