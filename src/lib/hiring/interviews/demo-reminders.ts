import {
  type InterviewReminders,
  type PlannedReminder,
  type ReminderBounds,
  type ReminderSettings,
  type ReminderSettingsView,
  type ReminderSlot,
  type RemindersPaused,
} from "./reminders";

/**
 * The practice board's reminders, as plain functions: what is planned for an interview,
 * what became of what was planned before, and the company's choices.
 *
 * ## Nothing is ever sent from here
 *
 * A practice board has no mail and no clock that runs, so it plans: it works out which
 * reminders an interview would have, and when, by the same rules the API uses (see the
 * backend's `reminder-slots.ts`): only for people whose invitation was **sent**, only for the
 * interview as it now stands, and nothing whose time has passed. What the log holds of
 * reminders that "went" is seed data, written as the API would have written it. A
 * reminder asked for here is never recorded as sent.
 *
 * The sentences are the API's, word for word, so a practice board cannot show a reason the
 * real one would not give.
 *
 * Pure on purpose: nothing here reads storage or the clock.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

/** What the practice board accepts: the API's own limits. */
export const DEMO_BOUNDS: ReminderBounds = {
  earlyMinutes: { min: 120, max: 4_320 },
  lateMinutes: { min: 15, max: 360 },
  nudgeFirstHours: { min: 1, max: 48 },
  nudgeSecondHours: { min: 2, max: 72 },
};

/** What a company that has never chosen gets: the API's defaults. */
export function defaultReminderSettings(): ReminderSettings {
  return {
    candidate: {
      early: { enabled: true, minutesBefore: 1_440 },
      late: { enabled: true, minutesBefore: 60 },
    },
    panelist: {
      early: { enabled: false, minutesBefore: 1_440 },
      late: { enabled: true, minutesBefore: 60 },
    },
    scorecardNudge: {
      enabled: true,
      firstAfterHours: 24,
      secondAfterHours: 72,
    },
  };
}

/** The settings page's subject, for a practice board. Nothing is said about sending. */
export const settingsViewOf = (
  values: ReminderSettings,
): ReminderSettingsView => ({
  values,
  defaults: defaultReminderSettings(),
  bounds: DEMO_BOUNDS,
  willSend: null,
  blockedBy: [],
  usage: null,
});

/** Why a reminder that was waiting is settled. The API's words. */
export const SETTLED = {
  changed:
    "not sent: the interview was changed after this was planned, and the change has not been sent to them (send an update to plan new reminders)",
  cancelled: "not sent: the interview was cancelled",
  candidateOff:
    "not sent: reminders to the candidate are turned off for this interview",
} as const;

export const SLOT_LABEL: Record<ReminderSlot, string> = {
  "cand-early": "Reminder to the candidate (earlier)",
  "cand-late": "Reminder to the candidate (shortly before)",
  "pan-early": "Reminder to the panelist (earlier)",
  "pan-late": "Reminder to the panelist (shortly before)",
  "nudge-1": "Scorecard nudge (first)",
  "nudge-2": "Scorecard nudge (second)",
};

/* -------------------------------------------------------------------- the plan */

/** What became of a reminder that was due: seed data, or one a change settled. */
export type ReminderLogEntry = {
  slot: ReminderSlot;
  /** For the panel, whose: `e:` or `u:` key. `null` for the candidate. */
  seat: string | null;
  dueAt: string;
  sentAt: string | null;
  status: "sent" | "skipped" | "failed";
  reason: string | null;
  /** The calendar sequence it was planned for. */
  sequence: number;
};

export type Plannable = {
  id: string;
  candidateName: string;
  scheduledFor: string;
  durationMins: number;
  status: string;
  seats: readonly string[];
  sequence: number;
  /** The sequence the invitation was last sent for. `null`: never sent. */
  toldSequence: number | null;
  candidateRemindersOff: boolean;
  reminderLog: readonly ReminderLogEntry[];
};

const idOf = (
  interview: Pick<Plannable, "id">,
  sequence: number,
  slot: ReminderSlot,
  seat: string | null,
): string =>
  `${interview.id}:${String(sequence)}:${slot}:${seat ?? "candidate"}`;

/**
 * When a slot is due, or `null` when the company has it switched off. Offsets are absolute
 * durations before the start, and nudges are hours after the end.
 */
function dueTime(
  slot: ReminderSlot,
  settings: ReminderSettings,
  start: number,
  end: number,
): number | null {
  const before = (s: { enabled: boolean; minutesBefore: number }) =>
    s.enabled ? start - s.minutesBefore * MINUTE_MS : null;
  switch (slot) {
    case "cand-early":
      return before(settings.candidate.early);
    case "cand-late":
      return before(settings.candidate.late);
    case "pan-early":
      return before(settings.panelist.early);
    case "pan-late":
      return before(settings.panelist.late);
    case "nudge-1":
      return settings.scorecardNudge.enabled
        ? end + settings.scorecardNudge.firstAfterHours * HOUR_MS
        : null;
    case "nudge-2":
      return settings.scorecardNudge.enabled &&
        settings.scorecardNudge.secondAfterHours !== null
        ? end + settings.scorecardNudge.secondAfterHours * HOUR_MS
        : null;
  }
}

/** One reminder still to come: which, for whom, and when. */
type Coming = { slot: ReminderSlot; seat: string | null; due: number };

/**
 * What is still to come for an interview, from the company's choices.
 *
 * Nothing is planned unless the invitation was **sent** for the interview as it stands
 * (a change nobody was told of leaves nobody with reminders), the interview is still on
 * (a nudge also follows an interview that took place), the time is still ahead, and it is
 * not already in the log. The candidate's switch for the interview is honoured.
 */
function comingFor(
  interview: Plannable,
  settings: ReminderSettings,
  now: string,
): Coming[] {
  const told =
    interview.toldSequence !== null &&
    interview.toldSequence === interview.sequence;
  const scheduled = interview.status === "SCHEDULED";
  if (!told || !(scheduled || interview.status === "COMPLETED")) return [];

  const start = Date.parse(interview.scheduledFor);
  const end = start + interview.durationMins * MINUTE_MS;
  const clock = Date.parse(now);
  const out: Coming[] = [];
  const plan = (slot: ReminderSlot, seat: string | null) => {
    const logged = interview.reminderLog.some(
      (entry) =>
        entry.slot === slot &&
        entry.seat === seat &&
        entry.sequence === interview.sequence,
    );
    const due = dueTime(slot, settings, start, end);
    if (logged || due === null || due <= clock) return;
    out.push({ slot, seat, due });
  };
  if (scheduled && !interview.candidateRemindersOff) {
    plan("cand-early", null);
    plan("cand-late", null);
  }
  for (const seat of interview.seats) {
    if (scheduled) {
      plan("pan-early", seat);
      plan("pan-late", seat);
    }
    plan("nudge-1", seat);
    plan("nudge-2", seat);
  }
  return out;
}

/**
 * What an interview's reminders are right now: what went or was settled (the log), then
 * what is still to come.
 */
export function remindersOf(
  interview: Plannable,
  settings: ReminderSettings,
  now: string,
  nameOf: (seat: string) => string,
): InterviewReminders {
  const recipient = (seat: string | null) =>
    seat === null ? interview.candidateName : nameOf(seat);
  const items: PlannedReminder[] = [
    ...interview.reminderLog.map((entry): PlannedReminder => ({
      id: `${idOf(interview, entry.sequence, entry.slot, entry.seat)}:log`,
      slot: entry.slot,
      label: SLOT_LABEL[entry.slot],
      audience: entry.seat === null ? "CANDIDATE" : "PANELIST",
      recipient: recipient(entry.seat),
      dueAt: entry.dueAt,
      sentAt: entry.sentAt,
      status: entry.status,
      reason: entry.reason,
      current: entry.sequence === interview.sequence,
    })),
    ...comingFor(interview, settings, now).map((coming): PlannedReminder => ({
      id: idOf(interview, interview.sequence, coming.slot, coming.seat),
      slot: coming.slot,
      label: SLOT_LABEL[coming.slot],
      audience: coming.seat === null ? "CANDIDATE" : "PANELIST",
      recipient: recipient(coming.seat),
      dueAt: new Date(coming.due).toISOString(),
      sentAt: null,
      status: "planned",
      reason: null,
      current: true,
    })),
  ].sort(
    (a, b) => a.dueAt.localeCompare(b.dueAt) || a.slot.localeCompare(b.slot),
  );
  const told =
    interview.toldSequence !== null &&
    interview.toldSequence === interview.sequence;
  return { items, paused: pausedFor(interview, items, told) };
}

/** Why nothing is waiting, in the API's own words and codes. */
function pausedFor(
  interview: Plannable,
  items: readonly PlannedReminder[],
  told: boolean,
): RemindersPaused | null {
  if (items.some((i) => i.current && i.status === "planned")) return null;
  if (interview.status !== "SCHEDULED")
    return {
      code: "not_scheduled",
      reason: `This interview is ${interview.status.toLowerCase().replace(/_/g, " ")}, so no reminders are planned.`,
    };
  if (interview.toldSequence === null)
    return {
      code: "no_invitation",
      reason:
        "Nobody has been sent an invitation to this interview, so no reminders are planned. A reminder only ever follows an invitation a person chose to send.",
    };
  if (!told)
    return {
      code: "changed_since_told",
      reason:
        "The interview changed after they were last told, and the change has not been sent to them, so no reminders are planned. Send an update to plan new ones.",
    };
  return {
    code: "none_planned",
    reason:
      items.length > 0
        ? "Everything planned for this interview has gone or been settled, so nothing more is waiting. Each reminder says what became of it."
        : "Nothing is waiting to be sent: reminders are switched off in your settings (or for this interview), or their times had passed when the invitation was sent.",
  };
}

/**
 * Settles what is waiting, as the API does when an interview changes or is cancelled: each
 * planned reminder becomes a skipped one in the log, with the reason. Only the candidate's
 * when the switch is the cause.
 */
export function settledLog(
  interview: Plannable,
  settings: ReminderSettings,
  now: string,
  reason: string,
  only: "all" | "candidate" = "all",
): ReminderLogEntry[] {
  return comingFor(interview, settings, now)
    .filter((coming) => only === "all" || coming.seat === null)
    .map((coming) => ({
      slot: coming.slot,
      seat: coming.seat,
      dueAt: new Date(coming.due).toISOString(),
      sentAt: null,
      status: "skipped" as const,
      reason,
      sequence: interview.sequence,
    }));
}
