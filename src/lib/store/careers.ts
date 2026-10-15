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

  return CANDIDATES.filter(
    (candidate) => candidate.source === "careers_page",
  ).flatMap((candidate, index) => {
    const posting = live[index % live.length];
    if (!posting) return [];
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
    };
  });
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
  /** How many a page asks for. Default 50. */
  pageSize?: number;
};

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
      const day = application.appliedAt.slice(0, 10);
      if (filters.from && day < filters.from) return false;
      if (filters.to && day > filters.to) return false;
      const haystack = `${application.name} ${application.email}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    })
    .sort(
      (a, b) =>
        b.appliedAt.localeCompare(a.appliedAt) || b.id.localeCompare(a.id),
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
    pageSize,
  ]);

  const fetchPage = useCallback(
    async (cursor: string | null, signal: AbortSignal) => {
      if (!online) {
        const { applications } = demoBook();
        return pageLocally(
          filterDemoApplications(applications, {
            ...(status ? { status } : {}),
            ...(postingId ? { postingId } : {}),
            ...(source ? { source } : {}),
            ...(q ? { q } : {}),
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
          }),
          cursor,
          pageSize,
        );
      }
      const params: ApplicationListParams = {
        pageSize,
        ...(cursor ? { cursor } : {}),
        ...(status ? { status } : {}),
        ...(postingId ? { postingId } : {}),
        ...(source ? { source } : {}),
        ...(q ? { q } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      };
      const result = await careersApi.listApplications(params, signal);
      return {
        rows: result.data,
        total: result.meta.total,
        next: result.meta.nextCursor ?? null,
      };
    },
    [online, status, postingId, source, q, from, to, pageSize],
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
    /** False in demo mode: everything here is read-only. */
    editable: online,
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
        if (!connected()) throw demoError();
        const result = await careersApi.advance(id, body);
        return { note: result.note, candidateId: result.candidateId };
      },
      decline: async (
        id: string,
        reason?: string,
      ): Promise<{ note: string }> => {
        if (!connected()) throw demoError();
        const result = await careersApi.decline(id, reason);
        return { note: result.note };
      },
    }),
    [],
  );
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

  const demo = useMemo(() => {
    const { postings, applications } = demoBook();
    return demoAnalytics(postings, applications);
  }, []);

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
