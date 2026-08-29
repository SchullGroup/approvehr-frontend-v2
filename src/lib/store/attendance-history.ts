"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { attendanceApi, type ApiAttendanceDay } from "@/lib/api/attendance";
import { PUBLIC_HOLIDAYS } from "@/lib/mock/workflows";
import { TODAY } from "@/lib/today";
import {
  employedOn,
  firstRecordedDate,
  isHoliday,
  isWorkingDay,
  rosterFor,
} from "@/lib/workflows/attendance";
import { useAttendanceStore, type AttendanceSource } from "./attendance";
import { useEmployeeStore } from "./employees";
import { useLeaveStore } from "./leave";
import { useSession } from "./session";
import { useRevalidation } from "@/lib/revalidate";

/**
 * A month of attendance, one row per day — what a calendar is drawn from.
 *
 * ## Why this is a second hook and not part of `useAttendanceRoster`
 *
 * Same reason `store/holidays.ts` was split out of `store/leave-api.ts`: the
 * month grid and the day table refresh on different things. Picking 3 March
 * refetches one roster and must not redraw the month; correcting somebody's
 * record refetches both. One hook holding both would refetch thirty-one days of
 * counts to move a selection.
 *
 * Structurally it follows `store/shifts.ts`, which is the reference shape in this
 * codebase: the demo value is a `useMemo` that never touches state, the fetch is
 * an async IIFE inside the effect behind a `cancelled` guard, and staleness is
 * decided by comparing a key during render rather than by clearing state in an
 * effect. Anything else is a setState in an effect, which the lint rule catches
 * and which produces a render nobody can see.
 *
 * ## One request per month, never one per day
 *
 * `GET /attendance/summary?month=YYYY-MM` answers the whole month. Reading
 * `/roster` thirty times to draw a calendar is thirty round trips, it trips the
 * rate limiter, and it makes the grid slower to appear than the table under it.
 *
 * ## The counts are the server's, and so are the statuses behind them
 *
 * Nothing here re-derives a status. Connected, every figure comes from the same
 * resolver `/roster` uses (`attendance/day-status.ts` in the API), which is why a
 * cell reading "8 in, 2 out" and the table beneath it cannot disagree. Demo mode
 * has no server to ask, so it calls `rosterFor` — the demo's one copy of the same
 * precedence, and the same function the demo day table calls, so the two agree
 * there for the same structural reason rather than by coincidence.
 *
 * ## `absent: null` is the point of the whole screen
 *
 * A day before the company started recording attendance looks exactly like a day
 * nobody came in, and only one of those is a claim anybody should make. So
 * `absent` is `number | null` and the null cases are: no attendance recorded by
 * then, and a day that has not happened yet. Rendering "0 of 10 in" on either is
 * the zero-pay bug wearing a calendar — `unpaidDaysFor` read "no attendance rows"
 * as "absent all month" and prorated every employee of every company without
 * clock-in to ₦0, with arithmetic that reconciled at every step.
 */

export type AttendanceMonthState = {
  /** `YYYY-MM`, as asked for. */
  month: string;
  /**
   * The day to mark as today, and the last day that may be selected.
   *
   * The server's when connected — the browser's clock is not the one the records
   * were written against — and `TODAY` in demo mode, because the seed is a fixed
   * snapshot and the real clock would open the calendar on a month it has nothing
   * in.
   */
  today: string;
  /**
   * The earliest day anybody clocked in, or null if nobody ever has.
   *
   * Null means this company has no attendance history at all, which a screen has
   * to say in those words rather than drawing a month of absences.
   */
  firstRecordedDate: string | null;
  /** Every day of the month, in order. Empty while loading. */
  days: ApiAttendanceDay[];
  loading: boolean;
  error: ApiError | null;
  source: AttendanceSource;
  reload: () => void;
};

const NO_DAYS: ApiAttendanceDay[] = [];

/** Days in a `YYYY-MM` month. Day 0 of the next month, so February is right. */
function daysInMonth(month: string): number {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1;
  return new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
}

const pad = (n: number): string => String(n).padStart(2, "0");

export function useAttendanceMonth(month: string): AttendanceMonthState {
  const { isConnected } = useSession();
  const local = useAttendanceStore();
  const { directory } = useEmployeeStore();
  const leave = useLeaveStore();

  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<{
    key: string;
    month: string;
    today: string;
    firstRecordedDate: string | null;
    days: ApiAttendanceDay[];
    error: ApiError | null;
  } | null>(null);

  const key = `${month}|${tick}`;

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const summary = await attendanceApi.summary(month, controller.signal);
        if (!cancelled) {
          setFetched({
            key,
            month: summary.month,
            today: summary.today,
            firstRecordedDate: summary.firstRecordedDate,
            days: summary.days,
            error: null,
          });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({
            key,
            month,
            today: new Date().toISOString().slice(0, 10),
            firstRecordedDate: null,
            days: NO_DAYS,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, month, key, revalidation]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  /* The demo's answer, derived and never written to state.
     `rosterFor` per day rather than a second counting loop: it is the function
     the demo day table calls, so a cell and the table under it come from one
     implementation of the precedence instead of two that agree today. */
  const demoDays = useMemo<ApiAttendanceDay[]>(() => {
    const firstRecorded = firstRecordedDate(local.entries);
    /* Narrowed to the month once. `rosterFor` scans the array it is handed for
       every person on every day, and handing it the whole seed would make that
       scan the length of the year. */
    const entries = local.entries.filter((entry) =>
      entry.date.startsWith(month),
    );
    const out: ApiAttendanceDay[] = [];

    for (let day = 1; day <= daysInMonth(month); day += 1) {
      const date = `${month}-${pad(day)}`;
      const employees = directory.filter((employee) =>
        employedOn(employee, date),
      );
      const rows = rosterFor({
        date,
        employees,
        entries,
        leaveRequests: leave.requests,
        policy: local.policy,
      });

      const count = (status: string) =>
        rows.filter((row) => row.status === status).length;

      /* `isHoliday` and `isWorkingDay` are the predicates `rosterFor` itself
         uses, so the day's kind and the rows' statuses cannot disagree — and
         `isWorkingDay` owns the 0-is-Sunday conversion the demo policy needs,
         which is the trap `lib/api/attendance.ts` warns about by name. */
      const confirmedHoliday = isHoliday(date);
      /* The **name and the flag** to draw with, read out of the same array
         `isHoliday` reads. Only a gazetted date changes the day's kind — that
         asymmetry is `UNCONFIRMED_HOLIDAY_EFFECT` and it is the API's too — but
         an expected date is worth marking, so both travel. Reading the seed
         rather than the editable holiday store is the gap recorded in
         `store/holidays.ts`; taking the name from anywhere else would make this
         calendar and the demo timesheet disagree about which days are holidays. */
      const marked = PUBLIC_HOLIDAYS.find((h) => h.date === date) ?? null;
      const tracked = firstRecorded !== null && date >= firstRecorded;
      const future = date > TODAY;

      out.push({
        date,
        kind: confirmedHoliday
          ? "HOLIDAY"
          : isWorkingDay(date, local.policy)
            ? "WORKING"
            : "REST_DAY",
        holiday: marked
          ? { name: marked.name, confirmed: marked.confirmed }
          : null,
        people: employees.length,
        recorded: entries.filter(
          (entry) => entry.date === date && entry.clockIn,
        ).length,
        tracked,
        future,
        present: count("present"),
        late: count("late"),
        onLeave: count("on_leave"),
        absent: tracked && !future ? count("absent") : null,
      });
    }
    return out;
  }, [month, directory, leave.requests, local.entries, local.policy]);

  /* Staleness decided by comparing the key during render, not by clearing state
     in an effect — which would be a synchronous setState and a cascaded render. */
  const matched = fetched !== null && fetched.key === key;

  if (!isConnected) {
    return {
      month,
      today: TODAY,
      firstRecordedDate: firstRecordedDate(local.entries),
      days: demoDays,
      loading: false,
      error: null,
      source: "demo",
      reload,
    };
  }

  return {
    month: matched ? fetched.month : month,
    today: matched
      ? fetched.today
      : /* Not yet known. The browser's date is the honest placeholder for one
           render, and nothing is claimed from it: with no days there is no cell
           to mark or to disable. */
        new Date().toISOString().slice(0, 10),
    firstRecordedDate: matched ? fetched.firstRecordedDate : null,
    days: matched ? fetched.days : NO_DAYS,
    loading: !matched,
    error: matched ? fetched.error : null,
    source: "api",
    reload,
  };
}
