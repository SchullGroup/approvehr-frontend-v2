"use client";

import { request, requestPaged, type Paged } from "@/lib/api/client";
import type { CellKind } from "@/lib/imports/spec";

/**
 * Bulk import — `/api/v1/imports`.
 *
 * ## One route trio per entity
 *
 * Every call below takes the entity's slug — `employees` today — because the API
 * mounts the same three routes for every importable entity from one router
 * shape. A second entity needs no new wrapper here.
 *
 * Typed wrappers only, hand-written in the same style as `endpoints.ts`. The
 * flow they serve lives in `lib/store/imports.ts`; three things about the
 * endpoints are worth knowing before reading either.
 *
 * ## The rows travel twice
 *
 * `ImportBatch` stores the *report*, not the data, so `apply` is handed the same
 * rows again with `confirm: true`. The API keeps a fingerprint of what it
 * checked and refuses (409) if the second payload is not the first — which is
 * what makes the two steps mean something instead of being decoration. In
 * practice that means the client must keep the rows it validated, byte for byte,
 * and send exactly those. Reordering columns is safe; changing a salary is not.
 *
 * ## Money never leaves the file
 *
 * There is no kobo-to-naira boundary in this module, which is unusual here and
 * deliberate. A salary in an import is a **cell of text** — `162,632.00`,
 * `₦162,632`, `NGN 162632` — and the API parses it to integer kobo at one place
 * on its side. Parsing it here as well would mean two implementations of the
 * same conversion in the path of somebody's pay. The screen shows the text the
 * file contained; the API returns the figure it read.
 *
 * ## No file is uploaded
 *
 * The CSV is parsed in the browser (`lib/csv.ts`) and posted as rows.
 * `express.json` is capped at 100kb, so a real file is several requests — see
 * `CHUNK_ROWS` in the store for where that number comes from and why it is not
 * `maxRowsPerBatch`.
 */

/* ------------------------------------------------------------------- shapes */

/** What the row's cells are, as a CSV parser produces them. */
export type ImportCell = string | number | boolean | null;
export type ImportRow = Record<string, ImportCell>;

/**
 * One thing wrong with one cell.
 *
 * `column` is the heading **as sent** — which is the template's name for it,
 * because the client renames headings when it maps them. The store translates
 * it back to the heading the user's own file used before any of this reaches a
 * screen: an error naming a column they cannot find in Excel is not an error
 * message, it is a riddle.
 */
export type ApiRowIssue = {
  /** 1-based, header excluded, and relative to the batch that was sent. */
  row: number;
  column: string;
  /** What was in the cell. Null when the column is absent entirely. */
  value: string | null;
  problem: string;
};

/**
 * Something this row looks like, and the answer the API refuses to give itself.
 *
 * Creating a second record for one thing and dropping a row on suspicion are
 * both wrong, and only the customer knows which this is. `decision` is null until
 * they say, and while it is null the row does not import and says so.
 *
 * **How much of an entity's matching arrives here differs per entity, on
 * purpose.** People raise one of these only for the softer evidence — a shared
 * work email, a name plus a birthday — because a staff-number match is an
 * unambiguous update. Equipment raises one for *every* match, its own tag
 * included, because an asset tag in a spreadsheet is usually a partial
 * re-export and updating on it silently would rewrite the condition, the value
 * and the holder of kit already on file.
 */
export type ApiDuplicateMatch = {
  /** What matched, strongest evidence first within an entity. */
  on: "email" | "nameAndDateOfBirth" | "tag" | "serialNumber";
  /** The value in the file that matched. */
  value: string;
  /**
   * The matched record's key in the entity's own terms — a staff number, an
   * equipment tag. Print it beside `Dictionary.keyLabel`, never bare.
   */
  employeeNo: string;
  name: string;
  archived: boolean;
  decision: "skip" | "update" | null;
};

/**
 * A recommended field the row left empty.
 *
 * Neither an error nor a warning: both of those describe something wrong with a
 * cell, and this is a cell nobody wrote in. It never blocks — it is the list the
 * user acknowledges before confirming.
 */
export type ApiMissingField = {
  /** Our canonical field, so a fix can be typed into the right cell. */
  field: string;
  /** The heading it would have been under, in their words. */
  column: string;
  why: string;
  /**
   * True when a payroll run cannot pay this person at all without it, as
   * opposed to leaving only a schedule or a filing incomplete. Splits the
   * Fixes step's missing-details list into "needed to pay them" and "add
   * later".
   */
  important: boolean;
};

export type ApiRowReport = {
  row: number;
  /**
   * The row's key in the entity's own terms — a staff number, an equipment tag.
   *
   * Named for the first entity rather than renamed to `key`, because this is the
   * name on the wire. `Dictionary.keyLabel` is the word to print beside it.
   */
  employeeNo: string | null;
  name: string | null;
  /** What this row would do. `skip` means it has at least one error. */
  action: "create" | "update" | "skip";
  errors: ApiRowIssue[];
  /** Imported anyway, but somebody should look. */
  warnings: ApiRowIssue[];
  duplicate: ApiDuplicateMatch | null;
  missing: ApiMissingField[];
  /** True when the API made the staff number up because the file had none. */
  employeeNoGenerated: boolean;
};

/** One answer to one duplicate. `row` is 1-based within the part that was sent. */
export type ApiDuplicateDecision = { row: number; action: "skip" | "update" };

export type ApiDuplicateCounts = {
  /** Asked and not answered. Every one of these rows is being skipped for it. */
  undecided: number;
  skipping: number;
  updating: number;
};

export type ImportBatchStatus =
  | "PENDING"
  | "VALIDATED"
  | "APPLYING"
  | "COMPLETED"
  | "FAILED";

/** `POST /employees/validate`. Creates the batch; changes no employee data. */
export type ApiValidateResult = {
  batchId: string;
  filename: string;
  status: ImportBatchStatus;
  totalRows: number;
  toCreate: number;
  toUpdate: number;
  toSkip: number;
  /** A ready-to-print sentence that always names the skipped rows. */
  summary: string;
  /**
   * Named things the file refers to that are not settled yet, by kind.
   *
   * `{ departments, salaryGrades }` for people, `{ equipmentKinds, people }` for
   * equipment. A **map** rather than named fields, because what a row can refer
   * to is the entity's business: the screen renders one callout per key from its
   * own `ImportSurface.prerequisites`, and a key with no entry there still
   * renders with the names in it. Typing it as one entity's two keys is what
   * made the second entity's callouts unreachable.
   */
  missing: Record<string, string[]>;
  unmappedColumns: string[];
  /** Batch-level notes, so 110 identical row warnings are not 110 lines. */
  notes: string[];
  /** Every row, not only the failures. */
  rows: ApiRowReport[];
  duplicates: ApiDuplicateCounts;
  /** Rows that import with a recommended field empty. Never a blocker. */
  flagged: number;
  /**
   * A company-level fact rather than a per-row one: the organisation has no
   * PAYE state of its own, and at least one row here had none to fall back on
   * either. Only ever set for the employees entity.
   */
  missingOrgTaxState: boolean;
  fingerprint: string;
  maxRowsPerBatch: number;
};

/**
 * Counts only one entity's writer can report, spread flat onto the response.
 *
 * The API's driver spreads an entity's `extra` onto the apply result rather than
 * nesting it, so these arrive as siblings of `created` and `updated`. Every one
 * is **optional**, and that is the honest shape: `handedOver` on an employee
 * import is not zero, it is a question nobody asked. `ImportSurface.linkedStats`
 * names which ones a screen shows, and the result screen omits a stat whose key
 * is absent rather than rendering it as 0.
 */
export type ApiApplyExtras = {
  /** Employees: reporting lines resolved, by staff number or unambiguous name. */
  managersLinked?: number;
  /** Equipment: handovers recorded, so the register knows who has what. */
  handedOver?: number;
  /** Equipment: kinds the file introduced, each carrying its own return rule. */
  kindsAdded?: number;
  /**
   * Departments: units nested under a parent, resolved by name.
   *
   * Worth a stat of its own because it is the count that proves the two-pass
   * resolution did its job — a parent created by a later row of the same file
   * lands here exactly like one that already existed.
   */
  parentsLinked?: number;
  /** Departments: heads matched by work email or staff number. */
  headsSet?: number;
};

/** `POST /:entity/:batchId/apply`. */
export type ApiApplyResult = ApiApplyExtras & {
  batchId: string;
  filename: string;
  status: ImportBatchStatus;
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  summary: string;
  notes: string[];
  /**
   * Every row that did not land, not only the ones with something wrong.
   *
   * A duplicate the caller chose to skip is also a person who is not in the
   * directory. Which is which is readable from the row: `errors` for a problem,
   * `duplicate` for a decision.
   */
  skippedRows: ApiRowReport[];
  duplicates: ApiDuplicateCounts;
  flagged: number;
};

/** A row of `GET /imports`. */
export type ApiImportBatch = {
  id: string;
  kind: string;
  filename: string;
  status: ImportBatchStatus;
  totalRows: number;
  created: number;
  updated: number;
  failed: number;
  /** Who ran it. */
  by: string;
  createdAt: string;
  completedAt: string | null;
  summary: string;
  /**
   * Whether this batch still has rows outstanding *and* kept the file they
   * came from, so `imports.rows` has something to hand back.
   *
   * On the list rather than only the detail, so the history can offer the
   * button without fetching every batch to find out.
   */
  resumable: boolean;
};

/** `GET /imports/:batchId`. Rows with something to say; clean rows are the file. */
export type ApiImportBatchDetail = ApiImportBatch & {
  confirmedAt: string | null;
  rows: ApiRowReport[];
};

/** `GET /imports/:batchId/rows` — the file a batch can be picked up from. */
export type ApiImportBatchRows = {
  filename: string;
  kind: string;
  rows: ImportRow[];
};

export type ApiTemplateColumn = {
  column: string;
  required: boolean;
  /** Optional, and its absence is reported rather than ignored. */
  recommended: boolean;
  /** Headings that mean the same thing. What makes a real file work unedited. */
  alsoAccepted: readonly string[];
  example: string;
  note: string;
  /**
   * A date or an amount, when the column is one.
   *
   * Sent so the browser checks a cell against the same declaration the API does,
   * rather than holding a second opinion about which columns are dates. Absent
   * for a plain text column.
   */
  cell?: CellKind;
  /**
   * What the example row prints instead of `example`.
   *
   * The examples are realistic so they show the shape of a value, which is why a
   * few columns carry an obvious giveaway — otherwise the template's own example
   * row is a record somebody imports by accident.
   */
  templateExample?: string;
  /**
   * The exact values this column accepts, when it is a fixed, universal
   * vocabulary — the 37 tax states, `female`/`male`/`other`, `monthly`. Sent
   * so the workbook writer can turn the column into a real Excel dropdown
   * instead of a note somebody has to remember. Absent for most columns.
   */
  dropdown?: readonly string[];
};

/**
 * `GET /imports/template/:entity`.
 *
 * `accepts` is whatever vocabularies that entity has — the 36 states and FCT,
 * the employment types — so it is a loose record rather than a fixed shape. The
 * screen prints them; nothing branches on them.
 */
export type ApiImportTemplate = {
  kind: string;
  filename: string;
  columns: ApiTemplateColumn[];
  header: string[];
  exampleRow: Record<string, string>;
  /** Header and one example row, ready to save. */
  csv: string;
  accepts: Record<string, unknown>;
  maxRowsPerBatch: number;
  matching: string;
  /** The legend, as sentences. Printed on screen and into the file itself. */
  legend: string[];
};

export type BatchListParams = {
  page?: number;
  pageSize?: number;
  /** Searches the filename. */
  q?: string;
  /** `ImportKind` — the entity's kind, not its URL slug. */
  kind?: string;
  status?: ImportBatchStatus;
  sort?: "createdAt" | "filename" | "status";
  order?: "asc" | "desc";
};

/* -------------------------------------------------------------------- calls */

export const imports = {
  /** Step one. Writes the batch record and nothing else. */
  validate: (
    entity: string,
    body: {
      filename: string;
      rows: ImportRow[];
      /** Answers to duplicates found on a previous pass. Part of the fingerprint. */
      decisions?: ApiDuplicateDecision[];
    },
    signal?: AbortSignal,
  ) =>
    request<ApiValidateResult>(`/imports/${entity}/validate`, {
      method: "POST",
      body,
      ...(signal ? { signal } : {}),
    }),

  /**
   * Step two. The only call that writes to anybody's record.
   *
   * `confirm` is required on this side even though the API defaults it to
   * false, so no call site can be unclear about which pass it is asking for.
   * The rows must be the ones that were validated: see the fingerprint note at
   * the top of this file.
   */
  apply: (
    entity: string,
    batchId: string,
    body: {
      confirm: true;
      rows: ImportRow[];
      /** The same answers the check was run with — the fingerprint covers them. */
      decisions?: ApiDuplicateDecision[];
    },
    signal?: AbortSignal,
  ) =>
    request<ApiApplyResult>(`/imports/${entity}/${batchId}/apply`, {
      method: "POST",
      body,
      ...(signal ? { signal } : {}),
    }),

  list: (params: BatchListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiImportBatch>("/imports", {
      query: {
        page: params.page,
        pageSize: params.pageSize,
        q: params.q,
        kind: params.kind,
        status: params.status,
        sort: params.sort,
        order: params.order,
      },
      ...(signal ? { signal } : {}),
    }),

  get: (batchId: string, signal?: AbortSignal) =>
    request<ApiImportBatchDetail>(`/imports/${batchId}`, {
      ...(signal ? { signal } : {}),
    }),

  /**
   * The rows a past batch was checked from, for picking it up again.
   *
   * Its own call rather than a field on `get`, because this is the whole
   * spreadsheet and only the batch somebody chose to resume needs it. Refuses
   * with 422 when the batch kept no rows — it ran before the column existed,
   * or everything in it landed.
   */
  rows: (batchId: string, signal?: AbortSignal) =>
    request<ApiImportBatchRows>(`/imports/${batchId}/rows`, {
      ...(signal ? { signal } : {}),
    }),

  template: (entity: string, signal?: AbortSignal) =>
    request<ApiImportTemplate>(`/imports/template/${entity}`, {
      ...(signal ? { signal } : {}),
    }),
};

export type PagedImportBatches = Paged<ApiImportBatch>;
