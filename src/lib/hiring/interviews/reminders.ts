import type { InterviewNotice } from "./model";

/**
 * Reminders about an interview: what the company has chosen, what is planned for one
 * interview, and what became of each.
 *
 * ## A reminder is never the first thing anybody is told
 *
 * The API plans reminders only for a person whose invitation (or update) somebody chose
 * to send, and sends one only if that invitation went and the interview is still on as it
 * was. An interview booked with "Don't send", or whose change nobody was told of, has
 * none, and the API says which of those it is (`paused`). A screen shows its sentence.
 *
 * ## Nothing here is sent
 *
 * This is the plan and the record. The API's worker sends; a reminder is "Sent" only
 * where the API says so, "Planned" while it waits for its time, "Skipped" with the reason
 * where it could not go, and "Due" where its time has come and something is holding it.
 *
 * No React, no state.
 */

/* ---------------------------------------------------------------- the six slots */

/**
 * The six things that can be sent for one interview: two reminders to the candidate, two
 * to each person on the panel, and up to two nudges to a panelist whose scorecard is not
 * in. The API's names.
 */
export type ReminderSlot =
  "cand-early" | "cand-late" | "pan-early" | "pan-late" | "nudge-1" | "nudge-2";

export const SLOT_ORDER: readonly ReminderSlot[] = [
  "cand-early",
  "cand-late",
  "pan-early",
  "pan-late",
  "nudge-1",
  "nudge-2",
];

export const isNudge = (slot: ReminderSlot): boolean =>
  slot === "nudge-1" || slot === "nudge-2";

/* ------------------------------------------------------------ what is planned */

export type ReminderStatus =
  "planned" | "due" | "sending" | "sent" | "skipped" | "failed";

/** One reminder to one person, planned or done. */
export type PlannedReminder = {
  id: string;
  slot: ReminderSlot;
  /** The API's own name for it: "Reminder to the candidate (earlier)". */
  label: string;
  audience: "CANDIDATE" | "PANELIST";
  /** Who it is for. */
  recipient: string;
  /** When it is due, or was. ISO instant. */
  dueAt: string;
  sentAt: string | null;
  status: ReminderStatus;
  /** Why it was skipped, or is being held, in words. */
  reason: string | null;
  /** Whether it is for the interview as it now stands. */
  current: boolean;
};

/** Why nothing is waiting, when nothing is. The API writes the sentence. */
export type RemindersPaused = {
  code:
    "no_invitation" | "changed_since_told" | "not_scheduled" | "none_planned";
  reason: string;
};

export type InterviewReminders = {
  items: PlannedReminder[];
  paused: RemindersPaused | null;
};

/* --------------------------------------------------------------------- words */

const STATUS_LABEL: Record<ReminderStatus, string> = {
  planned: "Planned",
  due: "Waiting to go",
  sending: "Sending",
  sent: "Sent",
  skipped: "Skipped",
  failed: "Failed",
};

const STATUS_TONE: Record<
  ReminderStatus,
  "info" | "neutral" | "success" | "warning" | "danger"
> = {
  planned: "neutral",
  due: "info",
  sending: "info",
  sent: "success",
  skipped: "warning",
  failed: "danger",
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

export const hoursWords = (hours: number): string =>
  hours === 1
    ? "1 hour"
    : hours % 24 === 0 && hours >= 48
      ? `${String(hours / 24)} days`
      : `${String(hours)} hours`;

/** "1 hour", "24 hours", "3 days", "45 minutes". */
export const durationWords = (minutes: number): string => {
  if (minutes % 1_440 === 0 && minutes >= 2_880)
    return `${String(minutes / 1_440)} days`;
  if (minutes % 60 === 0) return hoursWords(minutes / 60);
  return minutes === 1 ? "1 minute" : `${String(minutes)} minutes`;
};

/* ------------------------------------------------------------- the list, grouped */

/**
 * Reminders that read the same: one slot, one time, one outcome, one reason. A panel's
 * reminder is one row per person in the API, and a screen lists it once with the names.
 */
export type ReminderGroup = {
  key: string;
  slot: ReminderSlot;
  label: string;
  audience: "CANDIDATE" | "PANELIST";
  recipients: string[];
  dueAt: string;
  sentAt: string | null;
  status: ReminderStatus;
  reason: string | null;
  current: boolean;
};

export function groupReminders(
  items: readonly PlannedReminder[],
): ReminderGroup[] {
  const groups = new Map<string, ReminderGroup>();
  for (const item of items) {
    const key = [
      item.slot,
      item.dueAt,
      item.status,
      item.reason ?? "",
      item.current ? "now" : "earlier",
    ].join("|");
    const found = groups.get(key);
    if (found) {
      if (!found.recipients.includes(item.recipient))
        found.recipients.push(item.recipient);
    } else {
      groups.set(key, {
        key,
        slot: item.slot,
        label: item.label,
        audience: item.audience,
        recipients: [item.recipient],
        dueAt: item.dueAt,
        sentAt: item.sentAt,
        status: item.status,
        reason: item.reason,
        current: item.current,
      });
    }
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.dueAt.localeCompare(b.dueAt) ||
      SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot),
  );
}

/** "The candidate", "Chidi Nwosu and Kemi Outside", "A, B and 2 others". */
export function recipientsWords(group: ReminderGroup): string {
  if (group.audience === "CANDIDATE") return "The candidate";
  const names = group.recipients.filter((name) => name !== "");
  if (names.length === 0) return "The panel";
  if (names.length === 1) return names[0] as string;
  if (names.length === 2)
    return `${names[0] as string} and ${names[1] as string}`;
  const more = names.length - 2;
  return `${names[0] as string}, ${names[1] as string} and ${String(more)} ${more === 1 ? "other" : "others"}`;
}

/**
 * When, in a few words, for the group's state. `when` writes an instant on the company's
 * clock and `now` is the time now in milliseconds: a reminder that was settled before its
 * time ever came (a change or a cancellation took it off) is "planned for" that time, not
 * "due" then, because it never was.
 */
export function whenWords(
  group: Pick<ReminderGroup, "status" | "dueAt" | "sentAt">,
  when: (iso: string) => string,
  now: number,
): string {
  switch (group.status) {
    case "planned":
      return `Goes ${when(group.dueAt)}`;
    case "due":
      return `Was due ${when(group.dueAt)}`;
    case "sending":
      return "Sending now";
    case "sent":
      return `Sent ${when(group.sentAt ?? group.dueAt)}`;
    case "skipped":
    case "failed":
      return Date.parse(group.dueAt) <= now
        ? `Was due ${when(group.dueAt)}`
        : `Was planned for ${when(group.dueAt)}`;
  }
}

/** Whether something is still to go. */
export const waiting = (item: Pick<PlannedReminder, "status" | "current">) =>
  item.current &&
  (item.status === "planned" ||
    item.status === "due" ||
    item.status === "sending");

/**
 * The line that says why there are no reminders, when there are none waiting. The API's
 * own sentence, except for the one the brief words exactly. `null` while something waits:
 * a completed interview can still have nudges waiting and the API still calls it "not
 * scheduled", and that sentence would contradict the rows below it.
 */
export function pausedLine(reminders: InterviewReminders): string | null {
  if (reminders.items.some(waiting)) return null;
  const paused = reminders.paused;
  if (!paused) return null;
  return paused.code === "no_invitation"
    ? "No reminders: the invitation wasn't sent."
    : paused.reason;
}

/**
 * Said under reminders that are planned while the invitation they follow is still in the
 * queue: they go only if it does.
 */
export function followsQueuedInvitation(
  notices: readonly InterviewNotice[] | null,
): boolean {
  return (notices ?? []).some(
    (n) =>
      (n.kind === "INVITE" || n.kind === "UPDATE") &&
      (n.status === "PENDING" || n.status === "SENDING"),
  );
}

/* ---------------------------------------------------- what a change did to the plan */

export type ReplanCounts = {
  /** How many are planned now for the interview as it stands. */
  planned: number;
  /** How many that were planned before are not any more. `null` when the plan before is not known. */
  removed: number | null;
};

/**
 * What a reschedule or a cancellation did to the plan, from the plan before and the plan
 * the API now reports. `null` when the plan now is not known: nothing is said rather than
 * a guess.
 */
export function replanCounts(
  before: InterviewReminders | null,
  after: InterviewReminders | null,
): ReplanCounts | null {
  if (after === null) return null;
  const stillWaiting = new Set(
    after.items.filter((i) => i.status === "planned").map((i) => i.id),
  );
  return {
    planned: after.items.filter((i) => i.status === "planned" && i.current)
      .length,
    removed:
      before === null
        ? null
        : before.items.filter(
            (i) => i.status === "planned" && !stillWaiting.has(i.id),
          ).length,
  };
}

const reminderCount = (n: number): string =>
  `${String(n)} ${n === 1 ? "reminder" : "reminders"}`;

/**
 * After a change, what happened to the reminders, in a sentence. Said only from what the API
 * reported after the change. When none is planned the API's own reason says why (usually
 * that nobody was told: the invitation was not sent, or the change was not).
 */
export function replanSentence(
  what: "booked" | "invited" | "rescheduled" | "cancelled",
  counts: ReplanCounts | null,
  paused: RemindersPaused | null,
): string | null {
  if (counts === null) return null;
  if (what === "cancelled") {
    if (counts.removed === null) return null;
    return counts.removed > 0
      ? `${String(counts.removed)} planned ${counts.removed === 1 ? "reminder was" : "reminders were"} taken off.`
      : "No reminder was planned, so none was taken off.";
  }
  const none =
    paused?.code === "no_invitation"
      ? "No reminders: the invitation wasn't sent."
      : (paused?.reason ?? null);
  if (what === "booked" || what === "invited")
    return counts.planned > 0
      ? `${reminderCount(counts.planned)} ${counts.planned === 1 ? "is" : "are"} planned. A reminder goes only once its invitation has.`
      : none;
  const removed =
    counts.removed !== null && counts.removed > 0
      ? ` ${reminderCount(counts.removed)} planned for the old time ${counts.removed === 1 ? "was" : "were"} taken off.`
      : "";
  if (counts.planned > 0)
    return `${reminderCount(counts.planned)} ${counts.planned === 1 ? "is" : "are"} planned for the new time.${removed}`;
  return `${none ?? "No reminder is planned for the new time."}${removed}`;
}

/* --------------------------------------------------------------- the settings */

export type SlotSetting = { enabled: boolean; minutesBefore: number };

/** What the company has chosen. */
export type ReminderSettings = {
  candidate: { early: SlotSetting; late: SlotSetting };
  panelist: { early: SlotSetting; late: SlotSetting };
  scorecardNudge: {
    enabled: boolean;
    firstAfterHours: number;
    /** `null` is no second nudge. */
    secondAfterHours: number | null;
  };
};

export type Range = { min: number; max: number };

/** The most and least each may be, as the API gives them. */
export type ReminderBounds = {
  earlyMinutes: Range;
  lateMinutes: Range;
  nudgeFirstHours: Range;
  nudgeSecondHours: Range;
};

/** What has gone against the day's limit on emails to candidates and panelists. */
export type SendUsage = {
  sentLast24Hours: number;
  dailyLimit: number;
  waiting: number;
  dueNow: number;
  remindersPlanned: number;
};

/** The settings page's whole subject. */
export type ReminderSettingsView = {
  values: ReminderSettings;
  /** What a company gets until it chooses. */
  defaults: ReminderSettings;
  bounds: ReminderBounds;
  /** Whether mail to candidates would leave right now, and if not, why. `null`: not said. */
  willSend: boolean | null;
  blockedBy: string[];
  usage: SendUsage | null;
};

export type Unit = "minutes" | "hours" | "days";

const UNIT_MINUTES: Record<Unit, number> = {
  minutes: 1,
  hours: 60,
  days: 1_440,
};

export const UNITS: readonly Unit[] = ["minutes", "hours", "days"];

/** "How long before" as a box and a unit: days only for whole days of two or more. */
export function splitMinutes(minutes: number): { amount: string; unit: Unit } {
  if (minutes % 1_440 === 0 && minutes >= 2_880)
    return { amount: String(minutes / 1_440), unit: "days" };
  if (minutes % 60 === 0)
    return { amount: String(minutes / 60), unit: "hours" };
  return { amount: String(minutes), unit: "minutes" };
}

/** What is typed in the boxes. Nothing here is sent until it has been checked. */
export type BeforeDraft = { enabled: boolean; amount: string; unit: Unit };

export type SettingsDraft = {
  candidateEarly: BeforeDraft;
  candidateLate: BeforeDraft;
  panelistEarly: BeforeDraft;
  panelistLate: BeforeDraft;
  nudge: {
    enabled: boolean;
    first: string;
    secondOn: boolean;
    second: string;
  };
};

const beforeDraft = (setting: SlotSetting): BeforeDraft => ({
  enabled: setting.enabled,
  ...splitMinutes(setting.minutesBefore),
});

export const draftOf = (settings: ReminderSettings): SettingsDraft => ({
  candidateEarly: beforeDraft(settings.candidate.early),
  candidateLate: beforeDraft(settings.candidate.late),
  panelistEarly: beforeDraft(settings.panelist.early),
  panelistLate: beforeDraft(settings.panelist.late),
  nudge: {
    enabled: settings.scorecardNudge.enabled,
    first: String(settings.scorecardNudge.firstAfterHours),
    secondOn: settings.scorecardNudge.secondAfterHours !== null,
    second:
      settings.scorecardNudge.secondAfterHours === null
        ? ""
        : String(settings.scorecardNudge.secondAfterHours),
  },
});

export const sameDraft = (a: SettingsDraft, b: SettingsDraft): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** The boxes whose problems are shown under them. */
export type SettingsField =
  | "candidate.early"
  | "candidate.late"
  | "panelist.early"
  | "panelist.late"
  | "nudge.first"
  | "nudge.second";

export type SettingsProblem = { field: SettingsField; message: string };

/** Whole minutes from a box and a unit; `null` when it is not a number of whole minutes. */
function minutesOf(
  draft: BeforeDraft,
): { minutes: number } | { problem: string } {
  const text = draft.amount.trim();
  if (text === "") return { problem: "Enter how long before." };
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount <= 0)
    return { problem: "Enter a number greater than zero." };
  const total = amount * UNIT_MINUTES[draft.unit];
  if (!Number.isInteger(total))
    return { problem: "Use a whole number of minutes." };
  return { minutes: total };
}

/** A whole number of hours from a box, or why not. */
function hoursOf(text: string): { hours: number } | { problem: string } {
  const trimmed = text.trim();
  if (trimmed === "") return { problem: "Enter a number of hours." };
  const hours = Number(trimmed);
  if (!Number.isFinite(hours) || !Number.isInteger(hours))
    return { problem: "Hours are a whole number." };
  return { hours };
}

/**
 * What is typed, as settings, or what is wrong with it, each problem against its own box.
 * The limits are the API's, and the sentences are the API's meaning in the screen's words,
 * so a refusal from the server is only ever a race, not a surprise.
 */
export function settingsFromDraft(
  draft: SettingsDraft,
  bounds: ReminderBounds,
): { values: ReminderSettings | null; problems: SettingsProblem[] } {
  const problems: SettingsProblem[] = [];

  const before = (
    field: SettingsField,
    box: BeforeDraft,
    range: Range,
    which: "earlier" | "later",
  ): SlotSetting | null => {
    const got = minutesOf(box);
    if ("problem" in got) {
      problems.push({ field, message: got.problem });
      return null;
    }
    if (got.minutes < range.min) {
      problems.push({
        field,
        message: `The ${which} reminder goes at least ${durationWords(range.min)} before the interview.`,
      });
      return null;
    }
    if (got.minutes > range.max) {
      problems.push({
        field,
        message: `The ${which} reminder goes at most ${durationWords(range.max)} before the interview.`,
      });
      return null;
    }
    return { enabled: box.enabled, minutesBefore: got.minutes };
  };

  const candidateEarly = before(
    "candidate.early",
    draft.candidateEarly,
    bounds.earlyMinutes,
    "earlier",
  );
  const candidateLate = before(
    "candidate.late",
    draft.candidateLate,
    bounds.lateMinutes,
    "later",
  );
  const panelistEarly = before(
    "panelist.early",
    draft.panelistEarly,
    bounds.earlyMinutes,
    "earlier",
  );
  const panelistLate = before(
    "panelist.late",
    draft.panelistLate,
    bounds.lateMinutes,
    "later",
  );

  /* The pair, as it will stand: the earlier has to be longer before than the later. */
  const pair = (
    field: SettingsField,
    early: SlotSetting | null,
    late: SlotSetting | null,
  ) => {
    if (early && late && early.minutesBefore <= late.minutesBefore)
      problems.push({
        field,
        message:
          "The earlier reminder has to go longer before the interview than the later one.",
      });
  };
  pair("candidate.early", candidateEarly, candidateLate);
  pair("panelist.early", panelistEarly, panelistLate);

  let first: number | null = null;
  const gotFirst = hoursOf(draft.nudge.first);
  if ("problem" in gotFirst)
    problems.push({ field: "nudge.first", message: gotFirst.problem });
  else if (gotFirst.hours < bounds.nudgeFirstHours.min)
    problems.push({
      field: "nudge.first",
      message: `The first nudge goes at least ${hoursWords(bounds.nudgeFirstHours.min)} after the interview ends.`,
    });
  else if (gotFirst.hours > bounds.nudgeFirstHours.max)
    problems.push({
      field: "nudge.first",
      message: `The first nudge goes at most ${hoursWords(bounds.nudgeFirstHours.max)} after the interview ends.`,
    });
  else first = gotFirst.hours;

  let second: number | null | undefined;
  if (!draft.nudge.secondOn) second = null;
  else {
    const got = hoursOf(draft.nudge.second);
    if ("problem" in got)
      problems.push({ field: "nudge.second", message: got.problem });
    else if (got.hours < bounds.nudgeSecondHours.min)
      problems.push({
        field: "nudge.second",
        message: `The second nudge goes at least ${hoursWords(bounds.nudgeSecondHours.min)} after the interview ends.`,
      });
    else if (got.hours > bounds.nudgeSecondHours.max)
      problems.push({
        field: "nudge.second",
        message: `The second nudge goes at most ${hoursWords(bounds.nudgeSecondHours.max)} after the interview ends. Switch it off for no second nudge.`,
      });
    else if (first !== null && got.hours <= first)
      problems.push({
        field: "nudge.second",
        message: "The second nudge has to come after the first.",
      });
    else second = got.hours;
  }

  if (
    problems.length > 0 ||
    !candidateEarly ||
    !candidateLate ||
    !panelistEarly ||
    !panelistLate ||
    first === null ||
    second === undefined
  )
    return { values: null, problems };

  return {
    values: {
      candidate: { early: candidateEarly, late: candidateLate },
      panelist: { early: panelistEarly, late: panelistLate },
      scorecardNudge: {
        enabled: draft.nudge.enabled,
        firstAfterHours: first,
        secondAfterHours: second,
      },
    },
    problems,
  };
}

/** The API's dotted path for a refused field, as the box it belongs to. */
export function fieldOfPath(path: string): SettingsField | null {
  const table: [string, SettingsField][] = [
    ["candidate.early", "candidate.early"],
    ["candidate.late", "candidate.late"],
    ["panelist.early", "panelist.early"],
    ["panelist.late", "panelist.late"],
    ["firstAfterHours", "nudge.first"],
    ["secondAfterHours", "nudge.second"],
  ];
  return table.find(([part]) => path.includes(part))?.[1] ?? null;
}
