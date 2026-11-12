"use client";

import { useCallback } from "react";
import type { ApiError } from "@/lib/api/client";
import { keptWorkApi, type KeptWork } from "@/lib/api/kept-work";
import { useSession } from "@/lib/store/session";
import { useFetched } from "@/lib/use-fetched";

/**
 * The work kept behind a final rating, read for one review.
 *
 * Connected only, and only once the rating is final (`enabled`): before that nothing was kept,
 * and asking would only collect an answer to a question nobody has. **Demo mode has no such
 * record** and says nothing about one: a record kept in a browser would describe no rating
 * anywhere, and "nothing was kept" would be a claim about a company that has no server to keep
 * anything. So offline this is quiet rather than an error.
 *
 * `data` is `null` when nothing is known: the reader may not see it (the API answers as if there
 * were no such review), the server is one deploy behind and has no such route, or the request
 * failed. A screen draws **nothing about a record** for `null`. It never reads `null` as "none was
 * kept", which is what `NOT_KEPT` is for, and only the server can say it.
 */
export type KeptWorkRead = {
  data: KeptWork | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
};

const noReload = () => undefined;

export function useKeptWork(reviewId: string, enabled: boolean): KeptWorkRead {
  const { isConnected } = useSession();
  const load = useCallback(
    (signal: AbortSignal) => keptWorkApi.read(reviewId, signal),
    [reviewId],
  );
  const fetched = useFetched<KeptWork | null>(
    `kept-work|${reviewId}`,
    isConnected && enabled,
    load,
  );
  if (!enabled || !isConnected) {
    return { data: null, loading: false, error: null, reload: noReload };
  }
  return fetched;
}
