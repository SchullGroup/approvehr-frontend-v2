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
};

export type ApiInterviewNotices = {
  interviewId: string;
  calendarSequence: number;
  notices: ApiInterviewNotice[];
};

/* ------------------------------------------------------------------- calls */

export const interviewsApi = {
  notices: (id: string, signal?: AbortSignal) =>
    request<ApiInterviewNotices>(`/recruitment/interviews/${id}/notices`, {
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
