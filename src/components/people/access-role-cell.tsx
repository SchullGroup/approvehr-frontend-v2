"use client";

import { Badge } from "@/components/ui";
import type { EmployeeRoleEntry } from "@/lib/store/permissions";

/**
 * The access role somebody holds, or an honest account of why there is none to
 * show.
 *
 * The **access** role — Administrator, HR manager, Payroll analyst and the rest
 * — not the job title. Those are two different facts and the directory shows
 * both: the job title is the subtitle under each name.
 *
 * ## Four states, and three of them are absences
 *
 * **None of the three may render as "no role".** Saying somebody holds no
 * access is a claim about their access, and it is only ever made from a read
 * that succeeded — the same rule that keeps an absent payroll figure off a
 * payslip as an absence rather than a zero, and for the same reason: a wrong
 * claim is worse than a missing one.
 *
 * | `roles` | `canLogin` | Renders | Because |
 * |---|---|---|---|
 * | `null` | any | an em dash | Not known. Still loading, or the roles could not be read, or one role's member list failed and this person is in none of the rest — so they may well be in the one that failed. |
 * | `[]` | `false` | "No login" | No account exists, so holding no role is correct *and* explicable. Saying why is more use to the reader than a dash. |
 * | `[]` | `true` / unknown | a warning badge | An account that holds no role. A real state the API can describe, and worth seeing rather than hiding: it can sign in and do nothing at all. |
 * | one or more | any | one badge each | — |
 *
 * `canLogin` is optional on `Employee`, so `undefined` is possible and is
 * **not** treated as `false`: an unknown login state must not produce a
 * confident "No login".
 *
 * ## Why the badges are plural, and why they are all one colour
 *
 * Plural because two roles can both carry a permission, which is exactly what
 * somebody auditing access needs to see rather than one "primary" role chosen
 * by us.
 *
 * All `neutral` because colouring Administrator differently from Employee would
 * invent a hierarchy the API does not state — it returns a permission list per
 * role, not a rank. Highlighting the roles that carry *sensitive* permissions
 * is a real improvement and a deliberate one: it needs the permission set kept
 * through `rolesByEmployee`'s sweep, so it is not smuggled in here.
 */
export function AccessRoleCell({
  roles,
  canLogin,
  loading = false,
}: {
  /** `null` means not known. Never pass `[]` for an unread state. */
  roles: EmployeeRoleEntry[] | null;
  canLogin: boolean | undefined;
  loading?: boolean;
}) {
  if (roles === null) {
    return (
      <span
        className="text-faint"
        title={
          loading
            ? "Still loading"
            : "The company's roles could not be read, so this is unknown — not an account that holds no role."
        }
      >
        &mdash;
      </span>
    );
  }

  if (roles.length === 0) {
    return canLogin === false ? (
      <span className="text-muted">No login</span>
    ) : (
      <Badge tone="warning" size="sm">
        No role
      </Badge>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {roles.map((role) => (
        <Badge key={role.id} size="sm">
          {role.name}
        </Badge>
      ))}
    </div>
  );
}
