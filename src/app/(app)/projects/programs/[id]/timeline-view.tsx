"use client";

import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { EmptyState, LoadState, Skeleton } from "@/components/ui";
import { ProjectKeyChip } from "@/components/projects/glyphs";
import { useProgram } from "@/components/projects/program-context";
import { taskHref } from "@/components/projects/work-list";
import {
  formatDay,
  roadmapRange,
  todayX,
  xOfDay,
} from "@/lib/projects/roadmap";
import type { WorkRow } from "@/lib/projects/programs";
import { INITIATIVE, PROGRAM, count } from "@/lib/projects/terms";
import { useWorkList } from "@/lib/store/programs";
import { useOrgTimezone } from "@/lib/store/session";
import { todayIn } from "@/lib/time";

/**
 * A program's initiatives on one timeline, a lane for each project.
 *
 * Each initiative with a due date is a marker on that day, in its project's
 * colour, with its name beside it. The API's list of work carries a due date and
 * not a start, so an initiative is shown where it is *due*, not as a bar from its
 * start, and its progress is on its own project's Timeline. Initiatives with no
 * date at all are listed under "Needs dates" rather than left out or guessed at.
 *
 * The scale is the project timeline's (`roadmap.ts`), so a month and a day are the
 * same width on both. It scrolls inside its own frame; the page does not.
 */

const LANE = 40;

export function TimelineView() {
  const { program } = useProgram();
  const timeZone = useOrgTimezone();
  const today = todayIn(timeZone);
  const list = useWorkList({
    programId: program.id,
    type: ["EPIC"],
    sort: "due",
    order: "asc",
    limit: 200,
  });

  const dated = list.rows.filter((r) => r.dueDate !== null);
  const undated = list.rows.filter((r) => r.dueDate === null);
  const range = roadmapRange({
    today,
    scheduled: dated.map((r) => ({ start: r.dueDate!, due: r.dueDate! })),
  });
  const lanes = new Map<string, { project: WorkRow; rows: WorkRow[] }>();
  for (const row of dated) {
    const lane = lanes.get(row.projectId) ?? { project: row, rows: [] };
    lane.rows.push(row);
    lanes.set(row.projectId, lane);
  }
  const ordered = [...lanes.values()].sort((a, b) =>
    a.project.projectName.localeCompare(b.project.projectName),
  );

  return (
    <LoadState
      loading={list.status === "loading"}
      error={
        list.status === "error" && list.rows.length === 0 ? list.error : null
      }
      subject="the timeline"
      onRetry={list.reload}
      hasData={list.rows.length > 0}
      skeleton={<Skeleton className="h-64" />}
    >
      {list.rows.length === 0 ? (
        <EmptyState
          icon={<CalendarRange />}
          title={`No ${INITIATIVE.many} in this ${PROGRAM.one} yet`}
          description={`An ${INITIATIVE.one} groups tasks toward one outcome. Add one in a project's Plan, and it shows up here by its due date.`}
        />
      ) : (
        <div className="space-y-5">
          {dated.length > 0 && (
            <div
              className="scroll-x rounded-lg border border-line bg-surface"
              role="group"
              aria-label={`${INITIATIVE.Many} by due date`}
            >
              <div
                className="relative"
                style={{ width: range.width, minWidth: "100%" }}
              >
                <div className="relative h-8 border-b border-line text-meta text-muted">
                  {range.months.map((month) => (
                    <span
                      key={month.day}
                      className="absolute top-0 flex h-8 items-center border-l border-line px-2"
                      style={{ left: month.x, width: month.width }}
                    >
                      {month.label}
                    </span>
                  ))}
                </div>
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-0 top-0 w-px bg-accent"
                  style={{ left: todayX(range, today) }}
                />
                {ordered.map((lane) => (
                  <div
                    key={lane.project.projectId}
                    className="border-b border-line last:border-b-0"
                  >
                    <div className="sticky left-0 flex items-center gap-2 px-3 pt-2 text-meta font-semibold text-muted">
                      <ProjectKeyChip
                        project={{
                          key: lane.project.projectKey,
                          color: lane.project.projectColor,
                        }}
                      />
                      <span className="truncate">
                        {lane.project.projectName}
                      </span>
                    </div>
                    <ul
                      className="relative"
                      style={{ height: lane.rows.length * LANE + 8 }}
                    >
                      {lane.rows.map((row, index) => (
                        <li
                          key={row.id}
                          className="absolute flex items-center gap-2"
                          style={{
                            left: xOfDay(range, row.dueDate!),
                            top: index * LANE + 4,
                            height: LANE - 6,
                          }}
                        >
                          <span
                            aria-hidden="true"
                            style={{ backgroundColor: row.projectColor }}
                            className="size-3 shrink-0 rotate-45 rounded-xs"
                          />
                          <Link
                            href={taskHref(row)}
                            className="whitespace-nowrap text-body-sm font-medium text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
                            title={`${row.key}, due ${formatDay(row.dueDate!, true)}`}
                          >
                            {row.title}
                            <span className="ml-2 text-meta font-normal text-muted">
                              {formatDay(row.dueDate!)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {undated.length > 0 && (
            <section aria-labelledby="needs-dates" className="space-y-2">
              <h2
                id="needs-dates"
                className="text-body-sm font-semibold text-ink"
              >
                Needs dates
              </h2>
              <p className="text-body-sm text-muted">
                {count(undated.length, "initiative")} with no due date, so there
                is nowhere on the timeline to put{" "}
                {undated.length === 1 ? "it" : "them"}.
              </p>
              <ul className="flex flex-wrap gap-2">
                {undated.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={taskHref(row)}
                      className="inline-flex max-w-full items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-body-sm text-ink hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
                    >
                      <ProjectKeyChip
                        project={{
                          key: row.projectKey,
                          color: row.projectColor,
                        }}
                      />
                      <span className="truncate">{row.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {list.hasMore && (
            <p className="text-body-sm text-muted" role="status">
              Showing the first {list.rows.length} {INITIATIVE.many}. Narrow it
              from a project&apos;s own Timeline.
            </p>
          )}
        </div>
      )}
    </LoadState>
  );
}
