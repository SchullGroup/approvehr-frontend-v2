"use client";

import { request } from "@/lib/api/client";

/**
 * The job role catalogue — `/api/v1/job-roles`.
 *
 * ## `jobRoleId` and `jobTitle` are not duplicates
 *
 * Every employee and every requisition carries both, deliberately. The id says
 * which catalogue row this *is*; the text says what it was **called at the
 * time**. So renaming a role never retitles an offer sent last year, and a
 * company that keeps no catalogue is unaffected because the id is optional for
 * ever. If you find yourself removing one of them as redundant, read
 * `JobRole`'s own doc comment first — the backend has an assertion pinning it.
 */

export type ApiJobRoleCompetency = {
  id: string;
  competencyId: string;
  name: string;
  /** What good looks like for this role, on the competency's own scale. */
  targetLevel: number;
  scaleMax: number;
  /** The competency has since been switched off. Surfaced, never filtered. */
  competencyArchived: boolean;
  /** Also expected of everybody. Redundant rather than wrong — see the API. */
  alsoCore: boolean;
};

export type ApiJobRole = {
  id: string;
  title: string;
  family: string | null;
  summary: string | null;
  /** One responsibility per line, as entered. */
  responsibilities: string | null;
  requirements: string | null;
  defaultGrade: {
    id: string;
    code: string;
    name: string;
    midGrossKobo: number | null;
  } | null;
  /** Derived on every read, never stored. */
  headcount: number;
  openRequisitions: number;
  archived: boolean;
  archivedAt: string | null;
};

export type ApiJobRoleDetail = ApiJobRole & {
  competencies: ApiJobRoleCompetency[];
};

export type JobRoleBody = {
  title?: string;
  family?: string | null;
  summary?: string | null;
  responsibilities?: string | null;
  requirements?: string | null;
  defaultGradeId?: string | null;
};

/**
 * What one person is judged on.
 *
 * `targetLevel` is **null** for a core competency and a number for a role's,
 * and that is not a gap — `Competency` has no target column, so "expected of
 * everybody" has never carried a figure. Render the absence, never a zero.
 */
export type ApiExpectedCompetency = {
  competencyId: string;
  name: string;
  scaleMax: number;
  targetLevel: number | null;
  source: "CORE" | "ROLE";
};

export type ApiExpected = {
  employeeId: string;
  jobRoleId: string | null;
  jobTitle: string;
  expected: ApiExpectedCompetency[];
};

export const jobRoles = {
  list: (signal?: AbortSignal) =>
    request<ApiJobRole[]>("/job-roles", { ...(signal ? { signal } : {}) }),

  get: (id: string, signal?: AbortSignal) =>
    request<ApiJobRoleDetail>(`/job-roles/${id}`, {
      ...(signal ? { signal } : {}),
    }),

  create: (body: JobRoleBody) =>
    request<ApiJobRoleDetail>("/job-roles", { method: "POST", body }),

  update: (id: string, body: JobRoleBody) =>
    request<ApiJobRoleDetail>(`/job-roles/${id}`, { method: "PATCH", body }),

  /** The whole set. An empty array means "the core set alone". */
  setCompetencies: (
    id: string,
    competencies: { competencyId: string; targetLevel: number }[],
  ) =>
    request<ApiJobRoleDetail>(`/job-roles/${id}/competencies`, {
      method: "PUT",
      body: { competencies },
    }),

  archive: (id: string) =>
    request<ApiJobRoleDetail & { stillOnIt: number }>(
      `/job-roles/${id}/archive`,
      { method: "POST" },
    ),

  restore: (id: string) =>
    request<ApiJobRoleDetail>(`/job-roles/${id}/restore`, { method: "POST" }),

  expectedOf: (employeeId: string, signal?: AbortSignal) =>
    request<ApiExpected>(`/job-roles/expected/${employeeId}`, {
      ...(signal ? { signal } : {}),
    }),
};

/**
 * What switching a role off actually does, written once.
 *
 * Rendered by the confirm dialog, so the sentence somebody reads before the
 * click and the thing that happens cannot describe each other differently.
 * Unlike a department, this is **allowed** with people still on it: a role
 * nobody hires into any more still describes the job the people left on it are
 * doing, and refusing would make the catalogue something people route around.
 */
export const ARCHIVE_ROLE_EFFECTS =
  "Nobody's record changes and nobody's job title moves. The role stops being " +
  "offered when adding somebody or raising a requisition, and anyone already " +
  "on it stays on it. It can be switched back on at any time.";
