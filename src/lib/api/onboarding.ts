"use client";

import { request, requestPaged } from "@/lib/api/client";

/**
 * Onboarding — `/api/v1/onboarding`.
 *
 * Typed wrappers only, in the same style as `offboarding.ts`. No React, no
 * state: this file knows the shape of the wire and nothing else.
 *
 * ## Nothing here needs starting
 *
 * A leaver's exit is created by an explicit `POST /offboarding` because
 * leaving needs authorising. Arriving does not — the checklist opens on its
 * own, seeded from whatever templates the company has, the moment somebody's
 * record is saved with `status: ONBOARDING`. There is no `start` here and no
 * `POST /onboarding` to call.
 *
 * ## Three lines answer themselves
 *
 * A task's `derived` flag is true when its answer comes from the employee
 * record rather than a tick — a bank account on file, a TIN recorded.
 * `updateTask` on one of those refuses with a 409; there is nothing to PATCH.
 *
 * ## What the read endpoints do instead of refusing
 *
 * `GET /onboarding` and `GET /onboarding/:id` **narrow** rather than 403 —
 * without `EDIT_RECORDS` / `MANAGE_HIRING` you see your own onboarding and
 * your reports'. A hidden record answers 404, not 403, so a screen must treat
 * "not found" as "not yours to see" and say neither.
 */

/* ------------------------------------------------------------------ enums */

/** Mirrors `OnboardingStatus`. */
export type OnboardingStatus = "IN_PROGRESS" | "COMPLETED";

/**
 * Mirrors `OnboardingDerivedCheck`. `NONE` is an ordinary manual tick; the
 * other three each name the employee field(s) that answer the task instead.
 */
export type OnboardingDerivedCheck =
  | "NONE"
  | "BANK_AND_PENSION"
  | "TIN_AND_NHF"
  | "PAYROLL_READY";

/* ----------------------------------------------------------------- shapes */

/** Counts, plus the percentage that drives the bar. Derived server-side. */
export type ApiOnboardingProgress = {
  total: number;
  done: number;
  mandatory: number;
  mandatoryDone: number;
  /** 0–100 over every task, mandatory or not. */
  percent: number;
};

/** One checklist line. */
export type ApiOnboardingTask = {
  id: string;
  label: string;
  /** `employee` | `hr` | `manager` | `it` — free text, not an enum. */
  owner: string;
  order: number;
  /** Days relative to the start date. Negative is before they arrive. */
  dueOffsetDays: number;
  mandatory: boolean;
  derivedFrom: OnboardingDerivedCheck;
  /** True when this reads from the record rather than a tick — not editable. */
  derived: boolean;
  completed: boolean;
  completedAt: string | null;
  /** The **account** that ticked it, not an employee. */
  completedByName: string | null;
  note: string | null;
};

/** `GET /onboarding/:id`, and the answer to every write on an onboarding. */
export type ApiOnboardingProcess = {
  id: string;
  employee: {
    id: string;
    name: string;
    employeeNo: string;
    jobTitle: string;
    departmentName: string | null;
    startDate: string;
  };
  manager: { id: string; name: string } | null;
  status: OnboardingStatus;
  /** "Working through the checklist", not "IN_PROGRESS". */
  statusLabel: string;
  managerApprovedByName: string | null;
  managerApprovedAt: string | null;
  hrApprovedByName: string | null;
  hrApprovedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  progress: ApiOnboardingProgress;
  tasks: ApiOnboardingTask[];
};

/**
 * A row on the list. Unlike offboarding's `ApiExitRow`, this carries its
 * tasks: the screen renders every row as a full card with its own checklist
 * inline, not a summary linking out to a detail page, so a summary-only row
 * would mean a second fetch per card.
 */
export type ApiOnboardingRow = {
  id: string;
  employee: {
    id: string;
    name: string;
    employeeNo: string;
    jobTitle: string;
    departmentName: string | null;
    startDate: string;
  };
  status: OnboardingStatus;
  statusLabel: string;
  progress: ApiOnboardingProgress;
  completedAt: string | null;
  tasks: ApiOnboardingTask[];
};

/**
 * `GET /onboarding/:id/readiness` — can this checklist close, and if not what
 * is in the way.
 *
 * `complete` runs the same calculation, so the bar and the refusal can never
 * disagree. **`blockers` are ready to render**: short lines, already in plain
 * language. Do not rewrite them on the client.
 */
export type ApiOnboardingReadiness = {
  onboardingId: string;
  status: OnboardingStatus;
  statusLabel: string;
  progress: ApiOnboardingProgress;
  approvals: {
    /** False when the person has no manager on their record. */
    manager: { required: boolean; done: boolean; byName: string | null; at: string | null };
    hr: { required: boolean; done: boolean; byName: string | null; at: string | null };
  };
  canComplete: boolean;
  blockers: string[];
  outstanding: ApiOnboardingTask[];
};

/** One line on the default checklist. Owned by Settings, not by this flow. */
export type ApiOnboardingTemplate = {
  id: string;
  label: string;
  owner: string;
  dueOffsetDays: number;
  order: number;
  mandatory: boolean;
  derivedFrom: OnboardingDerivedCheck;
  active: boolean;
};

/* ------------------------------------------------------------------ input */

export type OnboardingListParams = {
  page?: number;
  pageSize?: number;
  /** Allow-list: createdAt | status. */
  sort?: "createdAt" | "status";
  order?: "asc" | "desc";
  /** `open` is the default server-side: who is still onboarding. */
  state?: "open" | "closed" | "all";
  employeeId?: string;
  q?: string;
};

/**
 * Ticking a task off, or reopening one ticked by mistake. Refused with a 409
 * on a task whose `derived` is true — see the note at the top of this file.
 */
export type UpdateTaskBody = {
  completed?: boolean;
  note?: string;
};

export type TemplateBody = {
  label: string;
  owner: string;
  dueOffsetDays?: number;
  mandatory?: boolean;
  order?: number;
};

export type UpdateTemplateBody = Partial<TemplateBody> & { active?: boolean };

/* ------------------------------------------------------------------- calls */

const listQuery = (params: OnboardingListParams) => ({
  page: params.page,
  pageSize: params.pageSize,
  sort: params.sort,
  order: params.order,
  state: params.state,
  employeeId: params.employeeId,
  q: params.q,
});

export const onboardingApi = {
  /** Narrows to what the caller may see rather than refusing. */
  list: (params: OnboardingListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiOnboardingRow>("/onboarding", {
      query: listQuery(params),
      ...(signal ? { signal } : {}),
    }),

  get: (id: string, signal?: AbortSignal) =>
    request<ApiOnboardingProcess>(`/onboarding/${id}`, {
      ...(signal ? { signal } : {}),
    }),

  /** What the progress bar and a "close this out" action both read. */
  readiness: (id: string, signal?: AbortSignal) =>
    request<ApiOnboardingReadiness>(`/onboarding/${id}/readiness`, {
      ...(signal ? { signal } : {}),
    }),

  /** Returns the whole process, so a screen re-renders from one answer. */
  updateTask: (taskId: string, body: UpdateTaskBody) =>
    request<ApiOnboardingProcess>(`/onboarding/tasks/${taskId}`, {
      method: "PATCH",
      body,
    }),

  /** The manager signing off. `APPROVE_LEAVE_ALL`, and never themselves. */
  managerApprove: (id: string) =>
    request<ApiOnboardingProcess>(`/onboarding/${id}/manager-approve`, {
      method: "POST",
      body: {},
    }),

  /** HR signing off. `EDIT_RECORDS`. Refused ahead of the manager's. */
  hrApprove: (id: string) =>
    request<ApiOnboardingProcess>(`/onboarding/${id}/hr-approve`, {
      method: "POST",
      body: {},
    }),

  /**
   * Close the checklist through the gated door: refuses with a 422 while
   * anything mandatory is outstanding or either sign-off is missing, naming
   * it in the message and in `details.blockers`. On success the employee
   * moves from `ONBOARDING` to `ACTIVE` in the same transaction.
   *
   * This is **not** what "Finish onboarding" on the screen calls — that
   * button PATCHes the employee record directly and is deliberately not
   * gated on the checklist (see its own comment), which the API agrees with:
   * `employees/service.ts#update` closes the process from that side too, with
   * no readiness check, whenever a status change moves somebody away from
   * `ONBOARDING` by any path. This gated endpoint exists for a screen that
   * wants that rigor, which is not this one yet.
   */
  complete: (id: string) =>
    request<ApiOnboardingProcess>(`/onboarding/${id}/complete`, {
      method: "POST",
      body: {},
    }),

  /**
   * The default checklist. Empty until the company writes one or adopts the
   * suggested list — nothing seeds it on its own (PARITY.md Rule 3 still
   * applies: adopting is a choice, not something that happens to a company).
   */
  templates: (params: { includeInactive?: boolean } = {}, signal?: AbortSignal) =>
    request<{
      rows: ApiOnboardingTemplate[];
      counts: { total: number; active: number; mandatory: number };
    }>("/onboarding/templates", {
      query: { includeInactive: params.includeInactive === true ? "true" : undefined },
      ...(signal ? { signal } : {}),
    }),

  createTemplate: (body: TemplateBody) =>
    request<ApiOnboardingTemplate>("/onboarding/templates", { method: "POST", body }),

  updateTemplate: (id: string, body: UpdateTemplateBody) =>
    request<ApiOnboardingTemplate>(`/onboarding/templates/${id}`, {
      method: "PATCH",
      body,
    }),

  /** Switches the line off rather than destroying it — same reasoning as offboarding. */
  deactivateTemplate: (id: string) =>
    request<{ id: string; label: string; active: false; note: string }>(
      `/onboarding/templates/${id}`,
      { method: "DELETE" },
    ),

  /** Fill an empty checklist with the suggested eight. Refused once the company has one. */
  adoptDefaultTemplates: () =>
    request<{ added: number }>("/onboarding/templates/adopt-defaults", {
      method: "POST",
    }),

  reorderTemplates: (ids: string[]) =>
    request<{ reordered: number }>("/onboarding/templates/reorder", {
      method: "POST",
      body: { ids },
    }),
};

/* ------------------------------------------------------------------- copy */

/**
 * Who is meant to do it, in words.
 *
 * `owner` is free text against a small vocabulary, so an unrecognised value
 * is shown as-is rather than swallowed.
 */
export function ownerLabel(owner: string): string {
  const known: Record<string, string> = {
    employee: "The new starter",
    hr: "HR",
    manager: "Their manager",
    it: "IT",
  };
  return known[owner.trim().toLowerCase()] ?? owner;
}
