"use client";

import { TOPIC_LABEL } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import { TOPICS, type TeamTopicCell, type Topic } from "@/types/api";

/** Team × topic grid. Suppressed cells (group < minGroupSize) render as "insufficient data".
 *  Clicking a cell filters the page to that team + topic. */
export function TeamTopicHeatmap({
  cells,
  teams,
  minGroupSize,
  selected,
  onSelect,
}: {
  cells: TeamTopicCell[];
  teams: string[];
  minGroupSize: number;
  selected: { team: string | null; topic: Topic | null };
  onSelect: (team: string, topic: Topic) => void;
}) {
  const get = (team: string, topic: Topic) => cells.find((c) => c.teamId === team && c.topic === topic);
  const max = Math.max(1, ...cells.map((c) => c.count ?? 0));

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] table-fixed border-separate border-spacing-1 text-sm">
          <caption className="sr-only">
            Prompts per team and topic this week. Cells under {minGroupSize} prompts are suppressed.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-24" />
              {TOPICS.map((t) => (
                <th
                  key={t}
                  scope="col"
                  className={cn(
                    "truncate px-1 pb-1 text-center text-xs font-normal text-muted-foreground",
                    selected.topic === t && "text-primary",
                  )}
                >
                  {TOPIC_LABEL[t]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr key={team}>
                <th
                  scope="row"
                  className={cn(
                    "truncate pr-2 text-left text-xs font-normal text-muted-foreground",
                    selected.team === team && "text-primary",
                  )}
                >
                  {team}
                </th>
                {TOPICS.map((topic) => {
                  const c = get(team, topic);
                  const n = c?.count ?? null;
                  const isSel =
                    (selected.team === null || selected.team === team) &&
                    (selected.topic === null || selected.topic === topic);
                  const anySel = selected.team !== null || selected.topic !== null;
                  return (
                    <td key={topic} className="p-0">
                      <button
                        type="button"
                        onClick={() => onSelect(team, topic)}
                        aria-label={`${team}, ${TOPIC_LABEL[topic]}: ${n === null ? `fewer than ${minGroupSize} prompts, suppressed` : `${n} prompts`}`}
                        className={cn(
                          "grid h-11 w-full place-items-center rounded-md text-xs tabular-nums transition-[opacity,box-shadow] hover:ring-1 hover:ring-primary/60 focus-visible:ring-2 focus-visible:ring-ring",
                          anySel && !isSel && "opacity-30",
                          n === null && "text-muted-foreground",
                          n !== null && n / max > 0.45 && "font-semibold text-white",
                        )}
                        style={
                          n === null
                            ? {
                                backgroundImage:
                                  "repeating-linear-gradient(135deg, #f1eff6 0 5px, #e2dfec 5px 7px)",
                              }
                            : { background: `rgb(31 110 158 / ${0.14 + 0.86 * (n / max)})` }
                        }
                      >
                        {n === null ? `<${minGroupSize}` : n}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          Fewer
          <span
            className="h-2 w-24 rounded-full"
            style={{ background: "linear-gradient(90deg, rgb(31 110 158 / 0.14), rgb(31 110 158 / 1))" }}
          />
          More
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="size-3 rounded-sm"
            style={{
              backgroundImage: "repeating-linear-gradient(135deg, #f1eff6 0 2px, #cfcbe0 2px 4px)",
            }}
          />
          Insufficient data (under {minGroupSize} prompts, hidden for privacy)
        </span>
      </div>
    </div>
  );
}
