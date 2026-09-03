"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ApiError } from "@/lib/api/client";
import {
  assistantStatus,
  draftPeriodGoals,
  draftPeriodQuestions,
  suggestDevelopment,
  suggestObjectives,
  suggestTaskSummary,
  ask as askApi,
  type ApiAnswer,
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

/* --------------------------------------------------- the status, asked once */

type Status = {
  available: boolean;
  assistant: string | null;
  reason: string | null;
};

/**
 * One request per session, not one per component.
 *
 * This used to be a `useState` inside the hook, which was right while the only
 * reader was a form that mounted occasionally. It is not right now the
 * **sidebar** reads it: `nav.tsx` hides the assistant's own nav item when no
 * assistant is wired, so without a shared answer every page load would spend a
 * request on `/ai/status` — and `.env.example` records that the rate limit is
 * 300 in fifteen minutes, which "opening three screens spends".
 *
 * Same singleton shape as `store/features.ts`, which the nav already reads on
 * every page for the same reason. Keyed by session so signing into another
 * company re-asks rather than inheriting the last one's answer.
 */
let cache: Status | null = null;
let loadedFor: string | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const subscribeStatus = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

function setStatus(next: Status) {
  cache = next;
  listeners.forEach((listener) => listener());
}

async function ensureStatus(key: string): Promise<void> {
  if (loadedFor === key) return;
  if (inflight) return inflight;
  loadedFor = key;

  inflight = (async () => {
    try {
      const status = await assistantStatus();
      setStatus({
        available: status.available,
        assistant: status.assistant,
        reason: status.reason ?? null,
      });
    } catch {
      /* A status call that fails is not worth a banner — it means no button,
         which is the same outcome as no assistant. Swallowed on purpose; the
         suggestion and chat calls report their own failures.
         The settings screen is the one reader that wants to know it was the
         call rather than the configuration, so it gets a sentence saying so
         instead of the API's. */
      setStatus({
        available: false,
        assistant: null,
        reason: "Could not ask the server whether an assistant is wired.",
      });
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

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
  /**
   * Why not, when not. The API's own sentence.
   *
   * Also for the settings screen, and for the same reason `assistant` is: a form
   * renders **no button** and says nothing, so the only place this can be read
   * is a screen somebody opens on purpose to find out. Until `/settings/ai`
   * existed there was nowhere, and an administrator had no way to learn the
   * assistant was a thing at all — which is how "I didn't see a single AI
   * element" happens to a feature that is built, mounted in three places and
   * merely switched off.
   */
  reason: string | null;
} {
  const { isConnected, isLoading, user } = useSession();
  /**
   * What the API said, or `null` until it has said anything.
   *
   * Only the *fetch* lives in the cache. Offline and still-loading are
   * **derived below** rather than written into it, because setting state for a
   * fact already available during render is a cascading render — and the answer
   * offline never depended on a request in the first place.
   */
  const answer = useSyncExternalStore(
    subscribeStatus,
    () => cache,
    () => null,
  );

  const key = `api:${user?.organizationId ?? "self"}`;

  useEffect(() => {
    /* Nothing to ask offline, and nothing to fall back to — see the header: a
       canned suggestion is a fabricated one. */
    if (isLoading || !isConnected) return;
    void ensureStatus(key);
  }, [isConnected, isLoading, key]);

  if (isLoading)
    return { available: false, loading: true, assistant: null, reason: null };
  if (!isConnected)
    return {
      available: false,
      loading: false,
      assistant: null,
      /* Not a configuration problem, and the settings screen must not report it
         as one — there is nothing to switch on here, there is no server. */
      reason: SUGGESTIONS_UNAVAILABLE,
    };
  if (!answer)
    return { available: false, loading: true, assistant: null, reason: null };
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

/**
 * The two halves of a drafted period.
 *
 * Separate hooks over separate calls, so the wizard can render one arriving
 * while the other is still in flight and keep whichever succeeds. Sharing one
 * `SuggestState` would make a slow questions call blank the goals somebody was
 * already reading.
 */
export const usePeriodGoalDraft = () =>
  useSuggestion<{ text: string; count?: number }>(draftPeriodGoals);

export const usePeriodQuestionDraft = () =>
  useSuggestion<{ text: string; count?: number }>(draftPeriodQuestions);


/**
 * Asking a question about the company's records.
 *
 * A hook rather than a store: there is nothing to persist and nothing anybody
 * else needs to read. Each answer replaces the last, deliberately — this is a
 * lookup, not a conversation, and every question the API answers already
 * carries its own whole context. A transcript here would imply a memory the
 * backend does not have.
 */
export function useAsk(): {
  ask: (question: string) => Promise<void>;
  clear: () => void;
  answer: ApiAnswer | null;
  asking: boolean;
  error: string | null;
} {
  const { isConnected } = useSession();
  const [answer, setAnswer] = useState<ApiAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (question: string) => {
      if (!isConnected) {
        setError(
          "Asking needs the API. The demo has no records behind it to answer from.",
        );
        return;
      }
      setAsking(true);
      setError(null);
      try {
        setAnswer(await askApi(question));
      } catch (caught) {
        /* The API's own sentence where it wrote one — it knows whether this
           was a rate limit, a refusal or a bad question, and nothing here
           does. */
        setError(
          caught instanceof ApiError ? caught.message : "That did not go through. Try again.",
        );
      } finally {
        setAsking(false);
      }
    },
    [isConnected],
  );

  return {
    ask: run,
    clear: useCallback(() => {
      setAnswer(null);
      setError(null);
    }, []),
    answer,
    asking,
    error,
  };
}
