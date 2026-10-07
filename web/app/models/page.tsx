// OWNER: F2 (feat/model-comparison)
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";

const PLANNED = ["Metrics table: macro-F1, confidential recall, cost, latency", "Agreement and Cohen's kappa", "Clickable confusion-matrix heatmaps", "Cost vs quality scatter", "Benchmark card: size, hash, date"];

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader eyebrow="Classifier" title="Model Comparison" description="Keyword vs kNN vs LLM on the frozen benchmark." />
      <EmptyState variant="building" title="In progress" message="Being built on feat/model-comparison." planned={PLANNED} />
    </div>
  );
}
