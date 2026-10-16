"use client";

import { ApiError } from "@/lib/api/client";
import type { ApiQueuedEmail } from "@/lib/api/candidate-email";
import { kindInfo } from "@/lib/hiring/comms/fields";
import type { EmailNotice } from "@/lib/hiring/comms/model";
import { cardScreeningFromApi } from "@/lib/hiring/screening/wire";
import { apiComms } from "./api-comms";
import {
  pipelineApi,
  type ApiBoardCard,
  type ApiBoardColumn,
  type ApiBulkJob,
  type ApiBulkRow,
  type ApiReason,
  type ApiSelectionFilter,
  type ApiTag,
  type ApiTemplate,
  type BoardParams,
  type BulkBody,
} from "@/lib/api/pipeline";
import type { PipelineGateway } from "./gateway";
import type {
  BoardCard,
  BoardColumnData,
  BoardFilters,
  BulkOutcome,
  BulkRefusal,
  BulkTarget,
  PipelineTemplate,
  RejectionReason,
  Tag,
  TalentEntry,
} from "./model";

/**
 * The gateway for a connected company: the API, in its own words.
 *
 * It turns the wire into the shapes the screens draw and nothing else. A refusal
 * is left as the `ApiError` the client threw, so the sentence the screen shows is
 * the one the API wrote.
 */

/* ------------------------------------------------------------------- mapping */

const tagFrom = (tag: {
  id: string;
  name: string;
  color: string | null;
}): Tag => ({
  id: tag.id,
  name: tag.name,
  color: tag.color,
});

/** "Label: note", the way the API writes the one line every old screen reads. */
const rejectionLine = (card: ApiBoardCard): string | null => {
  if (!card.rejection) return null;
  const { reasonLabel, note, reason } = card.rejection;
  const parts = [reasonLabel, note].filter(
    (part): part is string => part !== null && part !== "",
  );
  return parts.length > 0 ? parts.join(": ") : reason;
};

export function cardFrom(
  card: ApiBoardCard,
  column: ApiBoardColumn,
): BoardCard {
  return {
    id: card.id,
    candidateId: card.candidateId,
    name: card.name,
    email: card.email,
    reference: card.reference,
    source: card.source,
    flagged: card.flagged,
    duplicate: card.duplicate,
    tags: card.tags.map(tagFrom),
    talentPool: card.talentPool,
    stageId: column.stageId,
    stageName: column.name,
    stageEnteredAt: card.stageEnteredAt,
    outcome: card.outcome,
    rejectionReason: rejectionLine(card),
    score: card.score ?? null,
    scheduledDeletionOn: card.scheduledDeletionOn ?? null,
    screening: cardScreeningFromApi(card),
  };
}

/** What the API says about the one email an action owed, or `null` when none was. */
export const noticeFrom = (queued: ApiQueuedEmail | undefined): EmailNotice =>
  queued
    ? {
        status: queued.status,
        note: queued.note,
        kindLabel: kindInfo(queued.kind).label,
      }
    : null;

const endsOf = (column: ApiBoardColumn): BoardColumnData["ends"] =>
  column.type === "HIRED" || column.key === "outcome:HIRED"
    ? "HIRED"
    : column.type === "REJECTED" || column.key === "outcome:REJECTED"
      ? "REJECTED"
      : null;

export function columnFrom(column: ApiBoardColumn): BoardColumnData {
  return {
    key: column.key,
    label: column.name,
    stageId: column.stageId,
    type: column.type,
    ends: endsOf(column),
    order: column.order,
    total: column.count,
    cards: column.cards.map((card) => cardFrom(card, column)),
    next: column.hasMore ? column.nextCursor : null,
  };
}

const boardParams = (filters: BoardFilters): BoardParams => ({
  ...(filters.q ? { q: filters.q } : {}),
  ...(filters.tagId ? { tagId: filters.tagId } : {}),
  ...(filters.source ? { source: filters.source } : {}),
  ...(filters.flagged ? { flagged: true } : {}),
  ...(filters.knockoutMin !== undefined
    ? { knockoutMin: filters.knockoutMin }
    : {}),
  ...(filters.belowCutoff ? { belowCutoff: true } : {}),
  ...(filters.scoreMin !== undefined ? { scoreMin: filters.scoreMin } : {}),
  ...(filters.scoreMax !== undefined ? { scoreMax: filters.scoreMax } : {}),
  ...(filters.duplicate ? { duplicate: true } : {}),
  ...(filters.talentPool ? { talentPool: true } : {}),
  ...(filters.from ? { from: filters.from } : {}),
  ...(filters.to ? { to: filters.to } : {}),
});

const templateFrom = (template: ApiTemplate): PipelineTemplate => ({
  id: template.id,
  name: template.name,
  isDefault: template.isDefault,
  usedBy: template.requisitionCount,
  stages: [...template.stages]
    .sort((a, b) => a.order - b.order)
    .map((stage) => ({
      id: stage.id,
      name: stage.name,
      type: stage.type,
      requiresScorecards: stage.requiresScorecards,
      emailTemplateId: stage.emailTemplateId ?? null,
    })),
});

const reasonFrom = (reason: ApiReason): RejectionReason => ({
  id: reason.id,
  label: reason.label,
  active: !reason.archived,
});

const tagRowFrom = (tag: ApiTag): Tag => ({
  id: tag.id,
  name: tag.name,
  color: tag.color,
  uses: tag.candidateCount,
});

/* ----------------------------------------------------------------------- bulk */

/** The most application ids one request takes. */
export const IDS_PER_REQUEST = 2_000;

/** How often a queued job is asked how far it has got. */
export const POLL_MS = 800;

const pause = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

const kindOf = (action: Parameters<PipelineGateway["bulk"]>[0]["action"]) => {
  switch (action.type) {
    case "move":
      return {
        action: "MOVE",
        stageId: action.stageId,
        /* Absent is false on the API as well; it is only ever sent when ticked. */
        ...(action.sendEmail ? { sendEmails: true } : {}),
      } as const;
    case "reject":
      return {
        action: "REJECT",
        reasonId: action.reasonId,
        ...(action.note ? { note: action.note } : {}),
        ...(action.sendEmail ? { sendEmails: true } : {}),
      } as const;
    case "tag":
      return { action: "TAG", tagId: action.tagId } as const;
    case "untag":
      return { action: "UNTAG", tagId: action.tagId } as const;
    case "talent-pool":
      return {
        action: action.on ? "TALENT_POOL_ADD" : "TALENT_POOL_REMOVE",
      } as const;
  }
};

const filterBody = (
  filters: BoardFilters,
  column: string,
): ApiSelectionFilter => ({
  ...boardParams(filters),
  column,
  // `limit` is a board word, never a selection's.
});

const refusalFrom = (row: ApiBulkRow): BulkRefusal => ({
  id: row.subjectId,
  name: row.name,
  reason: row.message ?? "That could not be done.",
});

const tally = (rows: readonly ApiBulkRow[]) => ({
  done: rows.filter((row) => row.status === "APPLIED").length,
  skipped: rows.filter((row) => row.status === "SKIPPED").length,
  refused: rows.filter((row) => row.status === "REFUSED").map(refusalFrom),
});

/** Waits for a queued job to finish, reporting as it goes. */
async function finish(
  job: ApiBulkJob,
  signal: AbortSignal,
  report: (done: number, total: number) => void,
): Promise<ApiBulkJob> {
  let current = job;
  while (current.status === "QUEUED" || current.status === "RUNNING") {
    if (signal.aborted) break;
    report(current.applied + current.skipped + current.refused, current.total);
    await pause(POLL_MS, signal);
    if (signal.aborted) break;
    current = await pipelineApi.bulkJob(current.id, signal);
  }
  return current;
}

/** Everybody a job refused, however many pages that is. */
async function refusedRows(
  jobId: string,
  signal: AbortSignal,
): Promise<ApiBulkRow[]> {
  const rows: ApiBulkRow[] = [];
  for (let page = 1; page < 100; page += 1) {
    const answer = await pipelineApi.bulkResults(
      jobId,
      { status: "REFUSED", page, pageSize: 200 },
      signal,
    );
    rows.push(...answer.data);
    if (!answer.meta.hasMore) break;
  }
  return rows;
}

async function bulk(
  request: Parameters<PipelineGateway["bulk"]>[0],
): Promise<BulkOutcome> {
  const { target, action, idempotencyKey, signal, onProgress } = request;
  const what = kindOf(action);

  /* One request for a filter; as many as it takes for a ticked list. */
  const bodies: BulkBody[] =
    target.kind === "filter"
      ? [
          {
            ...what,
            selection: {
              requisitionId: target.requisitionId,
              filter: filterBody(target.filters, target.column),
              expectedCount: target.expected,
            },
            idempotencyKey,
          },
        ]
      : chunks(target.ids, IDS_PER_REQUEST).map((ids, index, all) => ({
          ...what,
          selection: {
            requisitionId: target.requisitionId,
            applicationIds: ids,
          },
          idempotencyKey:
            all.length === 1
              ? idempotencyKey
              : `${idempotencyKey}:${String(index)}`,
        }));

  const total = target.kind === "filter" ? target.expected : target.ids.length;
  /* Emails were asked for in this action, or they were not. */
  const asked =
    (action.type === "move" && action.sendEmail === true) ||
    (action.type === "reject" && action.sendEmail);
  return runBulkJobs({ bodies, total, asked, signal, onProgress });
}

/**
 * Sends each body as a bulk job, waits for it, and tallies who was and was not done.
 *
 * Shared with the list of people below the pass mark, whose rejections are bulk jobs
 * too, so the two cannot come to disagree about what "done", "skipped" and "refused"
 * mean or about how an email that was queued is reported.
 */
export async function runBulkJobs({
  bodies,
  total,
  asked,
  signal,
  onProgress,
}: {
  bodies: readonly BulkBody[];
  total: number;
  /** Emails were asked for in this action. */
  asked: boolean;
  signal: AbortSignal;
  onProgress: (progress: { done: number; total: number }) => void;
}): Promise<BulkOutcome> {
  let outcome: BulkOutcome = {
    requested: 0,
    done: 0,
    skipped: 0,
    refused: [],
    emailed: asked ? 0 : null,
  };
  let finished = 0;
  onProgress({ done: 0, total });

  for (const body of bodies) {
    const answer = await pipelineApi.bulk(body, signal);
    let job = answer.job;
    let rows = answer.results;

    if (rows === null) {
      job = await finish(job, signal, (done, of) =>
        onProgress({
          done: finished + done,
          total: Math.max(total, finished + of),
        }),
      );
      if (job.status === "FAILED") {
        throw new ApiError(
          500,
          "bulk_failed",
          `${job.error ?? "The action stopped before the end."} ${String(job.applied + job.skipped)} of ${String(job.total)} had been dealt with when it stopped.`,
        );
      }
      rows = job.refused > 0 ? await refusedRows(job.id, signal) : [];
      outcome = {
        requested: outcome.requested + job.total,
        done: outcome.done + job.applied,
        skipped: outcome.skipped + job.skipped,
        refused: [...outcome.refused, ...rows.map(refusalFrom)],
        /* One email is queued for everybody the action was applied to. */
        emailed: asked ? (outcome.emailed ?? 0) + job.applied : null,
      };
    } else {
      const counted = tally(rows);
      outcome = {
        requested: outcome.requested + job.total,
        done: outcome.done + counted.done,
        skipped: outcome.skipped + counted.skipped,
        refused: [...outcome.refused, ...counted.refused],
        emailed: asked ? (outcome.emailed ?? 0) + counted.done : null,
      };
    }
    finished += job.total;
    onProgress({ done: finished, total: Math.max(total, finished) });
  }
  return outcome;
}

function chunks<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let at = 0; at < list.length; at += size)
    out.push(list.slice(at, at + size));
  return out;
}

/* ------------------------------------------------------------------- gateway */

export const apiGateway: PipelineGateway = {
  mode: "api",
  ...apiComms,

  board: async ({ requisitionId, filters, limit }, signal) => {
    const board = await pipelineApi.board(
      requisitionId,
      { ...boardParams(filters), limit },
      signal,
    );
    return { columns: board.columns.map(columnFrom) };
  },

  listCards: async (query, signal) => {
    const column = await pipelineApi.boardColumn(
      query.requisitionId,
      query.column,
      {
        ...boardParams(query.filters),
        limit: query.pageSize,
        ...(query.cursor ? { cursor: query.cursor } : {}),
      },
      signal,
    );
    const mapped = columnFrom(column);
    return { cards: mapped.cards, total: mapped.total, next: mapped.next };
  },

  move: async (card, stageId, input) => {
    const answer = await pipelineApi.move(card.id, stageId, input.sendEmail);
    return { email: noticeFrom(answer.email) };
  },

  reject: async (card, input) => {
    const answer = await pipelineApi.reject(card.id, {
      reasonId: input.reasonId,
      note: input.note,
      sendEmail: input.sendEmail,
    });
    return { email: noticeFrom(answer.email) };
  },

  setTag: async (card, tagId, on) => {
    const have = card.tags.map((tag) => tag.id);
    const next = on
      ? have.includes(tagId)
        ? have
        : [...have, tagId]
      : have.filter((id) => id !== tagId);
    await pipelineApi.setCandidateTags(card.candidateId, next);
  },

  setTalentPool: async (card, on) => {
    if (on) await pipelineApi.addToTalentPool(card.candidateId);
    else await pipelineApi.removeFromTalentPool(card.candidateId);
  },

  bulk,

  exportCards: async (target: BulkTarget) =>
    pipelineApi.exportApplications(
      target.requisitionId,
      target.kind === "ids"
        ? { applicationIds: target.ids }
        : {
            filter: filterBody(target.filters, target.column),
            expectedCount: target.expected,
          },
    ),

  talentPool: {
    list: async (query, signal) => {
      const page = query.cursor
        ? Math.max(1, Number.parseInt(query.cursor, 10) || 1)
        : 1;
      const answer = await pipelineApi.talentPool(
        {
          ...(query.q ? { q: query.q } : {}),
          ...(query.tagId ? { tagId: query.tagId } : {}),
          ...(query.source ? { source: query.source } : {}),
          page,
          pageSize: query.pageSize,
        },
        signal,
      );
      const entries: TalentEntry[] = answer.data.map((row) => ({
        candidateId: row.candidateId,
        name: row.name,
        email: row.email,
        source: row.source,
        tags: row.tags.map(tagFrom),
        note: row.talentPoolNote,
        /* The API names the last role they were in, not an application id, and
           the record opens by a candidate's id just as well. */
        applications: row.lastApplication
          ? [
              {
                id: row.candidateId,
                requisitionId: row.lastApplication.requisitionId,
                role: row.lastApplication.jobTitle,
                outcome: row.lastApplication.outcome,
                stageName: null,
                reason: row.lastApplication.rejectionReasonLabel,
              },
            ]
          : [],
      }));
      return {
        entries,
        total: answer.meta.total,
        next: answer.meta.hasMore ? String(page + 1) : null,
      };
    },
    remove: async (candidateId) => {
      await pipelineApi.removeFromTalentPool(candidateId);
    },
  },

  tags: {
    list: async (signal) =>
      (await pipelineApi.listTags(signal)).map(tagRowFrom),
    create: async (name) => tagRowFrom(await pipelineApi.createTag({ name })),
    rename: async (id, name) => {
      await pipelineApi.updateTag(id, { name });
    },
    remove: async (id) => {
      await pipelineApi.deleteTag(id);
    },
  },

  reasons: {
    list: async (signal) =>
      (await pipelineApi.listReasons(signal)).map(reasonFrom),
    create: async (label) =>
      reasonFrom(await pipelineApi.createReason({ label })),
    update: async (id, change) => {
      await pipelineApi.updateReason(id, {
        ...(change.label !== undefined ? { label: change.label } : {}),
        ...(change.active !== undefined ? { archived: !change.active } : {}),
      });
    },
  },

  templates: {
    list: async (signal) =>
      (await pipelineApi.listTemplates(signal)).map(templateFrom),
    save: async (draft) => {
      const body = {
        name: draft.name,
        stages: draft.stages.map((stage) => ({
          name: stage.name,
          type: stage.type,
          requiresScorecards: stage.requiresScorecards,
          ...(stage.emailTemplateId !== undefined
            ? { emailTemplateId: stage.emailTemplateId }
            : {}),
        })),
      };
      return templateFrom(
        draft.id === null
          ? await pipelineApi.createTemplate(body)
          : await pipelineApi.updateTemplate(draft.id, body),
      );
    },
    duplicate: async (id) =>
      templateFrom(await pipelineApi.duplicateTemplate(id)),
    remove: async (id) => {
      await pipelineApi.archiveTemplate(id);
    },
    makeDefault: async (id) => {
      await pipelineApi.updateTemplate(id, { isDefault: true });
    },
  },
};
