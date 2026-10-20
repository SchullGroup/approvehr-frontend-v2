"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useSession } from "@/lib/store/session";
import { createPersistedState } from "@/lib/store/persisted";

/**
 * Board or table, remembered for whoever is looking.
 *
 * Kept per account on this browser, not per role: somebody who works a list as a
 * table works every list that way, and being put back on a board each time a
 * different role is opened would be the product forgetting what they asked for.
 *
 * It is a convenience and nothing depends on it: if storage is blocked the board
 * is shown and the choice lasts until the page is closed.
 */

export type PipelineView = "board" | "table";

export const pipelineViewState = createPersistedState<{
  byUser: Record<string, PipelineView>;
}>({
  key: "approvehr.hiring.pipeline-view.store",
  empty: { byUser: {} },
  version: 1,
});

export function usePipelineView(): [
  PipelineView,
  (view: PipelineView) => void,
] {
  const { user } = useSession();
  const who = user?.id ?? "demo";
  const state = useSyncExternalStore(
    pipelineViewState.subscribe,
    pipelineViewState.read,
    pipelineViewState.getServerSnapshot,
  );

  const set = useCallback(
    (view: PipelineView) => {
      const current = pipelineViewState.current();
      pipelineViewState.commit({ byUser: { ...current.byUser, [who]: view } });
    },
    [who],
  );

  return [state.byUser[who] ?? "board", set];
}
