/**
 * Reports, worked out in the browser from the issue and sprint lists.
 *
 * There is no reports endpoint: the tiles, the burndown, the velocity history,
 * the workload and the breakdowns are all functions of what the project screen
 * already holds. Every one of them is here, pure, with "today" and the
 * instant-to-day conversion (`dayOf`, the company's zone) passed in, so a test can
 * set both and the same figures come out for everybody.
 *
 * ## What counts
 *
 * - **Issues** are everything except epics. A sub-task is an issue (it has its own
 *   card and its own owner), and the project cards' own open count includes it.
 * - **Points** are the points of top-level issues only. A sprint's commitment is
 *   counted that way by the API ("sub-tasks are never counted"), and a sub-task
 *   estimated beside its parent would otherwise be counted twice. Every figure
 *   here uses the one rule so they agree with each other and with the board.
 * - **Done** is the status's *category*, never its name, as everywhere else.
 */

import { addDays, daysBetween } from "./dates";
import { sumPoints } from "./progress";
import type {
  Issue,
  IssueType,
  ProjectStatus,
  Sprint,
  StatusCategory,
} from "./types";
import { categoryOf, isDone } from "./workflow";

/** An issue for the figures: not an epic. */
const isCounted = (issue: Pick<Issue, "type">): boolean =>
  issue.type !== "EPIC";

/** Whether its points count. A sub-task never adds any. */
const carriesPoints = (issue: Pick<Issue, "type">): boolean =>
  issue.type !== "EPIC" && issue.type !== "SUBTASK";

/** Points of the issues in a list that carry points. */
export function pointsOf(issues: readonly Issue[]): number {
  return sumPoints(issues.filter(carriesPoints));
}

/* ------------------------------------------------------------------ tiles -- */

export type ReportTiles = {
  open: { issues: number; points: number };
  doneInWeek: { issues: number; points: number };
  bugs: { open: number; high: number };
  overdue: number;
};

/** Days the "Done in 7 days" tile looks back, today included. */
export const DONE_WINDOW_DAYS = 7;

/**
 * The four tiles.
 *
 * - **Open**: not done, not an epic; the points still to do.
 * - **Done in 7 days**: finished today or in the six days before it, in the
 *   company's calendar; the points that shipped.
 * - **Open bugs**: open issues of type bug, and how many of those are high or
 *   highest priority.
 * - **Overdue**: a due date before today on an issue that is not done.
 */
export function reportTiles(args: {
  statuses: readonly ProjectStatus[];
  issues: readonly Issue[];
  today: string;
  dayOf: (instant: string) => string | null;
}): ReportTiles {
  const { statuses, today, dayOf } = args;
  const all = args.issues.filter(isCounted);
  const open = all.filter((issue) => !isDone(statuses, issue));
  const since = addDays(today, -(DONE_WINDOW_DAYS - 1));
  const doneInWeek = all.filter((issue) => {
    if (!isDone(statuses, issue) || !issue.doneAt) return false;
    const day = dayOf(issue.doneAt);
    return day !== null && day >= since;
  });
  const bugs = open.filter((issue) => issue.type === "BUG");
  return {
    open: { issues: open.length, points: pointsOf(open) },
    doneInWeek: { issues: doneInWeek.length, points: pointsOf(doneInWeek) },
    bugs: {
      open: bugs.length,
      high: bugs.filter(
        (bug) => bug.priority === "HIGHEST" || bug.priority === "HIGH",
      ).length,
    },
    overdue: open.filter((issue) => issue.dueDate && issue.dueDate < today)
      .length,
  };
}

/* ------------------------------------------------------------------ scale -- */

/** A round step (1, 2, 5 or 10 times a power of ten) at or above `range`. */
export function niceStep(range: number): number {
  const base = range > 0 ? range : 1;
  const power = 10 ** Math.floor(Math.log10(base));
  const n = base / power;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * power;
}

/**
 * The y axis for a chart of points: round steps, never fractions of a point, and
 * a top that holds `max`. A chart of nothing still gets an axis (0 and 1) rather
 * than a divide by zero.
 */
export function pointsAxis(
  max: number,
  targetSteps = 4,
): { step: number; max: number; ticks: number[] } {
  const top = Math.max(max, 1);
  const step = Math.max(1, niceStep(top / targetSteps));
  const ceiling = Math.max(step, Math.ceil(top / step) * step);
  const ticks: number[] = [];
  for (let value = 0; value <= ceiling; value += step) ticks.push(value);
  return { step, max: ceiling, ticks };
}

/* -------------------------------------------------------------- burndown -- */

export type BurndownPoint = {
  /** `YYYY-MM-DD`: the day this reading is for. */
  day: string;
  /** Points not yet done at the **end** of that day. */
  remaining: number;
  /** Where an even pace would have it: the full scope at the start, none at the end. */
  ideal: number;
};

export type Burndown =
  | { kind: "no-dates" }
  | { kind: "not-started" }
  | {
      kind: "ok";
      start: string;
      end: string;
      /** The width of the axis in days: start to end, never less than one. */
      span: number;
      /** The scope the line starts from. */
      total: number;
      /** Whether `total` is what was committed at the start or what is in the sprint now. */
      basis: "committed" | "current";
      /** One reading a day, up to today for a running sprint and to the end for a closed one. */
      points: BurndownPoint[];
      /** The axis position of today, for a running sprint that has started. */
      todayIndex: number | null;
      /** Points left at the last reading. */
      remaining: number;
    };

/**
 * A sprint's burndown.
 *
 * - **Scope.** A running sprint burns down what it holds now, so work added
 *   mid-sprint moves the line's start, not just its end. A closed sprint burns
 *   down what it **committed** (`committedPoints`), because by then the unfinished
 *   work has moved out and what is left in it is only what got done.
 * - **When something was done** is the *day* its `doneAt` falls on in the
 *   company's zone, and a reading is the position at the **end** of a day, so work
 *   finished on the sprint's last day counts on it. A weekend is just days: a
 *   Saturday finish lands on Saturday and a quiet Sunday repeats the Saturday
 *   figure; the even-pace line is a straight line, not a working-day one.
 * - **Done before the sprint started**, or done with no recorded time, counts from
 *   the first reading: the status is the truth, `doneAt` only places it in time.
 * - **Never below zero**: finishing more than was committed reads as nothing left.
 * - **Sub-tasks and epics carry no scope** here, as on the board.
 */
export function burndown(args: {
  sprint: Pick<
    Sprint,
    "id" | "state" | "startDate" | "endDate" | "committedPoints"
  >;
  issues: readonly Issue[];
  statuses: readonly ProjectStatus[];
  dayOf: (instant: string) => string | null;
  today: string;
}): Burndown {
  const { sprint, statuses, dayOf, today } = args;
  if (sprint.state === "PLANNED") return { kind: "not-started" };
  const { startDate: start, endDate: end } = sprint;
  const length = start && end ? daysBetween(start, end) : null;
  if (!start || !end || length === null || length < 0) {
    return { kind: "no-dates" };
  }

  const items = args.issues.filter(
    (issue) => issue.sprintId === sprint.id && carriesPoints(issue),
  );
  const current = sumPoints(items);
  const committed = sprint.state === "CLOSED" ? sprint.committedPoints : null;
  const total = committed ?? current;
  const basis = committed === null ? "current" : "committed";

  /** The first reading that has the issue done, or Infinity while it is not. */
  const doneIndex = (issue: Issue): number => {
    if (!isDone(statuses, issue)) return Infinity;
    const day = issue.doneAt ? dayOf(issue.doneAt) : null;
    if (day === null) return 0;
    return Math.max(0, daysBetween(start, day) ?? 0);
  };
  const finished = items
    .map((issue) => ({ at: doneIndex(issue), points: issue.points ?? 0 }))
    .filter((item) => item.at !== Infinity);

  const span = Math.max(1, length);
  const elapsed = daysBetween(start, today) ?? 0;
  const last =
    sprint.state === "CLOSED" ? length : Math.min(length, Math.max(0, elapsed));

  const points: BurndownPoint[] = [];
  for (let index = 0; index <= last; index += 1) {
    const done = finished
      .filter((item) => item.at <= index)
      .reduce((n, item) => n + item.points, 0);
    points.push({
      day: addDays(start, index),
      remaining: Math.max(0, total - done),
      ideal: (total * (span - index)) / span,
    });
  }

  return {
    kind: "ok",
    start,
    end,
    span,
    total,
    basis,
    points,
    todayIndex:
      sprint.state === "ACTIVE" && elapsed >= 0
        ? Math.min(elapsed, span)
        : null,
    remaining: points[points.length - 1]!.remaining,
  };
}

/**
 * The sprints a burndown can be drawn for, most recent first: running and closed
 * ones. A planned sprint has nothing to burn.
 */
export function burndownSprints(sprints: readonly Sprint[]): Sprint[] {
  return sprints
    .filter((sprint) => sprint.state !== "PLANNED")
    .sort(
      (a, b) =>
        (b.startDate ?? "").localeCompare(a.startDate ?? "") ||
        b.createdAt.localeCompare(a.createdAt),
    );
}

/** The running sprint if there is one, else the most recent. */
export function defaultBurndownSprint(
  sprints: readonly Sprint[],
): Sprint | null {
  const list = burndownSprints(sprints);
  return list.find((sprint) => sprint.state === "ACTIVE") ?? list[0] ?? null;
}

/* -------------------------------------------------------------- velocity -- */

export const VELOCITY_SPRINTS = 6;

export type VelocityRow = {
  sprint: Sprint;
  /** `null` when the sprint has no figure recorded. Not zero. */
  committed: number | null;
  completed: number | null;
};

/**
 * The last six closed sprints, oldest first, and the average points completed.
 * A sprint with no recorded figure stays in the list as a gap, and is left out of
 * the average rather than pulling it down as a zero.
 */
export function velocity(
  sprints: readonly Sprint[],
  limit = VELOCITY_SPRINTS,
): { rows: VelocityRow[]; average: number | null } {
  const closedKey = (s: Sprint) => s.closedAt ?? s.endDate ?? s.createdAt;
  const rows = sprints
    .filter((sprint) => sprint.state === "CLOSED")
    .sort(
      (a, b) =>
        closedKey(a).localeCompare(closedKey(b)) ||
        a.createdAt.localeCompare(b.createdAt),
    )
    .slice(-limit)
    .map((sprint) => ({
      sprint,
      committed: sprint.committedPoints,
      completed: sprint.completedPoints,
    }));
  const known = rows.flatMap((row) =>
    row.completed === null ? [] : [row.completed],
  );
  return {
    rows,
    average: known.length
      ? Math.round(known.reduce((n, value) => n + value, 0) / known.length)
      : null,
  };
}

/** A sprint's name without the project key in front of it: `CHK Sprint 3` is `Sprint 3`. */
export function sprintShortName(name: string, projectKey: string): string {
  const prefix = `${projectKey} `;
  const trimmed = name.trim();
  return trimmed.startsWith(prefix) && trimmed.length > prefix.length
    ? trimmed.slice(prefix.length)
    : trimmed;
}

/* -------------------------------------------------------------- workload -- */

export type WorkloadRow = {
  /** `null` is the unassigned work. */
  assigneeId: string | null;
  points: number;
  issues: number;
};

export type Workload = {
  rows: WorkloadRow[];
  /** Bars measure points when any open issue has some, otherwise issues. */
  measure: "points" | "issues";
  /** The longest bar's value, at least one. */
  max: number;
};

/**
 * Open work by person, unassigned included. Most points first, then most issues,
 * then by name with unassigned last, so the order never changes between renders.
 */
export function workload(args: {
  statuses: readonly ProjectStatus[];
  issues: readonly Issue[];
  nameOf: (employeeId: string) => string;
}): Workload {
  const open = args.issues.filter(
    (issue) => isCounted(issue) && !isDone(args.statuses, issue),
  );
  const byPerson = new Map<string | null, Issue[]>();
  for (const issue of open) {
    const key = issue.assigneeId ?? null;
    byPerson.set(key, [...(byPerson.get(key) ?? []), issue]);
  }
  const rows: WorkloadRow[] = [...byPerson].map(([assigneeId, list]) => ({
    assigneeId,
    points: pointsOf(list),
    issues: list.length,
  }));
  const name = (row: WorkloadRow) =>
    row.assigneeId === null ? "" : args.nameOf(row.assigneeId);
  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.issues - a.issues ||
      Number(a.assigneeId === null) - Number(b.assigneeId === null) ||
      name(a).localeCompare(name(b)),
  );
  const measure = rows.some((row) => row.points > 0) ? "points" : "issues";
  return {
    rows,
    measure,
    max: Math.max(1, ...rows.map((row) => row[measure])),
  };
}

/* ------------------------------------------------------------- breakdown -- */

export type CategoryCount = { category: StatusCategory; count: number };
export type TypeCount = { type: IssueType; count: number };

export const BREAKDOWN_CATEGORIES: readonly StatusCategory[] = [
  "TODO",
  "IN_PROGRESS",
  "DONE",
];

/** Issues (no epics) by the category of the status they are in. Every category is listed, even at zero. */
export function statusBreakdown(args: {
  statuses: readonly ProjectStatus[];
  issues: readonly Issue[];
}): { total: number; counts: CategoryCount[] } {
  const all = args.issues.filter(isCounted);
  return {
    total: all.length,
    counts: BREAKDOWN_CATEGORIES.map((category) => ({
      category,
      count: all.filter(
        (issue) => categoryOf(args.statuses, issue.statusId) === category,
      ).length,
    })),
  };
}

const BREAKDOWN_TYPES: readonly IssueType[] = [
  "STORY",
  "TASK",
  "BUG",
  "SUBTASK",
];

/** Issues (no epics) by type. Types with none are left out. */
export function typeBreakdown(issues: readonly Issue[]): {
  total: number;
  counts: TypeCount[];
} {
  const all = issues.filter(isCounted);
  return {
    total: all.length,
    counts: BREAKDOWN_TYPES.map((type) => ({
      type,
      count: all.filter((issue) => issue.type === type).length,
    })).filter((entry) => entry.count > 0),
  };
}
