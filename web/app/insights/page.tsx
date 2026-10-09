"use client";

// Team insights: an admin picks a preset question, a team and a time range, and gets a short
// answer plus a visual that fits the question. Presets only, so nobody can ask about a person.
import { useEffect, useState } from "react";
import { CalendarDays, Layers, LifeBuoy, ShieldAlert, Sparkles, Wrench, type LucideIcon } from "lucide-react";
import { errorMessage, useAsk, useWeeklyReport } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { ChartCard } from "@/components/shared/chart-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/shared/skeleton";
import { Hero, ReasonList, SeverityStrip, TopicBars } from "@/components/insights/visuals";
import type { AskQuestion, AskResponse, TeamSummary } from "@/types/api";

const QUESTIONS: { id: AskQuestion; icon: LucideIcon; short: string }[] = [
  { id: "overview", icon: Layers, short: "What were they working on?" },
  { id: "problems", icon: Wrench, short: "What problems did they hit?" },
  { id: "risks", icon: ShieldAlert, short: "Anything sensitive or risky?" },
  { id: "support", icon: LifeBuoy, short: "How can I help them?" },
];
const DAYS = [1, 3, 5, 7, 14];

/** The list that answers the chosen question goes first. */
const SECTION_ORDER: Record<AskQuestion, (keyof Omit<TeamSummary, "overview">)[]> = {
  overview: ["themes", "problems", "risks", "suggestions"],
  problems: ["problems", "themes", "suggestions", "risks"],
  risks: ["risks", "suggestions", "themes", "problems"],
  support: ["suggestions", "problems", "risks", "themes"],
};
const SECTION_TITLE = { themes: "What they worked on", problems: "Problems", risks: "Risks", suggestions: "Suggestions" };

const chip = (on: boolean) =>
  cn(
    "min-h-10 rounded-lg border px-3.5 text-sm transition-colors",
    on ? "border-primary bg-accent font-medium text-accent-foreground" : "border-input bg-card hover:bg-muted",
  );

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default function InsightsPage() {
  const teams = useWeeklyReport().data?.teams ?? [];
  const ask = useAsk();
  const [question, setQuestion] = useState<AskQuestion>("overview");
  const [team, setTeam] = useState<string | null>(null);
  const [days, setDays] = useState(5);
  const [allowLlm, setAllowLlm] = useState(false);
  const chosenTeam = team ?? teams[0] ?? null;
  const run = () => chosenTeam && ask.mutate({ question, team: chosenTeam, days, allowLlm });

  // Without the LLM the answer is free and instant, so update it as soon as a choice changes.
  // With the LLM on, nothing runs until the admin presses the button (paid call).
  const { mutate } = ask;
  useEffect(() => {
    if (!allowLlm && chosenTeam) mutate({ question, team: chosenTeam, days, allowLlm: false });
  }, [question, chosenTeam, days, allowLlm, mutate]);

  const result = ask.data;
  const stale =
    !!result && (result.question !== question || result.team !== chosenTeam || result.days !== days);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="Insights"
        title="Team insights"
        description="Pick a question, a department and a time range. Answers describe whole teams, never individual people."
      />

      <section aria-label="Choose a question" className="panel grid gap-5 p-5">
        <div>
          <p className="mb-2 text-sm font-medium">1. Question</p>
          <div role="radiogroup" aria-label="Question" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {QUESTIONS.map(({ id, icon: Icon, short }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={question === id}
                onClick={() => setQuestion(id)}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors",
                  question === id ? "border-primary bg-accent" : "border-input bg-card hover:bg-muted",
                )}
              >
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", question === id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="text-sm font-medium leading-snug">{short}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="mb-2 text-sm font-medium">2. Department</p>
            <div role="radiogroup" aria-label="Department" className="flex flex-wrap gap-2">
              {teams.length ? (
                teams.map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={chosenTeam === t} onClick={() => setTeam(t)} className={chip(chosenTeam === t)}>
                    {t}
                  </button>
                ))
              ) : (
                <Skeleton className="h-10 w-80" />
              )}
            </div>
          </div>
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              <CalendarDays className="size-4" aria-hidden /> 3. Time range
            </p>
            <div role="radiogroup" aria-label="Time range" className="flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <button key={d} type="button" role="radio" aria-checked={days === d} onClick={() => setDays(d)} className={chip(days === d)}>
                  {d === 1 ? "1 day" : `${d} days`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <label className="flex items-center gap-3 text-sm">
            <button
              type="button"
              role="switch"
              aria-checked={allowLlm}
              aria-label="Write the answer with the LLM"
              onClick={() => setAllowLlm(!allowLlm)}
              className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", allowLlm ? "bg-primary" : "bg-input")}
            >
              <span className={cn("absolute top-[3px] left-[3px] size-[18px] rounded-full bg-white shadow transition-transform", allowLlm && "translate-x-5")} />
            </button>
            <span className="leading-snug">
              <span className="font-medium">Write the answer with the LLM</span>{" "}
              <span className="text-muted-foreground">(paid API call)</span>
              <span className="block text-muted-foreground">
                {allowLlm ? "Only redacted prompts and counts are sent. Press the button to run it." : "Off: a free rule-based answer updates as you choose."}
              </span>
            </span>
          </label>
          {allowLlm && (
            <button
              type="button"
              onClick={run}
              disabled={!chosenTeam || ask.isPending}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Sparkles className="size-4" aria-hidden /> {ask.isPending ? "Writing…" : "Get answer"}
            </button>
          )}
        </div>
      </section>

      <div className="mt-4">
        {ask.isError ? (
          <EmptyState variant="error" title="Couldn't answer that" message={errorMessage(ask.error)} />
        ) : ask.isPending && !result ? (
          <div className="grid gap-4 lg:grid-cols-5">
            <Skeleton className="h-80 lg:col-span-3" />
            <Skeleton className="h-80 lg:col-span-2" />
          </div>
        ) : !result ? (
          <EmptyState title="No answer yet" message={allowLlm ? "Press Get answer." : "Pick a department to start."} />
        ) : (
          <Answer result={result} stale={stale || ask.isPending} />
        )}
      </div>
    </div>
  );
}

function Answer({ result, stale }: { result: AskResponse; stale: boolean }) {
  const flagged = result.severity.medium + result.severity.high + result.severity.critical;
  return (
    <div className={cn("grid gap-4 lg:grid-cols-5", stale && "opacity-60")} aria-busy={stale}>
      <section aria-label="Answer" className="panel flex flex-col gap-4 p-5 lg:col-span-3">
        <div>
          <p className="eyebrow mb-1">
            {result.team} · {fmtDate(result.start)} to {fmtDate(result.asOf)}
          </p>
          <h2 className="text-xl font-semibold tracking-tight">{result.questionText}</h2>
        </div>
        <p className="text-[17px] leading-relaxed">{result.summary.overview}</p>
        {result.notice && (
          <p role="status" className="rounded-lg border border-sev-medium/40 bg-sev-medium/10 px-3 py-2 text-sm text-sev-medium">
            {result.notice}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {SECTION_ORDER[result.question]
            .filter((k) => result.summary[k].length)
            .map((k) => (
              <div key={k}>
                <h3 className="mb-1.5 text-sm font-semibold">{SECTION_TITLE[k]}</h3>
                <ul className="grid list-disc gap-1 pl-5 text-sm text-foreground/90">
                  {result.summary[k].map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
        <p className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          <span className={cn("rounded-full border px-2 py-0.5 font-medium", result.source === "llm" ? "border-primary/40 bg-accent text-accent-foreground" : "border-input")}>
            {result.source === "llm" ? "Written by the LLM" : "Rule-based summary"}
          </span>
          {result.source === "llm" && <span className="font-mono">{result.modelVersion}</span>}
          {result.latencyMs !== null && <span>{(result.latencyMs / 1000).toFixed(1)} s</span>}
          {result.source === "llm" && <span>{result.costUsd === null ? "cost unknown (no price set)" : `$${result.costUsd.toFixed(4)}`}</span>}
          <span>Based on {result.prompts} redacted prompts. As of the newest event in the log.</span>
        </p>
      </section>

      <ChartCard className="lg:col-span-2" title="The numbers behind it" description={`${result.team}, last ${result.days === 1 ? "day" : `${result.days} days`}`}>
        <Visual result={result} flagged={flagged} />
      </ChartCard>
    </div>
  );
}

function Visual({ result, flagged }: { result: AskResponse; flagged: number }) {
  const pct = (n: number) => `${Math.round((100 * n) / result.prompts)}%`;
  if (result.question === "problems")
    return (
      <div className="grid gap-5">
        <Hero value={pct(result.problemPrompts)} label="of prompts were about errors, bugs or something not working" sub={`${result.problemPrompts} of ${result.prompts} prompts`} />
        {result.problemsByTopic.length ? (
          <TopicBars rows={result.problemsByTopic} total={result.problemPrompts} label="Problem prompts by topic" />
        ) : (
          <p className="text-sm text-muted-foreground">Too few problem prompts to break down by topic without singling anyone out.</p>
        )}
      </div>
    );
  if (result.question === "risks")
    return (
      <div className="grid gap-5">
        <Hero value={String(flagged)} label="prompts flagged as sensitive" sub={`${pct(flagged)} of ${result.prompts} prompts`} />
        <SeverityStrip severity={result.severity} total={result.prompts} />
        <div>
          <h3 className="mb-2 text-sm font-semibold">Why they were flagged</h3>
          <ReasonList reasons={result.reasons} />
        </div>
      </div>
    );
  return (
    <div className="grid gap-5">
      <Hero value={String(result.prompts)} label="prompts sent to AI tools" sub={`${flagged} flagged as sensitive`} />
      <TopicBars rows={result.topics} total={result.prompts} label="Prompts by topic" />
      {result.question === "support" && <SeverityStrip severity={result.severity} total={result.prompts} />}
    </div>
  );
}
