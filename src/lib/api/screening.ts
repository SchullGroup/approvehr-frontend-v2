import { request, requestPaged, type Paged } from "@/lib/api/client";

/**
 * CV screening — the advert's criteria, its scores, and who is below the pass mark.
 *
 * Typed wrappers only, in the style of `careers.ts`; what the screens draw is made
 * from these by `lib/hiring/screening/wire.ts`. The shapes are the API's own.
 *
 * ## Scores belong to one advert
 *
 * A score means something against one advert's criteria. The queue's score range and
 * score sort therefore need `postingId`, and the API says so (400) without one; the
 * screens do not offer them until an advert is chosen.
 */

/* ------------------------------------------------------------------ criteria */

export type ApiSkill = { term: string; aliases: string[]; weight: number };

export type ApiWeights = {
  mustHave: number;
  niceToHave: number;
  experience: number;
  education: number;
  location: number;
};

export type ApiCriteria = {
  skills: { must: ApiSkill[]; nice: ApiSkill[] };
  experience: { minYears: number } | null;
  education: { minLevel: string } | null;
  location: {
    places: string[];
    locationQuestionId: string | null;
    relocateQuestionId: string | null;
  } | null;
  weights: ApiWeights;
};

/** What is sent. Weights are left out to take the defaults. */
export type ApiCriteriaInput = {
  skills: { must: ApiSkill[]; nice: ApiSkill[] };
  experience: { minYears: number } | null;
  education: { minLevel: string } | null;
  location: {
    places: string[];
    locationQuestionId: string | null;
    relocateQuestionId: string | null;
  } | null;
  weights?: ApiWeights;
};

export type ApiRun = {
  id: string;
  kind: "RESCORE" | "CUTOFF";
  status: "QUEUED" | "RUNNING" | "DONE" | "FAILED" | "SUPERSEDED";
  /** `criteria_changed`, `engine_upgrade`, `manual`, `cutoff_changed`. */
  trigger: string;
  criteriaVersion: number;
  engineVersion: number;
  total: number;
  processed: number;
  scored: number;
  waiting: number;
  noScore: number;
  failed: number;
  /** 0 to 100. */
  progress: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type ApiCriteriaView = {
  postingId: string;
  configured: boolean;
  /** 0 until criteria have been saved. */
  version: number;
  criteria: ApiCriteria;
  savedAt: string | null;
  savedBy: string | null;
  catalogue: {
    engineVersion: number;
    educationLevels: {
      level: string;
      label: string;
      rank: number;
      examples: string;
    }[];
    defaultWeights: ApiWeights;
    limits: Record<string, unknown>;
    neverUsed: string[];
    formQuestions: { id: string; kind: string; label: string }[];
  };
  runs: ApiRun[];
};

export type ApiSavedCriteria = ApiCriteriaView & {
  /** False when what was sent is what was already saved: nothing was written. */
  changed: boolean;
  notes: string[];
  /** The re-score a real change started. */
  rescore: ApiRun | null;
};

export type ApiPreview = {
  configured: boolean;
  available: number;
  sampled: number;
  items: {
    applicationId: string;
    reference: string | null;
    name: string;
    currentScore: number | null;
    newScore: number | null;
    change: number | null;
    coverage: number;
    reasons: string;
  }[];
  summary: {
    scored: number;
    notScorable: number;
    mean: number | null;
    distribution: { from: number; to: number; count: number }[];
  } | null;
  notes: string[];
};

export type ApiSuggestions = {
  skills: {
    term: string;
    list: "must" | "nice";
    confidence: "HIGH" | "MEDIUM" | "LOW";
    from: string;
  }[];
  experience: { minYears: number; from: string } | null;
  education: { minLevel: string; label: string; from: string } | null;
  location: { places: string[]; from: string } | null;
  readFrom: string[];
};

/* -------------------------------------------------------------------- scores */

/** The API's own words for where a score is. */
export type ApiScoreStatus =
  "PENDING" | "SCORED" | "NO_CV" | "NEEDS_READING" | "NO_CRITERIA";

export type ApiCriterionResult = {
  /** `must:0`, `nice:2`, `experience`, `education`, `location`. */
  key: string;
  group: "mustHave" | "niceToHave" | "experience" | "education" | "location";
  label: string;
  status: "MATCHED" | "PARTIAL" | "MISSING" | "UNKNOWN";
  value: number | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  weight: number;
  evidence: {
    source: "cv" | "cover_note" | "answer";
    kind: string;
    text: string;
  }[];
  note: string | null;
};

export type ApiScreeningDetail = {
  status: ApiScoreStatus;
  score: number | null;
  coverage: number | null;
  reasons: string | null;
  criteriaVersion: number | null;
  engineVersion: number | null;
  /** Made under the criteria and engine in force now. */
  current: boolean;
  scoredAt: string | null;
  groups: {
    group: ApiCriterionResult["group"];
    weight: number;
    value: number | null;
    judged: boolean;
  }[];
  criteria: ApiCriterionResult[];
  /** Why there is no score, in a sentence. */
  why: string | null;
  extraction: {
    status: "PENDING" | "RUNNING" | "DONE" | "NO_TEXT" | "FAILED";
    reason: string | null;
    pages: number | null;
    characters: number | null;
    truncated: boolean;
  } | null;
  neverUsed: string[];
};

/* ---------------------------------------------------------------------- pass mark */

export type ApiCutoffInput = {
  /** Below this fit score, flagged. `null`: no pass mark on the score. */
  fitScoreMin?: number | null;
  /** Below this percentage of the test's maximum, flagged. `null`: none. */
  assessmentMinPct?: number | null;
  /** The test the mark reads, by name. `null`: the latest entered. */
  assessmentTest?: string | null;
  flagKnockouts?: boolean;
};

export type ApiCutoffDraft = {
  fitScoreMin: number | null;
  assessmentMinPct: number | null;
  assessmentTest: string | null;
  flagKnockouts: boolean;
};

export type ApiLiveCount = {
  /** Could be flagged: received or screened in, and not declined or withdrawn. */
  working: number;
  /** Of those, the ones nobody has decided. */
  undecided: number;
  /** Of the undecided, how many would be below the line. */
  wouldBeBelow: number;
  byReason: { SCORE: number; ASSESSMENT: number; KNOCKOUT: number };
  /** Kept in the running by a person, who would otherwise be below. */
  kept: number;
  withoutScore: number;
  withoutAssessment: number;
  currentlyBelow: number;
};

export type ApiCutoffView = ApiCutoffDraft & {
  postingId: string;
  /** A pass mark has been saved. Without one nothing is flagged. */
  configured: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  tests: { key: string; name: string; applicants: number }[];
  counts: ApiLiveCount;
  runs?: ApiRun[];
};

export type ApiCutoffPreview = {
  postingId: string;
  draft: ApiCutoffDraft;
  counts: ApiLiveCount;
};

export type ApiCutoffSaved = ApiCutoffView & {
  changed: boolean;
  /** The pass over everybody's flags, or `null` when nothing changed. */
  run: ApiRun | null;
};

/* ------------------------------------------------------------------- confirm list */

export type ApiCutoffReason = "SCORE" | "ASSESSMENT" | "KNOCKOUT";

export type ApiConfirmRow = {
  id: string;
  reference: string | null;
  name: string;
  email: string;
  source: string | null;
  appliedAt: string;
  state: "WAITING" | "IN_PIPELINE";
  pipeline: {
    applicationId: string;
    requisitionId: string;
    stage: string | null;
  } | null;
  score: number | null;
  scoreStatus: ApiScoreStatus;
  assessment: { test: string | null; percent: number } | null;
  knockoutCount: number;
  reasons: { code: ApiCutoffReason; text: string }[];
  flaggedAt: string | null;
  hasCv: boolean;
};

export type ApiConfirmMeta = {
  hasMore: boolean;
  nextCursor: string | null;
  counts: {
    byReason: Record<ApiCutoffReason, number>;
    byState: { WAITING: number; IN_PIPELINE: number };
  };
};

export type ApiConfirmQuery = {
  reason?: ApiCutoffReason;
  state?: "WAITING" | "IN_PIPELINE";
  q?: string;
  scoreMin?: number;
  scoreMax?: number;
  source?: string;
  sort?: "score" | "assessment" | "applied";
  pageSize?: number;
  cursor?: string;
};

/** The same words as a query, for a bulk selection of everybody the list matches. */
export type ApiConfirmFilter = Omit<
  ApiConfirmQuery,
  "sort" | "pageSize" | "cursor"
>;

/* ------------------------------------------------------------------- assessments */

export type ApiAssessmentInput = {
  /** The test's name. Blank: "Assessment". */
  test?: string;
  score: number;
  /** What it was marked out of; `null`: the score is a percentage. */
  max?: number | null;
  /** `YYYY-MM-DD`. */
  takenOn?: string | null;
};

export type ApiAssessmentCurrent = {
  test: string;
  score: number;
  max: number | null;
  percent: number;
  takenOn: string | null;
  source: "IMPORT" | "MANUAL";
  enteredAt: string;
};

export type ApiAssessmentEntry = {
  test: string;
  cleared: boolean;
  score: number | null;
  max: number | null;
  percent: number | null;
  takenOn: string | null;
  source: "IMPORT" | "MANUAL";
  importBatchId: string | null;
  by: string | null;
  at: string;
};

export type ApiAssessments = {
  current: ApiAssessmentCurrent[];
  history: ApiAssessmentEntry[];
};

/* ----------------------------------------------------------------------- calls */

const at = (id: string) => `/careers/postings/${id}`;

export const screeningApi = {
  getCriteria: (postingId: string, signal?: AbortSignal) =>
    request<ApiCriteriaView>(`${at(postingId)}/criteria`, {
      ...(signal ? { signal } : {}),
    }),

  putCriteria: (postingId: string, body: ApiCriteriaInput) =>
    request<ApiSavedCriteria>(`${at(postingId)}/criteria`, {
      method: "PUT",
      body,
    }),

  previewCriteria: (
    postingId: string,
    criteria: ApiCriteriaInput,
    signal?: AbortSignal,
  ) =>
    request<ApiPreview>(`${at(postingId)}/criteria/preview`, {
      method: "POST",
      body: { criteria },
      ...(signal ? { signal } : {}),
    }),

  suggest: (postingId: string, signal?: AbortSignal) =>
    request<ApiSuggestions>(`${at(postingId)}/criteria/suggest`, {
      method: "POST",
      body: {},
      ...(signal ? { signal } : {}),
    }),

  runs: (postingId: string, limit: number, signal?: AbortSignal) =>
    request<ApiRun[]>(`${at(postingId)}/screening/runs`, {
      query: { limit },
      ...(signal ? { signal } : {}),
    }),

  getCutoff: (postingId: string, signal?: AbortSignal) =>
    request<ApiCutoffView>(`${at(postingId)}/cutoff`, {
      ...(signal ? { signal } : {}),
    }),

  /** How many would be below an unsaved pass mark. Writes nothing. */
  previewCutoff: (
    postingId: string,
    body: ApiCutoffInput,
    signal?: AbortSignal,
  ) =>
    request<ApiCutoffPreview>(`${at(postingId)}/cutoff/preview`, {
      method: "POST",
      body,
      ...(signal ? { signal } : {}),
    }),

  putCutoff: (postingId: string, body: ApiCutoffInput) =>
    request<ApiCutoffSaved>(`${at(postingId)}/cutoff`, {
      method: "PUT",
      body,
    }),

  confirmList: (
    postingId: string,
    query: ApiConfirmQuery,
    signal?: AbortSignal,
  ): Promise<Paged<ApiConfirmRow, ApiConfirmMeta>> =>
    requestPaged<ApiConfirmRow, ApiConfirmMeta>(
      `${at(postingId)}/cutoff/confirm`,
      {
        query,
        ...(signal ? { signal } : {}),
      },
    ),

  /** A person has looked: keep them in the running. A reason is required. */
  keep: (applicationId: string, reason: string) =>
    request<unknown>(`/careers/applications/${applicationId}/cutoff/keep`, {
      method: "POST",
      body: { reason },
    }),

  assessments: (applicationId: string, signal?: AbortSignal) =>
    request<ApiAssessments>(
      `/careers/applications/${applicationId}/assessments`,
      {
        ...(signal ? { signal } : {}),
      },
    ),

  putAssessment: (applicationId: string, body: ApiAssessmentInput) =>
    request<ApiAssessments & { outcome: string }>(
      `/careers/applications/${applicationId}/assessments`,
      { method: "PUT", body },
    ),

  /** Score everybody again, for no reason but wanting to (or to retry a stopped pass). */
  rescore: (postingId: string) =>
    request<ApiRun>(`${at(postingId)}/screening/rescore`, {
      method: "POST",
      body: {},
    }),
};
