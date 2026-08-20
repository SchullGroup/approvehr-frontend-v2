"use client";

import { request, requestPaged, type Paged } from "@/lib/api/client";
import type {
  EmploymentStatusCode,
  EmploymentTypeCode,
} from "@/lib/imports/template";

/**
 * Bulk import — `/api/v1/imports`.
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

export type ApiRowReport = {
  row: number;
  employeeNo: string | null;
  name: string | null;
  /** What this row would do. `skip` means it has at least one error. */
  action: "create" | "update" | "skip";
  errors: ApiRowIssue[];
  /** Imported anyway, but somebody should look. */
  warnings: ApiRowIssue[];
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
  /** Named once, so they can be created in one go rather than row by row. */
  missing: { departments: string[]; salaryGrades: string[] };
  unmappedColumns: string[];
  /** Batch-level notes, so 110 identical row warnings are not 110 lines. */
  notes: string[];
  /** Every row, not only the failures. */
  rows: ApiRowReport[];
  fingerprint: string;
  maxRowsPerBatch: number;
};

/** `POST /employees/:batchId/apply`. */
export type ApiApplyResult = {
  batchId: string;
  filename: string;
  status: ImportBatchStatus;
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  /** Reporting lines resolved, by staff number or by an unambiguous name. */
  managersLinked: number;
  summary: string;
  notes: string[];
  /** The rows that did not land, so they can be fixed and imported again. */
  skippedRows: ApiRowReport[];
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
};

/** `GET /imports/:batchId`. Rows with something to say; clean rows are the file. */
export type ApiImportBatchDetail = ApiImportBatch & {
  confirmedAt: string | null;
  rows: ApiRowReport[];
};

export type ApiTemplateColumn = {
  column: string;
  required: boolean;
  /** Headings that mean the same thing. What makes a real file work unedited. */
  alsoAccepted: readonly string[];
  example: string;
  note: string;
};

/** `GET /imports/template/employees`. */
export type ApiImportTemplate = {
  kind: string;
  filename: string;
  columns: ApiTemplateColumn[];
  header: string[];
  exampleRow: Record<string, string>;
  /** Header and one example row, ready to save. */
  csv: string;
  accepts: {
    dates: string[];
    money: string;
    employmentTypes: EmploymentTypeCode[];
    statuses: EmploymentStatusCode[];
    taxStates: string[];
    genders: string[];
  };
  maxRowsPerBatch: number;
  matching: string;
};

export type BatchListParams = {
  page?: number;
  pageSize?: number;
  /** Searches the filename. */
  q?: string;
  kind?: "EMPLOYEES";
  status?: ImportBatchStatus;
  sort?: "createdAt" | "filename" | "status";
  order?: "asc" | "desc";
};

/* -------------------------------------------------------------------- calls */

export const imports = {
  /** Step one. Writes the batch record and nothing else. */
  validateEmployees: (
    body: { filename: string; rows: ImportRow[] },
    signal?: AbortSignal,
  ) =>
    request<ApiValidateResult>("/imports/employees/validate", {
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
  applyEmployees: (
    batchId: string,
    body: { confirm: true; rows: ImportRow[] },
    signal?: AbortSignal,
  ) =>
    request<ApiApplyResult>(`/imports/employees/${batchId}/apply`, {
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

  template: (signal?: AbortSignal) =>
    request<ApiImportTemplate>("/imports/template/employees", {
      ...(signal ? { signal } : {}),
    }),
};

export type PagedImportBatches = Paged<ApiImportBatch>;
