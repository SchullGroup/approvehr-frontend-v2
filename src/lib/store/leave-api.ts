"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  leaveApi,
  type LeaveAccrualWire,
  type LeaveBalanceRow,
  type LeaveDetail,
  type LeaveListParams,
  type LeaveRow,
  type LeaveRowStatus,
  type LeaveTypeRow,
} from "@/lib/api/leave";
import { employeeById } from "@/lib/mock/people";
import { type LeaveRequest, type LeaveType } from "@/lib/mock/workflows";
import { TODAY } from "@/lib/today";
import { fullName } from "@/lib/types";
import { clashesWith, remainingDays } from "@/lib/workflows/leave";
import { useCompanySettings } from "./company";
import { useLeaveStore } from "./leave";
import { useLeaveBalances } from "./leave-balances";
import { useSession } from "./session";

/**
 * Leave, from whichever source is available.
 *
 * ## The same decision, wherever it is made
 *
 * `useLeaveStore` is the localStorage store and still works — it is what the
 * demo runs on. This hook picks:
 *
 *   connected  → `/api/v1/leave`, where a balance is computed server-side
 *   demo       → the existing store, unchanged
 *
 * Screens call these hooks and do not care which they got, the same shape
 * `store/employees-api.ts` established.
 *
 * The reason leave and the approvals inbox were switched over together is that
 * they are one mechanism, not two screens. Connected, the interlock is enforced
 * by the API: an approval row points at the leave request by `subjectId` and
 * deciding either one runs the same service call. In demo mode it is enforced by
 * `lib/workflows/queue.ts` deriving the inbox's leave rows from the requests
 * themselves. Both modes have exactly one place a decision is written; neither
 * has a second copy to keep in step.
 *
 * ## What honestly differs between the two
 *
 * | | Connected | Demo |
 * |---|---|---|
 * | Balance | computed by the API across every request it holds | computed locally from the requests in this browser |
 * | Clashes | the whole company, from `GET /leave/requests/:id` | only the rows this screen is holding |
 * | Leave types | records with ids, from `/leave/types` | names, from `/settings/leave` |
 * | Overlap refusal | 409 from the API, with the dates | caught by `validateLeave` before submit |
 *
 * The clash difference is the one to keep in mind: the demo can only see what it
 * has loaded, so it can miss cover it does not know about. The API cannot. Where
 * both are available the API's answer is used, never merged with a local guess.
 */

/* ----------------------------------------------------------------- demo rows */

/** A seed request in the row shape both modes share. */
function fromSeed(request: LeaveRequest): LeaveRow {
  const employee = employeeById(request.employeeId);
  const approver = request.approverId
    ? employeeById(request.approverId)
    : undefined;
  return {
    id: request.id,
    employeeId: request.employeeId,
    employeeName: employee ? fullName(employee) : "Unknown",
    employeeJobTitle: employee?.jobTitle ?? null,
    /* No id: in demo mode a leave type is a name on a settings page, not a
       record. Everything that needs to match a type matches on the name. */
    leaveTypeId: null,
    leaveType: request.type,
    from: request.from,
    to: request.to,
    days: request.days,
    status: request.status,
    reason: request.reason ?? null,
    approverId: request.approverId ?? null,
    approverName: approver ? fullName(approver) : null,
    requestedAt: request.requestedAt ?? null,
    decidedAt: request.decidedAt ?? null,
    decidedById: request.decidedById ?? null,
    decisionNote: request.decisionNote ?? null,
  };
}

/**
 * The API's own ordering: waiting first, then earliest start date.
 *
 * Copied rather than left to chance. A queue that ranks differently depending on
 * which mode you are in teaches the wrong thing about the product, and "pending
 * first" is not a display preference — it is what makes the screen a queue.
 */
const RANK: Record<LeaveRowStatus, number> = {
  pending: 0,
  approved: 1,
  declined: 2,
  cancelled: 3,
};

const inApiOrder = (rows: LeaveRow[]): LeaveRow[] =>
  [...rows].sort(
    (a, b) => RANK[a.status] - RANK[b.status] || a.from.localeCompare(b.from),
  );

/* --------------------------------------------------------------- the requests */

export type LeaveListState = {
  requests: LeaveRow[];
  /** The real count when connected, not the length of the page you hold. */
  total: number;
  loading: boolean;
  error: ApiError | null;
  connected: boolean;
  reload: () => void;
};

export function useLeaveRequests(params: LeaveListParams = {}): LeaveListState {
  const { isConnected } = useSession();
  const local = useLeaveStore();

  const [state, setState] = useState<{
    requests: LeaveRow[];
    total: number;
    loading: boolean;
    error: ApiError | null;
  }>({ requests: [], total: 0, loading: isConnected, error: null });

  /* Serialised so the effect re-runs on a value change rather than on every
     render — an object literal passed inline is a new reference each time. */
  const key = JSON.stringify(params);

  /* A slow answer for an old query must not overwrite a fast one for the new. */
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!isConnected) return;
    const ticket = ++latest.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const result = await leaveApi.list(JSON.parse(key) as LeaveListParams);
      if (ticket !== latest.current) return;
      setState({
        requests: result.rows,
        total: result.total,
        loading: false,
        error: null,
      });
    } catch (error) {
      if (ticket !== latest.current) return;
      setState((s) => ({
        ...s,
        loading: false,
        error: error instanceof ApiError ? error : null,
      }));
    }
  }, [isConnected, key]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isConnected) {
    /* Demo mode: the same filters, applied in memory. */
    const parsed = JSON.parse(key) as LeaveListParams;
    let rows = local.requests.map(fromSeed);
    if (parsed.employeeId) {
      rows = rows.filter((r) => r.employeeId === parsed.employeeId);
    }
    if (parsed.status) rows = rows.filter((r) => r.status === parsed.status);
    /* `from` filters on the end date and `to` on the start date, matching the
       API: the question is "overlaps this window", not "starts in it". */
    if (parsed.from) rows = rows.filter((r) => r.to >= parsed.from!);
    if (parsed.to) rows = rows.filter((r) => r.from <= parsed.to!);
    const ordered = inApiOrder(rows);
    return {
      requests: ordered,
      total: ordered.length,
      loading: false,
      error: null,
      connected: false,
      reload: () => {},
    };
  }

  return { ...state, connected: true, reload: load };
}

/* ------------------------------------------------------------------ one request */

export type LeaveDetailState = {
  detail: LeaveDetail | null;
  loading: boolean;
  connected: boolean;
};

/**
 * One request with the two things the list cannot tell you: who else is off, and
 * the balance it draws down.
 *
 * Connected, that is `GET /leave/requests/:id` and the API's answer is the whole
 * company's. In demo mode both are derived from the store — `clashesWith` is the
 * same function the inbox uses to write its cover line, so the drawer and the
 * queue row cannot disagree.
 *
 * State is kept as `{ id, detail }` rather than a bare detail, the shape
 * `useDepartment` uses: the result carries the id it belongs to, so `loading` is
 * derived, nothing needs clearing when `id` changes, and a slow answer for a
 * request you have navigated away from simply stops matching.
 */
export function useLeaveRequestDetail(id: string | null): LeaveDetailState {
  const { isConnected } = useSession();
  const local = useLeaveStore();
  const balances = useLeaveBalances();
  const active = Boolean(id) && isConnected;

  const [fetched, setFetched] = useState<{
    id: string;
    detail: LeaveDetail | null;
  } | null>(null);

  useEffect(() => {
    if (!active || !id) return;
    let cancelled = false;
    void (async () => {
      try {
        const detail = await leaveApi.get(id);
        if (!cancelled) setFetched({ id, detail });
      } catch {
        if (!cancelled) setFetched({ id, detail: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, active]);

  const rows = useMemo(
    () => (isConnected ? [] : local.requests.map(fromSeed)),
    [isConnected, local.requests],
  );

  if (!isConnected) {
    const request = id ? rows.find((r) => r.id === id) : undefined;
    if (!request) return { detail: null, loading: false, connected: false };
    const balance = balances.forType(request.employeeId, request.leaveType);
    return {
      detail: {
        request,
        clashes: clashesWith(request, rows).map((r) => ({
          id: r.id,
          employeeId: r.employeeId,
          employeeName: r.employeeName,
          from: r.from,
          to: r.to,
          status: r.status,
        })),
        balance: balance
          ? {
              leaveTypeId: null,
              leaveType: balance.type,
              year: demoYear(),
              entitled: balance.entitled,
              carriedIn: 0,
              taken: balance.taken,
              pending: balance.pending,
              remaining: remainingDays(balance),
            }
          : null,
      },
      loading: false,
      connected: false,
    };
  }

  const matched = active && fetched !== null && fetched.id === id;
  return {
    detail: matched ? fetched.detail : null,
    loading: active && !matched,
    connected: true,
  };
}

/* --------------------------------------------------------------------- types */

export type LeaveTypesState = {
  types: LeaveTypeRow[];
  loading: boolean;
  connected: boolean;
};

/**
 * The leave types a request can be raised against.
 *
 * Connected these are records with ids, because that is what `POST
 * /leave/requests` takes. In demo mode they are the names on `/settings/leave`,
 * which is the page whose `entitled` figure every local balance measures
 * against — so the booking dialog and the settings page cannot offer different
 * lists.
 */
/** `LeavePolicy`'s lowercase accrual to the wire's own casing. */
const ACCRUAL_TO_WIRE: Record<
  "annual_upfront" | "monthly" | "on_completion",
  LeaveAccrualWire
> = {
  annual_upfront: "ANNUAL_UPFRONT",
  monthly: "MONTHLY",
  on_completion: "ON_COMPLETION",
};

export function useLeaveTypes(): LeaveTypesState {
  const { isConnected } = useSession();
  const { settings } = useCompanySettings();
  const [fetched, setFetched] = useState<LeaveTypeRow[] | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    void (async () => {
      try {
        const types = await leaveApi.types();
        if (!cancelled) setFetched(types);
      } catch {
        if (!cancelled) setFetched([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected]);

  const local = useMemo<LeaveTypeRow[]>(
    () =>
      settings.leave.types.map((type) => ({
        id: null,
        name: type.name,
        entitledDays: type.entitled,
        accrual: ACCRUAL_TO_WIRE[type.accrual],
        carryOverMax: type.carryOverMax,
        carryOverExpiresMonths: type.carryOverExpiresMonths,
        requiresEvidence: type.requiresEvidence,
        minNoticeDays: type.minNoticeDays,
        isPaid: true,
      })),
    [settings.leave.types],
  );

  if (!isConnected) return { types: local, loading: false, connected: false };
  return {
    types: fetched ?? [],
    loading: fetched === null,
    connected: true,
  };
}

/* ------------------------------------------------------------------ balances */

export type BalanceLookup = {
  /** Keyed by employee id. Undefined while loading, or if the type has none. */
  of: (employeeId: string) => LeaveBalanceRow | undefined;
  loading: boolean;
  connected: boolean;
};

const demoYear = (): number => new Date(TODAY).getUTCFullYear();

/**
 * One leave type's balance for several people at once.
 *
 * Connected, this is one request per person: the API has no bulk balance
 * endpoint, and inventing a client-side sum from the request list would be a
 * second implementation of the arithmetic that decides whether somebody may
 * take a day off. Callers pass the handful of people actually on screen.
 *
 * Demo mode goes through `useLeaveBalances`, which is the only sanctioned local
 * source — it closes over the company policy as well as the requests, and the
 * bug that hook exists to prevent was a screen forgetting the policy and
 * reporting an entitlement nobody had configured.
 */
export function useLeaveBalancesFor(
  employeeIds: readonly string[],
  leaveType = "Annual",
): BalanceLookup {
  const { isConnected } = useSession();
  const local = useLeaveBalances();

  /* Sorted and de-duplicated so the same set of people in a different order is
     the same key, and does not refetch. */
  const key = [...new Set(employeeIds)].sort().join(",");

  const [fetched, setFetched] = useState<{
    key: string;
    rows: Record<string, LeaveBalanceRow[]>;
  } | null>(null);

  useEffect(() => {
    if (!isConnected || key === "") return;
    let cancelled = false;
    void (async () => {
      const results = await Promise.all(
        key.split(",").map(async (id) => {
          try {
            return [id, await leaveApi.balances(id)] as const;
          } catch {
            /* One person's balance failing must not blank the whole card. */
            return [id, [] as LeaveBalanceRow[]] as const;
          }
        }),
      );
      if (!cancelled) setFetched({ key, rows: Object.fromEntries(results) });
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, key]);

  const matched = fetched !== null && fetched.key === key;

  const of = useCallback(
    (employeeId: string): LeaveBalanceRow | undefined => {
      if (!isConnected) {
        const balance = local.forType(employeeId, leaveType);
        if (!balance) return undefined;
        return {
          leaveTypeId: null,
          leaveType: balance.type,
          year: demoYear(),
          entitled: balance.entitled,
          carriedIn: 0,
          taken: balance.taken,
          pending: balance.pending,
          remaining: remainingDays(balance),
        };
      }
      if (!matched) return undefined;
      return fetched?.rows[employeeId]?.find((b) => b.leaveType === leaveType);
    },
    [isConnected, local, leaveType, matched, fetched],
  );

  return {
    of,
    loading: isConnected && key !== "" && !matched,
    connected: isConnected,
  };
}

/* ----------------------------------------------------------------- mutations */

export type NewLeave = {
  employeeId: string;
  /** The API's leave type id. Null in demo mode, where a type is a name. */
  leaveTypeId: string | null;
  leaveType: string;
  from: string;
  to: string;
  reason?: string;
  approverId?: string;
};

/**
 * The five names the seed store knows.
 *
 * Demo mode's type list comes from `/settings/leave`, which seeds exactly these
 * and offers no way to rename one — so the fallback is unreachable today. It
 * exists because a request that cannot be filed at all is a worse outcome than
 * one filed against Annual, and because the balance follows the name either way.
 */
const SEED_TYPES: LeaveType[] = DEMO_ENABLED ? [
  "Annual",
  "Sick",
  "Compassionate",
  "Maternity",
  "Paternity",
] : [];

const asSeedType = (name: string): LeaveType =>
  SEED_TYPES.find((type) => type === name) ?? "Annual";

export type LeaveMutations = {
  create: (input: NewLeave) => Promise<{ request: LeaveRow; warnings: string[] }>;
  decide: (
    id: string,
    decision: "approved" | "declined",
    note?: string,
  ) => Promise<void>;
  reopen: (id: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  connected: boolean;
};

export function useLeaveMutations(): LeaveMutations {
  const { isConnected } = useSession();
  const local = useLeaveStore();

  const create = useCallback(
    async (input: NewLeave) => {
      if (!isConnected) {
        const created = local.create({
          employeeId: input.employeeId,
          type: asSeedType(input.leaveType),
          from: input.from,
          to: input.to,
          ...(input.reason ? { reason: input.reason } : {}),
          ...(input.approverId ? { approverId: input.approverId } : {}),
        });
        return { request: fromSeed(created), warnings: [] };
      }
      if (!input.leaveTypeId) {
        throw new ApiError(0, "no_leave_type", "Choose a leave type first.");
      }
      return leaveApi.create({
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        from: input.from,
        to: input.to,
        ...(input.reason ? { reason: input.reason } : {}),
        ...(input.approverId ? { approverId: input.approverId } : {}),
      });
    },
    [isConnected, local],
  );

  const decide = useCallback(
    async (id: string, decision: "approved" | "declined", note?: string) => {
      if (!isConnected) {
        local.decide(id, decision, note);
        return;
      }
      await leaveApi.decide(
        id,
        decision === "approved" ? "approve" : "decline",
        note,
      );
    },
    [isConnected, local],
  );

  const reopen = useCallback(
    async (id: string) => {
      if (!isConnected) {
        local.reopen(id);
        return;
      }
      await leaveApi.reopen(id);
    },
    [isConnected, local],
  );

  const cancel = useCallback(
    async (id: string) => {
      if (!isConnected) {
        local.cancel(id);
        return;
      }
      await leaveApi.cancel(id);
    },
    [isConnected, local],
  );

  return { create, decide, reopen, cancel, connected: isConnected };
}

/* ------------------------------------------------- every balance, one person */

export type EmployeeBalancesState = {
  balances: LeaveBalanceRow[];
  loading: boolean;
  error: ApiError | null;
  connected: boolean;
};

/**
 * Every leave type's balance for one person, for a record page.
 *
 * `useLeaveBalancesFor` above answers the other question — one type across
 * several people, which is what a rota or an approval queue needs. This is the
 * transpose, and it is a different request: `GET /leave/balances/:id` returns
 * the whole set for one employee in a single call, so a record page does not
 * need to know which types exist before it can ask.
 *
 * Both go through the same endpoint and the same demo source, so a remaining
 * figure reads the same wherever it appears. That is the whole reason this lives
 * beside its sibling rather than in the record page: two hooks in two files
 * computing "days left" is how the number starts disagreeing with itself.
 *
 * The endpoint needs `VIEW_SALARIES` or for the record to be your own — the same
 * rule as the employee detail read — so a 403 here means the page above it
 * should not have opened either.
 */
export function useEmployeeLeaveBalances(
  employeeId: string | null,
): EmployeeBalancesState {
  const { isConnected } = useSession();
  const local = useLeaveBalances();

  /* Keyed by the employee it belongs to, the same shape as `useEmployee`: a
     slow answer for the record you have navigated away from cannot be rendered
     against this one, `loading` is derived rather than tracked, and nothing
     needs clearing when the id changes. */
  const [fetched, setFetched] = useState<{
    id: string;
    rows: LeaveBalanceRow[];
    error: ApiError | null;
  } | null>(null);

  const active = isConnected && employeeId !== null;

  useEffect(() => {
    if (!active || employeeId === null) return;
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const rows = await leaveApi.balances(employeeId, undefined, controller.signal);
        if (!cancelled) setFetched({ id: employeeId, rows, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({
            id: employeeId,
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
  }, [active, employeeId]);

  if (!isConnected) {
    return {
      /* Through `useLeaveBalances`, which closes over the company leave policy
         as well as the requests. Calling `leaveBalancesFor` here instead is the
         bug that hook exists to prevent. */
      balances:
        employeeId === null
          ? []
          : local.forEmployee(employeeId).map((balance) => ({
              leaveTypeId: null,
              leaveType: balance.type,
              year: new Date(TODAY).getUTCFullYear(),
              entitled: balance.entitled,
              carriedIn: 0,
              taken: balance.taken,
              pending: balance.pending,
              remaining: remainingDays(balance),
            })),
      loading: false,
      error: null,
      connected: false,
    };
  }

  const matched = fetched !== null && fetched.id === employeeId;
  return {
    balances: matched ? fetched.rows : [],
    loading: active && !matched,
    error: matched ? fetched.error : null,
    connected: true,
  };
}

/* --------------------------------------------------------- public holidays */

/* The calendar moved to `lib/store/holidays.ts` when it stopped being a list you
   look at and became one you edit. `usePublicHolidays` lives there, alongside
   `useHolidayMutations`. Leave requests and holidays share a router on the API;
   they do not share a screen, a cache or a refresh, and a hook that reloaded
   "leave" after a holiday was added would refetch two hundred requests to redraw
   twelve dates. */
