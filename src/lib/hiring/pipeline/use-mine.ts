"use client";

import { createSharedResource } from "@/lib/shared-resource";
import { useSession } from "@/lib/store/session";
import { apiGateway } from "./api-gateway";
import { demoGateway } from "./demo-gateway";

/**
 * Whether this person has anything to do with interviews: on a panel, invited to
 * one, or hiring for a role.
 *
 * ## It is a question about the rows, so the rows are asked
 *
 * "My interviews" belongs in the sidebar of a panelist and of nobody else. No
 * permission can say which: a panelist holds none of the hiring ones, which is the
 * point of the page. So the shell asks the API once per session, and until it has
 * answered the row is absent, because a row that appears a moment late is better
 * than one that appears and is taken away under somebody's pointer.
 *
 * The key says which side it was asked of, so signing in as somebody else, or
 * leaving a demo, does not inherit the last answer.
 */
const answer = createSharedResource<boolean>(async (key, signal) => {
  const gateway = key.startsWith("demo") ? demoGateway : apiGateway;
  const access = await gateway.mine.access(
    signal ?? new AbortController().signal,
  );
  return access.hasAnyAccess;
});

export function useHaveInterviews(enabled: boolean): boolean {
  const { isConnected, employeeId } = useSession();
  const key = !enabled
    ? null
    : isConnected
      ? employeeId
        ? `api:${employeeId}`
        : null
      : DEMO_ENABLED
        ? "demo"
        : null;
  return answer.use(key) === true;
}
