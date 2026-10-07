import type { Severity, Topic } from "@/types/api";

export const TOPIC_LABEL: Record<Topic, string> = {
  coding: "Coding",
  writing: "Writing",
  data_analysis: "Data analysis",
  customer_email: "Customer email",
  legal: "Legal",
  hr: "HR",
  other: "Other",
};

/** CSS variable per topic, for Recharts fills/strokes. */
export const TOPIC_COLOR: Record<Topic, string> = {
  coding: "var(--topic-coding)",
  writing: "var(--topic-writing)",
  data_analysis: "var(--topic-data_analysis)",
  customer_email: "var(--topic-customer_email)",
  legal: "var(--topic-legal)",
  hr: "var(--topic-hr)",
  other: "var(--topic-other)",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

/** Tailwind classes per severity (badge style). */
export const SEVERITY_CLASS: Record<Severity, string> = {
  low: "bg-sev-low/15 text-sev-low border-sev-low/40",
  medium: "bg-sev-medium/15 text-sev-medium border-sev-medium/40",
  high: "bg-sev-high/15 text-sev-high border-sev-high/40",
  critical: "bg-sev-critical/15 text-sev-critical border-sev-critical/40",
};
