"use client";

import { ApiError } from "@/lib/api/client";
import { leaveApi, type RolloverStatus } from "@/lib/api/leave";
import { createSharedResource } from "@/lib/shared-resource";
import { useSession } from "./session";

/**
 * Whether this year's leave carry-over has been applied, from the API.
 *
 * Connected only. The job that carries days into a new year runs on the server
 * every six hours and the demo has no such job, so offline this answers nothing
 * rather than a status for something that never ran: absent, not "not yet".
 *
 * ## The value is the outcome, not the status
 *
 * The fetcher resolves rather than rejecting, because a shared resource caches
 * what it resolves and a rejection arrives as `null`. `null` here must not be
 * readable as either answer, since "has not been applied" is a claim about the
 * company's balances. A failed read shows nothing at all.
 */

type Outcome = { status: RolloverStatus | null; error: ApiError | null };

const resource = createSharedResource<Outcome>(async (_key, signal) => {
  try {
    return { status: await leaveApi.rollover(signal), error: null };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    return { status: null, error: error instanceof ApiError ? error : null };
  }
});

const KEY = "company";

/** Null until it answers, offline, and when the read failed. */
export function useLeaveRollover(): RolloverStatus | null {
  const { isConnected } = useSession();
  return resource.use(isConnected ? KEY : null)?.status ?? null;
}
