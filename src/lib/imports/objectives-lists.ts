import type { TemplateLists } from "./template-file";

/**
 * The company's own lists for the objectives template: which departments a row
 * may name, and which appraisal periods it may be filed in.
 *
 * Pure, and apart from the hook that reads the stores, for the reason
 * `lib/linked-text.ts` is apart from its component: everything here is a
 * decision about two arrays, and a decision is easier to get right when it can
 * be driven without a screen.
 *
 * ## The same lists the form offers, not a wider one
 *
 * A dropdown that offers a value the check will then refuse is worse than no
 * dropdown, because it puts the refusal one step further from the cause. So
 * these are the lists the "New objective" dialog already builds:
 *
 * - **Departments**: every one for somebody holding `EDIT_RECORDS`, and only the
 *   ones they head for anybody else. That is the API's rule for who may file a
 *   shared target under a department, and `goal-dialogs.tsx` mirrors it for the
 *   same reason this does.
 * - **Periods**: every one that is not published. A published period's marks are
 *   already out, and filing a new objective into it would move a score somebody
 *   has been told. The API refuses it twice — at the check and again at the
 *   apply — so offering it would be offering a certain refusal.
 *
 * The keys are dictionary *fields*, not headings: the heading is the
 * dictionary's to rename, and `withLists` resolves one to the other.
 */
export function objectiveTemplateLists(input: {
  departments: readonly { name: string; headId: string | null }[];
  periods: readonly { name: string; stage: string }[];
  /** Holds `EDIT_RECORDS`: may file under any department. */
  canSetCompanyWide: boolean;
  employeeId: string | null;
}): TemplateLists {
  const { departments, periods, canSetCompanyWide, employeeId } = input;
  return {
    department: departments
      .filter(
        (department) =>
          canSetCompanyWide ||
          (employeeId !== null && department.headId === employeeId),
      )
      .map((department) => department.name.trim())
      .sort((a, b) => a.localeCompare(b, "en")),
    /* Kept in the order the company lists them: that is the order they appear
       on the Performance screen, and the newest is usually the one wanted. */
    period: periods
      .filter((period) => period.stage !== "PUBLISHED")
      .map((period) => period.name.trim()),
  };
}
