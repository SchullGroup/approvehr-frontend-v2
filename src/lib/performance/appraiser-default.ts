import type {
  ApiAppraiserMapRow,
  ReviewCycleStage,
} from "@/lib/api/performance";

/**
 * Who appraises whom by default: the reporting line (owner request, 24 Nov
 * 2026).
 *
 * The API has no map without a period. It applies this default once, when a
 * period starts (`autoAssignFromReportingLine`): each person nobody is mapped
 * to gets their recorded manager, or their department's head when no manager
 * is recorded, or nobody. Until the API keeps a map of its own for "all
 * periods" (`appraiser-default-api-proposal.md` in the shared notes), the
 * "All appraisal periods" view is that rule worked out here from the staff
 * list, and read only. It is one function, and it says which of the three it
 * used, so the screen never presents a guess as a setting.
 */

/**
 * `hr` is the last resort (owner, 24 Nov 2026: nobody is ever "No appraiser"):
 * no manager and no head anywhere up their department tree, so HR looks after
 * it. The API does not keep that fallback yet (it answers `null` there), so the
 * screen says which it used and never presents it as a choice anybody made.
 */
export type DefaultSource = "manager" | "department-head" | "hr" | "none";

export type DefaultAppraiser = {
  source: DefaultSource;
  /** The appraiser's id, when there is one. */
  id: string | null;
  name: string | null;
};

type Person = {
  id: string;
  fullName: string;
  managerId: string | null;
  departmentId: string | null;
};

/** The appraiser the reporting line gives somebody. */
/** The nearest head of a department, looking up the tree when it has none. */
export function inheritedHeadOf(
  departmentId: string | null | undefined,
  heads: ReadonlyMap<string, string | null>,
  parents: ReadonlyMap<string, string | null>,
  not: string,
): string | null {
  const seen = new Set<string>();
  let at = departmentId ?? null;
  while (at && !seen.has(at)) {
    seen.add(at);
    const head = heads.get(at);
    if (head && head !== not) return head;
    at = parents.get(at) ?? null;
  }
  return null;
}

export function defaultAppraiserOf(
  person: Pick<Person, "id" | "managerId" | "departmentId">,
  names: ReadonlyMap<string, string>,
  heads: ReadonlyMap<string, string | null>,
  parents: ReadonlyMap<string, string | null> = new Map(),
): DefaultAppraiser {
  if (person.managerId && person.managerId !== person.id) {
    return {
      source: "manager",
      id: person.managerId,
      name: names.get(person.managerId) ?? null,
    };
  }
  const head = inheritedHeadOf(person.departmentId, heads, parents, person.id);
  if (head) {
    return {
      source: "department-head",
      id: head,
      name: names.get(head) ?? null,
    };
  }
  return { source: "hr", id: null, name: null };
}

/** One row of the "All appraisal periods" view. */
export type StandingRow = {
  employeeId: string;
  employeeName: string;
  jobTitle: string;
  department: string | null;
  appraiser: DefaultAppraiser;
};

/** Everybody on the staff list with their default appraiser, by name. */
export function standingRows(
  people: readonly (Person & {
    jobTitle: string;
    department?: string | null;
  })[],
  departments: readonly {
    id: string;
    headId: string | null;
    parentId?: string | null;
  }[],
): StandingRow[] {
  const names = new Map(people.map((person) => [person.id, person.fullName]));
  const heads = new Map(
    departments.map((department) => [department.id, department.headId]),
  );
  const parents = new Map(
    departments.map((department) => [
      department.id,
      department.parentId ?? null,
    ]),
  );
  return people
    .map((person) => ({
      employeeId: person.id,
      employeeName: person.fullName,
      jobTitle: person.jobTitle,
      department: person.department ?? null,
      appraiser: defaultAppraiserOf(person, names, heads, parents),
    }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

/** The words for a default appraiser on a row. */
export function defaultWords(appraiser: DefaultAppraiser): string {
  if (appraiser.source === "hr" || appraiser.source === "none")
    return "HR (no manager or department head is recorded)";
  const name = appraiser.name ?? "Somebody no longer listed";
  return appraiser.source === "manager"
    ? `${name}, their line manager`
    : `${name}, head of their department (no manager recorded)`;
}

/**
 * On a period that has not started, the appraiser its start will give a
 * person nobody is mapped to yet: the row's own line manager, else their
 * department's head. Null on a period that has started, where an unmapped
 * person really has no appraiser and no form.
 */
export function draftDefaultOf(
  row: Pick<
    ApiAppraiserMapRow,
    | "appraisers"
    | "lineManagerId"
    | "lineManagerName"
    | "departmentId"
    | "employeeId"
  >,
  stage: ReviewCycleStage | undefined,
  heads: ReadonlyMap<string, { id: string; name: string } | null>,
  parents: ReadonlyMap<string, string | null> = new Map(),
): DefaultAppraiser | null {
  if (stage !== "DRAFT" || row.appraisers.length > 0) return null;
  if (row.lineManagerId && row.lineManagerId !== row.employeeId) {
    return {
      source: "manager",
      id: row.lineManagerId,
      name: row.lineManagerName,
    };
  }
  const seen = new Set<string>();
  let at = row.departmentId ?? null;
  while (at && !seen.has(at)) {
    seen.add(at);
    const head = heads.get(at);
    if (head && head.id !== row.employeeId) {
      return { source: "department-head", id: head.id, name: head.name };
    }
    at = parents.get(at) ?? null;
  }
  return { source: "hr", id: null, name: null };
}

/**
 * A calm to-do, not an error (owner, 24 Nov 2026): people nobody above them is
 * recorded for are appraised by HR, and the one fix is a department head.
 */
export function hrFallbackLine(count: number): string | null {
  if (count === 0) return null;
  return count === 1
    ? "1 person has no manager or department head, so HR appraises them."
    : `${String(count)} people have no manager or department head, so HR appraises them.`;
}
