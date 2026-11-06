"use client";

import { projectsApi } from "@/lib/api/projects";
import { createSharedResource } from "@/lib/shared-resource";
import { useEmployeeStore } from "@/lib/store/employees";
import { useCan } from "@/lib/permissions";
import { useSession } from "@/lib/store/session";

/**
 * Whether this person leads anybody, for the sidebar's "Team tasks" row.
 *
 * ## It is a question about the rows, so the rows are asked
 *
 * "Your people" is the reporting line plus the departments you head; no
 * permission says who has any. The API answers `leads: false` for somebody
 * who leads nobody, so the shell asks once per session (`GET /projects/team-tasks/leads`, an existence check that reads no tasks) and the row is absent
 * until the answer is yes. A row that appears a moment late is better than one
 * that appears and is taken away under somebody's pointer, and the sidebar
 * never waits on it.
 *
 * Keyed by the employee so signing in as somebody else does not inherit the
 * last answer. A failed request reads as "no" (and is held closed for ten
 * seconds by the resource), which hides the row rather than showing a page
 * that cannot load.
 */
const leadsAnyone = createSharedResource<boolean>((_key, signal) =>
  projectsApi.teamLeads(signal),
);

/**
 * Whether this person has people reporting to them: `true`, `false`, or `null`
 * while the API has not said. `enabled` is whether Projects is switched on: with
 * it off nothing is asked.
 *
 * The demo has no server to ask, so there the reporting lines in the demo
 * directory answer it, which is the same fact the API reads (somebody has people
 * reporting to them). That is what lets a manager's persona see the page.
 */
function useLeads(enabled: boolean): boolean | null {
  const { isConnected, employeeId } = useSession();
  const { directory } = useEmployeeStore();
  const key = enabled && isConnected && employeeId ? `api:${employeeId}` : null;
  const answered = leadsAnyone.use(key);
  if (isConnected) return answered;
  return (
    enabled &&
    Boolean(employeeId) &&
    directory.some((person) => person.managerId === employeeId)
  );
}

/** For the sidebar: does this person lead anybody? Unknown reads as no. */
export function useLeadsTeam(enabled: boolean): boolean {
  return useLeads(enabled) === true;
}

/**
 * What the Team tasks page is for this person.
 *
 * - `leads`: they have people reporting to them (or a department to head), so
 *   "Open work" is about those people. `null` until the API has said.
 * - `everyone`: they hold `EDIT_RECORDS`, so "Completed" reads everybody's
 *   finished work whether or not anybody reports to them. Open work is still
 *   only the people they lead, so for HR who lead nobody it would be an empty
 *   page, and the screen leaves it out rather than showing it.
 */
export type TeamScope = { everyone: boolean; leads: boolean | null };

export function useTeamScope(enabled: boolean): TeamScope {
  const everyone = useCan("EDIT_RECORDS");
  const leads = useLeads(enabled);
  return { everyone: enabled && everyone, leads };
}
