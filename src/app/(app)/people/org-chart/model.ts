import type {
  ApiDepartment,
  ApiOrgChart,
  ApiOrgNode,
} from "@/lib/api/endpoints";

/**
 * The org chart's data, rearranged around departments.
 *
 * ## Why the department is the spine and the reporting line is the detail
 *
 * The first version of this screen was the reporting line and nothing else,
 * which is the shape every org chart in every product has. On the demo company
 * it rendered a flat alphabetical list of 27 people under the heading
 * **"At the top — 27 — nobody above them"**, because nobody had a manager set.
 * That is not a broken chart; it is an honest chart of a company that has not
 * filled in `managerId`, and it is useless — which is the same thing from the
 * reader's side.
 *
 * Departments, meanwhile, almost always exist: they come out of the setup
 * wizard, the importer maps them, and payroll reports by them. So the
 * department tree is the structure this screen draws, and who reports to whom
 * is a line of detail on each person. A company that has filled in both gets
 * both; a company that has filled in only one still gets a chart.
 *
 * ## One request each, and no request per department
 *
 * `GET /employees/org-chart` already carries every person with their
 * department **name** on them, so grouping happens here rather than through a
 * `GET /departments/:id` per node — which on a company with thirty departments
 * would be thirty requests to draw one screen. Names are safe to group on:
 * `@@unique([organizationId, name])` on `Department` makes them unique per
 * company.
 *
 * ## No salary reaches this file
 *
 * The org-chart payload carries none at any permission, deliberately — the rule
 * `walk-payroll` left behind is *gate the money, not the tree*. The department
 * payload does carry `payrollKobo`, gated on `VIEW_SALARIES` and **null** for
 * anybody who may not see it. Null is rendered as an absence and never as
 * `₦0.00`, which would say a department costs nothing.
 */

export type ChartPerson = {
  id: string;
  employeeNo: string;
  name: string;
  jobTitle: string;
  department: string | null;
  workLocation: string | null;
  status: string;
  /** Their manager's name, or null when nobody is above them. */
  managerName: string | null;
  /** Everybody below them at any depth. 0 for most people. */
  totalBelow: number;
};

export type ChartNode = {
  department: ApiDepartment;
  /** People whose own department is this one. Not including sub-departments. */
  people: ChartPerson[];
  children: ChartNode[];
};

export type ChartModel = {
  roots: ChartNode[];
  /** People with no department at all. A real state, and usually a large one. */
  unplaced: ChartPerson[];
  /** Archived departments, kept out of the tree and offered separately. */
  hidden: ApiDepartment[];
  /** Every department, flat, for the "move to" pickers. */
  flat: ApiDepartment[];
  people: number;
  withoutManager: number;
};

/**
 * Everybody in the reporting tree, flattened, with their manager's name.
 *
 * The tree is the only place the reporting line exists on this payload — there
 * is no `managerId` field — so the name is taken on the way down rather than
 * looked up afterwards.
 */
export function flattenPeople(chart: ApiOrgChart): ChartPerson[] {
  const out: ChartPerson[] = [];
  const walk = (node: ApiOrgNode, managerName: string | null) => {
    out.push({
      id: node.id,
      employeeNo: node.employeeNo,
      name: node.name,
      jobTitle: node.jobTitle,
      department: node.department,
      workLocation: node.workLocation,
      status: node.status,
      managerName,
      totalBelow: node.totalBelow,
    });
    for (const report of node.reports) walk(report, node.name);
  };
  for (const root of chart.roots) walk(root, null);
  return out;
}

/** Alphabetical, but a department's head first — they are the answer to "who runs this". */
function order(people: ChartPerson[], headName: string | null): ChartPerson[] {
  return [...people].sort((a, b) => {
    if (headName !== null) {
      if (a.name === headName) return -1;
      if (b.name === headName) return 1;
    }
    return a.name.localeCompare(b.name);
  });
}

export function buildModel(
  chart: ApiOrgChart,
  tree: ApiDepartment[],
  flat: ApiDepartment[],
): ChartModel {
  const people = flattenPeople(chart);

  const byDepartment = new Map<string, ChartPerson[]>();
  const unplaced: ChartPerson[] = [];
  for (const person of people) {
    if (person.department === null) {
      unplaced.push(person);
      continue;
    }
    const bucket = byDepartment.get(person.department) ?? [];
    bucket.push(person);
    byDepartment.set(person.department, bucket);
  }

  const toNode = (department: ApiDepartment): ChartNode => ({
    department,
    people: order(byDepartment.get(department.name) ?? [], department.headName),
    children: department.children
      .filter((child) => !child.archived)
      .map(toNode),
  });

  return {
    roots: tree.filter((department) => !department.archived).map(toNode),
    unplaced: order(unplaced, null),
    /* Flat rather than nested: an archived parent's archived children would
       otherwise be a tree nobody can see the top of, and the only act offered
       here is "show it again". */
    hidden: flat.filter((department) => department.archived),
    flat: flat.filter((department) => !department.archived),
    people: people.length,
    withoutManager: people.filter((person) => person.managerName === null)
      .length,
  };
}

/**
 * A department and everything under it, pruned to what matches.
 *
 * A department is kept when its own name matches **or** anybody in it does, so
 * searching a person's name shows the department they sit in rather than a
 * person floating with no context — which is the whole reason this screen is
 * arranged by department.
 */
export function pruneNode(node: ChartNode, needle: string): ChartNode | null {
  const hit = (text: string) => text.toLowerCase().includes(needle);
  const kept = node.children
    .map((child) => pruneNode(child, needle))
    .filter((child): child is ChartNode => child !== null);

  const matchedPeople = node.people.filter(
    (person) =>
      hit(person.name) ||
      hit(person.jobTitle) ||
      hit(person.employeeNo) ||
      (person.workLocation !== null && hit(person.workLocation)),
  );

  const departmentMatches = hit(node.department.name);
  if (!departmentMatches && matchedPeople.length === 0 && kept.length === 0) {
    return null;
  }

  return {
    department: node.department,
    /* A department matched by its own name keeps everybody in it: somebody
       searching "Finance" wants the Finance department, not an empty heading. */
    people: departmentMatches ? node.people : matchedPeople,
    children: kept,
  };
}

/** `0` is a department, `1+` a sub-department. The word people read, not the number. */
export function depthLabel(depth: number): string {
  return depth === 0 ? "Department" : "Sub-department";
}

/** Every id in this node's subtree, including its own. */
export function subtreeIds(node: ChartNode): Set<string> {
  const ids = new Set<string>([node.department.id]);
  const walk = (current: ChartNode) => {
    for (const child of current.children) {
      ids.add(child.department.id);
      walk(child);
    }
  };
  walk(node);
  return ids;
}
