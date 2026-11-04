/**
 * The roadmap: which epics are on the timeline, how wide the timeline is, and
 * where each bar sits on it.
 *
 * Everything here is arithmetic on calendar days (`YYYY-MM-DD`) and whole pixels.
 * "Today" is an argument, never read from a clock, and a day is a count of UTC
 * calendar days from the string alone (`dates.ts`), so the same epic sits at the
 * same pixel for every person looking, in every zone.
 *
 * ## The range
 *
 * Three weeks back and three calendar months ahead of today, widened to take in
 * every dated epic, then snapped outwards to whole months so the header always
 * starts and ends on a month. A sensible window is the point: a roadmap that
 * opens on the project's first day and runs to its last is mostly empty for
 * somebody looking at what is happening now.
 *
 * ## What counts as dated
 *
 * An epic needs **both** a start and a due date to be drawn. One without the
 * other has no length, so it is listed under "needs dates" rather than drawn as a
 * bar of a width nobody chose.
 */

import { addDays, dayToMs, daysBetween } from "./dates";
import { percent, epicProgress } from "./progress";
import { byRank } from "./rank";
import type { Issue, ProjectStatus } from "./types";

/** Width of one day on the timeline. Eight is room for a label on a fortnight. */
export const PX_PER_DAY = 8;
/** How far back the timeline starts, from today. */
export const BACK_DAYS = 21;
/** How far ahead it runs, in calendar months. */
export const AHEAD_MONTHS = 3;
/** A bar is never narrower than this, so a one-day epic can still be seen and focused. */
export const MIN_BAR_PX = 24;
/** Below this width a bar's label does not fit inside it and is written beside it. */
export const LABEL_INSIDE_PX = 112;

/** Today opens this far in from the left of the timeline, at the least. */
const OPENING_LEAD_PX = 48;
/** And at least this far from the right edge of what is visible. */
const OPENING_TAIL_PX = 120;
/** A little air before the first bar's left end. */
const OPENING_GUTTER_PX = 16;

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

type Ymd = { y: number; m: number; d: number };

function parseDay(day: string): Ymd | null {
  if (dayToMs(day) === null) return null;
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return { y, m, d };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeap(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

/**
 * `n` calendar months from a day, keeping the day of the month where the target
 * month has it and falling back to its last day where it does not (31 Jan plus a
 * month is 28 or 29 Feb, never 3 Mar).
 */
export function addMonths(day: string, months: number): string {
  const at = parseDay(day);
  if (!at) return day;
  const index = at.y * 12 + (at.m - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${y}-${pad(m)}-${pad(Math.min(at.d, daysInMonth(y, m)))}`;
}

/** The first of the month a day falls in. */
export function firstOfMonth(day: string): string {
  const at = parseDay(day);
  return at ? `${at.y}-${pad(at.m)}-01` : day;
}

/**
 * `19 Aug`, or `19 Aug 2026` with the year. Written from the string, so it does
 * not depend on the reader's zone or locale.
 */
export function formatDay(day: string, withYear = false): string {
  const at = parseDay(day);
  if (!at) return day;
  const text = `${at.d} ${MONTH_SHORT[at.m - 1]}`;
  return withYear ? `${text} ${at.y}` : text;
}

/** `19 Aug – 30 Sep`, with years on both ends only when they differ. */
export function formatSpan(start: string, end: string): string {
  const a = parseDay(start);
  const b = parseDay(end);
  const years = Boolean(a && b && a.y !== b.y);
  return `${formatDay(start, years)} – ${formatDay(end, years)}`;
}

/* ------------------------------------------------------------------ epics -- */

export type DatedEpic = { epic: Issue; start: string; due: string };

export type SplitEpics = {
  /** Both dates set, soonest start first. */
  scheduled: DatedEpic[];
  /** Missing a start or a due date, in rank order. */
  undated: Issue[];
};

/**
 * Epics split into the ones that can be drawn and the ones that need dates. A due
 * date before the start date (the API refuses one, but a draft may carry it) is
 * drawn from the earlier to the later rather than dropped.
 */
export function splitEpics(epics: readonly Issue[]): SplitEpics {
  const scheduled: DatedEpic[] = [];
  const undated: Issue[] = [];
  for (const epic of epics) {
    if (epic.type !== "EPIC") continue;
    if (
      epic.startDate &&
      epic.dueDate &&
      dayToMs(epic.startDate) !== null &&
      dayToMs(epic.dueDate) !== null
    ) {
      const [start, due] =
        epic.startDate <= epic.dueDate
          ? [epic.startDate, epic.dueDate]
          : [epic.dueDate, epic.startDate];
      scheduled.push({ epic, start, due });
    } else {
      undated.push(epic);
    }
  }
  scheduled.sort(
    (a, b) => a.start.localeCompare(b.start) || byRank(a.epic, b.epic),
  );
  undated.sort(byRank);
  return { scheduled, undated };
}

/* ------------------------------------------------------------------ range -- */

export type MonthColumn = {
  /** The first of the month. */
  day: string;
  /** `Oct`, or `Oct 2026` for the first month shown and for every January. */
  label: string;
  /** Pixels from the left edge of the timeline. */
  x: number;
  /** Pixels it spans. */
  width: number;
};

export type RoadmapRange = {
  /** The first day drawn, always the first of a month. */
  start: string;
  /** The day after the last one drawn, always the first of a month. */
  end: string;
  days: number;
  px: number;
  /** Total width of the timeline in pixels. */
  width: number;
  months: MonthColumn[];
};

/**
 * The window to draw: three weeks back to three months ahead of `today`, widened
 * to fit the dated epics, snapped out to whole months.
 */
export function roadmapRange(args: {
  today: string;
  scheduled: readonly Pick<DatedEpic, "start" | "due">[];
  px?: number;
}): RoadmapRange {
  const px = args.px ?? PX_PER_DAY;
  let lo = addDays(args.today, -BACK_DAYS);
  let hi = addMonths(args.today, AHEAD_MONTHS);
  for (const { start, due } of args.scheduled) {
    if (start < lo) lo = start;
    if (due > hi) hi = due;
  }
  const start = firstOfMonth(lo);
  const end = firstOfMonth(addMonths(firstOfMonth(hi), 1));
  const days = daysBetween(start, end) ?? 0;

  const months: MonthColumn[] = [];
  for (let first = start; first < end; first = addMonths(first, 1)) {
    const next = addMonths(first, 1);
    const at = parseDay(first)!;
    months.push({
      day: first,
      label:
        months.length === 0 || at.m === 1
          ? `${MONTH_SHORT[at.m - 1]} ${at.y}`
          : MONTH_SHORT[at.m - 1]!,
      x: (daysBetween(start, first) ?? 0) * px,
      width: (daysBetween(first, next) ?? 0) * px,
    });
  }
  return { start, end, days, px, width: days * px, months };
}

/** Pixels from the left of the timeline to the left edge of a day's column. */
export function xOfDay(range: RoadmapRange, day: string): number {
  return (daysBetween(range.start, day) ?? 0) * range.px;
}

/** The today line sits in the middle of today's column. */
export function todayX(range: RoadmapRange, today: string): number {
  return xOfDay(range, today) + Math.floor(range.px / 2);
}

/**
 * Where a bar sits. Both ends are inclusive, so an epic that starts and ends on
 * the same day is one column wide, and the bar never falls below `MIN_BAR_PX`.
 */
export function barGeometry(
  range: RoadmapRange,
  start: string,
  due: string,
): { left: number; width: number } {
  const left = xOfDay(range, start);
  const span = (daysBetween(start, due) ?? 0) + 1;
  return { left, width: Math.max(MIN_BAR_PX, span * range.px) };
}

/* ------------------------------------------------------------------- rows -- */

export type RoadmapRow = {
  epic: Issue;
  start: string;
  due: string;
  left: number;
  width: number;
  /** Whether `label` fits inside the bar. */
  labelInside: boolean;
  progress: { done: number; total: number; ratio: number | null };
  /** Whole per cent, or null when the epic has no issues to measure. */
  percent: number | null;
  /** `CHK-1 · 45%`, or `CHK-1 · No issues`. */
  label: string;
  /** `5 of 11 done`, or `No issues yet`. */
  summary: string;
  /** For a tooltip and for the bar's accessible name. */
  description: string;
};

export type RoadmapModel = {
  range: RoadmapRange;
  rows: RoadmapRow[];
  undated: Issue[];
  /** Pixels from the left of the timeline. */
  todayX: number;
};

/** Done over total for one epic, worded. No issues is "No issues yet", not 0%. */
export function epicSummary(progress: { done: number; total: number }): string {
  if (progress.total === 0) return "No issues yet";
  return `${progress.done} of ${progress.total} done`;
}

export function epicBarLabel(key: string, ratio: number | null): string {
  return ratio === null ? `${key} · No issues` : `${key} · ${percent(ratio)}%`;
}

/**
 * Everything the roadmap draws. An epic's progress is the points-weighted share
 * of its issues that are done — an issue with no points weighs one, sub-tasks are
 * left out — from `epicProgress`, so the bar and the drawer's epic meter agree.
 */
export function roadmapModel(args: {
  epics: readonly Issue[];
  issues: readonly Issue[];
  statuses: readonly ProjectStatus[];
  today: string;
}): RoadmapModel {
  const { scheduled, undated } = splitEpics(args.epics);
  const range = roadmapRange({ today: args.today, scheduled });

  const rows = scheduled.map(({ epic, start, due }): RoadmapRow => {
    const progress = epicProgress(
      args.statuses,
      args.issues.filter((issue) => issue.epicId === epic.id),
    );
    const { left, width } = barGeometry(range, start, due);
    const summary = epicSummary(progress);
    return {
      epic,
      start,
      due,
      left,
      width,
      labelInside: width >= LABEL_INSIDE_PX,
      progress,
      percent: progress.ratio === null ? null : percent(progress.ratio),
      label: epicBarLabel(epic.key, progress.ratio),
      summary,
      description: `${epic.key} ${epic.title}, ${formatSpan(start, due)}, ${summary}`,
    };
  });

  return { range, rows, undated, todayX: todayX(range, args.today) };
}

/**
 * Where the scrolling area should open, in pixels from the left of the timeline.
 *
 * Today must be in view and clear of the sticky name column, so that is the first
 * rule. Within it, open as far left as shows the start of the epics running today
 * (their labels are written at their left end), and no further. With room for a
 * whole month that is the start of the earliest of them; on a phone, where there
 * is room for little more than today, it is today with a short lead.
 *
 * `viewWidth` is the width of the timeline's visible part, beside the name column.
 */
export function openingScroll(args: {
  todayX: number;
  /** The left edge of the earliest bar that is running today, if any is. */
  earliestLeft: number | null;
  viewWidth: number;
}): number {
  const { todayX, earliestLeft, viewWidth } = args;
  const latest = todayX - OPENING_LEAD_PX;
  if (earliestLeft === null || viewWidth <= 0) return Math.max(0, latest);
  /* Today stays at least this far in from the right edge. */
  const earliest = todayX - (viewWidth - OPENING_TAIL_PX);
  const wanted = earliestLeft - OPENING_GUTTER_PX;
  return Math.max(0, Math.min(latest, Math.max(earliest, wanted)));
}

/** The left edge of the earliest bar that today falls inside, or null. */
export function earliestRunningLeft(
  rows: readonly Pick<RoadmapRow, "left" | "width">[],
  todayPx: number,
): number | null {
  const running = rows.filter(
    (row) => row.left <= todayPx && row.left + row.width >= todayPx,
  );
  return running.length ? Math.min(...running.map((row) => row.left)) : null;
}
