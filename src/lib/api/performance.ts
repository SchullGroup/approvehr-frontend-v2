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
 *
 * ## Scores are integers in basis points, and an absence is `null`
 *
 * There is no money here and there is arithmetic all the same, so the same rule
 * applies for the same reason: `scoreBp` and every `weightBp` are **integers**,
 * 10000 is the whole mark, and nothing on this side divides one. A score
 * assembled from floats does not reproduce, and a score that does not reproduce
 * cannot be defended when somebody disputes it.
 *
 * A component with nothing recorded against it arrives with `scoreBp: null`,
 * `included: false` and a reason in `excludedBecause`. **Render the absence as an
 * absence.** "Rated 0 on leadership" and "manages nobody, so not rated on
 * leadership" are different claims about a person, and a screen that prints 0 for
 * the second one is making the first. `scoreLabel` refuses `null` in its
 * signature so the compiler asks every caller what it wants to say instead.
 *
 * ## Sign-off is three facts, not one
 *
 * `finalised`, `acknowledged` and `disputed` are separate booleans and they are
 * not each other's opposites. Not acknowledged usually means nobody has asked
 * yet. Check the one you mean.
 */

/* ------------------------------------------------------------------- shapes */

/** Mirrors `GoalStatus`. There is no draft and no cancelled — see the notes. */
export type GoalStatus = "ON_TRACK" | "AT_RISK" | "OFF_TRACK" | "DONE";

/**
 * Mirrors `ObjectiveApproval`. **A separate axis from `GoalStatus`.**
 *
 * An objective can be agreed and off track at the same time, which is why these
 * are two columns and not one: a single field carrying both "nobody has agreed
 * this" and "this is going badly" makes the two facts indistinguishable, and
 * they call for opposite actions.
 */
export type ObjectiveApproval =
  | "DRAFT"
  | "AWAITING_APPROVAL"
  | "AGREED"
  | "NEEDS_REVISION"
  | "REJECTED";

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
  /**
   * The review period this objective will be scored in.
   *
   * Null for a standing operational goal, which belongs to no cycle and is
   * never scored. Anything that *will* be scored needs one — the API refuses to
   * send an objective for agreement with neither a cycle nor a quarter, because
   * an objective that belongs to no period cannot be agreed before it.
   */
  reviewCycleId: string | null;
  reviewCycleName: string | null;
  approval: ObjectiveApproval;
  /** The API's own wording. Do not keep a second copy of these five strings. */
  approvalLabel: string;
  /**
   * Whether the target is frozen. Derived by the API from `approval`, never
   * stored twice — a second field saying the same thing can disagree with it.
   */
  targetFrozen: boolean;
  submittedAt: string | null;
  agreedAt: string | null;
  /**
   * Why it was sent back, refused, or reopened. **The reason is the record.**
   *
   * Cleared when the objective is sent again, because it described a version
   * that no longer exists.
   */
  approvalNote: string | null;
  /** How often an agreed target has been reopened. Zero is the ordinary case. */
  revisionCount: number;
  revisedAt: string | null;
  keyResults: ApiKeyResult[];
  childCount: number;
  createdAt: string;
  updatedAt: string;
};

/* -------------------------------------------------- the approval lifecycle */

/**
 * `POST /goals/:id/submit`.
 *
 * `sentTo` is **null when the owner has no manager** — somebody had to be told
 * and nobody was, which is a fact the screen has to say rather than swallow.
 */
export type ApiObjectiveSubmitted = ApiGoal & { sentTo: string | null };

/** `POST /goals/:id/agree`. `note` is the API's one sentence about the freeze. */
export type ApiObjectiveAgreed = ApiGoal & { agreed: true; note: string };

export type ApiObjectiveSentBack = ApiGoal & { sentBack: true; reason: string };

export type ApiObjectiveRejected = ApiGoal & { rejected: true; reason: string };

/** `POST /goals/:id/revise`. The only way through the one-way door. */
export type ApiObjectiveReopened = ApiGoal & {
  reopened: true;
  reason: string;
  revisionCount: number;
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
  /**
   * Whether the scoring weights are frozen onto this cycle.
   *
   * False on a cycle that started before the snapshot existed, and the score
   * then says `weightsFrom: "current"`. A reader who cannot tell a frozen set
   * from a live one cannot tell whether the mark on screen is the one awarded.
   */
  scoringFrozen: boolean;
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
  /**
   * Anybody with nothing agreed to be scored against, by name.
   *
   * Named for the same reason. Delivery against objectives is one of the four
   * parts the framework seeds, and an employee with no agreed objective has
   * nothing under that heading — a cycle that starts silently is how half a
   * company reaches the end of a period unscored.
   */
  withoutAgreedObjectives: string[];
  /** The weights this cycle is now frozen against, in basis points. */
  scoringWeights: Record<ScoreComponent, number>;
};

export type ApiCyclePublished = ApiCycle & {
  published: true;
  submitted: number;
  /** Reported, never refused: people leave mid-cycle. */
  unsubmitted: number;
  notified: number;
  /** Who finishes with no mark, by name. A count is not something to act on. */
  unscored: string[];
  /** Written but not finalised, so these people have not been told their mark. */
  notFinalised: string[];
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
  /**
   * Sign-off. **Presence, never a falsy stand-in.**
   *
   * `finalised` is a one-way door: after it the rating is what the employee was
   * told, and it cannot be re-marked. Then they either acknowledge or formally
   * dispute — one or the other, and never neither by omission, which is why the
   * cycle register names whoever has not answered rather than counting silence
   * as agreement.
   *
   * `acknowledged` and `disputed` are mutually exclusive and both start false.
   * A screen must not read `!acknowledged` as "they disagreed": the third state
   * is that nobody has asked them yet, and that is the common one.
   */
  finalised: boolean;
  finalisedAt: string | null;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  disputed: boolean;
  disputedAt: string | null;
  /**
   * What the employee said. Optional on an acknowledgement, required on a
   * dispute — so a non-null value here does not tell you which act it was.
   */
  employeeComment: string | null;
};

/**
 * `POST /reviews/:id/finalise`.
 *
 * `subjectNotified` is false for somebody with no sign-in — a cleaner on the
 * payroll who does not use the product. The acknowledgement still has to be
 * recorded, on paper if necessary, and reporting this is what stops "we told
 * them" from being assumed.
 */
export type ApiReviewFinalised = ApiReview & {
  finalised: true;
  subjectNotified: boolean;
};

export type ApiReviewAcknowledged = ApiReview & { acknowledged: true };

/** The rating does not move. `note` is the API's sentence saying so. */
export type ApiReviewDisputed = ApiReview & { disputed: true; note: string };

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

/* -------------------------------------------------------- the composite score
 *
 * Every figure here is an **integer in basis points** — 10000 is the whole mark,
 * 5833 is 58.33%. Same reason money is integer kobo: a score assembled from
 * floats does not reproduce, and a score that does not reproduce cannot be
 * defended when somebody disputes it. `scorePercent` is the same integer read as
 * a percentage for display, sent by the API rather than derived here so the two
 * can never disagree.
 *
 * **`null` is the load-bearing value in this block.** A component with nothing
 * recorded against it comes back with `scoreBp: null` and `included: false`, and
 * the reason is in `excludedBecause`. Rendering a 0 there would be a wrong claim
 * about a person: "rated 0 on leadership" and "manages nobody, so not rated on
 * leadership" are different statements and only one of them is true.
 */

/** Mirrors `ScoreComponent`. Self-assessment ships weighted at zero. */
export type ScoreComponent =
  | "OBJECTIVES"
  | "CORE_COMPETENCY"
  | "BEHAVIOURAL_COMPETENCY"
  | "LEADERSHIP"
  | "SELF_ASSESSMENT";

/** Why a component did not enter the arithmetic. Null means it did. */
export type ScoreExclusionReason = "NOT_WEIGHTED" | "NO_DATA" | "NOT_A_MANAGER";

export type ApiComponentScore = {
  component: ScoreComponent;
  /** The API's wording. Do not keep a second copy of these five labels. */
  label: string;
  /** 0–10000, or **null** when nothing was recorded. Never 0 for an absence. */
  scoreBp: number | null;
  /** The weight the company set. */
  weightBp: number;
  /** The weight it actually carried, after excluded components were dropped. */
  effectiveWeightBp: number;
  included: boolean;
  excludedBecause: ScoreExclusionReason | null;
  /** The API's sentence for the exclusion. Render this, not your own. */
  excludedNote: string | null;
  /** How many things were averaged. Zero is why `scoreBp` is null. */
  evidenceCount: number;
};

/** Exceptions, in the same shape and severities the payroll run uses. */
export type ApiScoreException = {
  severity: "BLOCKER" | "WARNING";
  code:
    | "NO_AGREED_OBJECTIVES"
    | "NO_SCORE"
    | "NOT_FINALISED"
    | "AWAITING_ACKNOWLEDGEMENT"
    | "DISPUTED";
  message: string;
};

export type ApiScoreRow = {
  employeeId: string;
  employeeName: string;
  jobTitle: string;
  departmentId: string | null;
  departmentName: string | null;
  /** Derived from the reporting line, not stored. Decides leadership. */
  managesOthers: boolean;
  /** 0–10000. **Null** when no weighted component carried any data. */
  scoreBp: number | null;
  /** The same integer as a percentage. Null for the same reason. */
  scorePercent: number | null;
  components: ApiComponentScore[];
  objectives: {
    agreed: number;
    awaitingApproval: number;
    draft: number;
    needsRevision: number;
    /** Agreed objectives whose progress comes from measures, not a typed figure. */
    measured: number;
  };
  /**
   * The appraisers' own overall mark, weighted across them by `weightBp` over
   * the weight that has actually come in. **Not a scored component** — it is the
   * same judgement the competency ratings already express, and weighting one
   * judgement twice is the defect in the incumbent's formula, not a feature.
   */
  appraiserMark: {
    ratingBp: number | null;
    submittedWeightBp: number;
    totalWeightBp: number;
    appraisers: number;
  };
  signOff: {
    /** Null when there is no manager review at all, which is its own fact. */
    reviewId: string | null;
    submitted: boolean;
    finalised: boolean;
    finalisedAt: string | null;
    acknowledged: boolean;
    acknowledgedAt: string | null;
    disputed: boolean;
    disputedAt: string | null;
    employeeComment: string | null;
  };
  /** Ratings filed under a category no component reads. Counted, never dropped. */
  unmappedRatings: number;
  exceptions: ApiScoreException[];
};

export type ApiScoreRegister = {
  cycleId: string;
  cycleName: string;
  stage: ReviewCycleStage;
  started: boolean;
  /** `"snapshot"` for a frozen set, `"current"` for the company's live one. */
  weightsFrom: "snapshot" | "current";
  weights: { component: ScoreComponent; label: string; weightBp: number }[];
  /** Published rather than left to be added up. 10000 for anything saved here. */
  weightsTotalBp: number;
  rows: ApiScoreRow[];
  counts: {
    people: number;
    scored: number;
    unscored: number;
    withoutAgreedObjectives: number;
    awaitingAcknowledgement: number;
    disputed: number;
    blockers: number;
    warnings: number;
  };
};

/** One person's score. The register's head fields, plus their one row. */
export type ApiEmployeeScore = ApiScoreRow & {
  cycleId: string;
  cycleName: string;
  stage: ReviewCycleStage;
  weightsFrom: "snapshot" | "current";
};

export type ApiScoringWeights = {
  /** Whether the company chose these or is on the shipped defaults. */
  source: "saved" | "default";
  rows: { component: ScoreComponent; label: string; weightBp: number }[];
  totalBp: number;
  /**
   * What turning self-assessment on does to somebody's official mark, in the
   * API's own words. It is the one weight a company should not be able to move
   * without reading a sentence about it, so the sentence travels with the data.
   */
  selfAssessmentNote: string;
};

export type ApiScoringWeightsSaved = ApiScoringWeights & {
  saved: true;
  /** Running cycles these weights will not touch, because theirs are frozen. */
  frozenCycles: string[];
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
  /** Where an objective is in the agreement lifecycle. */
  approval?: ObjectiveApproval;
  ownerId?: string;
  parentId?: string;
  dueQuarter?: string;
  reviewCycleId?: string;
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
  /** The period it will be scored in. Needed for anything that gets a mark. */
  reviewCycleId?: string;
  status?: GoalStatus;
  /**
   * No `approval` field, deliberately. A client does not get to declare its own
   * objective agreed — every one starts as a draft and moves through the
   * lifecycle endpoints, which is the whole of what makes the trail worth
   * anything.
   */
};

export type UpdateGoalBody = {
  title?: string;
  description?: string | null;
  ownerId?: string | null;
  parentId?: string | null;
  dueQuarter?: string | null;
  /** Refused on an agreed objective, like every other part of the target. */
  reviewCycleId?: string | null;
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

  /**
   * The objective approval queue: what is waiting for **this** caller to agree.
   *
   * Narrowed by who asks — a manager's queue is their reports', `EDIT_RECORDS`
   * widens it to the company. **Nobody's own objectives appear in their own
   * queue**, because nobody may agree their own, so an empty queue for somebody
   * who manages nobody is the right answer rather than a permission problem.
   */
  objectiveApprovals: (params: GoalListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiGoal>("/performance/goals/approvals", {
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

  /* ---------------------------------------------- the approval lifecycle
   *
   * Five calls rather than one `PATCH { approval }`, matching the API. Three of
   * them require a reason and a single state-setting endpoint cannot make a
   * field required for three of five values without the requirement becoming
   * advice. None of them needs a permission: the API checks the reporting line,
   * because being somebody's manager is a fact about the org chart.
   */

  /** Send it to be agreed. Refused when it belongs to no period. */
  submitObjective: (id: string) =>
    request<ApiObjectiveSubmitted>(`/performance/goals/${id}/submit`, {
      method: "POST",
    }),

  /**
   * Agree it. **The one-way door**, the same shape as approving a payroll run.
   *
   * Refused for the owner, whatever permissions they hold: a self-agreed target
   * carries no more evidence than one somebody simply wrote down. After this the
   * target is frozen and progress still moves.
   */
  agreeObjective: (id: string) =>
    request<ApiObjectiveAgreed>(`/performance/goals/${id}/agree`, {
      method: "POST",
    }),

  /** Back for another go, with a reason. A refusal with no reason is not feedback. */
  sendBackObjective: (id: string, reason: string) =>
    request<ApiObjectiveSentBack>(`/performance/goals/${id}/send-back`, {
      method: "POST",
      body: { reason },
    }),

  /**
   * Refuse it outright. **Terminal** — there is no route out of refused.
   *
   * The answer to a refused objective is a different objective, not the same one
   * re-sent with the refusal quietly attached.
   */
  rejectObjective: (id: string, reason: string) =>
    request<ApiObjectiveRejected>(`/performance/goals/${id}/reject`, {
      method: "POST",
      body: { reason },
    }),

  /**
   * Reopen an agreed target so it can change, with a reason.
   *
   * The only way through the one-way door, and the audit entry is the point of
   * the endpoint: who moved a target that had been agreed, when, and why. A
   * silent post-hoc target edit is the single most common way an appraisal
   * becomes indefensible.
   */
  reviseObjective: (id: string, reason: string) =>
    request<ApiObjectiveReopened>(`/performance/goals/${id}/revise`, {
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

  /* ---------------------------------------------------------------- scoring */

  /** Open to everybody: a scale you are measured against but cannot read is absurd. */
  scoringWeights: (signal?: AbortSignal) =>
    request<ApiScoringWeights>("/performance/scoring-weights", signalOf(signal)),

  /**
   * The **whole** set, replaced, and refused unless it makes exactly 100%.
   *
   * There is no endpoint that saves one weight, deliberately: it could not check
   * a total, so the check would end up in a form and be a suggestion. That is
   * why the incumbent needs a "Resolve Weights" button and this does not — there
   * is never an unbalanced state to resolve.
   */
  setScoringWeights: (weights: Record<ScoreComponent, number>) =>
    request<ApiScoringWeightsSaved>("/performance/scoring-weights", {
      method: "PUT",
      body: weights,
    }),

  /** Everybody's composite score in one cycle. `EDIT_RECORDS`, as an aggregate is. */
  cycleScores: (
    cycleId: string,
    params: { departmentId?: string; exceptionsOnly?: boolean } = {},
    signal?: AbortSignal,
  ) =>
    request<ApiScoreRegister>(`/performance/cycles/${cycleId}/scores`, {
      query: {
        departmentId: params.departmentId,
        exceptionsOnly: params.exceptionsOnly ? "true" : undefined,
      },
      ...signalOf(signal),
    }),

  /**
   * One person's, component by component, with every exclusion and its reason.
   *
   * The subject may read their own **once it is finalised** and not before — a
   * working figure moves every time somebody records a rating, and showing an
   * employee a provisional mark starts a conversation about a number nobody
   * meant to publish. Before that the API answers 422 with that sentence.
   */
  employeeScore: (cycleId: string, employeeId: string, signal?: AbortSignal) =>
    request<ApiEmployeeScore>(
      `/performance/cycles/${cycleId}/scores/${employeeId}`,
      signalOf(signal),
    ),

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
      finalised?: boolean;
      /** `true` is the HR queue: ratings somebody has to answer. */
      disputed?: boolean;
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

  /* --------------------------------------------------------------- sign-off
   *
   * Three writes, in order, each refusing what would leave the trail
   * incomplete: finalise, then acknowledge **or** dispute. Without a stored
   * acknowledgement there is no evidence the employee was ever shown their
   * rating, and a rating nobody can prove was communicated is a liability
   * rather than a record. Nobody else in this market has it.
   */

  /**
   * Make a manager review the rating of record. **One-way.**
   *
   * Only a submitted manager review: a self-review is not a mark anybody is
   * told, and peer feedback reaches its subject as an aggregate nobody signs.
   * The author, the subject's manager, or `EDIT_RECORDS`.
   */
  finaliseReview: (id: string) =>
    request<ApiReviewFinalised>(`/performance/reviews/${id}/finalise`, {
      method: "POST",
    }),

  /**
   * "I have seen this." **Not "I agree with it"** — every screen has to keep
   * those apart, because an acknowledgement that reads as consent is worth less
   * than nothing to a company defending a decision.
   *
   * The comment is optional here: somebody with nothing to add should not have
   * to invent something. Only the person the rating is about may send it.
   */
  acknowledgeReview: (id: string, comment?: string) =>
    request<ApiReviewAcknowledged>(`/performance/reviews/${id}/acknowledge`, {
      method: "POST",
      body: comment === undefined ? {} : { comment },
    }),

  /**
   * A formal dispute. **The rating stands and the dispute is recorded beside
   * it** — rewriting the mark would leave no evidence of what was decided.
   *
   * The comment is required, at ten characters: HR cannot answer "I disagree"
   * with no grounds, and a dispute nobody can act on helps the employee least of
   * all.
   */
  disputeReview: (id: string, comment: string) =>
    request<ApiReviewDisputed>(`/performance/reviews/${id}/dispute`, {
      method: "POST",
      body: { comment },
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

/**
 * The calendar day of a timestamp: `2026-07-02T09:15:00.000Z` as `2 Jul 2026`.
 *
 * The day, and deliberately no time. `dayLabel` above never puts a bare date
 * through `new Date()`; a timestamp has the opposite problem — it is a real
 * instant, so rendering it in the viewer's zone shows a Lagos finalisation as the
 * previous day for anybody west of Greenwich. What a record needs is "finalised
 * on 2 July"; the minute it happened is not a fact anybody reads off a screen, so
 * this drops it rather than claiming a precision it is not handling.
 */
export function dayOf(timestamp: string): string {
  return dayLabel(timestamp.slice(0, 10));
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
  return percentOfBp(bp);
}

/** `2500` as `"25%"`, `5833` as `"58.33%"`. The one place bp becomes a percent. */
function percentOfBp(bp: number): string {
  const whole = bp / 100;
  return `${Number.isInteger(whole) ? whole : Number(whole.toFixed(2))}%`;
}

/**
 * A score in basis points as a percentage: `5833` as `"58.33%"`.
 *
 * Takes a `number`, **never `number | null`**, and the signature is the point. A
 * component with nothing recorded against it comes back `null`, and a formatter
 * that accepted null would have to invent a string for an absence — which is how
 * "not rated" becomes "0%" on a screen. Every caller handles the absence itself,
 * in words that fit what is missing on its own screen.
 */
export function scoreLabel(bp: number): string {
  return percentOfBp(bp);
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
