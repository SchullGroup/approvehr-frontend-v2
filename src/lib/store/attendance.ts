"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { BadgeTone } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  attendanceApi,
  type ApiAttendancePolicy,
  type ApiRosterRow,
  type ApiTimesheetRow,
  type ApiWorkLocation,
  type AttendanceStatus,
} from "@/lib/api/attendance";
import type { ApiRotaCell } from "@/lib/api/shifts";
import {
  ATTENDANCE,
  DEFAULT_POLICY,
  WORK_LOCATIONS,
  recentWorkingDays,
  type AttendanceEntry,
  type AttendancePolicy,
  type AttendanceStatus as DemoStatus,
} from "@/lib/mock/attendance";
import { usePayrollSettings } from "@/lib/payroll/use-settings";
import { TODAY } from "@/lib/today";
import { fullName } from "@/lib/types";
import {
  isHoliday,
  prorationFor,
  rosterFor,
  timesheet as localTimesheet,
} from "@/lib/workflows/attendance";
import { useEmployeeStore } from "./employees";
import { useLeaveStore } from "./leave";
import { createPersistedState, patched } from "./persisted";
import { useRota } from "./shifts";
import { useSession } from "./session";

/**
 * Clock-ins, clock-outs and the attendance policy.
 *
 * Two halves, and the split is the point:
 *
 * 1. **`useAttendanceStore`** — the localStorage store. Sparse patches over the
 *    seed, whole new records for anything raised here, hydration-safe via
 *    `createPersistedState`. This is what the demo runs on, and
 *    `components/portal/shell.tsx` reads it for the sidebar badge.
 * 2. **`useAttendanceRoster` / `useAttendanceTimesheet` / `useAttendanceMutations`
 *    / `useWorkLocations`** — the hooks a screen actually calls. Each picks its
 *    source: the API when connected, the store above when not. The screen does
 *    not know which it got, the same way `employees-api.ts` works.
 *
 * The policy lives in the store rather than in a constant for the reason
 * `workingDaysPerMonth` does in payroll settings: an office shift and a site
 * shift are different, and a product that hardcodes 09:00 has quietly decided
 * which kind of company it is for.
 */

type AttendanceState = {
  overrides: Record<string, Partial<AttendanceEntry>>;
  created: AttendanceEntry[];
  /** Sparse patch over DEFAULT_POLICY, so a new policy field is picked up. */
  policy: Partial<AttendancePolicy>;
};

const EMPTY: AttendanceState = { overrides: {}, created: [], policy: {} };

const store = createPersistedState<AttendanceState>({
  key: "approvehr.attendance.store",
  empty: EMPTY,
  version: 1,
});

/**
 * The wall-clock time of day, with the date pinned to the demo's TODAY.
 *
 * The seed dataset is a fixed snapshot, so the date has to be fixed too — but
 * the *time* is real, because clocking in at whatever time it happens to be is
 * the entire behaviour being demonstrated. Pinning both would mean every
 * clock-in landed at the same minute.
 */
export function nowTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;
}

const entryId = (employeeId: string, date: string) =>
  `att-${employeeId}-${date}`;

export function useAttendanceStore() {
  const state = useSyncExternalStore(
    store.subscribe,
    store.read,
    store.getServerSnapshot,
  );

  const policy: AttendancePolicy = { ...DEFAULT_POLICY, ...state.policy };

  const entries: AttendanceEntry[] = [
    ...ATTENDANCE.map((e) => patched(e, state.overrides)),
    ...state.created.map((e) => patched(e, state.overrides)),
  ];

  /** Write a patch, creating the day's entry if it does not exist yet. */
  const upsert = useCallback(
    (employeeId: string, date: string, patch: Partial<AttendanceEntry>) => {
      const s = store.read();
      const id = entryId(employeeId, date);
      const exists =
        ATTENDANCE.some((e) => e.id === id) ||
        s.created.some((e) => e.id === id);

      if (exists) {
        store.commit({
          ...s,
          overrides: { ...s.overrides, [id]: { ...s.overrides[id], ...patch } },
        });
        return;
      }
      store.commit({
        ...s,
        created: [...s.created, { id, employeeId, date, ...patch }],
      });
    },
    [],
  );

  const clockIn = useCallback(
    (employeeId: string, locationId: string, at = nowTime(), date = TODAY) => {
      upsert(employeeId, date, { clockIn: at, locationId });
    },
    [upsert],
  );

  const clockOut = useCallback(
    (employeeId: string, at = nowTime(), date = TODAY) => {
      upsert(employeeId, date, { clockOut: at });
    },
    [upsert],
  );

  /**
   * An HR correction. Requires a note, because a timesheet that payroll pays
   * against must never change without a reason attached — that is the whole
   * argument for keeping attendance and payroll in one system.
   */
  const correct = useCallback(
    (
      employeeId: string,
      date: string,
      patch: Pick<AttendanceEntry, "clockIn" | "clockOut" | "locationId">,
      note: string,
    ) => {
      upsert(employeeId, date, { ...patch, note });
    },
    [upsert],
  );

  const setPolicy = useCallback((patch: Partial<AttendancePolicy>) => {
    const s = store.read();
    store.commit({ ...s, policy: { ...s.policy, ...patch } });
  }, []);

  const resetAll = useCallback(() => store.reset(), []);

  return {
    entries,
    policy,
    setPolicy,
    forDate: (date: string) => entries.filter((e) => e.date === date),
    forEmployee: (employeeId: string) =>
      entries.filter((e) => e.employeeId === employeeId),
    entryFor: (employeeId: string, date: string) =>
      entries.find((e) => e.employeeId === employeeId && e.date === date),
    clockIn,
    clockOut,
    correct,
    resetAll,
  };
}

/* ========================================================================== */
/*  The API-or-demo layer                                                     */
/* ========================================================================== */

/**
 * Which source a screen is looking at, so it can badge itself honestly.
 *
 * The shell already shows the mode; this is here for the few places where the
 * *behaviour* differs and a screen has to say so — the demo's rota does not
 * prorate a demo payslip, because there are no demo runs.
 */
export type AttendanceSource = "api" | "demo";

/** What a status is called on screen. The server picks the value; this names it. */
export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "In",
  LATE: "Late",
  ABSENT: "Not clocked in",
  ON_LEAVE: "On leave",
  HOLIDAY: "Public holiday",
  REST_DAY: "Rest day",
};

export const STATUS_TONE: Record<AttendanceStatus, BadgeTone> = {
  PRESENT: "success",
  LATE: "warning",
  ABSENT: "danger",
  ON_LEAVE: "info",
  HOLIDAY: "accent",
  REST_DAY: "neutral",
};

/**
 * The demo's own status values, mapped onto the wire's.
 *
 * One vocabulary reaches the screen, so the JSX has no idea which mode it is
 * rendering. The demo's `rosterFor` resolves these in the same order the API
 * does — holiday, rest day, approved leave, no clock-in, late or present — and
 * that order is the product decision rather than an implementation detail. If
 * one of the two ever moves, they both move.
 */
const DEMO_STATUS: Record<DemoStatus, AttendanceStatus> = {
  present: "PRESENT",
  late: "LATE",
  absent: "ABSENT",
  on_leave: "ON_LEAVE",
  holiday: "HOLIDAY",
  rest_day: "REST_DAY",
};

/**
 * The demo policy in the wire's shape.
 *
 * The weekday numbering is converted, not copied. The demo policy uses
 * JavaScript's `getUTCDay` where Sunday is 0; the API uses ISO weekdays where
 * Monday is 1 and Sunday is 7. Handing one to the other silently shifts
 * everybody's working week by a day.
 */
function toApiPolicy(policy: AttendancePolicy): ApiAttendancePolicy {
  return {
    id: "demo-policy",
    shiftStart: policy.shiftStart,
    shiftEnd: policy.shiftEnd,
    graceMinutes: policy.graceMinutes,
    workingWeekdays: policy.workingWeekdays.map((day) => (day === 0 ? 7 : day)),
    selfServiceClockIn: policy.selfServiceClockIn,
  };
}

/* ------------------------------------------------------------------- roster */

export type RosterState = {
  /** The date these rows describe. From the server when connected. */
  date: string;
  /** Null only while the first connected request is in flight. */
  policy: ApiAttendancePolicy | null;
  /** Exceptions first. Never re-sort by status — that ordering is the point. */
  rows: ApiRosterRow[];
  loading: boolean;
  error: ApiError | null;
  source: AttendanceSource;
  reload: () => void;
};

/**
 * One row per employee for a day, from whichever source is live.
 *
 * **Connected, the status is the server's and is never recomputed here.** It is
 * resolved in one place — `attendance/service.ts` — in the same order
 * `payroll/assemble.ts` resolves unpaid days, so the timesheet and the payslip
 * cannot disagree about a Tuesday. A second implementation in the browser is
 * exactly how they would.
 *
 * Demo mode has no server to ask, so `rosterFor` in `lib/workflows/attendance.ts`
 * answers instead. That file is the demo's copy of the same precedence, and the
 * comment above `DEMO_STATUS` is the standing note that the two move together.
 */
export function useAttendanceRoster(date?: string): RosterState {
  const { isConnected } = useSession();
  const local = useAttendanceStore();
  const { directory } = useEmployeeStore();
  const leave = useLeaveStore();

  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<{
    key: string;
    date: string;
    policy: ApiAttendancePolicy | null;
    rows: ApiRosterRow[];
    error: ApiError | null;
  } | null>(null);

  const key = `${date ?? ""}|${tick}`;

  /* A date change while a request is in flight must not be overwritten by the
     older answer. The key comparison below handles a stale *render*; this
     handles a stale *response*. */
  const latest = useRef(0);

  useEffect(() => {
    if (!isConnected) return;
    const ticket = latest.current + 1;
    latest.current = ticket;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const roster = await attendanceApi.roster(date, controller.signal);
        if (!cancelled && ticket === latest.current) {
          setFetched({
            key,
            date: roster.date,
            policy: roster.policy,
            rows: roster.rows,
            error: null,
          });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled && ticket === latest.current) {
          setFetched({
            key,
            date: date ?? "",
            policy: null,
            rows: [],
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, date, key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  /* Derived by comparing the key during render rather than cleared in an
     effect, which would be a synchronous setState and a cascaded render. */
  const matched = fetched !== null && fetched.key === key;

  if (!isConnected) {
    const on = date ?? TODAY;
    const rows: ApiRosterRow[] = rosterFor({
      date: on,
      employees: directory,
      entries: local.entries,
      leaveRequests: leave.requests,
      policy: local.policy,
    }).map((row) => ({
      employeeId: row.employee.id,
      employeeName: fullName(row.employee),
      jobTitle: row.employee.jobTitle,
      status: DEMO_STATUS[row.status],
      clockIn: row.entry?.clockIn ?? null,
      clockOut: row.entry?.clockOut ?? null,
      lateByMinutes: row.lateBy,
      workLocation: row.locationName ?? null,
      leave: row.leave
        ? { id: row.leave.id, type: row.leave.type, endDate: row.leave.to }
        : null,
      anomaly: row.anomaly ?? null,
      correctionNote: row.entry?.note ?? null,
    }));

    return {
      date: on,
      policy: toApiPolicy(local.policy),
      rows,
      loading: false,
      error: null,
      source: "demo",
      reload,
    };
  }

  return {
    date: matched ? fetched.date : (date ?? ""),
    policy: matched ? fetched.policy : null,
    rows: matched ? fetched.rows : [],
    loading: !matched,
    error: matched ? fetched.error : null,
    source: "api",
    reload,
  };
}

/* ---------------------------------------------------------------- timesheet */

export type TimesheetState = {
  /** The first working day the window covered. */
  from: string;
  to: string;
  /** Working days in the window, public holidays excluded. */
  workingDays: number;
  rows: ApiTimesheetRow[];
  loading: boolean;
  error: ApiError | null;
  source: AttendanceSource;
  reload: () => void;
};

/**
 * Days present, late, on leave and unexplained over the last `days` working days.
 *
 * The proration figure is in **naira** by the time it arrives here — converted
 * at the `lib/api` boundary — and it uses payroll's own `workingDaysPerMonth`,
 * so it is the amount a run would actually withhold rather than a second
 * estimate of it. Demo mode reads the same divisor out of `PayrollSettings`
 * for the same reason.
 *
 * **It is measured against the office week.** Anyone on a rota is measured
 * against their rota by `unpaidDaysFor`, and the two answers differ by most of
 * a month for a four-on-four-off crew — so a screen showing these figures must
 * pair them with `useRotaContext` and say which basis applies.
 */
export function useAttendanceTimesheet(days = 15): TimesheetState {
  const { isConnected } = useSession();
  const local = useAttendanceStore();
  const { directory } = useEmployeeStore();
  const leave = useLeaveStore();
  const { settings } = usePayrollSettings();

  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<{
    key: string;
    from: string;
    to: string;
    workingDays: number;
    rows: ApiTimesheetRow[];
    error: ApiError | null;
  } | null>(null);

  const key = `${days}|${tick}`;
  const latest = useRef(0);

  useEffect(() => {
    if (!isConnected) return;
    const ticket = latest.current + 1;
    latest.current = ticket;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const sheet = await attendanceApi.timesheet({ days }, controller.signal);
        if (!cancelled && ticket === latest.current) {
          setFetched({ key, ...sheet, error: null });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled && ticket === latest.current) {
          setFetched({
            key,
            from: "",
            to: "",
            workingDays: 0,
            rows: [],
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, days, key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const matched = fetched !== null && fetched.key === key;

  if (!isConnected) {
    /* The same window `localTimesheet` walks, so the dates in the heading are
       the dates the figures came from. */
    const window = recentWorkingDays(days, local.policy).filter(
      (day) => !isHoliday(day),
    );
    const rows: ApiTimesheetRow[] = localTimesheet({
      employees: directory,
      entries: local.entries,
      leaveRequests: leave.requests,
      policy: local.policy,
      days,
    }).map((row) => ({
      employeeId: row.employee.id,
      employeeName: fullName(row.employee),
      workingDays: row.workingDays,
      daysPresent: row.daysPresent,
      daysLate: row.daysLate,
      daysOnLeave: row.daysOnLeave,
      daysUnexplained: row.daysAbsent,
      hours: row.hours,
      proration: {
        unpaidDays: row.daysAbsent,
        workingDaysPerMonth: settings.workingDaysPerMonth,
        amount: prorationFor({
          grossMonthly: row.employee.grossMonthly,
          unpaidDays: row.daysAbsent,
          workingDaysPerMonth: settings.workingDaysPerMonth,
        }).amount,
      },
    }));

    return {
      /* `recentWorkingDays` counts backwards, so the oldest day is last. */
      from: window[window.length - 1] ?? TODAY,
      to: window[0] ?? TODAY,
      workingDays: window.length,
      rows,
      loading: false,
      error: null,
      source: "demo",
      reload,
    };
  }

  return {
    from: matched ? fetched.from : "",
    to: matched ? fetched.to : "",
    workingDays: matched ? fetched.workingDays : 0,
    rows: matched ? fetched.rows : [],
    loading: !matched,
    error: matched ? fetched.error : null,
    source: "api",
    reload,
  };
}

/* ---------------------------------------------------------------- locations */

export type LocationsState = {
  locations: ApiWorkLocation[];
  loading: boolean;
  error: ApiError | null;
  source: AttendanceSource;
  /**
   * Adds one and returns it, so a caller can select what it just made.
   *
   * The point of returning the row rather than void: a picker that offers
   * "create a new location" has to leave the new location *chosen*. Making
   * somebody create a thing and then find it in the list they were already
   * looking at is the kind of small insult that makes a form feel hostile.
   *
   * Refuses in demo mode rather than writing to this browser — a location is
   * company configuration, and inventing one locally would have it vanish on the
   * next machine while every employee assigned to it kept pointing at nothing.
   */
  create: (input: { name: string; addressLine?: string }) => Promise<ApiWorkLocation>;
};

/**
 * Where people clock in.
 *
 * A location is part of the record rather than an afterthought: a site team
 * clocking in "at the office" is the exact problem this solves. The ids differ
 * between the two modes — uuids from the API, `loc-hq` from the seed — which is
 * why nothing may hardcode one. Take the default from the list.
 */
export function useWorkLocations(): LocationsState {
  const { isConnected } = useSession();
  const [fetched, setFetched] = useState<{
    locations: ApiWorkLocation[];
    error: ApiError | null;
  } | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const locations = await attendanceApi.locations(controller.signal);
        if (!cancelled) setFetched({ locations, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({
            locations: [],
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected]);

  if (!isConnected) {
    return {
      locations: WORK_LOCATIONS.map((location) => ({
        id: location.id,
        name: location.name,
        addressLine: location.address,
        remoteAllowed: location.remoteAllowed,
      })),
      loading: false,
      error: null,
      source: "demo",
      create: () =>
        Promise.reject(
          new Error(
            "Locations cannot be added in demo mode. Connect to the API first.",
          ),
        ),
    };
  }

  return {
    locations: fetched?.locations ?? [],
    loading: fetched === null,
    error: fetched?.error ?? null,
    source: "api",
    create: async (input) => {
      const made = await attendanceApi.createLocation(input);
      /* Folded into the list held here rather than refetching: the caller is
         about to select it, and a round trip would leave the picker briefly
         showing a list without the thing that was just created in it. */
      setFetched((prior) => ({
        locations: [...(prior?.locations ?? []), made].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
        error: prior?.error ?? null,
      }));
      return made;
    },
  };
}

/* ---------------------------------------------------------------- mutations */

/**
 * Clocking in, clocking out, and correcting a record.
 *
 * Connected, `clockIn` and `clockOut` deliberately send **no employee id**: the
 * API reads it off the session. Sending one is an HR action needing
 * `EDIT_RECORDS`, and the id the browser holds is a *user* id in connected mode
 * — passing it where an employee id belongs looks up nothing. Demo mode has no
 * session to read, so it attributes to `actingId`.
 *
 * Every refusal comes back as an `ApiError` with the API's own wording — "Already
 * clocked in at 08:12. Use a correction to change it." Show that, not "failed".
 */
export function useAttendanceMutations() {
  const { isConnected, actingId } = useSession();
  const local = useAttendanceStore();

  const clockIn = useCallback(
    async (locationId?: string) => {
      if (!isConnected) {
        const entry = local.entryFor(actingId, TODAY);
        if (entry?.clockIn) {
          throw new ApiError(
            409,
            "conflict",
            `Already clocked in at ${entry.clockIn}. Use a correction to change it.`,
          );
        }
        const at = nowTime();
        local.clockIn(actingId, locationId ?? "", at);
        return { employeeId: actingId, date: TODAY, time: at };
      }
      return attendanceApi.clockIn(
        locationId ? { workLocationId: locationId } : {},
      );
    },
    [isConnected, actingId, local],
  );

  const clockOut = useCallback(async () => {
    if (!isConnected) {
      const entry = local.entryFor(actingId, TODAY);
      if (!entry?.clockIn) {
        throw new ApiError(
          409,
          "conflict",
          "There is no clock-in for that day to close.",
        );
      }
      if (entry.clockOut) {
        throw new ApiError(
          409,
          "conflict",
          `Already clocked out at ${entry.clockOut}.`,
        );
      }
      const at = nowTime();
      local.clockOut(actingId, at);
      return { employeeId: actingId, date: TODAY, time: at };
    }
    return attendanceApi.clockOut();
  }, [isConnected, actingId, local]);

  /**
   * A correction, and the note is not optional in either mode.
   *
   * The API's schema requires it; this checks first so the demo refuses on the
   * same terms rather than being the lenient one. Money is paid against this
   * record — a change with no stated reason is precisely the thing nobody can
   * explain six months later.
   */
  const correct = useCallback(
    async (
      employeeId: string,
      date: string,
      patch: {
        clockIn?: string | null;
        clockOut?: string | null;
        locationId?: string | null;
      },
      note: string,
    ) => {
      const reason = note.trim();
      if (reason.length < 3) {
        throw new ApiError(
          422,
          "validation_error",
          "Say why this changed — payroll pays against this record.",
          [{ field: "note", message: "Say why this changed." }],
        );
      }
      if (!isConnected) {
        local.correct(
          employeeId,
          date,
          {
            ...(patch.clockIn ? { clockIn: patch.clockIn } : {}),
            ...(patch.clockOut ? { clockOut: patch.clockOut } : {}),
            ...(patch.locationId ? { locationId: patch.locationId } : {}),
          },
          reason,
        );
        return;
      }
      await attendanceApi.correct(employeeId, date, {
        ...(patch.clockIn === undefined ? {} : { clockIn: patch.clockIn }),
        ...(patch.clockOut === undefined ? {} : { clockOut: patch.clockOut }),
        ...(patch.locationId === undefined
          ? {}
          : { workLocationId: patch.locationId }),
        note: reason,
      });
    },
    [isConnected, local],
  );

  return { clockIn, clockOut, correct, connected: isConnected };
}

/* -------------------------------------------------------------------- rotas */

export type RotaContext = {
  /** Employees with at least one rostered day in the window. */
  onRota: Set<string>;
  /** Rostered days per person in the window. Their working month. */
  rosteredDays: Map<string, number>;
  /** The shift somebody is on for a date, or null for a day off. */
  shiftOn: (employeeId: string, date: string) => ApiRotaCell | null;
  loading: boolean;
};

/**
 * Who is on a rota over a window, and which days.
 *
 * ## Why an attendance screen has to read the rota at all
 *
 * `GET /attendance/roster` and `GET /attendance/timesheet` measure everybody
 * against `AttendancePolicy.workingWeekdays` — the office week. Payroll does
 * not: `unpaidDaysFor` in `payroll/assemble.ts` checks for rostered days first,
 * and if there are any, **the rota decides which days were expected** and rest
 * days and public holidays stop applying, because being rostered on a public
 * holiday is exactly what a rota is for.
 *
 * For a four-on-four-off crew the two bases disagree about most of the month. So
 * a screen that shows an attendance figure for somebody on a rota without saying
 * which basis it used is the "timesheet and payslip disagree" bug, printed.
 *
 * ## Read unconditionally, not behind the `shifts` feature flag
 *
 * Turning a flag off never deletes data — so a company with `shifts` off can
 * still have rostered days, and payroll will still measure those people against
 * them. Gating this read on the flag would reintroduce the exact disagreement it
 * exists to prevent, for the companies least likely to notice. One `GET
 * /shifts/rota` per attendance view is the price.
 *
 * ## What this does *not* do
 *
 * It does not change anybody's status. The badge on a row stays whatever the
 * server said it was. This only adds the fact the attendance endpoints do not
 * have, and lets the screen label a rest day as a rest day.
 */
export function useRotaContext(from: string, to: string): RotaContext {
  const { rota, loading } = useRota({ from, to });

  return useMemo(() => {
    const onRota = new Set<string>();
    const rosteredDays = new Map<string, number>();
    const cells = new Map<string, ApiRotaCell>();

    for (const row of rota?.rows ?? []) {
      /* A rest day is the absence of a cell, in the rota's own model — so
         counting rostered days is a count of non-null cells, never a filter on
         a status. */
      const worked = row.days.filter((cell): cell is ApiRotaCell => cell !== null);
      if (worked.length === 0) continue;
      onRota.add(row.employeeId);
      rosteredDays.set(row.employeeId, worked.length);
      for (const cell of worked) {
        cells.set(`${row.employeeId}|${cell.date}`, cell);
      }
    }

    return {
      onRota,
      rosteredDays,
      shiftOn: (employeeId: string, date: string) =>
        cells.get(`${employeeId}|${date}`) ?? null,
      loading,
    };
  }, [rota, loading]);
}
