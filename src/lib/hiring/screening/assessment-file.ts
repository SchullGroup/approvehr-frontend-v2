import { parseCsv, toCsv, type CsvFile } from "@/lib/csv";
import type { AssessmentRowInput } from "./gateway";
import type { RowRefusal } from "./model";

/**
 * The assessment file: what it looks like, and how it is read.
 *
 * A boot camp runs its own test and sends back a spreadsheet: who, and how they
 * did. An email (or the reference the person was given) and a score are enough;
 * what the test was marked out of, its name and the day it was taken are there for
 * the files that have them. The file is read in the browser and the rows are sent
 * as rows, the way every other import in the product works; the API decides who each
 * row is and what to do with it.
 *
 * Headings can be called anything near enough. A column that cannot be found is a
 * sentence naming it, not a file full of refused rows.
 */

export const TEMPLATE_HEADERS = [
  "Applicant email",
  "Application reference",
  "Score",
  "Out of",
  "Test",
  "Date taken",
];

export function assessmentTemplate(): { filename: string; body: string } {
  return {
    filename: "assessment-scores-template.csv",
    body: toCsv(TEMPLATE_HEADERS, [
      {
        "Applicant email": "ada.okafor@example.com",
        "Application reference": "",
        Score: "42",
        "Out of": "60",
        Test: "Aptitude test",
        "Date taken": "2026-10-12",
      },
      {
        "Applicant email": "tunde.bello@example.com",
        "Application reference": "",
        Score: "58.5",
        "Out of": "",
        Test: "",
        "Date taken": "",
      },
    ]),
  };
}

const EMAIL_NAMES = [
  "email",
  "e-mail",
  "e mail",
  "e-mail address",
  "email address",
  "mail",
  "applicant email",
  "candidate email",
];
const REFERENCE_NAMES = [
  "application reference",
  "reference",
  "ref",
  "application ref",
  "applicant ref",
  "application id",
  "applicant id",
];
const SCORE_NAMES = [
  "score",
  "assessment score",
  "mark",
  "marks",
  "result",
  "points",
  "total",
  "percentage",
  "percent",
  "score obtained",
];
const MAX_NAMES = [
  "out of",
  "maximum",
  "max",
  "max score",
  "total marks",
  "full marks",
  "possible",
];
const TEST_NAMES = [
  "test",
  "test name",
  "assessment",
  "assessment name",
  "exam",
  "stage",
];
const DATE_NAMES = [
  "date taken",
  "taken on",
  "test date",
  "date",
  "completed",
  "completed on",
];

const norm = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9 -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function column(headers: string[], names: string[]): string | null {
  const wanted = new Set(names);
  return headers.find((heading) => wanted.has(norm(heading))) ?? null;
}

export type ReadFile =
  | { ok: true; rows: AssessmentRowInput[]; notes: string[] }
  | { ok: false; problem: string };

/** The rows of a parsed file, or the one thing wrong with it. */
export function rowsFromFile(file: CsvFile): ReadFile {
  const email = column(file.headers, EMAIL_NAMES);
  const reference = column(file.headers, REFERENCE_NAMES);
  const score = column(file.headers, SCORE_NAMES);
  const max = column(file.headers, MAX_NAMES);
  const test = column(file.headers, TEST_NAMES);
  const date = column(file.headers, DATE_NAMES);
  if (email === null && reference === null) {
    return {
      ok: false,
      problem:
        'There is no column called "Email" or "Reference". Add one, or start from the template.',
    };
  }
  if (score === null) {
    return {
      ok: false,
      problem:
        'There is no column called "Score". Add one, or start from the template.',
    };
  }
  if (file.rows.length === 0) {
    return { ok: false, problem: "The file has no rows to read." };
  }
  const cell = (row: Record<string, string>, name: string | null): string =>
    name === null ? "" : (row[name] ?? "").trim();
  return {
    ok: true,
    rows: file.rows.map((row, index) => ({
      row: index + 1,
      email: cell(row, email),
      reference: cell(row, reference),
      score: cell(row, score),
      max: cell(row, max),
      test: cell(row, test),
      date: cell(row, date),
    })),
    notes: file.notes,
  };
}

/** Read the text of a file the person chose. */
export function readAssessmentText(text: string): ReadFile {
  return rowsFromFile(parseCsv(text));
}

/** The refusals in words, for a list and for a count. */
export const REFUSAL_WORDS: Record<RowRefusal, string> = {
  unmatched_email: "No applicant has this email",
  ambiguous: "More than one applicant has this email",
  out_of_range: "The score is outside the range",
  not_a_number: "The score is not a number",
  duplicate_in_file: "This person is in the file more than once",
  blank_email: "There is no email or reference",
  refused: "This row cannot be used",
};

/**
 * What a score cell can hold: a number, a decimal point, optionally a percent sign,
 * and `42/60` for a mark and what it is out of.
 */
export function parseScoreCell(
  text: string,
): { score: number; max: number | null } | null {
  const slash = /^\s*([0-9.,]+)\s*\/\s*([0-9.,]+)\s*$/.exec(text);
  const rawScore = slash ? (slash[1] ?? "") : text;
  const rawMax = slash ? (slash[2] ?? null) : null;
  const score = numberOf(rawScore);
  if (score === null) return null;
  if (rawMax === null) return { score, max: null };
  const max = numberOf(rawMax);
  return max === null ? null : { score, max };
}

/** A plain number from a cell: commas and a percent sign are allowed, a word is not. */
export function numberOf(text: string): number | null {
  const cleaned = text.replace(/%/g, "").replace(/,/g, "").trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}
