"use client";

import { request, requestPaged } from "@/lib/api/client";
import { fetchFile, type FileDownload } from "@/lib/api/download";
import type { ApplicationOutcome } from "@/lib/api/recruitment";
import type { StageType } from "@/lib/hiring/pipeline/stage-types";

/**
 * The pipeline's own endpoints: the board, bulk actions, tags, rejection reasons,
 * pipeline templates and the talent pool. `/api/v1/recruitment/*`.
 *
 * Everything the screens draw comes through `lib/hiring/pipeline/api-gateway.ts`,
 * which turns these shapes into the screens' own. This file knows the wire and
 * nothing else: no React, no state, no wording.
 */

/* ------------------------------------------------------------------- the board */

export type ApiTagRef = { id: string; name: string; color: string | null };

export type ApiBoardCard = {
  /** The pipeline application's id. */
  id: string;
  candidateId: string;
  name: string;
  email: string;
  source: string | null;
  appliedAt: string;
  stageEnteredAt: string;
  daysInStage: number;
  outcome: ApplicationOutcome;
  reference: string | null;
  flagged: boolean;
  knockoutCount: number;
  duplicate: boolean;
  talentPool: boolean;
  tags: ApiTagRef[];
  hasCv: boolean;
  /** For somebody rejected or withdrawn: why, as recorded. */
  rejection: {
    reason: string | null;
    reasonLabel: string | null;
    note: string | null;
  } | null;
};

export type ApiBoardColumn = {
  /** `stage:<id>`, `stage:none`, `outcome:HIRED` or `outcome:REJECTED`. */
  key: string;
  stageId: string | null;
  name: string;
  type: StageType | null;
  typeLabel: string | null;
  order: number;
  terminal: boolean;
  /** No stage row of this type exists; the column is read by outcome alone. */
  synthetic: boolean;
  /** Everybody in the column under the filters, not the length of `cards`. */
  count: number;
  cards: ApiBoardCard[];
  hasMore: boolean;
  nextCursor: string | null;
};

export type ApiBoard = {
  requisition: {
    id: string;
    reference: string;
    jobTitle: string;
    status: string;
    headcount: number;
    hired: number;
  };
  columns: ApiBoardColumn[];
  total: number;
  limit: number;
};

/** What narrows a board, as the API takes it. Booleans go as `"true"`. */
export type BoardParams = {
  limit?: number;
  cursor?: string;
  q?: string;
  tagId?: string;
  source?: string;
  flagged?: boolean;
  duplicate?: boolean;
  talentPool?: boolean;
  from?: string;
  to?: string;
};

/* ------------------------------------------------------------------------ bulk */

export type BulkActionKind =
  | "MOVE"
  | "REJECT"
  | "TAG"
  | "UNTAG"
  | "TALENT_POOL_ADD"
  | "TALENT_POOL_REMOVE";

/** The filter a bulk action or an export takes. Strict on the server. */
export type ApiSelectionFilter = {
  q?: string;
  tagId?: string;
  source?: string;
  flagged?: boolean;
  duplicate?: boolean;
  talentPool?: boolean;
  from?: string;
  to?: string;
  stageId?: string;
  outcome?: ApplicationOutcome;
  /** A board column's `key`. Send it for "select all N in this column". */
  column?: string;
};

export type ApiSelection = {
  requisitionId: string;
  applicationIds?: string[];
  filter?: ApiSelectionFilter;
  /** The count the person was shown. Required with `filter`. */
  expectedCount?: number;
};

export type BulkBody = {
  action: BulkActionKind;
  selection: ApiSelection;
  stageId?: string;
  reasonId?: string;
  note?: string | null;
  tagId?: string;
  dryRun?: boolean;
  idempotencyKey?: string;
};

export type ApiBulkJob = {
  id: string;
  action: BulkActionKind;
  status: "QUEUED" | "RUNNING" | "DONE" | "FAILED";
  total: number;
  applied: number;
  skipped: number;
  refused: number;
  pending: number;
  progress: number;
  requisitionId: string | null;
  subjectType: string;
  idempotencyKey: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** A sentence, on `FAILED`. */
  error: string | null;
};

export type ApiBulkRow = {
  subjectId: string;
  subjectType: string;
  name: string;
  status: "APPLIED" | "SKIPPED" | "REFUSED" | "PENDING";
  /** Stable: switch on it. */
  code: string | null;
  /** The same thing as a sentence. */
  message: string | null;
  settledAt: string | null;
};

export type ApiBulkAnswer = {
  dryRun: false;
  replay: boolean;
  job: ApiBulkJob;
  /** Every row when the job was small and is done; `null` when it was queued. */
  results: ApiBulkRow[] | null;
};

/* ------------------------------------------------------------ tags and reasons */

export type ApiTag = {
  id: string;
  name: string;
  color: string | null;
  candidateCount: number;
};

export type ApiReason = {
  id: string;
  label: string;
  order: number;
  starter: boolean;
  archived: boolean;
};

/* ------------------------------------------------------------------- templates */

export type ApiTemplateStage = {
  id: string;
  name: string;
  order: number;
  type: StageType;
  typeLabel: string;
  terminal: boolean;
  requiresScorecards: boolean;
};

export type ApiTemplate = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  archived: boolean;
  archivedAt: string | null;
  stages: ApiTemplateStage[];
  issues: { code: string; message: string }[];
  requisitionCount: number;
  createdAt: string;
  updatedAt: string;
};

export type TemplateBody = {
  name?: string;
  description?: string | null;
  stages?: { name: string; type: StageType; requiresScorecards?: boolean }[];
  isDefault?: boolean;
};

/* ----------------------------------------------------------------- talent pool */

export type ApiTalentRow = {
  candidateId: string;
  name: string;
  email: string;
  source: string | null;
  talentPoolSince: string | null;
  talentPoolNote: string | null;
  tags: ApiTagRef[];
  lastApplication: {
    requisitionId: string;
    requisitionReference: string;
    jobTitle: string;
    outcome: ApplicationOutcome;
    rejectionReasonLabel: string | null;
  } | null;
};

/* ----------------------------------------------------------------------- calls */

const BASE = "/recruitment";

export const pipelineApi = {
  board: (requisitionId: string, params: BoardParams, signal?: AbortSignal) =>
    request<ApiBoard>(`${BASE}/requisitions/${requisitionId}/board`, {
      query: { ...params },
      ...(signal ? { signal } : {}),
    }),
  boardColumn: (
    requisitionId: string,
    key: string,
    params: BoardParams,
    signal?: AbortSignal,
  ) =>
    request<ApiBoardColumn>(
      `${BASE}/requisitions/${requisitionId}/board/columns/${encodeURIComponent(key)}`,
      { query: { ...params }, ...(signal ? { signal } : {}) },
    ),

  move: (applicationId: string, stageId: string) =>
    request<unknown>(`${BASE}/applications/${applicationId}/move`, {
      method: "POST",
      body: { stageId },
    }),
  reject: (
    applicationId: string,
    body: { reasonId: string; note?: string | null },
  ) =>
    request<unknown>(`${BASE}/applications/${applicationId}/reject`, {
      method: "POST",
      body: {
        reasonId: body.reasonId,
        ...(body.note ? { note: body.note } : {}),
      },
    }),

  bulk: (body: BulkBody, signal?: AbortSignal) =>
    request<ApiBulkAnswer>(`${BASE}/bulk`, {
      method: "POST",
      body,
      ...(signal ? { signal } : {}),
    }),
  bulkJob: (id: string, signal?: AbortSignal) =>
    request<ApiBulkJob>(`${BASE}/bulk/${id}`, {
      ...(signal ? { signal } : {}),
    }),
  bulkResults: (
    id: string,
    params: { status?: ApiBulkRow["status"]; page?: number; pageSize?: number },
    signal?: AbortSignal,
  ) =>
    requestPaged<ApiBulkRow>(`${BASE}/bulk/${id}/results`, {
      query: { ...params },
      ...(signal ? { signal } : {}),
    }),

  /** POST with a body, answered with a file: the export carries a selection. */
  exportApplications: (
    requisitionId: string,
    body: {
      applicationIds?: string[];
      filter?: ApiSelectionFilter;
      expectedCount?: number;
    },
  ): Promise<FileDownload> =>
    fetchFile(
      `${BASE}/requisitions/${requisitionId}/applications/export.csv`,
      "candidates",
      undefined,
      "No file was produced.",
      body,
    ),

  listTags: (signal?: AbortSignal) =>
    request<ApiTag[]>(`${BASE}/tags`, { ...(signal ? { signal } : {}) }),
  createTag: (body: { name: string; color?: string | null }) =>
    request<ApiTag>(`${BASE}/tags`, { method: "POST", body }),
  updateTag: (id: string, body: { name?: string; color?: string | null }) =>
    request<ApiTag>(`${BASE}/tags/${id}`, { method: "PATCH", body }),
  deleteTag: (id: string) =>
    request<{ id: string; deleted: true; removedFrom: number }>(
      `${BASE}/tags/${id}`,
      { method: "DELETE" },
    ),
  setCandidateTags: (candidateId: string, tagIds: string[]) =>
    request<ApiTagRef[]>(`${BASE}/candidates/${candidateId}/tags`, {
      method: "PUT",
      body: { tagIds },
    }),

  addToTalentPool: (candidateId: string, note?: string | null) =>
    request<unknown>(`${BASE}/candidates/${candidateId}/talent-pool`, {
      method: "POST",
      body: note ? { note } : {},
    }),
  removeFromTalentPool: (candidateId: string) =>
    request<unknown>(`${BASE}/candidates/${candidateId}/talent-pool`, {
      method: "DELETE",
    }),
  talentPool: (
    params: {
      q?: string;
      tagId?: string;
      source?: string;
      page?: number;
      pageSize?: number;
    },
    signal?: AbortSignal,
  ) =>
    requestPaged<ApiTalentRow>(`${BASE}/talent-pool`, {
      query: { ...params },
      ...(signal ? { signal } : {}),
    }),

  listReasons: (signal?: AbortSignal) =>
    request<ApiReason[]>(`${BASE}/rejection-reasons`, {
      query: { includeArchived: true },
      ...(signal ? { signal } : {}),
    }),
  createReason: (body: { label: string }) =>
    request<ApiReason>(`${BASE}/rejection-reasons`, { method: "POST", body }),
  updateReason: (id: string, body: { label?: string; archived?: boolean }) =>
    request<ApiReason>(`${BASE}/rejection-reasons/${id}`, {
      method: "PATCH",
      body,
    }),

  listTemplates: (signal?: AbortSignal) =>
    request<ApiTemplate[]>(`${BASE}/pipeline-templates`, {
      ...(signal ? { signal } : {}),
    }),
  createTemplate: (body: TemplateBody) =>
    request<ApiTemplate>(`${BASE}/pipeline-templates`, {
      method: "POST",
      body,
    }),
  updateTemplate: (id: string, body: TemplateBody) =>
    request<ApiTemplate>(`${BASE}/pipeline-templates/${id}`, {
      method: "PATCH",
      body,
    }),
  duplicateTemplate: (id: string) =>
    request<ApiTemplate>(`${BASE}/pipeline-templates/${id}/duplicate`, {
      method: "POST",
      body: {},
    }),
  archiveTemplate: (id: string) =>
    request<ApiTemplate>(`${BASE}/pipeline-templates/${id}/archive`, {
      method: "POST",
    }),
  /** Gives a role that has no stages a template's pipeline. */
  applyTemplate: (requisitionId: string, templateId: string) =>
    request<unknown>(
      `${BASE}/requisitions/${requisitionId}/stages/apply-template`,
      {
        method: "POST",
        body: { templateId },
      },
    ),
};
