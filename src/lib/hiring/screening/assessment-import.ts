import { ApiError } from "@/lib/api/client";
import { imports, type ImportRow } from "@/lib/api/imports";
import type { AssessmentRowInput } from "./gateway";
import type {
  AssessmentCheck,
  AssessmentFileOptions,
  AssessmentResult,
  AssessmentRow,
} from "./model";
import { checkRowFromReport, importRowsFromFile, tallyCheck } from "./wire";

/**
 * A file of assessment results, checked and then saved through the API's import.
 *
 * ## Why parts
 *
 * The API reads at most 500 rows and 100 KB at a time, and a boot camp's file can
 * be thousands of rows, so the file goes as parts. Each part is checked and kept as
 * a batch of its own; saving applies **those same batches** with the same rows, which
 * the API insists on (it fingerprints what it checked and refuses anything else).
 * The check is therefore a promise: what it said would be saved is what is saved.
 *
 * ## What the check remembers
 *
 * A token naming each part's batch, where it starts and ends in the file, and the
 * test's name. Saving refuses a different file or a different name, in words, rather
 * than letting the API say its fingerprint does not match.
 *
 * No React, no state.
 */

const ENTITY = "assessment-scores";

/** How much JSON one part may carry: under the API's 100 KB with room for the rest. */
const BODY_BUDGET_BYTES = 70_000;
/** The API's cap on rows in one batch. */
const MAX_PART_ROWS = 500;
const MIN_PART_ROWS = 5;

const encoder = new TextEncoder();

/** Row spans that each fit the body budget, measured on a sample of the rows. */
export function planSpans(
  rows: readonly ImportRow[],
): { start: number; end: number }[] {
  if (rows.length === 0) return [];
  const sample = rows.slice(0, 200);
  const bytes = sample.reduce(
    (total, row) => total + encoder.encode(JSON.stringify(row)).length + 1,
    0,
  );
  const average = Math.max(1, Math.ceil(bytes / sample.length));
  const per = Math.min(
    MAX_PART_ROWS,
    Math.max(MIN_PART_ROWS, Math.floor(BODY_BUDGET_BYTES / average)),
  );
  const spans: { start: number; end: number }[] = [];
  for (let start = 0; start < rows.length; start += per) {
    spans.push({ start, end: Math.min(rows.length, start + per) });
  }
  return spans;
}

type Token = {
  parts: { batchId: string; start: number; end: number }[];
  test: string;
  rows: number;
};

const contextOf = (
  postingId: string,
  options: AssessmentFileOptions,
): Record<string, string> => ({
  postingId,
  ...(options.test.trim() ? { test: options.test.trim() } : {}),
});

export async function checkFile(
  postingId: string,
  filename: string,
  rows: readonly AssessmentRowInput[],
  options: AssessmentFileOptions,
  signal: AbortSignal,
): Promise<AssessmentCheck> {
  const sent = importRowsFromFile(rows);
  const spans = planSpans(sent);
  const token: Token = {
    parts: [],
    test: options.test.trim(),
    rows: rows.length,
  };
  const checked: AssessmentRow[] = [];

  for (const span of spans) {
    const answer = await imports.validate(
      ENTITY,
      {
        filename,
        rows: sent.slice(span.start, span.end),
        context: contextOf(postingId, options),
      },
      signal,
    );
    token.parts.push({ batchId: answer.batchId, ...span });
    for (const report of answer.rows) {
      const input = rows[span.start + report.row - 1];
      if (!input) continue;
      checked.push(checkRowFromReport(report, input, input.row));
    }
  }

  return {
    filename,
    token: JSON.stringify(token),
    rows: checked,
    ...tallyCheck(checked),
  };
}

export async function commitFile(
  postingId: string,
  check: AssessmentCheck,
  rows: readonly AssessmentRowInput[],
  options: AssessmentFileOptions,
): Promise<AssessmentResult> {
  let token: Token;
  try {
    token = JSON.parse(check.token) as Token;
  } catch {
    token = { parts: [], test: "", rows: -1 };
  }
  if (token.rows !== rows.length || token.test !== options.test.trim()) {
    throw new ApiError(
      409,
      "conflict",
      "The file is not the one that was checked. Check it again.",
    );
  }
  const sent = importRowsFromFile(rows);
  let saved = 0;
  let done = 0;
  for (const part of token.parts) {
    try {
      const answer = await imports.apply(ENTITY, part.batchId, {
        confirm: true,
        rows: sent.slice(part.start, part.end),
        context: contextOf(postingId, options),
      });
      saved += answer.created + answer.updated;
      done += part.end - part.start;
    } catch (error) {
      /* Parts that were saved stay saved: say how far it got. */
      if (done > 0 && error instanceof ApiError) {
        throw new ApiError(
          error.status,
          error.code,
          `${String(done)} of ${String(rows.length)} rows were saved before this stopped. ${error.message}`,
        );
      }
      throw error;
    }
  }
  return {
    saved,
    unchanged: check.unchanged,
    refused: check.refused,
    /* The API does not say how many the new results put below the line. */
    movedBelow: null,
  };
}
