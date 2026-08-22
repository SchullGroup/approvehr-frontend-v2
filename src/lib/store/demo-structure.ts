"use client";

import { useSyncExternalStore } from "react";
import { ApiError } from "@/lib/api/client";
import type { ApiDepartment, ApiDepartmentDetail } from "@/lib/api/endpoints";
import { koboFromDecimal } from "@/lib/api/payroll";
import type {
  ApiMoved,
  ApiTeam,
  ApiTeamDetail,
  ApiTeamList,
  ApiTeamMember,
} from "@/lib/api/teams";
import type { Employee } from "@/lib/types";
import { createPersistedState } from "./persisted";

/**
 * The org structure the demo actually owns: departments, teams and membership.
 *
 * ## This file exists because the old answer was "no"
 *
 * `store/departments.ts` used to refuse every write with no API, and
 * `store/teams.ts` refused outright, both on the same argument: a department is
 * a payroll reporting boundary, so a tree built in browser storage would never
 * reach a real payroll and building one would teach the wrong model.
 *
 * The argument is true and it was the wrong conclusion, for one reason: **it
 * applies to every demo write there is.** A demo leave approval never reaches a
 * real balance; a demo employee never reaches a real payslip; a demo rota never
 * prorates a real run. Those all write locally, say so on screen, and are the
 * product being demonstrated. Departments was the outlier — and demo mode is the
 * mode everybody opens first, so the feature read as missing rather than as
 * deliberately withheld.
 *
 * So the warning stays and the refusal goes. `DEMO_STRUCTURE_NOTE` is the
 * warning, written once here so the two surfaces that show it cannot drift, and
 * it says the one thing that is actually true: structure kept in this browser
 * does not reach a real payroll.
 *
 * ## Membership is `Employee.department`, not a second table
 *
 * Connected, a person's department is `Employee.departmentId` — one column, and
 * every payroll report reads it. Offline, `Employee` carries the department
 * **name** and nothing else (`lib/types.ts`), and that name is what the
 * directory, the record page, the payslip header and `/reports` all render.
 *
 * So the demo does not keep its own membership map. Who is in a department is
 * the name on the person, and this store holds only the *structure*: the nodes,
 * their nesting, their heads and their cost centres. Headcount and payroll are
 * derived from the live employee store on every read.
 *
 * That is the `runPeopleFrom` lesson in `HANDOVER.md` one module along: a second
 * copy of "who is in Engineering" is a second answer, and the demo would then
 * disagree with its own directory about a cost centre. One consequence to keep
 * in mind when reading the writes below — **renaming a department rewrites the
 * name on everybody in it**, because in this mode the name is the pointer.
 * Connected, a rename moves nobody; the id does not change.
 *
 * ## Shape
 *
 * `lib/store/shifts.ts` is the model for all of it: one `createPersistedState`,
 * pure derivations from state to the wire shapes the screens already render, and
 * `refuse()` throwing the same `ApiError` the API would so a screen renders one
 * message either way. The refusals below are the API's own, sentence for
 * sentence, from `approvehr-api/src/modules/{departments,teams}/service.ts`.
 */

/* --------------------------------------------------------------- the notice */

/**
 * What demo structure is, and the one thing it cannot do.
 *
 * Rendered by `/people/departments` on both tabs. Written once because the two
 * tabs are two surfaces onto the same local data and a warning that reads
 * differently in two places reads as two different warnings.
 */
export const DEMO_STRUCTURE_NOTE =
  "Departments, teams and who is in them are stored in this browser so the " +
  "product can be shown without a database. Everything here behaves the way " +
  "the real thing does, including moving somebody's department when you put " +
  "them on a departmental team. What it cannot do is reach a payroll run: a " +
  "run reads the database, so a cost centre built here will never appear on a " +
  "payslip or a department payroll report. Connected, this screen writes to the " +
  "one table every report reads.";

/* ---------------------------------------------------------------- the state */

export type DemoDepartmentRow = {
  id: string;
  name: string;
  parentId: string | null;
  costCentre: string | null;
  headId: string | null;
  archived: boolean;
};

export type DemoTeamRow = {
  id: string;
  name: string;
  purpose: string | null;
  departmentId: string | null;
  leadId: string | null;
  archived: boolean;
};

export type DemoTeamMemberRow = {
  membershipId: string;
  teamId: string;
  employeeId: string;
  roleLabel: string | null;
  /** ISO instant. Fixed in the seed, like every other date in the demo data. */
  joinedAt: string;
};

export type DemoStructure = {
  departments: DemoDepartmentRow[];
  teams: DemoTeamRow[];
  members: DemoTeamMemberRow[];
};

/**
 * The seed.
 *
 * The five departments are the distinct department names on the seed employees,
 * which is what the old read-only demo derived and what every seeded person's
 * record already says — so nothing moves on first load. Heads are the three
 * people whose seeded job title is the head of that function; People and Product
 * are left headless rather than promoting somebody to make a row look full.
 *
 * The two teams are seeded because an empty Teams tab demonstrates nothing.
 * Platform is departmental and every member is already in Engineering, so the
 * rule holds at rest and `departmentMismatch` is false everywhere — which is
 * what it should be, and it is worth the demo starting from a consistent state
 * rather than from the contradiction. The go-live team is cross-functional, so
 * membership implies nothing about anybody's pay, and Chidi Nwosu is on both so
 * `peopleOnATeam` counts a person once rather than twice.
 */
const DEMO_SEED: DemoStructure = {
  departments: [
    {
      id: "dept-engineering",
      name: "Engineering",
      parentId: null,
      costCentre: "CC-ENG",
      headId: "p-01",
      archived: false,
    },
    {
      id: "dept-finance",
      name: "Finance",
      parentId: null,
      costCentre: "CC-FIN",
      headId: "p-02",
      archived: false,
    },
    {
      id: "dept-operations",
      name: "Operations",
      parentId: null,
      costCentre: "CC-OPS",
      headId: "p-10",
      archived: false,
    },
    {
      id: "dept-people",
      name: "People",
      parentId: null,
      costCentre: "CC-PPL",
      headId: null,
      archived: false,
    },
    {
      id: "dept-product",
      name: "Product",
      parentId: null,
      costCentre: "CC-PRD",
      headId: null,
      archived: false,
    },
  ],
  teams: [
    {
      id: "team-platform",
      name: "Platform",
      purpose: "Keeps the deployment pipeline and the shared services",
      departmentId: "dept-engineering",
      leadId: "p-01",
      archived: false,
    },
    {
      id: "team-payroll-go-live",
      name: "Payroll go-live",
      purpose: "Getting the first live payroll out",
      departmentId: null,
      leadId: "p-02",
      archived: false,
    },
  ],
  members: [
    {
      membershipId: "tm-01",
      teamId: "team-platform",
      employeeId: "p-01",
      roleLabel: "Lead",
      joinedAt: "2026-02-02T09:00:00.000Z",
    },
    {
      membershipId: "tm-02",
      teamId: "team-platform",
      employeeId: "p-03",
      roleLabel: null,
      joinedAt: "2026-02-02T09:00:00.000Z",
    },
    {
      membershipId: "tm-03",
      teamId: "team-platform",
      employeeId: "p-09",
      roleLabel: null,
      joinedAt: "2026-04-13T09:00:00.000Z",
    },
    {
      membershipId: "tm-04",
      teamId: "team-payroll-go-live",
      employeeId: "p-02",
      roleLabel: "Sponsor",
      joinedAt: "2026-06-01T09:00:00.000Z",
    },
    {
      membershipId: "tm-05",
      teamId: "team-payroll-go-live",
      employeeId: "p-08",
      roleLabel: null,
      joinedAt: "2026-06-01T09:00:00.000Z",
    },
    {
      membershipId: "tm-06",
      teamId: "team-payroll-go-live",
      employeeId: "p-05",
      roleLabel: null,
      joinedAt: "2026-06-08T09:00:00.000Z",
    },
    {
      membershipId: "tm-07",
      teamId: "team-payroll-go-live",
      employeeId: "p-03",
      roleLabel: null,
      joinedAt: "2026-06-15T09:00:00.000Z",
    },
  ],
};

export const demoStructure = createPersistedState<DemoStructure>({
  key: "approvehr.structure.store",
  empty: DEMO_SEED,
  version: 1,
});

/** Subscribes a component to the demo structure. Safe on the server. */
export function useDemoStructure(): DemoStructure {
  return useSyncExternalStore(
    demoStructure.subscribe,
    demoStructure.read,
    demoStructure.getServerSnapshot,
  );
}

let counter = 0;
/** Ids that read as demo ids, so a link pasted into a connected session is caught. */
export function demoStructureId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

/**
 * Same shape the API refuses with, so a screen renders one message either way.
 *
 * A `function` declaration rather than a `const` arrow, deliberately: only a
 * function declaration returning `never` narrows the code after the call, and
 * the callers rely on it — `if (!row) refuse(...)` has to leave `row` non-null
 * on the next line.
 */
export function refuse(status: number, code: string, message: string): never {
  throw new ApiError(status, code, message);
}

/* ------------------------------------------------------------- the people */

/**
 * A person, as the structure derivations need them.
 *
 * Built from the **live** employee store rather than the `EMPLOYEES` seed, for
 * the reason `shifts.ts` gives at length: the seed is a snapshot and the store
 * is what `/people/new` writes to, so reading the seed would let somebody create
 * a person, assign them a department, and watch the headcount not move.
 */
export type StructurePerson = {
  id: string;
  name: string;
  jobTitle: string;
  /** The department **name**, which is the whole of membership in this mode. */
  department: string;
  grossMonthlyKobo: number;
};

/**
 * What is written when nobody has assigned a department.
 *
 * `"—"` is what `toEmployee` in `lib/api/endpoints.ts` renders for a connected
 * employee with no department, because most screens print the field straight
 * into a table cell. The demo writes the same placeholder, so one string means
 * "unassigned" in both modes.
 */
export const NO_DEPARTMENT = "—";

/**
 * Every value that has meant "nobody assigned one".
 *
 * Three, not one, and only one of them is written any more. `""` and
 * `"Unassigned"` are both in stored payloads: the new-starter wizard wrote the
 * literal `"Unassigned"` for a person created with no department picked, which
 * put "Now in Unassigned" in the assign dialog and read as a department somebody
 * had named. It writes `NO_DEPARTMENT` now, and these stay so an existing demo
 * browser still counts its own people correctly.
 */
const UNASSIGNED = new Set(["", NO_DEPARTMENT, "Unassigned"]);

/** Is this person in no department? The one place that question is answered. */
export function isUnassigned(department: string | null | undefined): boolean {
  return department === null || department === undefined
    ? true
    : UNASSIGNED.has(department.trim());
}

/**
 * A department id, resolved to the name the local employee store stores.
 *
 * The seam for the one demo write that arrives as an id rather than a name:
 * `useEmployeeMutations().update` is handed `departmentId` by the record page's
 * picker, and the local store holds `Employee.department` as a display name. It
 * used to drop the id, so the picker looked saved and changed nothing.
 *
 * Reads the store directly rather than taking state, because the caller is a
 * mutation and needs the value as it is now, not as it was at last render.
 * Refuses an id no live department answers to, the same way the API does, rather
 * than falling back to "unassigned" — quietly clearing somebody's cost centre
 * because a picker sent something unexpected is the worse failure.
 */
export function demoDepartmentName(id: string): string {
  if (id.trim() === "") return NO_DEPARTMENT;
  const row = demoStructure
    .read()
    .departments.find((one) => one.id === id && !one.archived);
  if (!row) refuse(422, "unprocessable", "That department does not exist.");
  return row.name;
}

export function structurePeople(
  directory: readonly Employee[],
): StructurePerson[] {
  return directory.map((person) => ({
    id: person.id,
    name: `${person.firstName} ${person.lastName}`,
    jobTitle: person.jobTitle,
    department: person.department,
    /* Kobo through the decimal seam rather than `* 100`: `grossMonthly` is a
       naira number and a float multiply is how a rounding error gets into a
       total that a department payroll report then shows. */
    grossMonthlyKobo: koboFromDecimal(person.grossMonthly),
  }));
}

/* --------------------------------------------------------- reading the tree */

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

/** Case-insensitive, because in this mode the name is the identity. */
export const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The tree, in the wire shape, with the same roll-up the API does.
 *
 * `includeArchived` mirrors `GET /departments`: the counts are computed over the
 * rows returned, quirk included, so the two modes agree about what the endpoint
 * means rather than about what the screen wants.
 */
export function demoTree(
  state: DemoStructure,
  people: readonly StructurePerson[],
  includeArchived: boolean,
): {
  tree: ApiDepartment[];
  flat: Omit<ApiDepartment, "children">[];
  counts: { departments: number; teams: number; unassignedEmployees: number };
} {
  const rows = [...state.departments]
    .filter((row) => includeArchived || !row.archived)
    .sort(byName);

  const nameOf = (id: string | null): string | null =>
    people.find((person) => person.id === id)?.name ?? null;

  const nodes = new Map<string, ApiDepartment>();
  for (const row of rows) {
    const direct = people.filter((person) => sameName(person.department, row.name));
    nodes.set(row.id, {
      id: row.id,
      name: row.name,
      parentId: row.parentId,
      costCentre: row.costCentre,
      headId: row.headId,
      headName: nameOf(row.headId),
      directEmployees: direct.length,
      totalEmployees: direct.length,
      /* Over every row, not the filtered set — `_count.children` on the API
         counts archived children too. */
      childCount: state.departments.filter((other) => other.parentId === row.id)
        .length,
      depth: 0,
      archived: row.archived,
      payrollKobo: direct.reduce(
        (sum, person) => sum + person.grossMonthlyKobo,
        0,
      ),
      children: [],
    });
  }

  const roots: ApiDepartment[] = [];
  for (const row of rows) {
    const node = nodes.get(row.id);
    if (!node) continue;
    const parent = row.parentId ? nodes.get(row.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  /* Depth and roll-up in one post-order walk, the same as the service. */
  const settle = (node: ApiDepartment, depth: number): void => {
    node.depth = depth;
    for (const child of node.children) {
      settle(child, depth + 1);
      node.totalEmployees += child.totalEmployees;
      node.payrollKobo += child.payrollKobo;
    }
    node.children.sort(byName);
  };
  for (const root of roots) settle(root, 0);
  roots.sort(byName);

  /* Unassigned is the placeholder, or a name no live department answers to.
     The second half cannot normally happen — a rename rewrites the people and
     archiving refuses while anybody is in it — and counting it is what makes
     that a fact on screen rather than an assumption. */
  const live = state.departments.filter((row) => !row.archived);
  const unassigned = people.filter(
    (person) =>
      isUnassigned(person.department) ||
      !live.some((row) => sameName(row.name, person.department)),
  ).length;

  return {
    tree: roots,
    flat: flatten(roots),
    counts: {
      departments: roots.length,
      teams: rows.length - roots.length,
      unassignedEmployees: unassigned,
    },
  };
}

function flatten(nodes: ApiDepartment[]): Omit<ApiDepartment, "children">[] {
  const out: Omit<ApiDepartment, "children">[] = [];
  const walk = (list: ApiDepartment[]) => {
    for (const node of list) {
      const { children, ...rest } = node;
      out.push(rest);
      walk(children);
    }
  };
  walk(nodes);
  return out;
}

/** One department in full, for the drawer. `GET /departments/:id`'s shape. */
export function demoDepartmentDetail(
  state: DemoStructure,
  people: readonly StructurePerson[],
  id: string,
): ApiDepartmentDetail | null {
  const { flat } = demoTree(state, people, true);
  const node = flat.find((row) => row.id === id);
  if (!node) return null;

  const ancestors: { id: string; name: string }[] = [];
  let cursor = node.parentId;
  for (let depth = 0; depth < 20 && cursor; depth += 1) {
    const parent = state.departments.find((row) => row.id === cursor);
    if (!parent) break;
    ancestors.unshift({ id: parent.id, name: parent.name });
    cursor = parent.parentId;
  }

  return {
    ...node,
    ancestors,
    employees: people
      .filter((person) => sameName(person.department, node.name))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((person) => ({
        id: person.id,
        name: person.name,
        jobTitle: person.jobTitle,
        grossMonthlyKobo: person.grossMonthlyKobo,
      })),
  };
}

/* -------------------------------------------------------- reading the teams */

/**
 * A membership only counts while the person is in the live directory.
 *
 * Connected, an archived employee keeps their `TeamMember` row and the API shows
 * it, because the employee row still exists to show. Offline the directory
 * excludes archived people entirely, so a row for one cannot be rendered — and
 * counting it anyway would put "3 members" on a list beside two names in the
 * drawer. The person is the record; the join is not. The row is left in storage
 * rather than deleted, so restoring the person restores their membership.
 */
function liveMembers(
  state: DemoStructure,
  people: readonly StructurePerson[],
  teamId: string,
): DemoTeamMemberRow[] {
  return state.members.filter(
    (member) =>
      member.teamId === teamId &&
      people.some((person) => person.id === member.employeeId),
  );
}

function serializeTeam(
  state: DemoStructure,
  people: readonly StructurePerson[],
  row: DemoTeamRow,
): ApiTeam {
  const department = row.departmentId
    ? state.departments.find((one) => one.id === row.departmentId)
    : undefined;
  const lead = people.find((person) => person.id === row.leadId);
  return {
    id: row.id,
    name: row.name,
    purpose: row.purpose,
    departmentId: row.departmentId,
    departmentName: department?.name ?? null,
    leadId: row.leadId,
    leadName: lead?.name ?? null,
    memberCount: liveMembers(state, people, row.id).length,
    archived: row.archived,
    crossFunctional: row.departmentId === null,
  };
}

export function demoTeamList(
  state: DemoStructure,
  people: readonly StructurePerson[],
  params: { includeArchived?: boolean; departmentId?: string } = {},
): ApiTeamList {
  const rows = [...state.teams]
    .filter((row) => params.includeArchived || !row.archived)
    .filter((row) =>
      params.departmentId ? row.departmentId === params.departmentId : true,
    )
    .sort(byName);

  const teams = rows.map((row) => serializeTeam(state, people, row));
  const ids = new Set(rows.map((row) => row.id));

  return {
    teams,
    counts: {
      teams: teams.filter((team) => !team.archived).length,
      crossFunctional: teams.filter(
        (team) => !team.archived && team.crossFunctional,
      ).length,
      /* Distinct people, so somebody on two teams counts once. Summing
         `memberCount` would double-count them. */
      peopleOnATeam: new Set(
        [...ids].flatMap((teamId) =>
          liveMembers(state, people, teamId).map((member) => member.employeeId),
        ),
      ).size,
    },
  };
}

export function demoTeamDetail(
  state: DemoStructure,
  people: readonly StructurePerson[],
  id: string,
): ApiTeamDetail | null {
  const row = state.teams.find((team) => team.id === id);
  if (!row) return null;
  const team = serializeTeam(state, people, row);

  const members: ApiTeamMember[] = liveMembers(state, people, id)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
    .flatMap((member) => {
      const person = people.find((one) => one.id === member.employeeId);
      if (!person) return [];
      const assigned = state.departments.find(
        (one) => !one.archived && sameName(one.name, person.department),
      );
      return [
        {
          membershipId: member.membershipId,
          employeeId: person.id,
          name: person.name,
          jobTitle: person.jobTitle,
          roleLabel: member.roleLabel,
          joinedAt: member.joinedAt,
          departmentId: assigned?.id ?? null,
          departmentName: assigned?.name ?? null,
          grossMonthlyKobo: person.grossMonthlyKobo,
          /* The contradiction, named rather than repaired — the same rule the
             service states. Zero of these is the invariant holding. */
          departmentMismatch:
            row.departmentId !== null && (assigned?.id ?? null) !== row.departmentId,
        },
      ];
    });

  return {
    ...team,
    members,
    payrollKobo: members.reduce(
      (sum, member) => sum + member.grossMonthlyKobo,
      0,
    ),
  };
}

/* ------------------------------------------------------------- the one rule */

/**
 * Who a departmental team would move, and where to.
 *
 * The pure half of `alignMemberDepartments` in the teams service. It computes
 * the move and never performs it, because performing it means writing
 * `Employee.department` and only a hook can reach the employee store — so the
 * caller in `store/teams.ts` does the writing and renders the names.
 *
 * A cross-functional team moves nobody and returns an empty list.
 */
export function pendingAlignment(
  state: DemoStructure,
  people: readonly StructurePerson[],
  teamId: string,
): { toName: string; moved: ApiMoved[] } | null {
  const team = state.teams.find((row) => row.id === teamId);
  if (!team?.departmentId) return null;
  const department = state.departments.find((row) => row.id === team.departmentId);
  if (!department) return null;

  const moved: ApiMoved[] = liveMembers(state, people, teamId)
    .flatMap((member) => {
      const person = people.find((one) => one.id === member.employeeId);
      if (!person || sameName(person.department, department.name)) return [];
      return [
        {
          employeeId: person.id,
          name: person.name,
          from: isUnassigned(person.department) ? null : person.department,
        },
      ];
    });

  return { toName: department.name, moved };
}
