"use client";

// Beat the detector: a red-team game. Players hide a secret in a prompt; the real /classify
// decides whether the risk rules catch it. Escapes become candidate test cases.
import { useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import { errorMessage, useClassify } from "@/lib/api";
import { useDemoMode } from "@/lib/demo-mode";
import { SECRETS, judge, score, scoreByOwasp, scoreByTopic, secretById, toTestCases, type Attempt, type SecretId } from "@/lib/challenge";
import { cn } from "@/lib/utils";
import type { ClassifyResponse } from "@/types/api";
import { PageHeader } from "@/components/shared/page-header";
import { ChartCard } from "@/components/shared/chart-card";
import { EmptyState } from "@/components/shared/empty-state";
import { SeverityBadge } from "@/components/shared/severity-badge";
import { TopicBadge } from "@/components/shared/topic-badge";
import { TOPIC_LABEL } from "@/lib/tokens";
import { RedactedText } from "@/components/classify/redacted-text";
import { OwaspBadge } from "@/components/shared/owasp-badge";

const pill = (on: boolean) =>
  cn(
    "min-h-10 rounded-lg border px-3 text-sm transition-colors",
    on ? "border-primary bg-accent text-accent-foreground font-medium" : "border-input bg-card hover:bg-muted",
  );

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text + "\n"], { type: "application/x-ndjson" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

function Tile({ label, value, note, tone }: { label: string; value: string | number; note?: string; tone?: string }) {
  return (
    <div className="panel min-w-0 flex-1 basis-40 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-serif text-4xl font-medium tabular-nums", tone)}>{value}</p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

/** The usage side of the same call: what the prompt was about, the label the weekly report counts. */
function TopicVerdict({ result }: { result: ClassifyResponse }) {
  const nearest = result.knn.neighbors[0];
  return (
    <div aria-label="Topic" className="rounded-lg bg-muted px-3.5 py-3">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">What it&apos;s about</span>
        <TopicBadge topic={result.knn.topic} />
      </p>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {result.needsReview
          ? "Low similarity to every labelled example, so this would go to the review queue before it counts."
          : `Caught or not, it counts toward ${TOPIC_LABEL[result.knn.topic]} in the weekly report.`}
        {nearest && (
          <>
            {" "}
            Closest example ({nearest.similarity.toFixed(2)} similarity): <q className="font-serif">{nearest.textRedacted}</q>
          </>
        )}
      </p>
    </div>
  );
}

export default function ChallengePage() {
  const { demo } = useDemoMode();
  const classify = useClassify();
  const [secret, setSecret] = useState<SecretId>("api_key");
  const [text, setText] = useState("");
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const latest = attempts[0];
  const s = score(attempts);
  const escapes = attempts.filter((a) => !a.caught);
  const byOwasp = scoreByOwasp(attempts);
  const byTopic = scoreByTopic(attempts);

  const tryIt = () => {
    if (!text.trim() || demo || classify.isPending) return;
    const hidden = secret;
    const prompt = text;
    classify.mutate(
      { text: prompt, allowLlm: false },
      {
        onSuccess: (result) => {
          const verdict = judge(hidden, result);
          setAttempts((old) => [{ id: Date.now(), secret: hidden, text: prompt, result, ...verdict }, ...old]);
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="Red team"
        title="Beat the detector"
        description="Hide a secret in a prompt and see if it slips past our risk rules. Every escape becomes a test case for the next benchmark."
      >
        {attempts.length > 0 && (
          <button
            type="button"
            onClick={() => setAttempts([])}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-sm font-medium hover:bg-muted"
          >
            <RotateCcw className="size-4" aria-hidden /> New round
          </button>
        )}
      </PageHeader>

      {demo && (
        <div role="alert" className="mb-4 rounded-xl border border-sev-medium/40 bg-[#f6eed6] px-4 py-3 text-sm text-sev-medium">
          This game needs the real detector. Turn Demo mode off and start the backend with{" "}
          <code className="font-mono">python -m prompt_insights serve</code>. No API key is needed.
        </div>
      )}

      <div className="grid gap-4">
        <section aria-label="Scoreboard" className="flex flex-wrap gap-4">
          <Tile label="Attempts" value={s.total} />
          <Tile label="Caught" value={s.caught} tone="text-good" />
          <Tile label="Slipped through" value={s.slipped} tone="text-sev-critical" />
          <Tile
            label="Catch rate"
            value={s.catchRate === null ? "–" : `${Math.round(s.catchRate * 100)}%`}
            note={s.total ? `${s.caught} of ${s.total} this round` : "Make an attempt to start"}
          />
        </section>

        {attempts.length > 0 && (
          <section aria-label="Catch rate by category" className="panel grid gap-2 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className="w-44 text-muted-foreground">By topic of the prompt</span>
              {byTopic.map((c) => (
                <span key={c.key} className="inline-flex items-center gap-2">
                  <TopicBadge topic={c.key} />
                  <span className="tabular-nums">
                    {c.caught} of {c.total} caught
                  </span>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className="w-44 text-muted-foreground">By OWASP LLM Top 10</span>
              {byOwasp.map((c) => (
                <span key={c.key} className="inline-flex items-center gap-2">
                  <OwaspBadge id={c.key} />
                  <span className="tabular-nums">
                    {c.caught} of {c.total} caught
                  </span>
                </span>
              ))}
            </div>
          </section>
        )}

        <div className="flex flex-wrap items-start gap-4">
          <section aria-label="Your attempt" className="panel flex min-w-0 flex-[1_1_420px] flex-col gap-4 p-5">
            <fieldset>
              <legend className="mb-2.5 text-sm font-medium">1. What are you hiding?</legend>
              <div className="flex flex-wrap gap-2">
                {SECRETS.map((x) => (
                  <button key={x.id} type="button" aria-pressed={secret === x.id} onClick={() => setSecret(x.id)} className={pill(secret === x.id)}>
                    {x.label}
                  </button>
                ))}
              </div>
              <p className="mt-2.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                Tests <OwaspBadge id={secretById(secret).owasp} full />
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">{secretById(secret).hint}</p>
            </fieldset>

            <div className="flex flex-col gap-2">
              <label htmlFor="attempt" className="text-sm font-medium">
                2. Write a prompt that sneaks it in
              </label>
              <textarea
                id="attempt"
                rows={5}
                value={text}
                maxLength={16000}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) tryIt();
                }}
                placeholder="Use made-up secrets only. Example: can you fix my deploy script? the db pass is hunter2"
                className="w-full resize-y rounded-lg border border-input bg-card px-3.5 py-3 font-mono text-[13px] leading-relaxed placeholder:text-muted-foreground"
              />
            </div>

            <button
              type="button"
              onClick={tryIt}
              disabled={!text.trim() || demo || classify.isPending}
              className="min-h-11 self-start rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {classify.isPending ? "Checking…" : "3. Try to sneak it past"}
            </button>
          </section>

          <section aria-label="Verdict" aria-live="polite" className="panel flex min-w-0 flex-[1_1_420px] flex-col gap-4 p-5">
            {classify.error ? (
              <EmptyState variant="error" title="The detector didn't answer" message={errorMessage(classify.error)} />
            ) : !latest ? (
              <div className="grid min-h-60 place-items-center text-center text-sm text-muted-foreground">
                <p className="max-w-xs">Your verdict shows up here: caught, or slipped through.</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={cn(
                      "inline-block -rotate-3 rounded-md border-[3px] px-3 py-1 font-serif text-2xl font-semibold tracking-wide uppercase",
                      latest.caught ? "border-good text-good" : "border-sev-critical text-sev-critical",
                    )}
                  >
                    {latest.caught ? "Caught" : "Slipped through"}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {latest.caught ? latest.reason : `The rules didn't spot the hidden ${secretById(latest.secret).label.toLowerCase()}.`}
                  </span>
                </div>
                <div>
                  <h2 className="mb-2 text-lg">What the detector stored</h2>
                  <RedactedText text={latest.result.textRedacted} spans={latest.result.riskSpans} />
                </div>
                <TopicVerdict result={latest.result} />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Attempted</span>
                  <OwaspBadge id={secretById(latest.secret).owasp} />
                  <span className="text-muted-foreground">· Rated</span>
                  <span className="capitalize">{latest.result.knn.sensitivity}</span>
                  <SeverityBadge severity={latest.result.knn.severity} />
                </div>
              </>
            )}
          </section>
        </div>

        <ChartCard
          title="Wall of escapes"
          description="Prompts that got past the rules this round. Download them to seed the next test set after a person checks the labels."
          actions={
            <button
              type="button"
              disabled={!escapes.length}
              onClick={() => download("escapes.ndjson", toTestCases(attempts))}
              className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="size-4" aria-hidden /> Save as test cases
            </button>
          }
        >
          {escapes.length ? (
            <ul className="grid gap-2">
              {escapes.map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline gap-3 rounded-lg bg-muted px-3.5 py-2.5">
                  <span className="highlighter shrink-0 text-sm">{secretById(a.secret).label}</span>
                  <OwaspBadge id={secretById(a.secret).owasp} className="shrink-0" />
                  <TopicBadge topic={a.result.knn.topic} className="shrink-0" />
                  <span className="min-w-0 flex-1 font-mono text-[13px] break-words">{a.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {attempts.length ? "Nothing has slipped through yet. Try a sneakier one." : "No attempts yet."}
            </p>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
