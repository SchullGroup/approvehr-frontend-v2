"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ApiError } from "@/lib/api/client";
import {
  offboardingApi,
  TASK_KIND_LABELS,
  TASK_KIND_ORDER,
  type ApiExit,
  type ApiExitGroup,
  type ApiExitInterview,
  type ApiExitProgress,
  type ApiExitReadiness,
  type ApiExitRow,
  type ApiExitTask,
  type ApiExitTemplate,
  type ExitKind,
  type ExitListParams,
  type ExitStatus,
  type ExitTaskKind,
  type ExitTaskOutcome,
  type InterviewBody,
  type StartExitBody,
  type TemplateBody,
  type UpdateTaskBody,
  type UpdateTemplateBody,
} from "@/lib/api/offboarding";
import { employeeById } from "@/lib/mock/people";
import { useCan } from "@/lib/permissions";
import { remainingDays } from "@/lib/workflows/leave";
import { TODAY } from "@/lib/today";
import { createPersistedState } from "./persisted";
import { useLeaveBalances } from "./leave-balances";
import { useSession } from "./session";
import { useEmployeeStore } from "./employees";
import { useRevalidation } from "@/lib/revalidate";

/**
 * Leavers, from whichever source is available.
 *
 * ## Why the demo can write
 *
 * `store/departments.ts` refuses its writes with no API, and that is right for
 * it: a department is a payroll reporting boundary, so a tree built in browser
 * storage would teach a demo's audience something false about where that number
 * lives.
 *
 * An exit is not that. It is a request somebody made and somebody else answered
 * — the same shape as a leave request, which `store/leave.ts` has always
 * persisted locally. And the whole argument of this module is the *flow*: two
 * approvals, a checklist, a second signature, a close that refuses while
 * anything mandatory is open. A flow you cannot walk through is not a
 * demonstration of it.
 *
 * So the demo runs the flow, and **every refusal the server makes, this file
 * makes too**, with the same wording:
 *
 * | Rule | Where |
 * |---|---|
 * | An exit always has its checklist | `generateTasks` runs inside `demoStart` |
 * | Manager releases, then HR approves — never one signature for both | `demoManagerApprove` / `demoHrApprove` |
 * | You cannot approve your own exit | `demoManagerApprove` |
 * | You cannot confirm a task you ticked off yourself | `demoVerifyTask` |
 * | `NOT_RETURNED` records the answer and keeps blocking | `demoUpdateTask` |
 * | Closing refuses while anything mandatory is open, and names it | `buildReadiness` |
 * | The employee is archived, never deleted | `useExit().complete` |
 *
 * A demo that let you close an exit with the laptop still out would be worse
 * than no demo, because the one thing this module sells is that it does not let
 * you.
 *
 * ## Where the demo is honestly thinner
 *
 * - **`assetsStillHeld` is always empty.** It is read straight off the asset
 *   register, and there is no register in this browser. An empty list is the
 *   truthful answer, and it is not a blocker anywhere.
 * - **One signed-in person.** The two-person rule therefore bites: you cannot
 *   confirm what you ticked. That is not a limitation to work around — it is the
 *   control, working. Confirmation is never a blocker, so the flow still closes.
 * - **The money on the final-pay card is zero.** There is no loan book and no
 *   equipment register in this browser to read one from. Untaken leave *is* real
 *   — it comes from the leave store through `useLeaveBalances` — and the card
 *   shows a line only where there is something to show, so nothing reads as an
 *   invented figure. Connected, all three are real.
 * - **An exit does not appear in `/approvals`.** Connected, the API writes an
 *   `ApprovalRequest` index row when an exit is raised and the inbox picks it up
 *   with no frontend change. The demo inbox is derived from the leave requests by
 *   `lib/workflows/queue.ts`, and adding exits to it means a third `QueueRef`
 *   variant and a decide path that reaches these writes — which are `useExit(id)`
 *   hooks rather than free functions. Worth doing; not done, and stated here
 *   rather than left for somebody to find by demonstrating it.
 */

/* ------------------------------------------------------------ demo shapes */

type DemoTask = {
  id: string;
  kind: ExitTaskKind;
  label: string;
  owner: string;
  order: number;
  mandatory: boolean;
  assigneeId: string | null;
  completedAt: string | null;
  /**
   * Who ticked it off. An **employee** id here, where the API holds a *user*
   * id — because a demo session has no user account, only a person. The rule it
   * exists for ("not the same actor twice") is identical either way.
   */
  completedById: string | null;
  verifiedAt: string | null;
  verifiedById: string | null;
  outcome: ExitTaskOutcome | null;
  note: string | null;
  assetAssignmentId: string | null;
};

type DemoExit = {
  id: string;
  employeeId: string;
  /** For a record created in this browser, which `employeeById` cannot resolve. */
  employeeSnapshot: {
    name: string;
    employeeNo: string;
    jobTitle: string;
    departmentName: string | null;
  };
  managerId: string | null;
  kind: ExitKind;
  reason: string;
  lastWorkingDay: string;
  noticeGivenOn: string;
  status: ExitStatus;
  managerApprovedById: string | null;
  managerApprovedAt: string | null;
  hrApprovedById: string | null;
  hrApprovedAt: string | null;
  declinedReason: string | null;
  completedAt: string | null;
  createdAt: string;
  tasks: DemoTask[];
  interview: ApiExitInterview | null;
};

/**
 * The company's own checklist, editable in the demo.
 *
 * Stored as a whole list rather than as a diff against `DEFAULT_TASKS`, because
 * that is what the API returns and a screen should not be able to tell which
 * source it is reading. `active: false` mirrors the server's "switched off, not
 * destroyed" — deleting a line would bring it straight back, since a company with
 * no templates is a company that gets the defaults seeded.
 */
type DemoTemplate = {
  id: string;
  kind: ExitTaskKind;
  label: string;
  owner: string;
  order: number;
  mandatory: boolean;
  appliesTo: ExitKind[];
  active: boolean;
};

type DemoState = { exits: DemoExit[]; templates: DemoTemplate[] };

/* ----------------------------------------------------------------- labels */

/** Plain language, because "AWAITING_HR" is not a sentence anybody says. */
const STATUS_LABELS: Record<ExitStatus, string> = {
  DRAFT: "Not sent yet",
  AWAITING_MANAGER: "Waiting for their manager",
  AWAITING_HR: "Waiting for HR",
  IN_PROGRESS: "Working through the checklist",
  COMPLETED: "Closed",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
};

const KIND_LABELS: Record<ExitKind, string> = {
  RESIGNATION: "Resignation",
  TERMINATION: "Termination",
  END_OF_CONTRACT: "End of contract",
  RETIREMENT: "Retirement",
  DEATH_IN_SERVICE: "Death in service",
};

const OPEN_STATUSES: ExitStatus[] = [
  "DRAFT",
  "AWAITING_MANAGER",
  "AWAITING_HR",
  "IN_PROGRESS",
];

const CLOSED_STATUSES: ExitStatus[] = ["COMPLETED", "DECLINED", "CANCELLED"];

const DAY_MS = 86_400_000;

/* -------------------------------------------------------- the default list */

/**
 * A port of `DEFAULT_EXIT_TEMPLATES` in the backend's `templates.ts`.
 *
 * Seven lines, no padding: each one is something that actually goes wrong when
 * it is missed. Two are narrowed by kind, and both narrowings are the reason the
 * column exists — you cannot ask somebody who died in service to write handover
 * notes, and a reference letter is not part of a dismissal.
 *
 * This is a second copy of a list, which is normally a mistake. It is here
 * because the API seeds the real one lazily on first read, and a demo with no
 * checklist would show an exit that looks handled and does nothing. If the two
 * ever disagree, the served one is right.
 */
const DEFAULT_TASKS: readonly {
  kind: ExitTaskKind;
  label: string;
  owner: string;
  mandatory: boolean;
  appliesTo: ExitKind[];
  /** Never set on a default — every seeded line is on. Here so the defaults and
      the company's own edited list are the same shape to `generateTasks`. */
  active?: boolean;
}[] = [
  {
    kind: "HANDOVER",
    label: "Handover notes written and passed to the manager",
    owner: "employee",
    mandatory: true,
    appliesTo: ["RESIGNATION", "TERMINATION", "END_OF_CONTRACT", "RETIREMENT"],
  },
  {
    kind: "EQUIPMENT",
    label: "Company laptop returned",
    owner: "it",
    mandatory: true,
    appliesTo: [],
  },
  {
    kind: "EQUIPMENT",
    label: "ID card and office keys returned",
    owner: "hr",
    mandatory: true,
    appliesTo: [],
  },
  {
    kind: "ACCESS",
    label: "Email forwarded to a colleague, then the account disabled",
    owner: "it",
    mandatory: true,
    appliesTo: [],
  },
  {
    kind: "PAYROLL",
    label: "Final pay agreed, including unused leave and any outstanding loan",
    owner: "finance",
    mandatory: true,
    appliesTo: [],
  },
  {
    kind: "PAYROLL",
    label: "Pension provider notified",
    owner: "finance",
    mandatory: true,
    appliesTo: [],
  },
  {
    kind: "PAPERWORK",
    label: "Reference letter issued",
    owner: "hr",
    mandatory: false,
    appliesTo: ["RESIGNATION", "END_OF_CONTRACT", "RETIREMENT"],
  },
];

let counter = 0;
const nextId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(counter += 1).toString(36)}`;

/** `employee` and `manager` become a person; the rest stay a role. */
function assigneeFor(
  owner: string,
  employeeId: string,
  managerId: string | null,
): string | null {
  const role = owner.trim().toLowerCase();
  if (role === "employee") return employeeId;
  if (role === "manager") return managerId;
  return null;
}

/**
 * The checklist for one exit.
 *
 * Reads the company's **own** list where there is one, falling back to the
 * defaults for the seed exit, which is built before the store exists. An edit on
 * the checklist settings screen has to show up on the next exit or that screen is
 * a form that writes to nothing.
 */
function generateTasks(
  kind: ExitKind,
  employeeId: string,
  managerId: string | null,
  templates?: readonly {
    kind: ExitTaskKind;
    label: string;
    owner: string;
    mandatory: boolean;
    appliesTo: ExitKind[];
    active?: boolean;
  }[],
): DemoTask[] {
  return (templates ?? DEFAULT_TASKS)
    .filter((t) => t.active !== false)
    .filter((t) => t.appliesTo.length === 0 || t.appliesTo.includes(kind))
    .map((template, index) => ({
    id: nextId("task"),
    kind: template.kind,
    label: template.label,
    owner: template.owner,
    order: index,
    mandatory: template.mandatory,
    assigneeId: assigneeFor(template.owner, employeeId, managerId),
    completedAt: null,
    completedById: null,
    verifiedAt: null,
    verifiedById: null,
    outcome: null,
    note: null,
    assetAssignmentId: null,
  }));
}

/* -------------------------------------------------------------- the seed */

const nameOf = (id: string | null): string | null => {
  if (!id) return null;
  const person = employeeById(id);
  return person ? `${person.firstName} ${person.lastName}` : null;
};

/**
 * One leaver, mid-checklist.
 *
 * Emeka is a real seed employee with a real manager, so the approvals in the
 * demo have somebody's name on them. His laptop is recorded **not returned**
 * on purpose: it is the case the whole module exists for, and it is the one that
 * makes "Close this exit" refuse and say why. Everything ticked off was ticked
 * by his manager rather than by the demo's own account, so confirming is
 * something the demo can actually do.
 */
function seedExits(): DemoExit[] {
  const emeka = employeeById("p-09");
  if (!emeka) return [];

  const base = generateTasks("RESIGNATION", emeka.id, emeka.managerId);
  const tick = (label: string, byId: string, verifiedById?: string) =>
    base
      .filter((t) => t.label.startsWith(label))
      .forEach((t) => {
        t.completedAt = `${TODAY}T09:15:00.000Z`;
        t.completedById = byId;
        t.outcome = "DONE";
        if (verifiedById) {
          t.verifiedAt = `${TODAY}T10:02:00.000Z`;
          t.verifiedById = verifiedById;
        }
      });

  tick("Handover notes", emeka.id, "p-01");
  tick("ID card", "p-01");
  tick("Email forwarded", "p-01");

  for (const task of base) {
    if (task.label === "Company laptop returned") {
      task.outcome = "NOT_RETURNED";
      task.note = "Emeka says it is at home. Bringing it in on Monday.";
    }
  }

  return [
    {
      id: "exit-demo-01",
      employeeId: emeka.id,
      employeeSnapshot: {
        name: `${emeka.firstName} ${emeka.lastName}`,
        employeeNo: emeka.employeeNo,
        jobTitle: emeka.jobTitle,
        departmentName: emeka.department,
      },
      managerId: emeka.managerId,
      kind: "RESIGNATION",
      reason: "Offered a role at a bank, starting next month.",
      lastWorkingDay: "2026-09-11",
      noticeGivenOn: "2026-08-12",
      status: "IN_PROGRESS",
      managerApprovedById: "p-01",
      managerApprovedAt: "2026-08-13T11:20:00.000Z",
      hrApprovedById: "p-05",
      hrApprovedAt: "2026-08-14T08:40:00.000Z",
      declinedReason: null,
      completedAt: null,
      createdAt: "2026-08-12T16:05:00.000Z",
      tasks: base,
      interview: null,
    },
  ];
}

function seedTemplates(): DemoTemplate[] {
  return DEFAULT_TASKS.map((template, index) => ({
    id: `tpl-${index}`,
    kind: template.kind,
    label: template.label,
    owner: template.owner,
    order: index,
    mandatory: template.mandatory,
    appliesTo: template.appliesTo,
    active: true,
  }));
}

const store = createPersistedState<DemoState>({
  /* Version 2: the state grew `templates`. A stored version-1 payload is dropped
     rather than merged — see the note in `persisted.ts`. */
  key: "approvehr.offboarding.store",
  empty: { exits: seedExits(), templates: seedTemplates() },
  version: 2,
});

/* ------------------------------------------------------- demo serialising */

function progressOf(tasks: readonly DemoTask[]): ApiExitProgress {
  const done = tasks.filter((t) => t.completedAt !== null).length;
  const mandatory = tasks.filter((t) => t.mandatory);
  return {
    total: tasks.length,
    done,
    mandatory: mandatory.length,
    mandatoryDone: mandatory.filter((t) => t.completedAt !== null).length,
    percent: tasks.length === 0 ? 100 : Math.round((done / tasks.length) * 100),
  };
}

function sortTasks(tasks: readonly DemoTask[]): DemoTask[] {
  return [...tasks].sort(
    (a, b) =>
      TASK_KIND_ORDER.indexOf(a.kind) - TASK_KIND_ORDER.indexOf(b.kind) ||
      a.order - b.order ||
      a.label.localeCompare(b.label),
  );
}

function serializeTask(task: DemoTask): ApiExitTask {
  return {
    id: task.id,
    kind: task.kind,
    kindLabel: TASK_KIND_LABELS[task.kind],
    label: task.label,
    owner: task.owner,
    order: task.order,
    mandatory: task.mandatory,
    assigneeId: task.assigneeId,
    assigneeName: nameOf(task.assigneeId),
    completed: task.completedAt !== null,
    completedAt: task.completedAt,
    completedByName: nameOf(task.completedById),
    verified: task.verifiedAt !== null,
    verifiedAt: task.verifiedAt,
    verifiedByName: nameOf(task.verifiedById),
    outcome: task.outcome,
    note: task.note,
    assetAssignmentId: task.assetAssignmentId,
  };
}

function identityOf(exit: DemoExit) {
  const person = employeeById(exit.employeeId);
  return person
    ? {
        id: person.id,
        name: `${person.firstName} ${person.lastName}`,
        employeeNo: person.employeeNo,
        jobTitle: person.jobTitle,
        departmentName: person.department,
      }
    : { id: exit.employeeId, ...exit.employeeSnapshot };
}

function serializeExit(exit: DemoExit): ApiExit {
  const sorted = sortTasks(exit.tasks);
  const groups: ApiExitGroup[] = TASK_KIND_ORDER.map((kind) => ({
    kind,
    label: TASK_KIND_LABELS[kind],
    tasks: sorted.filter((t) => t.kind === kind).map(serializeTask),
  })).filter((group) => group.tasks.length > 0);

  const managerName = nameOf(exit.managerId);

  return {
    id: exit.id,
    employee: identityOf(exit),
    manager: exit.managerId && managerName ? { id: exit.managerId, name: managerName } : null,
    kind: exit.kind,
    kindLabel: KIND_LABELS[exit.kind],
    reason: exit.reason,
    lastWorkingDay: exit.lastWorkingDay,
    noticeGivenOn: exit.noticeGivenOn,
    noticeDays: Math.round(
      (new Date(exit.lastWorkingDay).getTime() -
        new Date(exit.noticeGivenOn).getTime()) /
        DAY_MS,
    ),
    status: exit.status,
    statusLabel: STATUS_LABELS[exit.status],
    managerApprovedByName: nameOf(exit.managerApprovedById),
    managerApprovedAt: exit.managerApprovedAt,
    hrApprovedByName: nameOf(exit.hrApprovedById),
    hrApprovedAt: exit.hrApprovedAt,
    declinedReason: exit.declinedReason,
    completedAt: exit.completedAt,
    createdAt: exit.createdAt,
    progress: progressOf(exit.tasks),
    groups,
    interview: exit.interview,
  };
}

function serializeRow(exit: DemoExit): ApiExitRow {
  return {
    id: exit.id,
    employee: identityOf(exit),
    kind: exit.kind,
    kindLabel: KIND_LABELS[exit.kind],
    reason: exit.reason,
    lastWorkingDay: exit.lastWorkingDay,
    status: exit.status,
    statusLabel: STATUS_LABELS[exit.status],
    progress: progressOf(exit.tasks),
    completedAt: exit.completedAt,
  };
}

/**
 * The demo's copy of the one calculation.
 *
 * Mirrors `buildReadiness` in the backend line for line, including the order
 * the blockers come out in — the refusal message is built from this list, so a
 * different order would read as a different refusal.
 */
/**
 * What is left, and what still has to be decided about the final payslip.
 *
 * `untakenLeave` is passed in rather than read here: leave lives in its own store
 * and `useLeaveBalances` is the only sanctioned way to ask for a balance —
 * importing the pure function and forgetting the company policy argument is the
 * documented way that number ends up with two answers.
 *
 * The money figures stay at zero in demo mode and the card shows a line only
 * where there is something to show. There is no loan book and no equipment
 * register in this browser, and a made-up outstanding balance on a screen whose
 * whole argument is "the exit reaches payroll" would be the one kind of lie this
 * product refuses to tell.
 */
function buildReadiness(
  exit: DemoExit,
  untakenLeave: { leaveType: string; days: number }[] = [],
): ApiExitReadiness {
  const sorted = sortTasks(exit.tasks);
  const outstanding = sorted.filter((t) => t.completedAt === null);
  const managerRequired = exit.managerId !== null;

  const blockers: string[] = [];
  if (exit.status === "COMPLETED") blockers.push("This exit is already closed.");
  if (exit.status === "DECLINED" || exit.status === "CANCELLED") {
    blockers.push(`This exit is ${STATUS_LABELS[exit.status].toLowerCase()}.`);
  }
  if (managerRequired && exit.managerApprovedAt === null) {
    const manager = nameOf(exit.managerId);
    const person = employeeById(exit.employeeId);
    blockers.push(
      manager && person
        ? `${manager} has not released ${person.firstName} yet.`
        : "Their manager has not released them yet.",
    );
  }
  if (exit.hrApprovedAt === null) blockers.push("HR has not approved this yet.");
  for (const task of outstanding.filter((t) => t.mandatory)) {
    blockers.push(
      task.outcome === "NOT_RETURNED"
        ? `${task.label} — recorded as not returned.`
        : task.label,
    );
  }

  return {
    exitId: exit.id,
    status: exit.status,
    statusLabel: STATUS_LABELS[exit.status],
    lastWorkingDay: exit.lastWorkingDay,
    daysToLastWorkingDay: Math.ceil(
      (new Date(exit.lastWorkingDay).getTime() - new Date(TODAY).getTime()) / DAY_MS,
    ),
    progress: progressOf(exit.tasks),
    approvals: {
      manager: {
        required: managerRequired,
        done: exit.managerApprovedAt !== null,
        byName: nameOf(exit.managerApprovedById),
        at: exit.managerApprovedAt,
      },
      hr: {
        done: exit.hrApprovedAt !== null,
        byName: nameOf(exit.hrApprovedById),
        at: exit.hrApprovedAt,
      },
    },
    canComplete: blockers.length === 0,
    blockers,
    outstanding: outstanding.map(serializeTask),
    awaitingConfirmation: sorted
      .filter((t) => t.completedAt !== null && t.verifiedAt === null)
      .map(serializeTask),
    /* No register in this browser. Empty is the truthful answer, and it is not
       a blocker anywhere. */
    assetsStillHeld: [],
    finalPay: {
      lastWorkingDay: exit.lastWorkingDay,
      outstandingLoanKobo: 0,
      untakenLeave,
      heldValueKobo: 0,
      agreed: exit.tasks.some(
        (task) => task.kind === "PAYROLL" && task.completedAt !== null,
      ),
    },
  };
}

/* ----------------------------------------------------------- demo writes */

const refuse = (status: number, code: string, message: string, details?: Record<string, unknown>) =>
  new ApiError(status, code, message, details);

function replace(exit: DemoExit) {
  /* `current()`, never `read()`: this page may never have rendered a list of
     exits — `/people/[id]` records one without reading any — and `read()` is
     the seed until something subscribes. See the note at the top of
     `store/persisted.ts`; getting this wrong overwrote a recorded exit. */
  const state = store.current();
  store.commit({
    ...state,
    exits: state.exits.map((row) => (row.id === exit.id ? exit : row)),
  });
}

function findExit(id: string): DemoExit {
  const exit = store.current().exits.find((row) => row.id === id);
  if (!exit) throw refuse(404, "not_found", "That exit could not be found.");
  return exit;
}

function demoStart(body: StartExitBody, actingId: string | null): DemoExit {
  const targetId = body.employeeId ?? actingId;
  if (!targetId) {
    throw refuse(
      422,
      "no_employee",
      "This sign-in is not linked to a staff record, so there is nobody to record an exit for.",
    );
  }

  const person = employeeById(targetId);
  const name = person ? `${person.firstName} ${person.lastName}` : "That person";

  if (person && body.lastWorkingDay < person.startDate) {
    throw refuse(
      422,
      "before_start",
      `${name} started on ${person.startDate}, so their last working day cannot be before that.`,
    );
  }

  /* `current()` is what makes this refusal real. With `read()` the check ran
     against the seed whenever the caller's screen had never listed exits, so
     recording a second exit from somebody's record was allowed and quietly
     replaced the first. */
  const open = store
    .current()
    .exits.find((row) => row.employeeId === targetId && OPEN_STATUSES.includes(row.status));
  if (open) {
    throw refuse(
      409,
      "already_leaving",
      `${name} already has an exit in progress (${STATUS_LABELS[open.status].toLowerCase()}). Open that one instead of starting a second.`,
      { exitId: open.id },
    );
  }

  const managerId = person?.managerId ?? null;
  const created: DemoExit = {
    id: nextId("exit"),
    employeeId: targetId,
    employeeSnapshot: {
      name,
      employeeNo: person?.employeeNo ?? "—",
      jobTitle: person?.jobTitle ?? "—",
      departmentName: person?.department ?? null,
    },
    managerId,
    kind: body.kind,
    reason: body.reason,
    lastWorkingDay: body.lastWorkingDay,
    noticeGivenOn: body.noticeGivenOn ?? TODAY,
    /* Straight to a decision rather than DRAFT — nothing chases a draft. With
       no manager on the record there is nobody to release them, so it goes
       to HR. */
    status: managerId ? "AWAITING_MANAGER" : "AWAITING_HR",
    managerApprovedById: null,
    managerApprovedAt: null,
    hrApprovedById: null,
    hrApprovedAt: null,
    declinedReason: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    tasks: generateTasks(body.kind, targetId, managerId, store.current().templates),
    interview: null,
  };

  const state = store.current();
  store.commit({ ...state, exits: [created, ...state.exits] });
  return created;
}

function assertOpen(exit: DemoExit) {
  if (CLOSED_STATUSES.includes(exit.status)) {
    throw refuse(
      409,
      "closed",
      `This exit is ${STATUS_LABELS[exit.status].toLowerCase()}, so there is nothing to decide.`,
    );
  }
}

function demoManagerApprove(id: string, actingId: string | null) {
  const exit = findExit(id);
  assertOpen(exit);
  if (exit.status !== "AWAITING_MANAGER") {
    throw refuse(
      409,
      "already_decided",
      exit.status === "AWAITING_HR"
        ? "Their manager has already released them. It is with HR now."
        : "That decision has already been made.",
    );
  }
  if (actingId && actingId === exit.employeeId) {
    throw refuse(
      422,
      "self_approval",
      "You cannot release yourself. Somebody else has to approve your exit.",
    );
  }
  replace({
    ...exit,
    status: "AWAITING_HR",
    managerApprovedById: actingId,
    managerApprovedAt: new Date().toISOString(),
  });
}

function demoHrApprove(id: string, actingId: string | null) {
  const exit = findExit(id);
  assertOpen(exit);
  if (exit.managerId && exit.managerApprovedAt === null) {
    const manager = nameOf(exit.managerId);
    throw refuse(
      422,
      "manager_pending",
      manager
        ? `${manager} has not released them yet.`
        : "Their manager has not released them yet.",
    );
  }
  if (exit.hrApprovedAt !== null) {
    throw refuse(409, "already_decided", "HR has already approved this.");
  }
  replace({
    ...exit,
    status: "IN_PROGRESS",
    hrApprovedById: actingId,
    hrApprovedAt: new Date().toISOString(),
  });
}

function demoDecline(id: string, reason: string) {
  const exit = findExit(id);
  assertOpen(exit);
  replace({ ...exit, status: "DECLINED", declinedReason: reason });
}

/**
 * Taking it back. `CANCELLED`, not `DECLINED` — see the API wrapper.
 *
 * The permission rule is the server's, mirrored here so the demo refuses what
 * the API refuses: your own notice, or HR cancelling anybody's. In demo mode
 * `actingId` is the signed-in person, so withdrawing somebody else's exit
 * without `EDIT_RECORDS` fails here exactly as it would over the wire.
 */
function demoWithdraw(
  id: string,
  reason: string | undefined,
  actingId: string | null,
  isHr: boolean,
) {
  const exit = findExit(id);
  assertOpen(exit);

  const self = actingId !== null && actingId === exit.employeeId;
  if (!self && !isHr) {
    throw refuse(
      403,
      "not_yours",
      "You can withdraw your own notice. Cancelling somebody else's exit is done by HR.",
    );
  }

  replace({
    ...exit,
    status: "CANCELLED",
    declinedReason:
      reason?.trim() ||
      (self ? "Withdrawn by the person leaving." : "Cancelled by HR."),
  });
}

function demoUpdateTask(taskId: string, body: UpdateTaskBody, actingId: string | null) {
  /* These two lookups were the half of the exit fix that got missed: `replace`
     was moved to `current()` and the *finds* that feed it were left on
     `read()`, which is worse than either being wrong on its own. A task on a
     stored exit came back "could not be found", and a task on a seed exit was
     computed from the seed's ticks and then written over the stored ones. */
  const exit = store
    .current()
    .exits.find((row) => row.tasks.some((task) => task.id === taskId));
  if (!exit) throw refuse(404, "not_found", "That task could not be found.");
  if (CLOSED_STATUSES.includes(exit.status)) {
    throw refuse(
      409,
      "closed",
      `This exit is ${STATUS_LABELS[exit.status].toLowerCase()}, so its checklist cannot change.`,
    );
  }

  const tasks = exit.tasks.map((task) => {
    if (task.id !== taskId) return task;
    const next = { ...task };

    if (body.completed === false) {
      if (task.completedAt === null) {
        throw refuse(
          409,
          "not_ticked",
          "That task is not ticked off, so there is nothing to reopen.",
        );
      }
      next.completedAt = null;
      next.completedById = null;
      next.verifiedAt = null;
      next.verifiedById = null;
      next.outcome = null;
    } else if (body.outcome !== undefined || body.completed === true) {
      const outcome = body.outcome ?? "DONE";
      if (
        outcome !== "DONE" &&
        outcome !== "RETURNED" &&
        !(body.note && body.note.trim())
      ) {
        throw refuse(
          422,
          "note_required",
          "Say what happened — that outcome is something somebody will be asked about.",
        );
      }
      next.outcome = outcome;
      if (outcome === "NOT_RETURNED") {
        /* Recorded, not settled. It keeps blocking until it comes back or the
           company waives it with a reason. */
        next.completedAt = null;
        next.completedById = null;
        next.verifiedAt = null;
        next.verifiedById = null;
      } else {
        next.completedAt = new Date().toISOString();
        next.completedById = actingId;
      }
    }

    if (body.note !== undefined) next.note = body.note.trim() || null;
    if (body.assigneeId !== undefined) next.assigneeId = body.assigneeId;
    if (body.assetAssignmentId !== undefined) {
      next.assetAssignmentId = body.assetAssignmentId;
    }
    return next;
  });

  replace({ ...exit, tasks });
}

function demoVerifyTask(taskId: string, actingId: string | null) {
  const exit = store
    .current()
    .exits.find((row) => row.tasks.some((task) => task.id === taskId));
  if (!exit) throw refuse(404, "not_found", "That task could not be found.");
  const task = exit.tasks.find((row) => row.id === taskId);
  if (!task) throw refuse(404, "not_found", "That task could not be found.");

  if (CLOSED_STATUSES.includes(exit.status)) {
    throw refuse(
      409,
      "closed",
      `This exit is ${STATUS_LABELS[exit.status].toLowerCase()}, so its checklist cannot change.`,
    );
  }
  if (task.completedAt === null) {
    throw refuse(
      422,
      "not_ticked",
      `"${task.label}" has not been ticked off yet, so there is nothing to confirm.`,
    );
  }
  if (task.verifiedAt !== null) {
    throw refuse(409, "already_verified", `"${task.label}" has already been confirmed.`);
  }
  if (task.completedById !== null && task.completedById === actingId) {
    throw refuse(
      422,
      "same_person",
      `You ticked "${task.label}" off yourself, so somebody else has to confirm it. ` +
        `Returning something and receiving it are two different claims.`,
    );
  }

  replace({
    ...exit,
    tasks: exit.tasks.map((row) =>
      row.id === taskId
        ? { ...row, verifiedAt: new Date().toISOString(), verifiedById: actingId }
        : row,
    ),
  });
}

/** Refuses with the same message and the same blocker list as the API. */
function demoComplete(id: string): DemoExit {
  const exit = findExit(id);
  if (exit.status === "COMPLETED") {
    throw refuse(409, "already_closed", "That exit is already closed.");
  }
  if (CLOSED_STATUSES.includes(exit.status)) {
    throw refuse(
      409,
      "closed",
      `That exit is ${STATUS_LABELS[exit.status].toLowerCase()}, so there is nothing to close.`,
    );
  }

  const ready = buildReadiness(exit);
  if (!ready.canComplete) {
    const person = employeeById(exit.employeeId);
    const count = ready.blockers.length;
    throw refuse(
      422,
      "not_ready",
      `${person?.firstName ?? "This"}'s exit cannot close yet — ${count} ` +
        `${count === 1 ? "thing" : "things"} outstanding: ${ready.blockers.join("; ")}.`,
      { blockers: ready.blockers },
    );
  }

  const closed: DemoExit = {
    ...exit,
    status: "COMPLETED",
    completedAt: new Date().toISOString(),
  };
  replace(closed);
  return closed;
}

function demoSaveInterview(
  id: string,
  body: InterviewBody,
  actingId: string | null,
): ApiExitInterview {
  const exit = findExit(id);
  const now = new Date().toISOString();
  const interview: ApiExitInterview = {
    recorded: true,
    conductedById: actingId,
    conductedByName: nameOf(actingId),
    conductedAt: body.declined ? null : (body.conductedAt ?? TODAY),
    declinedAt: body.declined ? now : null,
    primaryReason: body.primaryReason?.trim() || null,
    wouldRecommend: body.wouldRecommend ?? null,
    wouldReturn: body.wouldReturn ?? null,
    whatWorked: body.whatWorked?.trim() || null,
    whatDidNot: body.whatDidNot?.trim() || null,
    notes: body.notes?.trim() || null,
  };
  replace({ ...exit, interview });
  return interview;
}

/* ------------------------------------------------------------------ hooks */

/** `"api"` when the list came from the server, `"demo"` when it came from here. */
export type Source = "api" | "demo";

const EMPTY_ROWS: ApiExitRow[] = [];

type ListState = {
  key: string;
  rows: ApiExitRow[];
  total: number;
  error: ApiError | null;
};

/**
 * The list of people leaving.
 *
 * Connected, the API narrows to what the caller may see. In demo mode
 * everything is visible, because the demo has one signed-in person and hiding
 * the only exit there is would leave a blank screen.
 */
export function useExits(params: ExitListParams = {}) {
  const { isConnected, isLoading } = useSession();
  const demo = useSyncExternalStore(
    store.subscribe,
    store.read,
    store.getServerSnapshot,
  );

  const {
    page = 1,
    pageSize = 25,
    state = "open",
    status,
    kind,
    employeeId,
    q,
    sort,
    order,
  } = params;

  const query = useMemo<ExitListParams>(
    () => ({
      page,
      pageSize,
      state,
      ...(status ? { status } : {}),
      ...(kind ? { kind } : {}),
      ...(employeeId ? { employeeId } : {}),
      ...(q ? { q } : {}),
      ...(sort ? { sort } : {}),
      ...(order ? { order } : {}),
    }),
    [page, pageSize, state, status, kind, employeeId, q, sort, order],
  );

  const key = JSON.stringify(query);
  const [attempt, setAttempt] = useState(0);
  const [fetched, setFetched] = useState<ListState | null>(null);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (isLoading || !isConnected) return;
    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      try {
        const paged = await offboardingApi.list(query, controller.signal);
        if (!cancelled) {
          setFetched({
            key,
            rows: paged.data,
            total: paged.meta.total,
            error: null,
          });
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFetched({
          key,
          rows: EMPTY_ROWS,
          total: 0,
          error: error instanceof ApiError ? error : null,
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    /* `key` is `query` stringified, so it is the same dependency spelled twice
       — but it is what makes a stale response for a superseded filter fail the
       comparison below rather than render. */
  }, [key, query, isConnected, isLoading, attempt, revalidation]);

  const local = useMemo(() => {
    const matchesState =
      state === "all"
        ? () => true
        : state === "closed"
          ? (exit: DemoExit) => CLOSED_STATUSES.includes(exit.status)
          : (exit: DemoExit) => OPEN_STATUSES.includes(exit.status);

    const needle = q?.trim().toLowerCase() ?? "";
    const filtered = demo.exits
      .filter(matchesState)
      .filter((exit) => (status ? exit.status === status : true))
      .filter((exit) => (kind ? exit.kind === kind : true))
      .filter((exit) => (employeeId ? exit.employeeId === employeeId : true))
      .filter((exit) => {
        if (!needle) return true;
        const identity = identityOf(exit);
        return (
          identity.name.toLowerCase().includes(needle) ||
          identity.employeeNo.toLowerCase().includes(needle) ||
          (exit.reason ?? "").toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => a.lastWorkingDay.localeCompare(b.lastWorkingDay));

    const start = (page - 1) * pageSize;
    return {
      rows: filtered.slice(start, start + pageSize).map(serializeRow),
      total: filtered.length,
    };
  }, [demo.exits, state, status, kind, employeeId, q, page, pageSize]);

  const matched = fetched !== null && fetched.key === key;
  const source: Source = isConnected ? "api" : "demo";

  return {
    rows: isConnected ? (matched ? fetched.rows : EMPTY_ROWS) : local.rows,
    total: isConnected ? (matched ? fetched.total : 0) : local.total,
    /* Derived, not tracked: we are loading exactly while a connected session
       has no result matching the current filters. No setState in an effect
       body, and no window where the previous filter's rows look like this
       filter's. */
    loading: isConnected && !matched,
    error: matched ? fetched.error : null,
    source,
    reload: useCallback(() => setAttempt((n) => n + 1), []),
  };
}

type DetailState = {
  id: string;
  exit: ApiExit | null;
  readiness: ApiExitReadiness | null;
  error: ApiError | null;
};

/**
 * One exit, its readiness, and everything that can be done to it.
 *
 * `exit` and `readiness` arrive together and are refreshed together after every
 * write, because the progress bar and the refusal are the same calculation and a
 * screen showing one against a stale copy of the other is the bug this avoids.
 */
export function useExit(id: string) {
  const { isConnected, isLoading, actingId } = useSession();
  const employees = useEmployeeStore();
  const balances = useLeaveBalances();
  const isHr = useCan("EDIT_RECORDS");
  const demo = useSyncExternalStore(
    store.subscribe,
    store.read,
    store.getServerSnapshot,
  );

  const [attempt, setAttempt] = useState(0);
  const [fetched, setFetched] = useState<DetailState | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const [exit, readiness] = await Promise.all([
        offboardingApi.get(id, signal),
        offboardingApi.readiness(id, signal),
      ]);
      setFetched({ id, exit, readiness, error: null });
    },
    [id],
  );

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (isLoading || !isConnected) return;
    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      try {
        await load(controller.signal);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFetched({
          id,
          exit: null,
          readiness: null,
          error: error instanceof ApiError ? error : null,
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id, load, isConnected, isLoading, attempt, revalidation]);

  const localExit = useMemo(
    () => demo.exits.find((row) => row.id === id) ?? null,
    [demo.exits, id],
  );

  /* Days never taken, for the final-pay card. Read through the one hook that
     knows the company's leave policy — see `useLeaveBalances`. */
  const untakenLeave = useMemo(() => {
    if (!localExit) return [];
    return balances
      .forEmployee(localExit.employeeId)
      .map((balance) => ({
        leaveType: balance.type,
        /* Entitled less taken less pending — the same figure every leave screen
           shows, through the same helper, so the exit cannot quote a third. */
        days: remainingDays(balance),
      }))
      .filter((entry) => entry.days > 0);
  }, [balances, localExit]);

  const matched = fetched !== null && fetched.id === id;
  const source: Source = isConnected ? "api" : "demo";

  /** Re-reads after a write. A no-op in demo mode, which is already live. */
  const refresh = useCallback(async () => {
    if (!isConnected) return;
    await load();
  }, [isConnected, load]);

  const run = useCallback(
    async (api: () => Promise<unknown>, local: () => void) => {
      if (isConnected) {
        await api();
        await refresh();
        return;
      }
      local();
    },
    [isConnected, refresh],
  );

  const complete = useCallback(async () => {
    if (isConnected) {
      await offboardingApi.complete(id);
      await refresh();
      return;
    }
    const closed = demoComplete(id);
    /**
     * Archived, never deleted — the same write the server makes in the same
     * transaction as closing the record. There is no `"exited"` in the
     * frontend's `EmploymentStatus` union, so `"inactive"` plus membership of
     * the employee store's `archived` array carries it: the record still
     * resolves by id, so past payslips and approvals keep working.
     */
    employees.update(closed.employeeId, {
      status: "inactive",
      endDate: closed.lastWorkingDay,
    });
    employees.archive(closed.employeeId);
  }, [id, isConnected, refresh, employees]);

  return {
    exit: isConnected ? (matched ? fetched.exit : null) : localExit ? serializeExit(localExit) : null,
    readiness: isConnected
      ? matched
        ? fetched.readiness
        : null
      : localExit
        ? buildReadiness(localExit, untakenLeave)
        : null,
    loading: isConnected ? !matched : false,
    error: matched ? fetched.error : null,
    /** True once we know there is nothing here — a 404 also means "not yours". */
    missing: isConnected
      ? matched && fetched.exit === null
      : localExit === null,
    source,
    reload: useCallback(() => setAttempt((n) => n + 1), []),

    managerApprove: useCallback(
      () =>
        run(
          () => offboardingApi.managerApprove(id),
          () => demoManagerApprove(id, actingId),
        ),
      [run, id, actingId],
    ),
    hrApprove: useCallback(
      () =>
        run(
          () => offboardingApi.hrApprove(id),
          () => demoHrApprove(id, actingId),
        ),
      [run, id, actingId],
    ),
    decline: useCallback(
      (reason: string) =>
        run(
          () => offboardingApi.decline(id, reason),
          () => demoDecline(id, reason),
        ),
      [run, id],
    ),
    /** Taking it back. The leaver's own door, and HR's cancel. */
    withdraw: useCallback(
      (reason?: string) =>
        run(
          () => offboardingApi.withdraw(id, reason),
          () => demoWithdraw(id, reason, actingId, isHr),
        ),
      [run, id, actingId, isHr],
    ),
    updateTask: useCallback(
      (taskId: string, body: UpdateTaskBody) =>
        run(
          () => offboardingApi.updateTask(taskId, body),
          () => demoUpdateTask(taskId, body, actingId),
        ),
      [run, actingId],
    ),
    verifyTask: useCallback(
      (taskId: string) =>
        run(
          () => offboardingApi.verifyTask(taskId),
          () => demoVerifyTask(taskId, actingId),
        ),
      [run, actingId],
    ),
    saveInterview: useCallback(
      (body: InterviewBody) =>
        run(
          () => offboardingApi.saveInterview(id, body),
          () => {
            demoSaveInterview(id, body, actingId);
          },
        ),
      [run, id, actingId],
    ),
    complete,
  };
}

/**
 * The signed-in person's own exit, for `<Resign />` on the profile page.
 *
 * Returns the open one if there is one, so the form is replaced by a link to it
 * rather than offering to start a second — which the API refuses anyway, and a
 * refusal you could have avoided offering is a design failure two clicks
 * earlier.
 */
export function useMyExit() {
  const { isConnected, isLoading, employeeId, actingId } = useSession();
  const demo = useSyncExternalStore(
    store.subscribe,
    store.read,
    store.getServerSnapshot,
  );

  /* Connected, only a real linked staff record counts. In demo mode `actingId`
     falls back to the seed user, which is who the demo is signed in as. */
  const subject = isConnected ? employeeId : actingId;

  const [attempt, setAttempt] = useState(0);
  const [fetched, setFetched] = useState<{
    subject: string;
    row: ApiExitRow | null;
    error: ApiError | null;
  } | null>(null);

  /* Written as its own request rather than through `useExits`, because without
     a staff record there is no id to filter on — and asking the list for
     "nobody's exits" would be a request whose only possible answer is a
     validation error. */
  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (isLoading || !isConnected || !subject) return;
    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      try {
        const paged = await offboardingApi.list(
          { employeeId: subject, state: "open", pageSize: 1 },
          controller.signal,
        );
        if (!cancelled) {
          setFetched({ subject, row: paged.data[0] ?? null, error: null });
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFetched({
          subject,
          row: null,
          error: error instanceof ApiError ? error : null,
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [subject, isConnected, isLoading, attempt, revalidation]);

  const local = useMemo(
    () =>
      subject
        ? (demo.exits.find(
            (exit) =>
              exit.employeeId === subject && OPEN_STATUSES.includes(exit.status),
          ) ?? null)
        : null,
    [demo.exits, subject],
  );

  const matched = fetched !== null && fetched.subject === subject;
  const source: Source = isConnected ? "api" : "demo";

  const start = useCallback(
    async (body: Omit<StartExitBody, "employeeId">): Promise<string> => {
      if (isConnected) {
        const created = await offboardingApi.start(body);
        setAttempt((n) => n + 1);
        return created.id;
      }
      return demoStart(body, actingId).id;
    },
    [isConnected, actingId],
  );

  return {
    /** Their open exit, or null. */
    exit: isConnected
      ? matched
        ? fetched.row
        : null
      : local
        ? serializeRow(local)
        : null,
    loading: isLoading || (isConnected && Boolean(subject) && !matched),
    error: matched ? fetched.error : null,
    /** False when this sign-in has no staff record — there is nobody to resign. */
    available: Boolean(subject),
    source,
    start,
    reload: useCallback(() => setAttempt((n) => n + 1), []),
  };
}

/**
 * Starting somebody else's exit. HR's operation, gated on `EDIT_RECORDS`.
 *
 * Separate from `useMyExit().start` because the caller is different, the
 * permission is different and the kinds allowed are different — the API checks
 * all three, and one hook covering both would hide which rule a refusal came
 * from. It reads nothing, so it fires no request of its own: the screen that
 * owns the list reloads its own list.
 */
export function useStartExit() {
  const { isConnected, actingId } = useSession();
  const source: Source = isConnected ? "api" : "demo";

  const start = useCallback(
    async (body: StartExitBody): Promise<string> => {
      if (isConnected) {
        const created = await offboardingApi.start(body);
        return created.id;
      }
      return demoStart(body, actingId).id;
    },
    [isConnected, actingId],
  );

  return { start, source };
}

/**
 * The checklist a company starts every exit from.
 *
 * ## Why this exists at all
 *
 * `ExitTaskTemplate` has been a table with five endpoints and no screen — which
 * means a company could not add "hand back the fuel card" without somebody
 * calling the API by hand, and the seven defaults were effectively hardcoded
 * policy. A model with no interface is a promise the product does not keep.
 *
 * ## And why it is not on the default path
 *
 * A five-person business should never open it. The defaults are seeded on first
 * read precisely so nobody has to configure a checklist before processing their
 * first leaver (PARITY.md Rule 3), so this is a link off the Leavers screen
 * rather than a step in the flow.
 *
 * Switching a line off never destroys it, in both modes — for the reason in the
 * API wrapper: a company with no templates gets the defaults seeded, so a real
 * delete would bring back the line they just removed.
 */
export function useExitTemplates(includeInactive = false) {
  const { isConnected, isLoading } = useSession();
  const demo = useSyncExternalStore(
    store.subscribe,
    store.read,
    store.getServerSnapshot,
  );

  const [attempt, setAttempt] = useState(0);
  const [fetched, setFetched] = useState<{
    key: string;
    rows: ApiExitTemplate[];
    error: ApiError | null;
  } | null>(null);

  const key = includeInactive ? "all" : "active";

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (isLoading || !isConnected) return;
    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      try {
        const result = await offboardingApi.templates(
          { includeInactive },
          controller.signal,
        );
        if (!cancelled) setFetched({ key, rows: result.rows, error: null });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFetched({
          key,
          rows: [],
          error: error instanceof ApiError ? error : null,
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [key, includeInactive, isConnected, isLoading, attempt, revalidation]);

  const local = useMemo(
    () =>
      demo.templates
        .filter((row) => includeInactive || row.active)
        .slice()
        .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
        .map(serializeTemplate),
    [demo.templates, includeInactive],
  );

  const matched = fetched !== null && fetched.key === key;
  const rows = isConnected ? (matched ? fetched.rows : EMPTY_TEMPLATES) : local;

  const refresh = useCallback(() => setAttempt((n) => n + 1), []);

  const run = useCallback(
    async (api: () => Promise<unknown>, localWrite: () => void) => {
      if (isConnected) {
        await api();
        setAttempt((n) => n + 1);
        return;
      }
      localWrite();
    },
    [isConnected],
  );

  return {
    rows,
    loading: isConnected && !matched,
    error: matched ? fetched.error : null,
    source: (isConnected ? "api" : "demo") as Source,
    counts: {
      total: rows.length,
      active: rows.filter((row) => row.active).length,
      mandatory: rows.filter((row) => row.active && row.mandatory).length,
    },
    reload: refresh,

    add: useCallback(
      (body: TemplateBody) =>
        run(
          () => offboardingApi.createTemplate(body),
          () => demoAddTemplate(body),
        ),
      [run],
    ),
    edit: useCallback(
      (id: string, body: UpdateTemplateBody) =>
        run(
          () => offboardingApi.updateTemplate(id, body),
          () => demoEditTemplate(id, body),
        ),
      [run],
    ),
    /**
     * Fill an empty checklist with the suggested seven.
     *
     * Nothing seeds a checklist on its own any more — a clearance checklist
     * is a company's own policy, and the defaults used to arrive on first
     * *read*, so opening this screen to write your own created seven rows
     * before you had typed anything. Adopting them is now a button.
     */
    adoptDefaults: useCallback(
      () =>
        run(
          () => offboardingApi.adoptDefaultTemplates(),
          () => demoAdoptDefaultTemplates(),
        ),
      [run],
    ),
    /** Off, not gone. */
    switchOff: useCallback(
      (id: string) =>
        run(
          () => offboardingApi.deactivateTemplate(id),
          () => demoEditTemplate(id, { active: false }),
        ),
      [run],
    ),
  };
}

const EMPTY_TEMPLATES: ApiExitTemplate[] = [];

function serializeTemplate(row: DemoTemplate): ApiExitTemplate {
  return {
    id: row.id,
    kind: row.kind,
    kindLabel: TASK_KIND_LABELS[row.kind],
    label: row.label,
    owner: row.owner,
    order: row.order,
    mandatory: row.mandatory,
    appliesTo: row.appliesTo,
    appliesToLabel:
      row.appliesTo.length === 0
        ? "Every exit"
        : row.appliesTo.map((kind) => KIND_LABELS[kind]).join(", "),
    active: row.active,
  };
}

/** Refuses the same duplicate the API refuses, with the same wording. */
function demoAdoptDefaultTemplates() {
  const state = store.current();
  if (state.templates.length > 0) {
    throw refuse(
      409,
      "conflict",
      "This company already has a checklist. Add the lines you want to it " +
        "instead of replacing what is there.",
    );
  }
  store.commit({ ...state, templates: seedTemplates() });
}

function demoAddTemplate(body: TemplateBody) {
  const state = store.current();
  const clash = state.templates.find(
    (row) => row.label.toLowerCase() === body.label.trim().toLowerCase(),
  );
  if (clash) {
    throw refuse(
      409,
      "duplicate",
      clash.active
        ? `"${clash.label}" is already on the checklist.`
        : `"${clash.label}" is on the checklist but switched off. Turn it back on instead of adding a second copy.`,
    );
  }

  store.commit({
    ...state,
    templates: [
      ...state.templates,
      {
        id: nextId("tpl"),
        kind: body.kind,
        label: body.label.trim(),
        owner: body.owner.trim(),
        order: state.templates.reduce((max, row) => Math.max(max, row.order), -1) + 1,
        mandatory: body.mandatory ?? true,
        appliesTo: body.appliesTo ?? [],
        active: true,
      },
    ],
  });
}

function demoEditTemplate(id: string, body: UpdateTemplateBody) {
  const state = store.current();
  const existing = state.templates.find((row) => row.id === id);
  if (!existing) throw refuse(404, "not_found", "That checklist item.");

  store.commit({
    ...state,
    templates: state.templates.map((row) =>
      row.id === id
        ? {
            ...row,
            ...(body.kind === undefined ? {} : { kind: body.kind }),
            ...(body.label === undefined ? {} : { label: body.label.trim() }),
            ...(body.owner === undefined ? {} : { owner: body.owner.trim() }),
            ...(body.mandatory === undefined ? {} : { mandatory: body.mandatory }),
            ...(body.appliesTo === undefined ? {} : { appliesTo: body.appliesTo }),
            ...(body.active === undefined ? {} : { active: body.active }),
          }
        : row,
    ),
  });
}

/** Resets the demo book. For the settings page's "clear demo data" control. */
export function resetOffboardingDemo() {
  store.reset();
}
