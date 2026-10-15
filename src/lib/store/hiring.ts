"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, tokens } from "@/lib/api/client";
import {
  careersApi,
  type ApiApplication,
  type ApiApplicationDetail,
  type ApiPosting,
  type ApiPostingTally,
} from "@/lib/api/careers";
import { recruitmentApi } from "@/lib/api/recruitment";
import {
  offerBand,
  queueBars,
  toAdvanceBody,
  toAdvertBody,
  toApplicantRecord,
  toNumbers,
  toRoleRow,
  toScreeningRow,
  type AdvertDraft,
  type ApplicantRecord,
  type HiringNumbers,
  type OfferBand,
  type RoleRow,
  type ScreenInInput,
  type ScreeningRow,
} from "@/lib/api/hiring";
import {
  APPLICATIONS_PAGE_SIZE,
  demoBook,
  filterDemoApplications,
  findDemoApplication,
  useCareersAnalytics,
  usePostings,
  useScreeningActions,
} from "@/lib/store/careers";
import { pageLocally, usePagedList } from "@/lib/store/paged-list";
import { useGrades } from "@/lib/store/grades";
import {
  INTERVIEWS,
  cardById,
  daysInStage,
  pipelineCards,
  stageCounts,
} from "@/lib/mock/hiring";
import { STAGES, type PipelineCard, type StageId } from "@/lib/types";
import { useRevalidation } from "@/lib/revalidate";

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
 * ## What this file reads, and what reads the rest
 *
 * The API answers for every part of the module: adverts and the applications
 * they bring in (`/careers`), and the requisitions, candidates, pipeline
 * applications, interviews, scorecards and offers (`/recruitment`). Two stores
 * split that between them:
 *
 *   | Data | Read by |
 *   |---|---|
 *   | adverts, roles, numbers, the screening queue, screening somebody in | this file, through `store/careers.ts` — API when connected, seed in demo |
 *   | the board, interviews, scorecards, offers, stage history | `store/recruitment.ts` — API only, connected |
 *   | the same board, interviews and offers with **no session** | `pipelineSnapshot()` below — the demo fixture, nothing else |
 *
 * Connected, every screen reads `store/recruitment.ts` for the pipeline, so
 * `pipelineSnapshot()` is only ever called for the offline demo. That is why it
 * is a plain function rather than a hook, and why every card it feeds says
 * "Demo data" rather than a bare "not live".
 *
 * Every hook below reports which source it gave you, and every screen renders
 * that.
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
 * A figure for a `Stat`, honest about a failed fetch.
 *
 * `numbers` falls back to `NO_NUMBERS` — all zeros — the moment the read
 * errors, so a `Stat` printing that count unconditionally would show "0
 * waiting to be screened" next to a banner saying the real number could not
 * be loaded. Same rule as every other absence in this codebase: a number
 * rendered where the server was never actually asked is a wrong claim, not a
 * cosmetic one.
 */
export function countOrDash(error: unknown, value: number): string {
  return error ? "—" : String(value);
}

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
    () =>
      postings.postings.map((posting) =>
        toRoleRow(posting, tallies.get(posting.id)),
      ),
    [postings.postings, tallies],
  );

  const numbers = analytics.analytics
    ? toNumbers(analytics.analytics)
    : NO_NUMBERS;

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
  /** First load only. */
  loading: boolean;
  error: ApiError | null;
  /** The adverts running against this role. Often one; sometimes none. */
  adverts: ApiPosting[];
  /** Everybody who applied through those adverts, a page at a time. */
  rows: ScreeningRow[];
  /** How many have applied in all, from the adverts' own counts. */
  total: number | null;
  /** How many are waiting on a first look — the API's figure, not the rows'. */
  waiting: number | null;
  hasMore: boolean;
  loadingMore: boolean;
  moreError: ApiError | null;
  loadMore: () => void;
  /** The reference the API knows this role by, when an advert names one. */
  reference: string | null;
  screenIn: (
    applicationId: string,
    input?: ScreenInInput,
  ) => Promise<{ note: string; candidateId: string }>;
  screenOut: (
    applicationId: string,
    reason?: string,
  ) => Promise<{ note: string }>;
  reload: () => Promise<void>;
};

/** Where a role's queue has got to: which advert, and how far through it. */
type QueuePosition = { advert: number; cursor: string | null };

const encodePosition = (position: QueuePosition): string =>
  JSON.stringify(position);

const decodePosition = (cursor: string | null): QueuePosition => {
  if (cursor === null) return { advert: 0, cursor: null };
  try {
    const parsed = JSON.parse(cursor) as Partial<QueuePosition>;
    return {
      advert: typeof parsed.advert === "number" ? parsed.advert : 0,
      cursor: typeof parsed.cursor === "string" ? parsed.cursor : null,
    };
  } catch {
    return { advert: 0, cursor: null };
  }
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
 *
 * ## One role, several adverts, one list
 *
 * A role can be advertised more than once, and the applications API filters by
 * advert, not by role. This used to ask for the newest hundred applications
 * across the whole company and keep the ones whose advert belonged here — so a
 * role's queue was only as deep as its share of the company's last hundred, and a
 * busy role next door could empty it. Now it asks for each advert's own
 * applications, one advert after another, newest first within each, behind a
 * single cursor that remembers which advert it is on. A page is filled from as
 * many adverts as it takes, so a small advert never leaves a short page behind.
 *
 * The counts do not come from the rows. `total` is the adverts' own application
 * counts and `waiting` is the analytics figure for those adverts — both are the
 * server's, and both stay right when only the first fifty rows are on screen.
 */
export function useRoleQueue(requisitionId: string): RoleQueue {
  const postings = usePostings();
  const analytics = useCareersAnalytics();
  const actions = useScreeningActions();
  const online = tokens.has();

  const adverts = useMemo(
    () =>
      postings.postings.filter(
        (posting) => posting.requisitionId === requisitionId,
      ),
    [postings.postings, requisitionId],
  );
  const advertIds = useMemo(
    () => adverts.map((advert) => advert.id),
    [adverts],
  );
  const total = useMemo(
    () => adverts.reduce((sum, advert) => sum + advert.applicationCount, 0),
    [adverts],
  );

  const fetchPage = useCallback(
    async (cursor: string | null, signal: AbortSignal) => {
      if (advertIds.length === 0) return { rows: [], total: 0, next: null };

      if (!online) {
        const { applications } = demoBook();
        const mine = filterDemoApplications(
          applications.filter((application) =>
            advertIds.includes(application.postingId),
          ),
          {},
        );
        return pageLocally(mine, cursor, APPLICATIONS_PAGE_SIZE);
      }

      /* A page is filled from as many adverts as it takes. An advert with only a
         dozen applicants must not hand back a page of twelve with a "Load more"
         under it: that reads as a list that stopped early. */
      let position = decodePosition(cursor);
      const rows: ApiApplication[] = [];
      for (;;) {
        const advertId = advertIds[position.advert];
        if (advertId === undefined) return { rows, total, next: null };

        const result = await careersApi.listApplications(
          {
            postingId: advertId,
            pageSize: APPLICATIONS_PAGE_SIZE - rows.length,
            ...(position.cursor ? { cursor: position.cursor } : {}),
          },
          signal,
        );
        rows.push(...result.data);

        const inner = result.meta.nextCursor ?? null;
        const next: string | null = inner
          ? encodePosition({ advert: position.advert, cursor: inner })
          : position.advert + 1 < advertIds.length
            ? encodePosition({ advert: position.advert + 1, cursor: null })
            : null;

        /* Full, or nothing left to ask. An advert nobody applied to simply adds
           nothing and the loop moves on to the next one. */
        if (rows.length >= APPLICATIONS_PAGE_SIZE || next === null) {
          return { rows, total, next };
        }
        position = decodePosition(next);
      }
    },
    [advertIds, online, total],
  );

  /* The adverts are re-read whenever somebody comes back to the window, and
     `usePostings` raises `loading` for each of those reads while keeping the old
     answer. Waiting on `loading` alone would blank this queue — and flash its
     skeleton — on every alt-tab, so only the very first read holds it back: once
     there are adverts to ask about, the list stays up while they refresh. */
  const advertsKnown = !postings.loading || postings.postings.length > 0;

  const list = usePagedList<ApiApplication>({
    key: JSON.stringify([online, requisitionId, advertIds]),
    enabled: advertsKnown && postings.error === null,
    fetchPage,
    idOf: (application) => application.id,
  });

  const rows = useMemo(() => list.rows.map(toScreeningRow), [list.rows]);

  const { reload: reloadList } = list;
  const { reload: reloadAnalytics } = analytics;

  const screenIn = useCallback(
    async (applicationId: string, input: ScreenInInput = {}) => {
      try {
        return await actions.advance(
          applicationId,
          toAdvanceBody({ ...input, requisitionId }),
        );
      } finally {
        reloadList();
        reloadAnalytics();
      }
    },
    [actions, requisitionId, reloadList, reloadAnalytics],
  );

  const screenOut = useCallback(
    async (applicationId: string, reason?: string) => {
      try {
        return await actions.decline(applicationId, reason);
      } finally {
        reloadList();
        reloadAnalytics();
      }
    },
    [actions, reloadList, reloadAnalytics],
  );

  const reload = useCallback(async () => {
    reloadList();
    reloadAnalytics();
    await postings.reload();
  }, [reloadList, reloadAnalytics, postings]);

  const waiting = useMemo(() => {
    if (analytics.analytics === null) return null;
    const mine = new Set(advertIds);
    return analytics.analytics.perPosting
      .filter((tally) => mine.has(tally.postingId))
      .reduce((sum, tally) => sum + tally.waiting, 0);
  }, [analytics.analytics, advertIds]);

  const loading = !advertsKnown || list.loading;

  return {
    live: online && !loading,
    editable: online,
    loading,
    error: postings.error ?? list.error,
    adverts,
    rows,
    total: advertsKnown ? total : null,
    waiting,
    hasMore: list.hasMore,
    loadingMore: list.loadingMore,
    moreError: list.moreError,
    loadMore: list.loadMore,
    reference:
      adverts.find((advert) => advert.requisitionReference)
        ?.requisitionReference ?? null,
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
 * hiring manager, a note for approvers. Connected, the wizard writes the
 * requisition and its stages first (`store/recruitment.ts`) and this saves the
 * advert linked to it; with no session only the advert half exists. The screening
 * questions are collected but sent to neither: nothing in the API stores a
 * question or an answer yet. It saves as a **draft**: publishing is a separate,
 * audited press on the adverts screen, because that is the moment the words go
 * public.
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
   * Always false: this snapshot is the demo fixture and never a database read.
   *
   * The pipeline is live when connected, but it is read by
   * `store/recruitment.ts`, not here. Kept as a field rather than left implicit
   * so every screen that does show this renders the same badge from the same
   * fact.
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
 * The board, the interviews and the offers, from the demo seed.
 *
 * A plain function, not a hook: nothing here can change, so there is nothing to
 * subscribe to, and a hook would imply otherwise. Screens call it during render,
 * and only while there is no session — signed in, they read the API instead.
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
        (requisitionId === undefined ||
          applicationIds.has(interview.applicationId)),
    ),
    offersOut: cards.filter(
      (card) =>
        card.offer !== undefined &&
        (card.offer.status === "sent" ||
          card.offer.status === "pending_approval"),
    ),
    /* Occupancy per stage, so a bar chart. A funnel would overflow its track:
       more people can be sitting in Interview this week than in Shortlisted. */
    stageBars: STAGES.map((stage) => ({
      label: stage.label,
      value: counts[stage.id],
    })),
  };
}

/* --------------------------------------------------------- one applicant */

export type ApplicantView = {
  /** True only when this person's details came from the database. */
  live: boolean;
  /** False in demo mode: screening somebody in needs the API. */
  editable: boolean;
  loading: boolean;
  error: ApiError | null;
  /** The live half — who applied, for what, and what a screener did about it. */
  record: ApplicantRecord | null;
  /** The seeded half — stage, interviews, scorecards, offer. Null off the seed. */
  card: PipelineCard | null;
  /**
   * How `record` was found: by the id in the URL, or by the seeded candidate's
   * email address.
   *
   * Worth reporting, because an email match joins two records that were never
   * linked, and they can disagree — a seeded pipeline card marked rejected
   * beside a careers-page application still marked as waiting. The screen says
   * which join it is looking at rather than letting the reader assume one record.
   */
  matchedBy: "id" | "email" | null;
  screenIn: (
    input?: ScreenInInput,
  ) => Promise<{ note: string; candidateId: string }>;
  screenOut: (reason?: string) => Promise<{ note: string }>;
  reload: () => Promise<void>;
};

/**
 * Which of two ids a 404 or a 400 was about.
 *
 * The id in a candidate's URL is tried as one kind of id after another, and
 * "that is not one of these" is the expected answer to most of the tries. Only
 * that answer means *try the next kind*; a 500 or a dead connection means the
 * question was not answered at all, and carries on as an error.
 */
const notThatKind = (error: unknown): boolean =>
  error instanceof ApiError && (error.status === 404 || error.status === 400);

/**
 * Find the careers-page application behind whatever id a link carried.
 *
 * ## Why this asks the server, and why it did not always
 *
 * It used to look the id up in the list the screen loaded anyway — the newest
 * hundred applications — and that was exact until the list stopped being the
 * whole company. A person whose application is the hundred-and-first-newest has
 * a record page that says "nothing matches". So nothing here depends on what any
 * list holds; every route below asks the API.
 *
 * ## Three kinds of id arrive, tried in the order of what they cost
 *
 *   1. a careers **application** id — one request. The applications queue and the
 *      "also applied for" list link these.
 *   2. a recruitment **candidate** id — what `advance` returns and the "see them
 *      in the pipeline" links carry. Resolved to the candidate's email, then to
 *      the application through a search for it.
 *   3. a pipeline **application** id — what the board links. Same way round.
 *
 * Email is the identity the API itself dedupes candidates on (`Candidate` is
 * unique on `(organizationId, email)`), so it is the right join, and a match by
 * the candidate's own id is preferred over one by address alone.
 *
 * Exported for the test that proves a person beyond the first page resolves.
 */
export async function resolveCareersApplication(
  id: string,
  signal?: AbortSignal,
): Promise<{
  detail: ApiApplicationDetail;
  matchedBy: "id" | "email";
} | null> {
  try {
    return {
      detail: await careersApi.getApplication(id, signal),
      matchedBy: "id",
    };
  } catch (error) {
    if (!notThatKind(error)) throw error;
  }

  let who: { candidateId: string; email: string } | null = null;
  try {
    const candidate = await recruitmentApi.getCandidate(id, signal);
    who = { candidateId: candidate.id, email: candidate.email };
  } catch (error) {
    if (!notThatKind(error)) throw error;
  }
  if (who === null) {
    try {
      const pipeline = await recruitmentApi.getApplication(id, signal);
      who = {
        candidateId: pipeline.candidate.id,
        email: pipeline.candidate.email,
      };
    } catch (error) {
      if (!notThatKind(error)) throw error;
    }
  }
  if (who === null) return null;

  const found = await careersApi.listApplications(
    { q: who.email, pageSize: 25 },
    signal,
  );
  const wanted = who.email.toLowerCase();
  const byCandidate = found.data.find(
    (row) => row.candidateId === who.candidateId,
  );
  const byEmail = found.data.find((row) => row.email.toLowerCase() === wanted);
  const hit = byCandidate ?? byEmail;
  if (!hit) return null;
  return {
    detail: await careersApi.getApplication(hit.id, signal),
    matchedBy: byCandidate ? "id" : "email",
  };
}

/**
 * One person, from whichever source holds them.
 *
 * ## The id in the URL is three different ids, and that is not a mistake
 *
 * `/hiring/candidates/{id}` is linked from three places, each with its own kind
 * of id:
 *
 *   - the pipeline board links a pipeline **application** id;
 *   - the screening queue links the **candidate** id the API returned from
 *     `advance`, which is a real database id;
 *   - the applications list links the **job application** id.
 *
 * `resolveCareersApplication` above turns any of them into the careers-page
 * application, by asking the API. Offline, the seeded book answers the same way
 * (`findDemoApplication`), and a seeded pipeline id then gets one more chance, on
 * the candidate's email address, which is how the demo shows one person's
 * application beside their board card.
 *
 * ## Two sources, both reported
 *
 * `record` is live whenever the API answers. `card` is the seeded pipeline
 * record, present only for a seed id. A page can have one, the other, or both —
 * and it badges each panel from these two fields rather than deciding once for
 * the whole screen.
 */
export function useApplicantRecord(id: string): ApplicantView {
  const online = tokens.has();
  const actions = useScreeningActions();
  const card = cardById(id) ?? null;
  const cardEmail = card?.candidate.email ?? null;

  /* Offline: a pure function of the seeded book, derived during render. */
  const demo = useMemo(
    () => (online ? null : findDemoApplication(id, cardEmail)),
    [online, id, cardEmail],
  );

  /* Connected: asked of the API. The result is keyed by the id it answers and
     not by the attempt, so a reload after a write replaces the record in place
     instead of blanking it — the same rule `useRealPipelineApplication` states. */
  const [attempt, setAttempt] = useState(0);
  const [fetched, setFetched] = useState<{
    id: string;
    detail: ApiApplicationDetail | null;
    matchedBy: "id" | "email" | null;
    error: ApiError | null;
  } | null>(null);

  /* Re-ask when somebody comes back to the window. Not in the key below, so the
     answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!online) return;
    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      try {
        const found = await resolveCareersApplication(id, controller.signal);
        if (!cancelled) {
          setFetched({
            id,
            detail: found?.detail ?? null,
            matchedBy: found?.matchedBy ?? null,
            error: null,
          });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        if (!cancelled) {
          setFetched({
            id,
            detail: null,
            matchedBy: null,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [online, id, attempt, revalidation]);

  const matched = fetched !== null && fetched.id === id;
  const detail = online ? (matched ? fetched.detail : null) : null;

  /* The detail is the whole record. There is no list row to reconcile it with
     any more — the old screen showed a stale "Waiting" beside a record the
     database had already moved because it merged a once-fetched detail with a
     reloaded list — so a reload simply replaces it. */
  const record = useMemo<ApplicantRecord | null>(() => {
    if (online) return detail ? toApplicantRecord(detail) : null;
    return demo
      ? toApplicantRecord({ ...demo.row, otherApplications: [], history: [] })
      : null;
  }, [online, detail, demo]);

  const applicationId = record?.applicationId ?? null;

  const reload = useCallback(async () => setAttempt((n) => n + 1), []);

  const screenIn = useCallback(
    async (input: ScreenInInput = {}) => {
      if (applicationId === null) throw NO_APPLICATION;
      try {
        return await actions.advance(applicationId, toAdvanceBody(input));
      } finally {
        setAttempt((n) => n + 1);
      }
    },
    [actions, applicationId],
  );

  const screenOut = useCallback(
    async (reason?: string) => {
      if (applicationId === null) throw NO_APPLICATION;
      try {
        return await actions.decline(applicationId, reason);
      } finally {
        setAttempt((n) => n + 1);
      }
    },
    [actions, applicationId],
  );

  const loading = online ? !matched : false;

  return {
    live: online && !loading && record !== null,
    editable: online,
    loading,
    error: online && matched ? fetched.error : null,
    record,
    card,
    matchedBy:
      record === null
        ? null
        : online
          ? matched
            ? fetched.matchedBy
            : null
          : (demo?.matchedBy ?? null),
    screenIn,
    screenOut,
    reload,
  };
}

const NO_APPLICATION = new ApiError(
  0,
  "not_found",
  "There is no careers-page application behind this record, so there is " +
    "nothing to screen. Open the applications queue to find one.",
);

/* ------------------------------------------------------- the screening load */

export type ScreeningBacklog = {
  live: boolean;
  loading: boolean;
  error: ApiError | null;
  numbers: HiringNumbers;
  reload: () => void;
};

/**
 * How many people are waiting on a first look.
 *
 * On the interviews screen because that is what decides whether there will be
 * interviews next week, and it is the one figure on that page with an endpoint
 * behind it. One request — `/careers/analytics` — rather than the list as well,
 * because the page needs the count and not the names.
 */
export function useScreeningBacklog(): ScreeningBacklog {
  const analytics = useCareersAnalytics();
  const numbers = analytics.analytics
    ? toNumbers(analytics.analytics)
    : NO_NUMBERS;

  return {
    /* An access token plus an answer. `useCareersAnalytics` returns the demo
       figures with `loading: false` in offline mode, so the answer alone is not
       enough to claim these came from a database. */
    live: tokens.has() && !analytics.loading && analytics.analytics !== null,
    loading: analytics.loading,
    error: analytics.error,
    numbers,
    reload: analytics.reload,
  };
}

/* ---------------------------------------------------------------- the bands */

export type OfferBands = {
  /** True when the ladder came from the database. */
  live: boolean;
  loading: boolean;
  error: ApiError | null;
  /** How many grades the ladder holds. Zero has its own sentence on screen. */
  count: number;
  /**
   * Why there is no band, in one sentence, or null when there is one.
   *
   * Three different facts end in an empty ladder and a screen must not say the
   * same thing about all of them. `GET /grades` needs `MANAGE_PAY_STRUCTURE`,
   * which plenty of recruiters do not hold — so the commonest answer here is
   * "you cannot see the pay structure", not "there are no grades". Guessing
   * wrong sends somebody to build a ladder that already exists.
   */
  note: string | null;
  /** Naira in, a real kobo band out. Null when there is no ladder to place in. */
  bandFor: (grossMonthly: number) => OfferBand | null;
};

/**
 * Real salary bands, for placing an offer.
 *
 * The offer screen used to draw its own bar between the requisition's
 * `salaryMin` and `salaryMax` — two seeded numbers with nothing behind them. A
 * meter drawn against those cannot say "this is above what we pay for this
 * work", because the band moves with whatever the seed happens to say.
 *
 * `/grades` is the ladder the company actually pays against, and it is live
 * whenever the API is up. `<BandPosition />` in `payroll/pay-setup` draws it,
 * with the midpoint marked and the marker allowed to leave the track when an
 * offer is outside the band — which is the single case an approver has to act
 * on, and the case the old bar clamped out of sight.
 */
export function useOfferBands(): OfferBands {
  const grades = useGrades();

  const bandFor = useCallback(
    (grossMonthly: number) => offerBand(grades.rows, grossMonthly),
    [grades.rows],
  );

  return {
    live: grades.connected && !grades.loading,
    loading: grades.loading,
    error: grades.error,
    count: grades.rows.length,
    note: grades.loading
      ? "Loading the grade ladder…"
      : grades.error
        ? grades.error.message
        : grades.rows.length === 0
          ? "There are no salary grades yet, so nothing can say whether this is in band."
          : null,
    bandFor,
  };
}
