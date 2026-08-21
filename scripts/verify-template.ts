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
 * Run by `npm run check`.
 */

import { parseCsv } from "../src/lib/csv";
import { guessMapping, isMappingReady, mapRow } from "../src/lib/imports/mapping";
import {
  buildTemplateFiles,
  columnsFromSpecs,
  exampleRow,
} from "../src/lib/imports/template-file";
import { EMPLOYEE_COLUMNS, HEADING, REQUIRED_FIELDS } from "../src/lib/imports/template";
import { columnIndex, columnName, readXlsx, serialToDate, writeXlsx } from "../src/lib/xlsx";

type Check = { name: string; got: unknown; want: unknown };
const checks: Check[] = [];
const eq = (name: string, got: unknown, want: unknown) =>
  checks.push({ name, got, want });

async function main(): Promise<void> {
  const columns = columnsFromSpecs();
  const files = buildTemplateFiles(columns, { matching: "We match on the staff number." });

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

  const mapping = guessMapping(csv.headers);
  /* The whole point. A customer who downloads this file, fills it in and
     uploads it must get past the matching step without touching a dropdown. */
  eq("the template's own headings all match a field", isMappingReady(mapping), true);
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

  /* And the example row's values reach the fields they are examples of. */
  const mapped = mapRow(csv.rows[0] as Record<string, string>, mapping);
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
