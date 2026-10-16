"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, tokens } from "@/lib/api/client";
import {
  careersApi,
  type AdvanceBody,
  type ApiApplication,
  type ApiCareersAnalytics,
  type ApiPosting,
  type ApiPostingDetail,
  type ApplicationListParams,
  type ApplicationStatus,
  type CreatePostingBody,
  type EmploymentType,
  type PostingListParams,
  type PostingStatus,
  type UpdatePostingBody,
} from "@/lib/api/careers";
import { CANDIDATES, REQUISITIONS } from "@/lib/mock/hiring";
import { queueCrowd } from "@/lib/mock/hiring-crowd";
import {
  queueAdvance,
  queueDecline,
  type DemoQueueEntry,
} from "@/lib/hiring/pipeline/demo-ops";
import {
  demoPipeline,
  demoRun,
  useDemoBook,
} from "@/lib/hiring/pipeline/demo-store";
import { referenceFor } from "@/lib/hiring/pipeline/reference";
import { decorateQueue } from "@/lib/hiring/screening/demo-queue";
import { statusToApi, summaryFromRow } from "@/lib/hiring/screening/wire";
import type { ScoreStatus, ScreeningSort } from "@/lib/hiring/screening/model";
import {
  compareBySort,
  matchesScoreFilters,
  sortParams,
} from "@/lib/hiring/screening/score";
import { demoExtrasAt } from "@/lib/hiring/demo-form";
import { NO_EXTRAS, type ApplicationExtras } from "@/lib/hiring/answers-view";
import { useRevalidation } from "@/lib/revalidate";
import { pageLocally, usePagedList } from "@/lib/store/paged-list";

/**
 * Job adverts and the applications they bring in.
 *
 * ## Demo mode is read-only, and that is a decision rather than a shortcut
 *
 * `store/loans.ts` lets a demo approve a loan locally, because a loan decision
 * is a request somebody made and somebody else answered — the flow is real
 * without a database. `store/departments.ts` refuses its writes, because a
 * department is a payroll reporting boundary and a tree built in browser storage
 * would teach the wrong thing about where that number lives.
 *
 * Careers belongs with departments, for a sharper reason. **Advancing an
 * applicant writes into another module.** It creates a `Candidate` and a pipeline
 * `Application` in one transaction, and the screen that shows the result is the
 * recruitment pipeline, which in demo mode is a fixed seed file. A local
 * "Moved to Screening" that moved nobody is exactly the class of failure this
 * product exists to argue against, so every write here refuses in demo mode and
 * says why.
 *
 * What the demo *does* show is real-shaped: adverts derived from the seeded
 * requisitions, and the applications the seed says arrived through a careers
 * page. Enough to read the screen; nothing that claims to have happened.
 *
 * ## No `setState` in an effect body
 *
 * Every loader is a `useCallback` that the effect merely calls, and the two
 * single-record hooks key their result by the id it belongs to rather than
 * clearing it when the id changes. Both patterns are copied from
 * `store/departments.ts`, which explains why at length.
 */

/* -------------------------------------------------------------- the refusal */

const DEMO_REFUSAL =
  "This needs the API. An advert is a public statement in the company's name, " +
  "and screening somebody in creates a candidate in the hiring pipeline: " +
  "neither can happen in a browser with no database behind it.";

const demoError = () => new ApiError(0, "offline", DEMO_REFUSAL);

/* ---------------------------------------------------------------- demo data */

/** What a demo CV says about itself: it is a name, not a file. */
const DEMO_CV_NOTE =
  "Demo applicants have a CV filename and no file behind it, so there is " +
  "nothing to open.";

const slugify = (title: string): string =>
  title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/, "") || "role";

const DEMO_ORG_SLUG = "schull-technologies";

const DEMO_TYPE: Record<string, EmploymentType> = {
  full_time: "FULL_TIME",
  contract: "CONTRACT",
  internship: "INTERN",
};

/** Seeded requisition status to advert status. A draft role is a draft advert. */
const DEMO_STATUS: Record<string, PostingStatus> = {
  draft: "DRAFT",
  pending_approval: "DRAFT",
  open: "PUBLISHED",
  on_hold: "PUBLISHED",
  closed: "CLOSED",
};

function demoPostings(): ApiPosting[] {
  return REQUISITIONS.map((requisition, index) => {
    const slug = slugify(requisition.title);
    const status = DEMO_STATUS[requisition.status] ?? "DRAFT";
    return {
      id: `demo-advert-${requisition.id}`,
      slug,
      title: requisition.title,
      summary: `${requisition.title} in ${requisition.department}, based in ${requisition.location}.`,
      description: [
        `We are hiring ${requisition.openings === 1 ? "one" : requisition.openings} ${requisition.title}${requisition.openings === 1 ? "" : "s"} in ${requisition.department}.`,
        "",
        "What you need:",
        ...requisition.mustHaves.map((item) => `- ${item}`),
        "",
        "Nice to have:",
        ...requisition.niceToHaves.map((item) => `- ${item}`),
      ].join("\n"),
      location: requisition.location,
      employmentType: DEMO_TYPE[requisition.employmentType] ?? "FULL_TIME",
      showSalary: index % 2 === 0,
      salaryMinKobo: requisition.salaryMin * 100,
      salaryMaxKobo: requisition.salaryMax * 100,
      status,
      publishedAt:
        status === "DRAFT" ? null : `${requisition.openedAt}T09:00:00.000Z`,
      closesOn: null,
      acceptingApplications: status === "PUBLISHED",
      requisitionId: requisition.id,
      requisitionReference: requisition.reference,
      requisitionStatus: requisition.status === "open" ? "OPEN" : "DRAFT",
      applicationCount: 0,
      publicPath: `/${DEMO_ORG_SLUG}/${slug}`,
      createdAt: `${requisition.openedAt}T09:00:00.000Z`,
      descriptionHtml: null,
      remote: false,
      formVersion: 1,
      questionCount: 5,
    };
  });
}

/**
 * The applications the seed says arrived through a careers page.
 *
 * Only those four: a candidate sourced by a recruiter never filled this form in,
 * and putting them in this queue would misrepresent where they came from — which
 * is the one question the source tally exists to answer.
 */
function demoApplications(postings: ApiPosting[]): ApiApplication[] {
  const live = postings.filter((posting) => posting.status === "PUBLISHED");
  if (live.length === 0) return [];

  const arrivals = CANDIDATES.filter(
    (candidate) => candidate.source === "careers_page",
  );
  const firstId = arrivals[0] ? `demo-application-${arrivals[0].id}` : "";

  const seeded = arrivals.flatMap(
    (candidate, index): ApiApplication | ApiApplication[] => {
      const posting = live[index % live.length];
      if (!posting) return [];
      const extras = demoExtrasAt(index, firstId);
      return {
        id: `demo-application-${candidate.id}`,
        postingId: posting.id,
        postingTitle: posting.title,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        name: `${candidate.firstName} ${candidate.lastName}`,
        email: candidate.email,
        phone: candidate.phone,
        coverNote:
          index === 0
            ? "I have attached my CV. I am on one month's notice and can start after that."
            : null,
        source: index % 2 === 0 ? "Careers page" : null,
        status: "RECEIVED",
        screenedAt: null,
        declineReason: null,
        candidateId: null,
        cv: {
          key: `demo/cv/${candidate.cvFileName}`,
          url: null,
          expiresAt: null,
          note: DEMO_CV_NOTE,
        },
        appliedAt: `2026-08-${String(12 + index).padStart(2, "0")}T10:30:00.000Z`,
        reference: extras.reference,
        knockoutCount: extras.flagCount,
        duplicate: extras.duplicate
          ? { ofId: extras.duplicate.ofId, reason: extras.duplicate.reason }
          : null,
      };
    },
  );

  /* The crowd: people who applied and nobody has looked at yet. */
  const crowd = queueCrowd().flatMap((person, index): ApiApplication[] => {
    const posting = live[index % live.length];
    if (!posting) return [];
    const id = `demo-application-q${String(index + 1).padStart(2, "0")}`;
    return [
      {
        id,
        postingId: posting.id,
        postingTitle: posting.title,
        firstName: person.firstName,
        lastName: person.lastName,
        name: `${person.firstName} ${person.lastName}`,
        email: person.email,
        phone: person.phone,
        coverNote: null,
        source: person.source,
        status: "RECEIVED",
        screenedAt: null,
        declineReason: null,
        candidateId: null,
        cv: null,
        appliedAt: `${person.appliedOn}T10:30:00.000Z`,
        reference: referenceFor(id),
        knockoutCount: index % 9 === 4 ? 1 : 0,
        duplicate:
          index % 14 === 9
            ? { ofId: "demo-application-c-03", reason: "SAME_EMAIL" }
            : null,
      },
    ];
  });

  return [...seeded, ...crowd];
}

/**
 * What a demo applicant answered, agreed to and was flagged for.
 *
 * The same four people the queue shows, so the row and the record agree. `null`
 * for an id that is not one of them.
 */
export function demoApplicationExtras(
  applicationId: string,
): ApplicationExtras | null {
  const { applications } = demoBook();
  const index = applications.findIndex((a) => a.id === applicationId);
  if (index === -1) return null;
  const first = applications[0]?.id ?? "";
  const made = demoExtrasAt(index, first);
  if (made === NO_EXTRAS) return null;
  /* The row is the authority on what it says about itself; the answers are the
     record's. Where the crowd's row has its own reference, channel and day, the
     record shows those. */
  const row = applications[index];
  const extras: ApplicationExtras = row
    ? {
        ...made,
        reference: row.reference ?? made.reference,
        source: row.source ?? made.source,
        consent: made.consent
          ? { ...made.consent, acceptedOn: row.appliedAt.slice(0, 10) }
          : made.consent,
      }
    : made;
  /* Name the earlier application the marker points at. */
  const earlier = extras.duplicate
    ? applications.find((a) => a.id === extras.duplicate?.ofId)
    : undefined;
  return extras.duplicate
    ? {
        ...extras,
        duplicate: { ...extras.duplicate, ofName: earlier?.name ?? null },
      }
    : extras;
}

/** Counts derived from the two lists above, the way the API derives them. */
function demoAnalytics(
  postings: ApiPosting[],
  applications: ApiApplication[],
): ApiCareersAnalytics {
  const tally = (id: string, status: ApplicationStatus) =>
    applications.filter((a) => a.postingId === id && a.status === status)
      .length;

  return {
    totals: {
      postings: postings.length,
      live: postings.filter((p) => p.status === "PUBLISHED").length,
      applications: applications.length,
      waiting: applications.filter((a) => a.status === "RECEIVED").length,
      advanced: 0,
      declined: 0,
      withdrawn: 0,
      /* Null, not 0. Nothing has been screened in the demo, and "nobody has
         looked yet" is a different fact from "we turn everybody down". */
      advanceRate: null,
    },
    perPosting: postings
      .map((posting) => ({
        postingId: posting.id,
        title: posting.title,
        slug: posting.slug,
        status: posting.status,
        live: posting.status === "PUBLISHED",
        applications: applications.filter((a) => a.postingId === posting.id)
          .length,
        waiting: tally(posting.id, "RECEIVED"),
        advanced: tally(posting.id, "ADVANCED"),
        declined: tally(posting.id, "DECLINED"),
        advanceRate: null,
      }))
      .sort((a, b) => b.applications - a.applications),
    perSource: (() => {
      const buckets = new Map<string, number>();
      for (const application of applications) {
        const key = application.source ?? "Not given";
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
      const total = applications.length;
      return [...buckets.entries()]
        .map(([source, count]) => ({
          source,
          applications: count,
          share: total === 0 ? 0 : Math.round((count / total) * 100),
        }))
        .sort((a, b) => b.applications - a.applications);
    })(),
    cvNote:
      "Demo CVs have a filename and no file behind it, so none of them can be " +
      "opened.",
  };
}

/** Both demo lists, with the per-advert count filled in from the other. */
export function demoBook(): {
  postings: ApiPosting[];
  applications: ApiApplication[];
} {
  const postings = demoPostings();
  const applications = demoApplications(postings);
  return {
    postings: postings.map((posting) => ({
      ...posting,
      applicationCount: applications.filter((a) => a.postingId === posting.id)
        .length,
    })),
    applications,
  };
}

/**
 * What was done in the queue in this browser, laid over the seeded rows.
 *
 * The seed is a fixed snapshot; a decline or a screening-in made here is kept in
 * the demo's own book, and this is where the two meet: a declined row reads
 * "Turned down" with the reason that was written, a screened-in one reads
 * "In the pipeline" and links to the person on the board.
 */
export function overlayQueue(
  rows: ApiApplication[],
  queue: Record<string, DemoQueueEntry>,
): ApiApplication[] {
  return rows.map((row) => {
    const entry = queue[row.id];
    if (!entry) return row;
    if (entry.declined) {
      return {
        ...row,
        status: "DECLINED" as const,
        declineReason: entry.declined.reason,
        screenedAt: entry.declined.at,
      };
    }
    if (entry.advanced) {
      return {
        ...row,
        status: "ADVANCED" as const,
        candidateId: entry.advanced.appId,
        screenedAt: entry.advanced.at,
      };
    }
    return row;
  });
}

/**
 * One demo application, by any id a link might carry.
 *
 * The demo has no server to ask, so its record lookup is a pure function of the
 * seeded book: the application's own id, the candidate id a screened-in row would
 * carry, or — for a seeded pipeline card — the email the two share.
 */
export function findDemoApplication(
  id: string,
  email: string | null,
): { row: ApiApplication; matchedBy: "id" | "email" } | null {
  const { applications } = demoBook();
  const byId = applications.find(
    (application) => application.id === id || application.candidateId === id,
  );
  if (byId) return { row: byId, matchedBy: "id" };
  if (email === null) return null;
  const byEmail = applications.find(
    (application) => application.email === email,
  );
  return byEmail ? { row: byEmail, matchedBy: "email" } : null;
}

/* ------------------------------------------------------------------ adverts */

type PostingsState = {
  postings: ApiPosting[];
  total: number;
  loading: boolean;
  error: ApiError | null;
  /** False in demo mode: everything here is read-only. */
  editable: boolean;
};

export type PostingFilters = {
  status?: PostingStatus;
  q?: string;
  pageSize?: number;
};

/**
 * Every advert, newest first.
 *
 * Filters are taken as primitives rather than an object so the loader's identity
 * is stable across renders — an object literal in a dependency array is a new
 * object every render, and the effect below would never stop firing.
 */
export function usePostings(filters: PostingFilters = {}) {
  const { status, q, pageSize = 100 } = filters;
  const [state, setState] = useState<PostingsState>(() => ({
    postings: [],
    total: 0,
    loading: true,
    error: null,
    editable: true,
  }));

  const load = useCallback(async () => {
    if (!connected()) {
      const { postings } = demoBook();
      const filtered = postings.filter(
        (posting) =>
          (!status || posting.status === status) &&
          (!q ||
            posting.title.toLowerCase().includes(q.toLowerCase()) ||
            posting.summary.toLowerCase().includes(q.toLowerCase())),
      );
      setState({
        postings: filtered,
        total: filtered.length,
        loading: false,
        error: null,
        editable: false,
      });
      return;
    }

    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const params: PostingListParams = {
        pageSize,
        sort: "createdAt",
        order: "desc",
        ...(status ? { status } : {}),
        ...(q ? { q } : {}),
      };
      const result = await careersApi.listPostings(params);
      setState({
        postings: result.data,
        total: result.meta.total,
        loading: false,
        error: null,
        editable: true,
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof ApiError ? error : null,
      }));
    }
  }, [status, q, pageSize]);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    void load();
  }, [load, revalidation]);

  const guard = useCallback(() => {
    if (!connected()) throw demoError();
  }, []);

  return {
    ...state,
    reload: load,
    create: useCallback(
      async (body: CreatePostingBody): Promise<ApiPostingDetail> => {
        guard();
        const created = await careersApi.createPosting(body);
        await load();
        return created;
      },
      [guard, load],
    ),
    update: useCallback(
      async (
        id: string,
        body: UpdatePostingBody,
      ): Promise<ApiPostingDetail> => {
        guard();
        const updated = await careersApi.updatePosting(id, body);
        await load();
        return updated;
      },
      [guard, load],
    ),
    publish: useCallback(
      async (id: string): Promise<ApiPostingDetail> => {
        guard();
        const published = await careersApi.publishPosting(id);
        await load();
        return published;
      },
      [guard, load],
    ),
    /** Resolves with how many applications are still waiting to be screened. */
    close: useCallback(
      async (id: string): Promise<number> => {
        guard();
        const closed = await careersApi.closePosting(id);
        await load();
        return closed.waiting;
      },
      [guard, load],
    ),
  };
}

/* ------------------------------------------------------------- applications */

export type ApplicationFilters = {
  status?: ApplicationStatus;
  postingId?: string;
  /** Exactly as the API stores it — "Careers page", "LinkedIn". */
  source?: string;
  /** Free text, matched on the server against name and email. */
  q?: string;
  /** `YYYY-MM-DD`, inclusive. The day they applied. */
  from?: string;
  to?: string;
  /** Only applications with a wrong knockout answer: the ones that need a look. */
  flagged?: boolean;
  /** Only those marked as a likely duplicate of an earlier one. */
  duplicate?: boolean;
  /** Fit score range, 0 to 100. Only people who have a score are in a range. */
  scoreMin?: number;
  scoreMax?: number;
  /** Only people whose score is in this state. */
  scoreStatus?: ScoreStatus;
  /** Newest first unless a score sort is chosen. */
  sort?: ScreeningSort;
  /** How many a page asks for. Default 50. */
  pageSize?: number;
};

/**
 * A row as the API sent it, with its screening laid on in the shape the screens
 * draw. A row from an API that predates screening has none, and stays as it was.
 */
function withScreening(row: ApiApplication): ApiApplication {
  const screening = summaryFromRow(row);
  return screening ? { ...row, fit: screening } : row;
}

/** A screen's worth. Small enough to land fast, large enough to be worth reading. */
export const APPLICATIONS_PAGE_SIZE = 50;

/**
 * The same questions the API answers, asked of the demo list.
 *
 * Mirrors the server on purpose — every word of a search must match the name or
 * the email, dates are inclusive, and the order is newest first — so the demo
 * cannot show a list the real one would not.
 */
export function filterDemoApplications(
  all: ApiApplication[],
  filters: ApplicationFilters,
): ApiApplication[] {
  const words = (filters.q ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== "");
  return all
    .filter((application) => {
      if (filters.status && application.status !== filters.status) return false;
      if (filters.postingId && application.postingId !== filters.postingId)
        return false;
      if (filters.source && application.source !== filters.source) return false;
      if (filters.flagged && !(application.knockoutCount ?? 0)) return false;
      if (filters.duplicate && !application.duplicate) return false;
      if (
        (filters.scoreMin !== undefined ||
          filters.scoreMax !== undefined ||
          filters.scoreStatus !== undefined) &&
        !(
          application.fit &&
          matchesScoreFilters(application.fit, {
            ...(filters.scoreMin !== undefined
              ? { scoreMin: filters.scoreMin }
              : {}),
            ...(filters.scoreMax !== undefined
              ? { scoreMax: filters.scoreMax }
              : {}),
            ...(filters.scoreStatus
              ? { scoreStatus: filters.scoreStatus }
              : {}),
          })
        )
      )
        return false;
      const day = application.appliedAt.slice(0, 10);
      if (filters.from && day < filters.from) return false;
      if (filters.to && day > filters.to) return false;
      const haystack = `${application.name} ${application.email}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    })
    .sort((a, b) => {
      if (filters.sort && filters.sort !== "newest" && a.fit && b.fit) {
        return compareBySort(
          filters.sort,
          { summary: a.fit, at: a.appliedAt, id: a.id },
          { summary: b.fit, at: b.appliedAt, id: b.id },
        );
      }
      return b.appliedAt.localeCompare(a.appliedAt) || b.id.localeCompare(a.id);
    });
}

/** The demo's whole queue: what was done here laid over the seed, with each row's screening. */
function demoQueueRows(): ApiApplication[] {
  const { applications } = demoBook();
  return decorateQueue(
    overlayQueue(applications, demoPipeline.current().queue),
  );
}

/**
 * The screening queue: newest first, a page at a time, filtered by the server.
 *
 * This used to ask for one page of a hundred and filter and count what came
 * back, so a company with a campus drive saw the newest hundred and a search box
 * that could only find them. Now every filter is a question to the API, the count
 * is the API's, and "Load more" fetches the next lot — see `usePagedList` for how
 * the rows are kept.
 *
 * Demo mode pages the seeded list the same way, through the same hook.
 */
export function useApplications(filters: ApplicationFilters = {}) {
  const {
    status,
    postingId,
    source,
    q,
    from,
    to,
    flagged,
    duplicate,
    scoreMin,
    scoreMax,
    scoreStatus,
    sort,
    pageSize = APPLICATIONS_PAGE_SIZE,
  } = filters;
  const online = connected();

  const key = JSON.stringify([
    online,
    status,
    postingId,
    source,
    q,
    from,
    to,
    flagged,
    duplicate,
    scoreMin,
    scoreMax,
    scoreStatus,
    sort,
    pageSize,
  ]);

  const fetchPage = useCallback(
    async (cursor: string | null, signal: AbortSignal) => {
      if (!online) {
        return pageLocally(
          filterDemoApplications(demoQueueRows(), {
            ...(status ? { status } : {}),
            ...(postingId ? { postingId } : {}),
            ...(source ? { source } : {}),
            ...(q ? { q } : {}),
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
            ...(flagged ? { flagged } : {}),
            ...(duplicate ? { duplicate } : {}),
            ...(scoreMin !== undefined ? { scoreMin } : {}),
            ...(scoreMax !== undefined ? { scoreMax } : {}),
            ...(scoreStatus ? { scoreStatus } : {}),
            ...(sort ? { sort } : {}),
          }),
          cursor,
          pageSize,
        );
      }
      const ordering = sort ? sortParams(sort) : null;
      const params: ApplicationListParams = {
        pageSize,
        ...(cursor ? { cursor } : {}),
        ...(status ? { status } : {}),
        ...(postingId ? { postingId } : {}),
        ...(source ? { source } : {}),
        ...(q ? { q } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(flagged ? { flagged } : {}),
        ...(duplicate ? { duplicate } : {}),
        ...(scoreMin !== undefined ? { scoreMin } : {}),
        ...(scoreMax !== undefined ? { scoreMax } : {}),
        ...(scoreStatus ? { scoreStatus: statusToApi(scoreStatus) } : {}),
        ...(ordering
          ? {
              sort: ordering.sort as ApplicationListParams["sort"],
              order: ordering.order,
            }
          : {}),
      };
      const result = await careersApi.listApplications(params, signal);
      return {
        rows: result.data.map(withScreening),
        total: result.meta.total,
        next: result.meta.nextCursor ?? null,
      };
    },
    [
      online,
      status,
      postingId,
      source,
      q,
      from,
      to,
      flagged,
      duplicate,
      scoreMin,
      scoreMax,
      scoreStatus,
      sort,
      pageSize,
    ],
  );

  const list = usePagedList<ApiApplication>({
    key,
    fetchPage,
    idOf: (application) => application.id,
  });

  const { reload } = list;
  const actions = useScreeningActions();

  return {
    applications: list.rows,
    /** The server's count under these filters, or `null` while unknown. */
    total: list.total,
    loading: list.loading,
    /** Filters changed; the rows shown still answer the previous question. */
    settling: list.settling,
    error: list.error,
    hasMore: list.hasMore,
    loadingMore: list.loadingMore,
    moreError: list.moreError,
    loadMore: list.loadMore,
    /**
     * Connected: there is an API behind it, so a CV can be opened and an answer's
     * file can be fetched. False in a demo, whose applicants have names and no
     * files.
     */
    editable: online,
    /**
     * Whether somebody can be screened in or turned down here. Always: in a demo
     * it is kept in this browser's own book, and the board shows who was screened
     * in, so the flow is real even with no database behind it.
     */
    canScreen: true,
    reload: useCallback(async () => reload(), [reload]),
    /**
     * Screen somebody in. Resolves with the API's own sentence about where they
     * landed — show that rather than composing one, so the screen cannot
     * disagree with what happened.
     */
    advance: useCallback(
      async (id: string, body: AdvanceBody = {}) => {
        /* The list is refreshed whether this succeeds or refuses. The commonest
           refusal is somebody else — the requisition's own screening panel,
           another tab, another recruiter — having already advanced this same
           application a moment earlier; the API names that in a 409 and both of
           this action's entry points already show it via `fail()`, but the row
           that triggered it kept reading "Waiting" with a live Advance button
           until an unrelated reload, so pressing it again just reproduced the
           identical refusal. Refreshing on the failure path is the point: that is
           where the local list is now wrong. The refresh is quiet — the rows stay
           on screen while it asks — so nothing jumps. */
        try {
          return await actions.advance(id, body);
        } finally {
          reload();
        }
      },
      [actions, reload],
    ),
    /** Screen somebody out. The reason is internal and is sent nowhere. */
    decline: useCallback(
      async (id: string, reason?: string) => {
        try {
          return await actions.decline(id, reason);
        } finally {
          reload();
        }
      },
      [actions, reload],
    ),
  };
}

/**
 * Everybody the filters match, up to `limit`, in one request.
 *
 * What "select everyone matching these filters" works from in the queue. The queue
 * takes at most a hundred at a time, so one page is the whole of it; a bigger match
 * is the caller's to refuse before asking.
 */
export async function queueMatching(
  filters: ApplicationFilters,
  limit: number,
  signal: AbortSignal,
): Promise<ApiApplication[]> {
  const {
    status,
    postingId,
    source,
    q,
    from,
    to,
    flagged,
    duplicate,
    scoreMin,
    scoreMax,
    scoreStatus,
    sort,
  } = filters;
  if (!connected()) {
    return filterDemoApplications(demoQueueRows(), {
      ...(status ? { status } : {}),
      ...(postingId ? { postingId } : {}),
      ...(source ? { source } : {}),
      ...(q ? { q } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(flagged ? { flagged } : {}),
      ...(duplicate ? { duplicate } : {}),
      ...(scoreMin !== undefined ? { scoreMin } : {}),
      ...(scoreMax !== undefined ? { scoreMax } : {}),
      ...(scoreStatus ? { scoreStatus } : {}),
      ...(sort ? { sort } : {}),
    }).slice(0, limit);
  }
  const ordering = sort ? sortParams(sort) : null;
  const result = await careersApi.listApplications(
    {
      pageSize: limit,
      ...(status ? { status } : {}),
      ...(postingId ? { postingId } : {}),
      ...(source ? { source } : {}),
      ...(q ? { q } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(flagged ? { flagged } : {}),
      ...(duplicate ? { duplicate } : {}),
      ...(scoreMin !== undefined ? { scoreMin } : {}),
      ...(scoreMax !== undefined ? { scoreMax } : {}),
      ...(scoreStatus ? { scoreStatus: statusToApi(scoreStatus) } : {}),
      ...(ordering
        ? {
            sort: ordering.sort as ApplicationListParams["sort"],
            order: ordering.order,
          }
        : {}),
    },
    signal,
  );
  return result.data.map(withScreening);
}

/**
 * The two decisions on an application, without any list attached.
 *
 * Split out of `useApplications` because the candidate's own page screens
 * somebody in too, and it no longer holds a list to reload — it holds one record.
 * Each caller refreshes whatever it is showing; this only does the write, and
 * refuses in demo mode for the reason in the file header.
 */
export function useScreeningActions() {
  return useMemo(
    () => ({
      advance: async (
        id: string,
        body: AdvanceBody = {},
      ): Promise<{ note: string; candidateId: string }> => {
        if (!connected()) return demoAdvance(id, body);
        const result = await careersApi.advance(id, body);
        return { note: result.note, candidateId: result.candidateId };
      },
      decline: async (
        id: string,
        reason?: string,
      ): Promise<{ note: string }> => {
        if (!connected()) return demoDecline(id, reason);
        const result = await careersApi.decline(id, reason);
        return { note: result.note };
      },
    }),
    [],
  );
}

/** The channel as the board keys it: "Careers page" is `careers-page`. */
const channelKey = (label: string | null): string | null =>
  label === null ? null : label.trim().toLowerCase().replace(/\s+/g, "-");

/**
 * Screening somebody in, in a demo: they land on the role's board.
 *
 * Kept in this browser's book, so the board, the queue and the record all agree
 * about who was screened in. Refused in the API's own words where the API would
 * refuse: an advert with no role behind it, somebody already decided on.
 */
function demoAdvance(
  id: string,
  body: AdvanceBody,
): { note: string; candidateId: string } {
  const { postings, applications } = demoBook();
  const row = applications.find((application) => application.id === id);
  if (!row)
    throw new ApiError(
      404,
      "not_found",
      "That application is not here any more.",
    );
  const posting = postings.find((p) => p.id === row.postingId);
  const result = demoRun((book) =>
    queueAdvance(book, {
      id,
      name: row.name,
      email: row.email,
      requisitionId: posting?.requisitionId ?? body.requisitionId ?? null,
      source: channelKey(row.source),
    }),
  );
  if (!result.ok) throw new ApiError(409, "conflict", result.error);
  return {
    note: result.value.alreadyThere
      ? `${row.name} was already on this role's board, so this application is linked to them.`
      : `${row.name} is on the board for ${posting?.title ?? "this role"}, in its first stage.`,
    candidateId: result.value.appId,
  };
}

function demoDecline(id: string, reason?: string): { note: string } {
  const { applications } = demoBook();
  const row = applications.find((application) => application.id === id);
  if (!row)
    throw new ApiError(
      404,
      "not_found",
      "That application is not here any more.",
    );
  const result = demoRun((book) =>
    queueDecline(book, id, reason?.trim() ? reason.trim() : "No reason given"),
  );
  if (!result.ok) throw new ApiError(409, "conflict", result.error);
  return { note: "Nothing was sent to them. Use Copy message to write." };
}

/* ---------------------------------------------------------------- analytics */

/**
 * What the careers page is actually doing: volume, backlog, and where from.
 *
 * Shaped like `useDepartment` in `store/departments.ts` rather than like the two
 * hooks above, and the difference is worth reading. This one takes no filters, so
 * its loader would have an empty dependency array — and a `useCallback` with no
 * dependencies that calls `setState` is exactly what the
 * `react-hooks/set-state-in-effect` rule catches, because the effect body then
 * provably sets state on mount.
 *
 * So the demo figures are **derived during render** and the fetch writes into a
 * result keyed by the attempt it belongs to. Nothing here sets state
 * synchronously in an effect, and `loading` falls out of "no result for this
 * attempt yet" rather than being tracked separately, which means there is no
 * window where a stale figure is shown as though it were the current one.
 */
export function useCareersAnalytics() {
  const online = connected();
  const [attempt, setAttempt] = useState(0);
  const [fetched, setFetched] = useState<{
    attempt: number;
    analytics: ApiCareersAnalytics | null;
    error: ApiError | null;
  } | null>(null);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    void (async () => {
      try {
        const analytics = await careersApi.analytics();
        if (!cancelled) setFetched({ attempt, analytics, error: null });
      } catch (error) {
        if (!cancelled) {
          setFetched({
            attempt,
            analytics: null,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [online, attempt, revalidation]);

  const book = useDemoBook();
  const demo = useMemo(() => {
    const { postings, applications } = demoBook();
    return demoAnalytics(postings, overlayQueue(applications, book.queue));
  }, [book.queue]);

  const reload = useCallback(() => setAttempt((current) => current + 1), []);
  const matched = fetched !== null && fetched.attempt === attempt;

  if (!online) {
    return { analytics: demo, loading: false, error: null, reload };
  }

  return {
    analytics: matched ? fetched.analytics : null,
    loading: !matched,
    error: matched ? fetched.error : null,
    reload,
  };
}

/* --------------------------------------------------------------- the lookup */

/**
 * Which advert an application came from, so a row can tell whether screening in
 * will work before it offers the button.
 *
 * `advance` needs a requisition, and it takes it from the advert unless the
 * caller names one. Nothing else in the applications payload says whether the
 * advert has one, so the queue loads the adverts too — which it needs anyway for
 * its filter — and looks it up here.
 */
export function usePostingIndex(postings: ApiPosting[]) {
  return useMemo(() => {
    const byId = new Map<string, ApiPosting>();
    for (const posting of postings) byId.set(posting.id, posting);
    return byId;
  }, [postings]);
}

/* -------------------------------------------------------------------- mode */

/**
 * Whether there is an API to talk to.
 *
 * Read from `tokens` rather than `useSession()`, because every loader here is a
 * `useCallback` and a session object in its dependency array would rebuild it on
 * every render of every parent. An access token is the same fact — `client.ts`
 * clears it the moment a session ends, and the offline demo never holds one.
 */
const connected = (): boolean => tokens.has();
