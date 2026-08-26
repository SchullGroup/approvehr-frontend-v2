import { PERMISSION_KEYS, type PermissionKey } from "@/lib/permission-keys";

/**
 * The four roles the product ships with, and the demo people in them.
 *
 * ## Why this is a leaf and not part of the store
 *
 * It used to live inside `lib/store/permissions.ts`, which is where it is
 * *used*. Two other places now need the same answer and neither can reach that
 * module: `lib/store/session.ts` labels the offline sign-in picker, and
 * `lib/roles.ts` badges the signed-in person — and `store/permissions.ts`
 * imports `store/session.ts`, so an import the other way closes a cycle. The
 * same reasoning that put `lib/permission-keys.ts` below `lib/permissions.ts`
 * applies here: the seed is data, the store is behaviour, and data does not
 * import behaviour.
 *
 * ## Why the names match the backend exactly
 *
 * `SYSTEM_ROLES` in `approvehr-api/src/modules/permissions/service.ts` seeds
 * every real organisation with these four names, and the API freezes a built-in
 * role's name. So "Owner" here is the same string the API will send, which is
 * what lets `lib/roles.ts` recognise a tier by name in both modes instead of
 * having one rule for the demo and another for production.
 *
 * Payroll officer deliberately holds "Prepare payroll" and not "Approve
 * payroll": that split is the product's argument, and a demo that blurs it
 * argues the wrong thing.
 */
export type SeedRole = {
  id: string;
  name: string;
  description: string;
  permissions: PermissionKey[];
  /** Employee ids, which double as user ids in demo mode. */
  members: string[];
};

export const SEED_ROLES: SeedRole[] = DEMO_ENABLED ? [
  {
    id: "role-owner",
    name: "Owner",
    description: "Full access. Created with the company and cannot be deleted.",
    /* Spread rather than the array itself: a role must not be able to hand
       the canonical list to a caller that mutates it. */
    permissions: [...PERMISSION_KEYS],
    members: ["p-02"],
  },
  {
    id: "role-hr-manager",
    name: "HR manager",
    description: "Runs people operations. Holds no payroll permission at all.",
    permissions: [
      "VIEW_SALARIES",
      "EDIT_RECORDS",
      "APPROVE_LEAVE_ALL",
      "MANAGE_HIRING",
      "EXPORT_DATA",
      "IMPORT_DATA",
      "MANAGE_SETTINGS",
      "INVITE_STAFF",
    ],
    members: ["p-05", "p-06"],
  },
  {
    id: "role-payroll-officer",
    name: "Payroll officer",
    description: "Prepares the run. Somebody else approves it.",
    permissions: [
      "VIEW_SALARIES",
      "RUN_PAYROLL",
      "MANAGE_PAY_STRUCTURE",
      "EXPORT_DATA",
    ],
    members: ["p-08"],
  },
  {
    id: "role-employee",
    name: "Employee",
    description: "Their own record, their own payslips, their own requests.",
    permissions: [],
    members: ["p-01", "p-03", "p-04", "p-07", "p-09", "p-10"],
  },
] : [];

/**
 * The roles a demo persona holds, straight from the seed.
 *
 * Ignores the localStorage diff on purpose, because the two callers that need it
 * are below the store: the sign-in picker runs before any session exists, and
 * `signInOptions()` is a plain function rather than a hook. Anything rendering
 * *inside* the app should read `useDemoRoles` in `lib/store/permissions.ts`
 * instead, which honours edits made on `/settings/roles`.
 *
 * Returns `[]` for somebody in no role. That is a real state — the API can
 * describe an account holding none — and inventing "Employee" for them would be
 * a claim about their access rather than a description of it.
 */
export function seedRolesFor(employeeId: string): { id: string; name: string }[] {
  return SEED_ROLES.filter((role) => role.members.includes(employeeId)).map(
    ({ id, name }) => ({ id, name }),
  );
}
