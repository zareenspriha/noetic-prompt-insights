import { OWASP, OWASP_IDS, COVERAGE_LABEL, type Coverage } from "@/lib/owasp";
import { cn } from "@/lib/utils";

const TONE: Record<Coverage, string> = {
  detected: "border-good/40 bg-good/10 text-good",
  partial: "border-sev-medium/40 bg-sev-medium/10 text-sev-medium",
  not_yet: "border-input bg-muted text-muted-foreground",
  out_of_scope: "border-input bg-card text-muted-foreground",
};

/** Which OWASP LLM Top 10 (2025) risks a prompt log can show, and which it can't. */
export function OwaspCoverage() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">OWASP Top 10 for LLM Applications 2025: what this tool can detect</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">Category</th>
            <th scope="col" className="px-3 py-2 font-medium">Status</th>
            <th scope="col" className="py-2 pl-3 font-medium">How, or why not</th>
          </tr>
        </thead>
        <tbody>
          {OWASP_IDS.map((id) => {
            const c = OWASP[id];
            return (
              <tr key={id} className="border-b border-border/60 last:border-0">
                <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                  <span className="font-mono text-xs font-semibold text-accent-foreground">{id}</span> {c.name}
                </th>
                <td className="px-3 py-2.5">
                  <span className={cn("whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", TONE[c.coverage])}>
                    {COVERAGE_LABEL[c.coverage]}
                  </span>
                </td>
                <td className="py-2.5 pl-3 text-muted-foreground">{c.how}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted-foreground">
        Source: OWASP Top 10 for LLM Applications 2025, genai.owasp.org/llm-top-10. OWASP names the type of risk; it
        doesn’t rank severity, so severity comes from our own rules.
      </p>
    </div>
  );
}
