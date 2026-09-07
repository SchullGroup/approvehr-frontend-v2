/**
 * The permission keys and their place in the matrix, and nothing else.
 *
 * ## Why this is its own file
 *
 * To break a module cycle, and the cycle is not hypothetical. `lib/permissions.ts`
 * is the primitive screens import; it needs the demo-preview state, which lives
 * in `lib/store/permissions.ts`; and that store needs the key list at *module
 * init* to build its demo catalogue. Keys defined in `lib/permissions.ts` would
 * therefore make the graph
 *
 *     lib/permissions → lib/store/permissions → lib/permissions
 *
 * and ESM resolves that by handing the second import a partially-evaluated
 * module. Entered from `lib/permissions` first, the store's catalogue would read
 * `PERMISSION_KEYS` before the `const` had run and throw
 * "Cannot access before initialization" — at import time, in the browser only,
 * with a stack that points at neither file usefully.
 *
 * A leaf with no imports of its own cannot participate in a cycle. Everything
 * here is re-exported from `lib/permissions.ts`, so **import from there** — this
 * file is an implementation detail of the dependency graph, not a second public
 * surface.
 *
 * ## Keeping it in step with the backend
 *
 * This mirrors the `Permission` enum in `approvehr-api/prisma/schema.prisma`. The
 * *labels* deliberately do not live here — they come from
 * `GET /permissions/catalogue` so that copy and enum ship together. Add a member
 * to the enum, add it here, and the demo catalogue in `lib/store/permissions.ts`
 * fails to typecheck until somebody writes its copy. That failure is the point.
 */
export const PERMISSION_KEYS = [
  /* Pay and money */
  "VIEW_SALARIES",
  "RUN_PAYROLL",
  "APPROVE_PAYROLL",
  "MANAGE_PAY_STRUCTURE",
  "APPROVE_LOANS",
  "APPROVE_EXPENSES",
  /* People */
  "EDIT_RECORDS",
  "MANAGE_HIRING",
  "APPROVE_HIRING",
  /* Time off */
  "APPROVE_LEAVE",
  "APPROVE_LEAVE_ALL",
  /* Company */
  "MANAGE_SETTINGS",
  "MANAGE_ROLES",
  "INVITE_STAFF",
  /* Records and reports */
  "EXPORT_DATA",
  "IMPORT_DATA",
  "VIEW_AUDIT",

  /* Equipment, at three scopes. */
  "VIEW_EQUIPMENT_ALL",
  "VIEW_EQUIPMENT_DEPARTMENT",
  "VIEW_EQUIPMENT_OWN",
  "CREATE_EQUIPMENT",
  "EDIT_EQUIPMENT",
  "DELETE_EQUIPMENT",
  "ASSIGN_EQUIPMENT",
  /* The repair lifecycle. */
  "REPORT_EQUIPMENT_FAULT",
  "VIEW_REPAIRS_ALL",
  "VIEW_REPAIRS_DEPARTMENT",
  "VIEW_REPAIRS_OWN",
  "UPDATE_REPAIR_STATUS",
  "CONFIRM_EQUIPMENT_RETURN",
  /* Leave's middle tier: a department, which is not the same set as a
     manager's direct reports. */
  "APPROVE_LEAVE_DEPARTMENT",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type PermissionModule =
  | "people"
  | "equipment"
  | "repairs"
  | "hiring"
  | "leave"
  | "payroll"
  | "paySetup"
  | "loans"
  | "expenses"
  | "settings"
  | "access"
  | "records"
  | "audit";

export type PermissionAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "approve"
  | "assign"
  | "report"
  | "update"
  | "confirm"
  | "run"
  | "manage"
  | "invite"
  | "import"
  | "export";

/**
 * `own` is records that are theirs. `team` is their direct reports, which is
 * what `APPROVE_LEAVE` has always meant. `department` is everybody filed under
 * a department they head — a different set, because a department contains
 * people who do not report directly to its head. `all` is the company.
 */
export type PermissionScope = "own" | "team" | "department" | "all";

/**
 * Where each permission sits in the module × action grid.
 *
 * **Structure only — no copy.** Labels and descriptions come from
 * `GET /permissions/catalogue` for the reason the header gives: copy ships with
 * the enum so a permission added to the backend can never reach a screen as
 * `APPROVE_PAYROLL`. What lives here is the shape the grid is drawn from, which
 * demo mode needs at module-init time and therefore cannot fetch.
 *
 * Mirrors `CATALOGUE` in `approvehr-api/src/modules/permissions/service.ts`,
 * and the API wins if they disagree. Keyed by `PermissionKey`, so a key added
 * above without a place here is a compile error rather than a permission that
 * silently vanishes from the matrix.
 */
export const PERMISSION_SHAPE: Record<
  PermissionKey,
  { module: PermissionModule; action: PermissionAction; scope?: PermissionScope }
> = {
  VIEW_SALARIES: { module: "payroll", action: "view" },
  RUN_PAYROLL: { module: "payroll", action: "run" },
  APPROVE_PAYROLL: { module: "payroll", action: "approve" },
  MANAGE_PAY_STRUCTURE: { module: "paySetup", action: "manage" },
  APPROVE_LOANS: { module: "loans", action: "approve" },
  APPROVE_EXPENSES: { module: "expenses", action: "approve" },
  EDIT_RECORDS: { module: "people", action: "edit" },
  MANAGE_HIRING: { module: "hiring", action: "manage" },
  APPROVE_HIRING: { module: "hiring", action: "approve" },
  APPROVE_LEAVE: { module: "leave", action: "approve", scope: "team" },
  APPROVE_LEAVE_DEPARTMENT: {
    module: "leave",
    action: "approve",
    scope: "department",
  },
  APPROVE_LEAVE_ALL: { module: "leave", action: "approve", scope: "all" },
  MANAGE_SETTINGS: { module: "settings", action: "manage" },
  MANAGE_ROLES: { module: "access", action: "manage" },
  INVITE_STAFF: { module: "access", action: "invite" },
  EXPORT_DATA: { module: "records", action: "export" },
  IMPORT_DATA: { module: "records", action: "import" },
  VIEW_AUDIT: { module: "audit", action: "view" },
  VIEW_EQUIPMENT_ALL: { module: "equipment", action: "view", scope: "all" },
  VIEW_EQUIPMENT_DEPARTMENT: {
    module: "equipment",
    action: "view",
    scope: "department",
  },
  VIEW_EQUIPMENT_OWN: { module: "equipment", action: "view", scope: "own" },
  CREATE_EQUIPMENT: { module: "equipment", action: "create" },
  EDIT_EQUIPMENT: { module: "equipment", action: "edit" },
  DELETE_EQUIPMENT: { module: "equipment", action: "delete" },
  ASSIGN_EQUIPMENT: { module: "equipment", action: "assign" },
  REPORT_EQUIPMENT_FAULT: { module: "repairs", action: "report" },
  VIEW_REPAIRS_ALL: { module: "repairs", action: "view", scope: "all" },
  VIEW_REPAIRS_DEPARTMENT: {
    module: "repairs",
    action: "view",
    scope: "department",
  },
  VIEW_REPAIRS_OWN: { module: "repairs", action: "view", scope: "own" },
  UPDATE_REPAIR_STATUS: { module: "repairs", action: "update" },
  CONFIRM_EQUIPMENT_RETURN: { module: "repairs", action: "confirm" },
};
