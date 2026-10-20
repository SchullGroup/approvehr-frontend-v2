/**
 * What the screening screens draw, whichever side it came from.
 *
 * ## One rule runs through every name in here
 *
 * A score is **advice for a person**. Nothing in this module can say somebody was
 * turned down, because nothing here turns anybody down: a score, a pass mark and a
 * knockout flag only decide who is shown to a person first. The words the screens
 * use for the low end are "below the pass mark" and "needs a look", never
 * "rejected", "failed" or "eliminated", and `score.ts` is where those words live.
 *
 * ## "Unknown" is not "missing"
 *
 * A CV that does not say whether the person has five years of experience has not
 * said they lack it. Every criterion therefore comes back as one of four verdicts,
 * and the score leaves the unknown ones out of the sum rather than counting them
 * against anybody.
 *
 * No React, no state.
 */

/* ------------------------------------------------------------------ the score */

/**
 * Where a score is, in words a person can act on.
 *
 * - `SCORED`: there is a number.
 * - `WAITING_FOR_TEXT`: the CV is in the queue to be read; the number comes after.
 * - `NO_TEXT`: the file has nothing to read (a scan, a photograph). It needs a
 *   person to read it, and is never scored zero.
 * - `NO_CV`: no file was attached, so there is nothing to read. The answers on the
 *   form may still be looked at by a person.
 * - `NO_CRITERIA`: the advert has no criteria yet, so nothing can be scored.
 * - `COULD_NOT_READ`: the file would not open (damaged, locked, the wrong kind of
 *   file). The reason is on the record and, where the API offers it, a retry.
 */
export type ScoreStatus =
  | "SCORED"
  | "WAITING_FOR_TEXT"
  | "NO_TEXT"
  | "NO_CV"
  | "NO_CRITERIA"
  | "COULD_NOT_READ";

export const SCORE_STATUSES: readonly ScoreStatus[] = [
  "SCORED",
  "WAITING_FOR_TEXT",
  "NO_TEXT",
  "NO_CV",
  "NO_CRITERIA",
  "COULD_NOT_READ",
];

/** A fit score as a list row or a board card carries it. */
export type FitSummary = {
  status: ScoreStatus;
  /** A whole number from 0 to 100. `null` unless `status` is `SCORED`. */
  score: number | null;
  /** The version of the job's criteria it was worked out with. `null` when there is none. */
  version: number | null;
  /** Worked out with an older version than the job has now; a re-score is on its way. */
  stale: boolean;
};

/** What a row or a card says about a person's screening, in one place. */
export type ScreeningSummary = {
  fit: FitSummary;
  /** The imported or typed assessment score. `null` when there is none: never 0. */
  assessment: number | null;
  /** How many knockout answers raised a flag. A prompt to look, never a verdict. */
  knockoutCount: number;
  /** Below the job's pass mark (either figure, or a knockout). Advice, not a decision. */
  belowPassMark: boolean;
};

export const NO_SCREENING: ScreeningSummary = {
  fit: { status: "NO_CRITERIA", score: null, version: null, stale: false },
  assessment: null,
  knockoutCount: 0,
  belowPassMark: false,
};

/* ----------------------------------------------------------------- the criteria */

/** One skill or keyword, and the other ways a CV might write it. */
export type Keyword = {
  /** The client's own key while it is being edited; the API's id once saved. */
  id: string;
  label: string;
  aliases: string[];
  /** How much it counts within its list, 1 to 5. One unless somebody says more. */
  weight: number;
};

/**
 * How much each of the five parts counts for. They are shares, so only their
 * proportions matter and they need not add up to 100. `null` on the criteria means
 * "use the defaults", and the screen says what they are.
 */
export type Weights = {
  mustHave: number;
  niceToHave: number;
  experience: number;
  education: number;
  location: number;
};

export const WEIGHT_KEYS: readonly (keyof Weights)[] = [
  "mustHave",
  "niceToHave",
  "experience",
  "education",
  "location",
];

/**
 * One step on the ordered education scale. Level only: never a school, a course or
 * a grade. `examples` is the list of qualifications that count as the level.
 */
export type EducationLevel = {
  value: string;
  label: string;
  examples?: string;
};

export type Criteria = {
  mustHave: Keyword[];
  niceToHave: Keyword[];
  /** Whole or half years, or `null` for "not asked". */
  minYears: number | null;
  /** A `value` from the scale, or `null` for "not asked". */
  education: string | null;
  /** The cities, states or countries that count. Empty is "not asked". */
  places: string[];
  /** The form question whose answer says where somebody is. */
  locationQuestionId: string | null;
  /** The yes/no form question that says whether they would move. */
  relocateQuestionId: string | null;
  /** `null` uses the defaults. */
  weights: Weights | null;
};

export const NO_CRITERIA: Criteria = {
  mustHave: [],
  niceToHave: [],
  minYears: null,
  education: null,
  places: [],
  locationQuestionId: null,
  relocateQuestionId: null,
  weights: null,
};

/** A question on the advert's form, for pointing location at one. */
export type FormQuestionRef = { id: string; kind: string; label: string };

/** What an advert's criteria are right now, and what the screen needs to edit them. */
export type CriteriaView = {
  postingId: string;
  /** Whether there is anything to score against. Saved-but-empty reads as not. */
  configured: boolean;
  /** `null` until criteria have been saved once. Each save is a new version. */
  version: number | null;
  criteria: Criteria;
  /** The weights used when none are chosen, so the screen can say what they are. */
  defaults: Weights;
  /** Lowest first. */
  scale: EducationLevel[];
  /** The advert's form questions, for the two location questions. */
  formQuestions: FormQuestionRef[];
  /** How the score is worked out, in one line. The API's own words. */
  formula: string;
  /** What the score never looks at: the plain list the screen prints. */
  neverUsed: string[];
  updatedAt: string | null;
  updatedBy: string | null;
  /**
   * Only on what a save returns: whether it changed anything. Saving what is
   * already saved writes nothing and starts nothing, and the screen says so.
   */
  changed?: boolean;
  /** Only on what a save returns: what was quietly tidied ("kept once"). */
  notes?: string[];
};

/** A skill the advert's words suggest, with the sentence it came from. */
export type SuggestedKeyword = Keyword & {
  /** The sentence of the advert it was read from, trimmed. */
  from: string | null;
  confidence: Confidence | null;
};

/**
 * What "Suggest from the job description" brings back: chips to accept or edit,
 * each with the sentence that gave it. Nothing here is applied until a person says.
 */
export type Suggestion = {
  mustHave: SuggestedKeyword[];
  niceToHave: SuggestedKeyword[];
  minYears: number | null;
  minYearsFrom: string | null;
  education: string | null;
  educationFrom: string | null;
  places: string[];
  placesFrom: string | null;
  /** One line on where the words came from. */
  note: string | null;
};

/** One applicant in a preview: the score now, and the score under the draft. */
export type PreviewRow = {
  id: string;
  name: string;
  /** The score with the saved criteria. `null` when there is none. */
  current: number | null;
  /** The score with the draft. `null` when the draft cannot score them. */
  next: number | null;
  /** The draft's score less the current one, when both exist. */
  change: number | null;
  /** The draft's reasons in one line: "Matched: … Missing: …". */
  reasons: string | null;
};

/**
 * "This would score these applicants like so", before anything is saved.
 *
 * It is tried on a sample, the newest applicants whose CV has been read, because a
 * CV nobody has read has no words to try the draft on. It says how many there were
 * to sample from, so nobody reads it as a count of everybody.
 */
export type CriteriaPreview = {
  /** Applicants whose CV has been read: what the sample is drawn from. */
  available: number;
  /** How many were tried. */
  sampled: number;
  rows: PreviewRow[];
  /** Of the sample: how many the draft could score, and how many it could not. */
  scored: number;
  notScorable: number;
  mean: number | null;
  /** Of those scored: counts in bands of ten, lowest first. Ten numbers. */
  bands: number[];
};

/** Re-scoring after the criteria or the CV text changed. */
export type RescoreProgress = {
  running: boolean;
  done: number;
  total: number;
  /** Why it is running, in a word the screen can put a sentence to. */
  cause: "CRITERIA" | "PASS_MARK" | "CV_TEXT" | null;
  /**
   * The last pass stopped part way, and why. Scores may be out of date until it is
   * run again. `null` when the last pass finished, or none has run.
   */
  failure?: string | null;
};

export const NOT_RESCORING: RescoreProgress = {
  running: false,
  done: 0,
  total: 0,
  cause: null,
};

/* ------------------------------------------------------------- the explanation */

export type Verdict = "MATCHED" | "PARTIAL" | "MISSING" | "UNKNOWN";

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

/**
 * A short stretch of what somebody wrote, with the words that matched to be marked.
 * Never more than this: the text of the CV is not sent to the screen.
 */
export type Evidence = {
  /** Where the words are from. */
  source: "cv" | "cover_note" | "answer";
  /** The stretch, a few words either side, on one line. */
  text: string;
  /** What to mark inside it: the skill and its other spellings. May be empty. */
  marks: string[];
};

export type CriterionKind =
  "MUST_HAVE" | "NICE_TO_HAVE" | "YEARS" | "EDUCATION" | "LOCATION";

export type ExplanationItem = {
  id: string;
  kind: CriterionKind;
  /** What was asked: "Payroll", "At least 3 years", "A bachelor's degree". */
  label: string;
  verdict: Verdict;
  /** How sure the match is. */
  confidence: Confidence | null;
  /** What the criterion earned, 0 to 1, or `null` when it could not be judged. */
  value: number | null;
  evidence: Evidence[];
  /** One plain sentence where the verdict needs one ("States 7 years; dated roles add up to 4"). */
  note: string | null;
};

/** One of the five parts: what it is worth, and whether it counted. */
export type ExplanationGroup = {
  kind: CriterionKind;
  /** The weight the company gave it. */
  weight: number;
  /** How well the judged things in it did, 0 to 1. `null` when none could be judged. */
  value: number | null;
  /** It counted towards the score: something in it could be judged. */
  judged: boolean;
};

/** Whether the CV could be read, and what to do if not. */
export type Extraction = {
  state: "READY" | "PENDING" | "NO_TEXT" | "NO_CV" | "COULD_NOT_READ";
  /** Why, in words, when it could not be read. */
  reason: string | null;
  /** The API offers a retry. */
  canRetry: boolean;
};

/** Where somebody stands against the job's pass mark, and why, in words. */
export type Standing = {
  below: boolean;
  reasons: BelowReason[];
  /** A person kept them in the running: who, and the reason given. */
  kept: { reason: string; at: string; by: string | null } | null;
};

export type Explanation = {
  status: ScoreStatus;
  score: number | null;
  /**
   * How much of the weight could be judged at all, 0 to 100. A high score on a low
   * coverage means "what could be read was good", not "a great fit".
   */
  coverage: number | null;
  /** The one-line formula behind it, the API's own words. */
  formula: string | null;
  /** The version it was worked out with, and the one the job has now. */
  version: number | null;
  currentVersion: number | null;
  stale: boolean;
  groups: ExplanationGroup[];
  items: ExplanationItem[];
  extraction: Extraction;
  /** `null` or absent where the API does not say. */
  standing?: Standing | null;
};

/** Who an explanation, a retry or an assessment history is about. */
export type ScreeningSubject =
  { kind: "application"; id: string } | { kind: "pipeline"; id: string };

/* ------------------------------------------------------------------- pass mark */

/** A knockout answer that raises a flag, listed so the pass mark shows all of it. */
export type KnockoutRule = {
  id: string;
  question: string;
  /** The answer that raises the flag: "No". */
  flagWhen: string;
};

/** A test somebody has sat for this advert, and how many applicants have a result in it. */
export type AssessmentTest = {
  key: string;
  name: string;
  applicants: number;
};

export type PassMark = {
  /** `null` means no threshold on that figure. Two independent, optional inputs. */
  fitMin: number | null;
  /**
   * The assessment result a person needs, **as a percentage of what the test is
   * marked out of**. A test marked out of 60 and a test marked out of 100 can be
   * held to one pass mark because both are read as a percentage.
   */
  assessmentMin: number | null;
  /** The ceiling of that percentage. Always 100; kept so a screen need not know. */
  assessmentMax: number;
  /** The test the assessment mark reads, by name. `null`: the latest one entered. */
  assessmentTest: string | null;
  /** A wrong answer to a knockout question flags as well. On unless somebody turns it off. */
  flagKnockouts: boolean;
  /** The tests with results on this advert, to choose which one the mark reads. */
  tests: AssessmentTest[];
  /** The knockout questions, where the screen can list them. Empty where it cannot. */
  knockouts: KnockoutRule[];
  /** `null` until a pass mark has been saved. */
  version: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type PassMarkInput = Pick<
  PassMark,
  "fitMin" | "assessmentMin" | "assessmentTest" | "flagKnockouts"
>;

/** "412 of 4,210 would be below the pass mark", worked out before anything is saved. */
export type PassMarkCount = {
  /** The people it could apply to: waiting, or in the pipeline and still in progress. */
  total: number;
  below: number;
  byReason: { fit: number; assessment: number; knockout: number };
  /** People with no score yet. They are not counted as below, and the screen says so. */
  notScored: number;
  /** People with no assessment result yet, when the pass mark asks for one. */
  noAssessment: number;
  /** Below the line but kept in the running by a person, so not counted in `below`. */
  kept: number;
};

/* ---------------------------------------------------------- assessment scores */

/** Why a row of a file could not be used. */
export type RowRefusal =
  | "unmatched_email"
  | "ambiguous"
  | "out_of_range"
  | "not_a_number"
  | "duplicate_in_file"
  | "blank_email"
  /** The API refused it and said why in its own words (`message`). */
  | "refused";

/** What a row would do to the person it names. */
export type RowEffect = "new" | "replaces" | "unchanged";

export type AssessmentRow = {
  /** 1-based, header excluded. */
  row: number;
  email: string | null;
  /** Who it matched, when it matched somebody. */
  name: string | null;
  score: number | null;
  /** What the test was marked out of, when the row said. */
  max: number | null;
  /** `null` when the row is good. */
  refusal: RowRefusal | null;
  /** A sentence: the API's where it wrote one. */
  message: string | null;
  /** For a usable row: a first result, a newer one, or the one already on file. */
  effect: RowEffect | null;
};

/** What the person chose on screen that the file cannot say. */
export type AssessmentFileOptions = {
  /** The test's name when a row does not have one. Blank is the default name. */
  test: string;
};

/** What a dry run of a file says before anything is saved. */
export type AssessmentCheck = {
  filename: string;
  /** What the check was made on, for the commit to be given back. */
  token: string;
  total: number;
  usable: number;
  refused: number;
  /** Of the usable rows: a newer result for somebody who has one for that test. */
  replacing: number;
  /** Of the usable rows: already exactly what is on file, so nothing is written. */
  unchanged: number;
  rows: AssessmentRow[];
};

export type AssessmentResult = {
  /** Results written, new or newer. */
  saved: number;
  /** Rows that were already exactly as the file says. */
  unchanged: number;
  refused: number;
  /** How many people's pass-mark standing the new scores moved, when known. */
  movedBelow: number | null;
};

/** One test's result on a person's record, as it stands now. */
export type AssessmentCurrent = {
  test: string;
  score: number;
  max: number | null;
  /** 0 to 100, one decimal: what the pass mark reads. */
  percent: number;
  takenOn: string | null;
  source: "IMPORT" | "MANUAL";
  enteredAt: string;
};

/** One entry in a person's assessment history: every value ever set, newest first. */
export type AssessmentEntry = {
  id: string;
  at: string;
  /** Who imported or typed it. */
  by: string | null;
  source: "IMPORT" | "MANUAL";
  test: string;
  score: number | null;
  max: number | null;
  percent: number | null;
  takenOn: string | null;
  /** A person removed this result. The entry stays, so the history is whole. */
  cleared: boolean;
};

export type AssessmentHistory = {
  current: AssessmentCurrent[];
  entries: AssessmentEntry[];
};

/** A result typed on a person's record. */
export type AssessmentEntryInput = {
  /** `null` for the default test. */
  test: string | null;
  score: number;
  /** What it is marked out of; `null` when the score is already a percentage. */
  max: number | null;
  takenOn: string | null;
};

/* ----------------------------------------------------- below the pass mark */

export type BelowKind = "FIT" | "ASSESSMENT" | "KNOCKOUT";

export type BelowReason = {
  kind: BelowKind;
  /** "Fit 41, the pass mark is 50". The API's own words where it wrote them. */
  text: string;
};

/** Where somebody is: waiting in the queue, or already in the pipeline and in progress. */
export type BelowState = "WAITING" | "IN_PIPELINE";

export type BelowRow = {
  id: string;
  name: string;
  email: string | null;
  appliedAt: string;
  summary: ScreeningSummary;
  /**
   * The API sent no fit score for this person (they may not see scores on this job).
   * The row draws no fit badge, not one that says "not scored": that would tell them a
   * score exists to be seen.
   */
  fitHidden?: boolean;
  reasons: BelowReason[];
  /** The knockout answers that raised a flag, for the row to show at a glance. */
  flagged: { question: string; answer: string }[];
  state: BelowState;
  /** The pipeline stage they are in, for somebody who is in the pipeline. */
  stage: string | null;
};

export type BelowFilters = {
  q?: string;
  /** Only those below for this reason. */
  reason?: BelowKind;
  /** Only those waiting, or only those already in the pipeline. */
  state?: BelowState;
};

export type BelowQuery = {
  postingId: string;
  filters: BelowFilters;
  cursor: string | null;
  pageSize: number;
};

export type BelowPage = {
  rows: BelowRow[];
  /** Everybody below the pass mark under the filters. */
  total: number;
  next: string | null;
};

/** Everybody below the pass mark on a job, for the line above the list. */
export type BelowCount = { below: number; total: number };

export type BelowTarget =
  | { kind: "ids"; postingId: string; ids: string[] }
  | {
      kind: "filter";
      postingId: string;
      filters: BelowFilters;
      /** The count the person was shown and confirmed. */
      expected: number;
    };

export type BelowDecision = {
  /** The company's own reason. Required: turning somebody down is a decision with a record. */
  reasonId: string;
  note: string | null;
  /** Only ever true when the person ticked it in the dialog. */
  sendEmails: boolean;
};

export type BelowOutcome = {
  requested: number;
  done: number;
  skipped: number;
  refused: { id: string; name: string; reason: string }[];
  /** Emails the API says it queued. `null` when none were asked for. */
  emailed: number | null;
  emailNote?: string | null;
};

/* ------------------------------------------------------------ sort and filter */

export type ScreeningSort =
  "newest" | "fit-desc" | "fit-asc" | "assessment-desc" | "knockouts-desc";

export const SORTS: { value: ScreeningSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "fit-desc", label: "Highest fit score" },
  { value: "fit-asc", label: "Lowest fit score" },
  { value: "assessment-desc", label: "Highest assessment result" },
  { value: "knockouts-desc", label: "Most flagged answers" },
];

/** What narrows a list by score. All optional, all combined. */
export type ScoreFilters = {
  scoreMin?: number;
  scoreMax?: number;
  scoreStatus?: ScoreStatus;
};
