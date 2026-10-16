import type { ApiCvLink } from "@/lib/api/careers";
import type {
  EmailCatalog,
  EmailDraft,
  EmailPreview,
  EmailReadiness,
  EmailTemplate,
  MoveResult,
  MyAccess,
  MyApplication,
  MyApplicationPage,
  MyInterviewPage,
  MyScorecard,
  PanelMember,
  PreviewRequest,
  RetentionReport,
  ScorecardInput,
  StageSetting,
} from "@/lib/hiring/comms/model";
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

export type MoveInput = {
  /**
   * Whether to send the stage's message to the person moved. Always said, never
   * defaulted: the API sends one unless told not to, so a caller that did not
   * decide would be emailing somebody by accident.
   */
  sendEmail: boolean;
};

export type RejectResult = {
  /**
   * What the API says about the decline email, or `null` when none was asked for.
   * A screen never claims an email went out on anything but a `SENT` status.
   */
  email: MoveResult["email"];
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

  move(card: BoardCard, stageId: string, input: MoveInput): Promise<MoveResult>;
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

  /** A role's stages as the email and panel settings read them. */
  stages: {
    list(requisitionId: string, signal: AbortSignal): Promise<StageSetting[]>;
    /** `null` takes the message off the stage. */
    setEmail(
      requisitionId: string,
      stageId: string,
      templateId: string | null,
    ): Promise<void>;
    /** Replaces the panel with exactly these employees. */
    setPanel(
      requisitionId: string,
      stageId: string,
      employeeIds: string[],
    ): Promise<PanelMember[]>;
  };

  /** The company's emails to candidates. */
  emails: {
    catalog(signal: AbortSignal): Promise<EmailCatalog>;
    /** Whether an email asked for would actually leave, and in whose name. */
    readiness(signal: AbortSignal): Promise<EmailReadiness>;
    create(draft: EmailDraft): Promise<EmailTemplate>;
    update(
      id: string,
      patch: Partial<
        Pick<EmailDraft, "name" | "subject" | "body" | "isDefault">
      >,
    ): Promise<EmailTemplate>;
    archive(id: string): Promise<EmailTemplate>;
    restore(id: string): Promise<EmailTemplate>;
    /** Never throws for a half-typed field: it answers `valid: false` with the problems. */
    preview(
      request: PreviewRequest,
      signal: AbortSignal,
    ): Promise<EmailPreview>;
    /** The company's own switch for emails to candidates. */
    setEnabled(enabled: boolean): Promise<void>;
  };

  /** How long rejected and withdrawn candidates are kept. */
  retention: {
    report(signal: AbortSignal): Promise<RetentionReport>;
    /** Whole months, 1 to 120. `null` keeps them. */
    set(months: number | null): Promise<void>;
  };

  /** What an employee who is on a panel, or hires for a role, can reach: and nothing more. */
  mine: {
    access(signal: AbortSignal): Promise<MyAccess>;
    interviews(
      query: { awaitingMyScorecard: boolean; page: number; pageSize: number },
      signal: AbortSignal,
    ): Promise<MyInterviewPage>;
    applications(
      query: { includeClosed: boolean; page: number; pageSize: number },
      signal: AbortSignal,
    ): Promise<MyApplicationPage>;
    application(id: string, signal: AbortSignal): Promise<MyApplication>;
    submitScorecard(
      interviewId: string,
      input: ScorecardInput,
    ): Promise<MyScorecard>;
    /** `null` where there are no files to open. */
    openCv: ((applicationId: string) => Promise<ApiCvLink>) | null;
  };

  templates: {
    list(signal: AbortSignal): Promise<PipelineTemplate[]>;
    save(draft: TemplateDraft): Promise<PipelineTemplate>;
    duplicate(id: string): Promise<PipelineTemplate>;
    remove(id: string): Promise<void>;
    makeDefault(id: string): Promise<void>;
  };
};
