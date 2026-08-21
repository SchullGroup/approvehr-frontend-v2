"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  Callout,
  Card,
  CardBody,
  CardHeader,
  IconButton,
  Spinner,
} from "@/components/ui";
import { UNCONFIRMED_HOLIDAY_EFFECT, type PublicHolidayRow } from "@/lib/api/leave";
import { usePublicHolidays } from "@/lib/store/holidays";
import { shortDate } from "@/lib/today";

/**
 * The year's public holidays, as a calendar.
 *
 * ## Why a calendar and not the list this used to be
 *
 * The question people bring to this card is not "which dates are holidays" — it
 * is "is the week I want off mostly holiday anyway", and a list of eleven dates
 * cannot answer that without arithmetic. Twelve mini-months can be read.
 *
 * ## The unconfirmed distinction does not depend on colour
 *
 * A gazetted date is a **filled** disc. One awaiting proclamation is a **dashed
 * outline**. Fill against outline survives greyscale, a monochrome print and
 * every kind of colour blindness; the tint on top of it is a second cue, not the
 * cue. Every marked cell also carries the holiday's name and its status as text
 * for a screen reader, so nothing here is conveyed by shape alone either.
 *
 * ## `awaitingProclamation` earns its place
 *
 * It is in the legend, attached to the marker it counts, and in a callout that
 * says what an unproclaimed date already does and does not do. A number in a
 * corner with no consequence beside it is decoration; this one tells somebody
 * planning a roster that payroll is already treating an unannounced date as a
 * holiday while their timesheet is not. That asymmetry is real, lives in
 * `UNCONFIRMED_HOLIDAY_EFFECT`, and is the single most surprising thing about the
 * feature.
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
  { short: "M", long: "Monday" },
  { short: "T", long: "Tuesday" },
  { short: "W", long: "Wednesday" },
  { short: "T", long: "Thursday" },
  { short: "F", long: "Friday" },
  { short: "S", long: "Saturday" },
  { short: "S", long: "Sunday" },
];

const pad = (n: number): string => String(n).padStart(2, "0");

const iso = (year: number, month: number, day: number): string =>
  `${year}-${pad(month + 1)}-${pad(day)}`;

/**
 * The month as rows of seven, `null` for the leading and trailing blanks.
 *
 * All UTC. Building a grid with local `Date` arithmetic loses or gains a day for
 * anybody east or west of the server, which is the same reason `lib/api/shifts.ts`
 * parses its dates as UTC.
 */
function weeksOf(year: number, month: number): (number | null)[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells: (number | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= length; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Saturday and Sunday, in Monday-first column terms. */
const isWeekendColumn = (column: number): boolean => column >= 5;

function MiniMonth({
  year,
  month,
  onDate,
}: {
  year: number;
  month: number;
  onDate: (date: string) => PublicHolidayRow[];
}) {
  const weeks = useMemo(() => weeksOf(year, month), [year, month]);

  return (
    <table className="w-full border-separate border-spacing-0.5">
      <caption className="mb-1 text-left text-[0.75rem] font-semibold text-ink">
        {MONTHS[month]}
      </caption>
      <thead>
        <tr>
          {WEEKDAYS.map((day, column) => (
            <th
              key={day.long}
              scope="col"
              className={cn(
                "pb-1 text-[0.625rem] font-medium",
                isWeekendColumn(column) ? "text-faint" : "text-muted",
              )}
            >
              <abbr title={day.long} className="no-underline">
                {day.short}
              </abbr>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week, index) => (
          <tr key={`${year}-${month}-w${index}`}>
            {week.map((day, column) => {
              if (day === null) {
                return <td key={`blank-${column}`} className="size-5" />;
              }
              const date = iso(year, month, day);
              const marked = onDate(date);
              const holiday = marked[0];

              return (
                <td key={date} className="text-center align-middle">
                  {holiday ? (
                    <span
                      className={cn(
                        "inline-flex size-5 items-center justify-center rounded-full text-[0.6875rem] font-semibold",
                        holiday.confirmed
                          ? /* Filled. Reads as a holiday with no colour at all. */
                            "bg-accent text-white"
                          : /* Dashed outline: the same information, unsettled. */
                            "border border-dashed border-warning-text bg-warning-soft text-warning-text",
                      )}
                    >
                      {day}
                      <span className="sr-only">
                        {" "}
                        {marked.map((row) => row.name).join(", ")} —{" "}
                        {holiday.confirmed
                          ? "public holiday"
                          : "public holiday awaiting proclamation"}
                      </span>
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "inline-flex size-5 items-center justify-center text-[0.6875rem]",
                        isWeekendColumn(column) ? "text-faint" : "text-muted",
                      )}
                    >
                      {day}
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The card.
 *
 * `defaultYear` comes from the screen rather than `new Date()`, because demo mode
 * runs on `TODAY` and the real clock would open the calendar on a year the seed
 * has nothing in.
 */
export function HolidayCalendarCard({
  defaultYear,
  canManage,
}: {
  defaultYear: number;
  /** Whether to offer the link to the settings screen that edits this. */
  canManage: boolean;
}) {
  const [year, setYear] = useState(defaultYear);
  const calendar = usePublicHolidays(year);

  /* One pass, so a twelve-month grid does not scan the list 366 times. */
  const byDate = useMemo(() => {
    const map = new Map<string, PublicHolidayRow[]>();
    for (const holiday of calendar.holidays) {
      const existing = map.get(holiday.date);
      if (existing) existing.push(holiday);
      else map.set(holiday.date, [holiday]);
    }
    return map;
  }, [calendar.holidays]);

  const onDate = (date: string): PublicHolidayRow[] => byDate.get(date) ?? [];

  const awaiting = calendar.awaitingProclamation;

  return (
    <Card>
      <CardHeader
        /* See `settings/leave/holidays-panel.tsx`: `action` is `shrink-0`, so on a
           narrow screen the header has to wrap or the description does. */
        className="flex-wrap"
        title={`Public holidays ${year}`}
        description={
          calendar.source === "demo"
            ? "Demo calendar — Nigeria's 2026 dates, seeded into this browser. Not a company calendar."
            : "Attendance, overtime, payroll proration and the help desk's response clock all read these dates."
        }
        action={
          <div className="flex items-center gap-1">
            <IconButton
              label={`Show ${year - 1}`}
              size="sm"
              onClick={() => setYear((y) => y - 1)}
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </IconButton>
            <span className="tabular min-w-14 text-center text-[0.875rem] font-medium text-ink">
              {year}
            </span>
            <IconButton
              label={`Show ${year + 1}`}
              size="sm"
              onClick={() => setYear((y) => y + 1)}
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </IconButton>
          </div>
        }
      />

      <CardBody className="flex flex-col gap-5">
        {calendar.error && (
          <Callout tone="danger" title="Could not read the calendar">
            {calendar.error.message}
          </Callout>
        )}

        {/* The count, with the consequence attached. Both halves are true and
            the second is the one nobody expects. */}
        {awaiting !== null && awaiting > 0 && (
          <Callout
            tone="warning"
            title={`${awaiting} ${awaiting === 1 ? "date is" : "dates are"} not gazetted yet`}
          >
            <span className="flex flex-col gap-1.5 text-[0.875rem] leading-relaxed">
              <span>{UNCONFIRMED_HOLIDAY_EFFECT.acts}</span>
              <span>{UNCONFIRMED_HOLIDAY_EFFECT.waits}</span>
            </span>
          </Callout>
        )}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="flex items-center gap-2 text-[0.75rem] text-body">
            <span
              aria-hidden="true"
              className="inline-flex size-5 items-center justify-center rounded-full bg-accent text-[0.6875rem] font-semibold text-white"
            >
              1
            </span>
            Gazetted
          </span>
          <span className="flex items-center gap-2 text-[0.75rem] text-body">
            <span
              aria-hidden="true"
              className="inline-flex size-5 items-center justify-center rounded-full border border-dashed border-warning-text bg-warning-soft text-[0.6875rem] font-semibold text-warning-text"
            >
              1
            </span>
            Awaiting proclamation
            {awaiting !== null && awaiting > 0 && ` (${awaiting})`}
          </span>
          {canManage && (
            <Link
              href="/settings/leave"
              className="ml-auto text-[0.75rem] text-accent-text underline-offset-4 hover:underline"
            >
              Manage the calendar
            </Link>
          )}
        </div>

        {calendar.loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {MONTHS.map((name, month) => (
                <MiniMonth key={name} year={year} month={month} onDate={onDate} />
              ))}
            </div>

            {/* The dates themselves, because "when is Eid" is also a question and
                counting cells is not how anybody answers it. */}
            {calendar.holidays.length === 0 ? (
              <p className="text-[0.875rem] text-muted">
                Nothing on the calendar for {year}.
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {calendar.holidays.map((holiday) => (
                  <li
                    key={holiday.id}
                    className="flex items-center gap-2.5 rounded-md border border-line p-2.5"
                  >
                    <CalendarDays
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-faint"
                    />
                    <span className="tabular w-14 shrink-0 text-[0.75rem] text-muted">
                      {shortDate(holiday.date)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[0.875rem] text-ink">
                      {holiday.name}
                    </span>
                    {!holiday.confirmed && (
                      <Badge tone="warning" size="sm">
                        Awaiting proclamation
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
