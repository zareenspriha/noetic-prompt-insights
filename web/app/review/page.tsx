"use client";

// OWNER: F2 (feat/review-queue)
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { reviewQueueKey, useFeedback, useReviewQueue, useUndoFeedback } from "@/lib/api";
import { useDemoMode } from "@/lib/demo-mode";
import { TOPIC_LABEL } from "@/lib/tokens";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/shared/skeleton";
import { ReviewList } from "@/components/review/review-list";
import { CorrectionPanel, type Pick } from "@/components/review/correction-panel";
import { TOPICS, type ReviewItem } from "@/types/api";

type Stats = { indexSize: number; correctionsTotal: number };

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="panel min-w-28 px-3.5 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default function ReviewPage() {
  const { demo } = useDemoMode();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useReviewQueue();
  const feedback = useFeedback();
  const undo = useUndoFeedback();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [stats, setStats] = useState<Stats | null>(null);

  const items = data ?? [];
  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null;
  // Start from kNN's answer so the reviewer only changes what's wrong.
  const pick: Pick | null = selected
    ? (picks[selected.id] ?? { topic: selected.knn.topic, sensitivity: selected.knn.sensitivity })
    : null;

  const setQueue = (update: (old: ReviewItem[]) => ReviewItem[]) =>
    queryClient.setQueryData<ReviewItem[]>(reviewQueueKey(demo), (old) => update(old ?? []));

  const updatePick = (next: Partial<Pick>) => {
    if (selected && pick) setPicks({ ...picks, [selected.id]: { ...pick, ...next } });
  };

  const move = (step: number) => {
    if (!selected || items.length === 0) return;
    const at = items.indexOf(selected);
    setSelectedId(items[(at + step + items.length) % items.length].id);
  };

  const undoCorrection = (token: string, item: ReviewItem, at: number) =>
    undo.mutate(token, {
      onSuccess: (res) => {
        setStats(res);
        if (demo) setQueue((old) => [...old.slice(0, at), item, ...old.slice(at)]);
        else queryClient.invalidateQueries({ queryKey: reviewQueueKey(demo) });
        setSelectedId(item.id);
        toast("Correction undone");
      },
      onError: (e) => toast.error(`Couldn't undo: ${String(e)}`),
    });

  const save = () => {
    if (!selected || !pick || feedback.isPending) return;
    const item = selected;
    const at = items.indexOf(item);
    feedback.mutate(
      { itemId: item.id, topic: pick.topic, sensitivity: pick.sensitivity },
      {
        onSuccess: (res) => {
          setStats(res);
          setSelectedId((items[at + 1] ?? items[at - 1])?.id ?? null);
          setQueue((old) => old.filter((i) => i.id !== item.id));
          toast.success("Model updated", {
            description: `Saved as ${TOPIC_LABEL[pick.topic]} · ${capitalize(pick.sensitivity)}. kNN now learns from ${res.indexSize} examples.`,
            action: { label: "Undo", onClick: () => undoCorrection(res.undoToken, item, at) },
          });
        },
        onError: (e) => toast.error(`Couldn't save: ${String(e)}`),
      },
    );
  };

  // Keyboard: 1–7 pick a topic, J/K move, Enter saves. Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (/^[1-7]$/.test(e.key)) updatePick({ topic: TOPICS[Number(e.key) - 1] });
      else if (e.key === "j") move(1);
      else if (e.key === "k") move(-1);
      else if (e.key === "Enter" && target.tagName !== "BUTTON") save();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="Classifier"
        title="Review Queue"
        description="Disagreements, unfamiliar prompts and high-risk flags. Each correction teaches the kNN model right away."
      >
        <StatTile label="To review" value={isLoading ? "—" : items.length} />
        <StatTile label="Corrected" value={stats?.correctionsTotal ?? "—"} />
        <StatTile label="kNN examples" value={stats?.indexSize ?? "—"} />
      </PageHeader>

      {error ? (
        <EmptyState
          variant="error"
          title="Couldn't load the review queue"
          message={`${String(error)}. Is the backend running? Turn on Demo mode to use seeded data.`}
        />
      ) : isLoading ? (
        <div className="flex flex-wrap gap-4">
          <Skeleton className="h-96 flex-[1_1_340px]" />
          <Skeleton className="h-96 flex-[2_1_520px]" />
        </div>
      ) : !selected || !pick ? (
        <EmptyState title="Queue clear" message="Every item has a human label. New disagreements show up here as prompts arrive." />
      ) : (
        <div className="flex flex-wrap items-start gap-4">
          <ReviewList items={items} selectedId={selected.id} onSelect={setSelectedId} />
          <CorrectionPanel
            item={selected}
            pick={pick}
            onPick={updatePick}
            onSave={save}
            onSkip={() => move(1)}
            saving={feedback.isPending}
          />
        </div>
      )}
    </div>
  );
}
