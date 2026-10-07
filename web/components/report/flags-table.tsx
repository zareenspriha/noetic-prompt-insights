"use client";

import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_datetime,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { SeverityBadge } from "@/components/shared/severity-badge";
import { TOPIC_LABEL } from "@/lib/tokens";
import { SEVERITIES, type Flag } from "@/types/api";

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, datetime: sortFn_datetime },
});
const helper = createColumnHelper<typeof features, Flag>();

const columns = helper.columns([
  helper.accessor("severity", {
    header: "Severity",
    // Ascending = low → critical; the table reverses for desc.
    sortFn: (a, b, id) =>
      SEVERITIES.indexOf(a.getValue(id) as Flag["severity"]) -
      SEVERITIES.indexOf(b.getValue(id) as Flag["severity"]),
    cell: (info) => <SeverityBadge severity={info.getValue()} />,
  }),
  helper.accessor("timestamp", {
    header: "When",
    sortFn: "datetime",
    cell: (info) =>
      new Date(info.getValue()).toLocaleString("en-US", {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
      }),
  }),
  helper.accessor("teamId", { header: "Team", sortFn: "alphanumeric" }),
  helper.accessor("topic", {
    header: "Topic",
    sortFn: "alphanumeric",
    cell: (info) => TOPIC_LABEL[info.getValue()],
  }),
  helper.accessor("reason", { header: "Reason", sortFn: "alphanumeric" }),
  helper.accessor("textRedacted", {
    header: "Prompt (redacted)",
    enableSorting: false,
    cell: (info) => (
      <span className="block max-w-[28rem] truncate font-mono text-xs text-foreground/80" title={info.getValue()}>
        {info.getValue()}
      </span>
    ),
  }),
]);

export function FlagsTable({ flags }: { flags: Flag[] }) {
  const table = useTable({
    features,
    columns,
    data: flags,
    initialState: { sorting: [{ id: "severity", desc: true }] },
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <caption className="sr-only">Prompts flagged as sensitive this week, with redacted text</caption>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id} className="border-b border-white/5">
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const canSort = header.column.getCanSort();
                const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    className="px-3 py-2 text-left text-xs font-medium text-muted-foreground"
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        <table.FlexRender header={header} />
                        <Icon className={sorted ? "size-3 text-primary" : "size-3 opacity-40"} aria-hidden />
                      </button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
              {row.getAllCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2.5 align-middle whitespace-nowrap">
                  <table.FlexRender cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
