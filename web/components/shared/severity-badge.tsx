import { SEVERITY_CLASS, SEVERITY_LABEL } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import type { Severity } from "@/types/api";

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        SEVERITY_CLASS[severity],
        className,
      )}
    >
      {SEVERITY_LABEL[severity]}
    </span>
  );
}
