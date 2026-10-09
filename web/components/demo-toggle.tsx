"use client";

import { useDemoMode } from "@/lib/demo-mode";
import { cn } from "@/lib/utils";

export function DemoToggle() {
  const { demo, setDemo } = useDemoMode();
  return (
    <div className="panel flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="text-sm">
        <p className="font-medium">Demo mode</p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn("size-1.5 rounded-full", demo ? "bg-sev-medium" : "bg-good")} />
          {demo ? "Seeded synthetic data" : "Live API"}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={demo}
        aria-label="Demo mode"
        onClick={() => setDemo(!demo)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          demo ? "bg-primary" : "bg-foreground/15",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform",
            demo && "translate-x-4",
          )}
        />
      </button>
    </div>
  );
}
