"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRightLeft, GripVertical, ListChecks } from "lucide-react";
import { Avatar, Badge, Button, EmptyState, useToast } from "@/components/ui";
import { useDragInto } from "@/components/ui/drag-into";
import {
  BoardGhost,
  useFlip,
  type Settle,
} from "@/components/projects/board-motion";
import { IssueKey } from "@/components/projects/glyphs";
import { projectsApi, type PersonalTask } from "@/lib/api/projects";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { dueLabel, isPastDue, nowHHMMIn } from "@/lib/projects/due";
import { assigneeSummary, rowTarget } from "@/lib/projects/my-tasks";
import {
  BOARD_COLUMNS,
  cannotMoveReason,
  firstStatusIn,
  groupByCategory,
  projectIsReadOnly,
  stageNote,
  withMove,
} from "@/lib/projects/my-tasks-board";
import { CATEGORY_LABEL } from "@/lib/projects/terms";
import type { ProjectStatus, StatusCategory } from "@/lib/projects/types";

/**
 * My tasks as a board: To do, In progress and Done, across every list and
 * board the person has work on.
 *
 * A column is a category, not a stage, because the tasks come from projects
 * with different stages. A card says its own stage when that says more than the
 * column ("In review" under In progress).
 *
 * ## Moving a card
 *
 * Drag it by the grip, or pick a column from "Move to…" on the card. The card
 * moves at once; then the task's own project is asked for its first stage in
 * that category (a personal list's stages come with the task, a board's with
 * the project, each read once and kept), and the task is saved there. A refusal
 * (a read-only project, a task the person may not move, a project they have
 * left) puts the card back and says why. Success reloads the screen's lists, so
 * what is shown is what the server has.
 */

const CATEGORY_RULE: Record<StatusCategory, string> = {
  TODO: "border-t-line-strong",
  IN_PROGRESS: "border-t-accent",
  DONE: "border-t-success-strong",
};

type Columns = { statuses: ProjectStatus[]; readOnly: boolean };
type Pending = Pick<ProjectStatus, "id" | "name" | "category"> & {
  settled: boolean;
};

class Refused extends Error {}

export function MyTasksBoard({
  tasks,
  source,
  today,
  timeZone,
  filtering,
  onClearFilters,
  onOpen,
  onMoved,
}: {
  /** The tasks the list would show on Open, then Done. */
  tasks: PersonalTask[];
  /** The loaded data the tasks came from; a new one means the server answered again. */
  source: unknown;
  today: string;
  timeZone: string;
  filtering: boolean;
  onClearFilters: () => void;
  onOpen: (id: string) => void;
  /** After a move is saved: load the lists again. */
  onMoved: () => void;
}) {
  const toast = useToast();

  /* Moves this board has made that the lists have not caught up with. Settled
     ones go when the lists are read again; one still in flight stays. */
  const [moves, setMoves] = useState<ReadonlyMap<string, Pending>>(new Map());
  const [seen, setSeen] = useState(source);
  if (seen !== source) {
    setSeen(source);
    setMoves((prev) => {
      const next = new Map([...prev].filter(([, m]) => !m.settled));
      return next.size === prev.size ? prev : next;
    });
  }

  const shown = useMemo(() => {
    let rows = tasks;
    for (const [id, move] of moves) rows = withMove(rows, id, move);
    return rows;
  }, [tasks, moves]);
  const byId = useMemo(() => new Map(shown.map((t) => [t.id, t])), [shown]);
  const columns = useMemo(() => groupByCategory(shown), [shown]);

  /* Each project's stages, asked for once. A failed read is forgotten so the
     next move asks again. */
  const cache = useRef(new Map<string, Promise<Columns>>());
  const columnsFor = useCallback((task: PersonalTask): Promise<Columns> => {
    const key = task.project.id;
    const known = cache.current.get(key);
    if (known) return known;
    const read: Promise<Columns> = task.project.personal
      ? projectsApi
          .personalTask(task.id)
          .then((d) => ({ statuses: d.statuses, readOnly: false }))
      : projectsApi.get(key).then((p) => ({
          statuses: p.statuses,
          readOnly: projectIsReadOnly(p),
        }));
    cache.current.set(key, read);
    read.catch(() => cache.current.delete(key));
    return read;
  }, []);

  const move = useCallback(
    async (task: PersonalTask, category: StatusCategory) => {
      if (task.statusCategory === category) return;
      const why = cannotMoveReason(task);
      if (why) {
        toast.push({
          tone: "danger",
          title: `Could not move ${task.key}`,
          detail: why,
        });
        return;
      }
      const put = (m: Pending | null) =>
        setMoves((prev) => {
          const next = new Map(prev);
          if (m) next.set(task.id, m);
          else next.delete(task.id);
          return next;
        });
      put({
        id: task.statusId,
        name: CATEGORY_LABEL[category],
        category,
        settled: false,
      });
      try {
        const { statuses, readOnly } = await columnsFor(task);
        if (readOnly)
          throw new Refused(
            "You can see this project but not change its tasks.",
          );
        const status = firstStatusIn(statuses, category);
        if (!status)
          throw new Refused(
            `${task.project.personal ? "This list" : "This project"} has no ${CATEGORY_LABEL[category]} stage.`,
          );
        put({ ...status, settled: false });
        const saved = await projectsApi.updateIssue(task.id, {
          statusId: status.id,
        });
        const landed = statuses.find((s) => s.id === saved.statusId) ?? status;
        put({
          id: landed.id,
          name: landed.name,
          category: landed.category,
          settled: true,
        });
        onMoved();
      } catch (error) {
        put(null);
        cache.current.delete(task.project.id);
        toast.push({
          tone: "danger",
          title: `Could not move ${task.key}`,
          detail:
            error instanceof Refused
              ? error.message
              : error instanceof ApiError
                ? error.status === 403 || error.status === 404
                  ? `You can't move this task. ${error.message}`.trim()
                  : error.message
                : "Check your connection and try again.",
        });
      }
    },
    [columnsFor, onMoved, toast],
  );

  /* The drag: the house one, onto a column. */
  const [grab, setGrab] = useState<{
    w: number;
    dx: number;
    dy: number;
    html: string;
  } | null>(null);
  const grabRef = useRef(grab);
  const settleRef = useRef<Settle | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  useFlip(gridRef, settleRef);

  const onDrop = useCallback(
    (
      moved: { id: string },
      targetId: string,
      point: { x: number; y: number },
    ) => {
      const task = byId.get(moved.id);
      const g = grabRef.current;
      if (g)
        settleRef.current = {
          id: moved.id,
          left: point.x - g.dx,
          top: point.y - g.dy,
          tilt: 3,
        };
      if (task) void move(task, targetId as StatusCategory);
    },
    [byId, move],
  );
  const canDrop = useCallback(
    (moved: { id: string }, targetId: string) => {
      const task = byId.get(moved.id);
      return (
        !!task &&
        task.statusCategory !== targetId &&
        (BOARD_COLUMNS as readonly string[]).includes(targetId)
      );
    },
    [byId],
  );
  const { drag, start } = useDragInto({ onDrop, canDrop });

  const grabCard =
    (task: PersonalTask) => (event: React.PointerEvent<HTMLElement>) => {
      const card = event.currentTarget.closest<HTMLElement>("[data-card-id]");
      if (card) {
        const box = card.getBoundingClientRect();
        const next = {
          w: box.width,
          dx: event.clientX - box.left,
          dy: event.clientY - box.top,
          html: card.outerHTML,
        };
        grabRef.current = next;
        setGrab(next);
      }
      start(task.id, "task")(event);
    };

  if (tasks.length === 0) {
    return filtering ? (
      <EmptyState
        icon={<ListChecks />}
        title="No tasks match these filters"
        description="Try another search or department, or clear the filters."
        action={
          <Button variant="secondary" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={<ListChecks />}
        title="Nothing on your list"
        description="Add the first thing you need to do above."
      />
    );
  }

  const nowHHMM = nowHHMMIn(timeZone);

  return (
    <div className="scroll-x -mx-5 px-5 pb-2 sm:-mx-7 sm:px-7">
      <div
        ref={gridRef}
        className="grid min-w-max grid-cols-[repeat(3,17.5rem)] items-start gap-3 lg:min-w-0 lg:grid-cols-3"
      >
        {BOARD_COLUMNS.map((category) => {
          const items = columns[category];
          const over = drag?.over === category;
          const label = CATEGORY_LABEL[category];
          return (
            <section
              key={category}
              aria-label={label}
              className="min-w-0 space-y-2"
            >
              <div
                className={cn(
                  "relative flex items-center gap-2 rounded-lg border border-t-[3px] border-line bg-sunken px-3 py-2.5",
                  CATEGORY_RULE[category],
                )}
              >
                <h2 className="min-w-0 flex-1 truncate text-body-sm font-semibold text-ink">
                  {label}
                  {category === "DONE" && (
                    <span className="font-normal text-muted">
                      {" "}
                      (last 14 days)
                    </span>
                  )}
                </h2>
                <span className="tabular text-body-sm text-muted">
                  {items.length}
                </span>
              </div>
              <ul
                data-drop-id={category}
                aria-label={`${label} column`}
                className={cn(
                  "relative flex min-h-24 flex-col gap-2 rounded-lg border p-2 transition-colors",
                  over
                    ? "border-accent bg-accent-soft"
                    : "border-transparent bg-sunken",
                )}
              >
                {items.map((task) => (
                  <li
                    key={task.id}
                    data-flip={`card:${task.id}`}
                    className={cn(drag?.id === task.id && "opacity-40")}
                  >
                    <TaskCard
                      task={task}
                      late={
                        task.statusCategory !== "DONE" &&
                        isPastDue(task, today, nowHHMM)
                      }
                      today={today}
                      onGrab={grabCard(task)}
                      onOpen={onOpen}
                      onMove={(to) => void move(task, to)}
                    />
                  </li>
                ))}
                {items.length === 0 && (
                  <li className="flex flex-1 items-center justify-center rounded-md border border-dashed border-line-strong px-3 py-5 text-center text-meta text-faint">
                    {drag ? "Drop a task here" : "Nothing here"}
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
      {drag && grab && <BoardGhost x={drag.x} y={drag.y} grab={grab} />}
    </div>
  );
}

function TaskCard({
  task,
  late,
  today,
  onGrab,
  onOpen,
  onMove,
}: {
  task: PersonalTask;
  late: boolean;
  today: string;
  onGrab: (event: React.PointerEvent<HTMLElement>) => void;
  onOpen: (id: string) => void;
  onMove: (to: StatusCategory) => void;
}) {
  const done = task.statusCategory === "DONE";
  const target = rowTarget(task);
  const movable = cannotMoveReason(task) === null;
  const note = stageNote(task);
  const names = task.assignees.map((a) => a.name);
  const where = task.project.personal
    ? task.sharedBy
      ? `Shared by ${task.sharedBy.name}`
      : "Personal"
    : task.project.name || "Project";

  const titleClass = cn(
    "block w-full break-words text-left text-body-sm font-medium",
    done ? "text-muted line-through" : "text-ink",
    "after:absolute after:inset-0 after:content-['']",
    "focus-visible:outline-none",
  );
  const title = (
    <>
      <span className="sr-only">{task.key}: </span>
      {task.title}
    </>
  );

  return (
    <div data-card-id={task.id}>
      <article
        className={cn(
          "relative rounded-md border border-line bg-surface p-3 shadow-xs transition-shadow hover:shadow-sm",
          "focus-within:ring-2 focus-within:ring-accent/40",
          target.kind === "none" && "opacity-70",
        )}
      >
        <div className="flex items-start gap-1.5">
          {movable && (
            <button
              type="button"
              onPointerDown={onGrab}
              aria-label={`Move ${task.key}. Or use Move to.`}
              className={cn(
                "relative z-10 -ml-1 mt-0.5 flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-faint",
                "hover:bg-canvas hover:text-muted active:cursor-grabbing",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
              )}
            >
              <GripVertical aria-hidden="true" className="size-4" />
            </button>
          )}

          <div className="min-w-0 flex-1 space-y-2">
            {target.kind === "board" ? (
              <Link href={target.href} className={titleClass}>
                {title}
              </Link>
            ) : target.kind === "drawer" ? (
              <button
                type="button"
                onClick={() => onOpen(task.id)}
                className={titleClass}
              >
                {title}
              </button>
            ) : (
              <p className="break-words text-body-sm font-medium text-muted">
                {title}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              <IssueKey issueKey={task.key} done={done} />
              <Badge tone="neutral" size="sm">
                {where}
              </Badge>
              {note && (
                <Badge tone="info" size="sm">
                  {note}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 text-meta text-muted">
              {task.lostAccess ? (
                <span>You&apos;re no longer on this project</span>
              ) : task.dueDate ? (
                <>
                  <span className="whitespace-nowrap">
                    {dueLabel(task, today)}
                  </span>
                  {late && (
                    <Badge tone="danger" size="sm">
                      Overdue
                    </Badge>
                  )}
                </>
              ) : (
                <span>No date</span>
              )}
              {names.length > 0 && (
                <span
                  className="ml-auto flex shrink-0 -space-x-1.5"
                  title={names.join(", ")}
                  aria-label={`Assignees: ${names.join(", ")}`}
                  role="img"
                >
                  {names.slice(0, 3).map((name, i) => (
                    <Avatar
                      key={`${name}-${String(i)}`}
                      name={name}
                      size="xs"
                      className="ring-2 ring-surface"
                    />
                  ))}
                  {names.length > 3 && (
                    <span className="tabular flex size-6 items-center justify-center rounded-full bg-sunken text-meta text-muted ring-2 ring-surface">
                      +{names.length - 3}
                    </span>
                  )}
                </span>
              )}
            </div>
            {names.length > 0 && (
              <span className="sr-only">{assigneeSummary(names)}</span>
            )}
          </div>

          {movable && (
            <label
              className={cn(
                "relative z-10 -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-muted",
                "hover:bg-canvas hover:text-ink focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-text",
              )}
              title="Move to…"
            >
              <ArrowRightLeft aria-hidden="true" className="size-4" />
              <select
                aria-label={`Move ${task.key} to…`}
                value=""
                onChange={(event) => {
                  const to = event.target.value as StatusCategory | "";
                  if (to) onMove(to);
                }}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              >
                <option value="" disabled>
                  Move to…
                </option>
                {BOARD_COLUMNS.map((category) => (
                  <option
                    key={category}
                    value={category}
                    disabled={category === task.statusCategory}
                  >
                    {CATEGORY_LABEL[category]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </article>
    </div>
  );
}
