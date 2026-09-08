"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { ApiError } from "@/lib/api/client";
import {
  permissionsApi,
  type ApiRole,
  type Catalogue,
  type CatalogueEntry,
  type Matrix,
  type MatrixCell,
  type MatrixRow,
  type RoleMember,
  type SectionKey,
} from "@/lib/api/permissions";
import { EMPLOYEES } from "@/lib/mock/people";
import { SEED_ROLES, type SeedRole } from "@/lib/mock/roles";
/* The leaf, not `@/lib/permissions` — that import would close a cycle this
   module cannot survive. The file's header explains it. */
import {
  PERMISSION_KEYS,
  PERMISSION_SHAPE,
  type PermissionAction,
  type PermissionKey,
  type PermissionModule,
  type PermissionScope,
} from "@/lib/permission-keys";
import { createSharedResource } from "@/lib/shared-resource";
import { createPersistedState } from "./persisted";
import { useSession } from "./session";
import { useRevalidation } from "@/lib/revalidate";

/**
 * Roles, permissions and who is in them.
 *
 * Two modes, like every other store: **connected** reads and writes
 * `/api/v1/permissions`; **demo** works against a seeded set of roles and keeps
 * your edits in localStorage.
 *
 * ## The demo is fully editable, and it refuses the same things the API refuses
 *
 * `lib/store/departments.ts` made its demo read-only because a department is a
 * payroll reporting boundary and a tree built in browser storage would teach a
 * demo audience something false. A role is different: the *point* of this screen
 * is the shape of the decision — which permissions sit together, who holds them,
 * what the product stops you doing — and that is exactly what a demo needs to
 * show.
 *
 * So the demo writes. What matters is that it refuses what the real thing
 * refuses, with the same words, or the demo teaches a product that does not
 * exist. All five refusals are implemented below:
 *
 *   1. a built-in role's name and permissions are frozen (its description is not)
 *   2. a built-in role cannot be deleted
 *   3. a role with people in it cannot be deleted, and the refusal names them
 *   4. the last person who can manage access cannot lose it
 *   5. nobody can hand out a permission they do not hold themselves
 *
 * The fifth never fires in an ordinary demo, because a demo session holds
 * everything — until you use "preview as", which is what makes the escalation
 * guard demonstrable rather than theoretical.
 *
 * ## What persists
 *
 * A diff, not a copy: patches on the four seeded roles, roles you created, ids
 * you deleted, and the preview selection. The seeded roles themselves are
 * regenerated from `SEED_ROLES` on every load, so changing the seed never
 * strands an unrelated edit. Same rule as the employee store.
 */

/* ------------------------------------------------------- the demo catalogue */

/**
 * The permission copy, mirrored for demo mode only.
 *
 * When connected this is dead code: `GET /permissions/catalogue` is the source
 * and the API's copy wins, precisely so a permission added to the backend cannot
 * reach the editor unlabelled. This exists because the demo has no API to ask,
 * and a role editor with no labels is not a demo of anything.
 *
 * If the two ever disagree, the API is right. Keep this in step when the
 * backend's table changes; `npx tsc --noEmit` catches a *missing* entry (the
 * record is keyed by `PermissionKey`) but cannot catch stale wording.
 */
const DEMO_SECTIONS: { key: SectionKey; title: string }[] = [
  { key: "money", title: "Pay and money" },
  { key: "people", title: "People" },
  { key: "timeOff", title: "Leave" },
  { key: "company", title: "Company" },
  { key: "records", title: "Records and reports" },
];

const DEMO_COPY: Record<
  PermissionKey,
  { label: string; description: string; section: SectionKey; sensitive?: true }
> = {
  VIEW_SALARIES: {
    label: "See salaries",
    description:
      "Open anyone's pay and payslips. Without it, figures stay hidden.",
    section: "money",
    sensitive: true,
  },
  RUN_PAYROLL: {
    label: "Prepare payroll",
    description: "Build the month's run. Preparing a run does not pay anybody.",
    section: "money",
  },
  APPROVE_PAYROLL: {
    label: "Approve payroll",
    description: "Release a run for payment. The last gate before money moves.",
    section: "money",
    sensitive: true,
  },
  MANAGE_PAY_STRUCTURE: {
    label: "Set up pay",
    description:
      "Define allowances, deductions and salary grades. Changes what people earn.",
    section: "money",
    sensitive: true,
  },
  APPROVE_LOANS: {
    label: "Approve staff loans",
    description:
      "Say yes to a loan, and to the salary deductions that repay it.",
    section: "money",
    sensitive: true,
  },
  APPROVE_EXPENSES: {
    label: "Approve expenses",
    description: "Sign off a claim so it can be paid.",
    section: "money",
  },
  EDIT_RECORDS: {
    label: "Edit people",
    description: "Add staff and change job titles, pay and bank details.",
    section: "people",
    sensitive: true,
  },
  MANAGE_HIRING: {
    label: "Hire",
    description: "Post roles, move candidates along, and make offers.",
    section: "people",
  },
  APPROVE_HIRING: {
    label: "Approve hiring",
    description:
      "Approve a requisition before it opens, and an offer before it goes out.",
    section: "people",
  },
  APPROVE_LEAVE: {
    label: "Approve leave for their team",
    description: "Decide requests from the people who report to them.",
    section: "timeOff",
  },
  APPROVE_LEAVE_ALL: {
    label: "Approve leave for everyone",
    description: "Decide any leave request in the company.",
    section: "timeOff",
  },
  MANAGE_SETTINGS: {
    label: "Change company settings",
    description:
      "Company details, leave policy, the working week, and notifications.",
    section: "company",
  },
  MANAGE_ROLES: {
    label: "Manage access",
    description:
      "Decide what everybody else on this page can do. Give it sparingly.",
    section: "company",
    sensitive: true,
  },
  INVITE_STAFF: {
    label: "Invite staff to sign in",
    description:
      "Send the invitation. They can only be given access the inviter already has.",
    section: "company",
    sensitive: true,
  },
  EXPORT_DATA: {
    label: "Export",
    description: "Download staff, pay and attendance as a spreadsheet.",
    section: "records",
    sensitive: true,
  },
  IMPORT_DATA: {
    label: "Import a spreadsheet",
    description:
      "Add staff in bulk. One wrong file changes hundreds of records.",
    section: "records",
    sensitive: true,
  },
  VIEW_AUDIT: {
    label: "See the audit trail",
    description: "Read who did what, including who opened whose salary.",
    section: "records",
    sensitive: true,
  },

  /* Equipment and its repairs. Three view scopes, because a department head
     needs their team's kit, an employee needs the laptop on their desk, and
     only HR needs the whole estate. */
  VIEW_EQUIPMENT_ALL: {
    label: "See all equipment",
    description: "Every item the company owns, and who is holding each one.",
    section: "people",
  },
  VIEW_EQUIPMENT_DEPARTMENT: {
    label: "See their department's equipment",
    description: "Items held by anybody in a department they head.",
    section: "people",
  },
  VIEW_EQUIPMENT_OWN: {
    label: "See their own equipment",
    description: "The items on their own desk. Everybody should have this.",
    section: "people",
  },
  CREATE_EQUIPMENT: {
    label: "Add equipment",
    description: "Put a new item on the register.",
    section: "people",
  },
  EDIT_EQUIPMENT: {
    label: "Edit equipment",
    description:
      "Correct an item's details — its serial number, model or notes.",
    section: "people",
  },
  DELETE_EQUIPMENT: {
    label: "Delete equipment",
    description: "Remove an item from the register, and its history with it.",
    section: "people",
    sensitive: true,
  },
  ASSIGN_EQUIPMENT: {
    label: "Hand equipment out",
    description:
      "Give an item to somebody, or move it between two people. Separate from editing: correcting a serial number is not the same as changing who is answerable for a laptop.",
    section: "people",
  },
  REPORT_EQUIPMENT_FAULT: {
    label: "Report a fault",
    description:
      "Raise a repair request against an item. Everybody should have this — the person holding the broken laptop is the person who knows it is broken.",
    section: "people",
  },
  VIEW_REPAIRS_ALL: {
    label: "See all repair requests",
    description: "Every open and closed repair in the company.",
    section: "people",
  },
  VIEW_REPAIRS_DEPARTMENT: {
    label: "See their department's repairs",
    description: "Repairs raised by anybody in a department they head.",
    section: "people",
  },
  VIEW_REPAIRS_OWN: {
    label: "See their own repair requests",
    description: "The repairs they raised, and where each one has got to.",
    section: "people",
  },
  UPDATE_REPAIR_STATUS: {
    label: "Move a repair along",
    description:
      "Take a request from reported to under review, in repair, and repaired.",
    section: "people",
  },
  CONFIRM_EQUIPMENT_RETURN: {
    label: "Confirm a return",
    description:
      "Close a repair by recording that the item is back with its holder.",
    section: "people",
  },
  APPROVE_LEAVE_DEPARTMENT: {
    label: "Approve leave for their department",
    description:
      "Decide requests from anybody in a department they head — including people who do not report to them directly.",
    section: "timeOff",
  },
};

/** Reported, never blocked — a two-person company genuinely has one person doing both. */
const DEMO_SOD: {
  permissions: [PermissionKey, PermissionKey];
  message: string;
}[] = [
  {
    permissions: ["RUN_PAYROLL", "APPROVE_PAYROLL"],
    message:
      "Whoever prepares a run should not also be the one who releases the money.",
  },
  {
    permissions: ["EDIT_RECORDS", "APPROVE_PAYROLL"],
    message: "Editing pay and approving the run means a rise nobody else saw.",
  },
];

/**
 * The matrix's row and column titles, for demo mode only.
 *
 * The *structure* — which module and action each permission belongs to — is in
 * `PERMISSION_SHAPE` on the shared leaf, so it is written once and both this
 * file and the grid read it. Only the words are here, for the same reason the
 * rest of `DEMO_COPY` is: connected, the API's titles win.
 */
const DEMO_MODULE_TITLES: Record<PermissionModule, string> = {
  people: "People",
  equipment: "Equipment",
  repairs: "Equipment repairs",
  hiring: "Recruitment",
  leave: "Leave",
  payroll: "Payroll",
  paySetup: "Pay setup",
  loans: "Staff loans",
  expenses: "Expenses",
  settings: "Company settings",
  access: "Access and roles",
  records: "Data in and out",
  audit: "Audit trail",
};

/** Narrowest first, so a scope control reads left to right as it widens. */
const DEMO_SCOPE_ORDER: PermissionScope[] = [
  "own",
  "team",
  "department",
  "all",
];

const DEMO_SCOPE_TITLES: Record<PermissionScope, string> = {
  own: "Their own",
  team: "Their reports",
  department: "Their department",
  all: "Everyone",
};

/** Column order, and only the ones something uses. Mirrors the API's list. */
const DEMO_ACTIONS: { key: PermissionAction; title: string }[] = [
  { key: "view", title: "View" },
  { key: "create", title: "Create" },
  { key: "edit", title: "Edit" },
  { key: "delete", title: "Delete" },
  { key: "approve", title: "Approve" },
  { key: "assign", title: "Assign" },
  { key: "report", title: "Report a fault" },
  { key: "update", title: "Move it along" },
  { key: "confirm", title: "Confirm return" },
  { key: "run", title: "Prepare" },
  { key: "manage", title: "Set up" },
  { key: "invite", title: "Invite" },
  { key: "import", title: "Import" },
  { key: "export", title: "Export" },
];

const entryOf = (key: PermissionKey): CatalogueEntry => ({
  key,
  label: DEMO_COPY[key].label,
  description: DEMO_COPY[key].description,
  section: DEMO_COPY[key].section,
  module: PERMISSION_SHAPE[key].module,
  action: PERMISSION_SHAPE[key].action,
  ...(PERMISSION_SHAPE[key].scope
    ? { scope: PERMISSION_SHAPE[key].scope }
    : {}),
  sensitive: DEMO_COPY[key].sensitive === true,
});

/**
 * The same projection the API does, over the same structure table.
 *
 * Duplicated logic rather than duplicated data: `PERMISSION_SHAPE` is the one
 * place a permission's module and action are written on this side, so the grid
 * demo mode draws and the grid the API sends are the same grid with different
 * copy — which is what makes the demo a demo of the real thing.
 */
function demoMatrix(): Matrix {
  const cellFor = (
    module: PermissionModule,
    action: PermissionAction,
  ): MatrixCell | undefined => {
    const found = PERMISSION_KEYS.filter(
      (key) =>
        PERMISSION_SHAPE[key].module === module &&
        PERMISSION_SHAPE[key].action === action,
    ).map(entryOf);
    if (found.length === 0) return undefined;

    const only = found[0];
    if (found.length === 1 && only && only.scope === undefined) {
      return {
        kind: "one",
        permission: only.key,
        label: only.label,
        description: only.description,
        sensitive: only.sensitive,
      };
    }
    return {
      kind: "scoped",
      scopes: found
        .filter((entry) => entry.scope !== undefined)
        .sort(
          (a, b) =>
            DEMO_SCOPE_ORDER.indexOf(a.scope!) -
            DEMO_SCOPE_ORDER.indexOf(b.scope!),
        )
        .map((entry) => ({
          scope: entry.scope!,
          title: DEMO_SCOPE_TITLES[entry.scope!],
          permission: entry.key,
          label: entry.label,
          description: entry.description,
          sensitive: entry.sensitive,
        })),
    };
  };

  const rows: MatrixRow[] = (
    Object.keys(DEMO_MODULE_TITLES) as PermissionModule[]
  ).map((module) => {
    const cells: Partial<Record<PermissionAction, MatrixCell>> = {};
    for (const action of DEMO_ACTIONS) {
      const cell = cellFor(module, action.key);
      if (cell) cells[action.key] = cell;
    }
    /* The section comes off any permission in the row — they all share it,
       because a module sits under exactly one heading. */
    const first = PERMISSION_KEYS.find(
      (key) => PERMISSION_SHAPE[key].module === module,
    );
    return {
      key: module,
      title: DEMO_MODULE_TITLES[module],
      section: first ? DEMO_COPY[first].section : "company",
      cells,
    };
  });

  return {
    columns: DEMO_ACTIONS.filter((action) =>
      rows.some((row) => row.cells[action.key] !== undefined),
    ),
    rows,
  };
}

const DEMO_CATALOGUE: Catalogue = {
  matrix: demoMatrix(),
  sections: DEMO_SECTIONS.map((section) => ({
    key: section.key,
    title: section.title,
    permissions: PERMISSION_KEYS.filter(
      (key) => DEMO_COPY[key].section === section.key,
    ).map(entryOf),
  })),
  permissions: PERMISSION_KEYS.map(entryOf),
  separationOfDuties: DEMO_SOD.map((rule) => ({
    permissions: [...rule.permissions],
    labels: rule.permissions.map((key) => DEMO_COPY[key].label),
    message: rule.message,
  })),
};

/* ------------------------------------------------------------ the demo seed */

/**
 * The four shipped roles and their demo members now live in
 * `lib/mock/roles.ts`.
 *
 * They moved because two callers below this module need the same answer and
 * cannot import it from here: the offline sign-in picker in
 * `lib/store/session.ts`, and the role badge in `lib/roles.ts`. This module
 * imports `store/session.ts`, so an import back would close a cycle. The seed is
 * data; this file is the behaviour around it.
 */

/** Demo accounts stand in for `User` rows. The employee id doubles as the user id. */
function demoAccount(employeeId: string): RoleMember | null {
  const person = EMPLOYEES.find((employee) => employee.id === employeeId);
  if (!person) return null;
  return {
    userId: person.id,
    name: `${person.firstName} ${person.lastName}`,
    email: person.email ?? `${person.id}@example.com`,
    employeeId: person.id,
    /* Two people invited and never signed in, because the difference between
       "they have this access" and "they have not opened the invitation" is worth
       showing. */
    lastSignInAt:
      person.id === "p-09" || person.id === "p-10"
        ? null
        : "2026-08-19T08:12:00.000Z",
  };
}

/* -------------------------------------------------------------- demo state */

type RolePatch = {
  name?: string;
  description?: string | null;
  permissions?: PermissionKey[];
  /** Replaced whole. A member list is small and a diff of it buys nothing. */
  members?: string[];
};

type DemoState = {
  overrides: Record<string, RolePatch>;
  created: SeedRole[];
  deleted: string[];
  /**
   * Demo only: render the whole app as this role holds it.
   *
   * Lives in the store rather than in component state because it changes what
   * every screen shows — the nav, the buttons, this editor's own switches — and a
   * page reload that quietly dropped it would leave somebody wondering why the
   * app looked different a minute ago.
   */
  previewRoleId: string | null;
};

const EMPTY: DemoState = {
  overrides: {},
  created: [],
  deleted: [],
  previewRoleId: null,
};

const demo = createPersistedState<DemoState>({
  key: "approvehr.permissions.store",
  empty: EMPTY,
  version: 1,
});

/* ------------------------------------------------------- demo derivation */

const labelOf = (key: PermissionKey): string => DEMO_COPY[key].label;

/** Catalogue order, so the same set always renders the same way. */
const ordered = (permissions: readonly PermissionKey[]): PermissionKey[] =>
  PERMISSION_KEYS.filter((key) => permissions.includes(key));

const warningsFor = (permissions: readonly PermissionKey[]): string[] =>
  DEMO_SOD.filter((rule) =>
    rule.permissions.every((key) => permissions.includes(key)),
  ).map((rule) => rule.message);

function toRole(
  seed: SeedRole,
  patch: RolePatch | undefined,
  isSystem: boolean,
): ApiRole {
  const permissions = ordered(patch?.permissions ?? seed.permissions);
  const members = patch?.members ?? seed.members;
  return {
    id: seed.id,
    name: patch?.name ?? seed.name,
    description:
      patch?.description === undefined ? seed.description : patch.description,
    permissions,
    labels: permissions.map(labelOf),
    isSystem,
    memberCount: members.length,
    warnings: warningsFor(permissions),
    createdAt: "2026-01-06T09:00:00.000Z",
  };
}

/** The demo's roles, seed plus diff, in the API's own order. */
function demoRoles(state: DemoState): ApiRole[] {
  const seeded = SEED_ROLES.filter(
    (role) => !state.deleted.includes(role.id),
  ).map((role) => toRole(role, state.overrides[role.id], true));
  const made = state.created
    .filter((role) => !state.deleted.includes(role.id))
    .map((role) => toRole(role, state.overrides[role.id], false))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...seeded, ...made];
}

/** Member ids for one demo role. */
function demoMembers(state: DemoState, roleId: string): string[] {
  const patch = state.overrides[roleId];
  if (patch?.members) return patch.members;
  const seed = [...SEED_ROLES, ...state.created].find(
    (role) => role.id === roleId,
  );
  return seed ? seed.members : [];
}

function demoCounts(state: DemoState) {
  const roles = demoRoles(state);
  return {
    roles: roles.length,
    peopleWhoCanManageAccess: roles
      .filter((role) => role.permissions.includes("MANAGE_ROLES"))
      .reduce((total, role) => total + role.memberCount, 0),
  };
}

/* -------------------------------------------------------- demo refusals */

/**
 * A demo refusal, shaped like the API's.
 *
 * A `function` declaration rather than a `const` arrow deliberately: TypeScript
 * only narrows after a never-returning call when the callee is declared this
 * way, and every caller below relies on `if (!role) refuse(…)` leaving `role`
 * non-null afterwards.
 */
function refuse(message: string): never {
  throw new ApiError(422, "demo_refused", message);
}

/** Who would still be able to manage access if `next` were the whole picture. */
function survivorsOfManageAccess(state: DemoState): number {
  return demoRoles(state)
    .filter((role) => role.permissions.includes("MANAGE_ROLES"))
    .reduce((total, role) => total + demoMembers(state, role.id).length, 0);
}

/**
 * The last-owner guard, simulated.
 *
 * The real one loads the users who hold `MANAGE_ROLES`, applies the change, and
 * refuses if the survivor set empties. This does the same against the demo
 * state. It allows the change through when nobody holds it *already*, for the
 * same reason the API does: the org is broken either way, and refusing every
 * subsequent edit would make it unrepairable by hand.
 */
function assertSomebodyKeepsAccess(before: DemoState, after: DemoState) {
  if (survivorsOfManageAccess(before) === 0) return;
  if (survivorsOfManageAccess(after) > 0) return;
  refuse(
    'That would leave nobody able to manage access. Give somebody else "Manage access" first.',
  );
}

/** The escalation guard, simulated. `held` is what the person editing holds. */
function assertCanGrant(
  granting: readonly PermissionKey[],
  held: PermissionKey[],
) {
  const missing = granting.filter((key) => !held.includes(key));
  if (missing.length === 0) return;
  refuse(
    `You cannot give out ${missing
      .map(labelOf)
      .join(", ")} because you do not hold it yourself. Ask somebody who does.`,
  );
}

function assertNameFree(state: DemoState, name: string, exceptId?: string) {
  const clash = demoRoles(state).find(
    (role) =>
      role.id !== exceptId &&
      role.name.toLowerCase() === name.trim().toLowerCase(),
  );
  if (clash) refuse(`There is already a role called ${clash.name}.`);
}

/* -------------------------------------------------------------------- hooks */

export type RoleView = ApiRole;

export type RolesState = {
  roles: RoleView[];
  catalogue: Catalogue;
  counts: { roles: number; peopleWhoCanManageAccess: number };
  loading: boolean;
  error: ApiError | null;
  /** True when reading and writing the API rather than browser storage. */
  connected: boolean;
};

/**
 * Every role, the catalogue, and the writes.
 *
 * One hook rather than three because the editor needs all three at once and a
 * role list without its labels renders nothing useful.
 *
 * `held` is what the person editing can hand out — pass the effective set from
 * `usePermissions()`. Only the demo path uses it; connected, the API applies the
 * real guard against the database and this would only ever be a second opinion.
 */
export function useRoles(held: readonly PermissionKey[] = PERMISSION_KEYS) {
  const { isConnected } = useSession();
  const state = useSyncExternalStore(
    demo.subscribe,
    demo.read,
    demo.getServerSnapshot,
  );

  const [live, setLive] = useState<{
    roles: RoleView[];
    catalogue: Catalogue | null;
    counts: RolesState["counts"];
    loading: boolean;
    error: ApiError | null;
  }>({
    roles: [],
    catalogue: null,
    counts: { roles: 0, peopleWhoCanManageAccess: 0 },
    loading: isConnected,
    error: null,
  });

  const load = useCallback(async () => {
    if (!isConnected) return;
    setLive((s) => ({ ...s, loading: true, error: null }));
    try {
      const [roles, catalogue] = await Promise.all([
        permissionsApi.roles(),
        permissionsApi.catalogue(),
      ]);
      setLive({
        roles: roles.roles,
        catalogue,
        counts: roles.counts,
        loading: false,
        error: null,
      });
    } catch (error) {
      setLive((s) => ({
        ...s,
        loading: false,
        error: error instanceof ApiError ? error : null,
      }));
    }
  }, [isConnected]);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    void load();
  }, [load, revalidation]);

  /* ------------------------------------------------------------ demo writes */

  const heldList = useMemo(() => [...held], [held]);

  const write = useCallback((mutate: (current: DemoState) => DemoState) => {
    const current = demo.current();
    const next = mutate(current);
    assertSomebodyKeepsAccess(current, next);
    demo.commit(next);
  }, []);

  const create = useCallback(
    async (body: {
      name: string;
      description?: string;
      permissions?: PermissionKey[];
    }): Promise<RoleView> => {
      if (isConnected) {
        const role = await permissionsApi.createRole({
          name: body.name,
          ...(body.description ? { description: body.description } : {}),
          permissions: body.permissions ?? [],
        });
        await load();
        return role;
      }

      const permissions = ordered(body.permissions ?? []);
      assertNameFree(demo.current(), body.name);
      assertCanGrant(permissions, heldList);

      const seed: SeedRole = {
        id: `role-${Date.now().toString(36)}`,
        name: body.name.trim(),
        description: body.description?.trim() ?? "",
        permissions,
        members: [],
      };
      write((current) => ({ ...current, created: [...current.created, seed] }));
      return toRole(seed, undefined, false);
    },
    [isConnected, load, heldList, write],
  );

  const update = useCallback(
    async (
      id: string,
      patch: {
        name?: string;
        description?: string | null;
        permissions?: PermissionKey[];
      },
    ): Promise<void> => {
      if (isConnected) {
        await permissionsApi.updateRole(id, patch);
        await load();
        return;
      }

      const current = demo.current();
      const role = demoRoles(current).find((candidate) => candidate.id === id);
      if (!role) refuse("That role no longer exists. Reload the page.");

      if (
        role.isSystem &&
        patch.name !== undefined &&
        patch.name !== role.name
      ) {
        refuse(
          `${role.name} is a built-in role, so its name is fixed. Create a new role with the permissions you want instead.`,
        );
      }
      if (role.isSystem && patch.permissions !== undefined) {
        refuse(
          `${role.name} is a built-in role, so what it can do is fixed. Create a new role with the permissions you want instead.`,
        );
      }
      if (patch.name !== undefined && patch.name !== role.name) {
        assertNameFree(current, patch.name, id);
      }
      if (patch.permissions !== undefined) {
        const granted = ordered(patch.permissions).filter(
          (key) => !role.permissions.includes(key),
        );
        assertCanGrant(granted, heldList);
      }

      write((state_) => ({
        ...state_,
        overrides: {
          ...state_.overrides,
          [id]: {
            ...state_.overrides[id],
            ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
            ...(patch.description !== undefined
              ? { description: patch.description }
              : {}),
            ...(patch.permissions !== undefined
              ? { permissions: ordered(patch.permissions) }
              : {}),
          },
        },
      }));
    },
    [isConnected, load, heldList, write],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (isConnected) {
        await permissionsApi.deleteRole(id);
        await load();
        return;
      }

      const current = demo.current();
      const role = demoRoles(current).find((candidate) => candidate.id === id);
      if (!role) return;

      if (role.isSystem) {
        refuse(
          `${role.name} is a built-in role and cannot be deleted. Take people out of it instead.`,
        );
      }

      const members = demoMembers(current, id)
        .map(demoAccount)
        .filter((account): account is RoleMember => account !== null);
      if (members.length > 0) {
        const named = members
          .slice(0, 3)
          .map((member) => member.name)
          .join(", ");
        refuse(
          `${members.length} ${members.length === 1 ? "person is" : "people are"} in ${role.name} (${named}${members.length > 3 ? ", …" : ""}). Move them to another role first.`,
        );
      }

      write((state_) => ({
        ...state_,
        deleted: [...state_.deleted, id],
        created: state_.created.filter((made) => made.id !== id),
      }));
    },
    [isConnected, load, write],
  );

  const addMembers = useCallback(
    async (
      id: string,
      userIds: string[],
    ): Promise<{ added: number; alreadyIn: number }> => {
      if (isConnected) {
        const result = await permissionsApi.addMembers(id, userIds);
        await load();
        return {
          added: result.added.length,
          alreadyIn: result.alreadyIn.length,
        };
      }

      const current = demo.current();
      const role = demoRoles(current).find((candidate) => candidate.id === id);
      if (!role) refuse("That role no longer exists. Reload the page.");

      /* Checked against the role's whole set, not a difference: joining a
         powerful role is the same escalation by another door. */
      assertCanGrant(role.permissions, heldList);

      const existing = demoMembers(current, id);
      const fresh = userIds.filter((userId) => !existing.includes(userId));

      if (fresh.length > 0) {
        write((state_) => ({
          ...state_,
          overrides: {
            ...state_.overrides,
            [id]: {
              ...state_.overrides[id],
              members: [...demoMembers(state_, id), ...fresh],
            },
          },
        }));
      }
      return { added: fresh.length, alreadyIn: userIds.length - fresh.length };
    },
    [isConnected, load, heldList, write],
  );

  const removeMember = useCallback(
    async (id: string, userId: string): Promise<void> => {
      if (isConnected) {
        await permissionsApi.removeMember(id, userId);
        await load();
        return;
      }
      write((state_) => ({
        ...state_,
        overrides: {
          ...state_.overrides,
          [id]: {
            ...state_.overrides[id],
            members: demoMembers(state_, id).filter(
              (member) => member !== userId,
            ),
          },
        },
      }));
    },
    [isConnected, load, write],
  );

  const resolved: RolesState = isConnected
    ? {
        roles: live.roles,
        catalogue: live.catalogue ?? DEMO_CATALOGUE,
        counts: live.counts,
        loading: live.loading,
        error: live.error,
        connected: true,
      }
    : {
        roles: demoRoles(state),
        catalogue: DEMO_CATALOGUE,
        counts: demoCounts(state),
        loading: false,
        error: null,
        connected: false,
      };

  return {
    ...resolved,
    reload: load,
    create,
    update,
    remove,
    addMembers,
    removeMember,
  };
}

/**
 * Who is in a role.
 *
 * Paginated and searched by the API when connected, in memory when not. Twenty
 * five at a time either way, so the two behave the same from the screen's side.
 */
export function useRoleMembers(roleId: string | null, query = "") {
  const { isConnected } = useSession();
  const state = useSyncExternalStore(
    demo.subscribe,
    demo.read,
    demo.getServerSnapshot,
  );

  /**
   * Keyed by the request it answers.
   *
   * `loading` is then *derived* — the stored key not matching the wanted one is
   * exactly what "still loading" means — rather than being a flag set at the top
   * of the effect, which cascades a render before the request has even left. It
   * also drops a slow answer to an old query on the floor: a search box types
   * faster than a network replies.
   */
  const want = `${roleId ?? ""}::${query}`;
  const [live, setLive] = useState<{
    key: string;
    members: RoleMember[];
    total: number;
    error: ApiError | null;
  } | null>(null);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!roleId || !isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await permissionsApi.members(
          roleId,
          { q: query || undefined, pageSize: 25 },
          controller.signal,
        );
        if (cancelled) return;
        setLive({
          key: want,
          members: result.data,
          total: result.meta.total,
          error: null,
        });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setLive({
          key: want,
          members: [],
          total: 0,
          error: error instanceof ApiError ? error : null,
        });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [roleId, isConnected, query, want, revalidation]);

  if (isConnected) {
    const fresh = live && live.key === want ? live : null;
    return {
      members: fresh?.members ?? [],
      total: fresh?.total ?? 0,
      loading: roleId !== null && fresh === null,
      error: fresh?.error ?? null,
    };
  }

  if (!roleId) return { members: [], total: 0, loading: false, error: null };

  const all = demoMembers(state, roleId)
    .map(demoAccount)
    .filter((account): account is RoleMember => account !== null);
  const needle = query.trim().toLowerCase();
  const matched = needle
    ? all.filter(
        (person) =>
          person.name.toLowerCase().includes(needle) ||
          person.email.toLowerCase().includes(needle),
      )
    : all;

  return {
    members: matched.slice(0, 25),
    total: matched.length,
    loading: false,
    error: null,
  };
}

/**
 * People who could be added to a role.
 *
 * Connected, this is every account the API will name — assembled from the
 * membership of every role, because there is no endpoint that lists accounts.
 * See `permissionsApi.assignable`. Demo, it is the seeded directory.
 *
 * `note` is the honest caveat to render beside the list, or null when there is
 * nothing to caveat.
 */
export function useAssignableAccounts(roleIds: string[]) {
  const { isConnected } = useSession();

  /* Serialised so the effect depends on the ids rather than the array identity,
     and keyed so `loading` is derived rather than set inside the effect. */
  const key = roleIds.join(",");
  const [loaded, setLoaded] = useState<{
    key: string;
    accounts: RoleMember[];
  } | null>(null);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      const result = await permissionsApi
        .assignable(key ? key.split(",") : [], controller.signal)
        .catch(() => [] as RoleMember[]);
      if (cancelled) return;
      setLoaded({ key, accounts: result });
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, key, revalidation]);

  if (isConnected) {
    const fresh = loaded && loaded.key === key ? loaded : null;
    return {
      accounts: fresh?.accounts ?? [],
      loading: fresh === null,
      note: "Only people who already have an account and hold at least one role can be listed.",
    };
  }

  return {
    accounts: EMPLOYEES.map((employee) => demoAccount(employee.id)).filter(
      (account): account is RoleMember => account !== null,
    ),
    loading: false,
    note: null,
  };
}

/**
 * "Preview as" — demo only.
 *
 * A demo session holds every permission, which is right for showing the product
 * and useless for showing what a *role* sees. This renders the whole app as one
 * role holds it: the nav, the buttons, and this editor's own escalation guard.
 *
 * Deliberately loud rather than subtle. A quiet override that hid half the
 * navigation would be indistinguishable from a bug, so whatever uses this must
 * say on screen that it is on and offer the way out.
 *
 * Connected, it does nothing at all: real permissions are the point, and letting
 * somebody widen their own view would make this a security hole rather than a
 * demo aid.
 */
export function useRolePreview() {
  const { isConnected } = useSession();
  const state = useSyncExternalStore(
    demo.subscribe,
    demo.read,
    demo.getServerSnapshot,
  );

  const set = useCallback((roleId: string | null) => {
    demo.commit({ ...demo.current(), previewRoleId: roleId });
  }, []);

  const roleId = isConnected ? null : state.previewRoleId;
  const role = roleId
    ? (demoRoles(state).find((candidate) => candidate.id === roleId) ?? null)
    : null;

  return {
    /** Null when not previewing, which is the normal state. */
    role,
    /** Available only in demo mode. */
    available: !isConnected,
    set,
  };
}

/**
 * Which roles a demo persona holds, honouring edits made on `/settings/roles`.
 *
 * Empty when connected, because the demo state is then not the truth and a badge
 * that read it would be describing a role the person may not hold. The connected
 * answer comes with the session — see `lib/roles.ts`.
 *
 * `lib/mock/roles.ts` has the same lookup against the raw seed, for the two
 * callers that run below this module and cannot use a hook. This one is the
 * live version: move somebody into Payroll officer on `/settings/roles` and
 * their badge changes with the next render, which is the whole reason the demo
 * roles are editable at all.
 */
export function useDemoRoles(
  employeeId: string | null,
): { id: string; name: string }[] {
  const { isConnected } = useSession();
  const state = useSyncExternalStore(
    demo.subscribe,
    demo.read,
    demo.getServerSnapshot,
  );

  return useMemo(() => {
    if (isConnected || !employeeId) return [];
    return demoRoles(state)
      .filter((role) => demoMembers(state, role.id).includes(employeeId))
      .map(({ id, name }) => ({ id, name }));
  }, [isConnected, state, employeeId]);
}

/* ==========================================================================
 * Who holds which role, as one map
 *
 * `useDemoRoles` above answers it for one person and is a hook, so a table
 * cannot call it per row. This is the map version, and it is the only thing on
 * this side that can populate a role column.
 * ======================================================================== */

export type EmployeeRoleEntry = { id: string; name: string };

type RoleSweep = {
  /** Every role in the company, in the order the API listed them. */
  roles: EmployeeRoleEntry[];
  byEmployee: Map<string, EmployeeRoleEntry[]>;
  /** Roles whose members could not be read, by name. */
  failed: string[];
  error: ApiError | null;
};

/** The one key: one answer per company per session. */
const ROLE_SWEEP_KEY = "company";

/**
 * One sweep, shared by every row on the screen.
 *
 * Through `createSharedResource` rather than a `useEffect` for the reason that
 * file was written for: a role column is read once per *row*, and a
 * component-local fetch would issue one identical request per cell. The
 * directory pages at 25.
 *
 * Outcome-not-value, like every other resource here: a rejection reaches a
 * subscriber as `null`, which is indistinguishable from still loading, and
 * "nobody holds a role" is a claim about a company's access rather than an
 * empty state. So the failure travels *in* the value.
 */
const roleSweep = createSharedResource<RoleSweep>(async (_key, signal) => {
  try {
    const list = await permissionsApi.roles(signal);
    const swept = await permissionsApi.rolesByEmployee(list.roles, signal);
    return {
      roles: list.roles.map(({ id, name }) => ({ id, name })),
      byEmployee: swept.byEmployee,
      failed: swept.failed,
      error: null,
    };
  } catch (error) {
    /* An abort is the resource dropping its own request, not an answer.
       Rethrowing keeps it out of the cache so the next subscriber starts a
       fresh load rather than inheriting a failure nobody experienced. */
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    return {
      roles: [],
      byEmployee: new Map(),
      failed: [],
      error: error instanceof ApiError ? error : null,
    };
  }
});

export type EmployeeRolesState = {
  /**
   * The roles somebody holds, or **null when it is not known**.
   *
   * The distinction is in the return type on purpose, so the compiler asks
   * every caller what it wants to say about an absence. `[]` means the API
   * described an account holding no role, which is a real and renderable
   * state; `null` means we could not read it, and rendering that as "no role"
   * would be a false claim about somebody's access — the same rule that keeps
   * an absent payslip figure off a screen as an absence rather than a zero.
   */
  rolesFor: (employeeId: string) => EmployeeRoleEntry[] | null;
  /** Every role in the company. For a legend, a filter, or a count. */
  roles: EmployeeRoleEntry[];
  loading: boolean;
  error: ApiError | null;
  /**
   * Roles whose members could not be read, by name.
   *
   * Non-empty means a *successfully* read list may still be short, so a screen
   * showing badges should say so. `rolesFor` already refuses to answer `[]`
   * while this is non-empty — see below.
   */
  incomplete: string[];
};

/**
 * Which roles each employee holds.
 *
 * Demo mode answers synchronously off the same store `/settings/roles` writes,
 * so moving somebody into Payroll officer there changes their badge here — the
 * whole reason the demo roles are editable.
 */
export function useEmployeeRoles(): EmployeeRolesState {
  const { isConnected } = useSession();
  const state = useSyncExternalStore(
    demo.subscribe,
    demo.read,
    demo.getServerSnapshot,
  );

  const live = roleSweep.use(isConnected ? ROLE_SWEEP_KEY : null);

  const offline = useMemo(() => {
    if (isConnected) return null;
    const roles = demoRoles(state).map(({ id, name }) => ({ id, name }));
    const byEmployee = new Map<string, EmployeeRoleEntry[]>();
    for (const role of roles) {
      for (const employeeId of demoMembers(state, role.id)) {
        const held = byEmployee.get(employeeId);
        if (held) held.push(role);
        else byEmployee.set(employeeId, [role]);
      }
    }
    return { roles, byEmployee };
  }, [isConnected, state]);

  const byEmployee = offline?.byEmployee ?? live?.byEmployee ?? null;
  /* A failed read must not answer for anybody. Offline never fails: the map is
     built from a store already in memory. */
  const readable = offline !== null || (live !== null && live.error === null);
  /* Memoised rather than computed inline: the offline branch is a fresh `[]`
     on every render, which would change `rolesFor`'s identity every render and
     defeat the point of the callback. Suppressing `exhaustive-deps` here would
     leave the next person to rediscover it. */
  const failed = useMemo(
    () => (offline !== null ? [] : (live?.failed ?? [])),
    [offline, live],
  );

  const rolesFor = useCallback(
    (employeeId: string): EmployeeRoleEntry[] | null => {
      if (byEmployee === null || !readable) return null;
      const held = byEmployee.get(employeeId);
      /* Absent from every role we *could* read, while some role could not be
         read, is not "no role" — they may well be in the one that failed. The
         honest answer is that we do not know. Somebody who does appear keeps
         their list, which may be short, and `incomplete` says so. */
      if (held === undefined && failed.length > 0) return null;
      return held ?? [];
    },
    [byEmployee, readable, failed],
  );

  return {
    rolesFor,
    roles: offline?.roles ?? live?.roles ?? [],
    loading: offline === null && live === null,
    error: offline !== null ? null : (live?.error ?? null),
    incomplete: failed,
  };
}
