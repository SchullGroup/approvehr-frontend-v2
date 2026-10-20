import { ApiError } from "@/lib/api/client";
import type { ApiApplication } from "@/lib/api/careers";
import { sentenceOf } from "./errors";
import type { BulkOutcome, BulkProgress } from "./model";

/**
 * Doing one thing to many people in the application queue.
 *
 * ## Why the queue is not the board
 *
 * The board's actions are one request each for the whole selection, with the
 * server counting, queueing and answering for every person. The queue's applicants
 * are not in the pipeline yet — they are public applications — and the server has
 * no bulk action for them. So this does what a person would: one by one, a few at
 * a time, each with its own answer, and collects who it could not do.
 *
 * ## Why it is small
 *
 * Every person is a request, and the API allows a session a few hundred requests
 * every fifteen minutes. A hundred at a time is far under that and still the whole
 * of a busy afternoon's queue. Past it the screen says so and asks for the filters
 * to be narrowed, rather than starting something it cannot finish.
 *
 * No React, no state.
 */

/** The most people one queue action takes. */
export const QUEUE_BULK_MAX = 100;

/** How many are asked of the server at once. */
const AT_ONCE = 3;

export async function runQueue({
  rows,
  act,
  onProgress,
}: {
  rows: readonly ApiApplication[];
  /** Does it for one person, or throws the reason it could not. */
  act: (row: ApiApplication) => Promise<void>;
  onProgress: (progress: BulkProgress) => void;
}): Promise<BulkOutcome> {
  const outcome: BulkOutcome = {
    requested: rows.length,
    done: 0,
    skipped: 0,
    refused: [],
    emailed: null,
  };
  let settled = 0;
  let next = 0;
  onProgress({ done: 0, total: rows.length });

  async function worker() {
    while (next < rows.length) {
      const row = rows[next];
      next += 1;
      if (!row) continue;
      try {
        await act(row);
        outcome.done += 1;
      } catch (error) {
        outcome.refused.push({
          id: row.id,
          name: row.name,
          reason: sentenceOf(error),
        });
      }
      settled += 1;
      onProgress({ done: settled, total: rows.length });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(AT_ONCE, rows.length) }, worker),
  );
  return outcome;
}

/**
 * "Everyone matching", checked against the number somebody confirmed.
 *
 * If, by the time the list is fetched, it has become a different size, acting on
 * it would be acting on people nobody looked at, so it stops with a sentence.
 */
export function confirmedRows(
  found: readonly ApiApplication[],
  expected: number,
): ApiApplication[] {
  if (found.length !== expected) {
    throw new ApiError(
      409,
      "conflict",
      `The list changed while you were choosing: it was ${expected.toLocaleString("en-NG")} people and is now ${found.length.toLocaleString("en-NG")}. Nothing was done. Check the filters and select again.`,
    );
  }
  return [...found];
}

/** A spreadsheet of queue applicants, written here from the rows themselves. */
export function queueCsvRows(rows: readonly ApiApplication[]): {
  headers: string[];
  rows: Record<string, string>[];
} {
  /* A name that starts like a formula is written as text. */
  const safe = (text: string) =>
    /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  const headers = [
    "Reference",
    "Applied",
    "Name",
    "Email",
    "Phone",
    "Advert",
    "Status",
    "Source",
  ];
  return {
    headers,
    rows: rows.map((row) => ({
      Reference: row.reference ?? "",
      Applied: row.appliedAt.slice(0, 10),
      Name: safe(row.name),
      Email: safe(row.email),
      Phone: safe(row.phone ?? ""),
      Advert: safe(row.postingTitle),
      Status: row.status,
      Source: safe(row.source ?? ""),
    })),
  };
}
