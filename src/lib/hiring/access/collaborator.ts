"use client";

import { usePermissions } from "@/lib/permissions";
import { useSession } from "@/lib/store/session";

/**
 * Somebody invited to help hire with the company, and nothing else.
 *
 * A collaborator is a sign-in with **no employee record and no permissions**: they were
 * invited to interview for a job, so there is no personnel file behind them and nothing
 * in the company's records is theirs. Every screen but one would be a guaranteed refusal
 * for them (their leave, their payslip, their attendance), so the product shows them
 * only that one: My interviews, with only their jobs on it.
 *
 * ## Why it is read off the account and not asked of the API
 *
 * `employeeId` is null only for an account with no staff record behind it, and an
 * account with no permissions has no company-wide screen it may open. Both are already
 * in the session, so the sidebar can draw the right thing in the first paint rather than
 * showing the whole product for a moment and then taking it away. The API is still the
 * only thing that decides what a request may do: this decides what is worth showing.
 *
 * A demo session holds everything, so it is never one.
 */
export function isCollaboratorAccount(
  account: {
    isConnected: boolean;
    employeeId: string | null;
  },
  permissionCount: number,
): boolean {
  return (
    account.isConnected && account.employeeId === null && permissionCount === 0
  );
}

/**
 * The same question of an account the API has just handed back (a sign-in, an accepted
 * invitation), before the session has it. Where the invitation leads.
 */
export function isCollaboratorUser(user: {
  employeeId: string | null;
  permissions: readonly string[];
}): boolean {
  return user.employeeId === null && user.permissions.length === 0;
}

export function useIsCollaborator(): boolean {
  const { isConnected, employeeId } = useSession();
  const { permissions, loading } = usePermissions();
  /* Until the permissions have settled nobody is one: a person who holds some must
     never be shown the narrow product for the half-second before they arrive. */
  if (loading) return false;
  return isCollaboratorAccount({ isConnected, employeeId }, permissions.size);
}

/** Where a collaborator lands, whichever door they came in by. */
export const COLLABORATOR_HOME = "/hiring/my-interviews";

/**
 * The pages that are a collaborator's own: the room they were invited to, the inbox
 * their notifications land in, and the pages about their own sign-in and the look of
 * what they see. Everything else is somebody else's business, whatever it would say.
 */
const THEIRS = [
  COLLABORATOR_HOME,
  "/notifications",
  "/settings/security",
  "/settings/appearance",
] as const;

export function collaboratorMayOpen(pathname: string): boolean {
  return THEIRS.some(
    (home) => pathname === home || pathname.startsWith(`${home}/`),
  );
}
