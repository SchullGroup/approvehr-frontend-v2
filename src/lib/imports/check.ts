import type {
  ApiMissingField,
  ApiRowIssue,
  ApiRowReport,
  ImportRow,
} from "@/lib/api/imports";
import {
  parseImportDate,
  parseImportMoneyKobo,
  parseImportTime,
  type Dictionary,
  type RowContext,
} from "./spec";

/**
 * The file check, in the browser. Entity-agnostic.
 *
 * ## What this is for, and what it is not
 *
 * The API's check is the authoritative one and the only one that runs when the
 * API is reachable. This is the demo-mode substitute, and it is deliberately
 * narrower: **it only asks questions whose answer is in the file.** Is that a
 * date? Is that an amount? Does the same key appear twice? Is `employment_type`
 * a word we know?
 *
 * It never guesses at the ones that need the database — whether a record is
 * already yours, whether that department exists, whether the pay sits inside its
 * grade's band. The screen says so out loud rather than implying a clean file
 * will import cleanly, and the import itself refuses to run without the API. A
 * demo that faked writing 500 salaries into localStorage would teach the wrong
 * thing about what this product does.
 *
 * ## What is generic here, and what the dictionary supplies
 *
 * Everything below is true of importing anything: a required column that is
 * empty, a required column the file does not have, a declared date that will not
 * read, a declared amount that is not money, and a recommended column nobody
 * filled in. The dictionary supplies the columns, which of them are dates or
 * amounts (`ColumnSpec.cell`), and — through `rowRules` — the checks that are
 * not properties of one cell. So a new entity gets this engine for nothing.
 *
 * ## The drift risk, and why the checks were chosen the way they were
 *
 * This mirrors logic in `approvehr-api/src/modules/imports/`, which is one copy
 * too many — the same trade HANDOVER.md records for the payroll engine. The
 * mitigation is the direction of the errors. Every check here is one where the
 * file alone settles it, so a false *positive* is close to impossible; a false
 * negative — something this misses and the API catches — is expected and
 * harmless, because the API runs before anything is written. If you change the
 * API's rules, this file is allowed to lag. It is not allowed to contradict.
 */

export type { Parsed } from "./spec";
export { parseImportDate, parseImportMoneyKobo, parseImportTime } from "./spec";

export type LocalCheckResult = {
  totalRows: number;
  /** Rows with nothing wrong. Not "to create": only the API knows who is new. */
  toImport: number;
  toSkip: number;
  rows: ApiRowReport[];
  notes: string[];
  /** Rows that would import with a recommended field empty. */
  flagged: number;
};

/**
 * Check mapped rows against the file's own evidence.
 *
 * `presentFields` is what the mapping produced, and it is the difference between
 * "this cell is empty" and "this file has no such column" — two problems with
 * two different fixes, and telling somebody to fill in a cell that does not
 * exist is the sort of message that makes people give up.
 */
export function checkMappedRows(
  dictionary: Dictionary<string>,
  rows: readonly ImportRow[],
  options: {
    presentFields: ReadonlySet<string>;
    /** Row numbers as the file has them, so a multi-part check still lines up. */
    firstRowNumber?: number;
  },
): LocalCheckResult {
  const { presentFields, firstRowNumber = 1 } = options;
  const reports: ApiRowReport[] = [];
  const heading = dictionary.heading;

  /**
   * Counts the notes are built from, and the first row each key was seen on.
   *
   * `seen` is the in-file duplicate check — the half of "is this the same record"
   * that needs no database. One map per named key, so an entity can ask the
   * question of as many columns as it has answers for.
   */
  const counts: Record<string, number> = {};
  const seen = new Map<string, Map<string, number>>();

  rows.forEach((row, index) => {
    const rowNumber = firstRowNumber + index;
    const errors: ApiRowIssue[] = [];
    const warnings: ApiRowIssue[] = [];

    const text = (field: string): string => {
      const column = heading[field];
      const value = column === undefined ? undefined : row[column];
      return value === undefined || value === null ? "" : String(value).trim();
    };
    const issue = (field: string, problem: string): ApiRowIssue => ({
      row: rowNumber,
      column: heading[field] ?? field,
      value: text(field) || null,
      problem,
    });
    const error = (field: string, problem: string) => {
      errors.push(issue(field, problem));
    };
    const warn = (field: string, problem: string) => {
      warnings.push(issue(field, problem));
    };

    /* ---- a required column, empty or absent ---- */
    for (const field of dictionary.requiredFields) {
      if (text(field) !== "") continue;
      error(
        field,
        presentFields.has(field)
          ? `This cell is empty and ${heading[field]} is needed for every ${dictionary.noun.one}.`
          : `This file has no ${heading[field]} column. Match one on the previous step, or add it to the file.`,
      );
    }

    /* ---- the cells the dictionary declares as dates and amounts ---- */
    for (const spec of dictionary.columns) {
      const cell = spec.cell;
      if (!cell) continue;
      const value = text(spec.field);
      if (value === "") continue;

      if (cell.kind === "date") {
        const parsed = parseImportDate(value);
        if (!parsed.ok) error(spec.field, parsed.problem);
        else if (parsed.value.ambiguous) {
          counts["ambiguousDates"] = (counts["ambiguousDates"] ?? 0) + 1;
        }
        continue;
      }

      /* A clock time. Its own branch rather than a flag on the date one,
         because `parseImportDate` throws a time away by design — and without
         this `continue` a time cell would fall through to the money parser
         below and a customer would be told their clock-in is not an amount. */
      if (cell.kind === "time") {
        const parsed = parseImportTime(value);
        if (!parsed.ok) error(spec.field, parsed.problem);
        continue;
      }

      /* An amount. The zero rule and the word the refusal uses are declared on
         the column — an empty rent cell is undeclared and is never turned into a
         zero, because that would be declaring on somebody's behalf. */
      const parsed = parseImportMoneyKobo(value, {
        ...(cell.zeroAllowed === undefined ? {} : { zeroAllowed: cell.zeroAllowed }),
        ...(cell.subject === undefined ? {} : { subject: cell.subject }),
      });
      if (!parsed.ok) error(spec.field, parsed.problem);
    }

    /* ---- everything the entity itself knows ---- */
    const context: RowContext<string> = {
      row: rowNumber,
      text,
      error,
      warn,
      tally: (name) => {
        counts[name] = (counts[name] ?? 0) + 1;
      },
      seen: (name, key) => {
        const memo = seen.get(name) ?? new Map<string, number>();
        seen.set(name, memo);
        const first = memo.get(key);
        if (first !== undefined) return first;
        memo.set(key, rowNumber);
        return undefined;
      },
    };
    dictionary.rowRules?.(context);

    /* ---- recommended fields nobody filled in ----
       On rows that would go in. Offline every group is flagged: which ones this
       company has switched off is a database question, and the screen says the
       list may be longer than the one the API would produce rather than quietly
       showing a shorter one. */
    const missing: ApiMissingField[] = [];
    if (errors.length === 0) {
      for (const spec of dictionary.recommended) {
        if (text(spec.field) !== "") continue;
        missing.push({
          field: spec.field,
          column: heading[spec.field] ?? spec.column,
          why: spec.recommended?.why ?? "",
          important: spec.recommended?.important ?? false,
        });
      }
      if (missing.length > 0) {
        counts["flagged"] = (counts["flagged"] ?? 0) + 1;
      }
    }

    /* Which columns name a row is the entity's business — a person is a first
       and a last name; something else is a serial and a model. */
    const identity = dictionary.identify?.(text) ?? { key: null, name: null };

    reports.push({
      row: rowNumber,
      employeeNo: identity.key,
      name: identity.name,
      /* No "update" here: whether this record is already on file is a database
         question, and this check does not have a database. */
      action: errors.length > 0 ? "skip" : "create",
      errors,
      warnings,
      /* Nor can this find a duplicate against the directory. In-file repeats are
         errors above; the rest needs the API. */
      duplicate: null,
      missing,
      employeeNoGenerated: false,
    });
  });

  const toSkip = reports.filter((report) => report.action === "skip").length;
  return {
    totalRows: rows.length,
    toImport: rows.length - toSkip,
    toSkip,
    rows: reports,
    notes: dictionary.fileNotes?.(counts) ?? [],
    flagged: counts["flagged"] ?? 0,
  };
}
