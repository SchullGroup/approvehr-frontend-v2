"use client";

import { useCallback, useEffect } from "react";
import { ApiError } from "@/lib/api/client";
import {
  surveys as api,
  type AnswerBody,
  type ApiSurvey,
  type ApiSurveyInvite,
  type ApiSurveyResults,
  type SurveyBody,
  type SurveyQuestionBody,
} from "@/lib/api/surveys";
import { createSharedResource } from "@/lib/shared-resource";
import { useRevalidation } from "@/lib/revalidate";
import { useSession } from "./session";

/**
 * Surveys.
 *
 * ## Demo mode has none, and that is not an oversight
 *
 * Every other module in this product ships a seeded demo so the shape of the
 * feature is visible offline. This one deliberately does not, and the reason is
 * the module's own subject: a demo survey would have to come with demo
 * responses to show a result, and demo responses to an *anonymous* survey are
 * fabricated opinions attributed to a fabricated workforce. Everything else the
 * demo invents is a fact about a record; this would be an invented sentence
 * somebody supposedly wrote about their employer.
 *
 * Showing the refusal is also, unusually, the honest demonstration: the thing
 * being sold here is that answers cannot be traced, and a version running
 * entirely in the reader's own browser cannot demonstrate that at all.
 */

type Outcome<T> = { value: T; error: ApiError | null };

const all = createSharedResource<Outcome<ApiSurvey[]>>(async (_key, signal) => {
  try {
    return { value: await api.list(signal), error: null };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    return { value: [], error: error instanceof ApiError ? error : null };
  }
});

const mineRes = createSharedResource<Outcome<ApiSurveyInvite[]>>(
  async (_key, signal) => {
    try {
      return { value: await api.mine(signal), error: null };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        throw error;
      return { value: [], error: error instanceof ApiError ? error : null };
    }
  },
);

const oneSurvey = createSharedResource<Outcome<ApiSurvey | null>>(
  async (key, signal) => {
    try {
      return { value: await api.get(key, signal), error: null };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        throw error;
      return { value: null, error: error instanceof ApiError ? error : null };
    }
  },
);

const resultsRes = createSharedResource<Outcome<ApiSurveyResults | null>>(
  async (key, signal) => {
    try {
      return { value: await api.results(key, signal), error: null };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        throw error;
      return { value: null, error: error instanceof ApiError ? error : null };
    }
  },
);

export const DEMO_SURVEY_HEADING = "Surveys need the API";

/** The non-obvious half, and the one worth saying: it is about the promise. */
export const DEMO_SURVEY_REASON =
  "The point of a survey here is that an anonymous answer cannot be traced " +
  "back to the person who gave it, and that is something the server does — a " +
  "version running entirely in this browser could not demonstrate it, and " +
  "seeded answers would be invented opinions attributed to invented staff.";

export function useSurveys() {
  const { isConnected } = useSession();
  const outcome = all.use(isConnected ? "all" : null);

  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected || revalidation === 0) return;
    all.refresh("all");
  }, [isConnected, revalidation]);

  return {
    surveys: outcome?.value ?? [],
    loading: isConnected && outcome === undefined,
    error: outcome?.error ?? null,
    unavailable: !isConnected,
    reload: useCallback(() => all.refresh("all"), []),
  };
}

/** What this person has been asked and not yet answered. */
export function useMySurveys() {
  const { isConnected } = useSession();
  const outcome = mineRes.use(isConnected ? "mine" : null);

  return {
    invites: outcome?.value ?? [],
    loading: isConnected && outcome === undefined,
    error: outcome?.error ?? null,
    unavailable: !isConnected,
    reload: useCallback(() => mineRes.refresh("mine"), []),
  };
}

export function useSurvey(id: string | null) {
  const { isConnected } = useSession();
  const key = isConnected && id ? id : null;
  const outcome = oneSurvey.use(key);

  return {
    survey: outcome?.value ?? null,
    loading: key !== null && outcome === undefined,
    error: outcome?.error ?? null,
    unavailable: !isConnected,
    reload: useCallback(() => {
      if (key) oneSurvey.refresh(key);
    }, [key]),
  };
}

/**
 * The results, or the reason they are held back.
 *
 * The suppressed arm is **not** an error and must not render as one: it is the
 * feature working. The screen shows the API's own sentence, which says how many
 * more answers are needed, rather than an empty chart or a failure.
 */
export function useSurveyResults(id: string | null) {
  const { isConnected } = useSession();
  const key = isConnected && id ? id : null;
  const outcome = resultsRes.use(key);

  return {
    results: outcome?.value ?? null,
    loading: key !== null && outcome === undefined,
    error: outcome?.error ?? null,
    unavailable: !isConnected,
    reload: useCallback(() => {
      if (key) resultsRes.refresh(key);
    }, [key]),
  };
}

export function useSurveyActions() {
  const { isConnected } = useSession();

  const guard = useCallback(() => {
    if (!isConnected)
      throw new Error(`${DEMO_SURVEY_HEADING}. ${DEMO_SURVEY_REASON}`);
  }, [isConnected]);

  const refreshAll = useCallback((id?: string) => {
    all.refresh("all");
    mineRes.refresh("mine");
    if (id) {
      oneSurvey.refresh(id);
      resultsRes.refresh(id);
    }
  }, []);

  return {
    readOnly: !isConnected,
    create: useCallback(
      async (body: SurveyBody) => {
        guard();
        const survey = await api.create(body);
        refreshAll();
        return survey;
      },
      [guard, refreshAll],
    ),
    setQuestions: useCallback(
      async (id: string, questions: SurveyQuestionBody[]) => {
        guard();
        const survey = await api.setQuestions(id, questions);
        refreshAll(id);
        return survey;
      },
      [guard, refreshAll],
    ),
    invite: useCallback(
      async (id: string, employeeIds: string[]) => {
        guard();
        const survey = await api.invite(id, employeeIds);
        refreshAll(id);
        return survey;
      },
      [guard, refreshAll],
    ),
    open: useCallback(
      async (id: string) => {
        guard();
        const survey = await api.open(id);
        refreshAll(id);
        return survey;
      },
      [guard, refreshAll],
    ),
    close: useCallback(
      async (id: string) => {
        guard();
        const survey = await api.close(id);
        refreshAll(id);
        return survey;
      },
      [guard, refreshAll],
    ),
    respond: useCallback(
      async (id: string, answers: AnswerBody[]) => {
        guard();
        const result = await api.respond(id, answers);
        refreshAll(id);
        return result;
      },
      [guard, refreshAll],
    ),
  };
}
