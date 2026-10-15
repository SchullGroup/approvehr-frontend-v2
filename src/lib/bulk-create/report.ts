import type { ApiRowReport } from "@/lib/api/imports";
import { normalizeKey, type Dictionary } from "@/lib/imports/spec";

/**
 * What the check said about each item, by the item's own key.
 *
 * The API reports by row number within the part it was sent, and the window
 * sends only the items that were filled in. So the translation back to "which
 * card is this" is a list of keys in the order the rows went, and it is written
 * once, here, because getting it wrong would put one objective's error on
 * another's card — the failure the importer's own `translate` exists to avoid.
 */

export type Problem = {
  /** The field it belongs to, or null when it is about the whole item. */
  field: string | null;
  problem: string;
  severity: "error" | "warning";
};

export type ItemReport = {
  /** What the API would do with this item. */
  action: "create" | "update" | "skip";
  problems: Problem[];
};

export const errorsOf = (report: ItemReport | undefined): Problem[] =>
  report?.problems.filter((problem) => problem.severity === "error") ?? [];

export const warningsOf = (report: ItemReport | undefined): Problem[] =>
  report?.problems.filter((problem) => problem.severity === "warning") ?? [];

/**
 * A part's reports, keyed by item.
 *
 * `keys[n - 1]` is the item that went as row `n`. A report for a row this part
 * did not send is ignored rather than guessed at.
 */
export function reportsByItem(
  dictionary: Dictionary<string>,
  keys: readonly string[],
  reports: readonly ApiRowReport[],
): Record<string, ItemReport> {
  const fieldOf = (column: string): string | null =>
    dictionary.lookup.get(normalizeKey(column))?.field ?? null;

  const byKey: Record<string, ItemReport> = {};
  for (const report of reports) {
    const key = keys[report.row - 1];
    if (key === undefined) continue;
    byKey[key] = {
      action: report.action,
      problems: [
        ...report.errors.map((issue): Problem => ({
          field: fieldOf(issue.column),
          problem: issue.problem,
          severity: "error",
        })),
        ...report.warnings.map((issue): Problem => ({
          field: fieldOf(issue.column),
          problem: issue.problem,
          severity: "warning",
        })),
      ],
    };
  }
  return byKey;
}
