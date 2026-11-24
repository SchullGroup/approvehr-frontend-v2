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

export type DefaultSource = "manager" | "department-head" | "none";

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
export function defaultAppraiserOf(
  person: Pick<Person, "id" | "managerId" | "departmentId">,
  names: ReadonlyMap<string, string>,
  heads: ReadonlyMap<string, string | null>,
): DefaultAppraiser {
  if (person.managerId && person.managerId !== person.id) {
    return {
      source: "manager",
      id: person.managerId,
      name: names.get(person.managerId) ?? null,
    };
  }
  const head = person.departmentId ? heads.get(person.departmentId) : null;
  if (head && head !== person.id) {
    return {
      source: "department-head",
      id: head,
      name: names.get(head) ?? null,
    };
  }
  return { source: "none", id: null, name: null };
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
  departments: readonly { id: string; headId: string | null }[],
): StandingRow[] {
  const names = new Map(people.map((person) => [person.id, person.fullName]));
  const heads = new Map(
    departments.map((department) => [department.id, department.headId]),
  );
  return people
    .map((person) => ({
      employeeId: person.id,
      employeeName: person.fullName,
      jobTitle: person.jobTitle,
      department: person.department ?? null,
      appraiser: defaultAppraiserOf(person, names, heads),
    }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

/** The words for a default appraiser on a row. */
export function defaultWords(appraiser: DefaultAppraiser): string {
  if (appraiser.source === "none") return "No appraiser";
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
): DefaultAppraiser | null {
  if (stage !== "DRAFT" || row.appraisers.length > 0) return null;
  if (row.lineManagerId && row.lineManagerId !== row.employeeId) {
    return {
      source: "manager",
      id: row.lineManagerId,
      name: row.lineManagerName,
    };
  }
  const head = row.departmentId ? heads.get(row.departmentId) : null;
  if (head && head.id !== row.employeeId) {
    return { source: "department-head", id: head.id, name: head.name };
  }
  return { source: "none", id: null, name: null };
}

/** "Ada Eze, Musa Bello and 3 others": who has no appraiser, in a line. */
export function withoutLine(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  const shown = names.slice(0, 8);
  const rest = names.length - shown.length;
  const list =
    rest > 0
      ? `${shown.join(", ")} and ${String(rest)} ${rest === 1 ? "other" : "others"}`
      : shown.length === 1
        ? shown[0]
        : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1] as string}`;
  return names.length === 1
    ? `1 person has no appraiser: ${list}.`
    : `${String(names.length)} people have no appraiser: ${list}.`;
}
