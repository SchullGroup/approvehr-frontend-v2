"use client";

import { request, requestPaged } from "@/lib/api/client";

/**
 * One-to-ones — `/api/v1/one-on-ones`.
 *
 * ## The read gate is narrower than anything else in this product
 *
 * A 1:1 is readable by its **two participants and nobody else, including HR**.
 * That is not a permission — it is a property of the row — so no `useCan` here
 * decides it and the API is the only authority. A screen must never infer that
 * somebody can read one; it asks, and renders the refusal when the answer is no.
 *
 * The reason is in `approvehr-api/src/modules/one-on-ones/service.ts`, and it
 * matters more than the code: a 1:1 is where somebody says they are struggling
 * or thinking about leaving, and the moment a third party can read it those
 * things stop being written down.
 *
 * `GET /coverage` is the one read a third party gets. It answers "who is having
 * one-to-ones and who is not" and carries **no note and no item** — a backend
 * assertion reads the whole response as JSON and fails if a note appears in it.
 *
 * ## Notes are shared, and the screen has to say so
 *
 * One notes field per meeting, written by either participant, read by both.
 * There is no private half. `SHARED_NOTES_NOTE` is that sentence, written once
 * so the composer and the meeting header cannot describe it differently.
 */

export type ApiCadence = "WEEKLY" | "FORTNIGHTLY" | "MONTHLY" | "QUARTERLY";
export type ApiItemKind = "TALKING_POINT" | "ACTION";

export type ApiOneOnOne = {
  id: string;
  managerId: string;
  managerName: string;
  employeeId: string;
  employeeName: string;
  cadence: ApiCadence;
  cadenceLabel: string;
  active: boolean;
  endedAt: string | null;
  /** Null where they have never met — never a zero. */
  lastHeldOn: string | null;
  nextDueOn: string | null;
  overdueDays: number | null;
  meetings: number;
  openActions: number;
};

/**
 * Somebody a one-to-one could be started with — a direct report, and nothing
 * more of their record than a picker needs.
 *
 * A narrow read of a wide row on purpose. `/employees` returns the whole
 * employee, pay included (redacted server-side without `VIEW_SALARIES`), and
 * declaring three fields here is what stops the next person reaching for a
 * fourth because it happened to be on the wire.
 */
export type ApiPossibleReport = {
  id: string;
  fullName: string;
  jobTitle: string;
};

export type ApiOneOnOneItem = {
  id: string;
  kind: ApiItemKind;
  text: string;
  ownerId: string | null;
  ownerName: string | null;
  dueDate: string | null;
  doneAt: string | null;
  createdAt: string;
};

export type ApiOneOnOneMeeting = {
  id: string;
  seriesId: string;
  scheduledFor: string;
  heldAt: string | null;
  notes: string | null;
  items: ApiOneOnOneItem[];
};

export type ApiCoverageState =
  "NO_MANAGER" | "NO_SERIES" | "NEVER_MET" | "OVERDUE" | "UP_TO_DATE";

export type ApiCoverageRow = {
  employeeId: string;
  employeeName: string;
  jobTitle: string;
  departmentName: string | null;
  managerId: string | null;
  managerName: string | null;
  cadence: ApiCadence | null;
  cadenceLabel: string | null;
  lastHeldOn: string | null;
  nextDueOn: string | null;
  overdueDays: number | null;
  meetings: number;
  state: ApiCoverageState;
};

export type ApiCoverage = {
  rows: ApiCoverageRow[];
  counts: {
    people: number;
    upToDate: number;
    overdue: number;
    neverMet: number;
    noSeries: number;
    noManager: number;
  };
};

/**
 * Rendered wherever notes are written or read.
 *
 * Not a tooltip and not a settings page. Somebody typing into this box is
 * deciding what to write down about another person, and whether the other
 * person will see it changes what they write.
 */
export const SHARED_NOTES_NOTE =
  "Both of you can read and edit these notes. There is no private half.";

/** What each state on the coverage report actually says, in the report's own words. */
export const COVERAGE_MEANING: Record<ApiCoverageState, string> = {
  UP_TO_DATE: "Met within the cadence they agreed.",
  OVERDUE: "They have a standing one-to-one and it has slipped.",
  NEVER_MET: "A one-to-one exists and they have not sat down yet.",
  NO_SERIES: "No standing one-to-one at all. Their manager starts one.",
  NO_MANAGER: "Nobody to have one with. Not a problem with the one-to-one.",
};

export const COVERAGE_LABELS: Record<ApiCoverageState, string> = {
  UP_TO_DATE: "Up to date",
  OVERDUE: "Overdue",
  NEVER_MET: "Never met",
  NO_SERIES: "None set up",
  NO_MANAGER: "No manager",
};

const signalOf = (signal?: AbortSignal) => (signal ? { signal } : {});

export const oneOnOnesApi = {
  /** Every 1:1 the caller is in, as a manager and as somebody's report. */
  mine: (signal?: AbortSignal) =>
    request<ApiOneOnOne[]>("/one-on-ones", signalOf(signal)),

  /** Who is meeting and who is not. `EDIT_RECORDS`, and no content in it. */
  coverage: (signal?: AbortSignal) =>
    request<ApiCoverage>("/one-on-ones/coverage", signalOf(signal)),

  start: (body: { employeeId: string; cadence?: ApiCadence }) =>
    request<ApiOneOnOne>("/one-on-ones", { method: "POST", body }),

  /**
   * Who this person could start one with. Next to `start`, because it is the
   * list that feeds it and the two have to agree.
   *
   * ## One predicate, asked twice — not two definitions
   *
   * The screen used to offer the **whole directory** and let the API refuse
   * each choice, and its header defended that: filtering here "would need a
   * second definition of who reports to me on this side, and the two would
   * drift". The objection was sound and the conclusion was wrong, because
   * there is a way to ask without defining anything.
   *
   * `POST /one-on-ones` accepts a person when
   * `employee.managerId === caller.employeeId` (one-on-ones `service.ts`).
   * This asks `/employees?managerId=<caller>`, which is
   * `where: { managerId: query.managerId }` in the employees service — **the
   * same column, the same value, the same table.** Nothing is re-derived in
   * the browser, so there is no second definition to drift from the first.
   *
   * ## Why an ordinary employee gets an answer
   *
   * `GET /employees` carries no permission — who reports to whom is not
   * privileged, the org chart already publishes it, and money is redacted
   * server-side. So this returns for everybody, and for most people it
   * returns **an empty list**, which is the answer the screen needs in order
   * to stop offering a button that only ever fails.
   *
   * Sorted here rather than by `sort=`: the parameter's accepted values are
   * the employees module's business, and a name order is not worth coupling to
   * them.
   */
  reports: (employeeId: string, signal?: AbortSignal) =>
    requestPaged<ApiPossibleReport>("/employees", {
      query: { managerId: employeeId, pageSize: 200 },
      ...signalOf(signal),
    }).then(({ data }) =>
      [...data].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    ),

  updateSeries: (
    id: string,
    body: { cadence?: ApiCadence; active?: boolean },
  ) => request<ApiOneOnOne>(`/one-on-ones/${id}`, { method: "PATCH", body }),

  meetings: (seriesId: string, signal?: AbortSignal) =>
    request<ApiOneOnOneMeeting[]>(
      `/one-on-ones/${seriesId}/meetings`,
      signalOf(signal),
    ),

  schedule: (seriesId: string, scheduledFor: string) =>
    request<ApiOneOnOneMeeting>(`/one-on-ones/${seriesId}/meetings`, {
      method: "POST",
      body: { scheduledFor },
    }),

  /**
   * Notes and whether it happened.
   *
   * Two separate fields on purpose: marking a meeting held is what the coverage
   * report counts, so it must never be a side effect of typing an agenda.
   */
  updateMeeting: (
    id: string,
    body: { notes?: string | null; held?: boolean },
  ) =>
    request<ApiOneOnOneMeeting>(`/one-on-ones/meetings/${id}`, {
      method: "PATCH",
      body,
    }),

  cancelMeeting: (id: string) =>
    request<{ cancelled: boolean }>(`/one-on-ones/meetings/${id}`, {
      method: "DELETE",
    }),

  addItem: (
    meetingId: string,
    body: {
      kind: ApiItemKind;
      text: string;
      ownerId?: string | null;
      dueDate?: string | null;
    },
  ) =>
    request<ApiOneOnOneItem>(`/one-on-ones/meetings/${meetingId}/items`, {
      method: "POST",
      body,
    }),

  setItemDone: (id: string, done: boolean) =>
    request<ApiOneOnOneItem>(`/one-on-ones/items/${id}`, {
      method: "PATCH",
      body: { done },
    }),

  removeItem: (id: string) =>
    request<{ removed: boolean }>(`/one-on-ones/items/${id}`, {
      method: "DELETE",
    }),
};
