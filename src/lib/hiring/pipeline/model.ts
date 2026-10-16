import type { ApplicationOutcome } from "@/lib/api/recruitment";
import type {
  ScoreFilters,
  ScreeningSort,
  ScreeningSummary,
} from "@/lib/hiring/screening/model";
import type { StageType } from "./stage-types";
import type { TemplateStage } from "./template-rules";

/**
 * What the pipeline screens draw, whichever side it came from.
 *
 * The board, the table, the bulk bar and the talent pool read only these types.
 * `api-gateway.ts` turns the API's answers into them and `demo-gateway.ts` makes
 * them from a book kept in this browser, so a screen has one code path and
 * cannot quietly behave differently offline.
 *
 * No React, no state.
 */

/* ---------------------------------------------------------------------- tags */

/** A label a company puts on candidates: "Strong CV", "Call back in March". */
export type Tag = {
  id: string;
  name: string;
  /** `#rrggbb`, when the company picked one. */
  color?: string | null;
  /** How many applications carry it, when the source knows. */
  uses?: number;
};

/* ------------------------------------------------------ rejection reasons */

/** One of the company's own reasons for not going further with somebody. */
export type RejectionReason = {
  id: string;
  label: string;
  /** Switched off: kept on past rejections, not offered for new ones. */
  active: boolean;
  uses?: number;
};

/* ----------------------------------------------------------------- templates */

/** A company's pipeline: the stages a new role starts with. */
export type PipelineTemplate = {
  id: string;
  name: string;
  /** The one new roles start from unless somebody picks another. */
  isDefault: boolean;
  stages: TemplateStage[];
  /** How many roles were made from it, when the source knows. */
  usedBy?: number;
};

/* ------------------------------------------------------------- the board */

export type BoardStage = {
  id: string;
  name: string;
  order: number;
  /** `null` for a stage made before stages had types. */
  type: StageType | null;
  requiresScorecards: boolean;
};

export type BoardCard = {
  /** The pipeline application's id. */
  id: string;
  candidateId: string;
  name: string;
  email: string | null;
  /** What the person quotes: `APP-J7ET3745`. */
  reference: string | null;
  /** The channel they came by, as the API normalised it. */
  source: string | null;
  /** A knockout answer raised a flag. A reason to look, never a verdict. */
  flagged: boolean;
  /** The same email or phone as an earlier application. */
  duplicate: boolean;
  tags: Tag[];
  /** Kept on file for another role. */
  talentPool: boolean;
  stageId: string | null;
  stageName: string | null;
  /** ISO instant the application entered its stage. */
  stageEnteredAt: string;
  outcome: ApplicationOutcome;
  rejectionReason: string | null;
  /** The interview score, 1 to 5 to two places. `null` while nothing is scored; never 0. */
  score?: number | null;
  /** For somebody rejected or withdrawn: the day their record is scheduled to be deleted. */
  scheduledDeletionOn?: string | null;
  /**
   * Their fit score and its status, assessment score, wrong-answer count and
   * whether they are below the pass mark. Advice for a person. Absent from an API
   * that predates screening.
   */
  screening?: ScreeningSummary | null;
};

/** What narrows a board, a table or a bulk selection. */
export type BoardFilters = ScoreFilters & {
  /**
   * How a column is ordered: newest first unless this says otherwise. Not a
   * narrowing, so it never reaches a bulk selection.
   */
  sort?: ScreeningSort;
  /** Every word has to match the name or the email. */
  q?: string;
  tagId?: string;
  /** The channel, exactly as listed. */
  source?: string;
  /** Needs a look: a knockout answer was wrong. */
  flagged?: boolean;
  duplicate?: boolean;
  /** `YYYY-MM-DD`, inclusive: the day they entered the pipeline. */
  from?: string;
  to?: string;
  /** Kept on file for another role. */
  talentPool?: boolean;
};

/**
 * One column of a board, as the API draws it.
 *
 * Every stage is a column, in order. The two places a journey ends are read by
 * **outcome**, not by stage: a person is rejected by an outcome and hired by an
 * accepted offer, so those columns exist whether or not the pipeline has a stage
 * row of that type. The server says which is which; the screen draws what it is
 * given and never works the list out from the stages.
 */
export type BoardColumn = {
  /** `stage:<id>`, `outcome:HIRED` or `outcome:REJECTED`. */
  key: string;
  label: string;
  /** The stage behind it. `null` for a column read by outcome alone. */
  stageId: string | null;
  type: StageType | null;
  /** Set for the two end columns, whichever way they are keyed. */
  ends: "HIRED" | "REJECTED" | null;
  order: number;
};

/** A column with its first page and its true count. */
export type BoardColumnData = BoardColumn & {
  /** Everyone in the column under the filters, not the length of `cards`. */
  total: number;
  cards: BoardCard[];
  /** `null` on the last page. */
  next: string | null;
};

export type BoardData = { columns: BoardColumnData[] };

export type ColumnQuery = {
  requisitionId: string;
  /** A board column's key. */
  column: string;
  filters: BoardFilters;
  cursor: string | null;
  pageSize: number;
};

export type ColumnPage = {
  cards: BoardCard[];
  /** The count under these filters, not the length of this page. */
  total: number;
  /** `null` on the last page. */
  next: string | null;
};

/* ------------------------------------------------------------ talent pool */

/** Somebody kept on file for another role, with every role they have been in. */
export type TalentEntry = {
  candidateId: string;
  name: string;
  email: string | null;
  source: string | null;
  tags: Tag[];
  /** Why they were kept, in the words of whoever kept them. */
  note: string | null;
  applications: {
    /** The pipeline application, which the record opens by. */
    id: string;
    requisitionId: string;
    role: string;
    outcome: ApplicationOutcome;
    stageName: string | null;
    /** Why they were turned down, when they were. */
    reason: string | null;
  }[];
};

export type TalentQuery = {
  q?: string;
  tagId?: string;
  source?: string;
  cursor: string | null;
  pageSize: number;
};

export type TalentPage = {
  entries: TalentEntry[];
  total: number;
  next: string | null;
};

/* --------------------------------------------------------------- bulk work */

/** Who a bulk action is for: the ticked rows, or everyone a filter matches. */
export type BulkTarget =
  | { kind: "ids"; requisitionId: string; ids: string[] }
  | {
      kind: "filter";
      requisitionId: string;
      /** The column it was chosen in. */
      column: string;
      filters: BoardFilters;
      /** The count the person was shown and confirmed. */
      expected: number;
    };

export type BulkAction =
  | {
      type: "move";
      stageId: string;
      /** Only ever true when the person ticked it: send the stage's message to everybody moved. */
      sendEmail?: boolean;
    }
  | {
      type: "reject";
      reasonId: string;
      note: string | null;
      /** Only ever true when the person ticked it in the dialog. */
      sendEmail: boolean;
    }
  | { type: "tag"; tagId: string }
  | { type: "untag"; tagId: string }
  | { type: "talent-pool"; on: boolean };

export type BulkRefusal = {
  id: string;
  /** Who, in words, so a row of refusals is readable. */
  name: string;
  /** The API's own sentence. */
  reason: string;
};

export type BulkOutcome = {
  /** How many people the action was asked of. */
  requested: number;
  /** How many it was done for. */
  done: number;
  /** Nothing to do: already in that stage, already tagged. Not a failure. */
  skipped: number;
  refused: BulkRefusal[];
  /**
   * Emails the API says it queued. `null`: none were asked for. Queued is not sent:
   * each one's own status is on the person's record.
   */
  emailed: number | null;
  /** Why none (or fewer) were queued, in a sentence, when emails were asked for. */
  emailNote?: string | null;
};

/** What a screen shows while a long selection is worked through. */
export type BulkProgress = { done: number; total: number };
