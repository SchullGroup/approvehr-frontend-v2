"use client";

import Link from "next/link";
import { Badge, Stat, StatGrid } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  LEVEL_LABEL,
  READ_ONLY_PROGRAM,
  TASK,
  count,
} from "@/lib/projects/terms";
import type { Metrics, Program, WorkBucket } from "@/lib/projects/programs";
import { PROJECT_COLORS, PROJECT_COLOR_NAMES } from "@/lib/projects/types";
import type { ProgramLevel } from "@/lib/projects/access";

/**
 * The small pieces every program screen shares: the colour dot, the four tiles,
 * the colour choice, and the sentence that says what a person has here.
 */

/** A program's colour, as a dot beside its name. Never the only thing that names it. */
export function ProgramDot({
  color,
  className,
}: {
  color: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: color }}
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
    />
  );
}

/**
 * Open, overdue, due this week and done this week, as four tiles.
 *
 * `hrefFor` makes each one a link to the list it counts (the same words the API
 * counts under), so a tile and the page it opens always agree.
 */
export function MetricTiles({
  metrics,
  hrefFor,
}: {
  metrics: Metrics;
  hrefFor?: (bucket: WorkBucket) => string;
}) {
  const tiles: {
    bucket: WorkBucket;
    label: string;
    value: number;
    hint: string;
  }[] = [
    {
      bucket: "open",
      label: "Open",
      value: metrics.open,
      hint: `of ${count(metrics.total, "task")}`,
    },
    {
      bucket: "overdue",
      label: "Overdue",
      value: metrics.overdue,
      hint:
        metrics.overdue === 0
          ? "None past their deadline"
          : "Past their deadline",
    },
    {
      bucket: "dueThisWeek",
      label: "Due this week",
      value: metrics.dueThisWeek,
      hint: "Not yet overdue",
    },
    {
      bucket: "doneThisWeek",
      label: "Done this week",
      value: metrics.doneThisWeek,
      hint: `${TASK.Many} finished since Monday`,
    },
  ];
  return (
    <StatGrid>
      {tiles.map((tile) => {
        const stat = (
          <Stat
            label={tile.label}
            value={<span className="tabular">{tile.value}</span>}
            hint={tile.hint}
          />
        );
        const href = hrefFor?.(tile.bucket);
        return href ? (
          <Link
            key={tile.bucket}
            href={href}
            className="block min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text [&>div]:transition-[border-color] [&>div]:hover:border-line-strong"
          >
            {stat}
          </Link>
        ) : (
          <div key={tile.bucket} className="min-w-0">
            {stat}
          </div>
        );
      })}
    </StatGrid>
  );
}

/** The colours a program (or a project) can take, as a row of swatches. */
export function ColorChoice({
  value,
  onChange,
  disabled = false,
  labelledBy,
}: {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  labelledBy?: string;
}) {
  return (
    <div
      role="radiogroup"
      {...(labelledBy ? { "aria-labelledby": labelledBy } : {})}
      className="flex flex-wrap gap-2"
    >
      {PROJECT_COLORS.map((color) => {
        const on = value.toLowerCase() === color.toLowerCase();
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={PROJECT_COLOR_NAMES[color] ?? color}
            title={PROJECT_COLOR_NAMES[color] ?? color}
            disabled={disabled}
            onClick={() => {
              if (!on) onChange(color);
            }}
            style={{ backgroundColor: color }}
            className={cn(
              "size-8 rounded-md ring-2 ring-offset-2 ring-offset-surface transition-shadow",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
              "disabled:cursor-not-allowed disabled:opacity-60",
              on ? "ring-ink" : "ring-transparent hover:ring-line-strong",
            )}
          />
        );
      })}
    </div>
  );
}

/** "Read", "Read and write", "Lead" as a small badge. */
export function LevelBadge({ level }: { level: ProgramLevel | "LEAD" }) {
  return (
    <Badge tone="neutral" size="sm">
      {LEVEL_LABEL[level]}
    </Badge>
  );
}

/**
 * One plain sentence about what the reader has in this program, or nothing.
 *
 * Read-only people are told once, quietly, and are not shown a control that
 * would refuse them. A person who reaches the program only through a project of
 * theirs is told that the program shows them just that.
 */
export function programNote(program: Program): string | null {
  if (program.access === "READ") return READ_ONLY_PROGRAM;
  if (program.access === null) {
    return `You can see the ${TASK.many} and projects you are on in this program.`;
  }
  return null;
}

/**
 * People by open tasks, as bars. The bar is the open count; the overdue count is
 * said in words beside it, never by colour alone. `href` makes a name a link to
 * that person's tasks.
 */
export function WorkloadBars({
  people,
  unassigned,
  others,
  limit,
  hrefFor,
}: {
  people: readonly {
    employeeId: string;
    name: string;
    open: number;
    overdue: number;
  }[];
  unassigned?: number;
  others?: { people: number; open: number; overdue: number };
  limit?: number;
  hrefFor?: (employeeId: string) => string;
}) {
  const shown = limit ? people.slice(0, limit) : people;
  const top = Math.max(1, ...shown.map((p) => p.open), unassigned ?? 0);
  return (
    <ul className="space-y-3">
      {shown.map((person) => {
        const href = hrefFor?.(person.employeeId);
        return (
          <li key={person.employeeId} className="min-w-0">
            <div className="flex items-baseline justify-between gap-3 text-body-sm">
              {href ? (
                <Link
                  href={href}
                  className="min-w-0 truncate font-medium text-ink underline-offset-2 hover:underline"
                >
                  {person.name}
                </Link>
              ) : (
                <span className="min-w-0 truncate font-medium text-ink">
                  {person.name}
                </span>
              )}
              <span className="tabular shrink-0 text-muted">
                {person.open} open
                {person.overdue > 0 && (
                  <span className="text-warning-text">
                    {" "}
                    · {person.overdue} overdue
                  </span>
                )}
              </span>
            </div>
            <div
              role="img"
              aria-label={`${person.name}: ${person.open} open, ${person.overdue} overdue`}
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken"
            >
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.round((person.open / top) * 100)}%` }}
              />
            </div>
          </li>
        );
      })}
      {others && others.people > 0 && (
        <li className="text-body-sm text-muted">
          {others.people} more {others.people === 1 ? "person" : "people"} with{" "}
          {others.open} open
          {others.overdue > 0 ? `, ${others.overdue} overdue` : ""}
        </li>
      )}
      {unassigned !== undefined && unassigned > 0 && (
        <li className="text-body-sm text-muted">
          {count(unassigned, "task")} open with nobody on{" "}
          {unassigned === 1 ? "it" : "them"}
        </li>
      )}
    </ul>
  );
}
