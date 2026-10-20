"use client";

import { ArrowRightLeft, GripVertical } from "lucide-react";
import { cn } from "@/lib/cn";
import type { MoveOption } from "@/lib/projects/backlog";
import type { Issue, ProjectStatus } from "@/lib/projects/types";
import type { People } from "@/lib/store/project-session";
import {
  EpicChip,
  IssueKey,
  PointsPill,
  PriorityIcon,
  StatusPill,
  TypeIcon,
} from "./glyphs";
import { PersonAvatar } from "./person";

/**
 * One issue in a backlog list.
 *
 * ## Three ways to move it, as on the board
 *
 * - **Drag** the grip (mouse or touch). Only the grip starts a drag, so a finger
 *   anywhere else on the row still scrolls the page.
 * - **Move to…** — a real `<select>` laid over an icon, so a phone gets its own
 *   picker and a keyboard gets arrow keys. It lists the other sprints, the
 *   backlog, and top and bottom of the list the issue is already in.
 * - **Open it** and use the Sprint field in the drawer.
 *
 * The row is one button (the title) stretched over the whole row, so it is a real
 * control that Enter opens, rather than a clickable `<li>`. The grip and the menu
 * sit above it.
 */
export function BacklogRow({
  issue,
  epic,
  status,
  people,
  done,
  dragging = false,
  canMove,
  hasSprints = true,
  options,
  onGrab,
  onOpen,
  onChoose,
}: {
  issue: Issue;
  epic: Issue | null;
  status: ProjectStatus;
  people: People;
  done: boolean;
  dragging?: boolean;
  canMove: boolean;
  /** A Kanban queue has no Sprint field to point at. */
  hasSprints?: boolean;
  options: readonly MoveOption[];
  /** From `useDragInto`'s `start`. Goes on the grip, never on the row. */
  onGrab: (event: React.PointerEvent<HTMLElement>) => void;
  onOpen: () => void;
  onChoose: (value: string) => void;
}) {
  const groups = ["Move to", "Order"] as const;
  return (
    <li
      data-row-id={issue.id}
      className={cn(
        "ahr-sortable-row relative border-t border-line first:border-t-0",
        "data-[drop-before=true]:shadow-[inset_0_3px_0_0_var(--color-accent)]",
        dragging && "relative z-10",
      )}
    >
      <div
        className={cn(
          "relative flex flex-wrap items-center gap-x-2 gap-y-1.5 bg-surface px-3 py-2",
          "hover:bg-canvas focus-within:ring-2 focus-within:ring-inset focus-within:ring-accent/40",
        )}
      >
        <div className="flex min-w-0 flex-1 basis-56 items-center gap-2">
          {canMove && (
            <button
              type="button"
              onPointerDown={onGrab}
              onClick={onOpen}
              aria-label={`Move ${issue.key}. Or use Move to${hasSprints ? ", or open it and change its sprint" : ""}.`}
              className={cn(
                "relative z-10 -ml-1 flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-faint",
                "hover:bg-sunken hover:text-muted active:cursor-grabbing",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
              )}
            >
              <GripVertical aria-hidden="true" className="size-4" />
            </button>
          )}
          <TypeIcon type={issue.type} />
          <IssueKey issueKey={issue.key} done={done} />
          <button
            type="button"
            onClick={onOpen}
            className={cn(
              "min-w-0 flex-1 truncate text-left text-body-sm font-medium text-ink",
              "after:absolute after:inset-0 after:content-['']",
              "focus-visible:outline-none",
            )}
          >
            <span className="sr-only">{issue.key}: </span>
            {issue.title}
          </button>
        </div>

        {/* Wraps under the title on a phone, where the epic chip is the one thing
            that gives way (it truncates) so the avatar and the menu stay on screen. */}
        <div className="flex min-w-0 max-w-full items-center gap-2 sm:ml-auto">
          {epic && <EpicChip title={epic.title} className="min-w-0 shrink" />}
          <StatusPill status={status} />
          <span className="flex min-w-7 justify-center">
            {issue.points !== null && <PointsPill points={issue.points} />}
          </span>
          <PriorityIcon priority={issue.priority} />
          <PersonAvatar people={people} id={issue.assigneeId} />
          {canMove && (
            <label
              className={cn(
                "relative z-10 -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-muted",
                "hover:bg-sunken hover:text-ink focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-text",
              )}
              title="Move to…"
            >
              <ArrowRightLeft aria-hidden="true" className="size-4" />
              <select
                aria-label={`Move ${issue.key} to…`}
                value=""
                onChange={(event) => {
                  if (event.target.value) onChoose(event.target.value);
                }}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              >
                <option value="" disabled>
                  Move to…
                </option>
                {groups.map((group) => {
                  const inGroup = options.filter((o) => o.group === group);
                  if (inGroup.length === 0) return null;
                  return (
                    <optgroup key={group} label={group}>
                      {inGroup.map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                          disabled={option.disabled}
                        >
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </label>
          )}
        </div>
      </div>
    </li>
  );
}
