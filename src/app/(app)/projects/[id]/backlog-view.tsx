"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, IconButton, useToast } from "@/components/ui";
import { DragGhost, useDragInto } from "@/components/ui/drag-into";
import { cn } from "@/lib/cn";
import { BacklogRow } from "@/components/projects/backlog-row";
import { IssueFilterBar } from "@/components/projects/issue-filter-bar";
import { useProject } from "@/components/projects/project-context";
import { QuickAdd } from "@/components/projects/quick-add";
import {
  CompleteSprintDialog,
  DeleteSprintDialog,
  SprintFormDialog,
} from "@/components/projects/sprint-dialogs";
import {
  BACKLOG,
  buildBacklog,
  decodeChoice,
  listFor,
  moveOptions,
  resolveBacklogMove,
  resolveChoice,
  type SprintSection,
} from "@/lib/projects/backlog";
import { applyFilter, isFiltering } from "@/lib/projects/filters";
import { nextSprintDraft, startBlocker } from "@/lib/projects/sprints";
import type { Issue } from "@/lib/projects/types";
import { effectiveStatus, isDone } from "@/lib/projects/workflow";
import { shortDate } from "@/lib/today";

/**
 * The backlog: where the work is ordered and planned into sprints.
 *
 * A Scrum project is a list per sprint (the running one first) and then the
 * backlog; a Kanban project is one ordered queue. Rows are dragged between lists
 * to plan and within one to order — the top of a list is picked up first — and
 * every one of those moves can also be made from the row's "Move to…" menu or the
 * drawer's Sprint field, so nothing needs a pointer.
 *
 * What a move changes is decided in `lib/projects/backlog.ts`; this file draws the
 * lists and sends what it returns. Sprint figures in a header are the sprint's
 * own and ignore the filter — a filter narrows the rows, not the plan.
 *
 * Starting, completing, editing and deleting a sprint are the lead's and HR's
 * (`canManage`); anyone in the project can create a sprint and plan by moving.
 */

type DialogKind = "start" | "edit" | "complete" | "delete";

export function BacklogView() {
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
  } = useProject();
  const router = useRouter();
  const toast = useToast();
  const scrum = project.type === "SCRUM";

  const layout = useMemo(
    () =>
      buildBacklog({
        project,
        issues,
        sprints,
        today,
        doneDayOf: dayOf,
        visible: isFiltering(filter)
          ? (issue) => applyFilter([issue], filter, meId).length > 0
          : () => true,
      }),
    [project, issues, sprints, today, dayOf, filter, meId],
  );
  const filtering = isFiltering(filter);

  /* ------------------------------------------------------------- the drag -- */

  const onDrop = useCallback(
    (
      moved: { id: string },
      section: string,
      point: { x: number; y: number },
    ) => {
      const issue = issueById.get(moved.id);
      if (!issue) return;
      const patch = resolveBacklogMove({
        issue,
        section,
        siblings: listFor(layout, section),
        beforeId: rowBefore(section, point.y, issue.id),
        scrum,
      });
      if (patch) void actions.patchIssue(issue, patch);
    },
    [issueById, layout, scrum, actions],
  );
  const canDrop = useCallback(() => canWork, [canWork]);
  const { drag, start } = useDragInto({ onDrop, canDrop });
  const held = drag ? issueById.get(drag.id) : undefined;

  /* A line above the row the drop would land in front of. Drawn on the DOM
     rather than held in state: it follows the pointer, and a state update per
     pointer move for a one-pixel rule is not worth the render. */
  useEffect(() => {
    if (!drag?.over) return;
    const before = rowBefore(drag.over, drag.y, drag.id);
    const row = before
      ? [...document.querySelectorAll<HTMLElement>("[data-row-id]")].find(
          (el) => el.dataset["rowId"] === before,
        )
      : undefined;
    row?.setAttribute("data-drop-before", "true");
    return () => row?.removeAttribute("data-drop-before");
  }, [drag]);

  /* ------------------------------------------------- the non-drag path -- */

  const choose = useCallback(
    async (issue: Issue, value: string) => {
      const choice = decodeChoice(value);
      if (!choice) return;
      const patch = resolveChoice({
        issue,
        choice,
        layout,
        sprints,
        statuses: project.statuses,
      });
      if (!patch) return;
      const result = await actions.patchIssue(issue, patch);
      if (!result.ok) return;
      const where =
        choice.kind === "top"
          ? "the top of the list"
          : choice.kind === "bottom"
            ? "the bottom of the list"
            : choice.section === BACKLOG
              ? "the backlog"
              : (sprints.find((s) => s.id === choice.section)?.name ??
                "the sprint");
      toast.push({ tone: "success", title: `${issue.key} moved to ${where}` });
    },
    [layout, sprints, project.statuses, actions, toast],
  );

  /* ----------------------------------------------------------- the sprints -- */

  const [dialog, setDialog] = useState<{
    kind: DialogKind;
    sprintId: string;
    open: boolean;
  }>({ kind: "start", sprintId: "", open: false });
  const show = (kind: DialogKind, sprintId: string) =>
    setDialog({ kind, sprintId, open: true });
  const hide = () => setDialog((d) => ({ ...d, open: false }));
  const target = sprints.find((s) => s.id === dialog.sprintId) ?? null;
  const forKind = (kind: DialogKind) => (dialog.kind === kind ? target : null);

  const [creating, setCreating] = useState(false);
  async function createSprint() {
    if (creating) return;
    setCreating(true);
    const result = await actions.createSprint(
      nextSprintDraft(project, sprints, today),
    );
    setCreating(false);
    if (result.ok) {
      toast.push({ tone: "success", title: `${result.value.name} created` });
    }
  }

  /* ---------------------------------------------------------------- the page -- */

  const noSprintYet = scrum && layout.sprints.length === 0;

  const rowFor = (issue: Issue) => (
    <BacklogRow
      key={issue.id}
      issue={issue}
      epic={issue.epicId ? (issueById.get(issue.epicId) ?? null) : null}
      status={effectiveStatus(project.statuses, issue.statusId)}
      people={people}
      done={isDone(project.statuses, issue)}
      dragging={drag?.id === issue.id}
      canMove={canWork}
      hasSprints={scrum}
      options={moveOptions({
        issue,
        layout,
        sprints,
        statuses: project.statuses,
      })}
      onGrab={start(issue.id, "issue")}
      onOpen={() => openIssue(issue)}
      onChoose={(value) => void choose(issue, value)}
    />
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-h4 text-ink">Backlog</h2>
          <p className="mt-1 text-body-sm text-muted">
            {scrum
              ? "Plan sprints by dragging issues into them, or use Move to on a row. The top of each list comes first."
              : "Order the queue. The top of the list gets picked up first. Done work drops off after 14 days."}
          </p>
        </div>
        {canWork && scrum && !noSprintYet && (
          <Button onClick={() => void createSprint()} loading={creating}>
            <Plus aria-hidden="true" className="size-4" />
            Create sprint
          </Button>
        )}
      </div>

      <IssueFilterBar />

      {noSprintYet && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-line-strong px-4 py-4">
          <div className="min-w-0">
            <p className="font-semibold text-ink">
              {sprints.length === 0 ? "No sprints yet" : "No sprint is planned"}
            </p>
            <p className="mt-0.5 text-body-sm text-muted">
              {canWork
                ? "Create one, then drag issues into it to plan the work."
                : "A sprint has not been planned yet."}
            </p>
          </div>
          {canWork && (
            <Button
              variant="primary"
              onClick={() => void createSprint()}
              loading={creating}
            >
              <Plus aria-hidden="true" className="size-4" />
              {sprints.length === 0
                ? "Create your first sprint"
                : "Create sprint"}
            </Button>
          )}
        </div>
      )}

      {layout.sprints.map((section) => (
        <SprintBlock
          key={section.sprint.id}
          section={section}
          filtering={filtering}
          over={drag?.over === section.sprint.id}
          canWork={canWork}
          canManage={canManage}
          blocker={startBlocker(section.sprint, sprints, issues)}
          rowFor={rowFor}
          onStart={() => show("start", section.sprint.id)}
          onEdit={() => show("edit", section.sprint.id)}
          onComplete={() => show("complete", section.sprint.id)}
          onDelete={() => show("delete", section.sprint.id)}
        />
      ))}

      <ListFrame
        id={BACKLOG}
        over={drag?.over === BACKLOG}
        heading="Backlog"
        info={[
          `${layout.backlog.count} ${layout.backlog.count === 1 ? "issue" : "issues"}`,
          `${layout.backlog.points} pts`,
          ...(filtering && layout.backlog.shown.length < layout.backlog.count
            ? [`${layout.backlog.shown.length} shown`]
            : []),
        ]}
      >
        <RowList>
          {layout.backlog.shown.map(rowFor)}
          {layout.backlog.shown.length === 0 && (
            <EmptyRow>
              {filtering && layout.backlog.count > 0
                ? "No issues here match these filters."
                : canWork
                  ? "Your backlog is empty. Add an issue below."
                  : "Your backlog is empty."}
            </EmptyRow>
          )}
        </RowList>
        {canWork && <QuickAdd label="the backlog" sprintId={null} />}
      </ListFrame>

      {drag && held && (
        <DragGhost x={drag.x} y={drag.y}>
          <span className="tabular text-muted">{held.key}</span> {held.title}
        </DragGhost>
      )}

      <SprintFormDialog
        mode="start"
        sprint={forKind("start")}
        open={dialog.open && dialog.kind === "start"}
        onClose={hide}
        onStarted={() => router.push(`/projects/${project.id}`)}
      />
      <SprintFormDialog
        mode="edit"
        sprint={forKind("edit")}
        open={dialog.open && dialog.kind === "edit"}
        onClose={hide}
      />
      <CompleteSprintDialog
        sprint={forKind("complete")}
        open={dialog.open && dialog.kind === "complete"}
        onClose={hide}
      />
      <DeleteSprintDialog
        sprint={forKind("delete")}
        open={dialog.open && dialog.kind === "delete"}
        onClose={hide}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ pieces -- */

function SprintBlock({
  section,
  filtering,
  over,
  canWork,
  canManage,
  blocker,
  rowFor,
  onStart,
  onEdit,
  onComplete,
  onDelete,
}: {
  section: SprintSection;
  filtering: boolean;
  over: boolean;
  canWork: boolean;
  canManage: boolean;
  blocker: string | null;
  rowFor: (issue: Issue) => React.ReactNode;
  onStart: () => void;
  onEdit: () => void;
  onComplete: () => void;
  onDelete: () => void;
}) {
  const { sprint, shown, count, points, done } = section;
  const active = sprint.state === "ACTIVE";
  const hintId = `start-blocker-${sprint.id}`;
  const info = [
    ...(sprint.startDate && sprint.endDate
      ? [`${shortDate(sprint.startDate)} – ${shortDate(sprint.endDate)}`]
      : []),
    `${count} ${count === 1 ? "issue" : "issues"}`,
    `${points} pts`,
    ...(count > 0 ? [`${done} done`] : []),
    ...(filtering && shown.length < count ? [`${shown.length} shown`] : []),
  ];

  return (
    <ListFrame
      id={sprint.id}
      over={over}
      heading={sprint.name}
      badge={
        <Badge tone={active ? "accent" : "neutral"} size="sm">
          {active ? "Active" : "Planned"}
        </Badge>
      }
      info={info}
      controls={
        canManage && (
          <>
            {active ? (
              <Button size="sm" onClick={onComplete}>
                Complete sprint
              </Button>
            ) : (
              <Button
                size="sm"
                variant={blocker ? "secondary" : "primary"}
                disabled={blocker !== null}
                {...(blocker ? { "aria-describedby": hintId } : {})}
                onClick={onStart}
              >
                Start sprint
              </Button>
            )}
            <IconButton
              label={`Edit ${sprint.name}`}
              size="sm"
              onClick={onEdit}
            >
              <Pencil aria-hidden="true" className="size-4" />
            </IconButton>
            {!active && (
              <IconButton
                label={`Delete ${sprint.name}`}
                size="sm"
                onClick={onDelete}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </IconButton>
            )}
          </>
        )
      }
      note={
        <>
          {sprint.goal && <p>Goal: {sprint.goal}</p>}
          {canManage && !active && blocker && (
            <p id={hintId} className="text-muted">
              {blocker}
            </p>
          )}
        </>
      }
    >
      <RowList>
        {shown.map(rowFor)}
        {shown.length === 0 && (
          <EmptyRow>
            {filtering && count > 0
              ? "No issues here match these filters."
              : canWork
                ? "Drag issues here from the backlog to plan this sprint."
                : "No issues are planned into this sprint."}
          </EmptyRow>
        )}
      </RowList>
      {canWork && <QuickAdd label={sprint.name} sprintId={sprint.id} />}
    </ListFrame>
  );
}

/**
 * One list's card: a header, then its rows, then the quick row. The whole card is
 * the drop target, header and empty space included, so a sprint can be dropped on
 * without aiming at a row.
 */
function ListFrame({
  id,
  over,
  heading,
  badge,
  info,
  controls,
  note,
  children,
}: {
  id: string;
  over: boolean;
  heading: string;
  badge?: React.ReactNode;
  info: string[];
  controls?: React.ReactNode;
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      data-drop-id={id}
      aria-label={heading}
      className={cn(
        "overflow-hidden rounded-lg border bg-surface transition-colors",
        over ? "border-accent ring-2 ring-accent/30" : "border-line",
      )}
    >
      <div className="space-y-1 border-b border-line bg-canvas px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h3 className="text-body-sm font-semibold text-ink">{heading}</h3>
          {badge}
          <p className="tabular flex flex-wrap gap-x-3 text-meta text-muted">
            {info.map((part) => (
              <span key={part}>{part}</span>
            ))}
          </p>
          {controls && (
            <div className="ml-auto flex items-center gap-1.5">{controls}</div>
          )}
        </div>
        {note && (
          <div className="space-y-0.5 text-body-sm text-body">{note}</div>
        )}
      </div>
      {children}
    </section>
  );
}

function RowList({ children }: { children: React.ReactNode }) {
  return <ul className="min-h-12">{children}</ul>;
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <li className="px-4 py-4 text-center text-body-sm text-muted">
      {children}
    </li>
  );
}

/**
 * The row a drop at `y` landed in front of, or null for the end of the list.
 * Read from the rows on screen — the filtered ones — which is why
 * `resolveBacklogMove` is then given the whole list to rank against.
 */
function rowBefore(
  section: string,
  y: number,
  movingId: string,
): string | null {
  const frame = [
    ...document.querySelectorAll<HTMLElement>("[data-drop-id]"),
  ].find((el) => el.dataset["dropId"] === section);
  if (!frame) return null;
  const rows = [...frame.querySelectorAll<HTMLElement>("[data-row-id]")].filter(
    (el) => el.dataset["rowId"] !== movingId,
  );
  for (const row of rows) {
    const box = row.getBoundingClientRect();
    if (y < box.top + box.height / 2) return row.dataset["rowId"] ?? null;
  }
  return null;
}
