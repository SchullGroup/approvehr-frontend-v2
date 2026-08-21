"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ApiError } from "@/lib/api/client";
import {
  overtimeApi,
  periodOf,
  periodRange,
  type OvertimeRecord,
} from "@/lib/api/overtime";
import { PUBLIC_HOLIDAYS } from "@/lib/mock/workflows";
import {
  DEFAULT_OVERTIME_POLICY,
  deriveOvertime,
  isAtCap,
  type OvertimeKind,
  type OvertimePolicy,
  type OvertimeStatus,
} from "@/lib/overtime/derive";
import { usePayrollSettings } from "@/lib/payroll/use-settings";
import { useCan } from "@/lib/permissions";
import { TODAY } from "@/lib/today";
import { fullName } from "@/lib/types";
import { useAttendanceStore } from "./attendance";
import { useEmployeeStore } from "./employees";
import { createPersistedState } from "./persisted";
import { useSession } from "./session";

/**
 * Overtime, from whichever source is available.
 *
 * ## Where the line falls in demo mode
 *
 * Demo mode **works overtime out for real**, from the attendance the demo
 * already holds, using `lib/overtime/derive.ts` — a port of the API's own
 * `detect`. It does not seed a book of overtime records.
 *
 * That distinction matters more here than in any other store. A seeded record
 * saying somebody worked two hours late on the 12th, sitting beside a timesheet
 * that shows them clocking out at 17:12, is two screens disagreeing about one
 * day — the failure `assemble.ts` warns about, where the person who finds out is
 * the employee. Deriving it means the demo cannot say anything the timesheet
 * does not support: correct a clock-out on `/people/attendance`, work the month
 * out again, and the record appears. Nothing else teaches as directly that
 * overtime comes from the clock rather than from a form.
 *
 * Decisions — approve, decline — do persist to this browser, the same call
 * `store/leave.ts` and `store/loans.ts` make: this product is called ApproveHR
 * and an approval queue you cannot approve from demonstrates nothing.
 *
 * ## Two deliberate differences from the API, both visible on screen
 *
 * | | API default | Demo |
 * |---|---|---|
 * | `enabled` | off — a company must choose to pay overtime | **on** |
 * | `graceMinutes` | 30 | **15** |
 *
 * A switched-off module demonstrates nothing, and at 30 minutes' grace the
 * seeded clock-outs produce not one record — the seed's latest is 17:29 against
 * a 17:00 shift end. The demo company is one that has already set this up. Both
 * figures are on `/settings/overtime`, where anybody can see and change them,
 * and nothing about the arithmetic differs.
 *
 * One simplification, stated because it is a difference: the demo values every
 * day against the office's scheduled end. The API prefers a rostered person's
 * own shift end, which needs the rota, and that stays on the API's side.
 */

/* --------------------------------------------------------------- demo state */

type DemoRecord = {
  id: string;
  employeeId: string;
  onDate: string;
  minutes: number;
  rawMinutes: number;
  kind: OvertimeKind;
  rate: number;
  hourlyRateKobo: number;
  amountKobo: number;
  status: OvertimeStatus;
  declinedReason: string | null;
  approvedById: string | null;
  approvedAt: string | null;
};

type DemoState = {
  /** Sparse patch over `DEMO_POLICY`, so a field added later is picked up. */
  policy: Partial<OvertimePolicy>;
  /** Keyed `employeeId:YYYY-MM-DD` — one row per person per day, as on the API. */
  records: Record<string, DemoRecord>;
};

const EMPTY: DemoState = { policy: {}, records: {} };

const store = createPersistedState<DemoState>({
  key: "approvehr.overtime.store",
  empty: EMPTY,
  version: 1,
});

/** What the demo company has already configured. See the table above. */
const DEMO_POLICY: OvertimePolicy = {
  ...DEFAULT_OVERTIME_POLICY,
  enabled: true,
  graceMinutes: 15,
};

const recordKey = (employeeId: string, onDate: string) => `${employeeId}:${onDate}`;

/* --------------------------------------------------------------- the shapes */

/**
 * A record plus the one thing a screen cannot work out for itself.
 *
 * `atCap` is inferred from the policy rather than stored — see `isAtCap` — and
 * added here, once, so no screen has to hold the policy to render a row.
 */
export type OvertimeRow = OvertimeRecord & { atCap: boolean };

export type OvertimeTotals = {
  count: number;
  minutes: number;
  amountKobo: number;
};

const NOTHING: OvertimeTotals = { count: 0, minutes: 0, amountKobo: 0 };

function totalsOf(
  rows: readonly { minutes: number; amountKobo: number }[],
): OvertimeTotals {
  return rows.reduce<OvertimeTotals>(
    (sum, row) => ({
      count: sum.count + 1,
      minutes: sum.minutes + row.minutes,
      amountKobo: sum.amountKobo + row.amountKobo,
    }),
    NOTHING,
  );
}

const withCap = (record: OvertimeRecord, policy: OvertimePolicy): OvertimeRow => ({
  ...record,
  atCap: isAtCap(record.minutes, policy),
});

const toRecord = (
  record: DemoRecord,
  who: { name: string; employeeNo: string } | undefined,
): OvertimeRecord => ({
  id: record.id,
  employeeId: record.employeeId,
  employeeNo: who?.employeeNo ?? null,
  name: who?.name ?? "Unknown",
  onDate: record.onDate,
  minutes: record.minutes,
  rawMinutes: record.rawMinutes,
  kind: record.kind,
  rate: record.rate,
  hourlyRateKobo: record.hourlyRateKobo,
  amountKobo: record.amountKobo,
  status: record.status,
  declinedReason: record.declinedReason,
  onPayslip: record.status === "PAID",
});

/* --------------------------------------------------------------- the policy */

export type PolicyState = {
  policy: OvertimePolicy;
  loading: boolean;
  error: string | null;
  saving: boolean;
  /** False when connected without `MANAGE_PAY_STRUCTURE`. */
  editable: boolean;
  source: "api" | "demo";
  save: (patch: Partial<OvertimePolicy>) => Promise<OvertimePolicy>;
  reload: () => void;
};

export function useOvertimePolicy(): PolicyState {
  const { isConnected } = useSession();
  const editable = useCan("MANAGE_PAY_STRUCTURE");
  const state = useSyncExternalStore(
    store.subscribe,
    store.read,
    store.getServerSnapshot,
  );

  /* Keyed by where it came from, for the reason `usePermissions` keys its
     detail: leaving a connected session must not leave that company's policy on
     screen as though it were the demo's. */
  const [fetched, setFetched] = useState<{
    connected: boolean;
    policy: OvertimePolicy;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const policy = await overtimeApi.policy(controller.signal);
        if (cancelled) return;
        setFetched({ connected: true, policy });
        setError(null);
      } catch (caught) {
        if (cancelled) return;
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Could not read the overtime policy.",
        );
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, attempt]);

  const demoPolicy = useMemo(
    () => ({ ...DEMO_POLICY, ...state.policy }),
    [state.policy],
  );

  const fromApi = fetched?.connected === true ? fetched.policy : null;
  const policy = isConnected ? (fromApi ?? DEFAULT_OVERTIME_POLICY) : demoPolicy;

  const save = useCallback(
    async (patch: Partial<OvertimePolicy>): Promise<OvertimePolicy> => {
      setSaving(true);
      try {
        if (!isConnected) {
          const current = store.read();
          const next = { ...current.policy, ...patch };
          store.commit({ ...current, policy: next });
          return { ...DEMO_POLICY, ...next };
        }
        await overtimeApi.updatePolicy(patch);
        /* Re-read rather than trust the patch: the API decides what it stored,
           and a screen showing what it sent can disagree with the database. */
        const settled = await overtimeApi.policy();
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

/* ------------------------------------------------------------- demo plumbing */

/** Everything the local derivation needs, from the stores that own each part. */
function useDemoInputs() {
  const attendance = useAttendanceStore();
  const employees = useEmployeeStore();
  const { settings } = usePayrollSettings();

  const grossMonthlyKobo = useMemo(
    () =>
      new Map(
        employees.all.map((employee) => [
          employee.id,
          Math.round(employee.grossMonthly * 100),
        ]),
      ),
    [employees.all],
  );

  const names = useMemo(
    () =>
      new Map(
        employees.all.map((employee) => [
          employee.id,
          { name: fullName(employee), employeeNo: employee.employeeNo },
        ]),
      ),
    [employees.all],
  );

  return {
    entries: attendance.entries,
    attendancePolicy: attendance.policy,
    grossMonthlyKobo,
    names,
    workingDaysPerMonth: settings.workingDaysPerMonth,
  };
}

/* ------------------------------------------------------------------ the list */

export type OvertimeState = {
  rows: OvertimeRow[];
  total: number;
  /** Company-wide, every month — what has to clear before a payroll run. */
  awaitingApproval: OvertimeTotals;
  /** The rows on screen, added up. */
  shown: OvertimeTotals;
  policy: OvertimePolicy;
  /**
   * False while the policy is still on its way, or if reading it failed.
   *
   * The fallback policy has `enabled: false`, so a screen that does not check
   * this would tell somebody overtime is switched off when the truth is that
   * nobody has answered yet. Worth a flag: "off" and "unknown" look identical
   * and mean opposite things.
   */
  policyKnown: boolean;
  loading: boolean;
  error: ApiError | null;
  connected: boolean;
  reload: () => void;
  /** Reads the month's attendance and writes what it finds. Idempotent. */
  workOut: (
    period: string,
  ) => Promise<{ found: number; written: number; skippedPaid: number }>;
  approve: (id: string) => Promise<void>;
  decline: (id: string, reason: string) => Promise<void>;
  /** Nobody approves their own. Which rows are the viewer's. */
  ownEmployeeId: string | null;
};

export function useOvertime({
  period,
  status = "ALL",
}: {
  period: string;
  status?: OvertimeStatus | "ALL";
}): OvertimeState {
  const { isConnected, employeeId, actingId } = useSession();
  const {
    policy,
    loading: policyLoading,
    error: policyError,
  } = useOvertimePolicy();
  const demo = useDemoInputs();
  const state = useSyncExternalStore(
    store.subscribe,
    store.read,
    store.getServerSnapshot,
  );

  /* Records, not rows: `atCap` is applied during render so the policy is not a
     dependency of the fetch. Otherwise every keystroke on the settings screen
     would put another request behind it. */
  const [loaded, setLoaded] = useState<{
    key: string;
    records: OvertimeRecord[];
    total: number;
    awaitingApproval: OvertimeTotals;
  } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);

  /* One string, so the result carries the query it answers. */
  const key = `${period}:${status}`;
  /* A slow answer for last month must not overwrite a fast one for this month. */
  const latest = useRef(0);

  useEffect(() => {
    if (!isConnected) return;
    const ticket = ++latest.current;
    const controller = new AbortController();
    const range = periodRange(period);

    void (async () => {
      try {
        const result = await overtimeApi.list(
          {
            from: range.from,
            to: range.to,
            ...(status === "ALL" ? {} : { status }),
          },
          controller.signal,
        );
        if (ticket !== latest.current) return;
        setLoaded({
          key,
          records: result.rows,
          total: result.total,
          awaitingApproval: result.awaitingApproval,
        });
        setError(null);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        if (ticket !== latest.current) return;
        setError(
          caught instanceof ApiError
            ? caught
            : new ApiError(0, "unknown", "Could not read overtime."),
        );
      }
    })();

    return () => controller.abort();
  }, [isConnected, period, status, key, attempt]);

  /* ------------------------------------------------------------ demo reading */

  const demoRecords = useMemo(() => {
    if (isConnected) return [];
    return Object.values(state.records)
      .filter((record) => record.onDate.startsWith(period))
      .filter((record) => status === "ALL" || record.status === status)
      .map((record) => toRecord(record, demo.names.get(record.employeeId)))
      .sort(
        (a, b) => b.onDate.localeCompare(a.onDate) || a.name.localeCompare(b.name),
      );
  }, [isConnected, state.records, period, status, demo.names]);

  const demoAwaiting = useMemo(() => {
    if (isConnected) return NOTHING;
    return totalsOf(
      Object.values(state.records).filter((record) => record.status === "PENDING"),
    );
  }, [isConnected, state.records]);

  /* ----------------------------------------------------------- the mutations */

  const workOut = useCallback(
    async (forPeriod: string) => {
      if (isConnected) {
        const result = await overtimeApi.workOut(forPeriod);
        setAttempt((n) => n + 1);
        return result;
      }

      if (!policy.enabled) {
        throw new ApiError(
          422,
          "unprocessable",
          "Overtime is switched off. Turn it on in Settings before working it out.",
        );
      }

      const derived = deriveOvertime({
        entries: demo.entries.filter((entry) => entry.date.startsWith(forPeriod)),
        grossMonthlyKobo: demo.grossMonthlyKobo,
        policy,
        shiftEnd: demo.attendancePolicy.shiftEnd,
        workingWeekdays: demo.attendancePolicy.workingWeekdays,
        holidays: PUBLIC_HOLIDAYS.map((holiday) => holiday.date),
        workingDaysPerMonth: demo.workingDaysPerMonth,
      });

      const current = store.read();
      const records = { ...current.records };
      let written = 0;
      let skippedPaid = 0;

      for (const found of derived) {
        const at = recordKey(found.employeeId, found.onDate);
        const existing = records[at];

        /* A record a payroll run has taken is history. The API refuses to
           rewrite it and so does this. */
        if (existing?.status === "PAID") {
          skippedPaid += 1;
          continue;
        }

        records[at] = {
          id: `ot-${found.employeeId}-${found.onDate}`,
          employeeId: found.employeeId,
          onDate: found.onDate,
          minutes: found.minutes,
          rawMinutes: found.rawMinutes,
          kind: found.kind,
          rate: found.rate,
          hourlyRateKobo: found.hourlyRateKobo,
          amountKobo: found.amountKobo,
          /* Re-running updates the figures and leaves the decision alone, the
             way the API's update does — an approved day whose hours were
             corrected stays approved, at the corrected amount. */
          status:
            existing?.status ?? (policy.requiresApproval ? "PENDING" : "APPROVED"),
          declinedReason: existing?.declinedReason ?? null,
          approvedById: existing?.approvedById ?? null,
          approvedAt: existing?.approvedAt ?? null,
        };
        written += 1;
      }

      store.commit({ ...current, records });
      return { found: derived.length, written, skippedPaid };
    },
    [
      isConnected,
      policy,
      demo.entries,
      demo.grossMonthlyKobo,
      demo.attendancePolicy,
      demo.workingDaysPerMonth,
    ],
  );

  const decide = useCallback(
    async (id: string, approve: boolean, reason?: string) => {
      if (!approve && !reason?.trim()) {
        throw new ApiError(422, "unprocessable", "Say why you are turning it down.");
      }

      if (isConnected) {
        await overtimeApi.decide(id, {
          approve,
          ...(reason?.trim() ? { reason: reason.trim() } : {}),
        });
        setAttempt((n) => n + 1);
        return;
      }

      const current = store.read();
      const entry = Object.entries(current.records).find(
        ([, record]) => record.id === id,
      );
      if (!entry) throw new ApiError(404, "not_found", "No such overtime record.");
      const [at, record] = entry;

      if (record.status === "PAID") {
        throw new ApiError(
          409,
          "conflict",
          "That overtime has already been paid. It cannot be changed now.",
        );
      }
      if (record.employeeId === actingId) {
        throw new ApiError(409, "conflict", "You cannot approve your own overtime.");
      }

      store.commit({
        ...current,
        records: {
          ...current.records,
          [at]: {
            ...record,
            status: approve ? "APPROVED" : "DECLINED",
            declinedReason: approve ? null : (reason ?? "").trim(),
            approvedById: actingId,
            approvedAt: new Date().toISOString(),
          },
        },
      });
    },
    [isConnected, actingId],
  );

  const matched = loaded !== null && loaded.key === key;
  const apiRecords = matched ? loaded.records : null;
  /* The source is chosen inside the memo so its dependencies are the two stable
     arrays rather than a fresh one picked between them every render. */
  const rows = useMemo(
    () =>
      (isConnected ? (apiRecords ?? []) : demoRecords).map((record) =>
        withCap(record, policy),
      ),
    [isConnected, apiRecords, demoRecords, policy],
  );

  return {
    rows,
    total: isConnected ? (matched ? loaded.total : 0) : demoRecords.length,
    awaitingApproval: isConnected
      ? matched
        ? loaded.awaitingApproval
        : NOTHING
      : demoAwaiting,
    shown: totalsOf(rows),
    policy,
    policyKnown: !policyLoading && policyError === null,
    /* Loading is exactly "connected, and no result for this query yet". No
       setState in an effect body, and no window where last month's rows are
       shown as though they were this month's. */
    loading: isConnected && !matched && error === null,
    error,
    connected: isConnected,
    reload: useCallback(() => setAttempt((n) => n + 1), []),
    workOut,
    approve: useCallback((id: string) => decide(id, true), [decide]),
    decline: useCallback(
      (id: string, reason: string) => decide(id, false, reason),
      [decide],
    ),
    ownEmployeeId: isConnected ? employeeId : actingId,
  };
}

/* -------------------------------------------------------------- your own only */

export type MyOvertimeState = {
  rows: OvertimeRow[];
  waiting: OvertimeTotals;
  /** Approved and not yet on a payslip. What is coming. */
  approved: OvertimeTotals;
  policy: OvertimePolicy;
  /** See the note on `OvertimeState.policyKnown`. */
  policyKnown: boolean;
  loading: boolean;
  /** True when this sign-in has no staff record — nothing to render. */
  noRecord: boolean;
  reload: () => void;
};

export function useMyOvertime(take = 24): MyOvertimeState {
  const { isConnected, employeeId } = useSession();
  const {
    policy,
    loading: policyLoading,
    error: policyError,
  } = useOvertimePolicy();
  const demo = useDemoInputs();
  const state = useSyncExternalStore(
    store.subscribe,
    store.read,
    store.getServerSnapshot,
  );

  const [loaded, setLoaded] = useState<{
    forEmployee: string;
    records: OvertimeRecord[];
  } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isConnected || !employeeId) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await overtimeApi.mine({ take }, controller.signal);
        if (!cancelled) {
          setLoaded({ forEmployee: employeeId, records: result.rows });
        }
      } catch {
        /* A card on a profile page. An empty one beats a broken layout. */
        if (!cancelled) setLoaded({ forEmployee: employeeId, records: [] });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, employeeId, take, attempt]);

  const demoRecords = useMemo(() => {
    if (isConnected || !employeeId) return [];
    const who = demo.names.get(employeeId);
    return Object.values(state.records)
      .filter((record) => record.employeeId === employeeId)
      .sort((a, b) => b.onDate.localeCompare(a.onDate))
      .slice(0, take)
      .map((record) => toRecord(record, who));
  }, [isConnected, employeeId, state.records, demo.names, take]);

  const matched = loaded !== null && loaded.forEmployee === employeeId;
  const apiRecords = matched ? loaded.records : null;
  const rows = useMemo(
    () =>
      (isConnected ? (apiRecords ?? []) : demoRecords).map((record) =>
        withCap(record, policy),
      ),
    [isConnected, apiRecords, demoRecords, policy],
  );

  return {
    rows,
    /* Added up from these rows, never from the API's aggregate — that one is
       company-wide even on `/mine`, and showing it here would tell somebody the
       whole company's pending total was their own. */
    waiting: totalsOf(rows.filter((row) => row.status === "PENDING")),
    approved: totalsOf(rows.filter((row) => row.status === "APPROVED")),
    policy,
    policyKnown: !policyLoading && policyError === null,
    loading: isConnected && !matched,
    noRecord: !employeeId,
    reload: useCallback(() => setAttempt((n) => n + 1), []),
  };
}

/** The month the product is "in", for the period selector's default. */
export const currentPeriod = (): string => periodOf(TODAY);
