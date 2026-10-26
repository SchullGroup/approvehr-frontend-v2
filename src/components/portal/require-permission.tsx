"use client";

import { ShieldAlert } from "lucide-react";
import { EmptyState, Skeleton } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import {
  hasAnyPermission,
  usePermissions,
  type PermissionKey,
} from "@/lib/permissions";

/**
 * A screen that is not for this reader says so, in one voice.
 *
 * ## Why this exists
 *
 * Two doors were open that should not have been. A plain employee who typed
 * `/settings` got the whole admin hub — setup progress, billing, module
 * switches, job roles — and one who typed `/payroll/runs/new` got the payroll
 * wizard with a Continue button. The API refused every write behind them, so
 * nothing was exposed; but "an interface that only offers what will work" is
 * the point of having permissions in the browser at all (`lib/permissions.ts`
 * says so), and a screen that offers a payroll run to somebody who cannot start
 * one is a screen that teaches people not to trust the rest.
 *
 * `/payroll` and `/people` already refused correctly, each with its own copy of
 * the same `EmptyState`. This is that, written once, for a page that cannot be
 * edited to carry its own — a route's `page.tsx` is a server component with a
 * header and a body, and the screen under it should not have to know it is being
 * guarded.
 *
 * ## The rules it keeps
 *
 * - **Nothing is offered while permissions are unknown.** The set is empty until
 *   the session resolves and arrives from the token's claims, which is
 *   effectively instant — so this shows a short skeleton, not the refusal. A
 *   flash of "You cannot…" at somebody who can is a false claim, and a flash of
 *   the screen at somebody who cannot is the bug this fixes.
 * - **It names the permission as the roles screen names it.** "Ask somebody who
 *   holds it" is only an instruction if the reader can find the thing they are
 *   asking for.
 * - **An array means any one of them**, which is what a screen that is shared
 *   by a preparer and an approver wants.
 * - **The API stays the authority.** This decides what to offer, never what is
 *   allowed.
 */

/**
 * How the roles screen names each permission — the `label` the API's catalogue
 * sends, which the roles editor shows. Only what a gate here has needed; a key
 * not listed falls back to its own words, so a new gate works before somebody
 * remembers to add copy.
 */
const NAME: Partial<Record<PermissionKey, string>> = {
  VIEW_SALARIES: "See salaries",
  RUN_PAYROLL: "Prepare payroll",
  APPROVE_PAYROLL: "Approve payroll",
  MANAGE_SETTINGS: "Change company settings",
  MANAGE_ROLES: "Manage access",
  EDIT_RECORDS: "Edit people",
  IMPORT_DATA: "Import a spreadsheet",
};

function nameOf(key: PermissionKey): string {
  const known = NAME[key];
  if (known) return known;
  const words = key.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** “Prepare payroll” · “Prepare payroll” or “Approve payroll” */
export function permissionPhrase(
  permissions: readonly PermissionKey[],
): string {
  const quoted = permissions.map((key) => `“${nameOf(key)}”`);
  if (quoted.length <= 1) return `the ${quoted[0] ?? ""} permission`;
  return `the ${quoted.slice(0, -1).join(", ")} or ${quoted[quoted.length - 1]} permission`;
}

export function NoAccess({
  title,
  what,
  permission,
}: {
  title: string;
  /** What the screen is for, as the start of a sentence: "Preparing a payroll". */
  what: string;
  permission: PermissionKey | readonly PermissionKey[];
}) {
  const needed = Array.isArray(permission)
    ? (permission as readonly PermissionKey[])
    : [permission as PermissionKey];
  return (
    <EmptyState
      icon={<ShieldAlert aria-hidden="true" />}
      title={title}
      description={`${what} needs ${permissionPhrase(needed)}. Ask somebody who holds it.`}
    />
  );
}

function GateSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export function RequirePermission({
  permission,
  title,
  what,
  pageTitle,
  children,
}: {
  /** What the reader must hold. An array means any one of them. */
  permission: PermissionKey | readonly PermissionKey[];
  /** The refusal's heading: "You cannot run payroll". */
  title: string;
  /** See `NoAccess`. */
  what: string;
  /**
   * Set when this wraps a whole page, header included: the refusal then carries
   * its own header and body, as `/payroll`'s does. Leave it off when the page
   * renders its header outside and only the body is being guarded.
   */
  pageTitle?: string;
  children: React.ReactNode;
}) {
  const { permissions, loading } = usePermissions();
  const needed = Array.isArray(permission)
    ? (permission as readonly PermissionKey[])
    : [permission as PermissionKey];

  const allowed = hasAnyPermission(permissions, needed);
  if (allowed) return <>{children}</>;

  const body = loading ? (
    <GateSkeleton />
  ) : (
    <NoAccess title={title} what={what} permission={needed} />
  );

  if (pageTitle === undefined) return body;
  return (
    <>
      <PageHeader title={pageTitle} />
      <PageBody>{body}</PageBody>
    </>
  );
}
