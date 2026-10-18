import {
  INTERVIEW_KIND_LABEL,
  type ApiInterviewMutation,
  type ApiInterviewSummary,
  type InterviewKind,
} from "@/lib/api/recruitment";
import type {
  ApiInterviewNotice,
  ApiInterviewReminders,
  ApiNoticeResult,
  ApiNotified,
  ApiReminderChoices,
  ApiReminderChoicesPatch,
} from "@/lib/api/interviews";
import type { ApiCareersSettings } from "@/lib/api/careers";
import type { MyApplication, MyInterviewRow } from "@/lib/hiring/comms/model";
import { seatKey } from "@/lib/hiring/comms/seats";
import type {
  ChangeOutcome,
  InterviewNotice,
  InterviewView,
  NoticeKind,
  NoticeStatus,
} from "./model";
import type {
  InterviewReminders,
  ReminderSettings,
  ReminderSettingsView,
} from "./reminders";

/**
 * The API's interview, as the interview screens draw it.
 *
 * Every field the API may not have sent yet reads as "not said": a missing link is no
 * link, a missing sequence is the first, and a missing list of messages is `null`, which
 * a screen treats as unknown and never as "no email was asked for".
 */
export function viewFromSummary(
  interview: ApiInterviewSummary,
  context: {
    applicationId: string;
    candidateName: string;
    role: string | null;
  },
): InterviewView {
  return {
    id: interview.id,
    applicationId: context.applicationId,
    candidateName: context.candidateName,
    role: context.role,
    kind: interview.kind,
    scheduledFor: interview.scheduledFor,
    durationMins: interview.durationMins,
    status: interview.status,
    location: interview.location,
    joinUrl: interview.joinUrl ?? null,
    timeZone: interview.timeZone ?? null,
    stageName: interview.stageName ?? null,
    panelists: (interview.panelists ?? []).map((person) => ({
      key: seatKey(person),
      name: person.name,
      submitted: person.submitted,
    })),
    sequence: interview.calendarSequence ?? 0,
    notices: null,
    cancelReason: null,
    ...(interview.candidateReminders !== undefined
      ? { candidateReminders: interview.candidateReminders }
      : {}),
  };
}

/** The kind's code from its label, for a row that only says "Technical". */
const kindCodeOf = (label: string, code?: InterviewKind): InterviewKind =>
  code ??
  (Object.keys(INTERVIEW_KIND_LABEL) as InterviewKind[]).find(
    (kind) => INTERVIEW_KIND_LABEL[kind] === label,
  ) ??
  "SCREEN";

/**
 * A panelist's interview, from the row "My interviews" lists. It holds only what the
 * API gave a panelist: the name, the role, the time, the place and the link. There is
 * nothing here to put a score, a salary or contact details into a calendar entry.
 */
export function viewFromMyRow(row: MyInterviewRow): InterviewView {
  return {
    id: row.interviewId,
    applicationId: row.applicationId,
    candidateName: row.candidateName,
    role: row.role || null,
    kind: kindCodeOf(row.kind, row.kindCode),
    scheduledFor: row.scheduledFor,
    durationMins: row.durationMins,
    status: row.status,
    location: row.location,
    joinUrl: row.joinUrl ?? null,
    timeZone: row.timeZone ?? null,
    stageName: null,
    panelists: [],
    sequence: row.sequence ?? 0,
    notices: null,
    cancelReason: null,
  };
}

/** The same, from one interview on a candidate a panelist is looking at. */
export function viewFromMyInterview(
  application: Pick<MyApplication, "id" | "candidateName" | "role">,
  interview: MyApplication["interviews"][number],
): InterviewView {
  return {
    id: interview.id,
    applicationId: application.id,
    candidateName: application.candidateName,
    role: application.role || null,
    kind: kindCodeOf(interview.kind, interview.kindCode),
    scheduledFor: interview.scheduledFor,
    durationMins: interview.durationMins,
    status: interview.status,
    location: interview.location,
    joinUrl: interview.joinUrl ?? null,
    timeZone: interview.timeZone ?? null,
    stageName: interview.stageName,
    panelists: [],
    sequence: interview.sequence ?? 0,
    notices: null,
    cancelReason: null,
  };
}

/* ------------------------------------------------ what a change answered, as words */

/** What kind of message an email kind is, whoever it is for. */
export function noticeKindOf(
  kind: string | null,
  fallback: NoticeKind,
): NoticeKind {
  if (kind === "INVITE" || kind === "PANELIST_INVITE") return "INVITE";
  if (kind === "INTERVIEW_UPDATE" || kind === "PANELIST_UPDATE")
    return "UPDATE";
  if (kind === "INTERVIEW_CANCELLED" || kind === "PANELIST_CANCELLED")
    return "CANCEL";
  return fallback;
}

const STATE_STATUS: Record<ApiNoticeResult["state"], NoticeStatus> = {
  not_asked: "NOT_ASKED",
  queued: "PENDING",
  already_queued: "PENDING",
  skipped: "SKIPPED",
  already_sent: "SENT",
};

const STATE_NOTE: Partial<Record<ApiNoticeResult["state"], string>> = {
  already_queued: "It was already queued for this version of the interview.",
};

/**
 * What the API said about each message a booking, change, cancellation or "send now"
 * asked for. The most it says is `queued`; `already_sent` is the API's own word that an
 * earlier request had sent it.
 */
export function outcomeFrom(
  notified: ApiNotified,
  candidateName: string,
  /**
   * Which message the request was about, for when the API names none: it says no
   * occasion for a message nobody asked for, and "not asked" has to say which one it was
   * (an updated invitation, not an invitation) from what was being done.
   */
  asked: NoticeKind = "INVITE",
): ChangeOutcome {
  const fallback: NoticeKind = notified.occasion ?? asked;
  const one = (
    result: ApiNoticeResult,
    audience: InterviewNotice["audience"],
    recipient: string,
    id: string,
  ): InterviewNotice => ({
    id: result.emailId ?? id,
    kind: noticeKindOf(result.emailKind, fallback),
    audience,
    recipient,
    status: STATE_STATUS[result.state],
    note: result.reason ?? STATE_NOTE[result.state] ?? null,
    at: null,
  });
  return {
    asked: notified.asked,
    notices: [
      one(notified.candidate, "CANDIDATE", candidateName, "candidate"),
      ...notified.panelists.map((person) => ({
        ...one(
          person,
          "PANELIST",
          person.name,
          `panelist-${person.userId ?? person.employeeId ?? person.name}`,
        ),
        inApp: person.inApp,
      })),
    ],
  };
}

/**
 * Whether a row of the log is a reminder or a nudge rather than a message somebody asked
 * for. The log holds every email about the interview, and the two are read apart: the
 * messages on the interview's emails, the reminders in its reminders.
 */
export const isReminderRow = (row: ApiInterviewNotice): boolean =>
  (row.slot ?? null) !== null || row.trigger === "REMINDER";

/** One row of the log an interview keeps of what it asked of the mail. */
export function noticeFromRow(row: ApiInterviewNotice): InterviewNotice {
  return {
    id: row.id,
    kind: noticeKindOf(row.kind, "INVITE"),
    audience: row.audience,
    recipient: row.recipient.name || null,
    status: row.status,
    note: row.note,
    at: row.sentAt,
    inApp:
      row.inApp === "CREATED"
        ? "created"
        : row.inApp === "NO_ACCOUNT"
          ? "no_account"
          : row.inApp === "OFF"
            ? "off"
            : null,
  };
}

/**
 * The interview a booking or a change answered with, as the screens draw it. The
 * messages on it are the ones the person already had plus the ones just asked for: the
 * log keeps only what was asked, so "not asked" is not added to it.
 */
export function viewFromMutation(
  answer: ApiInterviewMutation,
  context: { role: string | null },
  before: readonly InterviewNotice[] | null,
  outcome: ChangeOutcome,
): InterviewView {
  const asked = outcome.notices.filter((n) => n.status !== "NOT_ASKED");
  return {
    id: answer.id,
    applicationId: answer.applicationId,
    candidateName: answer.candidateName,
    role: context.role,
    kind: answer.kind,
    scheduledFor: answer.scheduledFor,
    durationMins: answer.durationMins,
    status: answer.status,
    location: answer.location,
    joinUrl: answer.joinUrl ?? null,
    timeZone: answer.timeZone ?? null,
    stageName: answer.stageName ?? null,
    panelists: (answer.panelists ?? []).map((person) => ({
      key: seatKey(person),
      name: person.name,
      submitted: person.submitted,
    })),
    sequence: answer.calendarSequence ?? 0,
    notices: before === null ? null : [...before, ...asked],
    cancelReason: null,
    ...(answer.candidateReminders !== undefined
      ? { candidateReminders: answer.candidateReminders }
      : {}),
  };
}

/* ------------------------------------------------------------------- reminders */

/** What the API says is planned for one interview, as the screens draw it. */
export function remindersFromApi(
  answer: ApiInterviewReminders,
): InterviewReminders {
  return {
    items: answer.reminders.map((row) => ({
      id: row.id,
      slot: row.slot,
      label: row.slotLabel,
      audience: row.audience,
      recipient: row.recipient.name,
      dueAt: row.dueAt,
      sentAt: row.sentAt,
      status: row.status,
      reason: row.reason,
      current: row.current,
    })),
    paused: answer.paused,
  };
}

const choicesFrom = (choices: ApiReminderChoices): ReminderSettings => ({
  candidate: {
    early: { ...choices.candidate.early },
    late: { ...choices.candidate.late },
  },
  panelist: {
    early: { ...choices.panelist.early },
    late: { ...choices.panelist.late },
  },
  scorecardNudge: { ...choices.scorecardNudge },
});

/**
 * The company's reminder settings from its settings view. `null` where the API has none:
 * an older API says nothing about reminders and a screen does not make up defaults.
 */
export function reminderSettingsFromApi(
  settings: ApiCareersSettings,
): ReminderSettingsView | null {
  const reminders = settings.interviewReminders;
  if (!reminders) return null;
  return {
    values: choicesFrom(reminders),
    defaults: choicesFrom(reminders.defaults),
    bounds: reminders.bounds,
    willSend: settings.candidateEmails?.willSend ?? null,
    blockedBy: settings.candidateEmails?.blockedBy ?? [],
    usage: settings.candidateEmails?.usage ?? null,
  };
}

/** Every choice, as the body of a `PATCH`: what has not changed is not an audit entry. */
export const choicesToPatch = (
  values: ReminderSettings,
): ApiReminderChoicesPatch => ({
  candidate: { early: values.candidate.early, late: values.candidate.late },
  panelist: { early: values.panelist.early, late: values.panelist.late },
  scorecardNudge: values.scorecardNudge,
});
