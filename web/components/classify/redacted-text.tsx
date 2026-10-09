import { Masked } from "@/components/shared/masked";
import { OwaspBadge } from "@/components/shared/owasp-badge";
import { owaspForSpan } from "@/lib/owasp";
import type { RiskSpan } from "@/types/api";

export const SPAN_LABEL: Record<RiskSpan["kind"], string> = {
  api_key: "API key",
  password: "Password",
  email: "Email",
  phone: "Phone",
  ssn: "SSN",
  salary: "Salary figure",
  card: "Card number",
  injection: "Prompt injection",
};

/** Splits the redacted text at the risk spans so the risky parts can be highlighted. */
function segments(text: string, spans: RiskSpan[]) {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const out: { text: string; kind: RiskSpan["kind"] | null }[] = [];
  let at = 0;
  for (const s of sorted) {
    const start = Math.max(s.start, at);
    const end = Math.min(s.end, text.length);
    if (start >= end) continue; // overlapping or out-of-range span
    if (start > at) out.push({ text: text.slice(at, start), kind: null });
    out.push({ text: text.slice(start, end), kind: s.kind });
    at = end;
  }
  if (at < text.length) out.push({ text: text.slice(at), kind: null });
  return out;
}

export function RedactedText({ text, spans }: { text: string; spans: RiskSpan[] }) {
  const kinds = [...new Set(spans.map((s) => s.kind))];
  return (
    <div>
      <p className="rounded-lg bg-muted p-3.5 font-mono text-[13px] leading-relaxed break-words">
        {segments(text, spans).map((seg, i) =>
          seg.kind ? (
            <mark
              key={i}
              title={SPAN_LABEL[seg.kind]}
              className="rounded bg-sev-critical/15 px-1 text-sev-critical shadow-[inset_0_-2px_0_var(--sev-critical)]"
            >
              <Masked text={seg.text} />
            </mark>
          ) : (
            <span key={i}>
              <Masked text={seg.text} />
            </span>
          ),
        )}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {kinds.length ? (
          kinds.map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className="rounded-full border border-sev-critical/35 bg-sev-critical/10 px-2.5 py-0.5 text-xs text-sev-critical">
                {SPAN_LABEL[k]}
              </span>
              <OwaspBadge id={owaspForSpan(k, text)} />
            </span>
          ))
        ) : (
          <span className="text-xs text-muted-foreground">No risky patterns found.</span>
        )}
      </div>
    </div>
  );
}
