"use client";

import { useSyncExternalStore } from "react";
import { ApiError } from "@/lib/api/client";
import { createPersistedState } from "@/lib/store/persisted";
import { REQUISITIONS } from "@/lib/mock/hiring";
import { queueCrowd } from "@/lib/mock/hiring-crowd";
import { DEFAULT_SCALE, FALLBACK_WEIGHTS } from "./criteria";
import {
  explain,
  fitOf,
  profileFor,
  type CvProfile,
  type DemoApplicant,
} from "./demo-engine";
import type {
  AssessmentEntry,
  BelowReason,
  Criteria,
  Explanation,
  KnockoutRule,
  PassMark,
  RescoreProgress,
  ScreeningSummary,
} from "./model";

/**
 * The demo's screening book, kept in this browser.
 *
 * What a demo needs to show the module honestly: criteria that can be edited and
 * saved as new versions, a re-score that takes a few seconds and leaves some
 * people on the older version while it runs, a pass mark, scores typed or
 * imported, and the people a person chose to keep in the running.
 *
 * Everything seeded sits behind `DEMO_ENABLED`, so a production build holds an
 * empty book and none of the invented criteria.
 */

/* -------------------------------------------------------------------- shapes */

export type DemoPostingState = {
  version: number | null;
  criteria: Criteria | null;
  /** What the version before this one asked, for people not yet re-scored. */
  prior: { version: number; criteria: Criteria } | null;
  passMark: {
    fitMin: number | null;
    assessmentMin: number | null;
    version: number | null;
  };
  /** A re-score that was started here, and how long ago. */
  rescore: {
    startedAt: number;
    cause: "CRITERIA" | "PASS_MARK";
  } | null;
  /** People whose score is still of the version before, until a re-score runs. */
  staleEmails: string[];
  updatedAt: string | null;
};

export type DemoScreeningBook = {
  postings: Record<string, DemoPostingState>;
  /** By lower-case email, because that is what a file names them by. */
  assessments: Record<string, AssessmentEntry[]>;
  /** By application id: who was kept in the running, and why. */
  kept: Record<string, { reason: string; at: string }>;
};

export const EMPTY_BOOK: DemoScreeningBook = {
  postings: {},
  assessments: {},
  kept: {},
};

export const demoScreening = createPersistedState<DemoScreeningBook>({
  key: "approvehr.hiring.screening.store",
  empty: EMPTY_BOOK,
  version: 1,
});

/** The book, for rendering: re-renders when anything in it changes. */
export function useDemoScreening(): DemoScreeningBook {
  return useSyncExternalStore(
    demoScreening.subscribe,
    demoScreening.read,
    demoScreening.getServerSnapshot,
  );
}

/** How long a demo re-score takes: long enough to see the bar move. */
export const RESCORE_MS = 4000;

/* ---------------------------------------------------------------------- seeds */

const kw = (label: string, ...aliases: string[]) => ({
  id: `seed-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  label,
  aliases,
});

/** The seeded stale person: scored before the criteria last changed. */
const STALE_EMAIL = /\.q13@/;

/** The advert whose criteria are already written, so the demo opens on a scored list. */
export const SEEDED_POSTING = "demo-advert-req-01";

function seedFor(postingId: string): DemoPostingState {
  const blank: DemoPostingState = {
    version: null,
    criteria: null,
    prior: null,
    passMark: { fitMin: null, assessmentMin: null, version: null },
    rescore: null,
    staleEmails: [],
    updatedAt: null,
  };
  if (!DEMO_ENABLED || postingId !== SEEDED_POSTING) return blank;
  return {
    version: 2,
    criteria: {
      mustHave: [
        kw("Node.js", "NodeJS", "Node"),
        kw("PostgreSQL", "Postgres"),
        kw("REST APIs", "REST API", "RESTful"),
      ],
      niceToHave: [
        kw("Terraform"),
        kw("AWS", "Amazon Web Services"),
        kw("Payroll", "PAYE"),
      ],
      minYears: 5,
      education: "bachelors",
      place: "Lagos",
      relocation: true,
      weights: null,
    },
    prior: {
      version: 1,
      criteria: {
        mustHave: [
          kw("Node.js", "NodeJS", "Node"),
          kw("PostgreSQL", "Postgres"),
        ],
        niceToHave: [kw("Terraform")],
        minYears: 4,
        education: null,
        place: null,
        relocation: false,
        weights: null,
      },
    },
    passMark: { fitMin: 50, assessmentMin: null, version: 1 },
    rescore: null,
    /* One person was scored before the criteria last changed, and is waiting. */
    staleEmails: queueCrowd()
      .map((person) => person.email.toLowerCase())
      .filter((email) => STALE_EMAIL.test(email)),
    updatedAt: "2026-08-10T09:00:00.000Z",
  };
}

/** Which kind of file a demo applicant sent, so each state is on screen. */
export function specialOf(
  email: string,
): "NO_TEXT" | "WAITING" | "COULD_NOT_READ" | null {
  if (!DEMO_ENABLED) return null;
  if (/\.q04@/.test(email)) return "NO_TEXT";
  if (/\.q07@/.test(email)) return "WAITING";
  if (/\.q10@/.test(email)) return "COULD_NOT_READ";
  return null;
}

/* --------------------------------------------------------------------- reading */

export function postingStateOf(
  book: DemoScreeningBook,
  postingId: string,
): DemoPostingState {
  return book.postings[postingId] ?? seedFor(postingId);
}

/** A demo advert's id, from its role's. */
export const demoPostingIdOf = (requisitionId: string): string =>
  `demo-advert-${requisitionId}`;

export function knockoutsOf(postingId: string): KnockoutRule[] {
  const requisition = REQUISITIONS.find(
    (role) => demoPostingIdOf(role.id) === postingId,
  );
  return (requisition?.screeningQuestions ?? [])
    .filter((question) => question.knockout)
    .map((question) => ({
      id: question.id,
      question: question.question,
      flagWhen: "No",
    }));
}

/** Re-score progress at a moment, for a posting of `total` applicants. */
export function rescoreAt(
  state: DemoPostingState,
  total: number,
  now: number,
): RescoreProgress {
  if (!state.rescore || total === 0)
    return { running: false, done: 0, total: 0, cause: null };
  const elapsed = Math.max(0, now - state.rescore.startedAt);
  if (elapsed >= RESCORE_MS)
    return { running: false, done: total, total, cause: null };
  return {
    running: true,
    done: Math.min(total - 1, Math.floor((total * elapsed) / RESCORE_MS)),
    total,
    cause: state.rescore.cause,
  };
}

/**
 * Whether a person is still on the older version, at a moment.
 *
 * `order` is where they stand among the advert's applicants, which is the order a
 * re-score works through them in; `null` where that is not known, and then they
 * are taken to be done.
 */
function isStale(
  state: DemoPostingState,
  applicant: DemoApplicant,
  order: number | null,
  total: number,
  now: number,
): boolean {
  if (state.prior === null) return false;
  const progress = rescoreAt(state, total, now);
  if (progress.running) {
    /* A new pass mark does not re-read anybody's CV: only new criteria do. */
    return (
      progress.cause === "CRITERIA" && order !== null && order >= progress.done
    );
  }
  return state.staleEmails.includes(applicant.email.toLowerCase());
}

export type ScoringContext = {
  book: DemoScreeningBook;
  now: number;
  /** How many applicants the advert has, for the re-score's pace. */
  total: number;
};

function profileOf(applicant: DemoApplicant): CvProfile {
  return profileFor(applicant, specialOf(applicant.email));
}

export function explanationFor(
  context: ScoringContext,
  applicant: DemoApplicant,
  order: number | null,
): Explanation {
  const state = postingStateOf(context.book, applicant.postingId);
  const stale = isStale(state, applicant, order, context.total, context.now);
  const usePrior = stale && state.prior !== null;
  const criteria = usePrior ? (state.prior?.criteria ?? null) : state.criteria;
  const version = usePrior ? (state.prior?.version ?? null) : state.version;
  return explain(profileOf(applicant), criteria, {
    version,
    currentVersion: state.version,
    defaults: FALLBACK_WEIGHTS,
    scale: DEFAULT_SCALE,
  });
}

/** The latest assessment score for an email, or `null`. */
export function assessmentOf(
  book: DemoScreeningBook,
  email: string,
): number | null {
  const entries = book.assessments[email.toLowerCase()] ?? [];
  const latest = entries[entries.length - 1];
  return latest ? latest.score : null;
}

export function passMarkOf(
  book: DemoScreeningBook,
  postingId: string,
): PassMark {
  const state = postingStateOf(book, postingId);
  return {
    fitMin: state.passMark.fitMin,
    assessmentMin: state.passMark.assessmentMin,
    assessmentMax: 100,
    knockouts: knockoutsOf(postingId),
    version: state.passMark.version,
  };
}

/** Why somebody is below the pass mark, in the words the list shows. */
export function belowReasons(
  summary: ScreeningSummary,
  mark: Pick<PassMark, "fitMin" | "assessmentMin">,
): BelowReason[] {
  const reasons: BelowReason[] = [];
  const { score } = summary.fit;
  if (mark.fitMin !== null && score !== null && score < mark.fitMin) {
    reasons.push({
      kind: "FIT",
      text: `Fit ${String(score)}, and the pass mark is ${String(mark.fitMin)}`,
    });
  }
  if (
    mark.assessmentMin !== null &&
    summary.assessment !== null &&
    summary.assessment < mark.assessmentMin
  ) {
    reasons.push({
      kind: "ASSESSMENT",
      text: `Assessment ${String(summary.assessment)}, and the pass mark is ${String(mark.assessmentMin)}`,
    });
  }
  if (summary.knockoutCount > 0) {
    reasons.push({
      kind: "KNOCKOUT",
      text:
        summary.knockoutCount === 1
          ? "One answer raised a flag"
          : `${String(summary.knockoutCount)} answers raised a flag`,
    });
  }
  return reasons;
}

export type DemoPerson = DemoApplicant & {
  applicationId: string;
  knockoutCount: number;
};

/** A person's summary, with their standing against the pass mark. */
export function summaryFor(
  context: ScoringContext,
  person: DemoPerson,
  order: number | null,
): ScreeningSummary {
  const fit = fitOf(explanationFor(context, person, order));
  const assessment = assessmentOf(context.book, person.email);
  const mark = passMarkOf(context.book, person.postingId);
  const base: ScreeningSummary = {
    fit,
    assessment,
    knockoutCount: person.knockoutCount,
    belowPassMark: false,
  };
  const kept = context.book.kept[person.applicationId] !== undefined;
  return {
    ...base,
    belowPassMark: !kept && belowReasons(base, mark).length > 0,
  };
}

/* --------------------------------------------------------------------- writing */

const conflict = (message: string): ApiError =>
  new ApiError(409, "conflict", message);

export function withPosting(
  book: DemoScreeningBook,
  postingId: string,
  change: (state: DemoPostingState) => DemoPostingState,
): DemoScreeningBook {
  return {
    ...book,
    postings: {
      ...book.postings,
      [postingId]: change(postingStateOf(book, postingId)),
    },
  };
}

/** Save criteria as the next version, starting a re-score of everybody. */
export function saveCriteriaOp(
  book: DemoScreeningBook,
  postingId: string,
  criteria: Criteria,
  baseVersion: number | null,
  now: number,
): DemoScreeningBook {
  const state = postingStateOf(book, postingId);
  if (state.version !== baseVersion) {
    throw conflict(
      `Somebody saved newer criteria, version ${String(state.version ?? 0)}, while you were editing. Reload to see them, then make your changes again.`,
    );
  }
  const next = (state.version ?? 0) + 1;
  return withPosting(book, postingId, (current) => ({
    ...current,
    version: next,
    criteria,
    prior:
      current.criteria !== null && current.version !== null
        ? { version: current.version, criteria: current.criteria }
        : null,
    rescore: { startedAt: now, cause: "CRITERIA" },
    staleEmails: [],
    updatedAt: new Date(now).toISOString(),
  }));
}

export function savePassMarkOp(
  book: DemoScreeningBook,
  postingId: string,
  input: { fitMin: number | null; assessmentMin: number | null },
  now: number,
): DemoScreeningBook {
  return withPosting(book, postingId, (current) => ({
    ...current,
    passMark: {
      fitMin: input.fitMin,
      assessmentMin: input.assessmentMin,
      version: (current.passMark.version ?? 0) + 1,
    },
    rescore: { startedAt: now, cause: "PASS_MARK" },
  }));
}

export function addAssessment(
  book: DemoScreeningBook,
  email: string,
  entry: AssessmentEntry,
): DemoScreeningBook {
  const key = email.toLowerCase();
  return {
    ...book,
    assessments: {
      ...book.assessments,
      [key]: [...(book.assessments[key] ?? []), entry],
    },
  };
}

export function keepOp(
  book: DemoScreeningBook,
  applicationId: string,
  reason: string,
  now: number,
): DemoScreeningBook {
  return {
    ...book,
    kept: {
      ...book.kept,
      [applicationId]: { reason, at: new Date(now).toISOString() },
    },
  };
}
