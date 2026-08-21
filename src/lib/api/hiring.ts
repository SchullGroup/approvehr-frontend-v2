"use client";

import {
  EMPLOYMENT_TYPE_LABEL,
  kobo,
  naira,
  type AdvanceBody,
  type ApiApplication,
  type ApiCareersAnalytics,
  type ApiPosting,
  type ApiPostingTally,
  type CreatePostingBody,
  type EmploymentType,
  type PostingStatus,
} from "@/lib/api/careers";

/**
 * The hiring surface's view of `/api/v1/careers`.
 *
 * ## This file deliberately makes no requests
 *
 * `lib/api/careers.ts` already owns every wrapper around `/careers` — postings,
 * applications, analytics, advance, decline — and it is owned by the adverts
 * surface. Duplicating those wrappers here to give the hiring screens "their
 * own" client would give the product two places that know the wire format of
 * one module, which is how the two drift. So this file holds the three things
 * that are genuinely the hiring surface's own and nothing else:
 *
 *   1. **Projections.** The hiring screens speak about *roles*, a *screening
 *      queue* and *numbers*; the API speaks about job postings, job
 *      applications and analytics totals. `toRoleRow`, `toScreeningRow` and
 *      `toNumbers` are that translation, in one place, so no screen reads a raw
 *      wire field and no two screens disagree about what "waiting" means.
 *
 *   2. **The money boundary.** Every amount on the wire is integer kobo; every
 *      amount a screen renders is naira. `naira()` and `kobo()` are imported
 *      from `careers.ts` and used *here*, at this edge. Nothing in
 *      `lib/store/hiring.ts` and no screen under `app/(app)/hiring` divides or
 *      multiplies by 100.
 *
 *   3. **Request bodies.** `toAdvanceBody` and `toAdvertBody` take naira and
 *      produce the kobo-denominated bodies the API validates, so a form can
 *      collect what a person types.
 *
 * The calls themselves go through `lib/store/careers.ts`'s hooks, which already
 * carry the two-mode fallback, the demo refusal and the reload-after-write.
 * See the header of `lib/store/hiring.ts` for why that is the right seam.
 *
 * ## What this API cannot answer, and what that means upstream
 *
 * Worth stating plainly, because it decides the shape of every screen above.
 * `/api/v1/careers` exposes **adverts, the applications they bring in, and
 * analytics over both**. The models behind the rest of the hiring module —
 * `Requisition`, `PipelineStage`, `Candidate`, the pipeline `Application`,
 * `Interview`, `Scorecard`, `Offer` — all exist in Prisma and **none of them has
 * a route**. `POST /careers/applications/:id/advance` writes into them and is
 * the only door: it creates the `Candidate` and the pipeline `Application` in
 * one transaction, and then nothing can read them back.
 *
 * So the hiring screens split in two, and the split is visible to the user:
 *
 *   - adverts, the screening queue and the numbers over them are **live**;
 *   - the board, interviews, scorecards and offers are **seeded demo data in
 *     both modes**, and every one of them says so on screen.
 *
 * That is the two-mode rule applied per panel rather than per page. A connected
 * screen showing a seeded pipeline without saying so would be the exact failure
 * the badges exist to prevent.
 */

/* -------------------------------------------------------------------- roles */

/**
 * A role, as the hiring screens list them.
 *
 * Keyed on the **advert**, not the requisition, because the advert is the thing
 * the API will answer questions about. `requisitionId` is the approved role
 * behind it and is frequently null — an advert can exist without one, collect
 * applications perfectly well, and then have nowhere to move anybody into.
 * `screenable` is that fact, precomputed, so a row can warn before somebody
 * presses a button rather than after.
 */
export type RoleRow = {
  /** The advert. The only hiring id this API resolves. */
  postingId: string;
  title: string;
  /** The approved role behind the advert, when there is one. */
  requisitionId: string | null;
  /** `ENG-114`, or null when no requisition is linked. */
  reference: string | null;
  location: string | null;
  employmentType: EmploymentType;
  employmentTypeLabel: string;
  status: PostingStatus;
  statusLabel: string;
  live: boolean;
  /** Naira. Null when the advert quotes no band, which is common here. */
  salaryMin: number | null;
  salaryMax: number | null;
  applications: number;
  waiting: number;
  advanced: number;
  declined: number;
  /** True when advancing somebody has a pipeline to put them in. */
  screenable: boolean;
  /** `/careers/{orgSlug}/{slug}` once prefixed — see `careersPath`. */
  publicPath: string;
};

const STATUS_LABEL: Record<PostingStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Live",
  CLOSED: "Closed",
};

/**
 * One advert, plus its screening tally when analytics has been loaded.
 *
 * The tally is optional rather than required because the two arrive from
 * different endpoints and a screen should render the list as soon as the list
 * is in. Absent, the waiting/advanced/declined columns read zero — which is why
 * the screen shows `applications` (which every posting carries) as the headline
 * count and the breakdown as secondary.
 */
export function toRoleRow(
  posting: ApiPosting,
  tally?: ApiPostingTally | undefined,
): RoleRow {
  return {
    postingId: posting.id,
    title: posting.title,
    requisitionId: posting.requisitionId,
    reference: posting.requisitionReference,
    location: posting.location,
    employmentType: posting.employmentType,
    employmentTypeLabel: EMPLOYMENT_TYPE_LABEL[posting.employmentType],
    status: posting.status,
    statusLabel: STATUS_LABEL[posting.status],
    live: posting.status === "PUBLISHED" && posting.acceptingApplications,
    salaryMin: posting.salaryMinKobo === null ? null : naira(posting.salaryMinKobo),
    salaryMax: posting.salaryMaxKobo === null ? null : naira(posting.salaryMaxKobo),
    applications: posting.applicationCount,
    waiting: tally?.waiting ?? 0,
    advanced: tally?.advanced ?? 0,
    declined: tally?.declined ?? 0,
    /* A filled or cancelled requisition refuses an advance, so it is not
       screenable even though a requisition is attached. The API checks this too
       and names the blocker; this is only so the row can warn first. */
    screenable:
      posting.requisitionId !== null &&
      posting.requisitionStatus !== "FILLED" &&
      posting.requisitionStatus !== "CANCELLED",
    publicPath: posting.publicPath,
  };
}

/* ------------------------------------------------------------------ numbers */

/** The overview tiles, and the only figures on `/hiring` that are ever live. */
export type HiringNumbers = {
  adverts: number;
  liveAdverts: number;
  applications: number;
  waiting: number;
  advanced: number;
  declined: number;
  withdrawn: number;
  /**
   * Advanced over *screened*, not over received — the API's definition, kept.
   * Null when nothing has been screened, which is a different fact from 0.
   */
  advanceRate: number | null;
};

export function toNumbers(analytics: ApiCareersAnalytics): HiringNumbers {
  const { totals } = analytics;
  return {
    adverts: totals.postings,
    liveAdverts: totals.live,
    applications: totals.applications,
    waiting: totals.waiting,
    advanced: totals.advanced,
    declined: totals.declined,
    withdrawn: totals.withdrawn,
    advanceRate: totals.advanceRate,
  };
}

/**
 * The screening queue as bars, never as a funnel.
 *
 * `FunnelChart` assumes each value is no larger than the one before it and draws
 * inside a shrinking track; these four are **point-in-time occupancy**, and a
 * fortnight of screening can easily leave more people advanced than waiting. Fed
 * to a funnel the bars overflow their track and the chart reads as broken.
 *
 * `BarChart` is the right instrument for a count of what is where right now. A
 * funnel would be right for conversion measured over one cohort's journey —
 * received → screened → advanced for applications that arrived in July — and
 * this API does not expose the dates that would need.
 */
export function queueBars(numbers: HiringNumbers): { label: string; value: number }[] {
  return [
    { label: "Waiting", value: numbers.waiting },
    { label: "Screened in", value: numbers.advanced },
    { label: "Turned down", value: numbers.declined },
    { label: "Withdrawn", value: numbers.withdrawn },
  ];
}

/* ------------------------------------------------------------------ queue */

/** One person waiting to be screened, flattened for a row. */
export type ScreeningRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  postingId: string;
  postingTitle: string;
  coverNote: string | null;
  /** How they heard about the role. Usually absent. */
  source: string | null;
  /** `YYYY-MM-DD`. */
  appliedOn: string;
  waiting: boolean;
  /** Set once screened in, so a row can point at the pipeline record. */
  candidateId: string | null;
  /** False while no object store is wired, which is every environment today. */
  cvOpenable: boolean;
  cvUrl: string | null;
  /** The API's own sentence about why the CV cannot be opened. */
  cvNote: string | null;
};

export function toScreeningRow(application: ApiApplication): ScreeningRow {
  return {
    id: application.id,
    name: application.name,
    email: application.email,
    phone: application.phone,
    postingId: application.postingId,
    postingTitle: application.postingTitle,
    coverNote: application.coverNote,
    source: application.source,
    appliedOn: application.appliedAt.slice(0, 10),
    waiting: application.status === "RECEIVED",
    candidateId: application.candidateId,
    cvOpenable: application.cv?.url !== null && application.cv !== null,
    cvUrl: application.cv?.url ?? null,
    cvNote: application.cv?.note ?? null,
  };
}

/* ---------------------------------------------------------------- the money */

/**
 * What a screener types when moving somebody into a pipeline.
 *
 * Salaries are **naira** here, because that is what somebody writes in a box.
 * `toAdvanceBody` is the only place they become kobo.
 */
export type ScreenInInput = {
  /** Needed when the advert has no requisition; harmless when it has one. */
  requisitionId?: string;
  /** Defaults to the requisition's first stage when absent. */
  stageId?: string;
  noticeDays?: number;
  currentSalary?: number;
  expectedSalary?: number;
  rightToWork?: boolean;
};

/**
 * Naira in, kobo out.
 *
 * Fields are omitted rather than sent as `undefined`: the API's schema treats an
 * absent screening answer as "not asked yet" and fills the gap on the candidate
 * next time, whereas a present-but-empty value would be a claim that the answer
 * is nothing. Zero is a real answer and survives — only `undefined` is dropped.
 */
export function toAdvanceBody(input: ScreenInInput): AdvanceBody {
  return {
    ...(input.requisitionId ? { requisitionId: input.requisitionId } : {}),
    ...(input.stageId ? { stageId: input.stageId } : {}),
    ...(input.noticeDays === undefined ? {} : { noticeDays: input.noticeDays }),
    ...(input.currentSalary === undefined
      ? {}
      : { currentSalaryKobo: kobo(input.currentSalary) }),
    ...(input.expectedSalary === undefined
      ? {}
      : { expectedSalaryKobo: kobo(input.expectedSalary) }),
    ...(input.rightToWork === undefined ? {} : { rightToWork: input.rightToWork }),
  };
}

/**
 * A role written in the requisition wizard, on its way to becoming an advert.
 *
 * The wizard collects more than an advert can hold — pipeline stages, screening
 * questions, a hiring manager, a note for approvers. Those belong to
 * `Requisition`, which has no route, so they are not sent and the review step
 * says which parts are saved. Inventing a field to put them in would be worse:
 * the advert would carry data nothing reads.
 */
export type AdvertDraft = {
  title: string;
  summary: string;
  description: string;
  location?: string;
  employmentType: EmploymentType;
  /** Naira, as typed. Converted below. */
  salaryMin?: number;
  salaryMax?: number;
  showSalary: boolean;
  requisitionId?: string;
};

export function toAdvertBody(draft: AdvertDraft): CreatePostingBody {
  return {
    title: draft.title,
    summary: draft.summary,
    description: draft.description,
    employmentType: draft.employmentType,
    showSalary: draft.showSalary,
    ...(draft.location ? { location: draft.location } : {}),
    ...(draft.salaryMin === undefined ? {} : { salaryMinKobo: kobo(draft.salaryMin) }),
    ...(draft.salaryMax === undefined ? {} : { salaryMaxKobo: kobo(draft.salaryMax) }),
    ...(draft.requisitionId ? { requisitionId: draft.requisitionId } : {}),
  };
}
