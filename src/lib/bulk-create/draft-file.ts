import { toCsv, type CsvRow } from "@/lib/csv";
import {
  columnsFromDictionary,
  dropdownSheets,
  LISTS_SHEET,
  marked,
  withLists,
  type TemplateLists,
} from "@/lib/imports/template-file";
import type { Dictionary } from "@/lib/imports/spec";
import { writeXlsx } from "@/lib/xlsx";
import type { Draft } from "./model";

/**
 * The items in the window, as a file to carry on in Excel.
 *
 * ## The same headings, the same dropdowns, nothing else
 *
 * This is the template with the person's own rows where the example row was —
 * built from the same dictionary and the same `marked` headings, so the file
 * goes back through "Upload objectives" untouched, or back into this window.
 * The company's own lists ride along as the same hidden `Lists` sheet and
 * dropdown cells the template carries, because a draft that lost its Department
 * dropdown on the way to Excel would invite exactly the typo the dropdown is
 * there to stop.
 *
 * There is no "Columns explained" sheet. The template has one because it is the
 * first thing somebody opens; a draft is the person's own work, and a second
 * sheet of instructions inside it would be one more thing to scroll past.
 */
export type DraftFiles = {
  csv: string;
  xlsx: Uint8Array;
  csvFilename: string;
  xlsxFilename: string;
};

/** `approvehr-objectives-template` becomes `approvehr-objectives-draft`. */
export const draftBasename = (templateBasename: string): string =>
  `${templateBasename.replace(/-template$/, "")}-draft`;

export function buildDraftFiles(input: {
  dictionary: Dictionary<string>;
  drafts: readonly Draft[];
  /** The company's own lists, as the template would carry them. */
  lists: TemplateLists;
}): DraftFiles {
  const { dictionary, drafts, lists } = input;
  const columns = withLists(
    columnsFromDictionary(dictionary),
    dictionary,
    lists,
  );
  /* `columnsFromDictionary` keeps the dictionary's order, so column `n` is
     field `n`. Looked up by position rather than by heading, which a company's
     own rename could one day make ambiguous. */
  const fields = dictionary.columns.map((spec) => spec.field);
  const headers = columns.map(marked);

  const cells = drafts.map((draft) =>
    fields.map((field) => draft.values[field] ?? ""),
  );
  const records: CsvRow[] = cells.map((row) =>
    Object.fromEntries(
      headers.map((heading, index) => [heading, row[index] ?? ""]),
    ),
  );

  const { listRows, validations } = dropdownSheets(columns);
  const basename = draftBasename(dictionary.templateFile.basename);

  return {
    csv: toCsv(headers, records),
    xlsx: writeXlsx([
      {
        name: dictionary.templateFile.sheetName,
        rows: [headers, ...cells],
        boldRows: [0],
        freezeFirstRow: true,
        widths: headers.map((heading) =>
          Math.min(34, Math.max(12, heading.length + 3)),
        ),
        ...(validations.length > 0 ? { validations } : {}),
      },
      ...(listRows.length > 0
        ? [{ name: LISTS_SHEET, rows: listRows, hidden: true }]
        : []),
    ]),
    csvFilename: `${basename}.csv`,
    xlsxFilename: `${basename}.xlsx`,
  };
}
