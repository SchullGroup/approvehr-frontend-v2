"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  departments as api,
  type ApiDepartment,
  type ApiDepartmentDetail,
} from "@/lib/api/endpoints";
import {
  DEMO_STRUCTURE_NOTE,
  demoDepartmentDetail,
  demoStructure,
  demoStructureId,
  demoTree,
  refuse,
  sameName,
  structurePeople,
  useDemoStructure,
  type DemoDepartmentRow,
  type StructurePerson,
} from "./demo-structure";
import { useEmployeeStore } from "./employees";
import { useSession } from "./session";

/**
 * Departments, in both modes — and demo mode can now edit them.
 *
 * ## What this file used to say, and why it changed
 *
 * It used to refuse every write with no API, on the argument that a department
 * is a payroll reporting boundary — a cost centre, a roll-up, the unit a head is
 * responsible for — so a tree built in browser storage would never reach a real
 * payroll run and building one would teach the wrong model.
 *
 * The argument is true. It was the wrong conclusion, because **it applies to
 * every demo write in the product**: a demo leave approval never moves a real
 * balance, a demo employee never appears on a real payslip, a demo rota never
 * prorates a real run. Employees, leave, attendance, shifts and the rest all
 * write locally, say so on screen, and are the product being demonstrated.
 * Departments was the outlier, and demo mode is the mode everybody opens first,
 * so the feature read as missing rather than as deliberately withheld.
 *
 * So the warning stays and the refusal goes. `DEMO_STRUCTURE_NOTE` in
 * `demo-structure.ts` is the warning, and the screen renders it on both tabs.
 *
 * **Several other stores cite this file as the precedent for refusing a demo
 * write** (`grades`, `assets`, `conduct`, `loans`, `reimbursements`, `careers`,
 * `documents`, `helpdesk`, `knowledge`, `offboarding`, `performance`,
 * `permissions`). The citation is stale in its *conclusion* and still sound in
 * its *reasoning*: each of those is a different judgement about whether local
 * data would contradict something else the demo shows. None of them was
 * revisited here.
 *
 * ## Where demo membership lives
 *
 * Not here. `Employee.department` is a name in this mode and it is what the
 * directory, the record page, the payslip header and `/reports` all render, so
 * that name *is* the membership and this store holds only the structure. See the
 * header of `demo-structure.ts`, including the consequence: a rename rewrites
 * the name on everybody in the department, because in this mode the name is the
 * pointer.
 *
 * ## Shape
 *
 * `lib/store/shifts.ts` is the model. The demo value is a `useMemo` that never
 * touches state, the fetch runs in an async IIFE inside the effect behind a
 * `cancelled` guard, and staleness is decided by comparing a key **during
 * render** rather than by clearing state in an effect — which would be a
 * synchronous setState and a cascaded render. The previous version of this file
 * called `setState` from the effect on both paths.
 */

export type DepartmentNode = ApiDepartment;

/** Which source a screen is looking at, so it can label itself honestly. */
export type DepartmentSource = "api" | "demo";

export type DepartmentsState = {
  tree: DepartmentNode[];
  flat: Omit<ApiDepartment, "children">[];
  counts: { departments: number; teams: number; unassignedEmployees: number };
  loading: boolean;
  error: ApiError | null;
  source: DepartmentSource;
  /** The sentence to render when `source` is `"demo"`. */
  demoNote: string;
};

const EMPTY_COUNTS = { departments: 0, teams: 0, unassignedEmployees: 0 };

/* ------------------------------------------------------------- demo writes */

const MAX_NAME = 80;
const MAX_COST_CENTRE = 40;

/** Same limits `modules/departments/schemas.ts` refuses on, in its words. */
function cleanName(value: string): string {
  const name = value.trim();
  if (name.length < 2) {
    refuse(422, "invalid", "Give it a name of at least two characters.");
  }
  if (name.length > MAX_NAME) {
    refuse(
      422,
      "invalid",
      "That name is too long to fit a nav item or a report column.",
    );
  }
  return name;
}

function cleanCostCentre(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const costCentre = value.trim();
  if (costCentre === "") return null;
  if (costCentre.length > MAX_COST_CENTRE) {
    refuse(422, "invalid", "That cost centre code is too long.");
  }
  return costCentre;
}

function requireRow(
  rows: readonly DemoDepartmentRow[],
  id: string,
): DemoDepartmentRow {
  const row = rows.find((one) => one.id === id);
  if (!row) refuse(404, "not_found", "That department could not be found.");
  return row;
}

/** Duplicate names are refused because in this mode the name is the identity. */
function assertNameFree(
  rows: readonly DemoDepartmentRow[],
  name: string,
  exceptId?: string,
): void {
  const clash = rows.find(
    (row) => row.id !== exceptId && sameName(row.name, name),
  );
  if (!clash) return;
  refuse(
    409,
    "conflict",
    clash.archived
      ? `"${name}" exists but is archived. Restore it instead of creating a duplicate.`
      : `"${name}" already exists.`,
  );
}

function assertLiveParent(
  rows: readonly DemoDepartmentRow[],
  parentId: string,
): void {
  const parent = rows.find((row) => row.id === parentId && !row.archived);
  if (!parent) {
    refuse(422, "unprocessable", "That parent department does not exist.");
  }
}

function assertPersonExists(
  people: readonly StructurePerson[],
  id: string,
): void {
  if (!people.some((person) => person.id === id)) {
    refuse(422, "unprocessable", "That employee does not exist.");
  }
}

/* --------------------------------------------------------------- the read */

export function useDepartments(includeArchived = false) {
  const { isConnected } = useSession();
  const demo = useDemoStructure();
  const { directory, update: patchEmployee } = useEmployeeStore();

  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<{
    key: string;
    result: Awaited<ReturnType<typeof api.tree>> | null;
    error: ApiError | null;
  } | null>(null);

  const key = `${String(includeArchived)}|${tick}`;

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await api.tree(includeArchived, controller.signal);
        if (!cancelled) setFetched({ key, result, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({
            key,
            result: null,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, includeArchived, key]);

  const reload = useCallback(() => setTick((current) => current + 1), []);

  /* Both derived, never stored. `people` is the live directory rather than the
     `EMPLOYEES` seed for the reason `demo-structure.ts` gives: the seed is a
     snapshot, and reading it would let somebody create a person, assign them a
     department, and watch the headcount not move. */
  const people = useMemo(() => structurePeople(directory), [directory]);
  const demoValue = useMemo(
    () => demoTree(demo, people, includeArchived),
    [demo, people, includeArchived],
  );

  const matched = fetched !== null && fetched.key === key;

  const state: DepartmentsState = !isConnected
    ? {
        ...demoValue,
        loading: false,
        error: null,
        source: "demo",
        demoNote: DEMO_STRUCTURE_NOTE,
      }
    : {
        tree: matched ? (fetched.result?.tree ?? []) : [],
        flat: matched ? (fetched.result?.flat ?? []) : [],
        counts: matched ? (fetched.result?.counts ?? EMPTY_COUNTS) : EMPTY_COUNTS,
        loading: !matched,
        error: matched ? fetched.error : null,
        source: "api",
        demoNote: DEMO_STRUCTURE_NOTE,
      };

  /* Every write commits and lets the caller reload, exactly as the connected
     path does. `demoStructure.read()` rather than the render snapshot, because
     two writes in one handler must see each other. */
  const create = useCallback(
    async (body: {
      name: string;
      parentId?: string;
      costCentre?: string;
    }): Promise<ApiDepartmentDetail> => {
      if (isConnected) {
        const created = await api.create(body);
        reload();
        return created;
      }
      const state = demoStructure.read();
      const name = cleanName(body.name);
      const costCentre = cleanCostCentre(body.costCentre);
      if (body.parentId) assertLiveParent(state.departments, body.parentId);
      assertNameFree(state.departments, name);

      const row: DemoDepartmentRow = {
        id: demoStructureId("dept"),
        name,
        parentId: body.parentId ?? null,
        costCentre,
        headId: null,
        archived: false,
      };
      const next = { ...state, departments: [...state.departments, row] };
      demoStructure.commit(next);
      const detail = demoDepartmentDetail(next, people, row.id);
      if (!detail) refuse(500, "unexpected", "Could not read that back.");
      return detail;
    },
    [isConnected, people, reload],
  );

  const update = useCallback(
    async (
      id: string,
      body: {
        name?: string;
        headId?: string | null;
        costCentre?: string | null;
      },
    ): Promise<ApiDepartmentDetail> => {
      if (isConnected) {
        const updated = await api.update(id, body);
        reload();
        return updated;
      }
      const state = demoStructure.read();
      const row = requireRow(state.departments, id);
      const name = body.name === undefined ? row.name : cleanName(body.name);
      if (!sameName(name, row.name)) {
        assertNameFree(state.departments, name, id);
      }
      if (body.headId) assertPersonExists(people, body.headId);

      const next = {
        ...state,
        departments: state.departments.map((one) =>
          one.id === id
            ? {
                ...one,
                name,
                ...(body.headId === undefined ? {} : { headId: body.headId }),
                ...(body.costCentre === undefined
                  ? {}
                  : { costCentre: cleanCostCentre(body.costCentre) }),
              }
            : one,
        ),
      };
      demoStructure.commit(next);

      /* The rename, carried onto the people in it.
         Connected, a rename moves nobody: `Employee.departmentId` is unchanged
         and every report follows the id. Offline the name *is* the pointer, so
         not rewriting it here would empty the department and put everybody in it
         into the unassigned count — a rename that looked like a mass unassign. */
      if (name !== row.name) {
        for (const person of people) {
          if (sameName(person.department, row.name)) {
            patchEmployee(person.id, { department: name });
          }
        }
      }

      const detail = demoDepartmentDetail(next, people, id);
      if (!detail) refuse(500, "unexpected", "Could not read that back.");
      return detail;
    },
    [isConnected, patchEmployee, people, reload],
  );

  const move = useCallback(
    async (id: string, parentId: string | null): Promise<ApiDepartmentDetail> => {
      if (isConnected) {
        const moved = await api.move(id, parentId);
        reload();
        return moved;
      }
      const state = demoStructure.read();
      const row = requireRow(state.departments, id);
      if (parentId === id) {
        refuse(422, "unprocessable", "A department cannot be its own parent.");
      }
      if (parentId) {
        assertLiveParent(state.departments, parentId);
        /* Walk up from the proposed parent. Meeting `id` means the parent is a
           descendant and the move would close a loop, which makes both
           unreachable from the root and every tree walk infinite. */
        let cursor: string | null = parentId;
        for (let depth = 0; depth < 50 && cursor; depth += 1) {
          if (cursor === id) {
            refuse(
              422,
              "unprocessable",
              `That would put ${row.name} inside one of its own sub-departments.`,
            );
          }
          cursor =
            state.departments.find((one) => one.id === cursor)?.parentId ?? null;
        }
      }

      const next = {
        ...state,
        departments: state.departments.map((one) =>
          one.id === id ? { ...one, parentId } : one,
        ),
      };
      demoStructure.commit(next);
      const detail = demoDepartmentDetail(next, people, id);
      if (!detail) refuse(500, "unexpected", "Could not read that back.");
      return detail;
    },
    [isConnected, people, reload],
  );

  /**
   * Archive. Refuses while anybody is still in it, and names them.
   *
   * Reassigning people automatically would be worse than refusing: it silently
   * changes which cost centre their pay lands in and nobody would know. The
   * same refusal, in the same words, as `modules/departments/service.ts`.
   */
  const archive = useCallback(
    async (id: string): Promise<void> => {
      if (isConnected) {
        await api.archive(id);
        reload();
        return;
      }
      const state = demoStructure.read();
      const row = requireRow(state.departments, id);
      if (row.archived) refuse(409, "conflict", "That is already archived.");

      const inside = people.filter((person) =>
        sameName(person.department, row.name),
      );
      if (inside.length > 0) {
        const names = inside
          .slice(0, 3)
          .map((person) => person.name)
          .join(", ");
        refuse(
          409,
          "conflict",
          `${inside.length} ${inside.length === 1 ? "person is" : "people are"} still in ${row.name} (${names}${inside.length > 3 ? ", …" : ""}). Move them first — reassigning automatically would change which cost centre their pay lands in.`,
        );
      }

      const children = state.departments.filter(
        (one) => one.parentId === id && !one.archived,
      );
      if (children.length > 0) {
        refuse(
          409,
          "conflict",
          `${row.name} still has ${children.length} ${children.length === 1 ? "sub-department" : "sub-departments"} inside it. Move or archive those first.`,
        );
      }

      demoStructure.commit({
        ...state,
        departments: state.departments.map((one) =>
          one.id === id ? { ...one, archived: true } : one,
        ),
      });
    },
    [isConnected, people, reload],
  );

  const restore = useCallback(
    async (id: string): Promise<void> => {
      if (isConnected) {
        await api.restore(id);
        reload();
        return;
      }
      const state = demoStructure.read();
      const row = requireRow(state.departments, id);
      if (!row.archived) refuse(409, "conflict", "That is not archived.");

      /* A restored sub-department whose parent is archived would be invisible in
         the tree. Promote it to the top rather than restoring it into a hidden
         branch — the same thing the service does. */
      const parent = row.parentId
        ? state.departments.find((one) => one.id === row.parentId)
        : undefined;
      const parentId = parent && !parent.archived ? row.parentId : null;

      demoStructure.commit({
        ...state,
        departments: state.departments.map((one) =>
          one.id === id ? { ...one, archived: false, parentId } : one,
        ),
      });
    },
    [isConnected, reload],
  );

  /** Moves a set of people into a department in one action. */
  const assign = useCallback(
    async (
      id: string,
      employeeIds: string[],
    ): Promise<{ moved: number; departmentId: string | null }> => {
      if (isConnected) {
        const result = await api.assign(id, employeeIds);
        reload();
        return result;
      }
      const state = demoStructure.read();
      const row = requireRow(state.departments, id);
      if (row.archived) {
        refuse(422, "unprocessable", "That department does not exist.");
      }
      const unknown = employeeIds.filter(
        (employeeId) => !people.some((person) => person.id === employeeId),
      );
      if (unknown.length > 0) {
        refuse(
          422,
          "unprocessable",
          "One or more of those employees does not exist or is archived.",
        );
      }

      /* Written onto the person, not into a membership table — that name is
         what every other demo screen reads as their department. */
      for (const employeeId of employeeIds) {
        patchEmployee(employeeId, { department: row.name });
      }
      return { moved: employeeIds.length, departmentId: id };
    },
    [isConnected, patchEmployee, people, reload],
  );

  return {
    ...state,
    reload,
    create,
    update,
    move,
    archive,
    restore,
    assign,
  };
}

/* ------------------------------------------------------- one whole department */

/** One department in detail, for the drawer. */
export function useDepartment(id: string | null) {
  const { isConnected } = useSession();
  const demo = useDemoStructure();
  const { directory } = useEmployeeStore();
  const active = Boolean(id) && isConnected;

  /* Kept as { id, detail } rather than a bare detail, so the result carries
     the id it belongs to. Two things fall out of that: a slow response for a
     department you have already navigated away from cannot be shown, and there
     is nothing to clear when `id` changes — the stale value simply stops
     matching below. Clearing it here instead would be a setState in an effect
     body, which cascades a render. */
  const [fetched, setFetched] = useState<{
    id: string;
    detail: ApiDepartmentDetail | null;
  } | null>(null);

  useEffect(() => {
    if (!active || !id) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const detail = await api.get(id, controller.signal);
        if (!cancelled) setFetched({ id, detail });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) setFetched({ id, detail: null });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id, active]);

  const people = useMemo(() => structurePeople(directory), [directory]);
  const demoDetail = useMemo(
    () => (isConnected || !id ? null : demoDepartmentDetail(demo, people, id)),
    [isConnected, id, demo, people],
  );

  const matched = active && fetched !== null && fetched.id === id;

  if (!isConnected) return { detail: demoDetail, loading: false };

  return {
    detail: matched ? fetched.detail : null,
    /* Derived rather than tracked. We are loading exactly while an active id
       has no matching result yet, which is true from the moment `id` changes
       — so there is no setState in the effect body and no window where the
       previous department's data is shown as though it were this one's. */
    loading: active && !matched,
  };
}
