"use client";

import {
  EMPLOYMENT_TYPE_LABEL,
  kobo,
  naira,
  type AdvanceBody,
  type ApiApplication,
  type ApiApplicationDetail,
  type ApiCareersAnalytics,
  type ApiPosting,
  type ApiPostingTally,
  type ApplicationStatus,
  type CreatePostingBody,
  type EmploymentType,
  type PostingStatus,
} from "@/lib/api/careers";
import type { ApiGrade } from "@/lib/api/grades";
import type { Band } from "@/lib/grades/band";

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

/* --------------------------------------------------------------- applicants */

/**
 * Everything else one email address has applied for.
 *
 * Three applications for three roles is a keen candidate; three for the same
 * role is a form being hammered. The API draws the distinction by returning the
 * list, and the difference is the whole reason it is on screen.
 */
export type OtherApplicationRow = {
  id: string;
  postingTitle: string;
  statusLabel: string;
  /** `YYYY-MM-DD`. */
  appliedOn: string;
};

/**
 * One person, as the candidate page can actually know them.
 *
 * This is the **live** half of a candidate record: who applied, for what,
 * through which advert, and what a screener has done about it. It is not the
 * pipeline record — no interviews, no scorecards, no stage — because
 * `Interview`, `Scorecard` and the pipeline `Application` have no route. The
 * screen renders this half live and the pipeline half from the seed, and badges
 * each one, rather than blending the two into a page that cannot say where any
 * given line came from.
 */
export type ApplicantRecord = {
  /** The `JobApplication` id. The only applicant id this API resolves. */
  applicationId: string;
  /** The pipeline candidate, once screened in. Null while still waiting. */
  candidateId: string | null;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string | null;
  postingId: string;
  postingTitle: string;
  coverNote: string | null;
  /** How they heard about the role. Free text, and usually absent. */
  source: string | null;
  /** `YYYY-MM-DD`. */
  appliedOn: string;
  status: ApplicationStatus;
  statusLabel: string;
  waiting: boolean;
  /** `YYYY-MM-DD`, once somebody has looked. */
  screenedOn: string | null;
  declineReason: string | null;
  cvUrl: string | null;
  /** The API's own sentence about why the CV cannot be opened. */
  cvNote: string | null;
  otherApplications: OtherApplicationRow[];
};

/**
 * What each status is called on screen.
 *
 * Sentences rather than the wire's verbs, because a person reads "waiting on a
 * first look" and knows whose move it is. `RECEIVED` in particular is a claim
 * about the company, not the candidate.
 */
export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  RECEIVED: "Waiting on a first look",
  ADVANCED: "Screened in",
  DECLINED: "Turned down",
  WITHDRAWN: "Withdrew",
};

export const APPLICATION_STATUS_TONE: Record<
  ApplicationStatus,
  "warning" | "success" | "danger" | "neutral"
> = {
  RECEIVED: "warning",
  ADVANCED: "success",
  DECLINED: "danger",
  WITHDRAWN: "neutral",
};

export function toApplicantRecord(detail: ApiApplicationDetail): ApplicantRecord {
  return {
    applicationId: detail.id,
    candidateId: detail.candidateId,
    firstName: detail.firstName,
    lastName: detail.lastName,
    name: detail.name,
    email: detail.email,
    phone: detail.phone,
    postingId: detail.postingId,
    postingTitle: detail.postingTitle,
    coverNote: detail.coverNote,
    source: detail.source,
    appliedOn: detail.appliedAt.slice(0, 10),
    status: detail.status,
    statusLabel: APPLICATION_STATUS_LABEL[detail.status],
    waiting: detail.status === "RECEIVED",
    screenedOn: detail.screenedAt === null ? null : detail.screenedAt.slice(0, 10),
    declineReason: detail.declineReason,
    cvUrl: detail.cv?.url ?? null,
    cvNote: detail.cv?.note ?? null,
    otherApplications: detail.otherApplications.map((entry) => ({
      id: entry.id,
      postingTitle: entry.postingTitle,
      statusLabel: APPLICATION_STATUS_LABEL[entry.status],
      appliedOn: entry.appliedAt.slice(0, 10),
    })),
  };
}

/**
 * A list row, widened to a detail so one projection serves both.
 *
 * `GET /careers/applications` and `GET /careers/applications/:id` differ by
 * exactly one field. Rather than a second projection that could drift from the
 * first, the list row is widened with an empty `otherApplications` and passed
 * through `toApplicantRecord`. The screen therefore renders the moment the list
 * is in and gains the cross-application history a beat later, instead of
 * holding a blank page until two requests have both landed.
 */
export function toApplicantRecordFromRow(row: ApiApplication): ApplicantRecord {
  return toApplicantRecord({ ...row, otherApplications: [] });
}

/* -------------------------------------------------------- offers and bands */

/**
 * A real salary band to place an offer against.
 *
 * `band` is integer kobo because that is what `/grades` speaks and what
 * `<BandPosition />` draws; `offerKobo` is the offer converted **here**, at this
 * edge, because the seeded offer figures are naira. Nothing on the offers screen
 * multiplies by 100.
 */
export type OfferBand = {
  band: Band;
  /** "G4 Senior", or whatever names the grade. */
  label: string;
  offerKobo: number;
};

/**
 * Which grade an offer belongs to.
 *
 * The requisition's own `salaryMin`/`salaryMax` are a *seeded* pair with nothing
 * behind them, and drawing a meter against them is drawing a meter against
 * nothing — the figure moves, the band moves with it, and the picture can never
 * say "this is above what we pay for this work". So the band comes from the
 * grade ladder, which is live whenever the API is up.
 *
 * The grade containing the figure wins. When none does — which is the case worth
 * seeing, an offer above the top of the ladder or below the bottom — the nearest
 * band by midpoint is returned instead, and `<BandPosition />` draws the marker
 * outside the track and says how far out it is. Returning null there would hide
 * the one offer an approver has to think about.
 */
export function offerBand(
  grades: readonly ApiGrade[],
  /** Gross monthly, in naira, as the offer quotes it. */
  grossMonthly: number,
): OfferBand | null {
  if (grades.length === 0) return null;
  const offerKobo = kobo(grossMonthly);

  const label = (grade: ApiGrade) => `${grade.code} ${grade.name}`;
  const band = (grade: ApiGrade): Band => ({
    minGrossKobo: grade.minGrossKobo,
    midGrossKobo: grade.midGrossKobo,
    maxGrossKobo: grade.maxGrossKobo,
  });

  const inside = grades.find(
    (grade) =>
      offerKobo >= grade.minGrossKobo && offerKobo <= grade.maxGrossKobo,
  );
  if (inside) return { band: band(inside), label: label(inside), offerKobo };

  const nearest = [...grades].sort(
    (a, b) =>
      Math.abs(a.midGrossKobo - offerKobo) - Math.abs(b.midGrossKobo - offerKobo),
  )[0];
  if (!nearest) return null;
  return { band: band(nearest), label: label(nearest), offerKobo };
}
