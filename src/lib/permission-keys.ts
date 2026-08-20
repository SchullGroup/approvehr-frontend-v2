/**
 * The fifteen permission keys, and nothing else.
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
  /* Time off */
  "APPROVE_LEAVE",
  "APPROVE_LEAVE_ALL",
  /* Company */
  "MANAGE_SETTINGS",
  "MANAGE_ROLES",
  /* Records and reports */
  "EXPORT_DATA",
  "IMPORT_DATA",
  "VIEW_AUDIT",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
