"use client";

import { ApiError } from "@/lib/api/client";
import {
  bulkCreate,
  createEmployee,
  didNotJoin,
  FIXED_COLUMNS,
  exportCsv,
  facetsOf,
  hiresMatching,
  linkEmployee,
  queryHired,
  setOnOfferAccepted,
  settingsOf,
  type Op,
} from "./demo-ops";
import { demoHired, hiredRun } from "./demo-store";
import { EmployeeExistsError } from "./errors";
import type { HiredGateway } from "./gateway";
import type { HiredTarget } from "./model";

/**
 * The gateway for a demo: the book in this browser, answering in the API's words.
 *
 * Refusals are thrown as `ApiError` so a screen has one catch block whichever side
 * it is talking to. The status is 422, which is what the API answers for a rule it
 * will not break.
 */

const refuse = (message: string): ApiError =>
  new ApiError(422, "unprocessable", message);

function unwrap<T>(result: Op<T>): T {
  if (!result.ok) {
    /* An employee with the same email comes back with who it is. */
    if (result.existing)
      throw new EmployeeExistsError(result.error, result.existing);
    throw refuse(result.error);
  }
  return result.value;
}

/** The most people one demo file holds. */
const MAX_ROWS = 20_000;

/** Ten at a time, so a progress bar has something to show on a short list. */
const CHUNK = 10;

/** Who a target names, checked against the count somebody confirmed. */
function idsOf(target: HiredTarget): string[] {
  const book = demoHired.current();
  if (target.kind === "ids") return target.ids;
  const found = hiresMatching(book, target.filters).map((hire) => hire.id);
  if (found.length !== target.expected) {
    throw new ApiError(
      409,
      "conflict",
      `The list changed while you were choosing: it was ${target.expected.toLocaleString("en-NG")} people and is now ${found.length.toLocaleString("en-NG")}. Nothing was done. Check the filters and select again.`,
    );
  }
  return found;
}

const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const demoHiredGateway: HiredGateway = {
  mode: "demo",

  facets: async () => facetsOf(demoHired.current()),

  list: async (query) => queryHired(demoHired.current(), query),

  createEmployee: async (person) => {
    const done = unwrap(hiredRun((book) => createEmployee(book, person.id)));
    return { employeeId: done.employeeId, name: done.name };
  },

  linkEmployee: async (person, employeeId) => {
    unwrap(hiredRun((book) => linkEmployee(book, person.id, employeeId)));
  },

  didNotJoin: async (person, reason) =>
    unwrap(hiredRun((book) => didNotJoin(book, person.id, reason))),

  bulkCreateEmployees: async ({ target, onProgress, signal }) => {
    const ids = idsOf(target);
    onProgress({ done: 0, total: ids.length });
    let outcome = {
      requested: 0,
      done: 0,
      skipped: 0,
      refused: [] as { id: string; name: string; reason: string }[],
      emailed: null as number | null,
    };
    for (let at = 0; at < ids.length; at += CHUNK) {
      if (signal.aborted) break;
      const part = ids.slice(at, at + CHUNK);
      const result = bulkCreate(demoHired.current(), part);
      demoHired.commit(result.book);
      outcome = {
        requested: outcome.requested + result.outcome.requested,
        done: outcome.done + result.outcome.done,
        skipped: outcome.skipped + result.outcome.skipped,
        refused: [...outcome.refused, ...result.outcome.refused],
        emailed: null,
      };
      onProgress({ done: Math.min(ids.length, at + CHUNK), total: ids.length });
      if (ids.length > CHUNK) await pause(120);
    }
    return outcome;
  },

  exportOptions: async () => ({
    fixed: [...FIXED_COLUMNS],
    extras: [
      {
        key: "answers",
        label: "What they answered on the application form",
        help: "One column per question. Only for people who came through the careers page.",
      },
      {
        key: "screening",
        label: "Screening score",
        help: "The fit score their application got. Advice for a person, not a verdict.",
      },
      {
        key: "salary",
        label: "Pay on the offer",
        help: "The gross monthly pay. Only for people who may see offers.",
      },
    ],
    maxRows: MAX_ROWS,
    capMessage: null,
  }),

  exportFile: async ({ target, extras }) => {
    const book = demoHired.current();
    const ids = idsOf(target);
    if (ids.length > MAX_ROWS) {
      throw refuse(
        `A file holds at most ${MAX_ROWS.toLocaleString("en-NG")} people. Narrow the filters and export in parts.`,
      );
    }
    const wanted = new Set(ids);
    const hires = book.hires.filter((hire) => wanted.has(hire.id));
    return {
      filename: "hired.csv",
      body: exportCsv(book, hires, extras),
    };
  },

  settings: {
    get: async () => settingsOf(demoHired.current()),
    set: async (value) => {
      unwrap(hiredRun((book) => setOnOfferAccepted(book, value)));
      return settingsOf(demoHired.current());
    },
  },
};
