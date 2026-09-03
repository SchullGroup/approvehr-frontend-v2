import { parseCsv, toCsv, type CsvRow } from "@/lib/csv";
import { readXlsx, writeXlsx, type SheetSpec } from "@/lib/xlsx";
import type { Employee } from "@/lib/types";
import type { LineSummary, Payslip } from "@/lib/api/payroll";

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
 * with the staff number, name, email, phone and department already in it —
 * the details somebody needs in order to *check* they are looking at the right
 * person — plus whether an account is on file, plus the figures the run
 * currently holds.
 *
 * That has a consequence the whole feature turns on: because the file arrives
 * carrying today's figures, **emptying a cell is a statement**. See
 * `SHEET_BLANK_RULE`.
 */

/* ------------------------------------------------------------------ columns */

/**
 * Written into a `bonus` / `deduction` cell (and its reason) when a person
 * has more than one line of that kind — see `LineSummary` in `api/payroll.ts`
 * for why the sheet cannot collapse two lines into one figure without either
 * dropping a reason or inventing one.
 *
 * Shared, one constant, between the write side (`sheetRow`) and the read side
 * (`parseSheet`): a cell that still holds exactly this text was never edited,
 * so that row's bonus or deduction is left alone rather than read as "clear
 * this". Anything else typed over it — a number, or genuinely emptying the
 * cell — is treated as a real decision and applied normally.
 */
export const AMBIGUOUS_LINES_MARKER = "(several, edit in app)";

/**
 * A column on the sheet.
 *
 * `entered` is the distinction that matters: the first seven columns are there
 * so a person can see who a row is about, and the rest are the ones the
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
    note: "Who the row is about. Do not change it: it is how the upload finds them.",
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
  /* One column saying whether an account is on file, not two carrying the
     account itself.

     `bank` and `account_number` used to be here and downloaded EMPTY on every
     row: the sheet is built from the directory, and `serializeDirectory` on
     the API redacts both to null by deliberate design — it closed an
     account-number leak, and undoing that to fill a spreadsheet would reopen
     it. Fetching each employee's detail record per row would too.

     So the sheet answers the question the directory can actually answer, and
     it is the more useful one while working a payroll: a missing account is a
     BLOCKER on the run, and this is the column that finds those people. */
  {
    key: "bank_account",
    heading: "bank_account",
    note: "Whether an account is on file. Not read back.",
    entered: false,
  },
  {
    key: "monthly_salary",
    heading: "monthly_salary",
    note:
      "Naira. Changes their record from now on, not just this payroll. " +
      "Leaving it blank changes nothing: there is no such thing as no salary.",
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
    note:
      `Naira, this month only. Empty this cell to take a bonus off. If this ` +
      `shows "${AMBIGUOUS_LINES_MARKER}", this person has more than one bonus: ` +
      "leave the cell as it is and edit them individually in the app.",
    entered: true,
  },
  {
    key: "bonus_reason",
    heading: "bonus_reason",
    note: "What the bonus is for. Optional: the bonus still saves without one.",
    entered: true,
  },
  {
    key: "deduction",
    heading: "deduction",
    note:
      "Naira, this month only. A staff purchase, a damaged tool, a salary " +
      "advance settled outside the loans module — not a statutory deduction, " +
      `which has its own columns below. Empty this cell to take it off. If ` +
      `this shows "${AMBIGUOUS_LINES_MARKER}", this person has more than one ` +
      "such deduction. Leave the cell as it is and edit them in the app.",
    entered: true,
  },
  {
    key: "deduction_reason",
    heading: "deduction_reason",
    note: "What the deduction is for. Optional, and worth filling in: an unexplained deduction is the line an employee asks about first.",
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
      "this person: 0 deducts nothing from them. That is not the same as your " +
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
  "salary is the exception: an empty cell there changes nothing.";

export const SHEET_LEGEND: readonly string[] = [
  SHEET_BLANK_RULE,
  "Only the columns marked \"Yes\" below are read back. Everything before " +
    "them is here so you can see who a row is about.",
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
  /** From `payrollApi.lineSummary`, not the payslip — see `LineSummary`'s
   *  own note for why the payslip's rendered lines cannot answer this. */
  bonus: LineSummary;
  deduction: LineSummary;
};

/** A `LineSummary` reduced to what one sheet cell (and its reason cell) show. */
function lineCells(summary: LineSummary): { amount: string; reason: string } {
  if (summary.state === "one") {
    return { amount: naira(summary.amountKobo), reason: summary.reason ?? "" };
  }
  if (summary.state === "many") {
    return { amount: AMBIGUOUS_LINES_MARKER, reason: AMBIGUOUS_LINES_MARKER };
  }
  return { amount: "", reason: "" };
}

export function sheetRow(source: SheetRowSource): CsvRow {
  const { payslip, employee } = source;
  const bonus = lineCells(source.bonus);
  const deduction = lineCells(source.deduction);
  return {
    staff_no: payslip.employeeNo,
    name: payslip.name,
    email: employee?.email ?? "",
    phone: employee?.phone ?? "",
    department: employee?.department ?? "",
    /* `hasBankAccount` where the API sent it, the raw field's own presence
       otherwise — the same fallback `payrollFieldsForDisplay` documents, and
       the reason it is correct in both connected and demo mode. */
    bank_account:
      (employee?.hasBankAccount ?? employee?.bankAccount != null) ? "Yes" : "No",
    /* Null is nobody having recorded a salary, which the run already raises
       as a blocker. An empty cell here is the honest rendering of that, and
       it is also the cell somebody is about to fill in. */
    monthly_salary:
      employee?.grossMonthly == null ? "" : employee.grossMonthly.toFixed(2),
    overtime_hours: source.overtimeHours === null ? "" : String(source.overtimeHours),
    bonus: bonus.amount,
    bonus_reason: bonus.reason,
    deduction: deduction.amount,
    deduction_reason: deduction.reason,
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
  /** A named deduction added by hand. Absent — not present with `null` —
   *  when the cell held `AMBIGUOUS_LINES_MARKER`: that means this person
   *  has more than one such line already, and an untouched marker is not a
   *  decision to clear them. */
  deductionKobo?: number | null;
  bonusReason?: string;
  deductionReason?: string;
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
        "That file has none of the columns this reads: monthly_salary, " +
        "overtime_hours, bonus, deduction, paye_tax, pension or nhf. Nothing " +
        "in it can be applied.",
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
      key: "monthly_salary" | "paye_tax" | "pension" | "nhf",
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

    /**
     * `bonus` and `deduction`, which can also hold `AMBIGUOUS_LINES_MARKER`.
     *
     * A cell still holding exactly that text was never edited, so this row's
     * key is left off `parsed` entirely — the same as a column the file did
     * not carry — rather than set to `null`, which would read as "clear it"
     * and delete lines nobody asked to touch. Anything else that is not a
     * number is a real mistake and refuses normally.
     */
    const moneyOrMarker = (key: "bonus" | "deduction", field: keyof ParsedRow) => {
      if (!index.has(key)) return;
      const raw = cell(key).trim();
      if (raw === AMBIGUOUS_LINES_MARKER) return;
      const value = moneyKobo(raw);
      if (value === "bad") {
        problems.push({ row: number, column: key, problem: `"${raw}" is not an amount.` });
        broke = true;
        return;
      }
      Object.assign(parsed, { [field]: value });
    };

    /** `bonus_reason` / `deduction_reason` — plain text, carried through only
     *  when it is a real reason somebody typed. */
    const reasonText = (key: "bonus_reason" | "deduction_reason", field: keyof ParsedRow) => {
      if (!index.has(key)) return;
      const raw = cell(key).trim();
      if (raw === "" || raw === AMBIGUOUS_LINES_MARKER) return;
      Object.assign(parsed, { [field]: raw });
    };

    money("monthly_salary", "monthlyKobo");
    moneyOrMarker("bonus", "bonusKobo");
    reasonText("bonus_reason", "bonusReason");
    moneyOrMarker("deduction", "deductionKobo");
    reasonText("deduction_reason", "deductionReason");
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
      const was = before?.bonus.state === "one" ? before.bonus.amountKobo : null;
      if (row.bonusKobo === null && was !== null) clears = true;
      else if (row.bonusKobo !== null && row.bonusKobo !== was) moves = true;
    }
    if ("deductionKobo" in row) {
      const was = before?.deduction.state === "one" ? before.deduction.amountKobo : null;
      if (row.deductionKobo === null && was !== null) clears = true;
      else if (row.deductionKobo !== null && row.deductionKobo !== was) moves = true;
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
    /* Pension and NHF are read exactly the way `payeKobo` is above: the
       "before" figure counts only where the payslip records that deduction as
       hand-set, because a computed figure is not something a blank cell is
       clearing. Without these two branches an emptied pension cell fell
       through to `unchanged`, so the panel offered "Apply to 1 person, 9
       unchanged" over a sheet that would silently drop somebody's override. */
    if ("pensionKobo" in row) {
      const was = before?.payslip.overriddenDeductions?.includes("PENSION_EMPLOYEE")
        ? (before.payslip.pensionEmployeeKobo ?? null)
        : null;
      if (row.pensionKobo === null && was !== null) clears = true;
      else if (row.pensionKobo != null && row.pensionKobo !== was) moves = true;
    }
    if ("nhfKobo" in row) {
      const was = before?.payslip.overriddenDeductions?.includes("NHF")
        ? (before.payslip.nhfKobo ?? null)
        : null;
      if (row.nhfKobo === null && was !== null) clears = true;
      else if (row.nhfKobo != null && row.nhfKobo !== was) moves = true;
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
