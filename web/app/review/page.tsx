// OWNER: F2 (feat/review-queue)
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";

const PLANNED = ["One-click label corrections sent to the kNN index", "Model updated toast, corrections counter, undo", "Keyboard: 1-7 for topics, J/K to move"];

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader eyebrow="Classifier" title="Review Queue" description="Disagreements and uncertain items. Corrections update the kNN index instantly." />
      <EmptyState variant="building" title="In progress" message="Being built on feat/review-queue." planned={PLANNED} />
    </div>
  );
}
