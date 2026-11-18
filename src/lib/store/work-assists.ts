"use client";

import { useCallback } from "react";
import {
  workAssistsApi,
  type LinkedWork,
  type TaskSuggestions,
} from "@/lib/api/work-assists";
import { useSession } from "@/lib/store/session";
import { useFetched } from "@/lib/use-fetched";

/**
 * The two assists, as a screen asks for them.
 *
 * Each read is `null` for **everything that is not an answer**: not asked for yet, offline, the company
 * has the assists off (`{ on: false }`, which carries nothing else), a reader the API refuses, a server
 * one deploy behind with no such route, or a failed request. A screen **draws nothing** for `null`:
 * no list, no "no task is linked", no "nothing finished this week", which only an `on` answer with an
 * empty list may say. A hint that did not load is not a reason to hold up a confirmation or a weekly
 * line, so a failure is silent here and never a banner.
 *
 * Each asks only when `enabled`, which the caller sets from the company's own setting
 * (`useFeatureSettings().workAssists === true`) and from the reader having a reason to look (the
 * measure can be confirmed by this reader; the weekly-line box is open). A company that has not
 * switched the assists on, which is every company until it chooses, must not open a request per
 * measure on every objective it shows.
 */
export type LinkedWorkRead = {
  work: Extract<LinkedWork, { on: true }> | null;
  loading: boolean;
};

export function useLinkedWork(
  measureId: string | null,
  enabled: boolean,
): LinkedWorkRead {
  const { isConnected } = useSession();
  const active = isConnected && enabled && measureId !== null;
  const load = useCallback(
    (signal: AbortSignal) => workAssistsApi.linkedWork(measureId ?? "", signal),
    [measureId],
  );
  const fetched = useFetched<LinkedWork | null>(
    `linked-work|${measureId ?? ""}`,
    active,
    load,
  );
  if (!active) return { work: null, loading: false };
  return {
    work: fetched.data?.on === true ? fetched.data : null,
    loading: fetched.loading,
  };
}

export type TaskSuggestionsRead = {
  suggestions: Extract<TaskSuggestions, { on: true }> | null;
  loading: boolean;
  /** Asks again, for a person who has just logged a line. */
  reload: () => void;
};

export function useTaskSuggestions(
  goalId: string | null,
  enabled: boolean,
): TaskSuggestionsRead {
  const { isConnected } = useSession();
  const active = isConnected && enabled && goalId !== null;
  const load = useCallback(
    (signal: AbortSignal) =>
      workAssistsApi.taskSuggestions(goalId ?? "", signal),
    [goalId],
  );
  const fetched = useFetched<TaskSuggestions | null>(
    `task-suggestions|${goalId ?? ""}`,
    active,
    load,
  );
  if (!active) {
    return { suggestions: null, loading: false, reload: fetched.reload };
  }
  return {
    suggestions: fetched.data?.on === true ? fetched.data : null,
    loading: fetched.loading,
    reload: fetched.reload,
  };
}
