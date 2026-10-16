"use client";

import { ApiError } from "@/lib/api/client";
import { careersApi } from "@/lib/api/careers";
import { screeningApi } from "@/lib/api/screening";
import { assessmentTemplate } from "./assessment-file";
import type { ScreeningGateway } from "./gateway";
import {
  criteriaToApi,
  explanationFromApi,
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

const unavailable = (what: string): ApiError =>
  new ApiError(
    501,
    "not_available",
    `${what} is not switched on for this server yet.`,
  );

export const apiScreeningGateway: ScreeningGateway = {
  mode: "api",
  supports: {
    passMark: false,
    assessment: false,
    below: false,
    board: false,
    sorts: ["newest", "fit-desc", "fit-asc"],
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
      return viewFromApi(
        await screeningApi.putCriteria(postingId, criteriaToApi(criteria)),
      );
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
    get: async () => {
      throw unavailable("The pass mark");
    },
    count: async () => {
      throw unavailable("The pass mark");
    },
    save: async () => {
      throw unavailable("The pass mark");
    },
  },

  explanation: async (subject, signal) => {
    if (subject.kind !== "application") {
      throw unavailable("The explanation on a pipeline record");
    }
    const detail = await careersApi.getApplication(subject.id, signal);
    const screening = detail.screening;
    if (!screening) {
      throw new ApiError(
        404,
        "not_found",
        "This server does not say how a score was worked out.",
      );
    }
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
    check: async () => {
      throw unavailable("Importing assessment scores");
    },
    commit: async () => {
      throw unavailable("Importing assessment scores");
    },
    enter: async () => {
      throw unavailable("Assessment scores");
    },
    history: async () => [],
  },

  below: {
    count: async () => {
      throw unavailable("The list below the pass mark");
    },
    list: async () => {
      throw unavailable("The list below the pass mark");
    },
    reject: async () => {
      throw unavailable("The list below the pass mark");
    },
    keep: async () => {
      throw unavailable("The list below the pass mark");
    },
  },
};
