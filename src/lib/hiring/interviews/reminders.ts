import type { MyNudges } from "@/lib/hiring/comms/model";
import type { InterviewNotice, InterviewView } from "./model";

/**
 * Reminders about an interview: what the company has set, what is planned for one
 * interview, and what each came to.
 *
 * ## A reminder is never the first thing anybody is told
 *
 * A reminder follows an invitation that was actually **sent**. An interview booked with
 * "Don't send", or whose invitation was skipped or is still queued, has no reminders and
 * says why, and its reminder controls are not offered: a reminder is how somebody is
 * reminded, not how they first hear of it.
 *
 * ## Nothing here is sent
 *
 * This is the plan and the record. The API's worker sends; a reminder is "Sent" only where
 * the API says so, "Planned" while it is waiting for its time, "Skipped" with the reason
 * where it could not go.
 *
 * No React, no state.
 */

export type ReminderKind =
  "CANDIDATE_EARLY" | "CANDIDATE_FINAL" | "PANELIST" | "SCORECARD_NUDGE";

export type ReminderRule = {
  kind: ReminderKind;
  enabled: boolean;
  /** Hours before the interview, or after it for a nudge. */
  hours: number;
  /** What the API accepts. */
  bounds: { min: number; max: number };
};

/** The company's own defaults. */
export type ReminderSettings = {
  rules: ReminderRule[];
  /** Most scorecard nudges one person gets for one interview. */
  nudges: { max: number; bounds: { min: number; max: number } };
};

export type ReminderStatus =
  "PLANNED" | "PENDING" | "SENT" | "SKIPPED" | "FAILED";

/** One reminder, planned or done. */
export type PlannedReminder = {
  id: string;
  kind: ReminderKind;
  audience: "CANDIDATE" | "PANELIST";
  /** When it is due, or went. ISO instant. */
  at: string;
  status: ReminderStatus;
  /** Why it was skipped or failed, in words. */
  note: string | null;
  /** Which nudge this is, for a scorecard nudge: "1 of 3". */
  nth?: { n: number; of: number };
};

export type InterviewReminders = {
  /** Whether somebody turned reminders off for this interview. */
  off: boolean;
  items: PlannedReminder[];
};

/* --------------------------------------------------------------------- words */

export const KIND_TITLE: Record<ReminderKind, string> = {
  CANDIDATE_EARLY: "The first reminder to the candidate",
  CANDIDATE_FINAL: "The last reminder to the candidate",
  PANELIST: "A reminder to each panelist",
  SCORECARD_NUDGE: "A nudge to hand in the scorecard",
};

/** One plain line each: what it is, and the condition that applies to all of them. */
export const KIND_LINE: Record<ReminderKind, string> = {
  CANDIDATE_EARLY:
    "Tells the candidate the interview is coming up. Only sent for interviews where you chose to send the invitation.",
  CANDIDATE_FINAL:
    "A short note close to the time. Only sent for interviews where you chose to send the invitation.",
  PANELIST:
    "Reminds each person invited to score it. Only sent for interviews where you chose to send the invitation.",
  SCORECARD_NUDGE:
    "Asks a panelist whose scorecard is not in yet. Only sent for interviews where you chose to send the invitation.",
};

export const hoursWords = (hours: number): string =>
  hours === 1
    ? "1 hour"
    : hours % 24 === 0 && hours >= 48
      ? `${String(hours / 24)} days`
      : hours === 24
        ? "24 hours"
        : `${String(hours)} hours`;

/** "24 hours before the interview" or "24 hours after it". */
export const timingWords = (kind: ReminderKind, hours: number): string =>
  kind === "SCORECARD_NUDGE"
    ? `${hoursWords(hours)} after the interview`
    : `${hoursWords(hours)} before the interview`;

export const recipientWords = (
  audience: PlannedReminder["audience"],
): string => (audience === "CANDIDATE" ? "The candidate" : "Each panelist");

const STATUS_LABEL: Record<ReminderStatus, string> = {
  PLANNED: "Planned",
  PENDING: "Queued",
  SENT: "Sent",
  SKIPPED: "Skipped",
  FAILED: "Failed",
};

const STATUS_TONE: Record<
  ReminderStatus,
  "info" | "neutral" | "success" | "warning" | "danger"
> = {
  PLANNED: "neutral",
  PENDING: "info",
  SENT: "success",
  SKIPPED: "warning",
  FAILED: "danger",
};

export const reminderStatus = (
  status: ReminderStatus,
): { label: string; tone: (typeof STATUS_TONE)[ReminderStatus] } => ({
  label: STATUS_LABEL[status],
  tone: STATUS_TONE[status],
});

/** The API writes "not sent: ..." and "waiting: ..."; the label says it already. */
export const reasonOf = (note: string | null): string | null => {
  if (!note) return null;
  const trimmed = note.replace(/^(not sent|waiting):\s*/i, "").trim();
  if (trimmed === "") return null;
  const sentence = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
};

/** "The candidate, 24 hours before" / "Each panelist, nudge 1 of 3". */
export const reminderTitle = (
  reminder: PlannedReminder,
  settings: ReminderSettings | null,
): string => {
  const who = recipientWords(reminder.audience);
  if (reminder.kind === "SCORECARD_NUDGE")
    return reminder.nth
      ? `${who}: scorecard nudge ${String(reminder.nth.n)} of ${String(reminder.nth.of)}`
      : `${who}: scorecard nudge`;
  const hours = settings?.rules.find(
    (rule) => rule.kind === reminder.kind,
  )?.hours;
  return hours !== undefined
    ? `${who}: ${timingWords(reminder.kind, hours)}`
    : `${who}: before the interview`;
};

/* ----------------------------------------- when reminders can exist at all */

/** Whether the candidate's invitation was actually sent. Queued is not sent. */
export const invitationSent = (
  notices: readonly InterviewNotice[] | null,
): boolean =>
  (notices ?? []).some(
    (n) =>
      n.audience === "CANDIDATE" && n.kind === "INVITE" && n.status === "SENT",
  );

/**
 * Why there are no reminders, when there are none for that reason; `null` when the
 * interview can have some (or when not enough is known to say).
 */
export function noRemindersBecause(
  interview: Pick<InterviewView, "notices" | "status">,
): string | null {
  if (interview.notices === null) return null;
  if (interview.status === "CANCELLED")
    return "No reminders: the interview is cancelled.";
  if (invitationSent(interview.notices)) return null;
  const queued = interview.notices.some(
    (n) =>
      n.audience === "CANDIDATE" &&
      n.kind === "INVITE" &&
      (n.status === "PENDING" || n.status === "SENDING"),
  );
  return queued
    ? "No reminders yet: the invitation is queued, not sent. They start once it has been sent."
    : "No reminders: the invitation wasn't sent.";
}

/** What changed about the plan after a reschedule or a cancellation, in a sentence. */
export function replanSentence(
  what: "rescheduled" | "cancelled",
  counts: { planned: number; removed: number } | null,
): string | null {
  if (counts === null) return null;
  if (what === "cancelled")
    return counts.removed > 0
      ? `${String(counts.removed)} planned ${counts.removed === 1 ? "reminder was" : "reminders were"} removed.`
      : "No reminder was planned, so none was removed.";
  return counts.planned > 0
    ? `${String(counts.planned)} ${counts.planned === 1 ? "reminder was" : "reminders were"} planned again for the new time.`
    : "No reminder is planned for the new time.";
}

/**
 * Where the nudges for a scorecard stand, in a sentence for the person who owes it.
 * Nothing about it says an email went except a count the API gave.
 */
export function nudgeSentence(
  nudges: MyNudges,
  when: (iso: string) => string,
): string {
  if (nudges.off) return "Reminders are off for this interview.";
  const next = nudges.nextAt ? ` The next is due ${when(nudges.nextAt)}.` : "";
  if (nudges.sent === 0)
    return nudges.nextAt
      ? `No reminder has gone yet. The first is due ${when(nudges.nextAt)}.`
      : "No reminder is planned.";
  const last = nudges.lastAt ? ` ${when(nudges.lastAt)}` : "";
  const done =
    !nudges.nextAt && nudges.sent >= nudges.of ? " That was the last." : "";
  return `Reminder ${String(nudges.sent)} of ${String(nudges.of)} sent${last}.${next}${done}`;
}

/* ----------------------------------------------------------------- the settings */

export type SettingsProblem = { field: string; message: string };

/**
 * What is wrong with a set of defaults, each against the box it is in, by the bounds the
 * server gave. The screen asks before it saves, so a refusal is only ever somebody typing
 * past the box's own words.
 */
export function settingsProblems(
  settings: ReminderSettings,
): SettingsProblem[] {
  const out: SettingsProblem[] = [];
  for (const rule of settings.rules) {
    if (!Number.isInteger(rule.hours))
      out.push({ field: rule.kind, message: "Hours are a whole number." });
    else if (rule.hours < rule.bounds.min || rule.hours > rule.bounds.max)
      out.push({
        field: rule.kind,
        message: `Between ${String(rule.bounds.min)} and ${String(rule.bounds.max)} hours.`,
      });
  }
  const { max, bounds } = settings.nudges;
  if (!Number.isInteger(max) || max < bounds.min || max > bounds.max)
    out.push({
      field: "nudges",
      message: `Between ${String(bounds.min)} and ${String(bounds.max)} nudges.`,
    });
  return out;
}
