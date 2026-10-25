"use client";

import { projectsApi } from "@/lib/api/projects";
import { createSharedResource } from "@/lib/shared-resource";
import { useSession } from "@/lib/store/session";

/**
 * Whether this person leads anybody, for the sidebar's "Team tasks" row.
 *
 * ## It is a question about the rows, so the rows are asked
 *
 * "Your people" is the reporting line plus the departments you head; no
 * permission says who has any. The API answers with an empty list for somebody
 * who leads nobody, so the shell asks once per session and the row is absent
 * until the answer is yes. A row that appears a moment late is better than one
 * that appears and is taken away under somebody's pointer, and the sidebar
 * never waits on it.
 *
 * Keyed by the employee so signing in as somebody else does not inherit the
 * last answer. A failed request reads as "no" (and is held closed for ten
 * seconds by the resource), which hides the row rather than showing a page
 * that cannot load.
 */
const leadsAnyone = createSharedResource<boolean>(async (_key, signal) => {
  const people = await projectsApi.teamTasks("open", signal);
  return people.length > 0;
});

export function useLeadsTeam(enabled: boolean): boolean {
  const { isConnected, employeeId } = useSession();
  const key = enabled && isConnected && employeeId ? `api:${employeeId}` : null;
  return leadsAnyone.use(key) === true;
}
