"use client";

import { useMemo } from "react";
import { useCan, useIsManager } from "@/lib/permissions";
import { useFeatures } from "./features";
import { useHeadedDepartmentIds } from "./departments";
import { useEmployeeDirectory } from "./employees-api";
import { useSession } from "./session";
import type { Actor } from "@/lib/projects/access";

/**
 * Who is looking, and which people the Projects screens can name.
 *
 * Three small hooks every Projects screen asks, kept together so the module's
 * gate, its access predicate input and its people lookup each have one home.
 */

/**
 * Whether the company has Projects switched on.
 *
 * **The one place the gate is read.** The nav hides the item from the same flag
 * (`feature: "projects"` in `components/portal/nav.tsx`); the routes use this to
 * show a plain "not switched on" state instead of a list that cannot load. If the
 * flag is ever renamed or moved, this is the only function to retarget.
 *
 * `loading` is true until the flags have answered. A screen must not decide the
 * module is off during that moment: a page that says "not switched on" for half
 * a second and then draws a board is worse than one that waits.
 */
export function useProjectsGate(): { enabled: boolean; loading: boolean } {
  const features = useFeatures();
  return { enabled: features.projects === true, loading: features.loading };
}

/**
 * The signed-in person, as the Projects access predicates need them.
 *
 * `leadsPeople` reads the same hook the rest of the product uses for "has
 * anybody reporting to them", and `headsDepartment` the same one for department
 * heads; `editRecords` is the permission that sees and edits every project. None
 * of this is the authority — the API decides — it only decides what is offered.
 */
export function useProjectActor(): Actor {
  const { actingId } = useSession();
  const editRecords = useCan("EDIT_RECORDS");
  const leadsPeople = useIsManager();
  const headed = useHeadedDepartmentIds();
  return useMemo(
    () => ({
      employeeId: actingId || null,
      editRecords,
      leadsPeople,
      headsDepartment: headed.size > 0,
    }),
    [actingId, editRecords, leadsPeople, headed],
  );
}

export type Person = {
  id: string;
  name: string;
  jobTitle: string;
  departmentId: string | null;
  department: string | null;
};

export type People = {
  people: Person[];
  byId: ReadonlyMap<string, Person>;
  /** `Unassigned` for null, `Someone` for an id the directory does not list. */
  nameOf: (employeeId: string | null | undefined) => string;
  loading: boolean;
};

/**
 * The people a project can name: active employees, from the directory.
 *
 * Reads the same lookup every other picker in the product reads, so a person who
 * is not on the payroll is not offered. An id the directory does not return — a
 * colleague who has since left, or one beyond the page — is called "Someone"
 * rather than shown as an id.
 */
export function usePeople(): People {
  const directory = useEmployeeDirectory({ pageSize: 200 });
  const rows = directory.people;
  const loading = directory.loading;
  return useMemo(() => {
    const people: Person[] = rows.map((row) => ({
      id: row.id,
      name: row.fullName,
      jobTitle: row.jobTitle,
      departmentId: row.departmentId ?? null,
      department: row.department,
    }));
    const byId = new Map(people.map((p) => [p.id, p]));
    return {
      people,
      byId,
      loading,
      nameOf: (id: string | null | undefined) =>
        id ? (byId.get(id)?.name ?? "Someone") : "Unassigned",
    };
  }, [rows, loading]);
}
