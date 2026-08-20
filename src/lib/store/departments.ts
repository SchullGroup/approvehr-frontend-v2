"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  departments as api,
  type ApiDepartment,
} from "@/lib/api/endpoints";
import { EMPLOYEES } from "@/lib/mock/people";
import { useSession } from "./session";

/**
 * Departments and teams.
 *
 * Unlike the other stores there is **no localStorage fallback that can edit**.
 * The demo derives a read-only tree from the distinct department names on the
 * seed employees, and every mutation refuses with a clear message.
 *
 * That is deliberate rather than lazy. Department structure is a payroll
 * reporting boundary — a cost centre, a roll-up, the unit a head is responsible
 * for. Letting somebody build a tree in browser storage that no payroll run will
 * ever see would produce a demo that teaches the wrong thing about how the
 * product works. Better to say "this needs the API" than to fake it.
 */

export type DepartmentNode = ApiDepartment;

type State = {
  tree: DepartmentNode[];
  flat: Omit<ApiDepartment, "children">[];
  counts: { departments: number; teams: number; unassignedEmployees: number };
  loading: boolean;
  error: ApiError | null;
  /** False in demo mode: the tree is read-only. */
  editable: boolean;
};

/**
 * Drops `children` for the flat list the pickers render.
 *
 * Written as a function rather than a `{ children: _children, ...rest }`
 * destructure because the discarded binding reads as dead code to both a
 * linter and the next person, and this says what it is for.
 */
function flatten<T extends { children: unknown }>(node: T): Omit<T, "children"> {
  const { children, ...rest } = node;
  void children;
  return rest;
}

/** A read-only tree from the seed, so the demo shows something real-shaped. */
function demoTree(): State {
  const names = [...new Set(EMPLOYEES.map((e) => e.department))].sort();
  const tree: DepartmentNode[] = names.map((name) => {
    const staff = EMPLOYEES.filter((e) => e.department === name);
    return {
      id: `demo-${name.toLowerCase().replace(/\s+/g, "-")}`,
      name,
      parentId: null,
      costCentre: null,
      headId: null,
      headName: null,
      directEmployees: staff.length,
      totalEmployees: staff.length,
      childCount: 0,
      depth: 0,
      archived: false,
      payrollKobo: staff.reduce((sum, e) => sum + Math.round(e.grossMonthly * 100), 0),
      children: [],
    };
  });
  return {
    tree,
    flat: tree.map(flatten),
    counts: {
      departments: tree.length,
      teams: 0,
      unassignedEmployees: 0,
    },
    loading: false,
    error: null,
    editable: false,
  };
}

const EMPTY: State = {
  tree: [],
  flat: [],
  counts: { departments: 0, teams: 0, unassignedEmployees: 0 },
  loading: true,
  error: null,
  editable: true,
};

export function useDepartments(includeArchived = false) {
  const { isConnected } = useSession();
  const [state, setState] = useState<State>(
    isConnected ? EMPTY : demoTree(),
  );

  const load = useCallback(async () => {
    if (!isConnected) {
      setState(demoTree());
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const result = await api.tree(includeArchived);
      setState({
        tree: result.tree,
        flat: result.flat,
        counts: result.counts,
        loading: false,
        error: null,
        editable: true,
      });
    } catch (error) {
      setState((s) => ({
        ...s,
        loading: false,
        error: error instanceof ApiError ? error : null,
      }));
    }
  }, [isConnected, includeArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Every mutation refuses in demo mode rather than pretending. */
  const guard = useCallback(() => {
    if (!isConnected) {
      throw new ApiError(
        0,
        "offline",
        "Changing the org structure needs the API — a department is a payroll " +
          "reporting boundary, and a tree kept in this browser would never reach a run.",
      );
    }
  }, [isConnected]);

  return {
    ...state,
    reload: load,
    create: useCallback(
      async (body: { name: string; parentId?: string; costCentre?: string }) => {
        guard();
        const created = await api.create(body);
        await load();
        return created;
      },
      [guard, load],
    ),
    update: useCallback(
      async (
        id: string,
        body: { name?: string; headId?: string | null; costCentre?: string | null },
      ) => {
        guard();
        const updated = await api.update(id, body);
        await load();
        return updated;
      },
      [guard, load],
    ),
    move: useCallback(
      async (id: string, parentId: string | null) => {
        guard();
        const moved = await api.move(id, parentId);
        await load();
        return moved;
      },
      [guard, load],
    ),
    archive: useCallback(
      async (id: string) => {
        guard();
        await api.archive(id);
        await load();
      },
      [guard, load],
    ),
    restore: useCallback(
      async (id: string) => {
        guard();
        await api.restore(id);
        await load();
      },
      [guard, load],
    ),
    assign: useCallback(
      async (id: string, employeeIds: string[]) => {
        guard();
        const result = await api.assign(id, employeeIds);
        await load();
        return result;
      },
      [guard, load],
    ),
  };
}

/** One department in detail, for the drawer. */
export function useDepartment(id: string | null) {
  const { isConnected } = useSession();
  const active = Boolean(id) && isConnected;

  /* Kept as { id, detail } rather than a bare detail, so the result carries
     the id it belongs to. Two things fall out of that: a slow response for a
     department you have already navigated away from cannot be shown, and there
     is nothing to clear when `id` changes — the stale value simply stops
     matching below. Clearing it here instead would be a setState in an effect
     body, which cascades a render. */
  const [fetched, setFetched] = useState<{
    id: string;
    detail: Awaited<ReturnType<typeof api.get>> | null;
  } | null>(null);

  useEffect(() => {
    if (!active || !id) return;
    let cancelled = false;
    void (async () => {
      try {
        const detail = await api.get(id);
        if (!cancelled) setFetched({ id, detail });
      } catch {
        if (!cancelled) setFetched({ id, detail: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, active]);

  const matched = active && fetched !== null && fetched.id === id;
  return {
    detail: matched ? fetched.detail : null,
    /* Derived rather than tracked. We are loading exactly while an active id
       has no matching result yet, which is true from the moment `id` changes
       — so there is no setState in the effect body and no window where the
       previous department's data is shown as though it were this one's. */
    loading: active && !matched,
  };
}
