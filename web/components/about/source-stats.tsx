import { ArrowRight } from "lucide-react";
import type { Sources } from "@/types/api";

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="min-w-0 flex-1 basis-36 rounded-lg bg-white/[0.025] p-3.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

/** Import funnel: what arrived, what was dropped, and what was actually classified. Counts only. */
export function SourceStats({ sources }: { sources: Sources }) {
  const lastImport = sources.gateway.lastImportAt
    ? new Date(sources.gateway.lastImportAt).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }) + " UTC"
    : "never";
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-stretch gap-2">
        <Stat label="Received" value={sources.received} note="Events in the export" />
        <Stat label="Duplicates removed" value={sources.deduped} note="Same event ID sent twice" />
        <Stat label="Failed" value={sources.failed} note="Counted, never classified" />
        <Stat label="Blocked" value={sources.blocked} note="Counted, never classified" />
        <ArrowRight className="hidden size-4 self-center text-muted-foreground lg:block" aria-hidden />
        <Stat label="Classified" value={sources.classified} note="Succeeded, with redacted text" />
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-white/[0.06] px-4 py-3 text-sm">
        <span className="flex items-center gap-2">
          <span
            className={sources.gateway.connected ? "size-2 rounded-full bg-emerald-400" : "size-2 rounded-full bg-sev-medium"}
            aria-hidden
          />
          {sources.gateway.connected ? (
            <span>
              Live gateway connection{sources.gateway.url ? ` · ${sources.gateway.url}` : ""}
            </span>
          ) : (
            <span>Reading a synthetic NDJSON export, not a live gateway connection</span>
          )}
        </span>
        <span className="text-muted-foreground">Last loaded: {lastImport}</span>
        {sources.project1DashboardUrl && (
          <a
            href={sources.project1DashboardUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-primary underline-offset-4 hover:underline"
          >
            Open the AI Gateway dashboard ↗
          </a>
        )}
      </div>
    </div>
  );
}
