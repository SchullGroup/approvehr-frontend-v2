import type {
  ApiCycleParticipants,
  ApiScoreRegister,
} from "@/lib/api/performance";
import { sortRows, type SortKey, type SortState } from "./table-sort";

/**
 * One form somebody still owes, as a row.
 *
 * `outstandingIn` in the store returns each of these as a sentence — "Tunde
 * Bakare has not written Grace Effiong's review" — which is the right shape for
 * a toast and the wrong one for a table, because a sentence cannot be sorted by
 * who owes it or filtered by what kind of form it is. The same facts, in
 * columns.
 *
 * It walks the participants in the same order and applies the same two tests
 * (a self-review not submitted; a manager review not submitted), so
 * `outstandingFormsFrom(p).length === outstandingIn(p).length` always, and
 * `tests/period-screen-outstanding.test.ts` holds it to that. A count above
 * the table and a list in it must not be able to disagree.
 */
export type OutstandingForm = {
  /** One per form, never one per person: somebody with two appraisers owes two. */
  key: string;
  reviewId: string;
  employeeId: string;
  /** Whose appraisal it is. */
  employeeName: string;
  kind: "self" | "manager";
  /** Who has to write it: the person themself, or the appraiser. */
  owedBy: string;
  /** From the score register, when it has loaded. Absent is absent. */
  jobTitle: string | null;
  departmentName: string | null;
};

export function outstandingFormsFrom(
  participants: ApiCycleParticipants | null,
  register: ApiScoreRegister | null = null,
): OutstandingForm[] {
  if (!participants) return [];
  const who = new Map(register?.rows.map((row) => [row.employeeId, row]));
  const forms: OutstandingForm[] = [];

  for (const person of participants.rows) {
    const known = who.get(person.employeeId);
    const context = {
      employeeId: person.employeeId,
      employeeName: person.employeeName,
      jobTitle: known?.jobTitle ?? null,
      departmentName: known?.departmentName ?? null,
    };

    if (person.self && !person.self.submitted) {
      forms.push({
        ...context,
        key: person.self.reviewId,
        reviewId: person.self.reviewId,
        kind: "self",
        owedBy: person.employeeName,
      });
    }
    for (const manager of person.managers) {
      if (manager.submitted) continue;
      forms.push({
        ...context,
        key: manager.reviewId,
        reviewId: manager.reviewId,
        kind: "manager",
        owedBy: manager.managerName,
      });
    }
  }

  return forms;
}

export const KIND_LABEL: Record<OutstandingForm["kind"], string> = {
  self: "Self-review",
  manager: "Manager review",
};

export type KindFilter = "all" | OutstandingForm["kind"];

export const OUTSTANDING_SORT_KEYS: Record<
  string,
  (form: OutstandingForm) => SortKey
> = {
  person: (form) => form.employeeName,
  form: (form) => KIND_LABEL[form.kind],
  owedBy: (form) => form.owedBy,
  department: (form) => form.departmentName,
};

/**
 * Search is over the two names on the row — the person and whoever owes it —
 * because "which forms is Tunde holding up" is as common a question as "where
 * is Grace's". Case and spacing do not matter.
 */
export function visibleForms(
  forms: readonly OutstandingForm[],
  options: { kind: KindFilter; query: string; sort: SortState | null },
): OutstandingForm[] {
  const needle = options.query.trim().toLowerCase();
  const kept = forms.filter((form) => {
    if (options.kind !== "all" && form.kind !== options.kind) return false;
    if (needle === "") return true;
    return (
      form.employeeName.toLowerCase().includes(needle) ||
      form.owedBy.toLowerCase().includes(needle)
    );
  });
  return sortRows(kept, options.sort, OUTSTANDING_SORT_KEYS);
}

/**
 * How far each half of the period is, both halves of each ratio from one
 * source.
 *
 * The manager denominator is a count of **reviews**, not people — somebody
 * with two appraisers owes two and somebody with none owes none — so
 * "4 of 8" and "9 people" are both true on a period where one person has no
 * manager. This is the rule `Outstanding` carried in its own body (the long
 * comment on it records the 0-of-10 defect it replaced); it is lifted here so
 * the overview and the Outstanding tab read one function rather than two
 * copies of one rule.
 *
 * A total of zero is returned as zero, and the *screen* decides to print "—"
 * for it: "0 of 0" reads as a measurement of a period nobody is in yet.
 */
export function progressOf(participants: ApiCycleParticipants) {
  const managerTotal = participants.rows.reduce(
    (total, row) => total + row.managers.length,
    0,
  );
  const managerIn = participants.rows.reduce(
    (total, row) => total + row.managers.filter((one) => one.submitted).length,
    0,
  );
  const selfTotal = participants.rows.filter((row) => row.self !== null).length;
  const selfIn = participants.rows.filter((row) => row.self?.submitted).length;
  return { selfIn, selfTotal, managerIn, managerTotal };
}
