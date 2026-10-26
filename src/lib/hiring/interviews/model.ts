import type { InterviewKind, InterviewStatus } from "@/lib/api/recruitment";
import type { PanelSeats } from "@/lib/hiring/comms/seats";
import type {
  InterviewReminders,
  RemindersPaused,
  ReplanCounts,
} from "./reminders";

/**
 * What the interview screens draw, whichever side it came from.
 *
 * `api-gateway.ts` turns the API's answers into these and `demo-gateway.ts` makes
 * them from a book kept in this browser, so a screen has one code path and cannot
 * quietly behave differently offline.
 *
 * No React, no state.
 */

/* ------------------------------------------------------------ the notifications */

/** Who a message about an interview goes to. A panelist is never sent what the candidate is. */
export type NoticeAudience = "CANDIDATE" | "PANELIST";

/** Which message: the invitation, the update after a change, the cancellation. */
export type NoticeKind = "INVITE" | "UPDATE" | "CANCEL";

/**
 * Where one message stands.
 *
 * `NOT_ASKED` is the person choosing not to send: nothing was queued, and nothing
 * will be. Everything else is the API's own word. Only `SENT` is worded as sent.
 */
export type NoticeStatus =
  "NOT_ASKED" | "PENDING" | "SENDING" | "SENT" | "SKIPPED" | "FAILED";

/** One message to one person about one interview, and what became of it. */
export type InterviewNotice = {
  id: string;
  kind: NoticeKind;
  audience: NoticeAudience;
  /** The candidate's name, or the panelist's. `null` when the API does not say. */
  recipient: string | null;
  status: NoticeStatus;
  /** Why it was not sent, or is waiting, in words. */
  note: string | null;
  at: string | null;
  /**
   * For a panelist: what the notice in their ApproveHR inbox came to. The inbox is not the
   * email, and the two are never mixed up. Absent where the API does not say.
   */
  inApp?: "created" | "no_account" | "off" | "not_asked" | null;
};

/* ----------------------------------------------------------------- an interview */

export type InterviewSeat = {
  /** `e:<employee>` or `u:<account>`: see `comms/seats.ts`. */
  key: string;
  name: string;
  /** Whether their scorecard is in. */
  submitted: boolean;
};

export type InterviewView = {
  id: string;
  applicationId: string;
  /** For the calendar entry's title. */
  candidateName: string;
  role: string | null;
  kind: InterviewKind;
  /** ISO instant. */
  scheduledFor: string;
  durationMins: number;
  status: InterviewStatus;
  /** A room, an address: where, in words. */
  location: string | null;
  /**
   * The zone this interview's time is written in. `null` is the company's own, which is
   * what an interview made before zones were kept reads as.
   */
  timeZone: string | null;
  /** An https link to the call. Pasted by staff; nothing here makes one. */
  joinUrl: string | null;
  stageName: string | null;
  panelists: InterviewSeat[];
  /** The calendar sequence: it goes up each time a calendar is told about a change. */
  sequence: number;
  /**
   * Every message asked of the mail for this interview, oldest first. `null` is "this
   * server does not say", which a screen treats as unknown, never as "none".
   */
  notices: InterviewNotice[] | null;
  /** Why it was cancelled, when it was. */
  cancelReason: string | null;
  /**
   * Whether reminders to the candidate are on for this interview: `false` is the
   * per-interview switch. The panel's reminders are the company's, and have none.
   */
  candidateReminders?: boolean;
  /**
   * What is planned and what went. Absent where the server does not say, which a screen
   * draws as nothing, never as "no reminders".
   */
  reminders?: InterviewReminders | null;
};

/* -------------------------------------------------------------------- what is asked */

export type ScheduleInput = {
  kind: InterviewKind;
  /** ISO instant, made from the company's clock. */
  scheduledFor: string;
  /** The zone it was typed in: the company's, said outright. */
  timeZone: string;
  durationMins: number;
  location: string | null;
  /** https only; checked before it is sent. */
  joinUrl: string | null;
  /** `null` is "whoever is on the stage's panel", which the API works out. */
  panel: PanelSeats | null;
  /** Only ever true when the person chose to send. */
  sendInvite: boolean;
  /** `false` turns the candidate's reminders off for this interview. Absent: they are on. */
  candidateReminders?: boolean;
};

/** What changed about an interview. Absent is "left alone"; `null` clears. */
export type ChangeInput = {
  kind?: InterviewKind;
  scheduledFor?: string;
  durationMins?: number;
  location?: string | null;
  joinUrl?: string | null;
  /** Only ever true when the person chose to send an updated invitation. */
  sendUpdate: boolean;
  /** `false` turns the candidate's reminders off for this interview; `true` turns them back on. */
  candidateReminders?: boolean;
};

export type CancelInput = {
  reason: string | null;
  /** Only ever true when the person chose to send a cancellation. */
  sendCancellation: boolean;
};

/** What the API says about the messages a change asked for. */
export type ChangeOutcome = {
  /** Whether the person asked for any message. */
  asked: boolean;
  notices: InterviewNotice[];
  /**
   * What the change did to the reminders, from what the API reported after it: how many are
   * planned now, how many were taken off, and its reason when none is planned. Absent
   * where the API does not say.
   */
  reminders?: (ReplanCounts & { paused: RemindersPaused | null }) | null;
};

export type ChangeResult = { interview: InterviewView; outcome: ChangeOutcome };

/* ---------------------------------------------------------- what the dialog explains */

/**
 * In the API's words, who is told what when an invitation goes out. The candidate gets
 * the time, the place or link and a calendar file; each panelist gets the same with the
 * candidate's name and the role, and never a score, a salary or contact details.
 */
export type InviteExplainer = {
  candidate: string;
  panelist: string;
};
