"use client";

import { request } from "@/lib/api/client";
import { fetchFile, type FileDownload } from "./download";

/**
 * The report builder — `/api/v1/reports`.
 *
 * ## Why there is no field picker over the whole schema
 *
 * Every competitor ships one. This is a fixed catalogue of datasets, each
 * backed by a read that already exists and already scopes itself. Adding a
 * dataset is a declaration on the API; there is nothing on this side that could
 * reach a row the reader could not have read another way.
 *
 * ## The three rules this client must not paper over
 *
 * 1. **A total says its own denominator.** `Total.over` and `Total.missing`
 *    travel with every figure and both have to reach the screen. A sum over a
 *    column with absences in it is the sum of the rows that had a figure, and a
 *    payroll total nobody can size is one somebody takes to a bank.
 * 2. **A total of nothing is `null`, not zero.** "Nobody has a figure" and "the
 *    figures come to nothing" are different facts.
 * 3. **A withheld column is named, never blanked.** `withheld` says which and
 *    why; a column of empty cells headed "Gross monthly" is a claim that nobody
 *    is paid.
 */

export type ApiColumnKind = "text" | "number" | "money" | "date" | "boolean";

export type ApiReportColumn = {
  key: string;
  label: string;
  kind: ApiColumnKind;
  permission?: string;
  groupable?: boolean;
  summable?: boolean;
  /** Whether this caller may see it at all. */
  available: boolean;
};

export type ApiReportFilter = {
  key: string;
  label: string;
  kind: "text" | "date" | "period" | "select";
  options?: string[];
  /**
   * Where this tenant's own options come from, for a `select` whose values are
   * company data rather than a fixed vocabulary.
   *
   * The catalogue cannot carry a department list, so it names the source. The
   * first version left `options` undefined for these and the builder rendered a
   * text box asking somebody to type a uuid — a control nobody can use.
   */
  optionsFrom?: "departments" | "payrollRuns";
  note?: string;
  required?: boolean;
};

export type ApiDataset = {
  id: string;
  label: string;
  /** What one row is. The single most useful sentence on the screen. */
  rowIs: string;
  description: string;
  /**
   * Whether this caller can read it. Listed either way on purpose: a dataset
   * that vanishes without a permission reads as a product that does not have
   * it, and then nobody knows to ask for the permission.
   */
  available: boolean;
  needs: string[];
  columns: ApiReportColumn[];
  filters: ApiReportFilter[];
};

export type ApiReportDefinition = {
  dataset: string;
  columns: string[];
  filters: Record<string, string>;
  groupBy?: string;
  sort?: { column: string; direction: "asc" | "desc" };
};

export type ApiCell = string | number | boolean | null;

export type ApiTotal = {
  column: string;
  /** Null when nothing was present. Never render this as 0. */
  value: number | null;
  over: number;
  missing: number;
};

export type ApiReportResult = {
  dataset: string;
  columns: { key: string; label: string; kind: ApiColumnKind }[];
  withheld: { key: string; label: string; reason: string }[];
  rows: ApiCell[][];
  grouped: { by: string; label: string; rows: number } | null;
  totals: ApiTotal[];
  rowCount: number;
  truncated: boolean;
};

export type ApiSavedReport = {
  id: string;
  name: string;
  description: string | null;
  definition: ApiReportDefinition;
  ownerId: string;
  mine: boolean;
  shared: boolean;
  datasetLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * How a total reads in one sentence.
 *
 * Written once so the table footer, the saved-report card and any future
 * surface cannot describe the same figure differently — and so that the
 * `missing` half can never be quietly dropped to shorten a line.
 */
export function totalNote(total: ApiTotal): string {
  if (total.value === null) {
    return total.missing === 0
      ? "Nothing to total."
      : `No figure on any of the ${String(total.missing)} rows, so there is no total.`;
  }
  return total.missing === 0
    ? `Over all ${String(total.over)} rows.`
    : `Over ${String(total.over)} rows. ${String(total.missing)} have no figure and are not in this total.`;
}

const signalOf = (signal?: AbortSignal) => (signal ? { signal } : {});

export const reportsApi = {
  catalogue: (signal?: AbortSignal) =>
    request<ApiDataset[]>("/reports/catalogue", signalOf(signal)),

  /** Run a definition without saving it — the builder's preview. */
  run: (definition: ApiReportDefinition) =>
    request<ApiReportResult>("/reports/run", {
      method: "POST",
      body: definition,
    }),

  saved: (signal?: AbortSignal) =>
    request<ApiSavedReport[]>("/reports", signalOf(signal)),

  save: (body: {
    name: string;
    description?: string | null;
    definition: ApiReportDefinition;
    shared?: boolean;
  }) => request<ApiSavedReport>("/reports", { method: "POST", body }),

  update: (
    id: string,
    body: {
      name?: string;
      description?: string | null;
      definition?: ApiReportDefinition;
      shared?: boolean;
    },
  ) => request<ApiSavedReport>(`/reports/${id}`, { method: "PATCH", body }),

  remove: (id: string) =>
    request<{ deleted: boolean }>(`/reports/${id}`, { method: "DELETE" }),

  /** Runs under the **reader's** permissions, never the author's. */
  runSaved: (id: string, signal?: AbortSignal) =>
    request<ApiReportResult>(`/reports/${id}/run`, signalOf(signal)),

  download: (id: string, name: string): Promise<FileDownload> =>
    fetchFile(`/reports/${id}/run.csv`, name),
};
