import type {
  ApiAssessmentInput,
  ApiAssessments,
  ApiConfirmFilter,
  ApiConfirmRow,
  ApiCriteria,
  ApiCriteriaInput,
  ApiCriteriaView,
  ApiCutoffInput,
  ApiCutoffReason,
  ApiCutoffView,
  ApiLiveCount,
  ApiPreview,
  ApiRun,
  ApiScoreStatus,
  ApiScreeningDetail,
  ApiSuggestions,
  ApiWeights,
} from "@/lib/api/screening";
import type { ApiErrorDetail } from "@/lib/api/client";
import type { ApiRowReport, ImportRow } from "@/lib/api/imports";
import type { AssessmentRowInput } from "./gateway";
import { DEFAULT_SCALE, type CriteriaProblems } from "./criteria";
import type {
  AssessmentCheck,
  AssessmentEntryInput,
  AssessmentHistory,
  AssessmentRow,
  BelowFilters,
  BelowKind,
  BelowRow,
  Criteria,
  CriteriaPreview,
  CriteriaView,
  CriterionKind,
  Explanation,
  ExplanationItem,
  Extraction,
  FitSummary,
  Keyword,
  PassMark,
  PassMarkCount,
  PassMarkInput,
  RescoreProgress,
  RowRefusal,
  ScoreStatus,
  ScreeningSummary,
  Suggestion,
} from "./model";
import { NO_SCREENING } from "./model";
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
  assessment?: { percent: number } | null | undefined;
  belowCutoff?: boolean | undefined;
}): ScreeningSummary | null {
  const fit = fitFromRow(row);
  if (!fit) return null;
  return {
    fit,
    assessment: row.assessment?.percent ?? null,
    knockoutCount: row.knockoutCount ?? 0,
    belowPassMark: row.belowCutoff === true,
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
    standing: standingFromApi(detail.cutoff),
  };
}

/**
 * Where somebody stands against the pass mark, or `null` when the advert has none
 * or the server does not say. Somebody a person kept in the running is still shown
 * with the reasons they were flagged for, so the record never loses why.
 */
export function standingFromApi(
  cutoff: ApiScreeningDetail["cutoff"],
): Explanation["standing"] {
  if (!cutoff || cutoff.passMark === null) return null;
  return {
    below: cutoff.belowCutoff || cutoff.kept !== null,
    reasons: cutoff.reasons.map((reason) => ({
      kind: KIND_OF_REASON[reason.code],
      text: reason.text,
    })),
    kept: cutoff.kept,
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

/* ------------------------------------------------------------------ board cards */

/**
 * What a board card says about the application the person came through.
 *
 * `null` for somebody added by hand (no application, so no score, no answers and no
 * flags), and for an API that predates screening: nothing is drawn, rather than a
 * zero that would read as a verdict.
 */
export function cardScreeningFromApi(card: {
  jobApplicationId?: string | null | undefined;
  fitScore?: number | null | undefined;
  scoreStatus?: ApiScoreStatus | null | undefined;
  assessment?: { percent: number } | null | undefined;
  knockoutCount?: number | undefined;
  belowCutoff?: boolean | undefined;
}): ScreeningSummary | null {
  if (!card.jobApplicationId || !card.scoreStatus) return null;
  const fit = fitFromRow({
    score: card.fitScore,
    scoreStatus: card.scoreStatus,
  });
  return {
    fit: fit ?? NO_SCREENING.fit,
    assessment: card.assessment?.percent ?? null,
    knockoutCount: card.knockoutCount ?? 0,
    belowPassMark: card.belowCutoff === true,
  };
}

/* -------------------------------------------------------------------- pass mark */

export function passMarkFromApi(view: ApiCutoffView): PassMark {
  return {
    fitMin: view.fitScoreMin,
    assessmentMin: view.assessmentMinPct,
    assessmentMax: 100,
    assessmentTest: view.assessmentTest,
    flagKnockouts: view.flagKnockouts,
    tests: view.tests,
    /* The API does not list the knockout questions; the screen says a wrong answer flags. */
    knockouts: [],
    /* A pass mark is not versioned; when it was saved and by whom is what it keeps. */
    version: null,
    updatedAt: view.updatedAt,
    updatedBy: view.updatedBy,
  };
}

/** What is sent for a pass mark, or for the count of one that is not saved. */
export function cutoffToApi(input: PassMarkInput): ApiCutoffInput {
  return {
    fitScoreMin: input.fitMin,
    assessmentMinPct: input.assessmentMin,
    assessmentTest: input.assessmentTest,
    flagKnockouts: input.flagKnockouts,
  };
}

export function countFromApi(counts: ApiLiveCount): PassMarkCount {
  return {
    total: counts.undecided,
    below: counts.wouldBeBelow,
    byReason: {
      fit: counts.byReason.SCORE,
      assessment: counts.byReason.ASSESSMENT,
      knockout: counts.byReason.KNOCKOUT,
    },
    notScored: counts.withoutScore,
    noAssessment: counts.withoutAssessment,
    kept: counts.kept,
  };
}

/* ------------------------------------------------------------------- below list */

const KIND_OF_REASON: Record<ApiCutoffReason, BelowKind> = {
  SCORE: "FIT",
  ASSESSMENT: "ASSESSMENT",
  KNOCKOUT: "KNOCKOUT",
};

const REASON_OF_KIND: Record<BelowKind, ApiCutoffReason> = {
  FIT: "SCORE",
  ASSESSMENT: "ASSESSMENT",
  KNOCKOUT: "KNOCKOUT",
};

export function belowRowFromApi(row: ApiConfirmRow): BelowRow {
  const fit = fitFromRow({ score: row.score, scoreStatus: row.scoreStatus });
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    appliedAt: row.appliedAt,
    ...(row.scoreStatus === undefined && row.score === undefined
      ? { fitHidden: true }
      : {}),
    summary: {
      fit: fit ?? NO_SCREENING.fit,
      assessment: row.assessment?.percent ?? null,
      knockoutCount: row.knockoutCount,
      belowPassMark: true,
    },
    reasons: row.reasons.map((reason) => ({
      kind: KIND_OF_REASON[reason.code],
      text: reason.text,
    })),
    /* The API words a flagged answer in the reason itself. */
    flagged: [],
    state: row.state,
    stage: row.pipeline?.stage ?? null,
  };
}

/** The list's own words as the API's: what is asked for and what a bulk selection carries. */
export function confirmFilterToApi(filters: BelowFilters): ApiConfirmFilter {
  return {
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.reason ? { reason: REASON_OF_KIND[filters.reason] } : {}),
    ...(filters.state ? { state: filters.state } : {}),
  };
}

/* ------------------------------------------------------------------ assessments */

export function historyFromApi(answer: ApiAssessments): AssessmentHistory {
  return {
    current: answer.current.map((result) => ({ ...result })),
    entries: answer.history.map((entry, index) => ({
      /* The API gives no id for an entry: when and which test is its identity. */
      id: `${entry.at}:${entry.test}:${String(index)}`,
      at: entry.at,
      by: entry.by,
      source: entry.source,
      test: entry.test,
      score: entry.score,
      max: entry.max,
      percent: entry.percent,
      takenOn: entry.takenOn,
      cleared: entry.cleared,
    })),
  };
}

export function assessmentToApi(
  input: AssessmentEntryInput,
): ApiAssessmentInput {
  return {
    ...(input.test ? { test: input.test } : {}),
    score: input.score,
    max: input.max,
    takenOn: input.takenOn,
  };
}

/**
 * A file's rows under the headings the API's assessment import is built on, so a
 * part of it can be checked and later applied byte for byte the same. Blank cells
 * are left out rather than sent empty.
 */
export function importRowsFromFile(
  rows: readonly AssessmentRowInput[],
): ImportRow[] {
  return rows.map((row) => {
    const out: ImportRow = {};
    if (row.email) out["Applicant email"] = row.email;
    if (row.reference) out["Application reference"] = row.reference;
    out["Score"] = row.score;
    if (row.max) out["Out of"] = row.max;
    if (row.test) out["Test"] = row.test;
    if (row.date) out["Date taken"] = row.date;
    return out;
  });
}

/** The API's refusal of a row, in the nearest of our words. The sentence itself is always kept. */
export function refusalOf(problem: string): RowRefusal {
  if (/^Nobody who applied/.test(problem)) return "unmatched_email";
  if (/nothing to match this row on/.test(problem)) return "blank_email";
  if (/different result for/.test(problem)) return "duplicate_in_file";
  if (/is more than the maximum|is over 100/.test(problem))
    return "out_of_range";
  if (/is not a number|A score is required/.test(problem))
    return "not_a_number";
  return "refused";
}

/**
 * What the API said of one row of one checked part, as a row of the check.
 *
 * `input` is the row as the person's file had it, so the screen can show what they
 * wrote beside what the API made of it. `fileRow` is the row's number in the whole
 * file: a part counts from one.
 */
export function checkRowFromReport(
  report: ApiRowReport,
  input: AssessmentRowInput,
  fileRow: number,
): AssessmentRow {
  const cell = input.score.trim();
  const parsed = /^\s*([0-9.,]+)\s*\/\s*([0-9.,]+)\s*$/.exec(cell);
  const number = (text: string): number | null => {
    const cleaned = text.replace(/[%,]/g, "").trim();
    return /^\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : null;
  };
  const score = number(parsed ? (parsed[1] ?? "") : cell);
  const max =
    input.max.trim() !== ""
      ? number(input.max)
      : parsed
        ? number(parsed[2] ?? "")
        : null;
  const base = {
    row: fileRow,
    email: input.email.trim() || input.reference.trim() || null,
    name: report.name,
    score,
    max,
  };
  if (report.action === "skip" || report.errors.length > 0) {
    const first = report.errors[0];
    return {
      ...base,
      refusal: refusalOf(first?.problem ?? ""),
      message: report.errors.map((issue) => issue.problem).join(" ") || null,
      effect: null,
    };
  }
  const settled = report.warnings.some(
    (issue) =>
      /^Already recorded/.test(issue.problem) ||
      /Written once/.test(issue.problem),
  );
  return {
    ...base,
    refusal: null,
    message: report.warnings.map((issue) => issue.problem).join(" ") || null,
    effect: settled
      ? "unchanged"
      : report.action === "update"
        ? "replaces"
        : "new",
  };
}

/** The totals of a check, from its rows. */
export function tallyCheck(
  rows: readonly AssessmentRow[],
): Pick<
  AssessmentCheck,
  "total" | "usable" | "refused" | "replacing" | "unchanged"
> {
  const usable = rows.filter((row) => row.refusal === null);
  return {
    total: rows.length,
    usable: usable.length,
    refused: rows.length - usable.length,
    replacing: usable.filter((row) => row.effect === "replaces").length,
    unchanged: usable.filter((row) => row.effect === "unchanged").length,
  };
}
