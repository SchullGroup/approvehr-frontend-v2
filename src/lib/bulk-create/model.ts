import type { ImportRow } from "@/lib/api/imports";
import { parseCsvRecords, type CsvFile } from "@/lib/csv";
import { guessMapping, ignoredHeadings } from "@/lib/imports/mapping";
import { normalizeKey, type Dictionary } from "@/lib/imports/spec";

/**
 * The drafts a person is typing into the "add several" window, and the
 * conversions between those and everything else that holds the same rows: the
 * API's import body, a downloaded spreadsheet, a pasted block of cells.
 *
 * Pure, and apart from the window, for the reason `lib/linked-text.ts` is apart
 * from its component: everything here is a decision about strings and arrays,
 * and a decision is easier to get right when it can be driven without a screen.
 *
 * ## A draft is a row, held by field
 *
 * A draft is exactly one row of the entity's import file, keyed by the
 * dictionary's *fields*. That is the whole design: the window is a different way
 * to type the same rows, so it validates against the same API, with the same
 * rules, and a row can leave it as a file and come back unchanged. Nothing about
 * objectives is in this file. Hand it another dictionary and it holds that
 * entity's rows.
 *
 * Values are strings, as every cell in a spreadsheet is. `Starting value` stays
 * the text somebody typed until the API reads it, which is the same rule the
 * importer follows and for the same reason: a second implementation of how a
 * number is read is a second way for it to be wrong.
 */

/** The most one window holds. The API takes 500; a person typing does not. */
export const MAX_ITEMS = 50;

export type Draft = {
  /** Identity inside the window. Not a row number: items move and are removed. */
  key: string;
  /** One string per dictionary field. A field never typed in is `""`. */
  values: Readonly<Record<string, string>>;
};

/** Values the window starts a new item with, by field. */
export type Defaults = Readonly<Record<string, string>>;

export function blankDraft(
  dictionary: Dictionary<string>,
  key: string,
  defaults: Defaults = {},
): Draft {
  return {
    key,
    values: Object.fromEntries(
      dictionary.columns.map((spec) => [
        spec.field,
        defaults[spec.field] ?? "",
      ]),
    ),
  };
}

/**
 * Whether nothing has been typed in an item.
 *
 * A starting value — the current quarter, say — is not typing, so an item that
 * carries only its defaults counts as untouched. Without that, opening the
 * window and pressing the button would send a row holding nothing but a quarter,
 * and the report would say its title is missing, which is true and not what
 * anybody did.
 */
export function isUntouched(draft: Draft, defaults: Defaults = {}): boolean {
  return Object.entries(draft.values).every(
    ([field, value]) =>
      value.trim() === "" || value.trim() === (defaults[field] ?? "").trim(),
  );
}

/** The items somebody has actually put something in. */
export const touchedOnly = (
  drafts: readonly Draft[],
  defaults: Defaults = {},
): Draft[] => drafts.filter((draft) => !isUntouched(draft, defaults));

/**
 * One draft as the API's row: the heading as the template prints it, and only
 * the cells with something in them.
 *
 * Empty cells are left out for the reason `mapRow` leaves them out — the API
 * reads a blank as nothing either way, and the request body is capped at 100kb.
 */
export function draftToRow(
  dictionary: Dictionary<string>,
  draft: Draft,
): ImportRow {
  const row: ImportRow = {};
  for (const spec of dictionary.columns) {
    const value = (draft.values[spec.field] ?? "").trim();
    if (value !== "") row[spec.column] = value;
  }
  return row;
}

/* ------------------------------------------------------------- from a file */

export type LoadedFile = {
  drafts: Draft[];
  /** Headings in the file that matched nothing, so they were left out. */
  ignored: string[];
  /** Required columns the file has no heading for. The cells will be empty. */
  missingRequired: string[];
};

/**
 * A spreadsheet's rows, as drafts.
 *
 * Headings are matched the way an upload matches them — the same lookup, the
 * same aliases, the old headings still working — so a file downloaded from this
 * window, from the template, or written by hand in somebody else's words all
 * come in. Blank rows are not carried. Nothing is defaulted: an empty Due
 * quarter stays empty and the check says so, rather than the window quietly
 * deciding which quarter somebody meant.
 */
export function draftsFromFile(
  dictionary: Dictionary<string>,
  file: CsvFile,
  nextKey: () => string,
): LoadedFile {
  const mapping = guessMapping(dictionary, file.headers);
  const mappedFields = new Set(Object.values(mapping).filter(Boolean));

  const drafts = file.rows
    .map((row): Draft => {
      const values: Record<string, string> = Object.fromEntries(
        dictionary.columns.map((spec) => [spec.field, ""]),
      );
      for (const [heading, field] of Object.entries(mapping)) {
        if (field) values[field] = (row[heading] ?? "").trim();
      }
      return { key: nextKey(), values };
    })
    .filter((draft) => !isUntouched(draft));

  return {
    drafts,
    ignored: ignoredHeadings(mapping),
    missingRequired: dictionary.requiredFields
      .filter((field) => !mappedFields.has(field))
      .map((field) => dictionary.heading[field] ?? field),
  };
}

/**
 * Whether adding this many would pass the ceiling, and the sentence if so.
 *
 * Always says what to do instead. Refusing at 50 with nowhere to go would be a
 * dead end for the person with 80 rows, who is exactly who the upload is for.
 */
export function overLimit(
  have: number,
  adding: number,
  noun: string,
  uploadLabel: string,
): string | null {
  if (have + adding <= MAX_ITEMS) return null;
  const total = have + adding;
  return (
    `That would make ${total}, and this window holds ${MAX_ITEMS}. ` +
    `Remove some ${noun} here first, or use "${uploadLabel}" for a bigger batch.`
  );
}

/* ----------------------------------------------------------------- pasting */

/** Whether pasted text is a block of cells rather than one value. */
export const looksLikeCells = (text: string): boolean =>
  text.includes("\t") || /\r?\n./.test(text);

export type Pasted = {
  drafts: Draft[];
  /** Rows of the paste that did not fit under the ceiling. */
  droppedRows: number;
  /** Columns of the paste that ran past the last column. */
  droppedColumns: number;
  /** Rows written, so the screen can say what happened. */
  rows: number;
};

/**
 * A block of cells pasted from Excel, laid into the grid from one cell.
 *
 * `row` is the item the cursor was in and `column` its position among the
 * dictionary's columns — the order the grid shows them in. Cells fill rightward
 * and downward; extra rows become new items, up to the ceiling, and whatever
 * does not fit is counted rather than quietly lost.
 *
 * A first row that reads as the file's own headings is skipped, because
 * selecting a whole table in Excel selects its header too and nobody means to
 * make the heading an objective.
 */
export function pasteCells(
  dictionary: Dictionary<string>,
  drafts: readonly Draft[],
  at: { row: number; column: number },
  text: string,
  nextKey: () => string,
  defaults: Defaults = {},
): Pasted {
  const fields = dictionary.columns.map((spec) => spec.field);
  let block = parseCsvRecords(text.replace(/\r?\n$/, ""), "\t");

  const headingHits = (block[0] ?? []).filter((cell) =>
    dictionary.lookup.has(normalizeKey(cell)),
  ).length;
  if (block.length > 1 && headingHits >= 2) block = block.slice(1);

  const next = drafts.map((draft) => ({
    ...draft,
    values: { ...draft.values },
  }));
  let droppedRows = 0;
  let droppedColumns = 0;
  let written = 0;

  block.forEach((cells, offset) => {
    const target = at.row + offset;
    if (target >= MAX_ITEMS) {
      droppedRows += 1;
      return;
    }
    while (next.length <= target) {
      next.push(blankDraft(dictionary, nextKey(), defaults));
    }
    const draft = next[target];
    if (!draft) return;
    cells.forEach((cell, across) => {
      const field = fields[at.column + across];
      if (field === undefined) {
        if (offset === 0) droppedColumns += 1;
        return;
      }
      draft.values[field] = cell.trim();
    });
    written += 1;
  });

  return { drafts: next, droppedRows, droppedColumns, rows: written };
}
