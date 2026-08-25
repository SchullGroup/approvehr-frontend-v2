"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useSession } from "./session";
import { TODAY } from "@/lib/today";
import { createPersistedState } from "./persisted";

/**
 * Decisions on approvals that have no module store behind them yet.
 *
 * The leave rows in `/approvals` are **not** here — they are derived from
 * `useLeaveStore`, and deciding one writes to the leave request itself. This
 * store exists only for the kinds that are still seed rows: the payroll run,
 * offers, requisitions, expenses, loans and record changes.
 *
 * That split is deliberate rather than transitional sloppiness. As each of those
 * modules grows a real store, its rows should move over to the derived path the
 * same way leave did, and the entries here should shrink to nothing. Keeping a
 * decision in a second place is exactly the drift that made the inbox and the
 * leave screen disagree in the first place, so nothing should be added here that
 * has somewhere better to live.
 */

export type Decision = "approved" | "declined";

export type DecisionRecord = {
  decision: Decision;
  at: string;
  byId: string;
  note?: string;
};

type ApprovalState = {
  decisions: Record<string, DecisionRecord>;
};

const EMPTY: ApprovalState = { decisions: {} };

const store = createPersistedState<ApprovalState>({
  key: "approvehr.approvals.store",
  empty: EMPTY,
  version: 1,
});

export function useApprovalStore() {
  const { actingId } = useSession();
  const state = useSyncExternalStore(
    store.subscribe,
    store.read,
    store.getServerSnapshot,
  );

  const decide = useCallback((id: string, decision: Decision, note?: string) => {
    const s = store.current();
    store.commit({
      decisions: {
        ...s.decisions,
        [id]: {
          decision,
          at: TODAY,
          byId: actingId,
          ...(note ? { note } : {}),
        },
      },
    });
  }, [actingId]);

  const decideMany = useCallback((ids: string[], decision: Decision) => {
    if (ids.length === 0) return;
    const s = store.current();
    const next = { ...s.decisions };
    for (const id of ids) {
      next[id] = { decision, at: TODAY, byId: actingId };
    }
    store.commit({ decisions: next });
  }, [actingId]);

  const reopen = useCallback((id: string) => {
    const s = store.current();
    if (!s.decisions[id]) return;
    const next = { ...s.decisions };
    delete next[id];
    store.commit({ decisions: next });
  }, []);

  const resetAll = useCallback(() => store.reset(), []);

  return {
    decisions: state.decisions,
    decisionFor: (id: string) => state.decisions[id],
    decide,
    decideMany,
    reopen,
    resetAll,
  };
}
