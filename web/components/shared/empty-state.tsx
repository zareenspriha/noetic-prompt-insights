import { AlertTriangle, CircleDashed, Hammer } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title = "Nothing here yet",
  message,
  variant = "empty",
  planned,
}: {
  title?: string;
  message?: string;
  variant?: "empty" | "error" | "building";
  /** For "building": the features this page will have. */
  planned?: string[];
}) {
  const Icon = variant === "error" ? AlertTriangle : variant === "building" ? Hammer : CircleDashed;
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "panel flex flex-col items-center justify-center gap-3 border-dashed p-10 text-center",
        variant === "error" && "border-sev-critical/40",
      )}
    >
      <span
        className={cn(
          "grid size-11 place-items-center rounded-full",
          variant === "error" ? "bg-sev-critical/10 text-sev-critical" : "bg-primary/10 text-primary",
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="font-medium">{title}</p>
      {message && <p className="max-w-md text-sm text-muted-foreground">{message}</p>}
      {planned && (
        <ul className="mt-2 grid w-full max-w-md gap-2 text-left text-sm">
          {planned.map((p) => (
            <li key={p} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-muted-foreground">
              <CircleDashed className="size-3.5 shrink-0 text-primary/70" aria-hidden />
              {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
