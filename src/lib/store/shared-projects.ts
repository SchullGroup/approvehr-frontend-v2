"use client";

import { useCallback } from "react";
import {
  sharedProjectsApi,
  type SharedColleague,
  type SharedProjects,
} from "@/lib/api/shared-projects";
import { useSession } from "@/lib/store/session";
import { useFetched } from "@/lib/use-fetched";

/**
 * The colleagues who shared a project with one person, for a list that is about to be ordered.
 *
 * `colleagues` is `null` for **everything that is not an answer**: not asked for yet, offline, the
 * company has the setting off (`{ on: false }`, which carries no list), a reader the API refuses, a
 * server one deploy behind with no such route, or a failed request. A screen **changes nothing** for
 * `null`: no ordering, no label, and above all no "they shared no projects", which only an `on` answer
 * with an empty list may say. A server that does not say makes no claim.
 *
 * It asks only when `enabled`, which the caller sets from the company's own setting
 * (`useFeatureSettings().workInAnswers === true`) and, for a table with a row per person, from
 * whether somebody has touched that row: two hundred rows must not open two hundred requests.
 */
export type SharedProjectsRead = {
  colleagues: SharedColleague[] | null;
  loading: boolean;
};

export function useSharedProjects(
  employeeId: string | null,
  enabled: boolean,
): SharedProjectsRead {
  const { isConnected } = useSession();
  const active = isConnected && enabled && employeeId !== null;
  const load = useCallback(
    (signal: AbortSignal) => sharedProjectsApi.read(employeeId ?? "", signal),
    [employeeId],
  );
  const fetched = useFetched<SharedProjects | null>(
    `shared-projects|${employeeId ?? ""}`,
    active,
    load,
  );
  if (!active) return { colleagues: null, loading: false };
  return {
    colleagues: fetched.data?.on === true ? fetched.data.colleagues : null,
    loading: fetched.loading,
  };
}
