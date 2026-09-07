"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { ApiError } from "@/lib/api/client";
import {
  leaveApi,
  type HolidayCalendar,
  type HolidayPatch,
  type NewHolidayInput,
  type PublicHolidayRow,
} from "@/lib/api/leave";
import { PUBLIC_HOLIDAYS } from "@/lib/mock/workflows";
import { createPersistedState } from "./persisted";
import { useSession } from "./session";
import { useRevalidation } from "@/lib/revalidate";
import { createSharedResource } from "@/lib/shared-resource";

/**
 * The public holiday calendar, in both modes.
 *
 * Split out of `lib/store/leave-api.ts` when the calendar became a thing you can
 * edit rather than a list you can look at. Leave requests and holidays share an
 * API module because they share a router; they do not share a screen, a cache or
 * a refresh, and a hook that reloads "leave" after a holiday was added would
 * refetch two hundred requests to redraw twelve dates.
 *
 * ## Shape
 *
 * Read and write are separate hooks, for the reason `store/shifts.ts` separates
 * them: a screen showing the calendar *and* a count *and* an attendance panel has
 * more than one thing to refresh after one write, so each write returns and the
 * caller reloads what it shows. This file follows `store/shifts.ts` structurally
 * on purpose — the demo value is a `useMemo` that never touches state, the fetch
 * is an async IIFE inside the effect behind a `cancelled` guard, and staleness is
 * decided by comparing a key during render rather than by clearing state in an
 * effect. Any other arrangement is a setState in an effect, which the lint rule
 * catches and which produces a render you cannot see.
 *
 * ## What differs between the two modes, honestly
 *
 * | | Connected | Demo |
 * |---|---|---|
 * | Rows | `GET /leave/holidays`, the company's own table | the 2026 Nigerian seed, in this browser |
 * | `awaitingProclamation` | the API's own count | counted here from the rows |
 * | Writes | `MANAGE_SETTINGS`, audited, five services see them | localStorage, this browser only |
 *
 * One demo-only gap worth knowing about, because a screen has to say it:
 * **`lib/workflows/attendance.ts#isHoliday` reads the `PUBLIC_HOLIDAYS` seed
 * directly, not this store.** So the demo timesheet agrees with an untouched demo
 * calendar exactly — it is seeded from the same array — and stops agreeing the
 * moment somebody adds or removes a date here. Connected there is no such gap:
 * attendance, overtime, payroll and the help desk all read the one table this
 * hook writes to. `/settings/leave` says so in demo mode rather than leaving
 * somebody to find it.
 *
 * ## Never `confirmedOnly`
 *
 * Neither mode filters unconfirmed dates out, and the API's default matches. An
 * unconfirmed row means "expected, not gazetted", which is the single most useful
 * thing on a Nigerian holiday calendar — the dates that move are the ones people
 * need to plan around. See the header of `lib/api/leave.ts`.
 */

/* ------------------------------------------------------------- the demo store */

type DemoState = { holidays: PublicHolidayRow[] };

const DEMO_SEED: DemoState = {
  holidays: PUBLIC_HOLIDAYS.map((holiday) => ({
    id: holiday.id,
    date: holiday.date,
    name: holiday.name,
    confirmed: holiday.confirmed,
  })),
};

const demoStore = createPersistedState<DemoState>({
  key: "approvehr.holidays.store",
  empty: DEMO_SEED,
  version: 1,
});

let demoCounter = 0;
const demoId = (): string => {
  demoCounter += 1;
  return `dh-${Date.now().toString(36)}-${demoCounter}`;
};

/**
 * Same shape the API refuses with, so a screen renders one message either way.
 *
 * A `function` declaration rather than a const arrow, for the reason
 * `store/shifts.ts` gives: only a declaration returning `never` narrows the code
 * after the call, and every caller here relies on that.
 */
function refuse(status: number, code: string, message: string): never {
  throw new ApiError(status, code, message);
}

const byDate = (a: PublicHolidayRow, b: PublicHolidayRow): number =>
  a.date.localeCompare(b.date);

const yearOf = (isoDate: string): number => Number(isoDate.slice(0, 4));

/* -------------------------------------------------------------------- reading */

export type HolidaySource = "api" | "demo";

export type HolidayCalendarState = {
  /** The year's dates, earliest first. Empty while loading. */
  holidays: PublicHolidayRow[];
  /**
   * How many of them are not gazetted yet — `null` until that is known.
   *
   * Null rather than 0 while a request is in flight, because "no dates are
   * awaiting proclamation" is a claim about the company and rendering it before
   * the answer arrives makes it a false one.
   */
  awaitingProclamation: number | null;
  year: number;
  loading: boolean;
  error: ApiError | null;
  source: HolidaySource;
  reload: () => void;
};

const NO_HOLIDAYS: PublicHolidayRow[] = [];

/**
 * One year of the calendar.
 *
 * `year` is required. A calendar is drawn a year at a time and both screens that
 * use this have a year control, so an "every year on file" mode would be a shape
 * neither of them renders.
 */
/**
 * The shared cache behind every caller.
 *
 * One request per year per session, however many components ask. `/people/leave`
 * mounts this three times — the calendar and the booking form's two years — and
 * before this it was three separate `useEffect` fetches, six with React's
 * development double-invoke. That is the same defect `lib/permissions.ts` had
 * at twenty-two, and `shared-resource.ts` exists because of it; its header says
 * to use it for any future shared read, and this is one.
 *
 * ## The value is the OUTCOME, not the calendar
 *
 * The fetcher resolves `{ calendar, error }` rather than rejecting. A shared
 * resource caches what its fetcher resolves, so a rejection would come back as
 * `null` and every caller would render an empty year with no explanation —
 * `LoadFailure` needs the API's own sentence, and the whole point of that
 * component is that the server's message is the useful part.
 *
 * A failure therefore sticks until somebody asks again, where before each mount
 * retried on its own. That is the better behaviour and not merely an accepted
 * cost: `reload` is on the state, `LoadFailure` renders a retry, and one press
 * now re-fetches for every component showing the year rather than for the one
 * that happened to be pressed.
 */
type HolidayOutcome = { calendar: HolidayCalendar; error: ApiError | null };

const holidayYears = createSharedResource<HolidayOutcome>(
  async (key, signal) => {
    const year = Number(key);
    try {
      return { calendar: await leaveApi.holidays(year, signal), error: null };
    } catch (error) {
      /* An abort is the resource dropping the request, not an answer. Rethrowing
       keeps it out of the cache so the next subscriber starts a fresh load. */
      if (error instanceof DOMException && error.name === "AbortError")
        throw error;
      return {
        calendar: { holidays: NO_HOLIDAYS, awaitingProclamation: 0 },
        error: error instanceof ApiError ? error : null,
      };
    }
  },
);

/** Re-fetch every year currently on screen. Called after a write. */
export function refreshHolidayYear(year: number): void {
  holidayYears.refresh(String(year));
}

/**
 * One year of the calendar.
 *
 * `year` is required. A calendar is drawn a year at a time and both screens that
 * use this have a year control, so an "every year on file" mode would be a shape
 * neither of them renders.
 */
export function usePublicHolidays(year: number): HolidayCalendarState {
  const { isConnected } = useSession();
  const demo = useSyncExternalStore(
    demoStore.subscribe,
    demoStore.read,
    demoStore.getServerSnapshot,
  );

  const outcome = holidayYears.use(isConnected ? String(year) : null);

  /* Re-ask when somebody comes back to the window. The resource replaces the
     value in place, so the screen never flashes a skeleton for an answer it
     already has. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected || revalidation === 0) return;
    holidayYears.refresh(String(year));
  }, [isConnected, year, revalidation]);

  const reload = useCallback(() => {
    holidayYears.refresh(String(year));
  }, [year]);

  /* The demo answer, derived and never written to state. Counting here rather
     than reading a stored figure is the same decision the API made: one number,
     computed from the rows in front of you, cannot drift from them. */
  const demoCalendar = useMemo<HolidayCalendar>(() => {
    const rows = demo.holidays
      .filter((holiday) => yearOf(holiday.date) === year)
      .sort(byDate);
    return {
      holidays: rows,
      awaitingProclamation: rows.filter((holiday) => !holiday.confirmed).length,
    };
  }, [demo, year]);

  if (!isConnected) {
    return {
      holidays: demoCalendar.holidays,
      awaitingProclamation: demoCalendar.awaitingProclamation,
      year,
      loading: false,
      error: null,
      source: "demo",
      reload,
    };
  }

  return {
    holidays: outcome ? outcome.calendar.holidays : NO_HOLIDAYS,
    /* Null, not 0, until the answer is in — "no dates are awaiting
       proclamation" is a claim about the company. */
    awaitingProclamation: outcome
      ? outcome.calendar.awaitingProclamation
      : null,
    year,
    loading: outcome === null,
    error: outcome ? outcome.error : null,
    source: "api",
    reload,
  };
}

/**
 * The demo calendar's counts for one year, without touching the network.
 *
 * For `lib/store/setup-checklist.ts`. `usePublicHolidays` fetches whenever a
 * session is connected, and the checklist already carries the same two figures
 * in its one response — so a summary calling it would send a second request for
 * something it has. Demo mode has no such request to make, and this is how it
 * answers the same question.
 */
export function useDemoHolidayCounts(year: number): {
  holidays: number;
  awaitingProclamation: number;
} {
  const demo = useSyncExternalStore(
    demoStore.subscribe,
    demoStore.read,
    demoStore.getServerSnapshot,
  );
  return useMemo(() => {
    const rows = demo.holidays.filter(
      (holiday) => yearOf(holiday.date) === year,
    );
    return {
      holidays: rows.length,
      awaitingProclamation: rows.filter((holiday) => !holiday.confirmed).length,
    };
  }, [demo, year]);
}

/* -------------------------------------------------------------------- writing */

export type HolidayMutations = {
  create: (input: NewHolidayInput) => Promise<{ id: string }>;
  update: (id: string, patch: HolidayPatch) => Promise<{ id: string }>;
  /** Marks a proclaimed date settled. `update(id, { confirmed: true })`, named. */
  confirm: (id: string) => Promise<{ id: string }>;
  /** Hard, in both modes. Nothing is checked — see `HOLIDAY_DELETE_EFFECTS`. */
  remove: (id: string) => Promise<{ id: string }>;
};

/**
 * Every write, in one hook.
 *
 * Connected these need `MANAGE_SETTINGS`; gate the controls with
 * `useCan("MANAGE_SETTINGS")` rather than letting somebody press a button that
 * answers 403. Demo mode grants everything, which is what a demo is for.
 *
 * The demo refusals mirror the API's, message for message. A screen that only
 * behaves correctly against the real thing is a screen nobody tested.
 */
export function useHolidayMutations(): HolidayMutations {
  const { isConnected } = useSession();

  const create = useCallback(
    async (input: NewHolidayInput): Promise<{ id: string }> => {
      if (isConnected) return leaveApi.createHoliday(input);

      const state = demoStore.current();
      const name = input.name.trim();
      if (
        state.holidays.some(
          (holiday) =>
            holiday.date === input.date &&
            holiday.name.toLowerCase() === name.toLowerCase(),
        )
      ) {
        refuse(
          409,
          "conflict",
          `${name} is already on the calendar for that date.`,
        );
      }
      const row: PublicHolidayRow = {
        id: demoId(),
        date: input.date,
        name,
        /* Absent means confirmed, matching the API and the column default. */
        confirmed: input.confirmed ?? true,
      };
      demoStore.commit({ ...state, holidays: [...state.holidays, row] });
      return { id: row.id };
    },
    [isConnected],
  );

  const update = useCallback(
    async (id: string, patch: HolidayPatch): Promise<{ id: string }> => {
      if (isConnected) return leaveApi.updateHoliday(id, patch);

      const state = demoStore.current();
      const existing = state.holidays.find((holiday) => holiday.id === id);
      if (!existing) refuse(404, "not_found", "No such holiday.");

      const next: PublicHolidayRow = {
        ...existing,
        ...(patch.date === undefined ? {} : { date: patch.date }),
        ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
        ...(patch.confirmed === undefined
          ? {}
          : { confirmed: patch.confirmed }),
      };
      if (
        state.holidays.some(
          (holiday) =>
            holiday.id !== id &&
            holiday.date === next.date &&
            holiday.name.toLowerCase() === next.name.toLowerCase(),
        )
      ) {
        refuse(
          409,
          "conflict",
          `${next.name} is already on the calendar for that date.`,
        );
      }
      demoStore.commit({
        ...state,
        holidays: state.holidays.map((holiday) =>
          holiday.id === id ? next : holiday,
        ),
      });
      return { id };
    },
    [isConnected],
  );

  const confirm = useCallback(
    (id: string): Promise<{ id: string }> => update(id, { confirmed: true }),
    [update],
  );

  const remove = useCallback(
    async (id: string): Promise<{ id: string }> => {
      if (isConnected) return leaveApi.deleteHoliday(id);

      const state = demoStore.current();
      if (!state.holidays.some((holiday) => holiday.id === id)) {
        refuse(404, "not_found", "No such holiday.");
      }
      /* A hard delete here too, deliberately. Archiving in demo mode and hard
         deleting against the API would mean the demo teaches a recovery that
         does not exist: the API keeps no trace of a removed date. */
      demoStore.commit({
        ...state,
        holidays: state.holidays.filter((holiday) => holiday.id !== id),
      });
      return { id };
    },
    [isConnected],
  );

  return { create, update, confirm, remove };
}
