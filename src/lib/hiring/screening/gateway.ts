import type {
  AssessmentCheck,
  AssessmentEntryInput,
  AssessmentFileOptions,
  AssessmentHistory,
  AssessmentResult,
  BelowCount,
  BelowDecision,
  BelowOutcome,
  BelowPage,
  BelowQuery,
  BelowTarget,
  Criteria,
  CriteriaPreview,
  CriteriaView,
  Explanation,
  PassMark,
  PassMarkCount,
  PassMarkInput,
  RescoreProgress,
  ScreeningSort,
  ScreeningSubject,
  Suggestion,
} from "./model";

/**
 * What the screening screens ask of whatever is behind them.
 *
 * Connected, it is the API (`api-gateway.ts`). In a demo it is a small book kept in
 * this browser (`demo-gateway.ts`), scored by a plain rule engine over invented
 * CVs. The screens are written against this and nothing else, so one code path
 * serves both and a screen cannot quietly behave differently offline.
 *
 * Every method that can be refused **throws an `ApiError` whose message is the
 * sentence to show**. The API writes those; the demo writes the same ones.
 */

export type BelowRequest = {
  target: BelowTarget;
  decision: BelowDecision;
  /** One per click: the same key from the same company is the same action. */
  idempotencyKey: string;
  signal: AbortSignal;
  onProgress: (progress: { done: number; total: number }) => void;
};

/** One row of a file, as typed: every cell is text until a side reads it. */
export type AssessmentRowInput = {
  /** 1-based, header excluded: what Excel shows. */
  row: number;
  email: string;
  /** The reference the applicant was given (APP-…), for a file that has it instead of an email. */
  reference: string;
  score: string;
  /** What the test was marked out of. Blank: the score is already a percentage. */
  max: string;
  /** The test's name, for a file that holds more than one. Blank: the name chosen on screen. */
  test: string;
  /** When it was taken. */
  date: string;
};

/**
 * What the other side can do. A screen offers only what is here, and says nothing
 * about the rest: a server that has criteria and scores but no pass mark yet is
 * not shown a pass mark it cannot keep.
 */
export type ScreeningSupport = {
  /** Pass mark, its live count and the recompute. */
  passMark: boolean;
  /** Importing and typing assessment scores. */
  assessment: boolean;
  /** The list of people below the pass mark, and deciding there. */
  below: boolean;
  /** The pipeline board's cards carry scores, and it can be sorted and filtered by them. */
  board: boolean;
  /** The board's columns and table can be put in score order. */
  boardSort: boolean;
  /** The board's columns and table can be narrowed to one score status. */
  boardStatus: boolean;
  /**
   * The list below the pass mark holds people who are already in the pipeline as
   * well as those waiting, so it can be narrowed to one or the other.
   */
  belowState: boolean;
  /** The sorts the queue can be asked for. */
  sorts: ScreeningSort[];
};

export type ScreeningGateway = {
  mode: "api" | "demo";
  supports: ScreeningSupport;

  criteria: {
    get(postingId: string, signal: AbortSignal): Promise<CriteriaView>;
    /**
     * Saves a new version. `baseVersion` is the one the person was editing, so two
     * people saving at once get a refusal naming the newer version rather than the
     * second silently winning.
     */
    save(
      postingId: string,
      criteria: Criteria,
      baseVersion: number | null,
    ): Promise<CriteriaView>;
    /** Words to put in chips from the advert's own text. The person accepts or edits. */
    suggest(postingId: string, signal: AbortSignal): Promise<Suggestion>;
    /** How the draft would score this advert's applicants, writing nothing. */
    preview(
      postingId: string,
      criteria: Criteria,
      signal: AbortSignal,
    ): Promise<CriteriaPreview>;
  };

  /** How far re-scoring has got. Asked again while it runs. */
  rescore: {
    progress(postingId: string, signal: AbortSignal): Promise<RescoreProgress>;
    /** Score everybody again. `null` where the API offers no such thing. */
    start: ((postingId: string) => Promise<void>) | null;
  };

  passMark: {
    get(postingId: string, signal: AbortSignal): Promise<PassMark>;
    /** How many would be below it, before it is saved. Writes nothing. */
    count(
      postingId: string,
      input: PassMarkInput,
      signal: AbortSignal,
    ): Promise<PassMarkCount>;
    /** Saves it and starts the recompute. It flags; it never rejects. */
    save(postingId: string, input: PassMarkInput): Promise<PassMark>;
  };

  /** Why somebody has the score they have. Staff only. */
  explanation(
    subject: ScreeningSubject,
    signal: AbortSignal,
  ): Promise<Explanation>;

  /** Ask for a CV to be read again. `null` where the API offers no retry. */
  retryReading: ((subject: ScreeningSubject) => Promise<void>) | null;

  assessment: {
    /** A CSV to fill in: the columns, and a line saying what each is. */
    template(): { filename: string; body: string };
    /** A dry run: every row's outcome, nothing saved. */
    check(
      postingId: string,
      filename: string,
      rows: AssessmentRowInput[],
      options: AssessmentFileOptions,
      signal: AbortSignal,
    ): Promise<AssessmentCheck>;
    /** Saves what the check said was usable, for the same file and the same options. */
    commit(
      postingId: string,
      check: AssessmentCheck,
      rows: AssessmentRowInput[],
      options: AssessmentFileOptions,
    ): Promise<AssessmentResult>;
    /** One person's result typed in by hand. */
    enter(
      subject: ScreeningSubject,
      input: AssessmentEntryInput,
    ): Promise<void>;
    /** Each test's result as it stands, and every value ever set. */
    history(
      subject: ScreeningSubject,
      signal: AbortSignal,
    ): Promise<AssessmentHistory>;
  };

  below: {
    /** The count for the line above the list and the badge on the advert. */
    count(postingId: string, signal: AbortSignal): Promise<BelowCount>;
    list(query: BelowQuery, signal: AbortSignal): Promise<BelowPage>;
    /**
     * A person's decision to turn many people down. Resolves when every one has
     * been settled. "Everyone matching" is checked against the confirmed count by
     * the API: if it is no longer true the action does not run, it throws.
     */
    reject(request: BelowRequest): Promise<BelowOutcome>;
    /** Takes one person off the list, with a short reason that is kept and audited. */
    keep(applicationId: string, reason: string): Promise<void>;
  };
};
