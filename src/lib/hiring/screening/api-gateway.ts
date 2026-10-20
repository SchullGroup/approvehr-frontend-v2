"use client";

import { ApiError } from "@/lib/api/client";
import { careersApi } from "@/lib/api/careers";
import type { BulkBody } from "@/lib/api/pipeline";
import { recruitmentApi } from "@/lib/api/recruitment";
import { screeningApi } from "@/lib/api/screening";
import {
  runBulkJobs,
  IDS_PER_REQUEST,
} from "@/lib/hiring/pipeline/api-gateway";
import { assessmentTemplate } from "./assessment-file";
import { checkFile, commitFile } from "./assessment-import";
import type { ScreeningGateway } from "./gateway";
import type { ScreeningSubject } from "./model";
import {
  assessmentToApi,
  belowRowFromApi,
  confirmFilterToApi,
  countFromApi,
  criteriaToApi,
  cutoffToApi,
  explanationFromApi,
  historyFromApi,
  passMarkFromApi,
  previewFromApi,
  progressFromRuns,
  suggestionFromApi,
  viewFromApi,
} from "./wire";

/**
 * The gateway for a connected company: the API, in its own words.
 *
 * It turns the wire into the shapes the screens draw (`wire.ts` holds every
 * difference) and nothing else. A refusal is left as the `ApiError` the client
 * threw, so the sentence a screen shows is the one the API wrote.
 */

/**
 * The public application behind a subject: itself, or for a pipeline record the one
 * it came through. Somebody added by hand has none, and that is said, not guessed.
 */
async function applicationOf(
  subject: ScreeningSubject,
  signal?: AbortSignal,
): Promise<string> {
  if (subject.kind === "application") return subject.id;
  const record = await recruitmentApi.getApplication(subject.id, signal);
  const id = record.screening?.jobApplicationId;
  if (!id) {
    throw new ApiError(
      404,
      "not_found",
      "This person was added by hand, so there is no application, score or answers to read.",
    );
  }
  return id;
}

export const apiScreeningGateway: ScreeningGateway = {
  mode: "api",
  supports: {
    passMark: true,
    assessment: true,
    below: true,
    board: true,
    /* The board endpoint takes a score range, a flagged-answer count and the pass-mark
       flag; it has no sort, and no status to filter by. */
    boardSort: false,
    boardStatus: false,
    belowState: true,
    sorts: ["newest", "fit-desc", "fit-asc", "assessment-desc"],
  },

  criteria: {
    get: async (postingId, signal) =>
      viewFromApi(await screeningApi.getCriteria(postingId, signal)),

    save: async (postingId, criteria, baseVersion) => {
      /* The API takes the next version whoever asks, so a stale edit would quietly
         win. Ask what is saved first, and refuse in words if it has moved. */
      const now = await screeningApi.getCriteria(postingId);
      const have = now.version > 0 ? now.version : null;
      if (have !== baseVersion) {
        throw new ApiError(
          409,
          "conflict",
          `Somebody saved newer criteria, version ${String(have ?? 0)}, while you were editing. Reload to see them, then make your changes again.`,
        );
      }
      const saved = await screeningApi.putCriteria(
        postingId,
        criteriaToApi(criteria),
      );
      return {
        ...viewFromApi(saved),
        changed: saved.changed,
        notes: saved.notes,
      };
    },

    suggest: async (postingId, signal) =>
      suggestionFromApi(await screeningApi.suggest(postingId, signal)),

    preview: async (postingId, criteria, signal) =>
      previewFromApi(
        await screeningApi.previewCriteria(
          postingId,
          criteriaToApi(criteria),
          signal,
        ),
      ),
  },

  rescore: {
    progress: async (postingId, signal) =>
      progressFromRuns(await screeningApi.runs(postingId, 1, signal)),
    start: async (postingId) => {
      await screeningApi.rescore(postingId);
    },
  },

  passMark: {
    get: async (postingId, signal) =>
      passMarkFromApi(await screeningApi.getCutoff(postingId, signal)),

    count: async (postingId, input, signal) =>
      countFromApi(
        (
          await screeningApi.previewCutoff(
            postingId,
            cutoffToApi(input),
            signal,
          )
        ).counts,
      ),

    save: async (postingId, input) =>
      passMarkFromApi(
        await screeningApi.putCutoff(postingId, cutoffToApi(input)),
      ),
  },

  explanation: async (subject, signal) => {
    const id = await applicationOf(subject, signal);
    const detail = await careersApi.getApplication(id, signal);
    const screening = detail.screening;
    /* Not sent: this person may not see scores here, or the server has none. Said
       as nothing, never as an error. */
    if (!screening) return null;
    /* The other spellings of each skill, so the words a match was found under are
       marked too. Only for a score made under the criteria in force now: for an
       older one they could be a different list. */
    const aliases: Record<string, string[]> = {};
    if (screening.current) {
      const view = await screeningApi.getCriteria(detail.postingId, signal);
      view.criteria.skills.must.forEach((skill, index) => {
        aliases[`must:${String(index)}`] = skill.aliases;
      });
      view.criteria.skills.nice.forEach((skill, index) => {
        aliases[`nice:${String(index)}`] = skill.aliases;
      });
    }
    return explanationFromApi(screening, aliases);
  },

  retryReading: null,

  assessment: {
    template: assessmentTemplate,
    check: (postingId, filename, rows, options, signal) =>
      checkFile(postingId, filename, rows, options, signal),
    commit: (postingId, check, rows, options) =>
      commitFile(postingId, check, rows, options),
    enter: async (subject, input) => {
      await screeningApi.putAssessment(
        await applicationOf(subject),
        assessmentToApi(input),
      );
    },
    history: async (subject, signal) =>
      historyFromApi(
        await screeningApi.assessments(
          await applicationOf(subject, signal),
          signal,
        ),
      ),
  },

  below: {
    count: async (postingId, signal) => {
      /* The list's own total, so the number above it can never disagree with it. */
      const [view, list] = await Promise.all([
        screeningApi.getCutoff(postingId, signal),
        screeningApi.confirmList(postingId, { pageSize: 1 }, signal),
      ]);
      return { below: list.meta.total, total: view.counts.undecided };
    },

    list: async (query, signal) => {
      const page = await screeningApi.confirmList(
        query.postingId,
        {
          ...confirmFilterToApi(query.filters),
          sort: "score",
          pageSize: query.pageSize,
          ...(query.cursor ? { cursor: query.cursor } : {}),
        },
        signal,
      );
      return {
        rows: page.data.map(belowRowFromApi),
        total: page.meta.total,
        next: page.meta.hasMore ? page.meta.nextCursor : null,
      };
    },

    reject: async ({
      target,
      decision,
      idempotencyKey,
      signal,
      onProgress,
    }) => {
      const what = {
        action: "REJECT",
        reasonId: decision.reasonId,
        ...(decision.note ? { note: decision.note } : {}),
        /* Absent is false on the API too: it is only ever sent when ticked. */
        ...(decision.sendEmails ? { sendEmails: true } : {}),
      } as const;
      const bodies: BulkBody[] =
        target.kind === "filter"
          ? [
              {
                ...what,
                selection: {
                  postingId: target.postingId,
                  confirmList: confirmFilterToApi(target.filters),
                  expectedCount: target.expected,
                },
                idempotencyKey,
              },
            ]
          : chunksOf(target.ids, IDS_PER_REQUEST).map((ids, index, all) => ({
              ...what,
              selection: {
                postingId: target.postingId,
                jobApplicationIds: ids,
              },
              idempotencyKey:
                all.length === 1
                  ? idempotencyKey
                  : `${idempotencyKey}:${String(index)}`,
            }));
      return runBulkJobs({
        bodies,
        total: target.kind === "filter" ? target.expected : target.ids.length,
        asked: decision.sendEmails,
        signal,
        onProgress,
      });
    },

    keep: async (applicationId, reason) => {
      await screeningApi.keep(applicationId, reason);
    },
  },
};

function chunksOf<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let at = 0; at < list.length; at += size)
    out.push(list.slice(at, at + size));
  return out;
}
