"use client";

import { projectsApi } from "@/lib/api/projects";
import { createSharedResource } from "@/lib/shared-resource";
import { useEmployeeStore } from "@/lib/store/employees";
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
 * `enabled` is whether Projects is switched on: with it off nothing is asked.
 *
 * The demo has no server to ask, so there the reporting lines in the demo
 * directory answer it, which is the same fact the API reads (somebody has people
 * reporting to them). That is what lets a manager's persona see the page.
 */
export function useLeadsTeam(enabled: boolean): boolean {
  const { isConnected, employeeId } = useSession();
  const { directory } = useEmployeeStore();
  const key = enabled && isConnected && employeeId ? `api:${employeeId}` : null;
  const answered = leadsAnyone.use(key) === true;
  if (isConnected) return answered;
  return (
    enabled &&
    Boolean(employeeId) &&
    directory.some((person) => person.managerId === employeeId)
  );
}
