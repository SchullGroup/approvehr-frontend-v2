"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  assistantStatus,
  suggestDevelopment,
  suggestObjectives,
  suggestTaskSummary,
  type ApiSuggestOutcome,
} from "@/lib/api/ai";
import { useSession } from "./session";

/**
 * Suggestions, as three hooks and one gate.
 *
 * ## Nothing here writes, and that is the whole shape of the file
 *
 * Every other store in this directory has a read half and a mutation half.
 * This one has no mutation half at all, because a suggestion is not a record —
 * it lands in a form field and the ordinary store for that thing saves it.
 * `store/performance.ts#useObjectiveMutations` writes the objective, whether
 * somebody typed it or edited a suggested one into shape.
 *
 * If you find yourself adding a `saveSuggestion` here, the change to make
 * instead is a call to the existing mutation with the text the person edited.
 *
 * ## Why there is no `createPersistedState` and no demo branch
 *
 * Every other store falls back to seeded local data with no API. **This one
 * refuses**, and the reasoning is not the usual one about a write that would
 * never reach a payroll run — it is sharper than that.
 *
 * A canned suggestion is a fabricated one. Shipping three hand-written
 * "suggested objectives" in demo mode would put invented text on screen under a
 * label saying a model produced it from this company's goal, which is a false
 * claim about where a sentence came from — the exact class of thing
 * `verify-demo` exists to keep out of a production bundle, one level up. So
 * offline, `available` is false and every screen renders the same absence it
 * renders when no key is set: **no button**, and a sentence if somebody asks.
 *
 * The cost is that the feature cannot be demonstrated on a laptop with no API.
 * That is the right cost. A demo of a suggestion engine that is not running is
 * a demo of a text file.
 */

/** The absence, worded once. Matches `NO_ASSISTANT_REASON` on the API. */
export const SUGGESTIONS_UNAVAILABLE =
  "Suggestions are switched off — no assistant is connected. " +
  "Everything here still works; you write it yourself.";

/**
 * Whether to render a Suggest button at all.
 *
 * Asked once per session rather than per form. Returns `false` while loading,
 * deliberately: a button that appears a moment after the form does is worse
 * than one that was never there, because somebody has already started typing
 * and the layout moves under them.
 */
export function useAssistantAvailable(): {
  available: boolean;
  loading: boolean;
  /** The adapter's name. For a settings screen; never shown beside a suggestion. */
  assistant: string | null;
} {
  const { isConnected, isLoading } = useSession();
  /**
   * What the API said, or `undefined` until it has said anything.
   *
   * Only the *fetch* lives in state. Offline and still-loading are **derived
   * below** rather than written here, because setting state in an effect for a
   * fact already available during render is a cascading render — and the answer
   * offline never depended on a request in the first place.
   */
  const [answer, setAnswer] = useState<
    { available: boolean; assistant: string | null } | undefined
  >(undefined);

  useEffect(() => {
    /* Nothing to ask offline, and nothing to fall back to — see the header: a
       canned suggestion is a fabricated one. */
    if (isLoading || !isConnected) return;

    let cancelled = false;
    void (async () => {
      try {
        const status = await assistantStatus();
        if (cancelled) return;
        setAnswer({
          available: status.available,
          assistant: status.assistant,
        });
      } catch {
        /* A status call that fails is not worth a banner — it means no button,
           which is the same outcome as no assistant. Swallowed on purpose; the
           three suggestion calls report their own failures. */
        if (!cancelled) setAnswer({ available: false, assistant: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isConnected, isLoading]);

  if (isLoading) return { available: false, loading: true, assistant: null };
  if (!isConnected) return { available: false, loading: false, assistant: null };
  if (!answer) return { available: false, loading: true, assistant: null };
  return { ...answer, loading: false };
}

/* -------------------------------------------------------------- the requests */

export type SuggestState = {
  outcome: ApiSuggestOutcome | null;
  loading: boolean;
  /**
   * A refusal **about the request** — a goal already agreed, an employee nobody
   * has scored, somebody you may not see. Kept apart from
   * `outcome.available === false`, which is a refusal about the *assistant*.
   * They read differently and one of them is the person's own to fix.
   */
  error: string | null;
};

const IDLE: SuggestState = { outcome: null, loading: false, error: null };

/**
 * The shared machinery behind all three.
 *
 * `sequence` is the staleness guard, and it is the same defect
 * `usePayslipQuote` documents: somebody presses Suggest, edits the headline,
 * presses it again, and the first answer arrives last. Matching a sequence
 * number on the way out means the older answer is dropped rather than rendered
 * over the newer one — a suggestion built from a sentence the person has since
 * changed is a wrong answer wearing a right answer's label.
 */
function useSuggestion<TInput>(
  call: (input: TInput) => Promise<ApiSuggestOutcome>,
): SuggestState & {
  ask: (input: TInput) => Promise<void>;
  clear: () => void;
} {
  const [state, setState] = useState<SuggestState>(IDLE);
  const sequence = useRef(0);

  const ask = useCallback(
    async (input: TInput) => {
      const mine = ++sequence.current;
      setState({ outcome: null, loading: true, error: null });
      try {
        const outcome = await call(input);
        if (sequence.current !== mine) return;
        setState({ outcome, loading: false, error: null });
      } catch (caught) {
        if (sequence.current !== mine) return;
        setState({
          outcome: null,
          loading: false,
          /* The API's own sentence where it wrote one — it knows which
             competency is unscored or which goal is frozen, and nothing here
             does. Paraphrasing a server message locally is how the two stop
             agreeing. */
          error:
            caught instanceof ApiError
              ? caught.message
              : "Could not get a suggestion just now.",
        });
      }
    },
    [call],
  );

  /* Pressing Suggest again after discarding should start clean rather than
     briefly re-showing the old list under a spinner. */
  const clear = useCallback(() => {
    sequence.current += 1;
    setState(IDLE);
  }, []);

  return { ...state, ask, clear };
}

/** Objectives under a company goal. */
export const useObjectiveSuggestions = () =>
  useSuggestion<{ goalId: string; count?: number }>(suggestObjectives);

/** A progress note, from the headline somebody typed. */
export const useTaskSummarySuggestion = () =>
  useSuggestion<{ goalId: string; headline: string }>(suggestTaskSummary);

/** Development areas behind a low competency score. */
export const useDevelopmentSuggestions = () =>
  useSuggestion<{ employeeId: string; cycleId?: string }>(suggestDevelopment);
