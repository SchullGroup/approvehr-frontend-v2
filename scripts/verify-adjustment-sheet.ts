/**
 * The payroll adjustment sheet: the blank-cell contract, asserted.
 *
 * `lib/payroll/adjustment-sheet.ts` is 469 lines of parsing that decides what a
 * whole company is paid, and the rule the entire feature turns on is a
 * distinction between two things that look identical in a spreadsheet:
 *
 *   an EMPTY CELL    means "take this figure off"      -> the key is `null`
 *   a DELETED COLUMN means "leave these figures alone" -> the key is ABSENT
 *
 * Get those the wrong way round and uploading a sheet with the overtime column
 * removed strips every hour of overtime in the run, silently, with the
 * arithmetic reconciling perfectly all the way down. That is the exact
 * signature of the ₦0-payroll incident this repo already paid for.
 *
 * `ParsedRow` encodes the rule in its type — `payeKobo?: number | null` — so
 * `tsc` keeps the *shape* honest. What no type can check is whether the parser
 * actually produces `undefined` where it means absent and `null` where it means
 * emptied, because both satisfy that type. Hence this file.
 *
 * Everything else risky in this repo has such a gate: `verify-csv` (101),
 * `verify-template` (34), `verify-loans` (600 schedules), `verify-payroll`
 * (52). This one had none.
 */

import {
  SHEET_BLANK_RULE,
  SHEET_COLUMNS,
  parseSheet,
  type ParsedSheet,
} from "../src/lib/payroll/adjustment-sheet";

let passed = 0;
let failed = 0;

function check(label: string, got: unknown, want: unknown): void {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) {
    passed += 1;
    console.log(`  pass  ${label.padEnd(62)} ${a}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}`);
    console.log(`        expected ${b}`);
    console.log(`        got      ${a}`);
  }
}

const csv = (body: string) =>
  parseSheet(new File([body], "sheet.csv", { type: "text/csv" }));

/* The four columns the upload reads, by their real headings. */
const entered = SHEET_COLUMNS.filter((c) => c.entered);
const headingOf = (key: string) =>
  SHEET_COLUMNS.find((c) => c.key === key)?.heading ?? key;

const STAFF = headingOf("staff_no");
/* Named explicitly rather than by position: the declaration order is
   monthly_salary, overtime_hours, bonus, paye_tax, and indexing into it is how
   a test ends up asserting about a different column than it names. */
const PAYE_KEY = "paye_tax";
const PAYE = headingOf(PAYE_KEY);
const OTHER_ENTERED = entered.filter((c) => c.key !== PAYE_KEY);

async function main() {
  console.log("\nThe figure columns, as declared");
  /* The set rather than the count. A bare number told the next person their
     change broke something and not what — this names the columns, so adding
     one is a one-line diff that reads as the decision it is. */
  check(
    "entered columns",
    entered.map((c) => c.key).join(", "),
    "monthly_salary, overtime_hours, bonus, paye_tax, pension, nhf",
  );
  check(
    "the rule is one exported sentence",
    /Emptying a cell/.test(SHEET_BLANK_RULE) && /whole column/.test(SHEET_BLANK_RULE),
    true,
  );

  /* ---------------------------------------------------------------- absent */

  console.log("\nA DELETED COLUMN leaves the figure alone — the key is absent");
  {
    const heads = [STAFF, ...OTHER_ENTERED.map((c) => c.heading)];
    const sheet: ParsedSheet = await csv(
      `${heads.join(",")}\nAHR-0001,${OTHER_ENTERED.map(() => "1").join(",")}\n`,
    );
    const row = sheet.rows[0];
    check("PAYE column not carried", sheet.carried.includes(PAYE_KEY), false);
    check(
      "so the PAYE key is ABSENT, not null",
      row ? Object.prototype.hasOwnProperty.call(row, "payeKobo") : "no row",
      false,
    );
  }

  /* ----------------------------------------------------------------- blank */

  console.log("\nAn EMPTY CELL takes the figure off — the key is present and null");
  {
    const sheet = await csv(`${STAFF},${PAYE}\nAHR-0001,\n`);
    const row = sheet.rows[0];
    check("PAYE column carried", sheet.carried.includes(PAYE_KEY), true);
    check(
      "the PAYE key is PRESENT",
      row ? Object.prototype.hasOwnProperty.call(row, "payeKobo") : "no row",
      true,
    );
    /* NOT `row?.payeKobo ?? "..."`: `??` collapses null into the fallback, so
       that expression cannot tell an emptied cell from a deleted column — the
       one distinction this whole file exists to check. */
    check(
      "and it is null",
      row && "payeKobo" in row ? (row.payeKobo === null ? "null" : row.payeKobo) : "absent",
      "null",
    );
  }

  console.log("\nAbsent and blank are therefore not the same object");
  {
    const deleted = await csv(`${STAFF}\nAHR-0001\n`);
    const emptied = await csv(`${STAFF},${PAYE}\nAHR-0001,\n`);
    check(
      "a deleted column and an emptied cell parse differently",
      JSON.stringify(deleted.rows[0]) === JSON.stringify(emptied.rows[0]),
      false,
    );
  }

  /* ----------------------------------------------------------- real values */

  console.log("\nWhat a person actually types is accepted");
  {
    const sheet = await csv(`${STAFF},${PAYE}\nAHR-0001,"₦50,000.00"\n`);
    check("naira, symbol and separators -> kobo", sheet.rows[0]?.payeKobo, 5_000_000);
  }
  {
    const sheet = await csv(`${STAFF},${PAYE}\nAHR-0001,0\n`);
    check("a typed zero is a figure, not an absence", sheet.rows[0]?.payeKobo, 0);
  }

  console.log("\nA cell that is not a number is refused, and says which");
  {
    const sheet = await csv(`${STAFF},${PAYE}\nAHR-0001,not-a-number\n`);
    check("one problem raised", sheet.problems.length, 1);
    check("naming the column", sheet.problems[0]?.column ?? "", PAYE_KEY);
  }

  console.log("\nA file with no staff_no cannot be applied to anybody");
  {
    const sheet = await csv(`${PAYE}\n5000\n`);
    check("no rows", sheet.rows.length, 0);
    check("refused by name", sheet.problems[0]?.column ?? "", "staff_no");
  }

  console.log("\nColumns we do not read are reported, never refused");
  {
    const sheet = await csv(`${STAFF},${PAYE},Favourite colour\nAHR-0001,5000,blue\n`);
    check("the row still parses", sheet.rows.length, 1);
    check("and the stray heading is named", sheet.ignored, ["Favourite colour"]);
  }

  console.log(
    `\nAdjustment sheet check ${failed === 0 ? "passed" : "FAILED"}. ` +
      `${passed} assertions, ${failed} failures.\n`,
  );
  if (failed > 0) process.exit(1);
}

void main();
