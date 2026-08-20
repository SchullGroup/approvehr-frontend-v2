"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  ATTENDANCE,
  DEFAULT_POLICY,
  type AttendanceEntry,
  type AttendancePolicy,
} from "@/lib/mock/attendance";
import { TODAY } from "@/lib/today";
import { createPersistedState, patched } from "./persisted";

/**
 * Clock-ins, clock-outs and the attendance policy.
 *
 * Follows the same shape as the leave and employee stores: sparse patches over
 * the seed, whole new records for anything raised here, hydration-safe via
 * `createPersistedState`.
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
