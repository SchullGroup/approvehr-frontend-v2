import type {
  BoardCard,
  BoardData,
  BoardFilters,
  BulkAction,
  BulkOutcome,
  BulkProgress,
  BulkTarget,
  ColumnPage,
  ColumnQuery,
  PipelineTemplate,
  RejectionReason,
  Tag,
  TalentPage,
  TalentQuery,
} from "./model";
import type { TemplateStage } from "./template-rules";

/**
 * What the pipeline screens ask of whatever is behind them.
 *
 * Connected, it is the API (`api-gateway.ts`). In a demo it is a book kept in this
 * browser (`demo-gateway.ts`). The board, the table, the bulk bar and the settings
 * pages are written against this and nothing else, so there is one code path: a
 * screen cannot quietly behave differently offline, which is how the first-hundred
 * limit stayed invisible in every demo.
 *
 * Every method that can be refused **throws an `ApiError` whose message is the
 * sentence to show**. The API writes those; the demo writes the same ones.
 */

export type RejectInput = {
  reasonId: string;
  note: string | null;
  /** Only ever true when the person ticked it in the dialog. */
  sendEmail: boolean;
};

export type RejectResult = {
  /**
   * What the API says about the decline email: `true` it was queued, `false` it
   * was asked for and skipped (the API says why in `note`), `null` it was not
   * asked for. A screen never claims an email went out on anything but `true`.
   */
  emailed: boolean | null;
  note: string | null;
};

export type TemplateDraft = {
  id: string | null;
  name: string;
  stages: TemplateStage[];
};

export type BoardQuery = {
  requisitionId: string;
  filters: BoardFilters;
  /** Cards per column on this first read. */
  limit: number;
};

export type ExportFile = { filename: string; body: string };

export type BulkRequest = {
  target: BulkTarget;
  action: BulkAction;
  /** One per click: the same key from the same company is the same action. */
  idempotencyKey: string;
  signal: AbortSignal;
  onProgress: (progress: BulkProgress) => void;
};

export type PipelineGateway = {
  mode: "api" | "demo";

  /**
   * The board: every column with its true count and its first page. The server
   * decides which columns there are; the screen draws what it is given.
   */
  board(query: BoardQuery, signal: AbortSignal): Promise<BoardData>;

  /** One page of one column, or of the whole role when `column` is `null`. */
  listCards(query: ColumnQuery, signal: AbortSignal): Promise<ColumnPage>;

  move(card: BoardCard, stageId: string): Promise<void>;
  reject(card: BoardCard, input: RejectInput): Promise<RejectResult>;
  setTag(card: BoardCard, tagId: string, on: boolean): Promise<void>;
  setTalentPool(card: BoardCard, on: boolean): Promise<void>;

  /**
   * One action for many people. Resolves when every one has been settled, so the
   * outcome accounts for everybody asked: done, skipped (nothing to do) or
   * refused, each refusal with the API's sentence.
   *
   * "Everyone matching" is checked against `target.expected` by whoever acts on
   * it. If the count is no longer true the action does not run: it throws.
   */
  bulk(request: BulkRequest): Promise<BulkOutcome>;

  /** A spreadsheet of the people given. */
  exportCards(target: BulkTarget): Promise<ExportFile>;

  talentPool: {
    list(query: TalentQuery, signal: AbortSignal): Promise<TalentPage>;
    /** Takes a person out. Their applications are not changed. */
    remove(candidateId: string): Promise<void>;
  };

  tags: {
    list(signal: AbortSignal): Promise<Tag[]>;
    create(name: string): Promise<Tag>;
    rename(id: string, name: string): Promise<void>;
    remove(id: string): Promise<void>;
  };

  reasons: {
    list(signal: AbortSignal): Promise<RejectionReason[]>;
    create(label: string): Promise<RejectionReason>;
    update(
      id: string,
      change: { label?: string; active?: boolean },
    ): Promise<void>;
  };

  templates: {
    list(signal: AbortSignal): Promise<PipelineTemplate[]>;
    save(draft: TemplateDraft): Promise<PipelineTemplate>;
    duplicate(id: string): Promise<PipelineTemplate>;
    remove(id: string): Promise<void>;
    makeDefault(id: string): Promise<void>;
  };
};
