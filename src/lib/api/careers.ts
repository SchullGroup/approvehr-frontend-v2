"use client";

import { request, requestPaged, type Paged } from "@/lib/api/client";

/**
 * Job adverts and the applications they bring in — `/api/v1/careers`.
 *
 * Typed wrappers only, in the same hand-written style as `loans.ts`. No React,
 * no state: this file knows the shape of the wire and nothing else.
 *
 * ## This is the inside half. The public half is somewhere else.
 *
 * The API has two halves and the split is structural — see the header of
 * `src/modules/careers/router.ts`. Everything in *this* file needs a signed-in
 * caller holding `MANAGE_HIRING`, because an application holds a stranger's
 * phone number and salary expectation.
 *
 * The three unauthenticated routes a candidate uses live in
 * `src/lib/marketing/careers.ts`, on the marketing surface, which cannot import
 * from `@/lib/api` at all (`scripts/export-marketing.ts` asserts it). The two
 * files therefore duplicate a small amount of shape, and that is the right
 * trade: the public serializer is deliberately *shorter* than this one, and the
 * way a leak happens is somebody reusing the internal type because it was
 * already there.
 *
 * ## Money
 *
 * Every amount in and out is integer **kobo** and every field carrying one says
 * so in its name. `naira()` and `kobo()` at the bottom are the whole boundary —
 * nothing in `store/careers.ts` and no screen divides by 100.
 *
 * ## Two facts about this module that shape every screen above it
 *
 * 1. **A published slug cannot change.** `updatePosting` accepts `slug` but the
 *    service refuses it by name once the advert is live, because a link to a job
 *    is shared once in a WhatsApp group and then lives there. The editor says so
 *    rather than letting somebody try.
 *
 * 2. **Screening somebody in needs a requisition.** `advance` creates the
 *    `Candidate` and the pipeline `Application` in one transaction, and there has
 *    to be a requisition for them to land on — either linked to the advert or
 *    named in the request. There is **no requisitions endpoint in this API**, so
 *    nothing here can offer a picker; `AdvanceBody.requisitionId` is the seam,
 *    and the screens ask for it at the moment it is needed rather than failing.
 */

/* ------------------------------------------------------------------- shapes */

/** Mirrors `JobPostingStatus`. */
export type PostingStatus = "DRAFT" | "PUBLISHED" | "CLOSED";

/** Mirrors `JobApplicationStatus`. `WITHDRAWN` is set by nothing in this API yet. */
export type ApplicationStatus = "RECEIVED" | "ADVANCED" | "DECLINED" | "WITHDRAWN";

/** Mirrors `EmploymentType`. NYSC is a Nigerian service year placement. */
export type EmploymentType =
  | "FULL_TIME"
  | "PART_TIME"
  | "CONTRACT"
  | "INTERN"
  | "NYSC";

export const EMPLOYMENT_TYPES: readonly EmploymentType[] = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERN",
  "NYSC",
];

/** What a person calls each one. Used by both the editor and the public page. */
export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  FULL_TIME: "Full time",
  PART_TIME: "Part time",
  CONTRACT: "Contract",
  INTERN: "Intern",
  NYSC: "NYSC",
};

export type RequisitionStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "OPEN"
  | "ON_HOLD"
  | "FILLED"
  | "CANCELLED";

/** An advert, as every internal list returns it. */
export type ApiPosting = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  location: string | null;
  employmentType: EmploymentType;
  /** False withholds the band from the public page even when one is set. */
  showSalary: boolean;
  salaryMinKobo: number | null;
  salaryMaxKobo: number | null;
  status: PostingStatus;
  publishedAt: string | null;
  /** `YYYY-MM-DD`. */
  closesOn: string | null;
  /** False once the closing day has passed, whatever the status says. */
  acceptingApplications: boolean;
  requisitionId: string | null;
  requisitionReference: string | null;
  requisitionStatus: RequisitionStatus | null;
  applicationCount: number;
  /** `/{orgSlug}/{slug}` — relative to the careers page root, `/careers`. */
  publicPath: string;
  createdAt: string;
};

/** `GET /careers/postings/:id`, and the answer to every posting write. */
export type ApiPostingDetail = ApiPosting & {
  /** The screening queue for this advert at a glance. */
  applications: {
    waiting: number;
    advanced: number;
    declined: number;
    withdrawn: number;
  };
};

/** `POST /careers/postings/:id/close` — same shape plus what is still waiting. */
export type ApiClosedPosting = ApiPostingDetail & { waiting: number };

/**
 * Whether anything can open an attached CV.
 *
 * `url` is `null` in every environment while no object store is wired, and
 * `note` is the one line the interface shows instead. There is no development
 * shortcut and there cannot be — unlike an email token, the file genuinely does
 * not exist anywhere. See `src/modules/careers/storage.ts`.
 */
export type ApiCvAccess = {
  key: string;
  url: string | null;
  expiresAt: string | null;
  note: string | null;
};

export type ApiApplication = {
  id: string;
  postingId: string;
  postingTitle: string;
  firstName: string;
  lastName: string;
  /** Joined by the API. One name, not two fields. */
  name: string;
  email: string;
  phone: string | null;
  coverNote: string | null;
  /** How they heard about the role. Free text, and usually absent. */
  source: string | null;
  status: ApplicationStatus;
  screenedAt: string | null;
  declineReason: string | null;
  /** Set once screened in. The pipeline record lives under `/hiring`. */
  candidateId: string | null;
  cv: ApiCvAccess | null;
  appliedAt: string;
};

/** Everything else this email address has applied for. */
export type ApiOtherApplication = {
  id: string;
  postingTitle: string;
  status: ApplicationStatus;
  appliedAt: string;
};

export type ApiApplicationDetail = ApiApplication & {
  otherApplications: ApiOtherApplication[];
};

/**
 * The answer to `advance`.
 *
 * `note` is written by the API and names the stage they landed in — "They are in
 * Screening on requisition ENG-114." Show it rather than composing your own
 * sentence: the screen cannot then disagree with what actually happened.
 */
export type ApiAdvanced = ApiApplicationDetail & {
  candidateId: string;
  requisitionId: string;
  stageId: string | null;
  note: string;
};

/** The answer to `decline`. `note` says plainly that nothing was sent. */
export type ApiDeclined = ApiApplicationDetail & { note: string };

export type ApiPostingTally = {
  postingId: string;
  title: string;
  slug: string;
  status: PostingStatus;
  live: boolean;
  applications: number;
  waiting: number;
  advanced: number;
  declined: number;
  /** Null when nothing has been screened — not 0. The two are different facts. */
  advanceRate: number | null;
};

export type ApiSourceTally = {
  /** "Not given" is a real bucket, and usually the biggest one. */
  source: string;
  applications: number;
  share: number;
};

/** `GET /careers/analytics`. */
export type ApiCareersAnalytics = {
  totals: {
    postings: number;
    live: number;
    applications: number;
    waiting: number;
    advanced: number;
    declined: number;
    withdrawn: number;
    /**
     * Advanced over *screened*, not over received. A team with a fortnight's
     * backlog would otherwise read as having a terrible advance rate when what
     * they have is a backlog — which `waiting` reports on its own.
     */
    advanceRate: number | null;
  };
  perPosting: ApiPostingTally[];
  perSource: ApiSourceTally[];
  /** Present while no CV store is wired. One line, shown as it arrives. */
  cvNote: string | null;
};

/* -------------------------------------------------------------------- input */

export type PostingListParams = {
  page?: number;
  pageSize?: number;
  /** Allow-list: createdAt | publishedAt | title | closesOn | status. */
  sort?: "createdAt" | "publishedAt" | "title" | "closesOn" | "status";
  order?: "asc" | "desc";
  status?: PostingStatus;
  q?: string;
};

export type ApplicationListParams = {
  page?: number;
  pageSize?: number;
  /** Allow-list: createdAt | lastName | status | source. Newest first by default. */
  sort?: "createdAt" | "lastName" | "status" | "source";
  order?: "asc" | "desc";
  status?: ApplicationStatus;
  postingId?: string;
  source?: string;
  q?: string;
};

/**
 * Writing an advert.
 *
 * `slug` is optional and derived from the title when absent — nobody writing a
 * job advert wants to think about URLs. Sending one is a promise, so a clash is
 * refused rather than quietly suffixed.
 */
export type CreatePostingBody = {
  title: string;
  summary: string;
  description: string;
  slug?: string;
  location?: string;
  employmentType?: EmploymentType;
  showSalary?: boolean;
  salaryMinKobo?: number;
  salaryMaxKobo?: number;
  /** `YYYY-MM-DD`. */
  closesOn?: string;
  requisitionId?: string;
};

/**
 * Editing one. Every field is optional, and `null` clears it.
 *
 * `slug` is only honoured while the advert is a draft. Send it after publishing
 * and the API refuses by name — it does not silently ignore it.
 */
export type UpdatePostingBody = {
  title?: string;
  summary?: string;
  description?: string;
  slug?: string;
  location?: string | null;
  employmentType?: EmploymentType;
  showSalary?: boolean;
  salaryMinKobo?: number | null;
  salaryMaxKobo?: number | null;
  closesOn?: string | null;
  requisitionId?: string | null;
};

/**
 * Screening somebody in.
 *
 * Everything is optional, so a one-press Advance sends `{}` and takes the
 * requisition from the advert. The four screening answers are optional because a
 * first call answers two of the four, and blocking the move until all of them
 * are known leaves the pipeline empty and the real state of play in somebody's
 * notebook.
 */
export type AdvanceBody = {
  /** Needed only when the advert is not linked to one. */
  requisitionId?: string;
  /** Which stage to drop them into. Defaults to the requisition's first. */
  stageId?: string;
  noticeDays?: number;
  currentSalaryKobo?: number;
  expectedSalaryKobo?: number;
  rightToWork?: boolean;
};

/* -------------------------------------------------------------------- calls */

const postingQuery = (params: PostingListParams) => ({
  page: params.page,
  pageSize: params.pageSize,
  sort: params.sort,
  order: params.order,
  status: params.status,
  q: params.q,
});

const applicationQuery = (params: ApplicationListParams) => ({
  page: params.page,
  pageSize: params.pageSize,
  sort: params.sort,
  order: params.order,
  status: params.status,
  postingId: params.postingId,
  source: params.source,
  q: params.q,
});

export const careersApi = {
  listPostings: (params: PostingListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiPosting>("/careers/postings", {
      query: postingQuery(params),
      ...(signal ? { signal } : {}),
    }),

  getPosting: (id: string, signal?: AbortSignal) =>
    request<ApiPostingDetail>(`/careers/postings/${id}`, {
      ...(signal ? { signal } : {}),
    }),

  createPosting: (body: CreatePostingBody) =>
    request<ApiPostingDetail>("/careers/postings", { method: "POST", body }),

  updatePosting: (id: string, body: UpdatePostingBody) =>
    request<ApiPostingDetail>(`/careers/postings/${id}`, {
      method: "PATCH",
      body,
    }),

  /**
   * Put it live. Refuses a past closing date, a filled or cancelled
   * requisition, and a second publish — the last because this route also stamps
   * `publishedAt`, and quietly moving it is how "posted 2 days ago" starts lying.
   */
  publishPosting: (id: string) =>
    request<ApiPostingDetail>(`/careers/postings/${id}/publish`, {
      method: "POST",
    }),

  /** Applications already received are untouched and stay screenable. */
  closePosting: (id: string) =>
    request<ApiClosedPosting>(`/careers/postings/${id}/close`, {
      method: "POST",
    }),

  listApplications: (params: ApplicationListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiApplication>("/careers/applications", {
      query: applicationQuery(params),
      ...(signal ? { signal } : {}),
    }),

  getApplication: (id: string, signal?: AbortSignal) =>
    request<ApiApplicationDetail>(`/careers/applications/${id}`, {
      ...(signal ? { signal } : {}),
    }),

  advance: (id: string, body: AdvanceBody = {}) =>
    request<ApiAdvanced>(`/careers/applications/${id}/advance`, {
      method: "POST",
      body,
    }),

  /** The reason is optional, internal, and sent nowhere by this API. */
  decline: (id: string, reason?: string) =>
    request<ApiDeclined>(`/careers/applications/${id}/decline`, {
      method: "POST",
      body: reason ? { reason } : {},
    }),

  analytics: (signal?: AbortSignal) =>
    request<ApiCareersAnalytics>("/careers/analytics", {
      ...(signal ? { signal } : {}),
    }),
};

export type PagedPostings = Paged<ApiPosting>;
export type PagedApplications = Paged<ApiApplication>;

/* ---------------------------------------------------------------- the money */

/**
 * Kobo to naira, for the screen. The only division by 100 on this side.
 *
 * `Math.round` first because a kobo figure is an integer by contract, and a
 * fractional one means something upstream is already wrong — rounding here keeps
 * the display honest instead of rendering ₦1,234.5678.
 */
export const naira = (amount: number): number => Math.round(amount) / 100;

/** Naira to kobo, for a form. The only multiplication by 100 on this side. */
export const kobo = (amount: number): number => Math.round(amount * 100);

/* ------------------------------------------------------------------- links */

/**
 * Where an advert is readable by the public.
 *
 * `publicPath` is `/{orgSlug}/{slug}` — relative to the careers page root, which
 * on this frontend is `/careers`. Kept in one function so the internal "copy
 * link" control and the marketing routes cannot disagree about the shape.
 */
export const careersPath = (publicPath: string): string => `/careers${publicPath}`;

/**
 * The same link, absolute, for pasting into WhatsApp.
 *
 * `NEXT_PUBLIC_SITE_URL` first, because the careers page is part of the **public
 * site** and the two surfaces need not share an origin — `app.approvehr.io`
 * copying its own origin into a link that lives on `approvehr.io` would hand
 * somebody a URL that asks them to sign in. The same variable `sitemap.ts` and
 * `robots.ts` already read. Falls back to this origin, which is correct whenever
 * the two ship together, as they do in this repo.
 */
export function careersUrl(publicPath: string): string {
  const configured = process.env["NEXT_PUBLIC_SITE_URL"]?.trim().replace(/\/$/, "");
  const origin =
    configured || (typeof window === "undefined" ? "" : window.location.origin);
  return `${origin}${careersPath(publicPath)}`;
}
