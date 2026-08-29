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
  type AttendanceStatus,
  type PolicyBody,
} from "@/lib/api/attendance";
import type { ApiRotaCell } from "@/lib/api/shifts";
import { readPosition } from "@/lib/geolocation";
import {
  ATTENDANCE,
  DEFAULT_POLICY,
  recentWorkingDays,
  type AttendanceEntry,
  type AttendancePolicy,
  type AttendanceStatus as DemoStatus,
} from "@/lib/mock/attendance";
import { usePayrollSettings } from "@/lib/payroll/use-settings";
import { TODAY } from "@/lib/today";
import { fullName } from "@/lib/types";
import {
  employedOn,
  firstRecordedDate,
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
import { useRevalidation } from "@/lib/revalidate";
import { useCan } from "@/lib/permissions";

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
      const s = store.current();
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
    const s = store.current();
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

/** The inverse of `toApiPolicy`'s weekday conversion, for writing a patch
 * that arrived in the API's numbering back into the demo store's own. */
function fromApiWeekday(day: number): number {
  return day === 7 ? 0 : day;
}

/* ------------------------------------------------------------------- roster */

export type RosterState = {
  /** The date these rows describe. From the server when connected. */
  date: string;
  /**
   * The server's own `HH:MM` at the moment it answered.
   *
   * Needed because attendance times are UTC-rendered throughout, so anything
   * computing an elapsed time from the browser's wall clock is out by the
   * browser's UTC offset — an hour in Lagos. Anchor on this. Demo mode has no
   * server, so it reports the browser's own time, which is the correct answer
   * there: the demo's clock-ins were made by this browser too.
   */
  time: string;
  /** Null only while the first connected request is in flight. */
  policy: ApiAttendancePolicy | null;
  /** Exceptions first. Never re-sort by status — that ordering is the point. */
  rows: ApiRosterRow[];
  /**
   * Clock-ins on file for the day. Zero is a presence check, not a count.
   *
   * With `tracked` below, this is how a screen showing a **past** day tells
   * "nobody clocked in" from "we have no record for that day". Those are
   * different claims, and rendering the first when the second is true is the
   * mistake that prorated everybody to ₦0.
   */
  recorded: number;
  /**
   * Whether attendance was being recorded at all by this date.
   *
   * False before the company's first clock-in ever. The rows still carry their
   * statuses — nothing suppresses one, because that would be a second opinion
   * about the day in a second place — so it is the screen that has to decline to
   * render a wall of absences it has been told not to believe.
   */
  tracked: boolean;
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
    /** The server's clock when it answered. See `RosterState.time`. */
    time: string;
    policy: ApiAttendancePolicy | null;
    rows: ApiRosterRow[];
    recorded: number;
    tracked: boolean;
    error: ApiError | null;
  } | null>(null);

  const key = `${date ?? ""}|${tick}`;

  /* A date change while a request is in flight must not be overwritten by the
     older answer. The key comparison below handles a stale *render*; this
     handles a stale *response*. */
  const latest = useRef(0);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
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
            time: roster.time,
            policy: roster.policy,
            rows: roster.rows,
            recorded: roster.recorded,
            tracked: roster.tracked,
            error: null,
          });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled && ticket === latest.current) {
          setFetched({
            key,
            date: date ?? "",
            /* A failed read has no server clock either. Empty, so the timer
               renders nothing rather than anchoring on the browser's. */
            time: "",
            policy: null,
            rows: [],
            recorded: 0,
            /* A failed read knows nothing, and "not tracked" is the reading that
               claims nothing about anybody. The error is what gets rendered. */
            tracked: false,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, date, key, revalidation]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  /* Derived by comparing the key during render rather than cleared in an
     effect, which would be a synchronous setState and a cascaded render. */
  const matched = fetched !== null && fetched.key === key;

  if (!isConnected) {
    const on = date ?? TODAY;
    const rows: ApiRosterRow[] = rosterFor({
      date: on,
      /* Employed on the day, not merely on the payroll now. Asked for TODAY this
         is everybody; asked for a day in July it drops the two people the seed
         has starting in August, who were not absent then — they were not there.
         The API's `roster()` narrows the same way, in its `where`. */
      employees: directory.filter((employee) => employedOn(employee, on)),
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

    /* The demo's own boundary, from the seed rather than from a server: the
       earliest day anybody clocked in. Before it the demo has no records, and a
       screen must say that rather than badge ten people as no-shows. */
    const firstRecorded = firstRecordedDate(local.entries);

    return {
      date: on,
      /* The browser's own clock, which is the right answer offline: the demo's
         clock-ins were made by this browser, so there is no offset to correct
         for and no server to ask. */
      time: new Date().toTimeString().slice(0, 5),
      policy: toApiPolicy(local.policy),
      rows,
      recorded: local.forDate(on).filter((entry) => entry.clockIn).length,
      tracked: firstRecorded !== null && on >= firstRecorded,
      loading: false,
      error: null,
      source: "demo",
      reload,
    };
  }

  return {
    date: matched ? fetched.date : (date ?? ""),
    /* Empty until the server has answered — the timer that reads it renders
       nothing rather than anchoring on a guess. */
    time: matched ? fetched.time : "",
    policy: matched ? fetched.policy : null,
    rows: matched ? fetched.rows : [],
    recorded: matched ? fetched.recorded : 0,
    tracked: matched ? fetched.tracked : false,
    loading: !matched,
    error: matched ? fetched.error : null,
    source: "api",
    reload,
  };
}

/* -------------------------------------------------------------------- policy */

export type AttendancePolicyState = {
  policy: ApiAttendancePolicy;
  loading: boolean;
  error: string | null;
  saving: boolean;
  editable: boolean;
  source: AttendanceSource;
  save: (patch: PolicyBody) => Promise<ApiAttendancePolicy>;
  reload: () => void;
};

/**
 * The company's shift hours, grace period and working weekdays — read and
 * written on their own, apart from `useAttendanceRoster`, which only ever
 * reads the policy embedded in a roster response and has no reason to write
 * it back.
 *
 * Shaped after `useOvertimePolicy` (`lib/store/overtime.ts`): a fetch-on-mount
 * for connected mode, the demo store for offline, and `save` re-reading rather
 * than trusting its own patch, because the API decides what it actually stored.
 *
 * `MANAGE_SETTINGS`, not `MANAGE_PAY_STRUCTURE` — this is when people are
 * expected at work, not what they are paid for it, and `updatePolicy` on the
 * API gates on the same permission.
 */
export function useAttendancePolicy(): AttendancePolicyState {
  const { isConnected } = useSession();
  const editable = useCan("MANAGE_SETTINGS");
  const local = useAttendanceStore();

  const [fetched, setFetched] = useState<{
    connected: boolean;
    policy: ApiAttendancePolicy;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);

  /* Re-ask when somebody comes back to the window. Not in the key below, so
     the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const policy = await attendanceApi.policy(controller.signal);
        if (cancelled) return;
        setFetched({ connected: true, policy });
        setError(null);
      } catch (caught) {
        if (cancelled) return;
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Could not read the attendance policy.",
        );
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, attempt, revalidation]);

  const fromApi = fetched?.connected === true ? fetched.policy : null;
  const policy = isConnected ? (fromApi ?? toApiPolicy(DEFAULT_POLICY)) : toApiPolicy(local.policy);

  const save = useCallback(
    async (patch: PolicyBody): Promise<ApiAttendancePolicy> => {
      setSaving(true);
      try {
        if (!isConnected) {
          /* `patch` arrives in the API's ISO weekday numbering (1=Monday) —
             the shape this whole hook speaks in — and the demo store keeps
             its own 0=Sunday numbering, so a `workingWeekdays` patch is
             converted back rather than written through unchanged. Writing it
             raw would silently rotate every day by one the next time the
             demo read it back through `toApiPolicy`.

             Read back through `store.current()` after committing, the same
             "do not trust your own patch" rule the connected branch follows
             below — `local.policy` is this render's snapshot and would still
             be the pre-save value. */
          const { workingWeekdays, ...rest } = patch;
          store.commit({
            ...store.current(),
            policy: {
              ...store.current().policy,
              ...rest,
              ...(workingWeekdays
                ? { workingWeekdays: workingWeekdays.map(fromApiWeekday) }
                : {}),
            },
          });
          return toApiPolicy({ ...DEFAULT_POLICY, ...store.current().policy });
        }
        await attendanceApi.updatePolicy(patch);
        /* Re-read rather than trust the patch: the API decides what it
           stored, and a screen showing what it sent can disagree with the
           database. */
        const settled = await attendanceApi.policy();
        setFetched({ connected: true, policy: settled });
        return settled;
      } finally {
        setSaving(false);
      }
    },
    [isConnected],
  );

  return {
    policy,
    /* Derived, not tracked: connected with nothing fetched yet *is* loading. */
    loading: isConnected && fromApi === null && error === null,
    error,
    saving,
    editable,
    source: isConnected ? "api" : "demo",
    save,
    reload: useCallback(() => setAttempt((n) => n + 1), []),
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

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
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
  }, [isConnected, days, key, revalidation]);

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
        /* Null rather than zero: "payroll would withhold ₦0.00" is a claim
           about a salary, and this person has none set. */
        amount:
          row.employee.grossMonthly === null
            ? null
            : prorationFor({
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

/**
 * Work locations moved to `lib/store/work-locations.ts`.
 *
 * Same reasoning as the holiday calendar leaving `leave-api.ts`: they shared an
 * API module because they share a router, and they stopped sharing a screen the
 * moment a location became a thing you edit rather than a name you pick. A
 * management surface needs archived rows, a geofence and four writes; a picker
 * needs a name and an id. One hook serving both refreshes two hundred clock-ins
 * to redraw one radius.
 *
 * `useWorkLocations` is re-exported here so nothing that imported it from this
 * module had to change.
 */
export { useWorkLocations, type LocationsState } from "./work-locations";

/* ---------------------------------------------------------------- mutations */

/**
 * The two facts `clockIn` needs about where somebody is clocking in.
 *
 * A structural type rather than `ApiWorkLocation`, so the caller can pass a row
 * from either mode's list without the hook depending on the rest of it.
 */
export type ClockInLocation = {
  id: string;
  /** True and the API will check a device position against this location. */
  geofenceEnforced: boolean;
};

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
 *
 * ## `clockIn` takes the location, not its id, because of the geofence
 *
 * A location with `geofenceEnforced` is one the API checks a device position
 * against, and it refuses a clock-in that arrives without one. So this hook has
 * to know which kind of location it is being handed *before* the request, to
 * decide whether to ask the browser where it is — and it asks **only** then. A
 * permission prompt whose answer cannot change the outcome is how somebody
 * learns to deny location access for good; see `lib/geolocation.ts`.
 *
 * The position request can fail three distinct ways and throws a `PositionError`
 * carrying which one. That is not an `ApiError`, because no request was made —
 * a screen has to handle both, and `attendance-screen.tsx` shows how.
 */
export function useAttendanceMutations() {
  const { isConnected, actingId } = useSession();
  const local = useAttendanceStore();

  const clockIn = useCallback(
    async (location?: ClockInLocation | null) => {
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
        local.clockIn(actingId, location?.id ?? "", at);
        /* No position asked for, and none used. A demo fence is drawn and not
           enforced — there is no server here to judge it — and `store/
           work-locations.ts` says so on the settings screen rather than letting
           somebody discover that a radius they configured did nothing. Asking
           for a permission this mode cannot act on would be worse than the gap.
           `workLocation` is absent rather than null: the demo genuinely does not
           resolve a name here, and absent is not the same claim as "none". */
        return { employeeId: actingId, date: TODAY, time: at };
      }

      /* On the click, not on page load, and only where the answer matters. */
      const position = location?.geofenceEnforced ? await readPosition() : null;

      return attendanceApi.clockIn({
        ...(location ? { workLocationId: location.id } : {}),
        ...(position ? { position } : {}),
      });
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
   * Undo your own clock-out, just after making it.
   *
   * Offline it simply clears the time — the demo's entries were made by this
   * browser and there is nothing to reconcile. Connected, the API decides,
   * including the window past which this becomes an HR correction; its refusal
   * is shown verbatim rather than pre-empted here, because the window is the
   * server's rule and a second copy would drift.
   */
  const undoClockOut = useCallback(async () => {
    if (!isConnected) {
      const entry = local.forDate(TODAY).find((row) => row.employeeId === actingId);
      if (!entry?.clockOut) {
        throw new ApiError(409, "conflict", "You are still clocked in.");
      }
      /* `undefined`, not `null`: the demo entry types `clockOut` as optional,
         and the patch is spread over the row — an undefined key clears it. */
      local.correct(actingId, TODAY, { clockOut: undefined }, "Clock-out reversed");
      return { employeeId: actingId, date: TODAY, clockIn: entry.clockIn };
    }
    return attendanceApi.undoClockOut();
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

  return { clockIn, clockOut, undoClockOut, correct, connected: isConnected };
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
