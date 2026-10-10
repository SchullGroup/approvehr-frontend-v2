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
import { findScriptedAnswer } from "@/lib/mock/sales-script-qa";
import { salesScriptAssistantName, scriptedFallback } from "@/lib/sales-script";

/**
 * Suggestions, as three hooks and one gate. Nothing here writes — a
 * suggestion lands in a form field and the ordinary store for that thing
 * saves it (`store/performance.ts#useObjectiveMutations` etc). If you find
 * yourself adding a `saveSuggestion` here, call the existing mutation with
 * the edited text instead.
 *
 * No `createPersistedState`, no demo branch. A canned suggestion is a
 * fabricated one — offline, `available` is false everywhere, same as with no
 * key set.
 */

/** Matches `NO_ASSISTANT_REASON` on the API. */
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
 * One request per session, not one per component — the sidebar reads this on
 * every page. Same singleton shape as `store/features.ts`. Keyed by session
 * so signing into another company re-asks.
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

/** Whether to render a Suggest button. Returns `loading: true` while unknown. */
export function useAssistantAvailable(): {
  available: boolean;
  loading: boolean;
  /** The adapter's name. For a settings screen; never shown beside a suggestion. */
  assistant: string | null;
  /** Why not, when not. The API's own sentence, for the settings screen. */
  reason: string | null;
} {
  const { isConnected, isLoading, user } = useSession();
  const answer = useSyncExternalStore(
    subscribeStatus,
    () => cache,
    () => null,
  );

  const key = `api:${user?.organizationId ?? "self"}`;

  useEffect(() => {
    if (isLoading || !isConnected) return;
    void ensureStatus(key);
  }, [isConnected, isLoading, key]);

  if (SALES_SCRIPT_ENABLED)
    return {
      available: true,
      loading: false,
      assistant: salesScriptAssistantName(),
      reason: null,
    };

  if (isLoading)
    return { available: false, loading: true, assistant: null, reason: null };
  if (!isConnected)
    return {
      available: false,
      loading: false,
      assistant: null,
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
  /** A refusal about the request, kept apart from `outcome.available === false`. */
  error: string | null;
};

const IDLE: SuggestState = { outcome: null, loading: false, error: null };

/** Staleness guard: an older answer must not land after a newer request. */
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
          error:
            caught instanceof ApiError
              ? caught.message
              : "Could not get a suggestion just now.",
        });
      }
    },
    [call],
  );

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

/** Separate calls so the wizard keeps whichever half arrives first. */
export const usePeriodGoalDraft = () =>
  useSuggestion<{ text: string; count?: number }>(draftPeriodGoals);

export const usePeriodQuestionDraft = () =>
  useSuggestion<{ text: string; count?: number }>(draftPeriodQuestions);

/** Asking a question about the company's records. Each answer replaces the last. */
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
      if (SALES_SCRIPT_ENABLED) {
        const found = findScriptedAnswer(question);
        setError(null);
        const used = found?.used ?? [];
        setAnswer({
          available: true,
          text: found ? found.answer : scriptedFallback(),
          used,
        });
        return;
      }

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
        setError(
          caught instanceof ApiError
            ? caught.message
            : "That did not go through. Try again.",
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
