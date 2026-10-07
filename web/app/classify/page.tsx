// OWNER: F2 (feat/classify-playground)
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";

const PLANNED = ["Example chips: hidden API key, mixed legal + code, prompt injection, salary leak", "kNN vs LLM: topic, sensitivity, severity, latency, cost", "Agreement badge and highlighted risky spans", "5 nearest neighbors with similarity scores", "Consent toggle with cost estimate before any LLM call"];

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader eyebrow="Classifier" title="Classify Playground" description="Run a prompt through kNN and the LLM side by side." />
      <EmptyState variant="building" title="In progress" message="Being built on feat/classify-playground." planned={PLANNED} />
    </div>
  );
}
