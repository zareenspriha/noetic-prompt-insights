import { Masked } from "@/components/shared/masked";
import { SeverityBadge } from "@/components/shared/severity-badge";
import { TopicBadge } from "@/components/shared/topic-badge";
import { TOPIC_LABEL } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import { SENSITIVITIES, TOPICS, type Prediction, type ReviewItem, type Sensitivity, type Topic } from "@/types/api";
import { REASON, ReasonBadge } from "./reason-badge";

export type Pick = { topic: Topic; sensitivity: Sensitivity };

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const pill = (on: boolean) =>
  cn(
    "inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
    on
      ? "border-primary/55 bg-primary/15 text-accent-foreground"
      : "border-foreground/10 bg-foreground/[0.03] text-foreground/80 hover:bg-foreground/[0.06]",
  );

function ModelAnswer({ label, prediction }: { label: string; prediction: Prediction | null }) {
  return (
    <div className="rounded-lg bg-foreground/[0.025] p-3.5">
      <p className="mb-2 text-xs text-muted-foreground">{label}</p>
      {prediction ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <TopicBadge topic={prediction.topic} />
          <span>{capitalize(prediction.sensitivity)}</span>
          <SeverityBadge severity={prediction.severity} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Not run for this item</p>
      )}
    </div>
  );
}

/** The selected item: both models' answers, and pills to choose the correct labels. */
export function CorrectionPanel({
  item,
  pick,
  onPick,
  onSave,
  onSkip,
  saving,
}: {
  item: ReviewItem;
  pick: Pick;
  onPick: (next: Partial<Pick>) => void;
  onSave: () => void;
  onSkip: () => void;
  saving: boolean;
}) {
  return (
    <section aria-label="Selected item" className="panel flex min-w-0 flex-[2_1_520px] flex-col gap-5 p-5">
      <div>
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <ReasonBadge reason={item.reason} />
          <span className="text-sm text-muted-foreground">{REASON[item.reason].why}</span>
        </div>
        <p className="rounded-lg bg-muted p-3.5 font-mono text-[13.5px] leading-relaxed break-words">
          <Masked text={item.textRedacted} />
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ModelAnswer label="kNN said" prediction={item.knn} />
        <ModelAnswer label="LLM said" prediction={item.llm} />
      </div>

      <fieldset>
        <legend className="mb-2.5 text-sm font-medium">Correct topic</legend>
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((t, i) => (
            <button
              key={t}
              type="button"
              aria-pressed={pick.topic === t}
              onClick={() => onPick({ topic: t })}
              className={pill(pick.topic === t)}
            >
              <kbd className="font-mono text-[11px] text-muted-foreground">{i + 1}</kbd>
              {TOPIC_LABEL[t]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2.5 text-sm font-medium">Correct sensitivity</legend>
        <div className="flex flex-wrap gap-2">
          {SENSITIVITIES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={pick.sensitivity === s}
              onClick={() => onPick({ sensitivity: s })}
              className={cn(pill(pick.sensitivity === s), "px-3.5")}
            >
              {capitalize(s)}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2.5 border-t border-foreground/[0.06] pt-4">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save correction"}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="min-h-11 rounded-lg border border-foreground/12 px-4 text-sm hover:bg-foreground/[0.04]"
        >
          Skip
        </button>
        <span className="ml-auto text-xs text-muted-foreground">Keys: 1–7 topic · J / K next and previous · Enter to save</span>
      </div>
    </section>
  );
}
