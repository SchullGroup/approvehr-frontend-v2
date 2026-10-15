"use client";

import { useEffect, useMemo, useRef } from "react";
import { Plus } from "lucide-react";
import { Button, EmptyState, rowClick } from "@/components/ui";
import { TypeIcon } from "@/components/projects/glyphs";
import { useProject } from "@/components/projects/project-context";
import { percent } from "@/lib/projects/progress";
import {
  earliestRunningLeft,
  openingScroll,
  roadmapModel,
  type RoadmapRow,
} from "@/lib/projects/roadmap";
import type { Issue } from "@/lib/projects/types";

/**
 * The roadmap: epics on a timeline.
 *
 * Each epic with a start and a due date is a bar from one to the other, filled
 * as far as its issues are done (points-weighted, an issue with no points
 * counting as one, sub-tasks left out). The month header, the line for today and
 * the whole-pixel positions all come from `lib/projects/roadmap.ts`.
 *
 * The timeline scrolls inside its own box, so the page never scrolls sideways,
 * and the epic names stay put on the left while it does. It opens with today in
 * view. Click anywhere on an epic's row, or focus its bar and press Enter, to
 * open the drawer; the bar is the one tab stop a row has, and the name column is
 * a mouse convenience that says the same thing.
 */

const ROW = "h-14";
const HEAD = "h-14";
const LABEL_COLUMN = "w-40 sm:w-60";
const LABEL_CHAR_PX = 8;

export function RoadmapView() {
  const { project, issues, epics, canWork, today, openIssue, openCreate } =
    useProject();

  const model = useMemo(
    () => roadmapModel({ epics, issues, statuses: project.statuses, today }),
    [epics, issues, project.statuses, today],
  );

  /* Open with today in view, once. Editing an epic's dates must not drag the
     view back to today while somebody is looking at something further along. */
  const scroller = useRef<HTMLDivElement>(null);
  const positioned = useRef(false);
  const drawn = model.rows.length > 0;
  useEffect(() => {
    const el = scroller.current;
    if (!el || !drawn || positioned.current) return;
    const names = el.firstElementChild?.firstElementChild as HTMLElement | null;
    el.scrollLeft = openingScroll({
      todayX: model.todayX,
      earliestLeft: earliestRunningLeft(model.rows, model.todayX),
      viewWidth: el.clientWidth - (names?.offsetWidth ?? 0),
    });
    positioned.current = true;
  }, [drawn, model.todayX, model.rows]);

  const newEpic = () => openCreate({ type: "EPIC" });

  if (epics.length === 0) {
    return (
      <EmptyState
        title="No epics yet"
        description="Epics group related stories and tasks into larger bodies of work. Create one with a start and due date and it appears on the timeline."
        {...(canWork
          ? {
              action: (
                <Button variant="primary" onClick={newEpic}>
                  <Plus aria-hidden="true" className="size-4" />
                  New epic
                </Button>
              ),
            }
          : {})}
      />
    );
  }

  const { range } = model;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-h4 text-ink">Roadmap</h2>
          <p className="mt-1 text-body-sm text-muted">
            Epics on a timeline. Bars fill as their issues get done.
          </p>
        </div>
        {canWork && (
          <Button onClick={newEpic}>
            <Plus aria-hidden="true" className="size-4" />
            New epic
          </Button>
        )}
      </div>

      {drawn ? (
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <div ref={scroller} className="scroll-x">
            <div className="flex min-w-max">
              {/* Names. Sticky so they stay while the timeline scrolls under
                  them; opaque so what scrolls under them is not visible. */}
              <div
                aria-hidden="true"
                className={`sticky left-0 z-20 shrink-0 border-r border-line bg-surface ${LABEL_COLUMN}`}
              >
                <div
                  className={`flex items-end border-b border-line bg-sunken px-3 pb-2 text-meta font-semibold text-muted ${HEAD}`}
                >
                  Epic
                </div>
                {model.rows.map((row) => (
                  <div
                    key={row.epic.id}
                    onClick={rowClick<HTMLDivElement>(() =>
                      openIssue(row.epic),
                    )}
                    className={`flex cursor-pointer flex-col justify-center border-b border-line px-3 last:border-b-0 hover:bg-sunken ${ROW}`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <TypeIcon type="EPIC" />
                      <span
                        title={row.epic.title}
                        className="truncate text-body-sm font-medium text-ink"
                      >
                        {row.epic.title}
                      </span>
                    </span>
                    <span className="tabular truncate pl-7 text-meta text-muted">
                      {row.summary}
                    </span>
                  </div>
                ))}
              </div>

              <div className="relative shrink-0" style={{ width: range.width }}>
                <div
                  className={`relative border-b border-line bg-sunken ${HEAD}`}
                >
                  {range.months.map((month) => (
                    <span
                      key={month.day}
                      className="absolute top-2 whitespace-nowrap pl-2 text-meta font-medium text-muted"
                      style={{ left: month.x }}
                    >
                      {month.label}
                    </span>
                  ))}
                </div>

                {/* Month lines and the line for today, behind the bars. */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                >
                  {range.months.map((month, index) =>
                    index === 0 ? null : (
                      <span
                        key={month.day}
                        className="absolute inset-y-0 border-l border-line"
                        style={{ left: month.x }}
                      />
                    ),
                  )}
                  <span
                    className="absolute bottom-0 top-8 flex -translate-x-1/2 flex-col items-center"
                    style={{ left: model.todayX }}
                  >
                    <span className="rounded-sm bg-danger-fill px-1.5 text-meta font-semibold text-white">
                      Today
                    </span>
                    <span className="w-0.5 flex-1 bg-danger-fill" />
                  </span>
                </div>

                <ul aria-label="Epics on the timeline">
                  {model.rows.map((row) => (
                    <li
                      key={row.epic.id}
                      onClick={rowClick<HTMLLIElement>(() =>
                        openIssue(row.epic),
                      )}
                      className={`relative cursor-pointer border-b border-line last:border-b-0 ${ROW}`}
                    >
                      <Bar row={row} onOpen={() => openIssue(row.epic)} />
                      {!row.labelInside && (
                        <OutsideLabel row={row} width={range.width} />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-body-sm text-muted">
          None of these epics has both a start and a due date yet, so there is
          nothing to draw. Open one to set them.
        </p>
      )}

      {model.undated.length > 0 && (
        <Undated epics={model.undated} onOpen={openIssue} />
      )}
    </div>
  );
}

/**
 * One epic's bar: a track, a fill to the epic's progress, and its label.
 *
 * The label is written twice and clipped — ink over the unfilled part, light over
 * the fill — so it keeps its contrast on both halves in both themes. Only the
 * ink copy is exposed to a screen reader; the button's own name carries the
 * dates and the count.
 */
function Bar({ row, onOpen }: { row: RoadmapRow; onOpen: () => void }) {
  const fill = row.progress.ratio === null ? 0 : percent(row.progress.ratio);
  const label = (className: string, clip?: string) => (
    <span
      aria-hidden="true"
      className={`absolute inset-0 flex items-center overflow-hidden whitespace-nowrap px-2 text-meta font-semibold ${className}`}
      {...(clip ? { style: { clipPath: clip } } : {})}
    >
      {row.label}
    </span>
  );
  return (
    <button
      type="button"
      onClick={onOpen}
      title={row.description}
      aria-label={row.description}
      className="absolute top-1/2 z-10 block h-8 -translate-y-1/2 overflow-hidden rounded-md border border-accent-line bg-accent-soft text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
      style={{ left: row.left, width: row.width }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 bg-cat-1"
        style={{ width: `${fill}%` }}
      />
      {row.labelInside && (
        <>
          {label("text-ink")}
          {fill > 0 && label("text-canvas", `inset(0 ${100 - fill}% 0 0)`)}
        </>
      )}
    </button>
  );
}

/**
 * The label of a bar too short to hold it, written beside it: to the right, or to
 * the left when the right would run past the end of the timeline.
 */
function OutsideLabel({ row, width }: { row: RoadmapRow; width: number }) {
  const room = width - (row.left + row.width);
  const needs = row.label.length * LABEL_CHAR_PX + 16;
  const onLeft = room < needs;
  return (
    <span
      aria-hidden="true"
      className="tabular absolute top-1/2 -translate-y-1/2 whitespace-nowrap px-2 text-meta font-semibold text-ink"
      style={
        onLeft ? { right: width - row.left } : { left: row.left + row.width }
      }
    >
      {row.label}
    </span>
  );
}

function Undated({
  epics,
  onOpen,
}: {
  epics: Issue[];
  onOpen: (epic: Issue) => void;
}) {
  return (
    <section
      aria-label="Epics that need dates"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-sunken px-4 py-3"
    >
      <h3 className="mr-1 text-body-sm font-semibold text-ink">
        Epics that need dates
      </h3>
      {epics.map((epic) => (
        <Button key={epic.id} size="sm" onClick={() => onOpen(epic)}>
          <TypeIcon type="EPIC" />
          <span className="tabular">{epic.key}</span>
          <span aria-hidden="true">·</span>
          <span className="max-w-[14rem] truncate">{epic.title}</span>
        </Button>
      ))}
    </section>
  );
}
