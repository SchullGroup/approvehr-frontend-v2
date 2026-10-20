"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import {
  Button,
  ButtonLink,
  EmptyState,
  Select,
  type BadgeTone,
} from "@/components/ui";
import { DragGhost, useDragInto } from "@/components/ui/drag-into";
import { cn } from "@/lib/cn";
import { IssueCard } from "@/components/projects/issue-card";
import { IssueFilterBar } from "@/components/projects/issue-filter-bar";
import { PersonAvatar } from "@/components/projects/person";
import { useProject } from "@/components/projects/project-context";
import { TypeIcon } from "@/components/projects/glyphs";
import { CompleteSprintDialog } from "@/components/projects/sprint-dialogs";
import { useQueryParam } from "@/components/projects/use-query-param";
import {
  SWIMLANE_LABEL,
  boardScope,
  columnIssues,
  decodeDropTarget,
  encodeDropTarget,
  laneGroups,
  resolveDrop,
  sprintStrip,
  type Swimlanes,
} from "@/lib/projects/board";
import { applyFilter, isFiltering } from "@/lib/projects/filters";
import { sprintPoints } from "@/lib/projects/progress";
import type { Issue, StatusCategory } from "@/lib/projects/types";
import { isDone, sortStatuses, wipState } from "@/lib/projects/workflow";
import { shortDate } from "@/lib/today";

/**
 * The board: a Scrum project's active sprint, or a Kanban project's flow.
 *
 * Columns are the project's statuses in order; each shows how many issues it
 * holds, against its WIP limit if it has one (red once over — advisory, nothing
 * blocks). Swimlanes split the same columns by assignee or by epic, and dropping
 * a card into another lane changes that field too.
 *
 * The drag is the house one (`useDragInto`: pointer events, so it works on touch
 * and in a test) rather than the browser's HTML5 drag. Every card also has a
 * "Move to…" menu and the drawer has a Status field, so nothing needs a drag.
 */

const CATEGORY_RULE: Record<StatusCategory, string> = {
  TODO: "border-t-line-strong",
  IN_PROGRESS: "border-t-accent",
  DONE: "border-t-success-strong",
};

const COLUMN_WIDTH = "17.5rem";

export function BoardView() {
  const {
    project,
    issues,
    sprints,
    issueById,
    filter,
    meId,
    people,
    actions,
    canWork,
    canManage,
    today,
    dayOf,
    openIssue,
    openCreate,
  } = useProject();

  const [lanesParam, setLanesParam] = useQueryParam("lanes", "none");
  const [completing, setCompleting] = useState(false);
  const mode: Swimlanes =
    lanesParam === "assignee" || lanesParam === "epic" ? lanesParam : "none";

  const statuses = useMemo(
    () => sortStatuses(project.statuses),
    [project.statuses],
  );
  const scope = useMemo(
    () =>
      boardScope({
        project,
        issues,
        sprints,
        today,
        doneDayOf: dayOf,
      }),
    [project, issues, sprints, today, dayOf],
  );
  const shown = useMemo(
    () => applyFilter(scope.issues, filter, meId),
    [scope.issues, filter, meId],
  );
  const lanes = useMemo(
    () =>
      laneGroups({
        mode,
        issues: shown,
        allIssues: issues,
        nameOf: people.nameOf,
      }),
    [mode, shown, issues, people.nameOf],
  );

  /** Every cell of the grid, in display order, by its drop id. */
  const cells = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const lane of lanes) {
      for (const status of statuses) {
        map.set(
          encodeDropTarget({ statusId: status.id, laneKey: lane.key }),
          columnIssues(project.statuses, status, lane.items),
        );
      }
    }
    return map;
  }, [lanes, statuses, project.statuses]);

  const columnCount = useCallback(
    (statusId: string) => {
      let n = 0;
      for (const lane of lanes) {
        n +=
          cells.get(encodeDropTarget({ statusId, laneKey: lane.key }))
            ?.length ?? 0;
      }
      return n;
    },
    [lanes, cells],
  );

  const drop = useCallback(
    (movedId: string, targetId: string, point: { x: number; y: number }) => {
      const issue = issueById.get(movedId);
      const target = decodeDropTarget(targetId);
      if (!issue || !target) return;
      const cell = cells.get(targetId) ?? [];
      const patch = resolveDrop({
        issue,
        target,
        cell,
        beforeId: cardBefore(targetId, point.y, issue.id),
        mode,
        memberIds: project.memberIds,
      });
      if (patch) void actions.patchIssue(issue, patch);
    },
    [issueById, cells, mode, project.memberIds, actions],
  );

  const onDrop = useCallback(
    (
      moved: { id: string },
      targetId: string,
      point: { x: number; y: number },
    ) => drop(moved.id, targetId, point),
    [drop],
  );
  const canDrop = useCallback(() => canWork, [canWork]);
  const { drag, start } = useDragInto({ onDrop, canDrop });
  const held = drag ? issueById.get(drag.id) : undefined;

  const moveTo = (issue: Issue, statusId: string) => {
    const target = encodeDropTarget({ statusId, laneKey: "all" });
    const cell = columnIssues(
      project.statuses,
      statuses.find((s) => s.id === statusId)!,
      shown,
    );
    const patch = resolveDrop({
      issue,
      target: decodeDropTarget(target)!,
      cell,
      beforeId: null,
      mode: "none",
      memberIds: project.memberIds,
    });
    if (patch) void actions.patchIssue(issue, patch);
  };

  const sprint = scope.sprint;

  /* Kept mounted across the board becoming "No active sprint": completing the
     sprint is exactly what removes the header it was opened from, and the dialog
     should leave the way it arrived. A `key`, so it is the same dialog in both. */
  const completeDialog = (
    <CompleteSprintDialog
      key="complete-sprint"
      sprint={sprint}
      open={completing}
      onClose={() => setCompleting(false)}
    />
  );

  /* Scrum with nothing started: the board has nothing to show, and the next
     step is the backlog. */
  if (project.type === "SCRUM" && !scope.sprint) {
    return (
      <div className="space-y-6">
        <EmptyState
          title="No active sprint"
          description="Plan a sprint in the backlog and start it. Its issues show up here as columns you can move work across."
          action={
            <ButtonLink
              variant="primary"
              href={`/projects/${project.id}?view=backlog`}
            >
              Go to the backlog
            </ButtonLink>
          }
        />
        {completeDialog}
      </div>
    );
  }

  const filtering = isFiltering(filter);

  return (
    <div className="space-y-5">
      {sprint ? (
        <SprintHeader
          {...(canManage ? { onComplete: () => setCompleting(true) } : {})}
        />
      ) : (
        <div>
          <h2 className="text-h4 text-ink">Kanban board</h2>
          <p className="mt-1 text-body-sm text-muted">
            Continuous flow. Done work drops off after 14 days.
          </p>
        </div>
      )}

      <IssueFilterBar
        extra={
          <div className="w-[calc(50%-0.5rem)] sm:w-52">
            <Select
              aria-label="Swimlanes"
              value={mode}
              onChange={(event) => setLanesParam(event.target.value, "replace")}
            >
              {(Object.keys(SWIMLANE_LABEL) as Swimlanes[]).map((key) => (
                <option key={key} value={key}>
                  {SWIMLANE_LABEL[key]}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      <div className="scroll-x -mx-5 px-5 pb-2 sm:-mx-7 sm:px-7">
        <div className="min-w-max space-y-4">
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${statuses.length}, ${COLUMN_WIDTH})`,
            }}
          >
            {statuses.map((status) => {
              const count = columnCount(status.id);
              const state = wipState(count, status.wipLimit);
              return (
                <div
                  key={status.id}
                  className={cn(
                    /* `relative` is load-bearing: the count carries `sr-only` text,
                       which is absolutely positioned, and without a positioned
                       ancestor inside the scroller its containing block is the page —
                       so it escapes the board's clipping and widens the document
                       (and on a phone, the whole layout viewport). */
                    "relative flex items-center gap-2 rounded-lg border border-t-[3px] border-line bg-sunken px-3 py-2.5",
                    CATEGORY_RULE[status.category],
                  )}
                >
                  <h3 className="min-w-0 flex-1 truncate text-body-sm font-semibold text-ink">
                    {status.name}
                  </h3>
                  <span
                    className={cn(
                      "tabular text-body-sm",
                      state === "over"
                        ? "font-semibold text-danger-text"
                        : "text-muted",
                    )}
                    title={
                      status.wipLimit !== null
                        ? `Limit ${status.wipLimit}`
                        : undefined
                    }
                  >
                    <span className="sr-only">
                      {state === "over"
                        ? `${count} issues, over the limit of ${status.wipLimit}`
                        : `${count} issues`}
                    </span>
                    <span aria-hidden="true">
                      {count}
                      {status.wipLimit !== null ? `/${status.wipLimit}` : ""}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          {lanes.map((lane) => (
            <section
              key={lane.key}
              aria-label={lane.label ?? "Issues"}
              className="space-y-2"
            >
              {lane.label !== null && (
                <h3 className="sticky left-0 flex w-fit items-center gap-2 text-body-sm font-semibold text-ink">
                  {lane.kind === "assignee" && (
                    <PersonAvatar
                      people={people}
                      id={lane.key === "none" ? null : lane.key}
                    />
                  )}
                  {lane.kind === "epic" && lane.key !== "none" && (
                    <TypeIcon type="EPIC" />
                  )}
                  <span>{lane.label}</span>
                  <span className="tabular font-normal text-muted">
                    {lane.items.length}
                  </span>
                </h3>
              )}
              <div
                className="grid items-start gap-3"
                style={{
                  gridTemplateColumns: `repeat(${statuses.length}, ${COLUMN_WIDTH})`,
                }}
              >
                {statuses.map((status) => {
                  const id = encodeDropTarget({
                    statusId: status.id,
                    laneKey: lane.key,
                  });
                  const items = cells.get(id) ?? [];
                  const over = drag?.over === id;
                  return (
                    <ul
                      key={id}
                      data-drop-id={id}
                      aria-label={`${status.name}${lane.label ? `, ${lane.label}` : ""}`}
                      className={cn(
                        "flex min-h-24 flex-col gap-2 rounded-lg border p-2 transition-colors",
                        over
                          ? "border-accent bg-accent-soft"
                          : "border-transparent bg-sunken",
                      )}
                    >
                      {items.map((issue) => (
                        <li key={issue.id}>
                          <IssueCard
                            issue={issue}
                            parent={
                              issue.parentId
                                ? (issueById.get(issue.parentId) ?? null)
                                : null
                            }
                            epic={
                              issue.epicId
                                ? (issueById.get(issue.epicId) ?? null)
                                : null
                            }
                            statuses={statuses}
                            people={people}
                            today={today}
                            done={isDone(project.statuses, issue)}
                            dragging={drag?.id === issue.id}
                            canMove={canWork}
                            onGrab={start(issue.id, "issue")}
                            onOpen={() => openIssue(issue)}
                            onMove={(statusId) => moveTo(issue, statusId)}
                          />
                        </li>
                      ))}
                      {items.length === 0 && (
                        <li className="flex flex-1 items-center justify-center rounded-md border border-dashed border-line-strong px-3 py-5 text-center text-meta text-faint">
                          {canWork ? "Drop an issue here" : "Nothing here"}
                        </li>
                      )}
                    </ul>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      {shown.length === 0 && !filtering && (
        <div className="flex flex-wrap items-center gap-3 text-body-sm text-muted">
          <span>
            {project.type === "KANBAN"
              ? "No issues yet."
              : "This sprint has no issues."}
          </span>
          {project.type === "KANBAN" ? (
            canWork && (
              <Button size="sm" onClick={() => openCreate()}>
                <Plus aria-hidden="true" className="size-4" />
                Create the first one
              </Button>
            )
          ) : (
            <Link
              className="font-medium text-accent-text underline-offset-4 hover:underline"
              href={`/projects/${project.id}?view=backlog`}
            >
              Add some from the backlog
            </Link>
          )}
        </div>
      )}
      {shown.length === 0 && filtering && (
        <p className="text-body-sm text-muted">
          No issues match these filters.
        </p>
      )}

      {drag && held && (
        <DragGhost x={drag.x} y={drag.y}>
          <span className="tabular text-muted">{held.key}</span> {held.title}
        </DragGhost>
      )}

      {completeDialog}
    </div>
  );
}

/** The card a drop at `y` landed in front of, or null for the end of the cell. */
function cardBefore(
  targetId: string,
  y: number,
  movingId: string,
): string | null {
  const cell = [
    ...document.querySelectorAll<HTMLElement>("[data-drop-id]"),
  ].find((el) => el.dataset["dropId"] === targetId);
  if (!cell) return null;
  const cards = [
    ...cell.querySelectorAll<HTMLElement>("[data-card-id]"),
  ].filter((el) => el.dataset["cardId"] !== movingId);
  for (const card of cards) {
    const box = card.getBoundingClientRect();
    if (y < box.top + box.height / 2) return card.dataset["cardId"] ?? null;
  }
  return null;
}

function SprintHeader({ onComplete }: { onComplete?: () => void }) {
  const { project, issues, sprints, today } = useProject();
  const sprint = sprints.find((s) => s.state === "ACTIVE");
  if (!sprint) return null;
  const { left, late } = sprintStrip(sprint, today);
  const points = sprintPoints(project.statuses, issues, sprint);
  const tone: BadgeTone = late ? "danger" : "neutral";
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-h4 text-ink">{sprint.name}</h2>
        {onComplete && (
          <Button size="sm" onClick={onComplete}>
            Complete sprint
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-body-sm text-muted">
        {sprint.goal && <span>{sprint.goal}</span>}
        {sprint.startDate && sprint.endDate && (
          <span className="tabular">
            {shortDate(sprint.startDate)} – {shortDate(sprint.endDate)}
          </span>
        )}
        {left !== null && (
          <span
            className={cn(
              "tabular rounded-full border px-2.5 py-0.5 text-meta font-medium",
              tone === "danger"
                ? "border-danger-line bg-danger-soft text-danger-text"
                : "border-line bg-surface text-body",
            )}
          >
            {late
              ? `${Math.abs(left)} ${Math.abs(left) === 1 ? "day" : "days"} over`
              : `${left} ${left === 1 ? "day" : "days"} left`}
          </span>
        )}
        <span>
          <strong className="tabular font-semibold text-ink">
            {points.done}
          </strong>{" "}
          of{" "}
          <strong className="tabular font-semibold text-ink">
            {points.total}
          </strong>{" "}
          points done
        </span>
      </div>
    </div>
  );
}
