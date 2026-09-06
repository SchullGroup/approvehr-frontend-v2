"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton, Skeleton } from "@/components/ui";
import type { ApiAttendanceDay } from "@/lib/api/attendance";

/**
 * A month, deliberately plain.
 *
 * A grid, arrows for the month either side, one click to pick a day. No week
 * view, no drag, no popovers — the question this answers is "which day should I
 * open", and every one of those would be a second question in the way of it.
 *
 * ## The counts are what make it more than a date picker
 *
 * A cell reading "8 in · 2 out" lets somebody scan a month and find the day worth
 * looking at. They come from one request for the whole month
 * (`GET /attendance/summary`), and from the same resolver the day table under
 * this uses, so a cell and the table cannot disagree. Nothing here computes a
 * status.
 *
 * ## Four kinds of cell, and none of them is "0 out"
 *
 * | Cell | What it says | Why |
 * |---|---|---|
 * | working day, tracked | `8 in · 2 out`, or `8 in` when nobody was out | the ordinary case |
 * | working day, nothing recorded | a dash, and "no attendance recorded" in the label | `absent` is null: no record is not a record of absence |
 * | rest day / public holiday | tinted, no counts | nothing was owed |
 * | ahead of today | dimmed, not clickable | nothing can be said about a day that has not happened |
 *
 * The second row is the one this screen exists to get right. A day before the
 * company started clocking in, and a day nobody came in, look identical in the
 * data; only one of them is a claim anybody should make. Printing "0 in · 10 out"
 * on the first is the zero-pay bug wearing a calendar.
 *
 * ## Nothing is conveyed by colour alone
 *
 * A public holiday is a **filled** disc and a date awaiting proclamation a
 * **dashed** one — the same language `people/leave/holiday-calendar.tsx` uses, so
 * the two calendars in this product read alike. Fill against outline survives
 * greyscale, a monochrome print and every kind of colour blindness. Every cell
 * also carries its counts as an accessible label, because two small numbers under
 * a date are not a sentence a screen reader can make sense of.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Monday first: the Nigerian working week, and what every wall calendar shows. */
const WEEKDAYS = [
  { short: "Mon", long: "Monday" },
  { short: "Tue", long: "Tuesday" },
  { short: "Wed", long: "Wednesday" },
  { short: "Thu", long: "Thursday" },
  { short: "Fri", long: "Friday" },
  { short: "Sat", long: "Saturday" },
  { short: "Sun", long: "Sunday" },
];

const pad = (n: number): string => String(n).padStart(2, "0");

/** `2026-08` → `August 2026`. */
export function monthLabel(month: string): string {
  const index = Number(month.slice(5, 7)) - 1;
  return `${MONTHS[index] ?? month} ${month.slice(0, 4)}`;
}

/** The month `offset` months from this one, as `YYYY-MM`. */
export function shiftMonth(month: string, offset: number): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1 + offset;
  const moved = new Date(Date.UTC(year, index, 1));
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}`;
}

/**
 * The month as rows of seven, `null` for the leading and trailing blanks.
 *
 * All UTC. Building a grid from local `Date` arithmetic loses or gains a day for
 * anybody east or west of the server — the same reason `lib/api/shifts.ts` parses
 * its dates as UTC.
 */
function weeksOf(month: string): (string | null)[][] {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1;
  const first = new Date(Date.UTC(year, index, 1));
  /* Monday-first: `getUTCDay` puts Sunday at 0, so rotate by six. */
  const lead = (first.getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();

  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= length; day += 1) cells.push(`${month}-${pad(day)}`);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * What a cell says out loud, and what it says to a screen reader.
 *
 * One function so the two cannot drift, and so the "no attendance recorded"
 * wording exists in exactly one place. `absent === null` is the whole reason it
 * takes the day rather than three numbers.
 */
function cellClaim(day: ApiAttendanceDay): {
  /** Stacked, one per line. Two short lines fit a calendar column; one long one does not. */
  counts: { text: string; tone: "in" | "out" }[];
  /** The word in place of counts, when there are none to make. */
  filler: string;
  /** The full sentence, for the button's accessible name. */
  label: string;
} {
  const date = `${Number(day.date.slice(8, 10))} ${MONTHS[Number(day.date.slice(5, 7)) - 1]}`;
  const none = { counts: [] as { text: string; tone: "in" | "out" }[] };

  /* The dashed disc is a shape, and a shape is not a sentence. An ungazetted
     date is a working day here while payroll is already costing it, so the one
     cue that reaches a screen reader has to say both halves. */
  const expected =
    day.holiday && !day.holiday.confirmed
      ? `, ${day.holiday.name} is expected but not gazetted, so it counts as a working day here`
      : "";

  if (day.future) {
    return { ...none, filler: "", label: `${date}, still to come${expected}` };
  }
  if (day.kind === "HOLIDAY") {
    return {
      ...none,
      filler: "Holiday",
      label: `${date}, public holiday${day.holiday ? `, ${day.holiday.name}` : ""}`,
    };
  }
  if (day.kind === "REST_DAY") {
    return { ...none, filler: "Rest", label: `${date}, rest day${expected}` };
  }

  /* The honest gap. Not "0 in, 10 out": nothing here said anybody was out, so an
     em dash rather than a nought — and "no attendance recorded" in the label,
     which is the sentence the whole screen turns on. */
  if (day.absent === null) {
    return {
      ...none,
      filler: "—",
      label: `${date}, no attendance recorded${expected}`,
    };
  }

  const inCount = day.present + day.late;
  const spoken = [`${inCount} in`];
  if (day.absent > 0) spoken.push(`${day.absent} not accounted for`);
  if (day.onLeave > 0) spoken.push(`${day.onLeave} on approved leave`);

  return {
    counts: [
      { text: `${inCount} in`, tone: "in" },
      ...(day.absent > 0
        ? [{ text: `${day.absent} out`, tone: "out" as const }]
        : []),
    ],
    filler: "",
    label: `${date} — ${spoken.join(", ")}, of ${day.people} on the payroll${expected}`,
  };
}

export function MonthCalendar({
  month,
  days,
  today,
  selected,
  loading,
  onMonth,
  onSelect,
}: {
  month: string;
  days: ApiAttendanceDay[];
  /** The day to mark. The server's when connected, `TODAY` in demo mode. */
  today: string;
  selected: string;
  loading: boolean;
  onMonth: (month: string) => void;
  onSelect: (date: string) => void;
}) {
  const weeks = useMemo(() => weeksOf(month), [month]);
  const byDate = useMemo(() => {
    const map = new Map<string, ApiAttendanceDay>();
    for (const day of days) map.set(day.date, day);
    return map;
  }, [days]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-line">
        <h3 className="text-body font-semibold text-ink">{monthLabel(month)}</h3>
        <div className="flex items-center gap-1">
          <IconButton
            label={`Show ${monthLabel(shiftMonth(month, -1))}`}
            size="sm"
            onClick={() => onMonth(shiftMonth(month, -1))}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </IconButton>
          <IconButton
            label={`Show ${monthLabel(shiftMonth(month, 1))}`}
            size="sm"
            onClick={() => onMonth(shiftMonth(month, 1))}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </IconButton>
        </div>
      </div>

      {/* Scrolls inside itself on a narrow screen rather than shrinking. Seven
          columns of "12 out" at the 14px floor need about 560px, and the floor is
          not negotiable — `scripts/verify-typescale.ts` is a gate, and the reader
          this product is sold to is frequently over fifty. Wide content scrolling
          in its own container is what `TableWrap` already does. */}
      <div className="overflow-x-auto p-3 sm:p-4">
        <div className="grid min-w-[560px] grid-cols-7 gap-1 sm:gap-1.5">
          {WEEKDAYS.map((weekday) => (
            <div
              key={weekday.long}
              className="pb-1 text-center text-meta font-medium text-muted"
            >
              <abbr title={weekday.long} className="no-underline">
                {weekday.short}
              </abbr>
            </div>
          ))}

          {weeks.flat().map((date, index) => {
            if (date === null) {
              return <div key={`blank-${index}`} aria-hidden="true" />;
            }

            const day = byDate.get(date);
            if (loading || !day) {
              return <Skeleton key={date} className="h-20 rounded-md" />;
            }

            const { counts, filler, label } = cellClaim(day);
            const isToday = date === today;
            const isSelected = date === selected;
            const holiday = day.holiday;

            return (
              <button
                key={date}
                type="button"
                aria-label={label}
                aria-current={isSelected ? "date" : undefined}
                disabled={day.future}
                onClick={() => onSelect(date)}
                className={cn(
                  "flex h-20 flex-col items-center justify-center gap-0.5 rounded-md border px-1 text-center",
                  "transition-colors duration-150",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  /* `future` decides first and alone. A dimmed cell that still
                     lights up under the cursor is a control offering something
                     it will refuse, and `:hover` fires on a disabled button. */
                  day.future
                    ? "cursor-not-allowed border-transparent bg-transparent"
                    : isSelected
                      ? "cursor-pointer border-accent bg-accent-soft"
                      : day.kind === "HOLIDAY"
                        ? "cursor-pointer border-line bg-warning-soft hover:border-line-strong"
                        : day.kind === "REST_DAY"
                          ? "cursor-pointer border-transparent bg-sunken hover:border-line"
                          : "cursor-pointer border-line bg-surface hover:border-line-strong hover:bg-canvas",
                )}
              >
                <span
                  className={cn(
                    "tabular flex size-6 items-center justify-center rounded-full text-body-sm",
                    /* Filled against dashed, exactly as the leave calendar draws
                       it: a gazetted holiday is solid, one awaiting proclamation
                       is an outline. The tint is the second cue, never the cue. */
                    holiday?.confirmed
                      ? "bg-accent font-semibold text-white"
                      : holiday
                        ? "border border-dashed border-warning-text font-semibold text-warning-text"
                        : isToday
                          ? "bg-fill-strong font-semibold text-white"
                          : day.future
                            ? "text-faint"
                            : "font-medium text-ink",
                  )}
                >
                  {Number(date.slice(8, 10))}
                </span>

                {/* Never a zero. A blank or a dash claims nothing; "0 out"
                    claims everybody was accounted for, which on a day nothing
                    was recorded on is a sentence nobody has the records for.
                    `aria-hidden` because the button's own label already says all
                    of this as a sentence. */}
                <span aria-hidden="true" className="flex flex-col leading-tight">
                  {counts.length > 0 ? (
                    counts.map((line) => (
                      <span
                        key={line.tone}
                        className={cn(
                          "text-meta whitespace-nowrap",
                          line.tone === "out"
                            ? "font-medium text-danger-text"
                            : "text-muted",
                        )}
                      >
                        {line.text}
                      </span>
                    ))
                  ) : (
                    <span className="text-meta whitespace-nowrap text-faint">
                      {filler}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * The legend.
 *
 * Exported separately so the card can put it below the grid without the grid
 * needing to know it exists. Every marker on it is one somebody will meet, and
 * the dash is on it because "—" is the only cell whose meaning is not guessable.
 */
export function CalendarLegend({
  awaitingProclamation,
}: {
  /** Whether any date in view is a holiday nobody has gazetted yet. */
  awaitingProclamation: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-5 py-3.5">
      <span className="flex items-center gap-2 text-meta text-body">
        <span
          aria-hidden="true"
          className="inline-flex size-5 items-center justify-center rounded-full bg-fill-strong text-meta font-semibold text-white"
        >
          1
        </span>
        Today
      </span>
      <span className="flex items-center gap-2 text-meta text-body">
        <span
          aria-hidden="true"
          className="inline-flex size-5 items-center justify-center rounded-full bg-accent text-meta font-semibold text-white"
        >
          1
        </span>
        Public holiday
      </span>
      {awaitingProclamation && (
        <span className="flex items-center gap-2 text-meta text-body">
          <span
            aria-hidden="true"
            className="inline-flex size-5 items-center justify-center rounded-full border border-dashed border-warning-text text-meta font-semibold text-warning-text"
          >
            1
          </span>
          Awaiting proclamation: still a working day here
        </span>
      )}
      <span className="flex items-center gap-2 text-meta text-body">
        <span aria-hidden="true" className="text-meta text-faint">
          —
        </span>
        No attendance recorded
      </span>
    </div>
  );
}
