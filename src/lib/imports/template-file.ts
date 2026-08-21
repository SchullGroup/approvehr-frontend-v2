import { toCsv, type CsvRow } from "@/lib/csv";
import { writeXlsx } from "@/lib/xlsx";
import { EMPLOYEE_COLUMNS, type ColumnSpec } from "./template";

/**
 * The template, as a file, in both formats somebody asked for.
 *
 * ## Generated, never typed
 *
 * Every heading, marker, example and note below comes from the column
 * dictionary — the API's copy when the API answers, the compiled-in copy when it
 * does not. A hand-written template drifts from the parser inside a month, and
 * then the first import of every new customer fails on a column we ourselves
 * told them to use. This file therefore contains no column names at all.
 *
 * ## Why the CSV and the workbook are the same two rows
 *
 * The workbook has a second sheet explaining the columns and the CSV cannot, so
 * the temptation is to put more in one than the other. Resisted: the sheet
 * somebody fills in is identical in both, so a customer who downloads the CSV,
 * a colleague who downloads the Excel one, and the screen they both look at are
 * describing one thing.
 *
 * ## The asterisk in the header row
 *
 * Required columns are marked `first_name *`. That is safe rather than cute:
 * heading matching normalises away everything that is not a letter or a digit,
 * on this side and on the API's, so `first_name *` and `first_name` are the same
 * column and a customer who leaves the marker in place still imports. It was
 * checked against `COLUMN_LOOKUP` for all five, not assumed.
 */

/** What the builder needs. Satisfied by the API's payload and by `ColumnSpec`. */
export type TemplateColumn = {
  column: string;
  required: boolean;
  recommended: boolean;
  example: string;
  note: string;
  alsoAccepted: readonly string[];
};

/** The compiled-in dictionary in the builder's shape. */
export const columnsFromSpecs = (
  specs: readonly ColumnSpec[] = EMPLOYEE_COLUMNS,
): TemplateColumn[] =>
  specs.map((spec) => ({
    column: spec.column,
    required: spec.required,
    recommended: spec.recommended !== undefined,
    example: spec.example,
    note: spec.note,
    alsoAccepted: spec.aliases,
  }));

/**
 * The legend, when the API has not supplied one.
 *
 * Kept identical in wording to `employeeTemplate()`'s `legend` in the API. Two
 * copies of five sentences is the same trade as the column dictionary itself,
 * and for the same reason: the first two steps of an import work offline.
 */
export const FALLBACK_LEGEND: readonly string[] = [
  "Required — the import will not add a person without it.",
  "Recommended — the person is added, and they appear on a list of details somebody has to come back to.",
  "Optional — leave the column out entirely if you do not have it. A column you do not send is left alone on anybody we update.",
  "Delete the example row before you upload. Your headings can be named anything: you match them to ours on screen.",
  "Dates: DD/MM/YYYY or YYYY-MM-DD. Money: naira, monthly, and the naira sign and commas are fine.",
];

const marked = (column: TemplateColumn): string =>
  column.required ? `${column.column} *` : column.column;

const need = (column: TemplateColumn): string =>
  column.required ? "Required" : column.recommended ? "Recommended" : "Optional";

/**
 * The one example row, made obviously an example.
 *
 * The dictionary's examples are realistic on purpose — they show the shape of a
 * value — so the giveaway has to be added: the name says so, the staff number
 * says so, and the email says so. A template whose example row looks like a real
 * employee is a template somebody imports by accident, and then there is a
 * person called Ngozi Williams in the directory that nobody hired.
 */
export function exampleRow(columns: readonly TemplateColumn[]): string[] {
  const overrides: Record<string, string> = {
    employee_no: "EXAMPLE-001",
    first_name: "DELETE",
    last_name: "THIS ROW",
    email: "example@yourcompany.com",
  };
  return columns.map((column) => overrides[column.column] ?? column.example);
}

export type TemplateFiles = {
  /** Header row and one example row, BOM-led and CRLF, as Excel wants. */
  csv: string;
  /** The same two rows, plus a sheet explaining every column. */
  xlsx: Uint8Array;
  csvFilename: string;
  xlsxFilename: string;
};

export function buildTemplateFiles(
  columns: readonly TemplateColumn[],
  options: { legend?: readonly string[]; matching?: string; basename?: string } = {},
): TemplateFiles {
  const {
    legend = FALLBACK_LEGEND,
    matching,
    basename = "approvehr-employees-template",
  } = options;

  const headers = columns.map(marked);
  const example = exampleRow(columns);
  const row: CsvRow = Object.fromEntries(
    headers.map((heading, index) => [heading, example[index] ?? ""]),
  );

  const guide: string[][] = [
    ["How to fill this in"],
    ...legend.map((line) => [line]),
    ...(matching ? [[matching]] : []),
    [""],
    ["Column", "Needed?", "Example", "What goes in it", "Other headings we accept"],
    ...columns.map((column) => [
      column.column,
      need(column),
      column.example,
      column.note,
      column.alsoAccepted.join(", "),
    ]),
  ];

  return {
    csv: toCsv(headers, [row]),
    xlsx: writeXlsx([
      {
        name: "Staff list",
        rows: [headers, example],
        boldRows: [0],
        freezeFirstRow: true,
        /* The header cells are the longest thing in most columns, so the widths
           follow them. Enough to read; not so much that 33 columns cannot be
           scrolled. */
        widths: headers.map((heading) => Math.min(34, Math.max(12, heading.length + 3))),
      },
      {
        name: "Columns explained",
        rows: guide,
        /* The title, the legend lines, and the table's own header row. */
        boldRows: [0, legend.length + (matching ? 1 : 0) + 2],
        widths: [22, 14, 24, 70, 44],
      },
    ]),
    csvFilename: `${basename}.csv`,
    xlsxFilename: `${basename}.xlsx`,
  };
}
