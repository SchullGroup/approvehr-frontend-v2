/**
 * Checks the CSV reader, the column matcher and the two cell parsers that stand
 * between a spreadsheet and somebody's salary.
 *
 * Every case here is one that a real Excel export produces and a naive
 * implementation gets wrong — a quoted address containing a comma, a cell with a
 * newline in it, the byte-order mark Excel writes at the front of a UTF-8 file,
 * a semicolon delimiter from a machine set to a European locale. Getting any of
 * them wrong does not throw: it silently shifts a column, so a bank account
 * number lands in the pension PIN field and nobody finds out until payday.
 *
 * Run by `npm run check`. Add a case for anything you change.
 */

import {
  csvCell,
  detectDelimiter,
  parseCsv,
  parseCsvRecords,
  toCsv,
} from "../src/lib/csv";
import { guessMapping, mapRow, reverseHeadings } from "../src/lib/imports/mapping";
import { EMPLOYEES } from "../src/lib/imports/employees";
import {
  checkMappedRows,
  parseImportDate,
  parseImportMoneyKobo,
} from "../src/lib/imports/check";
import { planParts } from "../src/lib/store/imports";

type Check = { name: string; got: unknown; want: unknown };

/** The message from a parser that refused, for asserting on what it said. */
const said = <T,>(
  parsed: { ok: true; value: T } | { ok: false; problem: string },
): string => (parsed.ok ? "" : parsed.problem);

const checks: Check[] = [];
const eq = (name: string, got: unknown, want: unknown) =>
  checks.push({ name, got, want });

/* --- The state machine -------------------------------------------------- */

eq(
  "plain row splits on commas",
  parseCsvRecords("a,b,c", ","),
  [["a", "b", "c"]],
);

eq(
  "quoted field keeps its comma",
  parseCsvRecords('EMP-1,"Ikeja, Lagos",162632', ","),
  [["EMP-1", "Ikeja, Lagos", "162632"]],
);

eq(
  "quoted field keeps its newline",
  parseCsvRecords('EMP-1,"12 Awolowo Road\nIkeja",162632', ","),
  [["EMP-1", "12 Awolowo Road\nIkeja", "162632"]],
);

eq(
  "doubled quotes become one quote",
  parseCsvRecords('"Bola ""BJ"" Ahmed",Analyst', ","),
  [["Bola \"BJ\" Ahmed", "Analyst"]],
);

eq(
  "CRLF ends a record, and the \\r is not kept",
  parseCsvRecords("a,b\r\nc,d", ","),
  [
    ["a", "b"],
    ["c", "d"],
  ],
);

eq(
  "a CR inside a quoted field survives",
  parseCsvRecords('"one\r\ntwo",b', ","),
  [["one\r\ntwo", "b"]],
);

eq(
  "a trailing newline does not invent a row",
  parseCsvRecords("a,b\nc,d\n", ","),
  [
    ["a", "b"],
    ["c", "d"],
  ],
);

eq(
  "a file that ends mid-row still yields it",
  parseCsvRecords("a,b\nc,d", ","),
  [
    ["a", "b"],
    ["c", "d"],
  ],
);

eq(
  "an empty trailing cell is a cell",
  parseCsvRecords("a,b,", ","),
  [["a", "b", ""]],
);

eq(
  "a row of only delimiters is three empty cells",
  parseCsvRecords(",,", ","),
  [["", "", ""]],
);

eq(
  "a quote that is not at the start of a field is literal",
  parseCsvRecords('5" pipe,b', ","),
  [['5" pipe', "b"]],
);

eq(
  "text after a closing quote is appended rather than lost",
  parseCsvRecords('"Lagos" Island,b', ","),
  [["Lagos Island", "b"]],
);

eq(
  "a file ending inside a quote keeps what it has",
  parseCsvRecords('a,"unterminated', ","),
  [["a", "unterminated"]],
);

eq("an empty string is no records", parseCsvRecords("", ","), []);

/* --- Delimiters --------------------------------------------------------- */

eq("comma is the default", detectDelimiter("a,b,c\n1,2,3"), ",");
eq("semicolons are detected", detectDelimiter("a;b;c\n1;2;3"), ";");
eq("tabs are detected", detectDelimiter("a\tb\tc"), "\t");
eq(
  "a comma inside a quoted cell does not outvote the real delimiter",
  detectDelimiter('a;"Ikeja, Lagos, Nigeria";c'),
  ";",
);
eq("one column has no evidence, so comma wins", detectDelimiter("employee_no"), ",");
eq(
  "only the first record votes",
  detectDelimiter("a;b\n1,2,3,4,5,6,7"),
  ";",
);

/* --- Whole files -------------------------------------------------------- */

const bom = parseCsv("﻿employee_no,first_name\nEMP-1,Ngozi\n");
eq("a BOM does not end up in the first heading", bom.headers, [
  "employee_no",
  "first_name",
]);
eq("the row after a BOM reads normally", bom.rows[0], {
  employee_no: "EMP-1",
  first_name: "Ngozi",
});

const semi = parseCsv("employee_no;salary\nEMP-1;162,632.00\n");
eq("a semicolon file parses", semi.rows[0], {
  employee_no: "EMP-1",
  salary: "162,632.00",
});
eq(
  "and says so in a note",
  semi.notes.some((note) => note.includes("semicolons")),
  true,
);

const spacedHeaders = parseCsv(" Employee ID , First Name \nEMP-1, Ngozi \n");
eq("headings are trimmed", spacedHeaders.headers, ["Employee ID", "First Name"]);
eq(
  "values are not trimmed — the parser keeps the file's bytes",
  spacedHeaders.rows[0]?.["First Name"],
  " Ngozi ",
);

const blanks = parseCsv("a,b\n\n1,2\n\n\n3,4\n");
eq("blank lines are skipped", blanks.rows.length, 2);
eq(
  "and counted in a note",
  blanks.notes.some((note) => note.includes("blank")),
  true,
);

const short = parseCsv("a,b,c\n1,2\n");
eq("a short row pads with empties", short.rows[0], { a: "1", b: "2", c: "" });
eq(
  "and is reported",
  short.notes.some((note) => note.includes("different number of cells")),
  true,
);

const long = parseCsv("a,b\n1,2,3\n");
eq("a long row keeps its extra cell", long.headers, ["a", "b", "column_3"]);
eq("under a positional heading", long.rows[0], {
  a: "1",
  b: "2",
  column_3: "3",
});

const unnamed = parseCsv("a,,c\n1,2,3\n");
eq("an empty heading is named by position", unnamed.headers, [
  "a",
  "column_2",
  "c",
]);

const dupes = parseCsv("phone,phone\n0803,0805\n");
eq("a repeated heading is numbered", dupes.headers, ["phone", "phone (2)"]);
eq("so neither column is lost", dupes.rows[0], {
  phone: "0803",
  "phone (2)": "0805",
});

const multiline = parseCsv('name,address\nNgozi,"12 Awolowo Road\nIkeja, Lagos"\n');
eq("a two-line cell is one row, not two", multiline.rows.length, 1);
eq(
  "and keeps both lines",
  multiline.rows[0]?.address,
  "12 Awolowo Road\nIkeja, Lagos",
);

eq("an empty file has no headings", parseCsv("").headers, []);
eq("a heading-only file has no rows", parseCsv("a,b,c\n").rows, []);

/* --- Writing ------------------------------------------------------------ */

eq("a plain value is not quoted", csvCell("Ngozi"), "Ngozi");
eq("a comma forces quotes", csvCell("Ikeja, Lagos"), '"Ikeja, Lagos"');
eq("a quote is doubled", csvCell('Bola "BJ"'), '"Bola ""BJ"""');
eq("a newline forces quotes", csvCell("one\ntwo"), '"one\ntwo"');
eq(
  "a leading space forces quotes, so it survives the round trip",
  csvCell(" 0803"),
  '" 0803"',
);
eq("a semicolon forces quotes too", csvCell("a;b"), '"a;b"');

const written = toCsv(
  ["employee_no", "address", "note", "account"],
  [
    {
      employee_no: "EMP-1",
      address: "12 Awolowo Road\nIkeja, Lagos",
      note: 'Bola "BJ" Ahmed',
      account: " 0123456789",
    },
  ],
);
eq("what we write leads with a BOM, for Excel", written.startsWith("﻿"), true);
const roundTrip = parseCsv(written);
eq("a round trip keeps every heading", roundTrip.headers, [
  "employee_no",
  "address",
  "note",
  "account",
]);
eq("and every value, exactly", roundTrip.rows[0], {
  employee_no: "EMP-1",
  address: "12 Awolowo Road\nIkeja, Lagos",
  note: 'Bola "BJ" Ahmed',
  account: " 0123456789",
});

eq(
  "a naira sign survives the round trip",
  parseCsv(toCsv(["pay"], [{ pay: "₦162,632.00" }])).rows[0]?.pay,
  "₦162,632.00",
);

/* --- Column matching ---------------------------------------------------- */

const guessed = guessMapping(EMPLOYEES, [
  "employee_id",
  "First Name",
  "surname",
  "job_title",
  "position",
  "state",
  "state_of_origin",
  "salary",
  "hire_date",
  "favourite_food",
]);

eq("employee_id is the staff number", guessed["employee_id"], "employeeNo");
eq("a heading's spaces and case do not matter", guessed["First Name"], "firstName");
eq("surname is the last name", guessed["surname"], "lastName");
eq("job_title beats position", guessed["job_title"], "jobTitle");
eq("so position is left for the person to decide", guessed["position"], "");
eq("state is the tax state", guessed["state"], "taxState");
eq(
  "state_of_origin is deliberately not the tax state",
  guessed["state_of_origin"],
  "",
);
eq("salary is the monthly gross", guessed["salary"], "grossMonthly");
eq("hire_date is the start date", guessed["hire_date"], "startDate");
eq("a heading we do not know is left out", guessed["favourite_food"], "");

eq(
  "mapped rows are keyed by the template's headings",
  mapRow(
    EMPLOYEES,
    { employee_id: " EMP-1 ", salary: "162,632.00", favourite_food: "jollof" },
    guessed,
  ),
  { employee_no: "EMP-1", gross_monthly: "162,632.00" },
);

eq(
  "an empty cell is left out of the payload entirely",
  mapRow(EMPLOYEES, { employee_id: "EMP-1", salary: "   " }, guessed),
  { employee_no: "EMP-1" },
);

eq(
  "and the file's own heading can be found again from ours",
  reverseHeadings(EMPLOYEES, guessed)["gross_monthly"],
  "salary",
);

/* --- Dates -------------------------------------------------------------- */

eq("DD/MM/YYYY is read day-first", parseImportDate("28/04/2021"), {
  ok: true,
  value: { iso: "2021-04-28", ambiguous: false },
});
eq("YYYY-MM-DD is read as written", parseImportDate("2021-04-28"), {
  ok: true,
  value: { iso: "2021-04-28", ambiguous: false },
});
eq(
  "a date that could be read two ways is flagged",
  parseImportDate("03/04/2021"),
  { ok: true, value: { iso: "2021-04-03", ambiguous: true } },
);
eq(
  "there is no month 13",
  said(parseImportDate("13/13/1990")).includes("no month 13"),
  true,
);
eq(
  "February has no 31st, even though the arithmetic rolls over",
  parseImportDate("31/02/2021").ok,
  false,
);
eq(
  "a two-digit year is refused rather than guessed",
  said(parseImportDate("28/04/21")).includes("two-digit year"),
  true,
);
eq(
  "a spreadsheet date serial is named for what it is",
  said(parseImportDate("44314")).includes("internal date number"),
  true,
);
eq(
  "an American ordering is not silently accepted",
  parseImportDate("04/28/2021").ok,
  false,
);
eq("dots and dashes work as separators", parseImportDate("28.04.2021").ok, true);
eq("words are not a date", parseImportDate("last April").ok, false);

/* --- Money -------------------------------------------------------------- */

eq("a plain figure is kobo", parseImportMoneyKobo("162632"), {
  ok: true,
  value: 16_263_200,
});
eq("commas and decimals are read exactly", parseImportMoneyKobo("162,632.29"), {
  ok: true,
  value: 16_263_229,
});
eq("a naira sign is fine", parseImportMoneyKobo("₦162,632.00"), {
  ok: true,
  value: 16_263_200,
});
eq("so is NGN and a space", parseImportMoneyKobo("NGN 162 632"), {
  ok: true,
  value: 16_263_200,
});
eq("one decimal place is tens of kobo", parseImportMoneyKobo("100.5"), {
  ok: true,
  value: 10_050,
});
eq("three decimal places are refused, not rounded", parseImportMoneyKobo("100.555").ok, false);
eq("a negative salary is refused", parseImportMoneyKobo("-5000").ok, false);
eq("accounting parentheses are also negative", parseImportMoneyKobo("(5,000)").ok, false);
eq("zero is refused", parseImportMoneyKobo("0").ok, false);
eq("a word is not an amount", parseImportMoneyKobo("competitive").ok, false);
eq("an empty cell is refused", parseImportMoneyKobo("   ").ok, false);

/* --- The row check ------------------------------------------------------ */

const present = new Set([
  "employeeNo",
  "firstName",
  "lastName",
  "jobTitle",
  "startDate",
  "grossMonthly",
  "dateOfBirth",
] as const);

const report = checkMappedRows(
  EMPLOYEES,
  [
    {
      employee_no: "EMP-1",
      first_name: "Ngozi",
      last_name: "Williams",
      job_title: "Analyst",
      start_date: "28/04/2021",
      gross_monthly: "162,632.00",
    },
    {
      employee_no: "EMP-1",
      first_name: "Adaeze",
      last_name: "Okafor",
      job_title: "Manager",
      start_date: "01/06/2020",
      gross_monthly: "300000",
      date_of_birth: "13/13/1990",
    },
    {
      first_name: "Chinedu",
      last_name: "Bassey",
      job_title: "Driver",
      start_date: "2019-01-15",
      gross_monthly: "90000",
    },
  ],
  { presentFields: present },
);

eq("three rows checked", report.totalRows, 3);
/* Row 3 has no staff number, and that is no longer a refusal: the
   single-employee form generates one, so the importer does too. Row 2 fails on
   its repeated number and its impossible birthday. */
eq("two import", report.toImport, 2);
eq("one is skipped", report.toSkip, 1);
eq(
  "the duplicate staff number names the row it first appeared on",
  report.rows[1]?.errors.some((issue) => issue.problem.includes("row 1")),
  true,
);
eq(
  "the impossible birthday is reported against its own column",
  report.rows[1]?.errors.some((issue) => issue.column === "date_of_birth"),
  true,
);
eq(
  "a row with no staff number is not refused for it",
  report.rows[2]?.errors,
  [],
);
/* It is flagged instead, and the reason names what a missing email costs
   rather than merely marking the cell. */
eq(
  "a row with nothing optional filled in is flagged, not blocked",
  report.rows[2]?.missing.map((item) => item.field),
  ["email", "bankAccount", "pensionPin", "tin", "annualRent"],
);
eq("and the flagged rows are counted", report.flagged, 2);
eq(
  "row numbers are the file's own",
  report.rows.map((row) => row.row),
  [1, 2, 3],
);

const noColumn = checkMappedRows(EMPLOYEES, [{ first_name: "Ngozi" }], {
  presentFields: new Set(["firstName"] as const),
});
eq(
  "a required column the file does not have says so instead of blaming the cell",
  noColumn.rows[0]?.errors.some((issue) =>
    issue.problem.includes("has no start_date column"),
  ),
  true,
);

/* Two rows claiming one work email are one person written twice, whatever their
   staff numbers say. The API asks the same question against the directory; this
   is the half of it the file alone can answer. */
const sameEmail = checkMappedRows(
  EMPLOYEES,
  [
    {
      employee_no: "EMP-1",
      first_name: "Ada",
      last_name: "One",
      job_title: "Analyst",
      start_date: "2021-01-04",
      gross_monthly: "150000",
      email: "ada@company.test",
    },
    {
      employee_no: "EMP-2",
      first_name: "Ada",
      last_name: "Two",
      job_title: "Analyst",
      start_date: "2021-01-04",
      gross_monthly: "150000",
      email: "ADA@company.test",
    },
  ],
  { presentFields: new Set(["employeeNo", "email"] as const) },
);
eq(
  "the second row sharing a work email is refused, naming the first",
  sameEmail.rows[1]?.errors.some((issue) =>
    issue.problem.includes("already on row 1"),
  ),
  true,
);
eq("and the first still imports", sameEmail.toImport, 1);

/* --- Splitting a file into requests ------------------------------------- */

/* The API takes rows as JSON behind a 100kb body limit, so a real file is
   several requests. These assert the two properties that matter: no part is
   oversized, and between them the parts cover every row exactly once — a gap
   here is a person who quietly never gets imported. */

const thin = Array.from({ length: 40 }, (_unused, index) => ({
  employee_no: `EMP-${index}`,
}));
eq("a small thin file is one request", planParts(thin).length, 1);
eq("and it covers every row", planParts(thin)[0], { start: 0, end: 40 });

const fat = Array.from({ length: 900 }, (_unused, index) => ({
  employee_no: `EMP-${index}`,
  first_name: "Ngozi",
  last_name: "Williams",
  job_title: "Data Analyst",
  start_date: "28/04/2021",
  gross_monthly: "162,632.00",
  email: "ngozi.williams@a-fairly-long-company-name.com.ng",
  phone: "+234 803 111 0011",
  bank_name: "First Bank of Nigeria",
  account_number: "9477600630",
  pension_pin: "PEN100234567",
  pension_provider: "Stanbic IBTC Pension Managers",
  tax_state: "Lagos",
  next_of_kin_name: "Chinedu Williams",
  next_of_kin_phone: "+234 803 111 0022",
  work_location: "Lagos Office",
  department: "Finance",
}));
const fatParts = planParts(fat);
eq("a fat file is split into several", fatParts.length > 1, true);
eq(
  "no part is bigger than the API's cap",
  fatParts.every((part) => part.end - part.start <= 500),
  true,
);
eq(
  "the parts are contiguous and cover every row once",
  fatParts.reduce(
    (previous, part) => (previous === part.start ? part.end : -1),
    0,
  ),
  900,
);
eq("an empty file needs no requests", planParts([]), []);

/* --- Report ------------------------------------------------------------- */

const rows: string[] = [];
const failures: string[] = [];

for (const check of checks) {
  const got = JSON.stringify(check.got);
  const want = JSON.stringify(check.want);
  const pass = got === want;
  rows.push(`  ${pass ? "pass" : "FAIL"}  ${check.name}`);
  if (!pass) failures.push(`${check.name}: got ${got}, want ${want}`);
}

console.log(rows.join("\n"));

if (failures.length) {
  console.error(`\nCSV check failed:\n${failures.map((f) => "  " + f).join("\n")}`);
  process.exit(1);
}
console.log(`\nCSV check passed. ${checks.length} assertions.`);
