"use client";

import { request } from "@/lib/api/client";
import { fetchBinary, type BinaryDownload } from "@/lib/api/download";
import type { ApiEmailStatus } from "@/lib/api/candidate-email";

/**
 * What the API says about the messages an interview owed, and its calendar files.
 * `/api/v1/recruitment/interviews/*` and `/recruitment/my/interviews/*`.
 *
 * The wire and nothing else: no React, no state, no wording. What the screens draw comes
 * through `lib/hiring/interviews/api-gateway.ts`.
 */

/* -------------------------------------------------- what a change says it did */

/**
 * Where one message stands as the request that asked for it ends. Nothing here is
 * "sent": the most the API says is `queued`.
 */
export type ApiNoticeState =
  "not_asked" | "queued" | "skipped" | "already_queued" | "already_sent";

export type ApiNoticeResult = {
  state: ApiNoticeState;
  emailId: string | null;
  /** The email actually used: an invitation can go where an update was asked for. */
  emailKind: string | null;
  /** Why it did not go, in words, when `state` is `skipped`. */
  reason: string | null;
};

export type ApiPanelNotice = ApiNoticeResult & {
  employeeId: string | null;
  userId: string | null;
  seat: "EMPLOYEE" | "ACCOUNT";
  name: string;
  /** What the notice in their ApproveHR inbox came to. */
  inApp: "created" | "no_account" | "not_asked";
};

export type ApiNotified = {
  /** Whether the person asked for anybody to be told. */
  asked: boolean;
  occasion: "INVITE" | "UPDATE" | "CANCEL" | null;
  sendTo: "ALL" | "CANDIDATE" | "PANEL";
  candidate: ApiNoticeResult;
  panelists: ApiPanelNotice[];
};

/* ------------------------------------------------- the log on one interview */

export type ApiInterviewNotice = {
  id: string;
  kind: string;
  kindLabel: string;
  /** `"REMINDER"` for a reminder or a nudge; the rest were asked for by a person. */
  trigger?: string;
  status: ApiEmailStatus;
  /** Why it was not sent, or is waiting, in words. */
  note: string | null;
  subject: string | null;
  sentAt: string | null;
  createdAt: string;
  audience: "CANDIDATE" | "PANELIST";
  recipient: {
    name: string;
    seat: "CANDIDATE" | "EMPLOYEE" | "ACCOUNT";
    employeeId: string | null;
    userId: string | null;
  };
  /** What the notice in a panelist's inbox came to, or `null` when none was asked for. */
  inApp: string | null;
  /**
   * For a reminder or a nudge, which one; `null` for a notice. A reminder is in this log
   * because the log is every email about the interview, but it is read on the reminders.
   */
  slot?: string | null;
  dueAt?: string | null;
  expiresAt?: string | null;
};

export type ApiInterviewNotices = {
  interviewId: string;
  calendarSequence: number;
  notices: ApiInterviewNotice[];
};

/* ------------------------------------------------------------------ reminders */

export type ApiReminderSlot =
  "cand-early" | "cand-late" | "pan-early" | "pan-late" | "nudge-1" | "nudge-2";

export type ApiSlotSetting = { enabled: boolean; minutesBefore: number };

/** The company's choices, as `GET /careers/settings` says them. */
export type ApiReminderChoices = {
  candidate: { early: ApiSlotSetting; late: ApiSlotSetting };
  panelist: { early: ApiSlotSetting; late: ApiSlotSetting };
  scorecardNudge: {
    enabled: boolean;
    firstAfterHours: number;
    /** `null` is no second nudge. */
    secondAfterHours: number | null;
  };
};

type ApiRange = { min: number; max: number };

export type ApiReminderSettings = ApiReminderChoices & {
  /** What a company that has never chosen gets. */
  defaults: ApiReminderChoices;
  /** The most and least each may be set to. */
  bounds: {
    earlyMinutes: ApiRange;
    lateMinutes: ApiRange;
    nudgeFirstHours: ApiRange;
    nudgeSecondHours: ApiRange;
  };
};

/** `PATCH /careers/settings` takes any part of it. */
export type ApiReminderChoicesPatch = {
  candidate?: {
    early?: Partial<ApiSlotSetting>;
    late?: Partial<ApiSlotSetting>;
  };
  panelist?: {
    early?: Partial<ApiSlotSetting>;
    late?: Partial<ApiSlotSetting>;
  };
  scorecardNudge?: Partial<ApiReminderChoices["scorecardNudge"]>;
};

export type ApiReminderStatus =
  "planned" | "due" | "sending" | "sent" | "skipped" | "failed";

export type ApiReminderRow = {
  id: string;
  slot: ApiReminderSlot;
  slotLabel: string;
  kind: string;
  audience: "CANDIDATE" | "PANELIST";
  recipient: {
    name: string;
    seat: "CANDIDATE" | "EMPLOYEE" | "ACCOUNT";
    employeeId: string | null;
    userId: string | null;
  };
  /** When it is, or was, due. */
  dueAt: string;
  /** When it is too late to be of any use. */
  expiresAt: string | null;
  status: ApiReminderStatus;
  /** Why it was not, or has not yet been, sent, in words. */
  reason: string | null;
  sentAt: string | null;
  /** The calendar sequence it was planned for. */
  sequence: number;
  /** Whether that is the interview as it stands. A reminder for an earlier one was settled. */
  current: boolean;
};

export type ApiRemindersPaused = {
  code:
    "no_invitation" | "changed_since_told" | "not_scheduled" | "none_planned";
  reason: string;
};

/** `GET /recruitment/interviews/:id/reminders`: times and people, never the words. */
export type ApiInterviewReminders = {
  interviewId: string;
  calendarSequence: number;
  status: string;
  /** `false` is the per-interview switch for the candidate's reminders. */
  candidateReminders: boolean;
  reminders: ApiReminderRow[];
  /** Why nothing is waiting, when nothing is. `null` when something is. */
  paused: ApiRemindersPaused | null;
};

/* ------------------------------------------------------------------- calls */

export const interviewsApi = {
  notices: (id: string, signal?: AbortSignal) =>
    request<ApiInterviewNotices>(`/recruitment/interviews/${id}/notices`, {
      ...(signal ? { signal } : {}),
    }),

  /** What is planned for one interview, and what became of what was planned before. */
  reminders: (id: string, signal?: AbortSignal) =>
    request<ApiInterviewReminders>(`/recruitment/interviews/${id}/reminders`, {
      ...(signal ? { signal } : {}),
    }),

  /** A staff member's copy: the one that names the candidate and says it is for the panel. */
  staffCalendarFile: (id: string): Promise<BinaryDownload> =>
    fetchBinary(
      `/recruitment/interviews/${id}/calendar.ics?for=panel`,
      "interview",
      "ics",
    ),

  /** A panelist's own copy. Anything that is not theirs is a 404. */
  myCalendarFile: (id: string): Promise<BinaryDownload> =>
    fetchBinary(
      `/recruitment/my/interviews/${id}/calendar.ics`,
      "interview",
      "ics",
    ),
};
