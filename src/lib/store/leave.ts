"use client";

import { useCallback, useSyncExternalStore } from "react";
import { LEAVE_REQUESTS, type LeaveRequest, type LeaveType } from "@/lib/mock/workflows";
import { useSession } from "./session";
import { TODAY } from "@/lib/today";
import { createPersistedState, patched } from "./persisted";
import type { LeaveWindow } from "@/lib/workflows/leave";

/**
 * Leave requests, and the decisions on them.
 *
 * This is the single source of truth the approval inbox, the time-off screen and
 * an employee's own record all read. Before it existed, `/approvals` held a
 * hand-written row *describing* a leave request and kept its decision in local
 * component state, so approving in one screen had no effect on the other. There
 * is now one store and one status per request; see `lib/workflows/queue.ts` for
 * how the inbox derives its rows from it.
 *
 * Shape follows `useEmployeeStore`: sparse overrides against the seed array plus
 * whole new records, never a mutated copy of the seed. An override is exactly
 * the body of a future `PATCH /leave-requests/:id`.
 */

type LeaveState = {
  overrides: Record<string, Partial<LeaveRequest>>;
  created: LeaveRequest[];
};

const EMPTY: LeaveState = { overrides: {}, created: [] };

const store = createPersistedState<LeaveState>({
  key: "approvehr.leave.store",
  empty: EMPTY,
  version: 1,
});

export type LeaveDecision = "approved" | "declined";

/** A new request needs an id that cannot collide with the seed's `lv-NN`. */
function nextLeaveId() {
  return `lv-new-${Date.now().toString(36)}`;
}

/** Whole days inclusive of both ends. Weekends are not netted off — the company
    leave policy decides that, and the working-week setting lives in payroll
    settings, so a naive count here would contradict it. */
export function daysBetween(from: string, to: string): number {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

export type NewLeaveRequest = {
  employeeId: string;
  type: LeaveType;
  from: string;
  to: string;
  reason?: string;
  approverId?: string;
};

export function useLeaveStore() {
  /* Decisions are attributed to whoever is signed in, not to a hardcoded user —
     otherwise the audit trail says the same name no matter who acted. */
  const { actingId } = useSession();
  const state = useSyncExternalStore(
    store.subscribe,
    store.read,
    store.getServerSnapshot,
  );

  /* Seed rows with any decision applied, then anything raised locally. */
  const requests: LeaveRequest[] = [
    ...LEAVE_REQUESTS.map((r) => patched(r, state.overrides)),
    ...state.created.map((r) => patched(r, state.overrides)),
  ];

  /**
   * Approve or send back. Writes the decision, who made it and when, so the
   * record page can show an audit trail that survives a reload rather than a
   * status that appeared from nowhere.
   */
  const decide = useCallback(
    (id: string, decision: LeaveDecision, note?: string) => {
      const s = store.current();
      const patch: Partial<LeaveRequest> = {
        status: decision,
        decidedAt: TODAY,
        decidedById: actingId,
        ...(note ? { decisionNote: note } : {}),
      };
      store.commit({
        ...s,
        overrides: { ...s.overrides, [id]: { ...s.overrides[id], ...patch } },
      });
    },
    [actingId],
  );

  /** Undo a decision. The request goes back to pending and reappears in the
      inbox — an approver who mis-clicked should not need a support ticket. */
  const reopen = useCallback((id: string) => {
    const s = store.current();
    store.commit({
      ...s,
      overrides: {
        ...s.overrides,
        [id]: {
          ...s.overrides[id],
          status: "pending",
          decidedAt: undefined,
          decidedById: undefined,
          decisionNote: undefined,
        },
      },
    });
  }, []);

  const cancel = useCallback((id: string) => {
    const s = store.current();
    store.commit({
      ...s,
      overrides: {
        ...s.overrides,
        [id]: { ...s.overrides[id], status: "cancelled", decidedAt: TODAY },
      },
    });
  }, []);

  const create = useCallback((input: NewLeaveRequest) => {
    const s = store.current();
    const request: LeaveRequest = {
      id: nextLeaveId(),
      employeeId: input.employeeId,
      type: input.type,
      from: input.from,
      to: input.to,
      days: daysBetween(input.from, input.to),
      status: "pending",
      reason: input.reason,
      approverId: input.approverId,
      requestedAt: TODAY,
    };
    store.commit({ ...s, created: [...s.created, request] });
    return request;
  }, []);

  const resetAll = useCallback(() => store.reset(), []);

  return {
    requests,
    pending: requests.filter((r) => r.status === "pending"),
    forEmployee: (employeeId: string) =>
      requests.filter((r) => r.employeeId === employeeId),
    get: (id: string) => requests.find((r) => r.id === id),
    decide,
    reopen,
    cancel,
    create,
    resetAll,
    /** True once anything has been decided or raised locally. */
    hasLocalChanges:
      Object.keys(state.overrides).length > 0 || state.created.length > 0,
  };
}

/* -------------------------------------------------------------- Validation */

export type LeaveError = { field: keyof NewLeaveRequest; message: string };

/**
 * Validated against the requests that already exist, not just the form — an
 * overlapping request is the error people actually make, and catching it here
 * is the difference between a booking screen and a form.
 *
 * ## Why the parameters are structural
 *
 * `input.type` is a plain string and `existing` is the minimum a clash check
 * reads, rather than `NewLeaveRequest` and `LeaveRequest[]`. Connected to the
 * API a leave type is a record with an id, not one of five hard-coded names, so
 * the booking dialog cannot produce a `LeaveRequest` — and it still has to run
 * the same checks before it spends a round trip finding out. The API repeats
 * every one of them and its answer wins; this exists so the common mistakes are
 * caught in the form, where the fix is in front of you.
 */
export function validateLeave(
  input: { employeeId?: string; type?: string; from?: string; to?: string },
  existing: readonly LeaveWindow[],
  remainingDays: number | undefined,
): LeaveError[] {
  const errors: LeaveError[] = [];

  if (!input.employeeId) {
    errors.push({ field: "employeeId", message: "Choose who the leave is for." });
  }
  if (!input.from) {
    errors.push({ field: "from", message: "Pick a start date." });
  }
  if (!input.to) {
    errors.push({ field: "to", message: "Pick an end date." });
  }

  if (input.from && input.to) {
    if (input.to < input.from) {
      errors.push({ field: "to", message: "The end date is before the start date." });
    } else {
      const days = daysBetween(input.from, input.to);
      if (days > 60) {
        errors.push({
          field: "to",
          message: "That is over 60 days. Split it or raise it as a sabbatical.",
        });
      }
      if (
        remainingDays !== undefined &&
        input.type !== "Maternity" &&
        input.type !== "Paternity" &&
        days > remainingDays
      ) {
        errors.push({
          field: "to",
          message: `Only ${remainingDays} ${
            remainingDays === 1 ? "day" : "days"
          } left on that entitlement. Approve as unpaid, or shorten the request.`,
        });
      }

      /* Overlap against anything not already refused. */
      const clash = existing.find(
        (r) =>
          r.employeeId === input.employeeId &&
          (r.status === "pending" || r.status === "approved") &&
          r.from <= input.to! &&
          r.to >= input.from!,
      );
      if (clash) {
        errors.push({
          field: "from",
          message: `Overlaps an existing ${clash.status} request, ${clash.from} to ${clash.to}.`,
        });
      }
    }
  }

  return errors;
}
