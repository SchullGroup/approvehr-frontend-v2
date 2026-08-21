"use client";

import { useCallback, useMemo } from "react";
import { ApiError } from "@/lib/api/client";
import type { ApiPosting, ApiPostingTally } from "@/lib/api/careers";
import {
  queueBars,
  toAdvanceBody,
  toAdvertBody,
  toNumbers,
  toRoleRow,
  toScreeningRow,
  type AdvertDraft,
  type HiringNumbers,
  type RoleRow,
  type ScreenInInput,
  type ScreeningRow,
} from "@/lib/api/hiring";
import {
  useApplications,
  useCareersAnalytics,
  usePostings,
} from "@/lib/store/careers";
import {
  INTERVIEWS,
  daysInStage,
  pipelineCards,
  stageCounts,
} from "@/lib/mock/hiring";
import { STAGES, type PipelineCard, type StageId } from "@/lib/types";

/**
 * The hiring module's data, from whichever source can answer.
 *
 * ## Why this composes `store/careers.ts` instead of fetching
 *
 * `store/careers.ts` already holds the two-mode logic for `/api/v1/careers`: the
 * demo derivation from the seed, the refusal on every write, the reload after a
 * mutation, and the "no `setState` in an effect body" shape the lint rule wants.
 * Re-fetching the same three endpoints here would mean two stores holding two
 * copies of the same adverts, which is how a screen ends up showing a count that
 * disagrees with the screen next to it.
 *
 * So these hooks compose those hooks and project the result through
 * `lib/api/hiring.ts`. There is exactly one fetch of each endpoint per screen,
 * one place that knows the wire format, and one place that converts kobo.
 *
 * A useful consequence: **the demo path costs nothing extra.** In demo mode
 * `usePostings()` returns adverts derived from the seeded requisitions with
 * `requisitionId` set to the seeded id, and `useApplications()` returns the
 * seeded careers-page applicants against them. So `useRoleQueue` filters by
 * requisition id with the *same* code in both modes.
 *
 * ## What is live and what is seeded, per panel
 *
 * The API answers about adverts, the applications they bring in, and analytics
 * over both. It has no route for `Requisition`, `Candidate`, the pipeline
 * `Application`, `Interview`, `Scorecard` or `Offer` — the models exist, nothing
 * exposes them, and `POST /careers/applications/:id/advance` is the only write
 * that reaches them.
 *
 * Rather than pretend, this file splits the module:
 *
 *   | Data | Source |
 *   |---|---|
 *   | adverts, roles, numbers | API when connected, seed in demo |
 *   | the screening queue, and screening somebody in | API when connected, seed in demo (writes refuse) |
 *   | the board, interviews, scorecards, offers | **seed, in both modes** |
 *
 * Every hook below reports which it gave you, and every screen renders that.
 * `pipelineSnapshot()` is deliberately a plain function rather than a hook, so
 * nothing can mistake it for something that might one day be live without
 * changing its call sites.
 */

/* ------------------------------------------------------------------- roles */

export type HiringOverview = {
  /** True only when these figures came from the database. */
  live: boolean;
  loading: boolean;
  error: ApiError | null;
  roles: RoleRow[];
  numbers: HiringNumbers;
  /** Point-in-time occupancy of the screening queue. Bars, never a funnel. */
  bars: { label: string; value: number }[];
  reload: () => void;
};

const NO_NUMBERS: HiringNumbers = {
  adverts: 0,
  liveAdverts: 0,
  applications: 0,
  waiting: 0,
  advanced: 0,
  declined: 0,
  withdrawn: 0,
  advanceRate: null,
};

/**
 * Every advertised role, with its screening tally.
 *
 * Two endpoints, and the list is rendered as soon as the list arrives rather
 * than waiting for the tally — a recruiter opening this page wants to see their
 * roles, and a breakdown that appears a beat later is better than a blank card.
 */
export function useHiringOverview(): HiringOverview {
  const postings = usePostings();
  const analytics = useCareersAnalytics();

  const tallies = useMemo(() => {
    const byPosting = new Map<string, ApiPostingTally>();
    for (const row of analytics.analytics?.perPosting ?? []) {
      byPosting.set(row.postingId, row);
    }
    return byPosting;
  }, [analytics.analytics]);

  const roles = useMemo(
    () => postings.postings.map((posting) => toRoleRow(posting, tallies.get(posting.id))),
    [postings.postings, tallies],
  );

  const numbers = analytics.analytics ? toNumbers(analytics.analytics) : NO_NUMBERS;

  const reload = useCallback(() => {
    void postings.reload();
    analytics.reload();
  }, [postings, analytics]);

  const loading = postings.loading || analytics.loading;

  return {
    /* `editable` is the careers store's own answer to "did this come from the
       API", and it is the honest flag to badge with — the session could say
       connected while a request is still in flight. Held false while loading so
       a screen never claims live data it does not have yet. */
    live: postings.editable && !loading,
    loading,
    error: postings.error ?? analytics.error,
    roles,
    numbers,
    bars: queueBars(numbers),
    reload,
  };
}

/* ----------------------------------------------------------- the screening */

export type RoleQueue = {
  live: boolean;
  /** False in demo mode: screening somebody in needs the API. */
  editable: boolean;
  loading: boolean;
  error: ApiError | null;
  /** The adverts running against this role. Often one; sometimes none. */
  adverts: ApiPosting[];
  /** Everybody who applied through those adverts, newest first. */
  rows: ScreeningRow[];
  waiting: number;
  /** The reference the API knows this role by, when an advert names one. */
  reference: string | null;
  /** One line from the API whenever a CV reference cannot be opened. */
  cvNote: string | null;
  screenIn: (
    applicationId: string,
    input?: ScreenInInput,
  ) => Promise<{ note: string; candidateId: string }>;
  screenOut: (applicationId: string, reason?: string) => Promise<{ note: string }>;
  reload: () => Promise<void>;
};

/**
 * Everybody who applied for one role through the careers page.
 *
 * ## Why the requisition id is passed on every advance
 *
 * `POST /applications/:id/advance` needs a requisition to put somebody into, and
 * takes it from the advert when the advert has one. An advert with no approved
 * role behind it cannot be advanced from the adverts screen without asking the
 * operator which role to use — but on a requisition's own page the answer is the
 * page you are standing on. So this hook always names it. That is exactly the
 * seam `AdvanceBody.requisitionId` exists for, and it is why this queue is worth
 * having next to the pipeline rather than only at `/hiring/postings/applications`.
 */
export function useRoleQueue(requisitionId: string): RoleQueue {
  const postings = usePostings();
  const applications = useApplications();

  const adverts = useMemo(
    () => postings.postings.filter((posting) => posting.requisitionId === requisitionId),
    [postings.postings, requisitionId],
  );

  const advertIds = useMemo(
    () => new Set(adverts.map((advert) => advert.id)),
    [adverts],
  );

  const rows = useMemo(
    () =>
      applications.applications
        .filter((application) => advertIds.has(application.postingId))
        .map(toScreeningRow),
    [applications.applications, advertIds],
  );

  const screenIn = useCallback(
    (applicationId: string, input: ScreenInInput = {}) =>
      applications.advance(
        applicationId,
        toAdvanceBody({ ...input, requisitionId }),
      ),
    [applications, requisitionId],
  );

  const screenOut = useCallback(
    (applicationId: string, reason?: string) =>
      applications.decline(applicationId, reason),
    [applications],
  );

  const reload = useCallback(async () => {
    await Promise.all([postings.reload(), applications.reload()]);
  }, [postings, applications]);

  const loading = postings.loading || applications.loading;

  return {
    live: applications.editable && !loading,
    editable: applications.editable,
    loading,
    error: postings.error ?? applications.error,
    adverts,
    rows,
    waiting: rows.filter((row) => row.waiting).length,
    reference: adverts.find((advert) => advert.requisitionReference)
      ?.requisitionReference ?? null,
    cvNote: rows.find((row) => row.cvNote)?.cvNote ?? null,
    screenIn,
    screenOut,
    reload,
  };
}

/* --------------------------------------------------------- writing a role */

export type AdvertCreation = {
  /** False in demo mode. An advert is a public statement in the company's name. */
  editable: boolean;
  create: (draft: AdvertDraft) => Promise<{ id: string; title: string }>;
};

/**
 * Turning a drafted role into a draft advert.
 *
 * The requisition wizard collects a whole role — stages, screening questions, a
 * hiring manager, a note for approvers. `Requisition` has no route, so the parts
 * an advert can carry are saved and the wizard's last step says which. It saves
 * as a **draft**: publishing is a separate, audited press on the adverts screen,
 * because that is the moment the words go public.
 */
export function useAdvertCreation(): AdvertCreation {
  const postings = usePostings();

  const create = useCallback(
    async (draft: AdvertDraft) => {
      const created = await postings.create(toAdvertBody(draft));
      return { id: created.id, title: created.title };
    },
    [postings],
  );

  return { editable: postings.editable, create };
}

/* ------------------------------------------------------------- the pipeline */

export type PipelineSnapshot = {
  /**
   * Always false. There is no endpoint behind any of this, in either mode.
   *
   * Kept as a field rather than left implicit so every screen renders the same
   * badge from the same fact, and so the day a pipeline module lands there is
   * one flag to flip instead of six screens to find.
   */
  live: false;
  cards: PipelineCard[];
  inPlay: PipelineCard[];
  counts: Record<StageId, number>;
  /** Anyone sitting in one stage for a week or more — the number acted on. */
  stalled: PipelineCard[];
  scheduledInterviews: typeof INTERVIEWS;
  offersOut: PipelineCard[];
  stageBars: { label: string; value: number }[];
};

/**
 * The board, the interviews and the offers, from the seed.
 *
 * A plain function, not a hook: nothing here can change, so there is nothing to
 * subscribe to, and a hook would imply otherwise. Screens call it during render.
 */
export function pipelineSnapshot(requisitionId?: string): PipelineSnapshot {
  const cards = pipelineCards(requisitionId);
  const inPlay = cards.filter((card) => card.outcome === "in_progress");
  const counts = stageCounts(requisitionId);
  const applicationIds = new Set(cards.map((card) => card.id));

  return {
    live: false,
    cards,
    inPlay,
    counts,
    stalled: inPlay.filter((card) => daysInStage(card) >= 7),
    scheduledInterviews: INTERVIEWS.filter(
      (interview) =>
        interview.status === "scheduled" &&
        (requisitionId === undefined || applicationIds.has(interview.applicationId)),
    ),
    offersOut: cards.filter(
      (card) =>
        card.offer !== undefined &&
        (card.offer.status === "sent" || card.offer.status === "pending_approval"),
    ),
    /* Occupancy per stage, so a bar chart. A funnel would overflow its track:
       more people can be sitting in Interview this week than in Shortlisted. */
    stageBars: STAGES.map((stage) => ({
      label: stage.label,
      value: counts[stage.id],
    })),
  };
}
