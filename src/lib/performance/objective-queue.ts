import {
  formatMeasure,
  isDoneMeasure,
  quarterLabel,
  type ApiGoal,
} from "@/lib/api/performance";
import {
  COMPANY_KEY,
  NO_DEPARTMENT_KEY,
  departmentKeyOf,
  type OwnerDepartments,
} from "./objectives-by-department";

/**
 * "Objectives to agree", as decisions about data (owner request, 24 Nov 2026:
 * "redo this page to work like the My approvals inbox").
 *
 * The queue is narrowed, searched and grouped in the browser: the API returns
 * the whole of this caller's queue in one page, and a filter that asked it again
 * would leave the counts describing something else.
 */

export type ObjectiveLevelFilter = "" | "company" | "department" | "personal";
export type QueueGrouping = "" | "department" | "person";

export type QueueFilters = {
  search: string;
  /** An owner's employee id, or "". */
  person: string;
  /** A department id, `company`, `none`, or "". */
  department: string;
  /** A review cycle id, a `quarter:2026-Q4`, or "". */
  period: string;
  level: ObjectiveLevelFilter;
  group: QueueGrouping;
};

export const NO_FILTERS: QueueFilters = {
  search: "",
  person: "",
  department: "",
  period: "",
  level: "",
  group: "",
};

/** The one word a person reads for where an objective is (owner, 24 Nov). */
export function approvalWords(
  goal: Pick<ApiGoal, "approval" | "approvalLabel">,
): string {
  /* The API calls it "Sent back". The owner's word is Declined, and it is the
     one the queue's button says. */
  if (goal.approval === "NEEDS_REVISION") return "Declined";
  return goal.approvalLabel;
}

/** The period an objective is agreed for, as a key and a name. */
export function periodOf(
  goal: Pick<ApiGoal, "reviewCycleId" | "reviewCycleName" | "dueQuarter">,
): { key: string; name: string } {
  if (goal.reviewCycleId) {
    return {
      key: goal.reviewCycleId,
      name: goal.reviewCycleName ?? "An appraisal period",
    };
  }
  return {
    key: `quarter:${goal.dueQuarter ?? "none"}`,
    name: quarterLabel(goal.dueQuarter),
  };
}

/** Whose it is, in a few words: a person, a department, or the company. */
export function whoseWords(
  goal: Pick<ApiGoal, "level" | "ownerName" | "departmentName">,
): string {
  if (goal.level === "company") return "The company";
  if (goal.level === "department") {
    return goal.departmentName
      ? `${goal.departmentName}, the department`
      : "A department";
  }
  return goal.ownerName ?? "Somebody";
}

/**
 * The target on one line: the first one, and how many more.
 *
 * A done-or-not target has no range, and "0 to 1" would read as a figure
 * somebody chose.
 */
export function targetLine(goal: Pick<ApiGoal, "keyResults">): string {
  const [first, ...rest] = goal.keyResults;
  if (!first) return "No target";
  const what = isDoneMeasure(first)
    ? `${first.label}, done or not done`
    : `${first.label}: ${formatMeasure(first.startValue, first.unit)} to ${formatMeasure(first.targetValue, first.unit)}`;
  return rest.length === 0 ? what : `${what}, and ${String(rest.length)} more`;
}

/** The choices each filter offers, taken from the queue itself. */
export function queueOptions(
  goals: readonly ApiGoal[],
  owners: OwnerDepartments,
  departments: readonly { id: string; name: string }[],
): {
  people: [string, string][];
  departments: [string, string][];
  periods: [string, string][];
  levels: ObjectiveLevelFilter[];
} {
  const people = new Map<string, string>();
  const depts = new Map<string, string>();
  const periods = new Map<string, string>();
  const levels = new Set<ObjectiveLevelFilter>();
  const named = new Map(departments.map((one) => [one.id, one.name]));
  for (const goal of goals) {
    if (goal.ownerId && goal.ownerName)
      people.set(goal.ownerId, goal.ownerName);
    const key = departmentKeyOf(goal, owners);
    depts.set(
      key,
      key === COMPANY_KEY
        ? "The company"
        : key === NO_DEPARTMENT_KEY
          ? "No department"
          : (named.get(key) ??
            goal.departmentName ??
            "A department no longer listed"),
    );
    const period = periodOf(goal);
    periods.set(period.key, period.name);
    levels.add(goal.level);
  }
  const byName = (a: [string, string], b: [string, string]) =>
    a[1].localeCompare(b[1]);
  return {
    people: [...people].sort(byName),
    departments: [...depts].sort(byName),
    periods: [...periods].sort(byName),
    levels: (["company", "department", "personal"] as const).filter((one) =>
      levels.has(one),
    ),
  };
}

/** The queue as narrowed by the filters. Grouping is separate. */
export function filterQueue(
  goals: readonly ApiGoal[],
  filters: QueueFilters,
  owners: OwnerDepartments,
): ApiGoal[] {
  const term = filters.search.trim().toLowerCase();
  return goals.filter((goal) => {
    if (
      term !== "" &&
      !goal.title.toLowerCase().includes(term) &&
      !(goal.description ?? "").toLowerCase().includes(term) &&
      !(goal.ownerName ?? "").toLowerCase().includes(term) &&
      !(goal.departmentName ?? "").toLowerCase().includes(term)
    ) {
      return false;
    }
    if (filters.person !== "" && goal.ownerId !== filters.person) return false;
    if (
      filters.department !== "" &&
      departmentKeyOf(goal, owners) !== filters.department
    ) {
      return false;
    }
    if (filters.period !== "" && periodOf(goal).key !== filters.period) {
      return false;
    }
    if (filters.level !== "" && goal.level !== filters.level) return false;
    return true;
  });
}

export function narrowing(filters: QueueFilters): boolean {
  return (
    filters.search.trim() !== "" ||
    filters.person !== "" ||
    filters.department !== "" ||
    filters.period !== "" ||
    filters.level !== ""
  );
}

export type QueueGroup = { key: string; name: string; goals: ApiGoal[] };

/**
 * The queue in groups, in the order the groups first appear (the queue is
 * oldest first, so the group with the longest wait leads).
 */
export function groupQueue(
  goals: readonly ApiGoal[],
  grouping: QueueGrouping,
  owners: OwnerDepartments,
  departmentNames: ReadonlyMap<string, string>,
): QueueGroup[] {
  if (grouping === "") return [{ key: "all", name: "", goals: [...goals] }];
  const groups = new Map<string, QueueGroup>();
  for (const goal of goals) {
    let key: string;
    let name: string;
    if (grouping === "person") {
      key = goal.ownerId ?? `whole:${goal.departmentId ?? "company"}`;
      name = goal.ownerName ?? whoseWords(goal);
    } else {
      key = departmentKeyOf(goal, owners);
      name =
        key === COMPANY_KEY
          ? "The company"
          : key === NO_DEPARTMENT_KEY
            ? "No department"
            : (departmentNames.get(key) ??
              goal.departmentName ??
              "A department no longer listed");
    }
    const group = groups.get(key) ?? { key, name, goals: [] };
    group.goals.push(goal);
    groups.set(key, group);
  }
  return [...groups.values()];
}
