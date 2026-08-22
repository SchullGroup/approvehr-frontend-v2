/**
 * Checks that the file we hand a customer is a file we can read back.
 *
 * The failure this exists to prevent is specific and expensive: a template that
 * has drifted from the parser. Every customer's first act is to download it,
 * fill it in and upload it, so a heading the template prints and the importer
 * does not recognise fails the very first import of every new account — and it
 * fails in the least debuggable way, because the customer did exactly what they
 * were told.
 *
 * So nothing here checks the template against a list of expected columns. It
 * checks it against **the parser**: build the file, read it back the way the
 * upload does, and assert the values land on the fields the dictionary says they
 * should. Add a column to the dictionary and these assertions cover it without
 * being edited.
 *
 * Three more things it gates, added when the importer became a framework:
 *
 * - **Required columns lead.** The order is derived by `buildDictionary` rather
 *   than written down, so this asserts the derivation rather than a list:
 *   required, then recommended, then the rest, with nothing out of tier.
 * - **The example row is obviously an example**, from the dictionary's own
 *   `templateExample` declarations rather than a map in the file writer.
 * - **The API's copy of the dictionary agrees with this one**, when
 *   `approvehr-api` is checked out beside this repo. That is the drift the
 *   mirror's own header warns about, and it is worth a check rather than a
 *   sentence: the API's copy is the one that answers, so a column added there
 *   and not here is offered as "do not import" on a screen with no API.
 *
 * Run by `npm run check`.
 */

/* `DEMO_ENABLED` before anything from `src/`: the app modules below reference
   it and the bundler that normally substitutes it is not here. */
import "./demo-global";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseCsv } from "../src/lib/csv";
import { guessMapping, isMappingReady, mapRow } from "../src/lib/imports/mapping";
import {
  buildTemplateFiles,
  columnsFromDictionary,
  exampleRow,
} from "../src/lib/imports/template-file";
import { EMPLOYEES } from "../src/lib/imports/employees";
import { columnIndex, columnName, readXlsx, serialToDate, writeXlsx } from "../src/lib/xlsx";

type Check = { name: string; got: unknown; want: unknown };
const checks: Check[] = [];
const eq = (name: string, got: unknown, want: unknown) =>
  checks.push({ name, got, want });

async function main(): Promise<void> {
  const columns = columnsFromDictionary(EMPLOYEES);
  const files = buildTemplateFiles(columns, {
    basename: EMPLOYEES.templateFile.basename,
    sheetName: EMPLOYEES.templateFile.sheetName,
    matching: "We match on the staff number.",
  });
  /* Read off the built dictionary, never a hand-kept list — that is the loop
     this script exists to prove. */
  const EMPLOYEE_COLUMNS = EMPLOYEES.columns;
  const HEADING = EMPLOYEES.heading;
  const REQUIRED_FIELDS = EMPLOYEES.requiredFields;

  /* --- The spreadsheet primitives ------------------------------------- */

  eq("column letters go past Z", [0, 25, 26, 27, 51, 52].map(columnName), [
    "A",
    "Z",
    "AA",
    "AB",
    "AZ",
    "BA",
  ]);
  eq(
    "and come back",
    ["A", "Z", "AA", "AB", "AZ", "BA"].map(columnIndex),
    [0, 25, 26, 27, 51, 52],
  );

  /* 44314 is 28 April 2021, which is the date every other test in this repo
     uses. Excel counts from 1900 and believes 1900 was a leap year, so the
     epoch is the 30th of December 1899 rather than the 31st — off by one there
     puts every imported start date a day early. */
  eq("a date serial reads as the date the sheet shows", serialToDate(44314, false), "2021-04-28");
  /* Old Mac Excel counts from 1 January 1904 and has no leap-year fiction, so
     the same serial is a different day. Checked against a calendar, not guessed:
     1904-01-01 plus 41000 days. */
  eq("the 1904 workbook epoch is different", serialToDate(41000, true), "2016-04-02");
  /* Serials inside the 1900 leap-year fiction are refused rather than shifted. */
  eq("a serial inside the 1900 fiction is refused", serialToDate(59, false), null);

  /* --- Two downloads of the same template are the same file ----------- */

  const twice = buildTemplateFiles(columns);
  eq(
    "the workbook is byte-identical each time it is built",
    Buffer.from(twice.xlsx).equals(Buffer.from(buildTemplateFiles(columns).xlsx)),
    true,
  );

  /* --- The CSV, read back the way an upload reads it ------------------- */

  const csv = parseCsv(files.csv);
  eq("the CSV has one example row", csv.rows.length, 1);
  eq("and reading it back finds nothing to warn about", csv.notes, []);
  eq(
    "every column in the file is one column in the template",
    csv.headers.length,
    columns.length,
  );

  const mapping = guessMapping(EMPLOYEES, csv.headers);
  /* The whole point. A customer who downloads this file, fills it in and
     uploads it must get past the matching step without touching a dropdown. */
  eq(
    "the template's own headings all match a field",
    isMappingReady(EMPLOYEES, mapping),
    true,
  );
  eq(
    "no heading in the template is left unmatched",
    csv.headers.filter((heading) => !mapping[heading]),
    [],
  );
  eq(
    "and every field in the dictionary is offered a column",
    EMPLOYEE_COLUMNS.filter(
      (spec) => !Object.values(mapping).includes(spec.field),
    ).map((spec) => spec.column),
    [],
  );

  /* The asterisk on a required heading is the one piece of decoration in the
     file, and it is only safe because heading matching normalises punctuation
     away. Asserted rather than assumed, on the real required set. */
  eq(
    "required headings are marked, and the marker still matches",
    REQUIRED_FIELDS.map((field) => {
      const heading = csv.headers.find((name) => mapping[name] === field) ?? "";
      return heading.endsWith(" *") && heading.startsWith(HEADING[field]);
    }),
    REQUIRED_FIELDS.map(() => true),
  );
  eq(
    "nothing optional is marked",
    csv.headers.filter(
      (heading) =>
        heading.endsWith(" *") &&
        !REQUIRED_FIELDS.includes(mapping[heading] as never),
    ),
    [],
  );

  /* --- Required columns lead ------------------------------------------- */

  /* The product owner asked for the essential fields first so the sheet is not
     bloated. `buildDictionary` derives the order, so what is asserted is the
     derivation: every required column before every recommended one, and every
     recommended one before every optional one. */
  const tier = (column: { required: boolean; recommended: boolean }): number =>
    column.required ? 0 : column.recommended ? 1 : 2;
  eq(
    "required columns lead, then recommended, then the rest",
    columns.map(tier),
    [...columns.map(tier)].sort((a, b) => a - b),
  );
  eq(
    "so the file opens on the columns a row cannot be imported without",
    csv.headers.slice(0, REQUIRED_FIELDS.length).map((heading) => mapping[heading]),
    [...REQUIRED_FIELDS],
  );
  /* And the declaration keeps its own grouping inside a tier — the sort is
     stable, so this is the check that a reorder has not shuffled the sheet. */
  eq(
    "and the declaration's own order survives inside each tier",
    columns.filter((column) => tier(column) === 2).map((column) => column.column)[0],
    "employee_no",
  );

  /* And the example row's values reach the fields they are examples of. */
  const mapped = mapRow(EMPLOYEES, csv.rows[0] as Record<string, string>, mapping);
  eq(
    "the example row's start date lands on the start date field",
    mapped[HEADING.startDate],
    EMPLOYEE_COLUMNS.find((spec) => spec.field === "startDate")?.example,
  );
  eq(
    "the example row's pay lands on the pay field",
    mapped[HEADING.grossMonthly],
    EMPLOYEE_COLUMNS.find((spec) => spec.field === "grossMonthly")?.example,
  );
  eq(
    "the example row says to delete it",
    `${mapped[HEADING.firstName]} ${mapped[HEADING.lastName]}`,
    "DELETE THIS ROW",
  );
  /* It says so because the dictionary declares it, not because the file writer
     keeps a map of column names. A new entity's own giveaway travels the same
     way, including over the wire from the API. */
  eq(
    "and it says so from the dictionary's own declaration",
    EMPLOYEE_COLUMNS.filter((spec) => spec.templateExample !== undefined).map(
      (spec) => spec.column,
    ),
    ["first_name", "last_name", "email", "employee_no"],
  );

  /* --- The workbook holds the same two rows --------------------------- */

  const workbook = await readXlsx(files.xlsx);
  eq("the workbook has a staff sheet and a guide", workbook.sheets.length, 2);
  eq("the sheet somebody fills in comes first", workbook.sheets[0]?.name, "Staff list");
  eq(
    "the workbook's headings are the CSV's headings",
    workbook.sheets[0]?.grid[0],
    csv.headers,
  );
  eq(
    "the workbook's example row is the CSV's example row",
    workbook.sheets[0]?.grid[1],
    exampleRow(columns),
  );
  eq(
    "nothing was stored as a number, so nothing had to be converted",
    workbook.notes,
    [],
  );

  /* The guide names every column exactly once, so a column cannot be in the
     file with nothing said about it. */
  const guide = workbook.sheets[1]?.grid ?? [];
  const explained = guide
    .map((row) => row[0] ?? "")
    .filter((first) => columns.some((column) => column.column === first));
  eq("the guide explains every column", explained.length, columns.length);
  eq(
    "the guide says which are required",
    guide.filter((row) => row[1] === "Required").length,
    REQUIRED_FIELDS.length,
  );
  eq(
    "and which are recommended",
    guide.filter((row) => row[1] === "Recommended").length,
    EMPLOYEE_COLUMNS.filter((spec) => spec.recommended !== undefined).length,
  );

  /* --- Reading a file we did not write -------------------------------- */

  /* Sparse cells: a sheet omits an empty cell entirely rather than writing an
     empty one, so a reader that takes cells in order shifts every value after
     the gap into the wrong column. In this file B2 is absent. */
  const sparse = writeXlsx([
    {
      name: "Sheet1",
      rows: [
        ["employee_no", "first_name", "gross_monthly"],
        ["EMP-1", "", "162632"],
      ],
    },
  ]);
  const readBack = await readXlsx(sparse);
  eq(
    "a missing cell leaves a hole rather than shifting the row",
    readBack.sheets[0]?.grid[1],
    ["EMP-1", "", "162632"],
  );

  /* --- The API's copy of the dictionary, when it is checked out --------
     The mirror's header says "if you change the API's dictionary, re-copy it
     here", and a sentence is not a gate. The API's copy is the one that answers,
     so drift shows up as a column the screen offers as "do not import". Parsed
     out of the API's source as text, the same way `verify-payroll.ts` reads the
     tax schedules, because this package cannot resolve that tree. */

  const apiDictionary = path.resolve(
    import.meta.dirname,
    "../../../approvehr-api/src/modules/imports/employees.ts",
  );

  if (existsSync(apiDictionary)) {
    const source = readFileSync(apiDictionary, "utf8");
    const declaration = source.slice(
      source.indexOf("export const EMPLOYEE_COLUMNS"),
      source.indexOf("\n];", source.indexOf("export const EMPLOYEE_COLUMNS")),
    );

    /* One block per spec. Split on the object boundary rather than matching
       across it — a lazy regex over the whole array reads one spec's `column`
       against the next spec's `recommended`, which is a false pass in one
       direction and a false failure in the other. */
    const blocks = declaration
      .split(/\n  \{\n/)
      .slice(1)
      .map((block) => block.split(/\n  \},?/)[0] ?? "");
    const columnOf = (block: string): string =>
      /\n    column: "([^"]+)"/.exec(block)?.[1] ?? "";

    eq(
      "the API declares the same columns as the mirror",
      blocks.map(columnOf).sort(),
      EMPLOYEE_COLUMNS.map((spec) => spec.column).sort(),
    );
    eq(
      "and the same required set",
      blocks
        .filter((block) => /\n    required: true,/.test(block))
        .map(columnOf)
        .sort(),
      EMPLOYEE_COLUMNS.filter((spec) => spec.required)
        .map((spec) => spec.column)
        .sort(),
    );
    eq(
      "and the same recommended set",
      blocks
        .filter((block) => /\n    recommended: \{/.test(block))
        .map(columnOf)
        .sort(),
      EMPLOYEE_COLUMNS.filter((spec) => spec.recommended !== undefined)
        .map((spec) => spec.column)
        .sort(),
    );
    eq(
      "and the same date and money columns",
      blocks
        .filter((block) => /\n    cell: \{/.test(block))
        .map(columnOf)
        .sort(),
      EMPLOYEE_COLUMNS.filter((spec) => spec.cell !== undefined)
        .map((spec) => spec.column)
        .sort(),
    );
  } else {
    console.log(
      "  skip  the mirror vs the API's dictionary — approvehr-api is not checked out beside this repo",
    );
  }

  /* --- Report --------------------------------------------------------- */

  const lines: string[] = [];
  const failures: string[] = [];
  for (const check of checks) {
    const got = JSON.stringify(check.got);
    const want = JSON.stringify(check.want);
    const pass = got === want;
    lines.push(`  ${pass ? "pass" : "FAIL"}  ${check.name}`);
    if (!pass) failures.push(`${check.name}: got ${got}, want ${want}`);
  }
  console.log(lines.join("\n"));

  if (failures.length) {
    console.error(
      `\nTemplate check failed:\n${failures.map((f) => "  " + f).join("\n")}`,
    );
    process.exit(1);
  }
  console.log(`\nTemplate check passed. ${checks.length} assertions.`);
}

/* No top-level await: `tsx` compiles these scripts to CJS. */
void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
