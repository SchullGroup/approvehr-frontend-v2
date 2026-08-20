"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Employee } from "@/lib/types";
import { ApiError } from "@/lib/api/client";
import {
  employees as api,
  toEmployee,
  toKobo,
  type EmployeeListParams,
} from "@/lib/api/endpoints";
import { useEmployeeStore } from "./employees";
import { useSession } from "./session";

/**
 * The employee directory, from whichever source is available.
 *
 * ## Why this wraps rather than replaces
 *
 * `useEmployeeStore` is the localStorage store, and it still works — it is what
 * the demo runs on when there is no API. Rather than deleting it and making the
 * whole product require a database, this hook picks:
 *
 *   connected  → the API, with server-side search, filtering and paging
 *   demo       → the existing store, unchanged
 *
 * Every screen calls this one hook and does not care which it got. That is what
 * makes the cutover reviewable a screen at a time instead of as one large
 * irreversible commit.
 *
 * ## What differs between the two, honestly
 *
 * In demo mode the whole directory is in memory, so search and paging are local
 * and instant. Connected, they are server-side: `total` is the real count rather
 * than the length of the array you happen to hold, and a search is a request.
 * Screens that assumed "I have all the employees" are the ones to check when
 * switching a screen over — the directory did, and now takes `total` from meta.
 */

export type DirectoryState = {
  employees: Employee[];
  total: number;
  loading: boolean;
  error: ApiError | null;
  /** True when reading from the API rather than local storage. */
  connected: boolean;
  /**
   * Ids that are archived.
   *
   * Exposed as a set because archived-ness lives in different places in the two
   * modes — a boolean on the API row, a separate array in the local store — and
   * a screen should not have to know which. `Employee` has no `archived` field
   * and deliberately still does not: it is a property of the *record's state*,
   * not of the person.
   */
  archivedIds: Set<string>;
};

export function useEmployeeDirectory(params: EmployeeListParams = {}) {
  const { isConnected } = useSession();
  const local = useEmployeeStore();

  const [state, setState] = useState<DirectoryState>({
    employees: [],
    total: 0,
    loading: isConnected,
    error: null,
    connected: isConnected,
    archivedIds: new Set(),
  });

  /* Serialised so the effect re-runs on a *value* change rather than on every
     render — an object literal passed inline is a new reference each time. */
  const key = JSON.stringify(params);

  /* Guards against a slow response for an old query overwriting a fast one for
     the new query. A search box types faster than a network answers. */
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!isConnected) return;
    const ticket = ++latest.current;
    const controller = new AbortController();

    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const page = await api.list(JSON.parse(key) as EmployeeListParams, controller.signal);
      if (ticket !== latest.current) return;
      setState({
        employees: page.data.map(toEmployee),
        total: page.meta.total,
        loading: false,
        error: null,
        connected: true,
        archivedIds: new Set(
          page.data.filter((row) => row.archived).map((row) => row.id),
        ),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
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
    /* Demo mode: filter and search the in-memory directory so the screen
       behaves the same way, just without a server. */
    const parsed = JSON.parse(key) as EmployeeListParams;
    let rows = parsed.includeArchived ? local.all : local.directory;
    if (parsed.q) {
      const needle = parsed.q.toLowerCase();
      rows = rows.filter((e) =>
        [e.firstName, e.lastName, e.email, e.employeeNo, e.jobTitle]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(needle)),
      );
    }
    if (parsed.payrollBlocked) {
      rows = rows.filter((e) => !e.bankAccount || !e.pensionPin || !e.tin);
    }
    return {
      employees: rows,
      total: rows.length,
      loading: false,
      error: null,
      connected: false,
      archivedIds: new Set(local.archived),
      reload: () => {},
    };
  }

  return { ...state, reload: load };
}

/**
 * Mutations, routed to whichever source is live.
 *
 * The API takes kobo and the frontend's `Employee` is in naira, so the
 * conversion happens here — the same boundary rule as `endpoints.ts`.
 */
export function useEmployeeMutations() {
  const { isConnected } = useSession();
  const local = useEmployeeStore();

  const create = useCallback(
    async (draft: Partial<Employee> & { firstName: string; lastName: string }) => {
      if (!isConnected) {
        throw new ApiError(
          0,
          "offline",
          "Creating employees needs the API. Start it and sign in again.",
        );
      }
      const created = await api.create({
        firstName: draft.firstName,
        lastName: draft.lastName,
        jobTitle: draft.jobTitle ?? "Not set",
        startDate: draft.startDate ?? new Date().toISOString().slice(0, 10),
        grossMonthlyKobo: toKobo(draft.grossMonthly ?? 0),
        taxState: draft.taxState ?? "Lagos",
        ...(draft.email ? { email: draft.email } : {}),
        ...(draft.phone ? { phone: draft.phone } : {}),
        ...(draft.bankName ? { bankName: draft.bankName } : {}),
        ...(draft.bankAccount ? { bankAccount: draft.bankAccount } : {}),
        ...(draft.pensionPin ? { pensionPin: draft.pensionPin } : {}),
        ...(draft.tin ? { tin: draft.tin } : {}),
      });
      return toEmployee(created);
    },
    [isConnected],
  );

  const update = useCallback(
    async (id: string, patch: Partial<Employee>) => {
      if (!isConnected) {
        local.update(id, patch);
        return undefined;
      }
      const { grossMonthly, nextOfKin, ...rest } = patch;
      const updated = await api.update(id, {
        ...rest,
        ...(grossMonthly === undefined
          ? {}
          : { grossMonthlyKobo: toKobo(grossMonthly) }),
        ...(nextOfKin
          ? {
              nextOfKinName: nextOfKin.name,
              nextOfKinRelationship: nextOfKin.relationship,
              nextOfKinPhone: nextOfKin.phone,
            }
          : {}),
      });
      return toEmployee(updated);
    },
    [isConnected, local],
  );

  const archive = useCallback(
    async (id: string) => {
      if (!isConnected) {
        local.archive(id);
        return;
      }
      await api.archive(id);
    },
    [isConnected, local],
  );

  const restore = useCallback(
    async (id: string) => {
      if (!isConnected) {
        local.restore(id);
        return;
      }
      await api.restore(id);
    },
    [isConnected, local],
  );

  return { create, update, archive, restore, connected: isConnected };
}
