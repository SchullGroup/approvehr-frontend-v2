"use client";

import { request, requestPaged, type Paged } from "@/lib/api/client";
import type { ApiHistoryEvent } from "@/lib/api/application-history";
import type { QuestionKind } from "@/lib/marketing/apply-form";
import type { ApiScoreStatus, ApiScreeningDetail } from "@/lib/api/screening";
import type { ScreeningSummary } from "@/lib/hiring/screening/model";

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
 *    named in the request. `AdvanceBody.requisitionId` is the seam: the screens
 *    ask for it at the moment it is needed rather than failing. A requisition
 *    picker now exists (`recruitmentApi.listRequisitions`, in the sibling
 *    `recruitment.ts`) — `posting-editor.tsx` and `applications-screen.tsx`'s
 *    `AdvanceDialog` both use it — this module just has no reason to import
 *    from `recruitment.ts` itself.
 */

/* ------------------------------------------------------------------- shapes */

/** Mirrors `JobPostingStatus`. */
export type PostingStatus = "DRAFT" | "PUBLISHED" | "CLOSED";

/** Mirrors `JobApplicationStatus`. `WITHDRAWN` is set by nothing in this API yet. */
export type ApplicationStatus =
  "RECEIVED" | "ADVANCED" | "DECLINED" | "WITHDRAWN";

/** Mirrors `EmploymentType`. NYSC is a Nigerian service year placement. */
export type EmploymentType =
  "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN" | "NYSC";

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
  "DRAFT" | "PENDING_APPROVAL" | "OPEN" | "ON_HOLD" | "FILLED" | "CANCELLED";

/**
 * Why a requisition-linked advert cannot take a fresh screen-in right now, or
 * `null` when it still can (including having no requisition at all — that is
 * a different, separately-flagged fact).
 *
 * This is the **one** place this condition is computed. `advance()` on the API
 * refuses a FILLED or CANCELLED requisition outright (`careers/service.ts`),
 * and three screens — the roles overview, the job adverts list, and the
 * applications queue — each used to re-derive their own, narrower version of
 * "is this usable" that checked only whether a requisition was attached at
 * all, so none of them warned about this specific, common case: accepting an
 * offer sets a requisition to FILLED automatically, which means every other
 * still-published advert pointing at it silently becomes a trap the moment a
 * hire completes. Sharing this function is what stops the three screens
 * drifting back into three different answers to the same question.
 */
export function requisitionClosedNote(
  status: RequisitionStatus | null,
): string | null {
  if (status === "FILLED") return "Role filled — cannot take a new candidate";
  if (status === "CANCELLED")
    return "Role cancelled — cannot take a new candidate";
  return null;
}

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
  /**
   * The sanitised rich-text version of `description`, or `null` when it was typed
   * as plain text. Absent from an API that predates rich text.
   */
  descriptionHtml?: string | null;
  /** Whether the work can be done from anywhere. Feeds search-engine data. */
  remote?: boolean;
  /** Bumped whenever the form's questions or switches change. */
  formVersion?: number;
  /** Questions on the form right now. The form itself is `getForm`. */
  questionCount?: number;
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
 * What a list row knows about an attached CV.
 *
 * `key` is only a record that one was attached. A file is opened through the
 * audited route (`careersApi.openCv`), which the API logs, never from a link
 * presigned into a list row — a list of 250 people would otherwise mint 250 live
 * download addresses, and nothing would say who followed which. `url` is
 * therefore always `null` here and is kept only because the wire still names it.
 *
 * The rest says what is worth knowing *before* pressing Open: whether storage can
 * serve a file at all, and what the virus check made of it. Optional, because an
 * API that predates them sends neither.
 */
export type ApiCvAccess = {
  key: string;
  url: string | null;
  expiresAt: string | null;
  note: string | null;
  available?: boolean;
  scanStatus?: ApiCvLink["scanStatus"];
  contentType?: string | null;
  sizeBytes?: number | null;
};

/**
 * What opening one CV answers.
 *
 * `url` is **null** — with `note` saying why in the API's own words — when there
 * is nothing to open: file storage is not set up, or the application names a CV
 * that was never uploaded. That is an answer, not a failure, and the screen shows
 * the note. When there is a file the address is good for about five minutes and
 * names that one file.
 */
export type ApiCvLink = {
  url: string | null;
  expiresAt: string | null;
  /** What the download will be saved as. */
  filename: string;
  contentType: string | null;
  sizeBytes: number | null;
  scanStatus: "NOT_SCANNED" | "PENDING" | "CLEAN" | "INFECTED" | "SCAN_FAILED";
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
  /** What came with the link beyond the channel. */
  utm?: { medium: string | null; campaign: string | null };
  /** What the applicant typed, when the link's channel took precedence in `source`. */
  heardFrom?: string | null;
  /** What the applicant quotes. `null` on an application from before references. */
  reference?: string | null;
  /** Wrong knockout answers. Something to look at, never a rejection. */
  knockoutCount?: number;
  /** Set when an earlier application came from the same email or phone. Not a merge. */
  duplicate?: { ofId: string; reason: string } | null;
  /**
   * Where they stand in screening: a fit score and its status, an assessment
   * score, and whether they are below the pass mark. Advice for a person, never a
   * decision. Absent from an API that predates screening.
   */
  fit?: ScreeningSummary | null;
  /** The fit score, 0 to 100, or `null` when there is none: never 0 for "no score". */
  score?: number | null;
  /** Why there is no score, or `SCORED`. */
  scoreStatus?: ApiScoreStatus;
  /** The assessment result the pass mark reads, as a percentage of its maximum. */
  assessment?: { percent: number } | null;
  /** Below the advert's pass mark and nobody has said to keep them: on the list to confirm. */
  belowCutoff?: boolean;
  /** A person looked and kept them in the running, so the pass mark no longer flags them. */
  keptInRunning?: boolean;
};

/** Everything else this email address has applied for. */
export type ApiOtherApplication = {
  id: string;
  postingTitle: string;
  status: ApplicationStatus;
  appliedAt: string;
};

/** One answer, as the API serialises it. Typed by kind; `display` is the same as text. */
export type ApiAnswer = {
  id: string;
  /** `null` only if the question was ever removed outright. */
  questionId: string | null;
  position: number;
  kind: QuestionKind;
  /** The question as it read when they answered, however it reads now. */
  question: string;
  value: string | number | boolean | { id: string; label: string }[] | null;
  /** The answer as one line of text. */
  display: string;
  flagged: boolean;
  flagReason: string | null;
  /** Never a link. `openPath` is the audited route that returns a short-lived one. */
  file: {
    contentType: string | null;
    sizeBytes: number | null;
    scanStatus: ApiCvLink["scanStatus"];
    openPath: string;
  } | null;
};

export type ApiConsent = {
  noticeRef: string;
  noticeText: string;
  noticeUrl: string | null;
  acceptedAt: string;
  postingId: string;
  postingTitle: string;
};

export type ApiLikelyDuplicate = {
  id: string;
  reference: string | null;
  name: string;
  postingId: string;
  postingTitle: string;
  status: ApplicationStatus;
  appliedAt: string;
  reason: "SAME_EMAIL" | "SAME_PHONE";
};

export type ApiApplicationDetail = ApiApplication & {
  /** Why they have the score they have, or why they have none. Staff only. */
  screening?: ApiScreeningDetail;
  /** The version of the advert's form they were answering. */
  formVersion?: number | null;
  /** What they answered, in the order asked. Absent from an API that predates forms. */
  answers?: ApiAnswer[];
  /** The privacy notice they accepted, exactly as shown. `null` if they did not tick one. */
  consent?: ApiConsent | null;
  /** The confirmation email to the applicant: what happened to it, in words. */
  acknowledgement?: {
    status: string;
    note: string | null;
    sentAt: string | null;
  };
  /** Other applications from the same email or phone. Nothing is merged. */
  likelyDuplicates?: ApiLikelyDuplicate[];
  otherApplications: ApiOtherApplication[];
  /**
   * Every move this application has made, oldest first — its own, plus those of
   * the pipeline record it became. Empty for one that has not moved since the API
   * began keeping it: there is no backfill.
   */
  history?: ApiHistoryEvent[];
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
  /**
   * Allow-list: createdAt | lastName | status | source, and the screening sorts
   * (`fitScore`, `assessment`). `knockoutCount` is for the pipeline's own list. Newest first by default.
   */
  sort?:
    | "createdAt"
    | "lastName"
    | "status"
    | "source"
    | "fitScore"
    | "assessment"
    | "knockoutCount";
  order?: "asc" | "desc";
  status?: ApplicationStatus;
  postingId?: string;
  source?: string;
  /** Every word has to match the first name, last name or email. */
  q?: string;
  /** `YYYY-MM-DD`, inclusive: the first day they could have applied. */
  from?: string;
  /** `YYYY-MM-DD`, inclusive: the last day they could have applied. */
  to?: string;
  /** `true`: only applications with a wrong knockout answer. */
  flagged?: boolean;
  /** `true`: only those marked as a likely duplicate of an earlier one. */
  duplicate?: boolean;
  /** Fit score range, 0 to 100, inclusive. Only people who have a score match. */
  scoreMin?: number;
  scoreMax?: number;
  /** Only people whose score is in this state. */
  scoreStatus?: ApiScoreStatus;
  /**
   * The `meta.nextCursor` of the page before. Opaque — hand back what a
   * response gave, never build one. Only with the default newest-first order,
   * which is the order every screen here uses.
   */
  cursor?: string;
};

/** What a keyset-paged list adds to the usual envelope. */
export type CursorMeta = {
  /** `null` on the last page. */
  nextCursor: string | null;
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
  remote?: boolean;
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
  /**
   * Sent alone, this stores plain text and **clears** any rich-text version — the
   * two can never disagree. So the editor sends it only when the words changed.
   */
  description?: string;
  remote?: boolean;
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

/* --------------------------------------------------------- the form, settings */

/** Mirrors `FieldMode`. */
export type ApiFieldMode = "OFF" | "OPTIONAL" | "REQUIRED";

export type ApiFormQuestion = {
  id: string;
  order: number;
  kind: QuestionKind;
  label: string;
  helpText: string | null;
  required: boolean;
  maxWords: number | null;
  minValue: number | null;
  maxValue: number | null;
  choices: { id: string; label: string }[] | null;
  /** `{ flagWhen: false }`: a "No" raises a flag. `null`: not a knockout. */
  knockout: { flagWhen: boolean } | null;
  /** Where it was copied from, e.g. `requisition:q1`. */
  origin: string | null;
  /** How many applications answered it. Above zero, its kind is fixed. */
  answerCount: number;
};

/** `GET /careers/postings/:id/form` and the answer to every write to it. */
export type ApiForm = {
  postingId: string;
  formVersion: number;
  /** How many applications this advert has taken. */
  applications: number;
  settings: {
    phoneMode: ApiFieldMode;
    cvMode: ApiFieldMode;
    coverNoteMode: ApiFieldMode;
  };
  questions: ApiFormQuestion[];
  limits: {
    maxQuestions: number;
    maxFileQuestions: number;
    maxChoices: number;
    labelChars: number;
    helpTextChars: number;
    choiceLabelChars: number;
    longTextMaxWords: number;
  } & Record<string, number>;
  kinds: { kind: QuestionKind; label: string; hint: string }[];
};

/** One question as the builder sends it. No `id` adds a new one. */
export type PutFormQuestion = {
  id?: string;
  kind: QuestionKind;
  label: string;
  helpText?: string | null;
  required: boolean;
  maxWords?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
  choices?: { id?: string; label: string }[] | null;
  knockout?: { flagWhen: boolean } | null;
};

/** The whole list, in order, and/or the switches. Never a delta. */
export type PutFormBody = {
  settings?: {
    phoneMode?: ApiFieldMode;
    cvMode?: ApiFieldMode;
    coverNoteMode?: ApiFieldMode;
  };
  questions?: PutFormQuestion[];
};

export type ApiShareLink = {
  channel: string;
  label: string;
  /** The advert's address with `?src=<channel>`. This is what goes in a post. */
  url: string;
  /** Where that site's own "share this" opens, with the tracked link in it. */
  shareUrl: string | null;
};

export type ApiShareLinks = {
  postingId: string;
  /** False for a draft or closed advert: the links will not open yet. */
  live: boolean;
  /** The advert's own address, with no tag. */
  page: string;
  links: ApiShareLink[];
};

/** `GET /careers/settings`: how the company presents itself to applicants. */
export type ApiCareersSettings = {
  branding: {
    displayName: string | null;
    /** What the page shows: the display name, else the company's own. */
    name: string;
    companyName: string;
    description: string | null;
    websiteUrl: string | null;
    accentColor: string | null;
    /** The company profile's logo, as a path on the API. Nothing to upload here. */
    logoUrl: string | null;
  };
  contact: { replyToEmail: string | null };
  consent: {
    required: boolean;
    /** The text applicants are shown right now. */
    text: string;
    /** Your own wording, or `null` while the standard wording is in use. */
    customText: string | null;
    url: string | null;
    version: string;
    isDefault: boolean;
    needsReview: boolean;
    reviewNote: string | null;
    standardText: string;
  };
  acknowledgement: {
    enabled: boolean;
    willSend: boolean;
    /** Why no confirmation email would go out right now, in words. */
    blockedBy: string[];
  };
  /**
   * Emails to candidates beyond the acknowledgement: invitations, declines, offer
   * notices and stage messages. Only ever sent because a person asked. Absent from
   * an API that predates them.
   */
  candidateEmails?: {
    enabled: boolean;
    willSend: boolean;
    /** Why none would be sent right now, in words. */
    blockedBy: string[];
  };
  /** Whose name those emails are sent in. Always the registered name, or that name with "Careers". */
  emailSender?: {
    name: string;
    source: "registered_name" | "display_name";
    displayNameAccepted: boolean | null;
    registeredName: string;
    note: string | null;
  };
  /** How long rejected and withdrawn candidates are kept. `months: null` keeps them. */
  retention?: {
    months: number | null;
    setAt: string | null;
    /** Nothing is purged before this day, a week after the period was set. */
    purgeFrom: string | null;
    graceDays: number;
  };
  search: { indexable: boolean };
  deployment: { fileUploads: boolean };
};

export type UpdateCareersSettingsBody = {
  displayName?: string | null;
  description?: string | null;
  websiteUrl?: string | null;
  accentColor?: string | null;
  replyToEmail?: string | null;
  privacyNotice?: string | null;
  privacyNoticeUrl?: string | null;
  consentRequired?: boolean;
  ackEmailEnabled?: boolean;
  searchIndexing?: boolean;
  /** Whether invitations, declines and stage messages may be sent in the company's name. */
  candidateEmailsEnabled?: boolean;
  /** Whole months, 1 to 120. `null` keeps rejected candidates. */
  retentionMonths?: number | null;
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
  from: params.from,
  to: params.to,
  flagged: params.flagged === undefined ? undefined : String(params.flagged),
  duplicate:
    params.duplicate === undefined ? undefined : String(params.duplicate),
  scoreMin: params.scoreMin === undefined ? undefined : String(params.scoreMin),
  scoreMax: params.scoreMax === undefined ? undefined : String(params.scoreMax),
  scoreStatus: params.scoreStatus,
  cursor: params.cursor,
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

  listApplications: (
    params: ApplicationListParams = {},
    signal?: AbortSignal,
  ) =>
    requestPaged<ApiApplication, CursorMeta>("/careers/applications", {
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

  /**
   * The one way to read a CV. Audited: the API records who opened whose, every
   * time. Needs `MANAGE_HIRING` or `APPROVE_HIRING`, like reading the application.
   *
   * A `GET` and never cached (`Cache-Control: no-store`): the address in the
   * answer is a live link to a stranger's file.
   */
  openCv: (id: string, signal?: AbortSignal) =>
    request<ApiCvLink>(`/careers/applications/${id}/cv`, {
      ...(signal ? { signal } : {}),
    }),

  analytics: (signal?: AbortSignal) =>
    request<ApiCareersAnalytics>("/careers/analytics", {
      ...(signal ? { signal } : {}),
    }),

  /** The form as the builder edits it: questions in order, switches, limits. */
  getForm: (postingId: string, signal?: AbortSignal) =>
    request<ApiForm>(`/careers/postings/${postingId}/form`, {
      ...(signal ? { signal } : {}),
    }),

  /**
   * Replace the form. Whole list, never a delta; the answer is the form as it now
   * stands, with the ids the API gave any new question. A refusal is a 400 whose
   * `details[].field` is `questions.<n>.<name>`, the position in the list sent.
   */
  putForm: (postingId: string, body: PutFormBody) =>
    request<ApiForm>(`/careers/postings/${postingId}/form`, {
      method: "PUT",
      body,
    }),

  /** One link per place it will be posted. `channel` adds one more by name. */
  shareLinks: (postingId: string, channel?: string, signal?: AbortSignal) =>
    request<ApiShareLinks>(`/careers/postings/${postingId}/share-links`, {
      ...(channel ? { query: { channel } } : {}),
      ...(signal ? { signal } : {}),
    }),

  getSettings: (signal?: AbortSignal) =>
    request<ApiCareersSettings>("/careers/settings", {
      ...(signal ? { signal } : {}),
    }),

  updateSettings: (body: UpdateCareersSettingsBody) =>
    request<ApiCareersSettings>("/careers/settings", {
      method: "PATCH",
      body,
    }),

  /**
   * Open a file an applicant attached as the answer to a question. The CV's twin:
   * audited every time, a link good for five minutes, never cached.
   */
  openAnswerFile: (
    applicationId: string,
    answerId: string,
    signal?: AbortSignal,
  ) =>
    request<ApiCvLink>(
      `/careers/applications/${applicationId}/answers/${answerId}/file`,
      { ...(signal ? { signal } : {}) },
    ),
};

export type PagedPostings = Paged<ApiPosting>;
export type PagedApplications = Paged<ApiApplication, CursorMeta>;

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
export const careersPath = (publicPath: string): string =>
  `/careers${publicPath}`;

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
  const configured = process.env["NEXT_PUBLIC_SITE_URL"]
    ?.trim()
    .replace(/\/$/, "");
  const origin =
    configured || (typeof window === "undefined" ? "" : window.location.origin);
  return `${origin}${careersPath(publicPath)}`;
}
