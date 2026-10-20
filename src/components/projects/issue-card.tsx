"use client";

import { ArrowRightLeft, GripVertical } from "lucide-react";
import { cn } from "@/lib/cn";
import { isBefore } from "@/lib/projects/dates";
import type { Issue, ProjectStatus } from "@/lib/projects/types";
import { shortDate } from "@/lib/today";
import type { People } from "@/lib/store/project-session";
import {
  EpicChip,
  IssueKey,
  LabelChip,
  PointsPill,
  PriorityIcon,
  TypeIcon,
} from "./glyphs";
import { PersonAvatar } from "./person";

/**
 * A card on the board.
 *
 * ## Three ways to move it, because dragging is only one of them
 *
 * - **Drag** the grip (mouse or touch). The grip alone starts a drag, so a finger
 *   anywhere else on the card still scrolls the board.
 * - **Move to…** — a menu on the card, a real `<select>` laid over an icon so a
 *   phone gets its own picker and a keyboard gets arrow keys.
 * - **Open it** and use the Status field in the drawer.
 *
 * The card itself is one button (the title) stretched over the whole card, rather
 * than a clickable `<article>`, so it is reachable by keyboard and announced as
 * what it is. The grip and the menu sit above that button.
 */
export function IssueCard({
  issue,
  parent,
  epic,
  statuses,
  people,
  today,
  done,
  dragging = false,
  canMove,
  onGrab,
  onOpen,
  onMove,
}: {
  issue: Issue;
  parent: Issue | null;
  epic: Issue | null;
  statuses: readonly ProjectStatus[];
  people: People;
  today: string;
  done: boolean;
  dragging?: boolean;
  /** Whether this person may move cards at all. */
  canMove: boolean;
  /** From `useDragInto`'s `start`. Goes on the grip, never on the card. */
  onGrab: (event: React.PointerEvent<HTMLElement>) => void;
  onOpen: () => void;
  onMove: (statusId: string) => void;
}) {
  const overdue = !done && isBefore(issue.dueDate, today);
  const labels = issue.labels.slice(0, 3);

  return (
    <div
      data-card-id={issue.id}
      className={cn(
        "ahr-sortable-row",
        dragging && "ahr-sortable-lifted relative z-10",
      )}
    >
      <article
        className={cn(
          "relative rounded-md border border-line bg-surface p-3 shadow-xs transition-shadow hover:shadow-sm",
          "focus-within:ring-2 focus-within:ring-accent/40",
        )}
      >
        <div className="flex items-start gap-1.5">
          {canMove && (
            <button
              type="button"
              onPointerDown={onGrab}
              onClick={onOpen}
              aria-label={`Move ${issue.key}. Or use Move to, or open it and change its status.`}
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
            {parent && (
              <span className="block truncate text-meta text-faint">
                {parent.key} · {parent.title}
              </span>
            )}
            <button
              type="button"
              onClick={onOpen}
              className={cn(
                "block w-full break-words text-left text-body-sm font-medium text-ink",
                "after:absolute after:inset-0 after:content-['']",
                "focus-visible:outline-none",
              )}
            >
              <span className="sr-only">{issue.key}: </span>
              {issue.title}
            </button>

            {(epic || labels.length > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {epic && <EpicChip title={epic.title} />}
                {labels.map((label) => (
                  <LabelChip key={label} label={label} />
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <TypeIcon type={issue.type} />
              <IssueKey issueKey={issue.key} done={done} />
              {overdue && issue.dueDate && (
                <span className="text-meta font-medium text-danger-text">
                  Due {shortDate(issue.dueDate)}
                </span>
              )}
              <span className="ml-auto flex items-center gap-2">
                <PriorityIcon priority={issue.priority} />
                {issue.points !== null && <PointsPill points={issue.points} />}
                <PersonAvatar people={people} id={issue.assigneeId} />
              </span>
            </div>
          </div>

          {canMove && (
            <label
              className={cn(
                "relative z-10 -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-muted",
                "hover:bg-canvas hover:text-ink focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-text",
              )}
              title="Move to…"
            >
              <ArrowRightLeft aria-hidden="true" className="size-4" />
              <select
                aria-label={`Move ${issue.key} to…`}
                value=""
                onChange={(event) => {
                  if (event.target.value) onMove(event.target.value);
                }}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              >
                <option value="" disabled>
                  Move to…
                </option>
                {statuses.map((status) => (
                  <option
                    key={status.id}
                    value={status.id}
                    disabled={status.id === issue.statusId}
                  >
                    {status.name}
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
