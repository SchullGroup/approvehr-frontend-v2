"use client";

import { ApiError } from "@/lib/api/client";
import { toCsv } from "@/lib/csv";
import { REQUISITIONS } from "@/lib/mock/hiring";
import { TODAY } from "@/lib/today";
import {
  applyBulk,
  boardOf,
  cardOf,
  createReason,
  createTag,
  deleteTag,
  deleteTemplate,
  duplicateTemplate,
  idsMatching,
  leaveTalentPool,
  makeDefaultTemplate,
  moveApp,
  queryCards,
  rejectApp,
  renameTag,
  saveTemplate,
  setTagged,
  setTalentPool,
  talentList,
  updateReason,
  usage,
  type Op,
} from "./demo-ops";
import { demoComms } from "./demo-comms";
import { demoPipeline, demoRun } from "./demo-store";
import { channelLabel } from "./filters";
import { NO_OUTCOME } from "./bulk";
import type { PipelineGateway } from "./gateway";
import type { BulkOutcome, BulkTarget } from "./model";

/**
 * The gateway for a demo: the book in this browser, answering in the API's words.
 *
 * Refusals are thrown as `ApiError` so a screen has one catch block whichever
 * side it is talking to. The status is 422, which is what the API answers for a
 * rule it will not break.
 */

const refuse = (message: string): ApiError =>
  new ApiError(422, "unprocessable", message);

/** The value of a write, or the refusal thrown. */
function unwrap<T>(result: Op<T>): T {
  if (!result.ok) throw refuse(result.error);
  return result.value;
}

/** A cell that a spreadsheet will not run as a formula. */
const safe = (text: string): string =>
  /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;

/** A hundred a time, like the API's worker, so the bar has something to show. */
const CHUNK = 100;

/**
 * Who a target is for. "Everyone matching" is checked against the count the
 * person confirmed, and a difference stops the action rather than widening it.
 */
function resolve(target: BulkTarget): string[] {
  if (target.kind === "ids") return target.ids;
  const found = idsMatching(
    demoPipeline.current(),
    target.requisitionId,
    target.column,
    target.filters,
  );
  if (found.length !== target.expected) {
    throw new ApiError(
      409,
      "conflict",
      `The list changed while you were choosing: it was ${target.expected.toLocaleString("en-NG")} people and is now ${found.length.toLocaleString("en-NG")}. Nothing was done. Check the filters and select again.`,
    );
  }
  return found;
}

export const demoGateway: PipelineGateway = {
  mode: "demo",
  ...demoComms,

  board: async ({ requisitionId, filters, limit }) =>
    boardOf(demoPipeline.current(), requisitionId, filters, limit),

  listCards: async (query) => queryCards(demoPipeline.current(), query),

  move: async (card, stageId, input) =>
    unwrap(demoRun((book) => moveApp(book, card.id, stageId, input.sendEmail))),

  /* A demo has no mail transport, so what comes back for an email that was asked
     for is "not sent", with the reason, and never anything that says it went. */
  reject: async (card, input) =>
    unwrap(
      demoRun((book) =>
        rejectApp(book, card.id, input.reasonId, input.note, input.sendEmail),
      ),
    ),

  setTag: async (card, tagId, on) => {
    unwrap(demoRun((book) => setTagged(book, card.id, tagId, on)));
  },

  setTalentPool: async (card, on) => {
    unwrap(demoRun((book) => setTalentPool(book, card.id, on)));
  },

  bulk: async ({ target, action, onProgress }) => {
    const ids = resolve(target);
    let outcome: BulkOutcome = { ...NO_OUTCOME, requested: ids.length };
    onProgress({ done: 0, total: ids.length });
    for (let at = 0; at < ids.length; at += CHUNK) {
      const chunk = ids.slice(at, at + CHUNK);
      const result = applyBulk(demoPipeline.current(), chunk, action);
      demoPipeline.commit(result.book);
      outcome = {
        requested: ids.length,
        done: outcome.done + result.outcome.done,
        skipped: outcome.skipped + result.outcome.skipped,
        refused: [...outcome.refused, ...result.outcome.refused],
        emailed:
          result.outcome.emailed === null
            ? null
            : (outcome.emailed ?? 0) + result.outcome.emailed,
        emailNote: result.outcome.emailNote ?? outcome.emailNote ?? null,
      };
      onProgress({ done: at + chunk.length, total: ids.length });
      /* Let the screen paint the bar between chunks. */
      await Promise.resolve();
    }
    return outcome;
  },

  exportCards: async (target) => {
    const book = demoPipeline.current();
    const wanted = new Set(resolve(target));
    const headers = [
      "Reference",
      "Name",
      "Email",
      "Stage",
      "Outcome",
      "Source",
      "Tags",
      "Talent pool",
    ];
    const rows = book.apps
      .filter((app) => wanted.has(app.id))
      .map((app) => {
        const card = cardOf(book, app);
        return {
          Reference: card.reference ?? "",
          Name: safe(card.name),
          Email: safe(card.email ?? ""),
          Stage: card.stageName ?? "",
          Outcome: card.outcome,
          Source: card.source ? channelLabel(card.source) : "",
          Tags: card.tags.map((tag) => tag.name).join("; "),
          "Talent pool": card.talentPool ? "Yes" : "No",
        };
      });
    return { filename: `candidates-${TODAY}.csv`, body: toCsv(headers, rows) };
  },

  talentPool: {
    list: async (query) =>
      talentList(demoPipeline.current(), query, (requisitionId) => {
        const role = REQUISITIONS.find((r) => r.id === requisitionId);
        return role ? role.title : "A role";
      }),
    remove: async (candidateId) => {
      unwrap(demoRun((book) => leaveTalentPool(book, candidateId)));
    },
  },

  tags: {
    list: async () => {
      const book = demoPipeline.current();
      const counts = usage(book).tags;
      return book.tags.map((tag) => ({ ...tag, uses: counts[tag.id] ?? 0 }));
    },
    create: async (name) => unwrap(demoRun((book) => createTag(book, name))),
    rename: async (id, name) => {
      unwrap(demoRun((book) => renameTag(book, id, name)));
    },
    remove: async (id) => {
      unwrap(demoRun((book) => deleteTag(book, id)));
    },
  },

  reasons: {
    list: async () => {
      const book = demoPipeline.current();
      const counts = usage(book).reasons;
      return book.reasons.map((reason) => ({
        ...reason,
        uses: counts[reason.id] ?? 0,
      }));
    },
    create: async (label) =>
      unwrap(demoRun((book) => createReason(book, label))),
    update: async (id, change) => {
      unwrap(demoRun((book) => updateReason(book, id, change)));
    },
  },

  templates: {
    list: async () => demoPipeline.current().templates,
    save: async (draft) => unwrap(demoRun((book) => saveTemplate(book, draft))),
    duplicate: async (id) =>
      unwrap(demoRun((book) => duplicateTemplate(book, id))),
    remove: async (id) => {
      unwrap(demoRun((book) => deleteTemplate(book, id)));
    },
    makeDefault: async (id) => {
      unwrap(demoRun((book) => makeDefaultTemplate(book, id)));
    },
  },
};
