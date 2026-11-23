"use client";

import { teamApi } from "@/lib/api/team";
import { useFetched } from "@/lib/use-fetched";
import { useSession } from "@/lib/store/session";

/* Module-level, so it is the same function on every render: `useFetched`
   re-runs whenever its loader changes, and an inline arrow asked the server
   for the team again on every render. */
const loadTeam = (signal: AbortSignal) => teamApi.list(signal);

/**
 * The reader's team (U22): their direct reports and anybody in a department
 * they head, without pay. Connected only; there is no demo team.
 */
export function useMyTeam() {
  const { isConnected } = useSession();
  const read = useFetched("my-team", isConnected, loadTeam);
  return { ...read, available: isConnected };
}
