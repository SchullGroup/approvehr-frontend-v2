import type { ApiGoal } from "@/lib/api/performance";

/**
 * The whole company's objectives, one card per department (owner request, 24
 * Nov 2026).
 *
 * "Whole company" listed every objective up front: seventy cards for a
 * company of seventy people. It now opens on one card per department with how
 * many objectives it has, and a card opens that department's list.
 *
 * ## Which department an objective belongs to
 *
 * A department objective names its department (`departmentId`). A personal
 * objective usually does not: the API sets `departmentId` only on a
 * department's shared target, so a personal one belongs to the department its
 * **owner** is in, read from the staff list. A company objective (nobody's,
 * no department) has its own card. An objective whose department cannot be
 * told (no department, or an owner the staff list does not have) is under
 * "No department", so every objective is on exactly one card.
 *
 * Nothing here is counted on the server's behalf beyond that: a card's figure
 * is how many of the objectives already on the page are this department's.
 */

/** The card for the company's own objectives. */
export const COMPANY_KEY = "company";
/** The card for objectives with no department. */
export const NO_DEPARTMENT_KEY = "none";

export type DepartmentCard = {
  /** `company`, `none`, or a department's id: what `?department=` carries. */
  key: string;
  name: string;
  count: number;
  /** At risk or off track, among the ones not done. */
  attention: number;
};

/** What the staff list says about each person: their department's id, or null. */
export type OwnerDepartments = ReadonlyMap<string, string | null | undefined>;

/** The card an objective is on. */
export function departmentKeyOf(
  goal: Pick<ApiGoal, "level" | "departmentId" | "ownerId">,
  owners: OwnerDepartments,
): string {
  if (goal.level === "company") return COMPANY_KEY;
  if (goal.departmentId) return goal.departmentId;
  const owned = goal.ownerId ? owners.get(goal.ownerId) : null;
  return owned ?? NO_DEPARTMENT_KEY;
}

const behind = (goal: Pick<ApiGoal, "status">) =>
  goal.status === "AT_RISK" || goal.status === "OFF_TRACK";

/**
 * The cards: the company's own first, then every department by name (one with
 * no objectives says so rather than being left out), then "No department" when
 * anything is on it.
 */
export function departmentCards(
  goals: readonly ApiGoal[],
  departments: readonly { id: string; name: string }[],
  owners: OwnerDepartments,
): DepartmentCard[] {
  const tally = new Map<string, { count: number; attention: number }>();
  for (const goal of goals) {
    const key = departmentKeyOf(goal, owners);
    const seen = tally.get(key) ?? { count: 0, attention: 0 };
    seen.count += 1;
    if (behind(goal)) seen.attention += 1;
    tally.set(key, seen);
  }
  const of = (key: string) => tally.get(key) ?? { count: 0, attention: 0 };

  /* A department the list does not carry (archived since, say) keeps its
     objectives on a card under the name they were filed with. */
  const named = new Map(departments.map((one) => [one.id, one.name]));
  for (const goal of goals) {
    if (
      goal.departmentId &&
      goal.departmentName &&
      !named.has(goal.departmentId)
    ) {
      named.set(goal.departmentId, goal.departmentName);
    }
  }
  for (const key of tally.keys()) {
    if (key !== COMPANY_KEY && key !== NO_DEPARTMENT_KEY && !named.has(key)) {
      named.set(key, "A department no longer listed");
    }
  }

  /* Always the first card, even with nothing on it: it is where a company
     objective is written, and with none it says so (owner, 24 Nov 2026). It is
     not counted inside any department's number. */
  const cards: DepartmentCard[] = [
    { key: COMPANY_KEY, name: "Whole company", ...of(COMPANY_KEY) },
  ];
  for (const [id, name] of [...named].sort((a, b) =>
    a[1].localeCompare(b[1]),
  )) {
    cards.push({ key: id, name, ...of(id) });
  }
  if (tally.has(NO_DEPARTMENT_KEY)) {
    cards.push({
      key: NO_DEPARTMENT_KEY,
      name: "No department",
      ...of(NO_DEPARTMENT_KEY),
    });
  }
  return cards;
}

/**
 * One card's objectives, with the objectives they sit under, so the list
 * groups under the company objective as the whole list did. The ones added
 * for that are context, and only the card's own are counted on it.
 */
export function goalsForDepartment(
  goals: readonly ApiGoal[],
  key: string,
  owners: OwnerDepartments,
): ApiGoal[] {
  const own = goals.filter((goal) => departmentKeyOf(goal, owners) === key);
  if (key === COMPANY_KEY) return own;
  const byId = new Map(goals.map((goal) => [goal.id, goal]));
  const kept = new Set(own.map((goal) => goal.id));
  for (const goal of own) {
    let parent = goal.parentId ? byId.get(goal.parentId) : undefined;
    while (parent && !kept.has(parent.id)) {
      kept.add(parent.id);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
  }
  return goals.filter((goal) => kept.has(goal.id));
}

/** The name on a card's own page. */
export function departmentName(
  cards: readonly DepartmentCard[],
  key: string,
): string | null {
  return cards.find((card) => card.key === key)?.name ?? null;
}
