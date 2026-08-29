import { parseCsv, toCsv, type CsvRow } from "@/lib/csv";
import { readXlsx, writeXlsx, type SheetSpec } from "@/lib/xlsx";
import type { Employee } from "@/lib/types";
import type { Payslip } from "@/lib/api/payroll";

/**
 * The payroll adjustment sheet: one row per person, downloaded already filled in.
 *
 * ## Why this is not an `ImportEntity`
 *
 * `lib/imports/` is a framework for **creating and updating records** from
 * somebody else's spreadsheet: a dictionary of thirty-three columns, a heading
 * matcher that reads whatever a customer happens to call things, duplicate
 * detection, a two-step validate/apply with a fingerprint. All of that exists
 * because the file arrives from outside and nobody knows what is in it.
 *
 * This file is the opposite case in every one of those respects:
 *
 * - **It is ours going out and coming back.** The headings are the ones we
 *   wrote on it, so there is nothing to match — a returned sheet either has our
 *   columns or it is not this sheet.
 * - **Everybody in it already exists.** There is nothing to create and no
 *   duplicate to resolve; the identity column is filled in and locked.
 * - **It is about one payroll**, so it expires with the period.
 *
 * Reusing the framework would mean a dictionary whose matcher never matches
 * anything unexpected, a duplicate step that can never fire, and a batch record
 * for a file that is applied whole or not at all. What is genuinely shared —
 * writing a workbook, reading one back — is `lib/xlsx.ts` and `lib/csv.ts`, and
 * both are used directly here.
 *
 * ## Pre-filled, and that is the feature
 *
 * A blank template for 300 staff is a spreadsheet somebody has to type 300
 * names into, in the right order, matching our spelling. This one downloads
 * with the staff number, name, email, phone, department, bank and account
 * number already in it — the details somebody needs in order to *check* they
 * are looking at the right person — plus the figures the run currently holds.
 *
 * That has a consequence the whole feature turns on: because the file arrives
 * carrying today's figures, **emptying a cell is a statement**. See
 * `SHEET_BLANK_RULE`.
 */

/* ------------------------------------------------------------------ columns */

/**
 * A column on the sheet.
 *
 * `entered` is the distinction that matters: the first seven columns are there
 * so a person can see who a row is about, and the last four are the ones the
 * upload reads. Nothing stops somebody editing a name in Excel — what stops it
 * mattering is that we never read it back.
 */
export type SheetColumn = {
  key: string;
  heading: string;
  note: string;
  /** True for the four figures the upload actually reads. */
  entered: boolean;
};

export const SHEET_COLUMNS: readonly SheetColumn[] = [
  {
    key: "staff_no",
    heading: "staff_no",
    note: "Who the row is about. Do not change it — it is how the upload finds them.",
    entered: false,
  },
  { key: "name", heading: "name", note: "For reading. Not read back.", entered: false },
  { key: "email", heading: "email", note: "For reading. Not read back.", entered: false },
  { key: "phone", heading: "phone", note: "For reading. Not read back.", entered: false },
  {
    key: "department",
    heading: "department",
    note: "For reading. Not read back.",
    entered: false,
  },
  { key: "bank", heading: "bank", note: "Where they are paid. Not read back.", entered: false },
  {
    key: "account_number",
    heading: "account_number",
    note: "Where they are paid. Not read back.",
    entered: false,
  },
  {
    key: "monthly_salary",
    heading: "monthly_salary",
    note:
      "Naira. Changes their record from now on, not just this payroll. " +
      "Leaving it blank changes nothing — there is no such thing as no salary.",
    entered: true,
  },
  {
    key: "overtime_hours",
    heading: "overtime_hours",
    note:
      "Hours only. The rate is the company's own weekday rate, worked out from " +
      "their salary. Empty this cell to take hand-entered overtime off.",
    entered: true,
  },
  {
    key: "bonus",
    heading: "bonus",
    note: "Naira, this month only. Empty this cell to take a bonus off.",
    entered: true,
  },
  {
    key: "paye_tax",
    heading: "paye_tax",
    note:
      "Naira. Only fill this in to override the tax the system worked out. " +
      "Empty this cell to go back to the computed figure.",
    entered: true,
  },
  {
    key: "pension",
    heading: "pension",
    note:
      "Naira, this month only. Fill this in to deduct a different amount from " +
      "this person — 0 deducts nothing from them. That is not the same as your " +
      "company having no scheme, which is a switch in Settings. Empty this " +
      "cell to go back to the computed figure.",
    entered: true,
  },
  {
    key: "nhf",
    heading: "nhf",
    note:
      "Naira, this month only. Same rule as pension: 0 deducts nothing from " +
      "this person, and emptying the cell goes back to the computed figure.",
    entered: true,
  },
] as const;

/**
 * The one rule somebody has to understand before they edit this file.
 *
 * Written once, rendered on the guide sheet **and** on the screen above the
 * upload button, so the file and the product cannot describe it differently.
 */
export const SHEET_BLANK_RULE =
  "This sheet comes filled in with what is on the payroll now. Emptying a cell " +
  "takes that figure off; deleting a whole column leaves it alone. Monthly " +
  "salary is the exception — an empty cell there changes nothing.";

export const SHEET_LEGEND: readonly string[] = [
  SHEET_BLANK_RULE,
  "Only the last four columns are read back. Everything before them is here so " +
    "you can see who a row is about.",
  "Do not add rows. Somebody who is not on this payroll cannot be adjusted on it.",
  "Amounts are naira. Do not type a currency symbol or a thousands separator.",
];

/* -------------------------------------------------------------- filling it in */

/** Naira, to two places, with nothing dressing it up. Excel wants a number. */
const naira = (kobo: number): string => (kobo / 100).toFixed(2);

/**
 * What the run currently holds for one person, in the sheet's own columns.
 *
 * `monthly_salary` comes from the **directory**, not from the payslip's gross.
 * A prorated payslip carries the prorated contract, so deriving it there would
 * put a smaller figure in front of somebody for anybody who had unpaid days —
 * and they would upload it straight back as a pay cut. That is the same defect
 * the inline editor had, one screen along, and it is why `monthlyOf` exists.
 */
export type SheetRowSource = {
  payslip: Payslip;
  employee: Employee | undefined;
  /** Hand-entered hours already on the run, if any. */
  overtimeHours: number | null;
  bonusKobo: number | null;
};

export function sheetRow(source: SheetRowSource): CsvRow {
  const { payslip, employee } = source;
  return {
    staff_no: payslip.employeeNo,
    name: payslip.name,
    email: employee?.email ?? "",
    phone: employee?.phone ?? "",
    department: employee?.department ?? "",
    bank: employee?.bankName ?? "",
    /* Text, always. An account number is digits with a meaningful leading zero,
       and every NUBAN starting 0 loses it the moment Excel reads it as a
       number. The template formats every column as text for this reason. */
    account_number: employee?.bankAccount ?? "",
    /* Null is nobody having recorded a salary, which the run already raises
       as a blocker. An empty cell here is the honest rendering of that, and
       it is also the cell somebody is about to fill in. */
    monthly_salary:
      employee?.grossMonthly == null ? "" : employee.grossMonthly.toFixed(2),
    overtime_hours: source.overtimeHours === null ? "" : String(source.overtimeHours),
    bonus: source.bonusKobo === null ? "" : naira(source.bonusKobo),
    /* Only pre-filled when somebody has already overridden it. Filling every
       row with the computed tax would make an untouched sheet look like three
       hundred hand-entered figures on the way back in, and would freeze the
       engine's own answer the moment anybody uploaded anything. */
    paye_tax: payslip.payeOverridden ? naira(payslip.payeKobo) : "",
    /* Same rule as `paye_tax` above and for the same reason: filling every row
       with the computed figure would make an untouched sheet look like three
       hundred hand-entered deductions on the way back in, and would freeze the
       engine's answer the moment anybody uploaded anything.

       `overriddenDeductions` is the payslip's own record of which ones a
       person set, so a downloaded sheet carries back exactly what is on the
       payroll — and a row nobody touched round-trips to no change. */
    pension: (payslip.overriddenDeductions ?? []).includes("PENSION_EMPLOYEE")
      ? naira(payslip.pensionEmployeeKobo)
      : "",
    nhf: (payslip.overriddenDeductions ?? []).includes("NHF")
      ? naira(payslip.nhfKobo)
      : "",
  };
}

export type SheetFiles = {
  csv: string;
  xlsx: Uint8Array;
  csvFilename: string;
  xlsxFilename: string;
};

export function buildSheet(rows: readonly CsvRow[], period: string): SheetFiles {
  const headings = SHEET_COLUMNS.map((c) => c.heading);
  const basename = `approvehr-payroll-${period}`;

  const guide: string[][] = [
    ["How to fill this in"],
    ...SHEET_LEGEND.map((line) => [line]),
    [""],
    ["Column", "Read back?", "What goes in it"],
    ...SHEET_COLUMNS.map((c) => [c.heading, c.entered ? "Yes" : "No", c.note]),
  ];

  const sheets: SheetSpec[] = [
    {
      name: "Payroll",
      rows: [headings, ...rows.map((row) => headings.map((h) => row[h] ?? ""))],
      boldRows: [0],
      freezeFirstRow: true,
      widths: headings.map((h) => Math.min(34, Math.max(14, h.length + 4))),
    },
    { name: "Columns explained", rows: guide, boldRows: [0, SHEET_LEGEND.length + 2] },
  ];

  return {
    csv: toCsv(headings, rows),
    xlsx: writeXlsx(sheets),
    csvFilename: `${basename}.csv`,
    xlsxFilename: `${basename}.xlsx`,
  };
}

/* ------------------------------------------------------------------ reading */

/**
 * One row, as the API's `POST /runs/:id/adjustments` wants it.
 *
 * **A key is present only when the file carried that column.** That is the
 * whole contract with the API and it is why this is built key by key rather
 * than as an object literal with four `undefined`s in it: the server reads the
 * columns a file carried with `in`, which is true for a key holding
 * `undefined`, so a spread would tell it that a sheet of overtime hours had
 * something to say about every bonus on the run.
 */
export type ParsedRow = {
  row: number;
  employeeNo: string;
  payeKobo?: number | null;
  /** Pension and NHF. Zero is a figure; `null` clears back to the computed one. */
  pensionKobo?: number | null;
  nhfKobo?: number | null;
  overtimeHours?: number | null;
  bonusKobo?: number | null;
  monthlyKobo?: number | null;
};

export type SheetProblem = { row: number; column: string; problem: string };

export type ParsedSheet = {
  rows: readonly ParsedRow[];
  problems: readonly SheetProblem[];
  /** Headings in the file that this sheet does not use. Reported, not refused. */
  ignored: readonly string[];
  /** Which of the four figure columns the file actually carried. */
  carried: readonly string[];
};

/** Headings are matched on their own terms, minus case and punctuation. */
const normalise = (heading: string): string =>
  heading
    .toLowerCase()
    .replace(/﻿/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/**
 * A money cell, in naira, to kobo.
 *
 * Accepts what a person actually types — `₦`, thousands separators, a trailing
 * space — because refusing `₦50,000` on a sheet we told them was naira is a
 * refusal about punctuation rather than about money. `Math.round` at the end is
 * the only rounding, and it is to the kobo.
 */
function moneyKobo(raw: string): number | null | "bad" {
  const text = raw.trim();
  if (text === "") return null;
  const cleaned = text.replace(/[₦,\s]/g, "");
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return "bad";
  return Math.round(value * 100);
}

function hours(raw: string): number | null | "bad" {
  const text = raw.trim();
  if (text === "") return null;
  const value = Number(text.replace(/[,\s]/g, ""));
  if (!Number.isFinite(value) || value < 0) return "bad";
  return value;
}

/**
 * Reads a returned sheet — CSV or workbook — into what the API takes.
 *
 * Refuses **nothing** on its own beyond a cell that is not a number: whether a
 * person exists, whether they are on this payroll, and whether the same person
 * appears twice are all the server's to answer, and answering them twice in two
 * places is how the two start disagreeing. What this does is the half a browser
 * can do without asking: read the file, find the columns, and turn text into
 * figures.
 */
export async function parseSheet(file: File): Promise<ParsedSheet> {
  const headings: string[] = [];
  const records: string[][] = [];

  if (/\.xlsx?$/i.test(file.name)) {
    const workbook = await readXlsx(await file.arrayBuffer());
    /* The first sheet with rows in it. Our own guide tab is second, and a
       customer's cover note is common — the importer picks the same way. */
    const sheet = workbook.sheets.find((s) => s.grid.length > 1) ?? workbook.sheets[0];
    const rows = sheet?.grid ?? [];
    headings.push(...(rows[0] ?? []));
    records.push(...rows.slice(1));
  } else {
    const parsed = parseCsv(await file.text());
    headings.push(...parsed.headers);
    records.push(...parsed.rows.map((row) => parsed.headers.map((h) => row[h] ?? "")));
  }

  const index = new Map<string, number>();
  const ignored: string[] = [];
  headings.forEach((heading, at) => {
    const key = normalise(heading);
    if (SHEET_COLUMNS.some((c) => c.key === key)) index.set(key, at);
    else if (heading.trim() !== "") ignored.push(heading);
  });

  const problems: SheetProblem[] = [];
  if (!index.has("staff_no")) {
    problems.push({
      row: 0,
      column: "staff_no",
      problem:
        "That file has no staff_no column, so there is no way to tell whose " +
        "figures are whose. Download the sheet again and fill that one in.",
    });
    return { rows: [], problems, ignored, carried: [] };
  }

  const carried = SHEET_COLUMNS.filter((c) => c.entered && index.has(c.key)).map((c) => c.key);
  if (carried.length === 0) {
    problems.push({
      row: 0,
      column: "monthly_salary",
      problem:
        "That file has none of the four columns this reads — monthly_salary, " +
        "overtime_hours, bonus or paye_tax. Nothing in it can be applied.",
    });
    return { rows: [], problems, ignored, carried };
  }

  const rows: ParsedRow[] = [];

  records.forEach((record, at) => {
    /* 1-based and header-excluded, so it is the number Excel puts in the
       margin — which is what somebody will be looking at while they fix it. */
    const number = at + 1;
    const cell = (key: string): string => {
      const column = index.get(key);
      return column === undefined ? "" : (record[column] ?? "");
    };

    const employeeNo = cell("staff_no").trim();
    /* A wholly blank line. Excel leaves them behind constantly and they are
       not a mistake anybody made. */
    if (employeeNo === "" && record.every((value) => value.trim() === "")) return;

    if (employeeNo === "") {
      problems.push({
        row: number,
        column: "staff_no",
        problem: "This row has no staff number, so there is nobody to apply it to.",
      });
      return;
    }

    const parsed: ParsedRow = { row: number, employeeNo };
    let broke = false;

    const money = (
      key: "monthly_salary" | "bonus" | "paye_tax" | "pension" | "nhf",
      field: keyof ParsedRow,
    ) => {
      if (!index.has(key)) return;
      const value = moneyKobo(cell(key));
      if (value === "bad") {
        problems.push({
          row: number,
          column: key,
          problem: `"${cell(key).trim()}" is not an amount.`,
        });
        broke = true;
        return;
      }
      Object.assign(parsed, { [field]: value });
    };

    money("monthly_salary", "monthlyKobo");
    money("bonus", "bonusKobo");
    money("paye_tax", "payeKobo");
    money("pension", "pensionKobo");
    money("nhf", "nhfKobo");

    if (index.has("overtime_hours")) {
      const value = hours(cell("overtime_hours"));
      if (value === "bad") {
        problems.push({
          row: number,
          column: "overtime_hours",
          problem: `"${cell("overtime_hours").trim()}" is not a number of hours.`,
        });
        broke = true;
      } else {
        parsed.overtimeHours = value;
      }
    }

    if (!broke) rows.push(parsed);
  });

  return { rows, problems, ignored, carried };
}

/**
 * What an upload would do, said before it is sent.
 *
 * Counted rather than listed: on three hundred rows a list is a second
 * spreadsheet, and the question somebody has at this moment is "is this the
 * right file", which a count of what changed answers and a list buries.
 */
export type SheetSummary = {
  changing: number;
  clearing: number;
  unchanged: number;
};

export function summarise(
  parsed: ParsedSheet,
  current: ReadonlyMap<string, SheetRowSource>,
): SheetSummary {
  let changing = 0;
  let clearing = 0;
  let unchanged = 0;

  for (const row of parsed.rows) {
    const before = current.get(row.employeeNo);
    let moves = false;
    let clears = false;

    if ("bonusKobo" in row) {
      const was = before?.bonusKobo ?? null;
      if (row.bonusKobo === null && was !== null) clears = true;
      else if (row.bonusKobo !== null && row.bonusKobo !== was) moves = true;
    }
    if ("overtimeHours" in row) {
      const was = before?.overtimeHours ?? null;
      if (row.overtimeHours === null && was !== null) clears = true;
      else if (row.overtimeHours !== null && row.overtimeHours !== was) moves = true;
    }
    if ("payeKobo" in row) {
      const was = before?.payslip.payeOverridden ? (before.payslip.payeKobo ?? null) : null;
      if (row.payeKobo === null && was !== null) clears = true;
      else if (row.payeKobo !== null && row.payeKobo !== was) moves = true;
    }
    if ("monthlyKobo" in row && row.monthlyKobo !== null) {
      const was = before?.employee?.grossMonthly;
      if (was == null || Math.round(was * 100) !== row.monthlyKobo) moves = true;
    }

    if (moves) changing += 1;
    else if (clears) clearing += 1;
    else unchanged += 1;
  }

  return { changing, clearing, unchanged };
}
