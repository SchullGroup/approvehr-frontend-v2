import type {
  ApiCriteria,
  ApiCriteriaInput,
  ApiCriteriaView,
  ApiPreview,
  ApiRun,
  ApiScoreStatus,
  ApiScreeningDetail,
  ApiSuggestions,
  ApiWeights,
} from "@/lib/api/screening";
import type { ApiErrorDetail } from "@/lib/api/client";
import { DEFAULT_SCALE, type CriteriaProblems } from "./criteria";
import type {
  Criteria,
  CriteriaPreview,
  CriteriaView,
  CriterionKind,
  Explanation,
  ExplanationItem,
  Extraction,
  FitSummary,
  Keyword,
  RescoreProgress,
  ScoreStatus,
  ScreeningSummary,
  Suggestion,
} from "./model";
import { FORMULA_LINE } from "./score";

/**
 * The API's words, turned into the screens' and back.
 *
 * One file holds every difference between what the API calls a thing and what a
 * screen does, so a rename on either side is one edit here and a test that says
 * which. Pure: no React, no requests.
 */

/* ------------------------------------------------------------------ criteria */

const same = (a: ApiWeights, b: ApiWeights): boolean =>
  a.mustHave === b.mustHave &&
  a.niceToHave === b.niceToHave &&
  a.experience === b.experience &&
  a.education === b.education &&
  a.location === b.location;

const keywordsFromApi = (
  list: "must" | "nice",
  skills: ApiCriteria["skills"]["must"],
): Keyword[] =>
  skills.map((skill, index) => ({
    /* Stable for a saved version, so an edit keeps its place. */
    id: `${list}:${String(index)}:${skill.term}`,
    label: skill.term,
    aliases: [...skill.aliases],
    weight: skill.weight,
  }));

/** The saved criteria as a screen edits them. Weights equal to the defaults read as "defaults". */
export function criteriaFromApi(
  criteria: ApiCriteria,
  defaults: ApiWeights,
): Criteria {
  return {
    mustHave: keywordsFromApi("must", criteria.skills.must),
    niceToHave: keywordsFromApi("nice", criteria.skills.nice),
    minYears: criteria.experience?.minYears ?? null,
    education: criteria.education?.minLevel ?? null,
    places: criteria.location ? [...criteria.location.places] : [],
    locationQuestionId: criteria.location?.locationQuestionId ?? null,
    relocateQuestionId: criteria.location?.relocateQuestionId ?? null,
    weights: same(criteria.weights, defaults) ? null : { ...criteria.weights },
  };
}

/** What is sent. A skill's weight is always sent; weights are left out to take the defaults. */
export function criteriaToApi(criteria: Criteria): ApiCriteriaInput {
  const skills = (list: Keyword[]) =>
    list.map((chip) => ({
      term: chip.label,
      aliases: chip.aliases,
      weight: chip.weight,
    }));
  return {
    skills: {
      must: skills(criteria.mustHave),
      nice: skills(criteria.niceToHave),
    },
    experience:
      criteria.minYears === null ? null : { minYears: criteria.minYears },
    education:
      criteria.education === null ? null : { minLevel: criteria.education },
    location:
      criteria.places.length === 0
        ? null
        : {
            places: criteria.places,
            locationQuestionId: criteria.locationQuestionId,
            relocateQuestionId: criteria.relocateQuestionId,
          },
    ...(criteria.weights ? { weights: criteria.weights } : {}),
  };
}

export function viewFromApi(view: ApiCriteriaView): CriteriaView {
  const scale = [...view.catalogue.educationLevels]
    .sort((a, b) => a.rank - b.rank)
    .map((level) => ({
      value: level.level,
      label: level.label,
      examples: level.examples,
    }));
  return {
    postingId: view.postingId,
    configured: view.configured,
    version: view.version > 0 ? view.version : null,
    criteria: criteriaFromApi(view.criteria, view.catalogue.defaultWeights),
    defaults: { ...view.catalogue.defaultWeights },
    scale: scale.length > 0 ? scale : DEFAULT_SCALE,
    formQuestions: view.catalogue.formQuestions,
    formula: FORMULA_LINE,
    neverUsed: view.catalogue.neverUsed,
    updatedAt: view.savedAt,
    updatedBy: view.savedBy,
  };
}

/**
 * The API's field errors, put on the part of the form they are about.
 * `skills.must.2.term` is the must-have list; `experience.minYears` is the years box.
 */
export function problemsFromApi(
  errors: readonly ApiErrorDetail[],
): CriteriaProblems {
  const problems: CriteriaProblems = {};
  for (const { field, message } of errors) {
    if (field.startsWith("skills.must")) problems.mustHave ??= message;
    else if (field.startsWith("skills.nice")) problems.niceToHave ??= message;
    else if (field === "skills") problems.niceToHave ??= message;
    else if (field.startsWith("experience")) problems.minYears ??= message;
    else if (field.startsWith("location")) problems.places ??= message;
    else if (field.startsWith("weights")) problems.weights ??= message;
    else problems.form ??= message;
  }
  return problems;
}

/* ------------------------------------------------------------------- rescoring */

const ACTIVE = new Set(["QUEUED", "RUNNING"]);

/** How far the latest pass has got. A pass that stopped is said, not hidden. */
export function progressFromRuns(runs: readonly ApiRun[]): RescoreProgress {
  const latest = runs[0];
  if (!latest)
    return { running: false, done: 0, total: 0, cause: null, failure: null };
  const running = ACTIVE.has(latest.status);
  return {
    running,
    done: running ? latest.processed : 0,
    total: running ? latest.total : 0,
    cause: !running
      ? null
      : latest.trigger === "cutoff_changed"
        ? "PASS_MARK"
        : "CRITERIA",
    failure:
      latest.status === "FAILED"
        ? (latest.error ??
          "The last pass over the applicants stopped part way.")
        : null,
  };
}

/* --------------------------------------------------------------------- scores */

/** The API's score status, as the screens say it. */
export function statusFromApi(
  status: ApiScoreStatus,
  readFailed = false,
): ScoreStatus {
  switch (status) {
    case "SCORED":
      return "SCORED";
    case "PENDING":
      return "WAITING_FOR_TEXT";
    case "NO_CV":
      return "NO_CV";
    case "NEEDS_READING":
      return readFailed ? "COULD_NOT_READ" : "NO_TEXT";
    case "NO_CRITERIA":
      return "NO_CRITERIA";
  }
}

/** The API's words for a status a person asked to filter by. */
export function statusToApi(status: ScoreStatus): ApiScoreStatus {
  switch (status) {
    case "SCORED":
      return "SCORED";
    case "WAITING_FOR_TEXT":
      return "PENDING";
    case "NO_CV":
      return "NO_CV";
    case "NO_TEXT":
    case "COULD_NOT_READ":
      return "NEEDS_READING";
    case "NO_CRITERIA":
      return "NO_CRITERIA";
  }
}

/** A list row's fit score. The list does not carry the version, so it cannot say stale. */
export function fitFromRow(row: {
  score?: number | null | undefined;
  scoreStatus?: ApiScoreStatus | undefined;
}): FitSummary | null {
  if (row.scoreStatus === undefined) return null;
  const status = statusFromApi(row.scoreStatus);
  return {
    status,
    score: status === "SCORED" ? (row.score ?? null) : null,
    version: null,
    stale: false,
  };
}

export function summaryFromRow(row: {
  score?: number | null | undefined;
  scoreStatus?: ApiScoreStatus | undefined;
  knockoutCount?: number | undefined;
}): ScreeningSummary | null {
  const fit = fitFromRow(row);
  if (!fit) return null;
  return {
    fit,
    assessment: null,
    knockoutCount: row.knockoutCount ?? 0,
    belowPassMark: false,
  };
}

/* ----------------------------------------------------------------- explanation */

const KIND: Record<
  ApiScreeningDetail["groups"][number]["group"],
  CriterionKind
> = {
  mustHave: "MUST_HAVE",
  niceToHave: "NICE_TO_HAVE",
  experience: "YEARS",
  education: "EDUCATION",
  location: "LOCATION",
};

function extractionFrom(detail: ApiScreeningDetail): {
  extraction: Extraction;
  readFailed: boolean;
} {
  const state = detail.extraction?.status;
  const readFailed = state === "FAILED";
  const extraction: Extraction =
    detail.status === "NO_CV"
      ? { state: "NO_CV", reason: detail.why, canRetry: false }
      : state === "FAILED"
        ? { state: "COULD_NOT_READ", reason: detail.why, canRetry: false }
        : state === "NO_TEXT"
          ? { state: "NO_TEXT", reason: detail.why, canRetry: false }
          : state === "PENDING" || state === "RUNNING"
            ? { state: "PENDING", reason: null, canRetry: false }
            : detail.status === "NEEDS_READING"
              ? { state: "NO_TEXT", reason: detail.why, canRetry: false }
              : { state: "READY", reason: null, canRetry: false };
  return { extraction, readFailed };
}

/**
 * A score's reasons, as the explanation panel draws them.
 *
 * `aliases` are the other spellings of each skill in the criteria in force now,
 * keyed like the API keys a criterion (`must:0`), so the words a match was found
 * under are marked too. They are only used when the score was made under those
 * criteria; for an older score they would be the wrong list.
 */
export function explanationFromApi(
  detail: ApiScreeningDetail,
  aliases: Readonly<Record<string, readonly string[]>> = {},
): Explanation {
  const { extraction, readFailed } = extractionFrom(detail);
  const status = statusFromApi(detail.status, readFailed);
  const scored = status === "SCORED" && detail.score !== null;
  const items: ExplanationItem[] = scored
    ? detail.criteria.map((criterion) => ({
        id: criterion.key,
        kind: KIND[criterion.group],
        label: criterion.label,
        verdict: criterion.status,
        confidence: criterion.confidence,
        value: criterion.value,
        evidence: criterion.evidence.map((evidence) => ({
          source: evidence.source,
          text: evidence.text,
          marks:
            criterion.group === "mustHave" || criterion.group === "niceToHave"
              ? [criterion.label, ...(aliases[criterion.key] ?? [])]
              : [],
        })),
        note: criterion.note,
      }))
    : [];
  return {
    status,
    score: scored ? detail.score : null,
    coverage: scored ? detail.coverage : null,
    formula: scored ? FORMULA_LINE : null,
    version: detail.criteriaVersion,
    currentVersion: null,
    stale: scored && !detail.current,
    groups: scored
      ? detail.groups.map((group) => ({
          kind: KIND[group.group],
          weight: group.weight,
          value: group.value,
          judged: group.judged,
        }))
      : [],
    items,
    extraction,
    standing: null,
  };
}

/* -------------------------------------------------------------- preview, suggest */

export function previewFromApi(preview: ApiPreview): CriteriaPreview {
  const summary = preview.summary;
  return {
    available: preview.available,
    sampled: preview.sampled,
    rows: preview.items.map((item) => ({
      id: item.applicationId,
      name: item.name,
      current: item.currentScore,
      next: item.newScore,
      change: item.change,
      reasons: item.newScore === null ? null : item.reasons,
    })),
    scored: summary?.scored ?? 0,
    notScorable: summary?.notScorable ?? preview.sampled,
    mean: summary?.mean ?? null,
    bands:
      summary?.distribution.map((band) => band.count) ??
      Array.from({ length: 10 }, () => 0),
  };
}

export function suggestionFromApi(suggestions: ApiSuggestions): Suggestion {
  const chips = (list: "must" | "nice") =>
    suggestions.skills
      .filter((skill) => skill.list === list)
      .map((skill, index) => ({
        id: `suggested-${list}-${String(index)}-${skill.term}`,
        label: skill.term,
        aliases: [],
        weight: 1,
        from: skill.from,
        confidence: skill.confidence,
      }));
  return {
    mustHave: chips("must"),
    niceToHave: chips("nice"),
    minYears: suggestions.experience?.minYears ?? null,
    minYearsFrom: suggestions.experience?.from ?? null,
    education: suggestions.education?.minLevel ?? null,
    educationFrom: suggestions.education?.from ?? null,
    places: suggestions.location?.places ?? [],
    placesFrom: suggestions.location?.from ?? null,
    note:
      suggestions.readFrom.length > 0
        ? `Read from ${suggestions.readFrom.join(" and ")}. Check every one before you keep it.`
        : "Check every one before you keep it.",
  };
}
