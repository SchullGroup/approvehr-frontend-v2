import { request } from "@/lib/api/client";

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

  /** Score everybody again, for no reason but wanting to (or to retry a stopped pass). */
  rescore: (postingId: string) =>
    request<ApiRun>(`${at(postingId)}/screening/rescore`, {
      method: "POST",
      body: {},
    }),
};
