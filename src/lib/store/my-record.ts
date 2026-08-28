"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  employees,
  type ApiPendingChange,
  type ApiSelfUpdateOutcome,
} from "@/lib/api/endpoints";
import { useRevalidation } from "@/lib/revalidate";
import { useSession } from "./session";

/**
 * The caller's own record, changed by them.
 *
 * ## Why this is not part of `employees-api.ts`
 *
 * That store's `update` takes an id and is the HR path: it can change anybody's
 * salary and needs `EDIT_RECORDS`. This one takes no id, needs no permission,
 * and can only touch the fields the API's `self-service.ts` lists. Two paths
 * with different rules, and folding them together is how somebody eventually
 * calls the wrong one from a screen where it happens to work.
 *
 * ## The outcome is three lists, not a saved record
 *
 * Because that is what actually happens. Somebody who corrects their phone
 * number and their account number in one sitting gets the first written and the
 * second waiting on payroll — and the screen has to say both. A hook returning
 * the updated employee would show the account unchanged with nothing to explain
 * it, which reads as a save that silently failed.
 *
 * ## No demo branch
 *
 * The whole point of the sensitive tier is that the value does **not** reach
 * the record until somebody agrees. A local implementation would either write
 * it immediately — demonstrating the opposite of the feature — or hold a
 * pretend approval nobody can act on. Offline the screen stays read-only and
 * says why, which is the same call `store/departments.ts` made and for a
 * sharper reason: this one is a control, not a convenience.
 */

/** The wording used wherever the refusal is shown. */
export const SELF_SERVICE_OFFLINE =
  "Changing your details needs the API. Payroll checks the ones that affect " +
  "your pay, and there is nobody to check them here.";

export type MyChangesState = {
  changes: ApiPendingChange[];
  loading: boolean;
  error: ApiError | null;
  /** False offline. The screen renders read-only and says why. */
  editable: boolean;
  reload: () => void;
};

/** What this person has waiting on payroll. */
export function useMyPendingChanges(): MyChangesState {
  const { isConnected, isLoading } = useSession();
  /**
   * Only the *answer* lives in state.
   *
   * Offline and still-loading are derived during render instead, because they
   * are facts already available there — writing them from an effect is a
   * cascading render, which `react-hooks/set-state-in-effect` catches, and the
   * answer offline never depended on a request in the first place. Same shape
   * as `store/ai.ts`.
   */
  const [answer, setAnswer] = useState<
    { changes: ApiPendingChange[]; error: ApiError | null } | undefined
  >(undefined);
  const [nonce, setNonce] = useState(0);

  /* Re-ask when somebody comes back to the window. An approver deciding in the
     other tab is exactly the case: this list is the only thing that tells the
     subject their account number went through. */
  const revalidation = useRevalidation();

  useEffect(() => {
    if (isLoading || !isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await employees.myChanges(controller.signal);
        if (!cancelled) setAnswer({ changes: result.changes, error: null });
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        if (!cancelled) {
          setAnswer({
            changes: [],
            error: caught instanceof ApiError ? caught : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, isLoading, nonce, revalidation]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  if (isLoading) {
    return { changes: [], loading: true, error: null, editable: false, reload };
  }
  if (!isConnected) {
    return { changes: [], loading: false, error: null, editable: false, reload };
  }
  if (!answer) {
    return { changes: [], loading: true, error: null, editable: true, reload };
  }
  return { ...answer, loading: false, editable: true, reload };
}

export type SaveMineResult =
  | { ok: true; outcome: ApiSelfUpdateOutcome }
  | { ok: false; error: ApiError | null };

/**
 * Save what is theirs, propose what is not.
 *
 * Never throws for a refused field — the API reports those in `refused` with
 * who to ask, and turning that into an exception would lose the half that
 * succeeded. It throws only for a request that failed outright, which the
 * caller renders as a failure rather than as an outcome.
 */
export function useMyRecordMutations() {
  const { isConnected } = useSession();

  const save = useCallback(
    async (patch: Record<string, unknown>): Promise<SaveMineResult> => {
      if (!isConnected) {
        return { ok: false, error: null };
      }
      try {
        return { ok: true, outcome: await employees.updateMine(patch) };
      } catch (caught) {
        return {
          ok: false,
          error: caught instanceof ApiError ? caught : null,
        };
      }
    },
    [isConnected],
  );

  return { save, editable: isConnected };
}
