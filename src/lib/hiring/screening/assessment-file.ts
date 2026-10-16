import { parseCsv, toCsv, type CsvFile } from "@/lib/csv";
import type { AssessmentRowInput } from "./gateway";
import type { RowRefusal } from "./model";

/**
 * The assessment file: what it looks like, and how it is read.
 *
 * A boot camp runs its own test and sends back a spreadsheet: who, and how they
 * did. Two columns are enough, so that is all the template has. The file is read
 * in the browser and the rows are sent as rows, the way every other import in the
 * product works; the API decides who each row is and what to do with it.
 *
 * Headings can be called anything near enough. A column that cannot be found is a
 * sentence naming it, not a file full of refused rows.
 */

export const TEMPLATE_HEADERS = ["Email", "Score"];

export function assessmentTemplate(): { filename: string; body: string } {
  return {
    filename: "assessment-scores-template.csv",
    body: toCsv(TEMPLATE_HEADERS, [
      { Email: "ada.okafor@example.com", Score: "72" },
      { Email: "tunde.bello@example.com", Score: "58.5" },
    ]),
  };
}

const EMAIL_NAMES = [
  "email",
  "e-mail",
  "email address",
  "mail",
  "applicant email",
];
const SCORE_NAMES = [
  "score",
  "assessment score",
  "mark",
  "marks",
  "result",
  "total",
  "percentage",
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
  const score = column(file.headers, SCORE_NAMES);
  if (email === null) {
    return {
      ok: false,
      problem:
        'There is no column called "Email". Add one, or start from the template.',
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
  return {
    ok: true,
    rows: file.rows.map((row, index) => ({
      row: index + 1,
      email: (row[email] ?? "").trim(),
      score: (row[score] ?? "").trim(),
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
  duplicate_in_file: "This email is in the file more than once",
  blank_email: "The email is blank",
};

/** What a score cell can hold: a number, a decimal point, not a unit or a word. */
export function parseScoreCell(text: string): number | null {
  const cleaned = text.trim().replace(/%$/, "").trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(cleaned)) return null;
  return Number(cleaned);
}
