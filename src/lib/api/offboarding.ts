"use client";

import { request, requestPaged } from "@/lib/api/client";

/**
 * Offboarding — `/api/v1/offboarding`.
 *
 * Typed wrappers only, in the same style as `loans.ts` and `grades.ts`. No
 * React, no state: this file knows the shape of the wire and nothing else.
 *
 * ## No money crosses this boundary
 *
 * Unusually for this product, nothing here is an amount. "Final pay agreed" is a
 * checklist line somebody ticks, not a figure — the figure lives on the payroll
 * run. So there is no kobo/naira seam in this file, and if a future endpoint
 * grows one, it belongs at the bottom of this file and nowhere else.
 *
 * ## One resource, not six
 *
 * The incumbent splits this across `/exit/resignation-requests`,
 * `/exit/clearance-checklist`, `/exit/interviews`, `/exit/reports` and more. The
 * API here is one exit with tasks grouped by kind, which is why this file is a
 * few hundred lines rather than six modules. Keep it that way: a new kind of
 * checklist item is an `ExitTaskKind`, not a new endpoint.
 *
 * ## What the read endpoints do instead of refusing
 *
 * `GET /offboarding` and `GET /offboarding/:id` **narrow** rather than 403 —
 * without `EDIT_RECORDS` / `APPROVE_LEAVE_ALL` / `VIEW_SALARIES` you see your
 * own exit, your reports', and any exit where you hold a task. A hidden exit
 * answers 404, not 403, because a 403 would confirm that somebody's exit exists.
 * So a screen must treat "not found" as "not yours to see" and say neither.
 */

/* ------------------------------------------------------------------ enums */

/** Mirrors `ExitKind` in the Prisma schema. */
export type ExitKind =
  | "RESIGNATION"
  | "TERMINATION"
  | "END_OF_CONTRACT"
  | "RETIREMENT"
  | "DEATH_IN_SERVICE";

/**
 * Mirrors `ExitStatus`.
 *
 * `DRAFT` is in the enum and **nothing creates one** — it exists for a
 * save-and-continue that has not been built. Render it anyway: a status a screen
 * cannot render is a blank row.
 */
export type ExitStatus =
  | "DRAFT"
  | "AWAITING_MANAGER"
  | "AWAITING_HR"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "DECLINED"
  | "CANCELLED";

/** Mirrors `ExitTaskKind`. The five groups the checklist reads in, in order. */
export type ExitTaskKind =
  | "HANDOVER"
  | "EQUIPMENT"
  | "ACCESS"
  | "PAYROLL"
  | "PAPERWORK";

/**
 * Mirrors `ExitTaskOutcome`.
 *
 * `NOT_RETURNED` deliberately does **not** tick the task off — it records the
 * answer and keeps blocking. The only ways past it are `RETURNED` or `WAIVED`,
 * and `DAMAGED` / `NOT_RETURNED` / `WAIVED` all require a note, because each is
 * a claim somebody will be asked about later.
 */
export type ExitTaskOutcome =
  | "DONE"
  | "RETURNED"
  | "DAMAGED"
  | "NOT_RETURNED"
  | "WAIVED";

/* ----------------------------------------------------------------- shapes */

/** Counts, plus the percentage that drives the bar. Derived server-side. */
export type ApiExitProgress = {
  total: number;
  done: number;
  mandatory: number;
  mandatoryDone: number;
  /** 0–100 over every task, mandatory or not. */
  percent: number;
};

/** One checklist line. */
export type ApiExitTask = {
  id: string;
  kind: ExitTaskKind;
  /** "Access and email", not "ACCESS". Written by the API so copy ships once. */
  kindLabel: string;
  label: string;
  /** `employee` | `manager` | `hr` | `it` | `finance` — free text, not an enum. */
  owner: string;
  order: number;
  mandatory: boolean;
  /** Set when the role resolved to an actual person. Null means "whoever is free". */
  assigneeId: string | null;
  assigneeName: string | null;
  completed: boolean;
  completedAt: string | null;
  /** The **account** that ticked it, not an employee. See `verify` below. */
  completedByName: string | null;
  verified: boolean;
  verifiedAt: string | null;
  verifiedByName: string | null;
  outcome: ExitTaskOutcome | null;
  note: string | null;
  /** The asset-register row this line is about, once somebody links it. */
  assetAssignmentId: string | null;
};

export type ApiExitGroup = {
  kind: ExitTaskKind;
  label: string;
  tasks: ApiExitTask[];
};

/**
 * The exit interview.
 *
 * `recorded: false` with every field null is what `GET /:id/interview` answers
 * when there is none yet — a real answer, not an error. `wouldRecommend` stays
 * null when they would not say; coercing a refusal to a 3 poisons every average
 * built on it.
 */
export type ApiExitInterview = {
  recorded: boolean;
  conductedById: string | null;
  conductedByName: string | null;
  conductedAt: string | null;
  /** Set when they were offered the interview and said no. A finding, not a gap. */
  declinedAt: string | null;
  primaryReason: string | null;
  /** 1–5, or null. */
  wouldRecommend: number | null;
  wouldReturn: boolean | null;
  whatWorked: string | null;
  whatDidNot: string | null;
  notes: string | null;
};

/** `GET /offboarding/:id`, and the answer to every write on an exit. */
export type ApiExit = {
  id: string;
  employee: {
    id: string;
    name: string;
    employeeNo: string;
    jobTitle: string;
    departmentName: string | null;
  };
  manager: { id: string; name: string } | null;
  kind: ExitKind;
  kindLabel: string;
  reason: string | null;
  lastWorkingDay: string;
  /** When they told us, which is what notice is measured from. */
  noticeGivenOn: string;
  /** Days of notice given. Negative if the last day is already past. */
  noticeDays: number;
  status: ExitStatus;
  /** "Waiting for their manager", not "AWAITING_MANAGER". */
  statusLabel: string;
  managerApprovedByName: string | null;
  managerApprovedAt: string | null;
  hrApprovedByName: string | null;
  hrApprovedAt: string | null;
  declinedReason: string | null;
  completedAt: string | null;
  createdAt: string;
  progress: ApiExitProgress;
  groups: ApiExitGroup[];
  interview: ApiExitInterview | null;
};

/** A row on the list. No tasks — only the counts, which is all a row needs. */
export type ApiExitRow = {
  id: string;
  employee: {
    id: string;
    name: string;
    employeeNo: string;
    jobTitle: string;
    departmentName: string | null;
  };
  kind: ExitKind;
  kindLabel: string;
  reason: string | null;
  lastWorkingDay: string;
  status: ExitStatus;
  statusLabel: string;
  progress: ApiExitProgress;
  completedAt: string | null;
};

/**
 * `GET /offboarding/:id/readiness` — can this exit close, and if not what is in
 * the way.
 *
 * `complete` runs the same calculation, so the bar and the refusal can never
 * disagree. **`blockers` are ready to render**: short lines, already in plain
 * language, already naming the person or the item. Do not rewrite them on the
 * client — a second copy of that copy is a second copy that drifts.
 */
export type ApiExitReadiness = {
  exitId: string;
  status: ExitStatus;
  statusLabel: string;
  lastWorkingDay: string;
  /** Negative once the last working day has passed. */
  daysToLastWorkingDay: number;
  progress: ApiExitProgress;
  approvals: {
    manager: {
      /** False when the person has no manager on their record. */
      required: boolean;
      done: boolean;
      byName: string | null;
      at: string | null;
    };
    hr: { done: boolean; byName: string | null; at: string | null };
  };
  canComplete: boolean;
  blockers: string[];
  outstanding: ApiExitTask[];
  /** Ticked off, nobody has confirmed it yet. Not a blocker. */
  awaitingConfirmation: ApiExitTask[];
  /**
   * Read straight off the asset register, not off the checklist.
   *
   * Not a blocker: a stale register is not a reason somebody cannot leave. It is
   * shown because it is the thing nobody notices. This module does not write to
   * the register — marking an asset returned is the assets module's operation.
   */
  assetsStillHeld: {
    assignmentId: string;
    assetId: string;
    tag: string;
    name: string;
    assignedOn: string;
    returnRequired: boolean;
    /** Kobo. What the register says it cost. Null when nobody recorded one. */
    valueKobo: number | null;
  }[];
  finalPay: ApiExitFinalPay;
};

/**
 * The three things that move somebody's last payslip.
 *
 * Deliberately **not a total**. The final figure is the payroll run's — it is the
 * only thing holding the tax schedule, the proration divisor and the
 * reconciliation gate — and a second "final pay" computed on this screen would be
 * a second answer somebody has to reconcile against the payslip. So this names
 * what has to be decided and leaves the arithmetic where it belongs.
 *
 * This is the one place in this file where money crosses, so the kobo → naira
 * seam is here and nowhere else. `outstandingLoanKobo` and `heldValueKobo` are
 * integer kobo on the wire; `formatKobo` below is what a screen should render.
 */
export type ApiExitFinalPay = {
  lastWorkingDay: string;
  /** Still owed on a staff loan, in kobo. */
  outstandingLoanKobo: number;
  /** Days never taken, per type. Whether it is payable is company policy. */
  untakenLeave: { leaveType: string; days: number }[];
  /** What the register values the kit they still hold at, in kobo. */
  heldValueKobo: number;
  /** True once a "Final pay" line has been ticked off. */
  agreed: boolean;
};

/** One line on the default checklist. Owned by Settings, not by this flow. */
export type ApiExitTemplate = {
  id: string;
  kind: ExitTaskKind;
  kindLabel: string;
  label: string;
  owner: string;
  order: number;
  mandatory: boolean;
  /** Empty means every kind of exit. */
  appliesTo: ExitKind[];
  /** "Every exit", or the kinds spelled out. Written by the API. */
  appliesToLabel: string;
  active: boolean;
};

/* ------------------------------------------------------------------ input */

export type ExitListParams = {
  page?: number;
  pageSize?: number;
  /** Allow-list: lastWorkingDay | createdAt | status. */
  sort?: "lastWorkingDay" | "createdAt" | "status";
  order?: "asc" | "desc";
  status?: ExitStatus;
  kind?: ExitKind;
  /** `open` is the default server-side: what still needs work. */
  state?: "open" | "closed" | "all";
  employeeId?: string;
  q?: string;
};

/**
 * Starting an exit.
 *
 * `employeeId` absent means "mine" — what somebody resigning sends, and it needs
 * no permission. Naming anybody else, or any kind other than a resignation or a
 * retirement for yourself, needs `EDIT_RECORDS`; the service checks it and says
 * which of the two rules you hit.
 *
 * `reason` is required. The database allows null because an imported record may
 * not have one; the API does not, because a record we create can.
 */
export type StartExitBody = {
  employeeId?: string;
  kind: ExitKind;
  reason: string;
  /** `YYYY-MM-DD`. */
  lastWorkingDay: string;
  /** When they told us. Defaults to today server-side. */
  noticeGivenOn?: string;
};

/**
 * Changing a checklist line. At least one field, and the API refuses the
 * combinations that contradict themselves.
 *
 * | Send | Effect |
 * |---|---|
 * | `completed: true` | ticks it off as `DONE` |
 * | `completed: false` | reopens it, and clears the confirmation with it |
 * | `outcome: "RETURNED"` | ticks it off, recording what happened |
 * | `outcome: "NOT_RETURNED"` | records it and **keeps it blocking** |
 * | `outcome: "WAIVED"` + note | drops the requirement, with the reason on record |
 * | `assigneeId` | hands it to a person, and notifies them |
 * | `assetAssignmentId` | links it to the row on the asset register |
 *
 * `DAMAGED`, `NOT_RETURNED` and `WAIVED` all require `note`.
 */
export type UpdateTaskBody = {
  outcome?: ExitTaskOutcome;
  completed?: boolean;
  note?: string;
  /** `null` puts it back to the role rather than a named person. */
  assigneeId?: string | null;
  assetAssignmentId?: string | null;
};

/**
 * Recording the interview, or recording that it was declined.
 *
 * Every field is optional and the API refuses an empty one: send at least one
 * answer, or `declined: true`.
 */
export type InterviewBody = {
  conductedAt?: string;
  primaryReason?: string;
  /** 1–5. Leave it out rather than guessing if they would not say. */
  wouldRecommend?: number;
  wouldReturn?: boolean;
  whatWorked?: string;
  whatDidNot?: string;
  notes?: string;
  declined?: boolean;
};

export type TemplateBody = {
  kind: ExitTaskKind;
  label: string;
  owner: string;
  mandatory?: boolean;
  /** Empty array means every kind of exit. */
  appliesTo?: ExitKind[];
  order?: number;
};

export type UpdateTemplateBody = Partial<TemplateBody> & { active?: boolean };

/* ------------------------------------------------------------------- calls */

const listQuery = (params: ExitListParams) => ({
  page: params.page,
  pageSize: params.pageSize,
  sort: params.sort,
  order: params.order,
  status: params.status,
  kind: params.kind,
  state: params.state,
  employeeId: params.employeeId,
  q: params.q,
});

export const offboardingApi = {
  /** Narrows to what the caller may see rather than refusing. */
  list: (params: ExitListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiExitRow>("/offboarding", {
      query: listQuery(params),
      ...(signal ? { signal } : {}),
    }),

  get: (id: string, signal?: AbortSignal) =>
    request<ApiExit>(`/offboarding/${id}`, { ...(signal ? { signal } : {}) }),

  /** What the progress bar and the "Close this exit" button both read. */
  readiness: (id: string, signal?: AbortSignal) =>
    request<ApiExitReadiness>(`/offboarding/${id}/readiness`, {
      ...(signal ? { signal } : {}),
    }),

  /** Builds the checklist in the same transaction as the exit row. */
  start: (body: StartExitBody) =>
    request<ApiExit>("/offboarding", { method: "POST", body }),

  /** The manager releasing somebody. `APPROVE_LEAVE_ALL`, and never yourself. */
  managerApprove: (id: string) =>
    request<ApiExit>(`/offboarding/${id}/manager-approve`, {
      method: "POST",
      body: {},
    }),

  /** HR opening the checklist up. `EDIT_RECORDS`. */
  hrApprove: (id: string) =>
    request<ApiExit>(`/offboarding/${id}/hr-approve`, {
      method: "POST",
      body: {},
    }),

  /** Not going ahead. The reason is required and the subject is told. */
  decline: (id: string, reason: string) =>
    request<ApiExit>(`/offboarding/${id}/decline`, {
      method: "POST",
      body: { reason },
    }),

  /**
   * Taking it back.
   *
   * Needs **no permission** when it is your own notice — the whole point, since
   * requiring one would mean a resignation can only be undone by asking the
   * person you just told you were leaving. HR may cancel anybody's. Lands on
   * `CANCELLED`, not `DECLINED`: "we said no" and "they changed their mind" are
   * different facts and the enum has always had both.
   *
   * The reason is optional here and required on `decline`, which is deliberate.
   * Why somebody left is a field every report comes back to; why they changed
   * their mind is nobody's business but theirs.
   */
  withdraw: (id: string, reason?: string) =>
    request<ApiExit>(`/offboarding/${id}/withdraw`, {
      method: "POST",
      body: reason === undefined ? {} : { reason },
    }),

  /**
   * Close the record.
   *
   * Refuses with 422 while anything mandatory is outstanding, naming it in the
   * message and in `details.blockers`. On success the employee is **archived**
   * — `archivedAt`, status `EXITED`, `endDate` = the last working day — in the
   * same transaction. Nothing is ever deleted.
   */
  complete: (id: string) =>
    request<ApiExit & { note?: string; accessRevoked?: boolean }>(
      `/offboarding/${id}/complete`,
      { method: "POST", body: {} },
    ),

  /** Returns the whole exit, so a screen re-renders from one answer. */
  updateTask: (taskId: string, body: UpdateTaskBody) =>
    request<ApiExit>(`/offboarding/tasks/${taskId}`, { method: "PATCH", body }),

  /**
   * The second signature.
   *
   * Refuses when the verifier is the account that ticked it off, when nothing
   * has been ticked off, and on a second confirmation. Needs `EDIT_RECORDS`.
   */
  verifyTask: (taskId: string, note?: string) =>
    request<ApiExit>(`/offboarding/tasks/${taskId}/verify`, {
      method: "POST",
      body: note === undefined ? {} : { note },
    }),

  saveInterview: (id: string, body: InterviewBody) =>
    request<ApiExitInterview>(`/offboarding/${id}/interview`, {
      method: "POST",
      body,
    }),

  getInterview: (id: string, signal?: AbortSignal) =>
    request<ApiExitInterview & { exitId: string; employeeName: string }>(
      `/offboarding/${id}/interview`,
      { ...(signal ? { signal } : {}) },
    ),

  /**
   * The default checklist. Seeded on first read, so the screen is never empty.
   *
   * These five calls are the surface a Settings screen needs; the guided flow
   * itself does not use them, because a company should be able to process a
   * leaver without configuring anything first (PARITY.md Rule 3).
   */
  templates: (
    params: { includeInactive?: boolean; kind?: ExitKind } = {},
    signal?: AbortSignal,
  ) =>
    request<{
      rows: ApiExitTemplate[];
      counts: { total: number; active: number; mandatory: number };
    }>("/offboarding/templates", {
      query: {
        includeInactive: params.includeInactive === true ? "true" : undefined,
        kind: params.kind,
      },
      ...(signal ? { signal } : {}),
    }),

  createTemplate: (body: TemplateBody) =>
    request<ApiExitTemplate>("/offboarding/templates", { method: "POST", body }),

  updateTemplate: (id: string, body: UpdateTemplateBody) =>
    request<ApiExitTemplate>(`/offboarding/templates/${id}`, {
      method: "PATCH",
      body,
    }),

  /**
   * Switches the line off rather than destroying it. A line that has been on
   * real exits is part of their record, so it stops being offered instead of
   * ceasing to have existed.
   *
   * This used to be forced by the seeder — "no templates" meant "seed the
   * defaults", so deleting the last line brought all seven back the next time
   * somebody resigned. Nothing seeds on its own now, and the reason above is
   * the one that was always the real one.
   */
  deactivateTemplate: (id: string) =>
    request<{ id: string; label: string; active: false; note: string }>(
      `/offboarding/templates/${id}`,
      { method: "DELETE" },
    ),

  /**
   * Fill an empty checklist with the suggested seven. Refused once the company
   * has written anything of its own — adopting is a starting point, not a
   * merge into a list somebody has already ordered.
   */
  adoptDefaultTemplates: () =>
    request<{ added: number }>("/offboarding/templates/adopt-defaults", {
      method: "POST",
    }),

  reorderTemplates: (ids: string[]) =>
    request<{ reordered: number }>("/offboarding/templates/reorder", {
      method: "POST",
      body: { ids },
    }),
};

/* ------------------------------------------------------------------- copy */

/**
 * Kobo, as naira, for the final-pay card.
 *
 * The only money in this module, so its formatting lives beside its type rather
 * than in a shared helper nothing else here would use. Whole naira: a kobo on a
 * loan balance is noise on a screen whose job is "there is money outstanding".
 */
export function formatKobo(kobo: number): string {
  return `₦${Math.round(kobo / 100).toLocaleString("en-NG")}`;
}



/**
 * Kinds, for a picker.
 *
 * The labels are duplicated from the API on purpose: this list also has to
 * populate a form *before* any exit exists, and there is no endpoint that hands
 * back the vocabulary. `kindLabel` on a returned exit stays authoritative for
 * display — this is only the input side.
 */
export const EXIT_KINDS: { value: ExitKind; label: string; help: string }[] = [
  {
    value: "RESIGNATION",
    label: "They resigned",
    help: "They handed in notice.",
  },
  {
    value: "TERMINATION",
    label: "We let them go",
    help: "Dismissal or redundancy.",
  },
  {
    value: "END_OF_CONTRACT",
    label: "Their contract ended",
    help: "A fixed term ran out.",
  },
  { value: "RETIREMENT", label: "They retired", help: "" },
  {
    value: "DEATH_IN_SERVICE",
    label: "They died in service",
    help: "No handover is asked for.",
  },
];

/** What an employee may start for themselves. The API enforces the same two. */
export const SELF_SERVICE_KINDS: ExitKind[] = ["RESIGNATION", "RETIREMENT"];

/** Group labels, for a screen rendering a group that has no tasks in it yet. */
export const TASK_KIND_LABELS: Record<ExitTaskKind, string> = {
  HANDOVER: "Handover",
  EQUIPMENT: "Equipment",
  ACCESS: "Access and email",
  PAYROLL: "Final pay",
  PAPERWORK: "Paperwork",
};

/** The order the groups read in: what has to happen first, first. */
export const TASK_KIND_ORDER: ExitTaskKind[] = [
  "HANDOVER",
  "EQUIPMENT",
  "ACCESS",
  "PAYROLL",
  "PAPERWORK",
];

/**
 * Who is meant to do it, in words.
 *
 * `owner` is free text against a small vocabulary, so an unrecognised value is
 * shown as-is rather than swallowed — a company that typed "Ops" gets "Ops".
 */
export function ownerLabel(owner: string): string {
  const known: Record<string, string> = {
    employee: "The person leaving",
    manager: "Their manager",
    hr: "HR",
    it: "IT",
    finance: "Finance",
  };
  return known[owner.trim().toLowerCase()] ?? owner;
}

/** The four answers an equipment line can end on, with the label on the button. */
export const OUTCOME_CHOICES: {
  value: ExitTaskOutcome;
  label: string;
  /** True when the API requires a note with it. */
  needsNote: boolean;
}[] = [
  { value: "RETURNED", label: "Came back", needsNote: false },
  { value: "DAMAGED", label: "Came back damaged", needsNote: true },
  { value: "NOT_RETURNED", label: "Still not back", needsNote: true },
  { value: "WAIVED", label: "Writing it off", needsNote: true },
];

/** Reads on a badge. `DONE` never shows one — a ticked task speaks for itself. */
export const OUTCOME_LABELS: Record<ExitTaskOutcome, string> = {
  DONE: "Done",
  RETURNED: "Came back",
  DAMAGED: "Damaged",
  NOT_RETURNED: "Not back",
  WAIVED: "Written off",
};
