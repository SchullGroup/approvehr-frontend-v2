import {
  invitationSent,
  type InterviewReminders,
  type PlannedReminder,
  type ReminderKind,
  type ReminderRule,
  type ReminderSettings,
  type ReminderStatus,
} from "./reminders";
import type { InterviewNotice } from "./model";

/**
 * The practice board's reminders, as plain functions: what is planned for an interview, and
 * the company's defaults.
 *
 * ## Nothing is ever sent from here
 *
 * A practice board has no mail and no clock that runs, so it plans: it works out which
 * reminders an interview would have, and when, from the company's defaults and from
 * whether the invitation was actually sent. What the log holds of reminders that "went" is
 * seed data, written as the API would have written it. A reminder asked for here is never
 * recorded as sent.
 *
 * Pure on purpose: nothing here reads storage or the clock.
 */

const HOUR_MS = 3_600_000;

/** What the practice board accepts, the way the API says what it does. */
export const DEMO_BOUNDS = {
  before: { min: 1, max: 168 },
  after: { min: 1, max: 168 },
  nudges: { min: 1, max: 5 },
} as const;

export function defaultReminderSettings(): ReminderSettings {
  return {
    rules: [
      {
        kind: "CANDIDATE_EARLY",
        enabled: true,
        hours: 24,
        bounds: { ...DEMO_BOUNDS.before },
      },
      {
        kind: "CANDIDATE_FINAL",
        enabled: true,
        hours: 1,
        bounds: { ...DEMO_BOUNDS.before },
      },
      {
        kind: "PANELIST",
        enabled: true,
        hours: 24,
        bounds: { ...DEMO_BOUNDS.before },
      },
      {
        kind: "SCORECARD_NUDGE",
        enabled: true,
        hours: 24,
        bounds: { ...DEMO_BOUNDS.after },
      },
    ],
    nudges: { max: 2, bounds: { ...DEMO_BOUNDS.nudges } },
  };
}

/* ------------------------------------------------------------------ settings */

/* -------------------------------------------------------------------- the plan */

export type ReminderLogEntry = {
  kind: ReminderKind;
  audience: "CANDIDATE" | "PANELIST";
  at: string;
  status: Extract<ReminderStatus, "SENT" | "SKIPPED" | "FAILED">;
  note: string | null;
};

const rule = (
  settings: ReminderSettings,
  kind: ReminderKind,
): ReminderRule | undefined => settings.rules.find((r) => r.kind === kind);

const AUDIENCE: Record<ReminderKind, PlannedReminder["audience"]> = {
  CANDIDATE_EARLY: "CANDIDATE",
  CANDIDATE_FINAL: "CANDIDATE",
  PANELIST: "PANELIST",
  SCORECARD_NUDGE: "PANELIST",
};

type Plannable = {
  id: string;
  scheduledFor: string;
  durationMins: number;
  status: string;
  seats: readonly string[];
  notices: readonly InterviewNotice[];
  remindersOff: boolean;
  reminderLog: readonly ReminderLogEntry[];
};

/**
 * What an interview's reminders are right now: what went (the log), then what is still to
 * come, from the defaults.
 *
 * Nothing is planned unless the candidate's invitation was **sent**, the interview is still
 * on and nobody turned them off for it; a reminder whose time has passed is not planned
 * (it was missed, and sending it late would be worse than not). A scorecard nudge is planned
 * only while a scorecard is still owed.
 */
export function remindersOf(
  interview: Plannable,
  settings: ReminderSettings,
  now: string,
  scorecardOwed: boolean,
): InterviewReminders {
  const items: PlannedReminder[] = interview.reminderLog.map(
    (entry, index) => ({
      id: `${interview.id}-log-${String(index)}`,
      kind: entry.kind,
      audience: entry.audience,
      at: entry.at,
      status: entry.status,
      note: entry.note,
      ...(entry.kind === "SCORECARD_NUDGE"
        ? {
            nth: {
              n: interview.reminderLog
                .slice(0, index + 1)
                .filter((e) => e.kind === "SCORECARD_NUDGE").length,
              of: settings.nudges.max,
            },
          }
        : {}),
    }),
  );

  /* Only an interview that is on or that took place can have anything still to come, and
     only when the invitation was sent and nobody turned them off. */
  const planning =
    (interview.status === "SCHEDULED" || interview.status === "COMPLETED") &&
    !interview.remindersOff &&
    invitationSent(interview.notices);
  if (!planning) return { off: interview.remindersOff, items };

  const start = Date.parse(interview.scheduledFor);
  const end = start + interview.durationMins * 60_000;
  const clock = Date.parse(now);

  if (interview.status === "SCHEDULED") {
    for (const kind of [
      "CANDIDATE_EARLY",
      "CANDIDATE_FINAL",
      "PANELIST",
    ] as const) {
      const r = rule(settings, kind);
      if (!r || !r.enabled) continue;
      if (kind === "PANELIST" && interview.seats.length === 0) continue;
      const at = start - r.hours * HOUR_MS;
      if (at <= clock) continue;
      if (items.some((i) => i.kind === kind)) continue;
      items.push({
        id: `${interview.id}-${kind}`,
        kind,
        audience: AUDIENCE[kind],
        at: new Date(at).toISOString(),
        status: "PLANNED",
        note: null,
      });
    }
  }

  const nudge = rule(settings, "SCORECARD_NUDGE");
  if (nudge && nudge.enabled && scorecardOwed) {
    const sent = items.filter((i) => i.kind === "SCORECARD_NUDGE").length;
    for (let n = sent + 1; n <= settings.nudges.max; n += 1) {
      const at = end + n * nudge.hours * HOUR_MS;
      if (at <= clock) continue;
      items.push({
        id: `${interview.id}-nudge-${String(n)}`,
        kind: "SCORECARD_NUDGE",
        audience: "PANELIST",
        at: new Date(at).toISOString(),
        status: "PLANNED",
        note: null,
        nth: { n, of: settings.nudges.max },
      });
    }
  }
  return {
    off: interview.remindersOff,
    items: items.sort((a, b) => a.at.localeCompare(b.at)),
  };
}

/** How many reminders are still waiting for their time. */
export const plannedCount = (reminders: InterviewReminders): number =>
  reminders.items.filter((i) => i.status === "PLANNED").length;
