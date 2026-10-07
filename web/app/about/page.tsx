// OWNER: F1 (feat/data-trust)
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";

const PLANNED = ["Import stats: received, deduped, failed/blocked", "Project 1 gateway connection status and link", "How it works and known limits", "Privacy rules: no raw text, minimum group size 10, retention"];

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader eyebrow="Governance" title="Data & Trust" description="Where the data comes from, how it is classified, and its limits." />
      <EmptyState variant="building" title="In progress" message="Being built on feat/data-trust." planned={PLANNED} />
    </div>
  );
}
