"use client";

import { objectiveTemplateLists } from "@/lib/imports/objectives-lists";
import type { TemplateLists } from "@/lib/imports/template-file";
import { useCan } from "@/lib/permissions";
import { useDepartments } from "@/lib/store/departments";
import { useAppraisals } from "@/lib/store/performance";
import { useSession } from "@/lib/store/session";

/**
 * The company's departments and open appraisal periods, as the template's
 * dropdowns. The deciding is `objectiveTemplateLists`; this only reads.
 *
 * `ready` is false until both have answered, and **an error counts as
 * answered**: a list that failed to load leaves the template without a dropdown
 * in that column, which still works — the check names any department or period
 * it does not recognise — whereas holding the button forever on a request that
 * has already failed would make the download the thing that is broken.
 *
 * Every hook is asked on every render and combined afterwards, never
 * short-circuited: a conditional hook call would move the order of hooks the
 * moment one of them answers.
 */
export function useObjectiveTemplateLists(): {
  lists: TemplateLists;
  ready: boolean;
} {
  const { employeeId } = useSession();
  const canSetCompanyWide = useCan("EDIT_RECORDS");
  const { flat: departments, loading: departmentsLoading } = useDepartments();
  const { cycles, loading: periodsLoading } = useAppraisals();

  return {
    lists: objectiveTemplateLists({
      departments,
      periods: cycles,
      canSetCompanyWide,
      employeeId,
    }),
    ready: !departmentsLoading && !periodsLoading,
  };
}
