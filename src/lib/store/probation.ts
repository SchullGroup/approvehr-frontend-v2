"use client";

import { useCallback, useEffect, useMemo } from "react";
import { ApiError } from "@/lib/api/client";
import {
  employees as employeesApi,
  type ApiEmploymentChange,
  type ApiProbationDue,
  type ApiProbationRow,
  type ApiProbationUndated,
  type ProbationDecisionBody,
} from "@/lib/api/endpoints";
import { createSharedResource } from "@/lib/shared-resource";
import { useRevalidation } from "@/lib/revalidate";
import { useEmployeeDirectory } from "./employees-api";
import { useSession } from "./session";

/**
 * Probations ending, and the people who have one with no date on them.
 *
 * ## The two halves are one question
 *
 * `due` is a queue of decisions. `needsADate` is the population this feature
 * inherited rather than created: anybody imported as "probation", which
 * `modules/imports/employees.ts` maps onto `status: ONBOARDING`, and anybody
 * created while tracking was off. They are fetched together because a screen
 * showing the queue and quietly omitting the people missing from it would
 * rebuild the defect the feature exists to close — a probation nobody is
 * reminded about.
 *
 * ## Demo mode shows the defect and refuses the decision
 *
 * Offline there is no probation table, so `due` is empty and `needsADate` is
 * derived from the demo directory's own `ONBOARDING` staff — which is exactly
 * the state this feature was built to surface, and it is true of the seed
 * rather than staged for it. The decision itself is refused with its reason:
 * confirming somebody moves their employment status, and a status changed in
 * browser storage is one no payroll run, no payslip and no letter would ever
 * see. Same judgement `store/departments.ts` makes about a cost centre.
 */

type ProbationOutcome = { value: ApiProbationDue; error: ApiError | null };

const EMPTY: ApiProbationDue = { due: [], needsADate: [] };

const probationDue = createSharedResource<ProbationOutcome>(
  async (_key, signal) => {
    try {
      return { value: await employeesApi.probationDue(signal), error: null };
    } catch (error) {
      /* An abort is the resource dropping its own request, not an answer.
       Rethrowing keeps it out of the cache so the next subscriber loads fresh. */
      if (error instanceof DOMException && error.name === "AbortError")
        throw error;
      return { value: EMPTY, error: error instanceof ApiError ? error : null };
    }
  },
);

export type ProbationState = {
  due: ApiProbationRow[];
  needsADate: ApiProbationUndated[];
  loading: boolean;
  error: ApiError | null;
  /** True offline, where a decision cannot be recorded. */
  readOnly: boolean;
  reload: () => void;
};

export function useProbation(): ProbationState {
  const { isConnected } = useSession();
  const outcome = probationDue.use(isConnected ? "due" : null);
  const directory = useEmployeeDirectory();

  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected || revalidation === 0) return;
    probationDue.refresh("due");
  }, [isConnected, revalidation]);

  const reload = useCallback(() => probationDue.refresh("due"), []);

  /**
   * The demo answer, derived and never written to state.
   *
   * Only the undated half, and that is the honest one: the seed has no
   * probation dates on anybody, so every `ONBOARDING` person in it genuinely
   * is somebody on probation nobody has dated. A `due` queue offline would
   * have to invent end dates to populate itself, which is the fabrication the
   * whole feature refuses.
   */
  const demoUndated = useMemo<ApiProbationUndated[]>(() => {
    if (isConnected) return [];
    const today = new Date();
    return directory.employees
      .filter(
        /* Both, and the pair is not redundant. The frontend's own status union
           carries `probation` and the seed uses it; the API has no such value
           and `lib/imports/employees.ts` maps a spreadsheet's "probation" onto
           `ONBOARDING`. Somebody on probation is in one or the other depending
           on which door created them, and a filter that knew only one would
           miss exactly the people this list is for. */
        (row) => row.status === "onboarding" || row.status === "probation",
      )
      .map((row) => ({
        employeeId: row.id,
        employeeNo: row.employeeNo,
        name: `${row.firstName} ${row.lastName}`,
        jobTitle: row.jobTitle,
        startDate: row.startDate,
        daysSinceStart: Math.max(
          0,
          Math.round(
            (today.getTime() - new Date(row.startDate).getTime()) / 86_400_000,
          ),
        ),
      }));
  }, [isConnected, directory.employees]);

  if (!isConnected) {
    return {
      due: [],
      needsADate: demoUndated,
      loading: directory.loading,
      error: null,
      readOnly: true,
      reload: () => {},
    };
  }

  return {
    due: outcome?.value.due ?? [],
    needsADate: outcome?.value.needsADate ?? [],
    loading: outcome === undefined,
    error: outcome?.error ?? null,
    readOnly: false,
    reload,
  };
}

/** One person's employment-change timeline. */
export function useEmploymentChanges(employeeId: string | null) {
  const { isConnected } = useSession();
  const key = isConnected && employeeId ? employeeId : null;
  const outcome = employmentChanges.use(key);

  return {
    changes: outcome?.value ?? [],
    loading: key !== null && outcome === undefined,
    error: outcome?.error ?? null,
    reload: useCallback(() => {
      if (key) employmentChanges.refresh(key);
    }, [key]),
  };
}

type ChangesOutcome = { value: ApiEmploymentChange[]; error: ApiError | null };

const employmentChanges = createSharedResource<ChangesOutcome>(
  async (key, signal) => {
    try {
      return {
        value: await employeesApi.employmentChanges(key, signal),
        error: null,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        throw error;
      return { value: [], error: error instanceof ApiError ? error : null };
    }
  },
);

export const DEMO_PROBATION_REFUSAL =
  "Recording a confirmation needs the API. It moves somebody's employment " +
  "status, and a status changed in this browser would not reach a payroll " +
  "run, a payslip or a letter.";

export function useProbationDecision() {
  const { isConnected } = useSession();

  const decide = useCallback(
    async (employeeId: string, body: ProbationDecisionBody) => {
      if (!isConnected) throw new Error(DEMO_PROBATION_REFUSAL);
      const result = await employeesApi.decideProbation(employeeId, body);
      /* Both reads refresh: the queue this was decided from, and the timeline
         on the person's own record. A decision visible in one and not the
         other is two screens disagreeing about whether somebody is confirmed. */
      probationDue.refresh("due");
      employmentChanges.refresh(employeeId);
      return result;
    },
    [isConnected],
  );

  return { decide, readOnly: !isConnected };
}
