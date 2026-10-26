import type { ApiScoreRow } from "@/lib/api/performance";
import { sortRows, type SortKey, type SortState } from "./table-sort";

/**
 * The filters over the marks table, and the order its columns sort in.
 *
 * ## The three filters are the three badges that used to sit in the card header
 *
 * "9 unscored", "1 unanswered" and "2 disputed" were labels on a card; they are
 * the things a period's owner is looking for, so they are the filter. And each
 * predicate here is the **API's own definition** of the count it carries
 * (`scoring.ts` builds `register.counts` from exactly these expressions):
 *
 * | Filter | The API counts a row when |
 * |---|---|
 * | unscored | `scoreBp === null` |
 * | unanswered | it has an `AWAITING_ACKNOWLEDGEMENT` exception |
 * | disputed | `signOff.disputed` |
 *
 * That matters because the number on a filter has to be the number of rows it
 * shows. Counting them here from the same rows with the same expressions
 * guarantees it, and `tests/period-screen-marks.test.ts` compares the two
 * against hand-built rows so a drift in either is caught.
 */
export type MarksFilter = "all" | "unscored" | "unanswered" | "disputed";

export const FILTER_LABEL: Record<MarksFilter, string> = {
  all: "Everybody",
  unscored: "Unscored",
  unanswered: "Unanswered",
  disputed: "Disputed",
};

export function matchesFilter(row: ApiScoreRow, filter: MarksFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "unscored":
      return row.scoreBp === null;
    case "unanswered":
      return row.exceptions.some(
        (issue) => issue.code === "AWAITING_ACKNOWLEDGEMENT",
      );
    case "disputed":
      return row.signOff.disputed;
  }
}

export function filterCounts(
  rows: readonly ApiScoreRow[],
): Record<MarksFilter, number> {
  return {
    all: rows.length,
    unscored: rows.filter((row) => matchesFilter(row, "unscored")).length,
    unanswered: rows.filter((row) => matchesFilter(row, "unanswered")).length,
    disputed: rows.filter((row) => matchesFilter(row, "disputed")).length,
  };
}

/**
 * Where somebody is in the sign-off, ranked by what has to happen next — the
 * order `SignOffCell` reads its states in: a dispute obliges somebody else to
 * act, an unanswered rating is the exposure acknowledgement exists to close,
 * and so on down to a finished one. Ascending therefore puts the rows that
 * need somebody at the top.
 */
export function signOffRank(row: ApiScoreRow): number {
  const { signOff } = row;
  if (signOff.disputed) return 0;
  if (signOff.acknowledged) return 5;
  if (signOff.finalised) return 1;
  if (signOff.submitted) return 2;
  return signOff.reviewId === null ? 4 : 3;
}

export const MARKS_SORT_KEYS: Record<string, (row: ApiScoreRow) => SortKey> = {
  person: (row) => row.employeeName,
  /* `null` for a person with nothing recorded: last in both directions. */
  mark: (row) => row.scoreBp,
  signOff: (row) => signOffRank(row),
  objectives: (row) => row.objectives.agreed,
};

export function visibleMarks(
  rows: readonly ApiScoreRow[],
  options: { filter: MarksFilter; query: string; sort: SortState | null },
): ApiScoreRow[] {
  const needle = options.query.trim().toLowerCase();
  const kept = rows.filter((row) => {
    if (!matchesFilter(row, options.filter)) return false;
    if (needle === "") return true;
    return (
      row.employeeName.toLowerCase().includes(needle) ||
      row.jobTitle.toLowerCase().includes(needle) ||
      (row.departmentName ?? "").toLowerCase().includes(needle)
    );
  });
  return sortRows(kept, options.sort, MARKS_SORT_KEYS);
}
