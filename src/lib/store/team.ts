"use client";

import { teamApi } from "@/lib/api/team";
import { useFetched } from "@/lib/use-fetched";
import { useSession } from "@/lib/store/session";

/**
 * The reader's team (U22): their direct reports and anybody in a department
 * they head, without pay. Connected only; there is no demo team.
 */
export function useMyTeam() {
  const { isConnected } = useSession();
  const read = useFetched("my-team", isConnected, (signal) =>
    teamApi.list(signal),
  );
  return { ...read, available: isConnected };
}
