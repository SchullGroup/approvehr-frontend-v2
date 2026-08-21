"use client";

import { request, requestPaged, type Paged } from "@/lib/api/client";

/**
 * KPIs, appraisals and skills — `/api/v1/performance`.
 *
 * Typed wrappers only, hand-written in the same style as `endpoints.ts`,
 * `grades.ts` and `loans.ts`. No React, no state: this file knows the shape of
 * the wire and nothing else.
 *
 * ## There is no money in this module, and that is deliberate
 *
 * Every other API module here converts integer kobo to naira at this boundary.
 * This one has **no kobo field at all** — a key result is a `Decimal(18,4)`
 * with a free-text unit, because the thing being measured is "customers",
 * "days to hire", "%" and sometimes "₦". So the values cross the wire as
 * **strings** and stay strings, and nothing in this file or in
 * `store/performance.ts` divides or multiplies by 100.
 *
 * Strings rather than numbers is the backend's decision and it is right:
 * fourteen digits before the point does not survive a round trip through a JS
 * number, and a target of 1,000,000,000,000.0001 quietly becoming …0000 is the
 * class of silent wrongness this codebase exists to refuse. If a screen needs
 * to *display* one it formats the string; if it needs to *edit* one it edits
 * the string. `parseMeasure` below is for comparison and width arithmetic only,
 * never for anything that gets stored.
 *
 * ## `percent` comes from the API. Never recompute it
 *
 * `ApiKeyResult.percent` already honours `lowerIsBetter` — a cost-reduction
 * target progresses as the number *falls*, and the arithmetic for that lives in
 * `keyResultPercent` in the service with tests pinning it down. A screen that
 * computes `current / target` gets every reduction goal in the company wrong,
 * which is the easy bug in this feature. Read `percent`, read `met`, and read
 * `measuredProgress` on the goal.
 *
 * ## One list, narrowed by who asks
 *
 * `GET /goals`, `/goals/mine` and `/goals/team` all answer with the same
 * `ApiGoal`. They differ only in scope, and none of them takes an `ownerId`
 * naming somebody else — that is the whole reason the scoped routes exist:
 *
 * | | Scope | Gate |
 * |---|---|---|
 * | `goals` | company goals, mine, my reports' — widened by `EDIT_RECORDS` | none |
 * | `mine` | the caller's own | none |
 * | `team` | direct reports' | **refuses with 403 when nobody reports to you** |
 *
 * That 403 on `/goals/team` is not an error to swallow: the message says "Nobody
 * reports to you yet", and a screen should ask `useIsManager()` before calling
 * it rather than showing a failure to a person who simply has no team.
 *
 * ## Peer feedback carries no author, at any layer
 *
 * `ApiReview.authorId` and `authorName` are `null` whenever `anonymous` is true,
 * and the aggregate in `ApiMyReviews.peerFeedback` has no author field to be
 * null. Nothing here filters a name out — the API never sends one. A screen must
 * not add a "who wrote this" column and hope.
 */

/* ------------------------------------------------------------------- shapes */

/** Mirrors `GoalStatus`. There is no draft and no cancelled — see the notes. */
export type GoalStatus = "ON_TRACK" | "AT_RISK" | "OFF_TRACK" | "DONE";

/** Mirrors `ReviewCycleStage`. Forward only, and `PUBLISHED` is one-way. */
export type ReviewCycleStage =
  | "DRAFT"
  | "SELF"
  | "MANAGER"
  | "CALIBRATION"
  | "PUBLISHED";

export type ReviewKind = "SELF" | "MANAGER" | "PEER";

/** `REPORT` exists in the enum and no `ReviewKind` reaches it. Handle it anyway. */
export type ReviewAudience = "SELF" | "MANAGER" | "PEER" | "REPORT";

export type ReviewQuestionKind = "RATING" | "TEXT" | "CHOICE" | "BOOLEAN";

/**
 * One measured number on a goal.
 *
 * `startValue`, `targetValue` and `currentValue` are decimal **strings**. See
 * the header. `percent` and `met` are direction-aware and already computed.
 */
export type ApiKeyResult = {
  id: string;
  goalId: string;
  label: string;
  /** "₦", "%", "customers". Free text: every company invents its own. */
  unit: string | null;
  startValue: string;
  targetValue: string;
  currentValue: string;
  /** True when success means the number going down. */
  lowerIsBetter: boolean;
  /** 0–100, honouring `lowerIsBetter`. Read this; do not derive it. */
  percent: number;
  met: boolean;
  updatedAt: string;
};

export type ApiGoal = {
  id: string;
  title: string;
  description: string | null;
  ownerId: string | null;
  ownerName: string | null;
  /** No owner means a company goal: everybody can see it. */
  companyWide: boolean;
  parentId: string | null;
  parentTitle: string | null;
  status: GoalStatus;
  /** The stored figure. Equal to `measuredProgress` whenever there are measures. */
  progress: number;
  /** From the measures. Null when the goal has none and progress is by hand. */
  measuredProgress: number | null;
  dueQuarter: string | null;
  keyResults: ApiKeyResult[];
  childCount: number;
  createdAt: string;
  updatedAt: string;
};

/** `POST /goals/:id/publish`. `shared` is how many people were told. */
export type ApiGoalShared = ApiGoal & { shared: number };

/** `POST /goals/:id/complete`. Done is a judgement; the measures may disagree. */
export type ApiGoalCompleted = ApiGoal & {
  completed: true;
  measuresShortOfTarget: number;
};

/**
 * `POST /goals/:id/cancel`.
 *
 * `GoalStatus` has no `CANCELLED`, so the goal comes back as `OFF_TRACK` and
 * `note` says so. Do not render a "Cancelled" badge off the back of this.
 */
export type ApiGoalCancelled = ApiGoal & {
  cancelled: true;
  reason: string;
  note: string;
};

/** Every key-result write returns the goal's recomputed progress beside it. */
export type ApiKeyResultWritten = ApiKeyResult & {
  /** Null only when the goal somehow has no measures left. */
  goalProgress: number | null;
};

export type ApiCompetency = {
  id: string;
  name: string;
  /** "Core competency", "Behavioural competency", "Key result area", "Leadership". */
  category: string | null;
  description: string | null;
  /** Expected of everybody, as against role-specific. */
  isCore: boolean;
  /** The ceiling of the scale. A level means nothing without it. */
  scaleMax: number;
  active: boolean;
  archived: boolean;
  ratingCount: number;
};

/**
 * One line of somebody's framework.
 *
 * `level: null` means **never assessed**, which is a different fact from a low
 * score and must not render as zero. `gap` is null until there is both a level
 * and a target.
 */
export type ApiCompetencyRow = {
  competencyId: string;
  name: string;
  category: string | null;
  isCore: boolean;
  scaleMax: number;
  level: number | null;
  target: number | null;
  gap: number | null;
  note: string | null;
  ratedAt: string | null;
};

export type ApiEmployeeCompetencies = {
  employeeId: string;
  employeeName: string;
  rows: ApiCompetencyRow[];
  summary: { total: number; rated: number; gaps: number };
};

/** A gap is arithmetic: `target - level`, latest rating only. */
export type ApiGap = {
  employeeId: string;
  employeeName: string;
  departmentId: string | null;
  competencyId: string;
  competencyName: string;
  category: string | null;
  isCore: boolean;
  level: number;
  target: number;
  scaleMax: number;
  gap: number;
  ratedAt: string;
};

/**
 * Average level per competency per department.
 *
 * `average: null` means nobody in that department has been rated on that
 * competency — again not zero. `rated` is how many ratings the average is over,
 * and a grid that hides it invites somebody to trust a mean of one.
 */
export type ApiHeatmapCell = {
  competencyId: string;
  average: number | null;
  rated: number;
  belowTarget: number;
};

export type ApiHeatmapRow = {
  departmentId: string | null;
  departmentName: string;
  ratedPeople: number;
  cells: ApiHeatmapCell[];
};

export type ApiHeatmap = {
  competencies: {
    id: string;
    name: string;
    scaleMax: number;
    isCore: boolean;
  }[];
  rows: ApiHeatmapRow[];
  ratedPeople: number;
};

export type ApiRating = {
  id: string;
  competencyId: string;
  employeeId: string;
  level: number;
  target: number | null;
  note: string | null;
  createdAt: string;
};

export type ApiCycle = {
  id: string;
  name: string;
  stage: ReviewCycleStage;
  /** The API's own wording for the stage. Use it rather than a second copy. */
  stageLabel: string;
  dueDate: string | null;
  questionCount: number;
  reviewCount: number;
  createdAt: string;
};

export type ApiCycleActivated = ApiCycle & {
  reviewsCreated: number;
  participants: number;
  /** How many people were told in the app. Not an email count — see the store. */
  notified: number;
  /**
   * Anybody the cycle started without an appraiser, by name.
   *
   * Starting a cycle fills in the obvious mapping — one line manager each — so
   * this is the people who have no manager either. They will finish the cycle
   * with no mark unless somebody is assigned, which is why it is a name list and
   * not a count.
   */
  withoutAppraiser: string[];
};

export type ApiCyclePublished = ApiCycle & {
  published: true;
  submitted: number;
  /** Reported, never refused: people leave mid-cycle. */
  unsubmitted: number;
  notified: number;
};

export type ApiRemindResult = {
  cycleId: string;
  outstanding: number;
  reminded: number;
  /** People with no sign-in cannot be chased in the app. Say so. */
  noAccount: number;
};

/** One person's row in a cycle. Peer forms are counted, never named. */
export type ApiParticipant = {
  employeeId: string;
  employeeName: string;
  departmentId: string | null;
  self: { reviewId: string; submitted: boolean } | null;
  manager: {
    reviewId: string;
    submitted: boolean;
    managerName: string;
    rating: number | null;
  } | null;
  peers: { asked: number; answered: number };
};

export type ApiCycleParticipants = {
  cycleId: string;
  cycleName: string;
  stage: ReviewCycleStage;
  rows: ApiParticipant[];
  counts: { people: number; selfDone: number; managerDone: number };
};

export type ApiQuestion = {
  id: string;
  reviewCycleId: string;
  prompt: string;
  kind: ReviewQuestionKind;
  /** Empty means everybody. */
  askedOf: ReviewAudience[];
  required: boolean;
  options: string[];
  order: number;
};

export type ApiAnswer = {
  ratingValue: number | null;
  textValue: string | null;
  choiceValue: string | null;
  boolValue: boolean | null;
  answeredAt: string;
};

export type ApiReview = {
  id: string;
  cycleId: string;
  cycleName: string;
  cycleStage: ReviewCycleStage;
  dueDate: string | null;
  kind: ReviewKind;
  /** The API's wording: "Self-review", "Manager review", "Peer feedback". */
  kindLabel: string;
  /** True for peer feedback. No author is returned, to anybody. */
  anonymous: boolean;
  subjectId: string;
  subjectName: string;
  authorId: string | null;
  authorName: string | null;
  rating: number | null;
  summary: string | null;
  submitted: boolean;
  submittedAt: string | null;
  answerCount: number;
};

export type ApiFormQuestion = {
  id: string;
  prompt: string;
  kind: ReviewQuestionKind;
  required: boolean;
  options: string[];
  order: number;
  answer: ApiAnswer | null;
};

export type ApiReviewDetail = ApiReview & {
  /** Whether *this* caller is the one who has to fill it in. */
  mine: boolean;
  /**
   * What the author is to the subject, on a manager form.
   *
   * **Absent when there is no appraiser assignment** — not a role of "line
   * manager" and not a weight of 0. A manager review written before the mapping
   * existed has no answer to this question, and rendering "0% of the mark" would
   * be a wrong claim rather than a blank. Check for the key, not for a value.
   */
  appraiser?: ApiAppraiserContext;
  questions: ApiFormQuestion[];
  /** Prompts, not ids: a refusal that names the questions is a refusal you can act on. */
  outstanding: string[];
};

/* -------------------------------------------------- multi-appraiser mapping */

/** Mirrors `AppraiserRole`. */
export type AppraiserRole =
  | "LINE_MANAGER"
  | "FUNCTIONAL_MANAGER"
  | "PROJECT_LEAD"
  | "SKIP_LEVEL";

export type ApiAppraiserContext = {
  role: AppraiserRole;
  /** The API's wording. Do not keep a second copy of these labels. */
  roleLabel: string;
  /** Basis points. 10000 is the whole mark. Never a float. */
  weightBp: number;
  note: string | null;
  /** How many appraisers this person has, so "30%" reads as a share of what. */
  appraiserCount: number;
};

export type ApiAppraiser = {
  assignmentId: string;
  appraiserId: string;
  appraiserName: string;
  jobTitle: string;
  role: AppraiserRole;
  roleLabel: string;
  weightBp: number;
  note: string | null;
  /** Null until the cycle has started and the form exists. */
  reviewId: string | null;
  submitted: boolean;
  rating: number | null;
  /** Archived or exited: their share of the mark can never be filled in. */
  unavailable: boolean;
};

/**
 * Exceptions, in the same shape the payroll run uses for blockers.
 *
 * That is deliberate, not a coincidence of naming. An employee with no appraiser
 * in an open cycle is the performance module's missing bank account: everything
 * looks finished and one person silently got nothing.
 */
export type ApiAppraiserException = {
  severity: "BLOCKER" | "WARNING";
  code:
    | "NO_APPRAISER"
    | "WEIGHTS_NOT_WHOLE"
    | "APPRAISER_UNAVAILABLE"
    | "NO_LINE_MANAGER";
  message: string;
};

export type ApiAppraiserMapRow = {
  employeeId: string;
  employeeName: string;
  jobTitle: string;
  departmentId: string | null;
  departmentName: string | null;
  /** Their reporting line, so the screen can offer the obvious appraiser. */
  lineManagerId: string | null;
  lineManagerName: string | null;
  appraisers: ApiAppraiser[];
  totalWeightBp: number;
  /** How much of the weight has actually answered. */
  submittedWeightBp: number;
  /**
   * The weighted mark over **submitted** weight, or null when nothing is in.
   *
   * Not a share of the whole: dividing by 10000 mid-cycle halves everybody's
   * mark and reads as a company-wide collapse. Show it beside
   * `submittedWeightBp` so a reader can see how much of the mark it is.
   */
  weightedRating: number | null;
  exceptions: ApiAppraiserException[];
};

export type ApiAppraiserMap = {
  cycleId: string;
  cycleName: string;
  stage: ReviewCycleStage;
  /** False for a draft, where nothing is wrong yet. */
  started: boolean;
  rows: ApiAppraiserMapRow[];
  counts: {
    people: number;
    /** Exactly one line manager at 100% — the shape nobody had to configure. */
    simple: number;
    multiAppraiser: number;
    unassigned: number;
    blockers: number;
    warnings: number;
  };
};

export type ApiAppraiserEntry = {
  appraiserId: string;
  role: AppraiserRole;
  weightBp: number;
  note?: string;
};

export type ApiAppraisersSet = {
  subjectId: string;
  row: ApiAppraiserMapRow | null;
  formsCreated: number;
  removed: number;
};

export type ApiAutoAssigned = {
  cycleId: string;
  created: number;
  /** Named, never counted: these are the people who would get no mark. */
  withoutManager: string[];
};

/**
 * Everything peers said, with nobody's name on it.
 *
 * `withheld: true` with an empty `answers` means fewer people have answered than
 * the floor, and `note` carries the only sentence worth showing for it. Below
 * the floor there is nothing to render but that line.
 */
export type ApiPeerFeedback = {
  cycleId: string;
  cycleName: string;
  responses: number;
  withheld: boolean;
  note: string | null;
  answers: {
    questionId: string;
    prompt: string;
    kind: ReviewQuestionKind;
    averageRating: number | null;
    texts: string[];
    choices: string[];
    yeses: number;
    answered: number;
  }[];
};

export type ApiMyReviews = {
  /** Forms this person owes. Their own self-review, and one per direct report. */
  toComplete: ApiReview[];
  /** What was said about them: their self-review, and the manager's once published. */
  aboutMe: ApiReview[];
  peerFeedback: ApiPeerFeedback[];
};

/* -------------------------------------------------------------------- bodies */

export type GoalListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  sort?: "title" | "progress" | "status" | "dueQuarter" | "createdAt" | "updatedAt";
  order?: "asc" | "desc";
  status?: GoalStatus;
  parentId?: string;
  dueQuarter?: string;
  /** Only goals with no owner — the company-level ladder. */
  companyOnly?: boolean;
};

export type CreateGoalBody = {
  title: string;
  description?: string;
  /**
   * Absent means mine. Explicit `null` means a company goal with no owner,
   * which the API gates on `EDIT_RECORDS` because everybody can then read it.
   */
  ownerId?: string | null;
  parentId?: string;
  /** `2026-Q1`. A quarter, not a date. */
  dueQuarter?: string;
  status?: GoalStatus;
};

export type UpdateGoalBody = {
  title?: string;
  description?: string | null;
  ownerId?: string | null;
  parentId?: string | null;
  dueQuarter?: string | null;
  status?: GoalStatus;
  /** Only honoured while the goal has no key results. */
  progress?: number;
};

export type CreateKeyResultBody = {
  label: string;
  unit?: string;
  /** Decimal strings. See the header on why these are not numbers. */
  startValue?: string;
  targetValue: string;
  currentValue?: string;
  lowerIsBetter?: boolean;
};

export type UpdateKeyResultBody = {
  label?: string;
  unit?: string | null;
  startValue?: string;
  targetValue?: string;
  currentValue?: string;
  lowerIsBetter?: boolean;
};

export type CompetencyListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  category?: string;
  isCore?: boolean;
  includeArchived?: boolean;
};

export type GapListParams = {
  page?: number;
  pageSize?: number;
  departmentId?: string;
  employeeId?: string;
};

export type RateBody = {
  employeeId: string;
  level: number;
  /** Where the company wants them, so a gap is arithmetic rather than opinion. */
  target?: number;
  reviewCycleId?: string;
  note?: string;
};

export type CycleListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  /** The API refuses anything outside its own allow-list, so this is it. */
  sort?: "name" | "createdAt" | "dueDate";
  order?: "asc" | "desc";
  stage?: ReviewCycleStage;
};

export type CreateQuestionBody = {
  prompt: string;
  kind?: ReviewQuestionKind;
  /** Empty or absent means everybody. */
  askedOf?: ReviewAudience[];
  required?: boolean;
  /** Only a CHOICE question may carry these, and it needs at least two. */
  options?: string[];
};

export type AnswerBody = {
  questionId: string;
  ratingValue?: number;
  textValue?: string;
  choiceValue?: string;
  boolValue?: boolean;
};

export type SubmitReviewBody = { rating?: number; summary?: string };

export type ApiRespondResult = {
  reviewId: string;
  saved: number;
  anonymous: boolean;
  outstanding: string[];
};

/* -------------------------------------------------------------------- calls */

/** Drops absent keys and stringifies the booleans the API reads as `"true"`. */
function listQuery(
  params: Record<string, string | number | boolean | undefined>,
): Record<string, string | number> {
  const query: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    query[key] = typeof value === "boolean" ? String(value) : value;
  }
  return query;
}

const signalOf = (signal?: AbortSignal) => (signal ? { signal } : {});

export const performanceApi = {
  /* ------------------------------------------------------------------ goals */

  /** Company goals, mine, and my reports'. Widened by `EDIT_RECORDS`. */
  goals: (params: GoalListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiGoal>("/performance/goals", {
      query: listQuery(params),
      ...signalOf(signal),
    }),

  myGoals: (params: GoalListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiGoal>("/performance/goals/mine", {
      query: listQuery(params),
      ...signalOf(signal),
    }),

  /** **403 when nobody reports to you.** Ask `useIsManager()` first. */
  teamGoals: (params: GoalListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiGoal>("/performance/goals/team", {
      query: listQuery(params),
      ...signalOf(signal),
    }),

  goal: (id: string, signal?: AbortSignal) =>
    request<ApiGoal>(`/performance/goals/${id}`, signalOf(signal)),

  createGoal: (body: CreateGoalBody) =>
    request<ApiGoal>("/performance/goals", { method: "POST", body }),

  updateGoal: (id: string, body: UpdateGoalBody) =>
    request<ApiGoal>(`/performance/goals/${id}`, { method: "PATCH", body }),

  deleteGoal: (id: string) =>
    request<{ id: string; deleted: boolean; measuresRemoved: number }>(
      `/performance/goals/${id}`,
      { method: "DELETE" },
    ),

  /**
   * Tell the people it affects.
   *
   * Refused without a quarter and at least one measure, naming both. Changes no
   * status — the response says `shared`, not published.
   */
  shareGoal: (id: string) =>
    request<ApiGoalShared>(`/performance/goals/${id}/publish`, { method: "POST" }),

  completeGoal: (id: string, note?: string) =>
    request<ApiGoalCompleted>(`/performance/goals/${id}/complete`, {
      method: "POST",
      body: note === undefined ? {} : { note },
    }),

  /** The reason is required: it is the only record that this was stopped. */
  cancelGoal: (id: string, reason: string) =>
    request<ApiGoalCancelled>(`/performance/goals/${id}/cancel`, {
      method: "POST",
      body: { reason },
    }),

  addKeyResult: (goalId: string, body: CreateKeyResultBody) =>
    request<ApiKeyResultWritten>(`/performance/goals/${goalId}/key-results`, {
      method: "POST",
      body,
    }),

  updateKeyResult: (id: string, body: UpdateKeyResultBody) =>
    request<ApiKeyResultWritten>(`/performance/key-results/${id}`, {
      method: "PATCH",
      body,
    }),

  /** The everyday write: a new reading on one measure. */
  recordProgress: (id: string, currentValue: string, note?: string) =>
    request<ApiKeyResultWritten & { met: boolean }>(
      `/performance/key-results/${id}/progress`,
      {
        method: "POST",
        body: note === undefined ? { currentValue } : { currentValue, note },
      },
    ),

  /* ----------------------------------------------------------- competencies */

  competencies: (params: CompetencyListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiCompetency>("/performance/competencies", {
      query: listQuery(params),
      ...signalOf(signal),
    }),

  /** Scoped by who asks: the company, your reports, or just you. */
  gaps: (params: GapListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiGap>("/performance/competencies/gaps", {
      query: listQuery(params),
      ...signalOf(signal),
    }),

  /** An aggregate over everybody, so it needs `EDIT_RECORDS`. */
  heatmap: (signal?: AbortSignal) =>
    request<ApiHeatmap>("/performance/competencies/heatmap", signalOf(signal)),

  /** Self, direct report, or `EDIT_RECORDS`. Checked in the service. */
  employeeCompetencies: (employeeId: string, signal?: AbortSignal) =>
    request<ApiEmployeeCompetencies>(
      `/performance/employees/${employeeId}/competencies`,
      signalOf(signal),
    ),

  /** Refuses a self-rating outright: an assessment is somebody else's or nothing. */
  rate: (competencyId: string, body: RateBody) =>
    request<ApiRating>(`/performance/competencies/${competencyId}/rate`, {
      method: "POST",
      body,
    }),

  /* ----------------------------------------------------------------- cycles */

  cycles: (params: CycleListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiCycle>("/performance/cycles", {
      query: listQuery(params),
      ...signalOf(signal),
    }),

  cycle: (id: string, signal?: AbortSignal) =>
    request<ApiCycle>(`/performance/cycles/${id}`, signalOf(signal)),

  createCycle: (body: { name: string; dueDate?: string }) =>
    request<ApiCycle>("/performance/cycles", { method: "POST", body }),

  /** Refused without at least one question. Creates every review in one go. */
  activateCycle: (id: string) =>
    request<ApiCycleActivated>(`/performance/cycles/${id}/activate`, {
      method: "POST",
    }),

  /** One-way. Everybody's manager review becomes readable by its subject. */
  closeCycle: (id: string) =>
    request<ApiCyclePublished>(`/performance/cycles/${id}/close`, { method: "POST" }),

  /** Notifications inside the app, not email. See the note in the store. */
  remindCycle: (id: string) =>
    request<ApiRemindResult>(`/performance/cycles/${id}/remind`, { method: "POST" }),

  participants: (id: string, signal?: AbortSignal) =>
    request<ApiCycleParticipants>(
      `/performance/cycles/${id}/participants`,
      signalOf(signal),
    ),

  /* ------------------------------------------------------ appraiser mapping */

  /** The whole map for a cycle. `EDIT_RECORDS` — an aggregate over everybody. */
  appraiserMap: (
    cycleId: string,
    params: { departmentId?: string; teamId?: string; exceptionsOnly?: boolean } = {},
    signal?: AbortSignal,
  ) =>
    request<ApiAppraiserMap>(`/performance/cycles/${cycleId}/appraisers`, {
      query: {
        departmentId: params.departmentId,
        teamId: params.teamId,
        exceptionsOnly: params.exceptionsOnly ? "true" : undefined,
      },
      ...signalOf(signal),
    }),

  /** One person's appraisers. The subject, their manager, or an appraiser. */
  appraisersOf: (cycleId: string, employeeId: string, signal?: AbortSignal) =>
    request<ApiAppraiserMapRow & { cycleId: string; cycleName: string }>(
      `/performance/cycles/${cycleId}/appraisers/${employeeId}`,
      signalOf(signal),
    ),

  /**
   * The **whole** set for one person, replaced.
   *
   * `PUT` and the whole set, because that is the only shape in which "the
   * weights make 100%" is a rule the API can check. An empty array clears the
   * mapping and the cycle then reports it as a blocker — somebody having no
   * appraiser is a fact about the company, not a malformed request.
   */
  setAppraisers: (
    cycleId: string,
    employeeId: string,
    appraisers: ApiAppraiserEntry[],
  ) =>
    request<ApiAppraisersSet>(
      `/performance/cycles/${cycleId}/appraisers/${employeeId}`,
      { method: "PUT", body: { appraisers } },
    ),

  /** Fill in the obvious mapping for anybody who has none. Idempotent. */
  autoAssignAppraisers: (cycleId: string) =>
    request<ApiAutoAssigned>(`/performance/cycles/${cycleId}/appraisers/auto`, {
      method: "POST",
    }),

  /** A manager or `EDIT_RECORDS`: nobody else knows who a person's peers are. */
  askPeers: (cycleId: string, subjectId: string, peerIds: string[]) =>
    request<{ subjectId: string; asked: number; notified: number }>(
      `/performance/cycles/${cycleId}/peer-reviews`,
      { method: "POST", body: { subjectId, peerIds } },
    ),

  /* -------------------------------------------------------------- questions */

  questions: (cycleId: string, signal?: AbortSignal) =>
    request<ApiQuestion[]>(
      `/performance/cycles/${cycleId}/questions`,
      signalOf(signal),
    ),

  addQuestion: (cycleId: string, body: CreateQuestionBody) =>
    request<ApiQuestion>(`/performance/cycles/${cycleId}/questions`, {
      method: "POST",
      body,
    }),

  removeQuestion: (id: string) =>
    request<{ id: string; deleted: boolean }>(`/performance/questions/${id}`, {
      method: "DELETE",
    }),

  /* ---------------------------------------------------------------- reviews */

  /** What I owe, and what was said about me. The self-service view. */
  myReviews: (signal?: AbortSignal) =>
    request<ApiMyReviews>("/performance/reviews/mine", signalOf(signal)),

  reviews: (
    params: {
      page?: number;
      pageSize?: number;
      q?: string;
      cycleId?: string;
      kind?: ReviewKind;
      subjectId?: string;
      submitted?: boolean;
    } = {},
    signal?: AbortSignal,
  ) =>
    requestPaged<ApiReview>("/performance/reviews", {
      query: listQuery(params),
      ...signalOf(signal),
    }),

  /** 404 rather than 403 when it is not yours to read. That is deliberate. */
  review: (id: string, signal?: AbortSignal) =>
    request<ApiReviewDetail>(`/performance/reviews/${id}`, signalOf(signal)),

  /** Saves answers. Nothing is sent yet, and re-answering replaces. */
  respond: (id: string, answers: AnswerBody[]) =>
    request<ApiRespondResult>(`/performance/reviews/${id}/respond`, {
      method: "POST",
      body: { answers },
    }),

  /** Refused while a required question is unanswered, and it names them. */
  submitReview: (id: string, body: SubmitReviewBody = {}) =>
    request<ApiReview & { submitted: true }>(`/performance/reviews/${id}/submit`, {
      method: "POST",
      body,
    }),
};

export type PagedGoals = Paged<ApiGoal>;

/* -------------------------------------------------------------- the measures */

/**
 * A decimal string as a number, for comparison and bar widths only.
 *
 * Never round-trip a stored value through this. It exists so a screen can ask
 * "is the current value above the target" without reimplementing decimal
 * parsing, and returns 0 for anything unparseable rather than `NaN`, which
 * would render as a blank width and silently break a layout.
 */
export function parseMeasure(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * A measure as a person reads it: thousands separated, trailing zeros dropped.
 *
 * Formats the **string**, so nothing that gets stored passes through a float.
 * Four decimal places is the column's ceiling, and a figure somebody reconciles
 * is never abbreviated — `4,233,291.88`, not `4.2M`.
 */
export function formatMeasure(value: string, unit?: string | null): string {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const bare = negative ? trimmed.slice(1) : trimmed;
  const [whole = "0", fraction] = bare.split(".");

  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cleaned = fraction?.replace(/0+$/, "") ?? "";
  const body = `${negative ? "-" : ""}${grouped}${cleaned ? `.${cleaned}` : ""}`;

  if (!unit) return body;
  /* A currency or percent sign reads wrong with a space; a word reads wrong
     without one. */
  return /^[^\w\s]$/.test(unit)
    ? unit === "%"
      ? `${body}%`
      : `${unit}${body}`
    : `${body} ${unit}`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * `2026-08-31` as `31 Aug 2026`.
 *
 * Split rather than `new Date(iso)`: a bare date string is parsed as UTC and
 * then printed in the viewer's zone, which moves a Lagos deadline to the 30th
 * for anybody west of Greenwich. The API sends a calendar date, and a calendar
 * date has no timezone.
 */
export function dayLabel(iso: string): string {
  const [year, month, day] = iso.split("-");
  const name = MONTHS[Number(month) - 1];
  if (!year || !name || !day) return iso;
  return `${Number(day)} ${name} ${year}`;
}

/** "2026-Q1" as "Q1 2026", which is how people say it out loud. */
export function quarterLabel(quarter: string | null): string {
  if (!quarter) return "No quarter set";
  const [year, part] = quarter.split("-");
  return part ? `${part} ${year}` : quarter;
}

/** The current quarter, in the API's `2026-Q1` form. */
export function currentQuarter(today: string): string {
  const [year = "", month = "01"] = today.split("-");
  const quarter = Math.floor((Number(month) - 1) / 3) + 1;
  return `${year}-Q${quarter}`;
}

/* ------------------------------------------------- appraiser weight helpers */

/** The whole mark, in basis points. Integers, for the same reason money is kobo. */
export const FULL_WEIGHT_BP = 10_000;

/**
 * `2500` as `"25%"`, `3333` as `"33.33%"`.
 *
 * The API formats weights inside its own messages; this is for the places the
 * interface renders one on its own. Same rounding, so a refusal quoting "90%"
 * and a table cell reading "90%" agree.
 */
export function weightLabel(bp: number): string {
  const whole = bp / 100;
  return `${Number.isInteger(whole) ? whole : Number(whole.toFixed(2))}%`;
}

/**
 * Split the whole mark n ways in whole basis points, summing to exactly 10000.
 *
 * The remainder goes to the first rows rather than being dropped: three ways is
 * 3334/3333/3333, which the server accepts, where 3333×3 is 9999 and is refused.
 * This is the entire reason weights are integers — there is no honest way to
 * write "a third" as a percentage with two decimal places.
 */
export function evenWeights(count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(FULL_WEIGHT_BP / count);
  const remainder = FULL_WEIGHT_BP - base * count;
  return Array.from({ length: count }, (_, index) =>
    index < remainder ? base + 1 : base,
  );
}

/**
 * What is wrong with a set of weights, in the API's own words, before sending it.
 *
 * Checked here **as well as** on the server, never instead of it: the server is
 * where the rule is real (`setAppraisers` refuses a set that does not sum to
 * 10000), and this exists so the refusal arrives while the person is still
 * looking at the row. Same wording, so the two never contradict each other.
 */
export function weightProblem(entries: { weightBp: number }[]): string | null {
  if (entries.length === 0) return null;
  const total = entries.reduce((sum, entry) => sum + entry.weightBp, 0);
  if (total === FULL_WEIGHT_BP) return null;
  return total < FULL_WEIGHT_BP
    ? `These add up to ${weightLabel(total)}. Add ${weightLabel(FULL_WEIGHT_BP - total)}.`
    : `These add up to ${weightLabel(total)}. Take off ${weightLabel(total - FULL_WEIGHT_BP)}.`;
}

/**
 * The roles, in the order the picker offers them, with a label and one line.
 *
 * **A second copy of labels the API also sends, and deliberately narrow.** The
 * API returns `roleLabel` on every assignment it returns, and that is what every
 * *rendered* assignment uses — see `ApiAppraiser.roleLabel`. This exists for the
 * one case the API cannot serve: a row that does not exist yet, in a picker,
 * before anything has been written. Ordered line-manager-first because that is
 * the answer for almost everybody.
 *
 * If a role is added to the enum, it goes here too — the object is keyed by the
 * union, so `tsc` refuses to build until it is.
 */
export const APPRAISER_ROLES: readonly AppraiserRole[] = [
  "LINE_MANAGER",
  "FUNCTIONAL_MANAGER",
  "PROJECT_LEAD",
  "SKIP_LEVEL",
];

export const APPRAISER_ROLE_LABEL: Record<AppraiserRole, string> = {
  LINE_MANAGER: "Line manager",
  FUNCTIONAL_MANAGER: "Functional manager",
  PROJECT_LEAD: "Project lead",
  SKIP_LEVEL: "Skip-level",
};

/** What the role *is*, not why to pick it. One line each, for the picker. */
export const APPRAISER_ROLE_HELP: Record<AppraiserRole, string> = {
  LINE_MANAGER: "The person's own manager. One at most.",
  FUNCTIONAL_MANAGER: "Owns the craft rather than the reporting line.",
  PROJECT_LEAD: "Ran the work they spent the period on.",
  SKIP_LEVEL: "Their manager's manager, checking the mark.",
};
