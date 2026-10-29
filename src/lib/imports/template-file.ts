import { toCsv, type CsvRow } from "@/lib/csv";
import { writeXlsx, type DateCheckFormat } from "@/lib/xlsx";
import type { ApiTemplateColumn } from "@/lib/api/imports";
import { normalizeKey, type Dictionary } from "./spec";

/**
 * The template, as a file, in both formats somebody asked for. Entity-agnostic.
 *
 * ## Generated, never typed
 *
 * Every heading, marker, example and note below comes from a column dictionary —
 * the API's copy when the API answers, the compiled-in copy when it does not. A
 * hand-written template drifts from the parser inside a month, and then the first
 * import of every new customer fails on a column we ourselves told them to use.
 * This file therefore contains no column names at all, and it contains nothing
 * about employees: hand it a different dictionary and it writes that entity's
 * template.
 *
 * ## Required columns lead
 *
 * The order comes from the dictionary and the dictionary orders itself —
 * required, then recommended, then the rest, see `buildDictionary`. The product
 * owner asked for the essential fields first so the sheet is not bloated, and
 * doing it there rather than here means the API's copy is ordered the same way,
 * which matters because the API's copy is the one that answers.
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
 * Required columns are marked `First name *`. That is safe rather than cute:
 * heading matching normalises away everything that is not a letter or a digit,
 * on this side and on the API's, so `First name *`, `first_name` and `First Name`
 * are the same column and a customer who leaves the marker in place still imports. It is
 * checked against the dictionary's own lookup by `scripts/verify-template.ts`
 * for every required column, not assumed.
 */

/** What the builder needs. Satisfied by the API's payload and by a dictionary. */
export type TemplateColumn = {
  column: string;
  required: boolean;
  recommended: boolean;
  example: string;
  note: string;
  alsoAccepted: readonly string[];
  /**
   * What the example row prints instead of `example`, when there is one.
   *
   * The dictionary's examples are realistic on purpose — they show the shape of a
   * value — so the giveaway has to be declared: the name says so, the key says
   * so, and the email says so. A template whose example row looks like a real
   * record is a template somebody imports by accident, and then there is a person
   * in the directory that nobody hired.
   */
  exampleOverride?: string;
  /**
   * The exact values this column accepts, for a real Excel dropdown cell
   * rather than a note beside it. Absent for a plain-text or free-form
   * column — see `ColumnSpec.dropdown` for which ones qualify and why.
   */
  dropdown?: readonly string[];
};

/**
 * The other headings a file may use, written the way a person would type them.
 *
 * The dictionary stores them as matching keys — `employee_id`, `gl_code` — and
 * printing those on a sheet a customer reads reads like a database. Underscores
 * become spaces, and anything that is the heading itself once punctuation is
 * ignored is left out: "Staff number" listing "staff_number" as another heading
 * it accepts says nothing. Matching is unchanged — it normalises both sides, so
 * `employee id` and `employee_id` are the same column whichever is shown.
 */
function otherHeadings(column: TemplateColumn): string {
  const seen = new Set([normalizeKey(column.column)]);
  return column.alsoAccepted
    .filter((heading) => {
      const key = normalizeKey(heading);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((heading) => heading.replace(/_/g, " "))
    .join(", ");
}

/** A dictionary in the builder's shape. Used when the API has not answered. */
export const columnsFromDictionary = (
  dictionary: Dictionary<string>,
): TemplateColumn[] =>
  dictionary.columns.map((spec) => ({
    column: spec.column,
    required: spec.required,
    recommended: spec.recommended !== undefined,
    example: spec.example,
    note: spec.note,
    alsoAccepted: spec.aliases,
    ...(spec.templateExample === undefined
      ? {}
      : { exampleOverride: spec.templateExample }),
    ...(spec.dropdown === undefined ? {} : { dropdown: spec.dropdown }),
  }));

/**
 * The API's payload in the builder's shape.
 *
 * The API sends `templateExample` on the columns that have one. The dictionary is
 * consulted only as a fallback, by column name, so a customer talking to an older
 * API still gets an example row that says DELETE THIS ROW rather than a plausible
 * employee.
 */
export const columnsFromApi = (
  columns: readonly ApiTemplateColumn[],
  dictionary: Dictionary<string>,
): TemplateColumn[] => {
  const fallback = new Map(
    dictionary.columns
      .filter((spec) => spec.templateExample !== undefined)
      .map((spec) => [spec.column, spec.templateExample as string]),
  );
  return columns.map((column) => {
    const override = column.templateExample ?? fallback.get(column.column);
    return {
      column: column.column,
      required: column.required,
      recommended: column.recommended,
      example: column.example,
      note: column.note,
      alsoAccepted: column.alsoAccepted,
      ...(override === undefined ? {} : { exampleOverride: override }),
      ...(column.dropdown === undefined ? {} : { dropdown: column.dropdown }),
    };
  });
};

/**
 * Lists that belong to *this company, right now*, by the dictionary field they
 * fill: its departments, the appraisal periods that are still open.
 *
 * Not on the dictionary, and that is the whole design. `ColumnSpec.dropdown` is
 * for a vocabulary that is the same for everybody — the 37 states, Yes and No —
 * which is why it can be compiled in, sent by the API and checked for drift
 * between the two repos. A company's own departments are none of those: they
 * are different for every customer, they change, and a copy compiled into a
 * dictionary would be somebody else's list in the file. They are supplied by the
 * screen at the moment of download, from what it has just read.
 *
 * A snapshot, and Excel enforces it: a department created after the download is
 * not in the list and cannot be typed over it. Downloading the template again
 * is the answer, and the check step names anything it does not recognise.
 */
export type TemplateLists = Readonly<Record<string, readonly string[]>>;

/**
 * The columns, with each live list turned into that column's dropdown.
 *
 * A live list wins over a compiled-in one for the same column, because it is the
 * more specific of the two. An empty list is **no** dropdown, not an empty one:
 * Excel would refuse every value typed into a column whose list has nothing in
 * it, which is the opposite of help for a company that has not made its first
 * department yet. Duplicates are dropped and the order the screen chose is kept.
 */
export const withLists = (
  columns: readonly TemplateColumn[],
  dictionary: Dictionary<string>,
  lists: TemplateLists,
): TemplateColumn[] => {
  const byHeading = new Map<string, readonly string[]>();
  for (const spec of dictionary.columns) {
    const options = [...new Set(lists[spec.field] ?? [])].filter(
      (option) => option.trim() !== "",
    );
    if (options.length > 0) byHeading.set(spec.column, options);
  }
  if (byHeading.size === 0) return [...columns];
  return columns.map((column) => {
    const options = byHeading.get(column.column);
    return options === undefined ? column : { ...column, dropdown: options };
  });
};

/**
 * The legend, when the API has not supplied one.
 *
 * Kept identical in wording to the employee entity's own `legend` in the API.
 * Two copies of five sentences is the same trade as the column dictionary
 * itself, and for the same reason: the first two steps of an import work
 * offline.
 */
export const FALLBACK_LEGEND: readonly string[] = [
  "Required, the import will not add a person without it.",
  "Recommended, the person is added, and they appear on a list of details somebody has to come back to.",
  "Optional, leave the column out entirely if you do not have it. A column you do not send is left alone on anybody we update.",
  "Delete the example row before you upload. Your headings can be named anything: you match them to ours on screen.",
  "Dates: DD/MM/YYYY or YYYY-MM-DD. Money: naira, monthly, and the naira sign and commas are fine.",
];

/** The heading as the sheet prints it: a required column carries an asterisk. */
export const marked = (column: TemplateColumn): string =>
  column.required ? `${column.column} *` : column.column;

/** The hidden sheet every dropdown points at. */
export const LISTS_SHEET = "Lists";

/**
 * The hidden sheet of option lists, and the dropdown cells that point at it.
 *
 * Shared by the template and by a downloaded draft, because both have to carry
 * the same dropdowns or a draft would lose them on the way back into Excel.
 *
 * Every dropdown column is paired with the index it holds on the *options*
 * sheet — never the index it holds on the main sheet, because two dropdown
 * columns sitting apart in the main sheet still need adjacent columns on the
 * sheet that carries their lists.
 */
export function dropdownSheets(columns: readonly TemplateColumn[]): {
  listRows: string[][];
  validations: {
    column: number;
    optionsSheet: string;
    optionsColumn: number;
    optionCount: number;
  }[];
} {
  const dropdowns = columns
    .map((column, index) => ({ index, options: column.dropdown }))
    .filter(
      (entry): entry is { index: number; options: readonly string[] } =>
        entry.options !== undefined && entry.options.length > 0,
    );

  const listRows: string[][] = [];
  if (dropdowns.length > 0) {
    const longest = Math.max(...dropdowns.map((d) => d.options.length));
    for (let row = 0; row < longest; row += 1) {
      listRows.push(dropdowns.map((d) => d.options[row] ?? ""));
    }
  }
  const validations = dropdowns.map((d, listsIndex) => ({
    column: d.index,
    optionsSheet: LISTS_SHEET,
    optionsColumn: listsIndex,
    optionCount: d.options.length,
  }));
  return { listRows, validations };
}

const need = (column: TemplateColumn): string =>
  column.required
    ? "Required"
    : column.recommended
      ? "Recommended"
      : "Optional";

/** The one example row, made obviously an example by the dictionary's overrides. */
export function exampleRow(columns: readonly TemplateColumn[]): string[] {
  return columns.map((column) => column.exampleOverride ?? column.example);
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
  options: {
    legend?: readonly string[];
    matching?: string;
    basename?: string;
    /** The sheet somebody fills in. "Staff list" for employees. */
    sheetName?: string;
    /**
     * Columns, by heading, whose dates Excel refuses unless they are written
     * in the given format, with a note on the cell saying so. See
     * `SheetSpec.dateChecks` for why it is a rule on the text and not Excel's
     * own date rule.
     */
    checkedDates?: readonly { column: string; format: DateCheckFormat }[];
  } = {},
): TemplateFiles {
  const {
    legend = FALLBACK_LEGEND,
    matching,
    basename = "approvehr-employees-template",
    sheetName = "Staff list",
    checkedDates = [],
  } = options;

  const headers = columns.map(marked);
  const example = exampleRow(columns);
  const row: CsvRow = Object.fromEntries(
    headers.map((heading, index) => [heading, example[index] ?? ""]),
  );

  const { listRows, validations } = dropdownSheets(columns);
  const dateChecks = checkedDates.flatMap(({ column, format }) => {
    const index = columns.findIndex((c) => c.column === column);
    return index === -1 ? [] : [{ column: index, format }];
  });

  const guide: string[][] = [
    ["How to fill this in"],
    ...legend.map((line) => [line]),
    ...(matching ? [[matching]] : []),
    [""],
    [
      "Column",
      "Needed?",
      "Example",
      "What goes in it",
      "Other headings we accept",
    ],
    ...columns.map((column) => [
      column.column,
      need(column),
      column.example,
      column.note,
      otherHeadings(column),
    ]),
  ];

  return {
    csv: toCsv(headers, [row]),
    xlsx: writeXlsx([
      {
        name: sheetName,
        rows: [headers, example],
        boldRows: [0],
        freezeFirstRow: true,
        /* The header cells are the longest thing in most columns, so the widths
           follow them. Enough to read; not so much that 33 columns cannot be
           scrolled. */
        widths: headers.map((heading) =>
          Math.min(34, Math.max(12, heading.length + 3)),
        ),
        ...(validations.length > 0 ? { validations } : {}),
        ...(dateChecks.length > 0 ? { dateChecks } : {}),
      },
      {
        name: "Columns explained",
        rows: guide,
        /* The title, the legend lines, and the table's own header row. */
        boldRows: [0, legend.length + (matching ? 1 : 0) + 2],
        widths: [36, 14, 24, 70, 44],
      },
      /* Hidden — this sheet exists only to give every dropdown a source range
         to point at, never for a person to open. See `SheetSpec.hidden`. */
      ...(listRows.length > 0
        ? [{ name: LISTS_SHEET, rows: listRows, hidden: true }]
        : []),
    ]),
    csvFilename: `${basename}.csv`,
    xlsxFilename: `${basename}.xlsx`,
  };
}
