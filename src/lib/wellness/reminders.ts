import type {
  ApiReminderBreak,
  ApiReminderPolicy,
  ReminderPolicyBody,
} from "@/lib/api/wellness";

/**
 * Break reminders, as words and as a form.
 *
 * The server owns every rule that looks across the set (names unique whatever
 * their case, no two breaks overlapping, none running past midnight) and says
 * so in its own sentence, which the dialog shows. What is checked here is only
 * what can be said before sending: that a field is filled in and in range.
 */

export const INTERVAL_MIN = 5;
export const INTERVAL_MAX = 240;
export const INTERVALS_MAX_COUNT = 6;
export const BREAKS_MAX_COUNT = 12;
export const BREAK_MINUTES_MAX = 240;
export const BREAK_NAME_MAX = 40;

/** `15 and 30 minutes`, `15, 30 and 60 minutes`. */
export function intervalsText(intervals: readonly number[]): string {
  const sorted = [...intervals].sort((a, b) => a - b);
  if (sorted.length === 0) return "No interval";
  const last = sorted[sorted.length - 1];
  if (sorted.length === 1) return `${String(last)} minutes`;
  return `${sorted.slice(0, -1).join(", ")} and ${String(last)} minutes`;
}

/** `Lunch, 13:00, 60 min`. */
export function breakText(entry: ApiReminderBreak): string {
  return `${entry.name}, ${entry.startsAt}, ${String(entry.durationMinutes)} min`;
}

export const SOURCE_LABEL: Record<ApiReminderPolicy["source"], string> = {
  PERSONAL: "Your own settings",
  ORGANISATION: "The company default",
  DEFAULT: "The built-in default",
};

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

/** `15, 30` to `[15, 30]`. Commas or spaces between them. */
export function parseIntervals(text: string): Parsed<number[]> {
  const parts = text
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter((part) => part !== "");
  if (parts.length === 0) {
    return { ok: false, message: "Enter at least one number of minutes." };
  }
  if (parts.some((part) => !/^\d+$/.test(part))) {
    return { ok: false, message: "Use whole numbers, like 15, 30." };
  }
  const values = parts.map(Number);
  if (values.length > INTERVALS_MAX_COUNT) {
    return {
      ok: false,
      message: `Use at most ${String(INTERVALS_MAX_COUNT)} intervals.`,
    };
  }
  if (values.some((n) => n < INTERVAL_MIN || n > INTERVAL_MAX)) {
    return {
      ok: false,
      message: `Each one is between ${String(INTERVAL_MIN)} and ${String(INTERVAL_MAX)} minutes.`,
    };
  }
  if (new Set(values).size !== values.length) {
    return { ok: false, message: "Use each interval once." };
  }
  return { ok: true, value: values };
}

/** A break as the form holds it: every field text, so a half-typed one is allowed. */
export type BreakDraft = {
  name: string;
  startsAt: string;
  minutes: string;
};

export const toDrafts = (breaks: readonly ApiReminderBreak[]): BreakDraft[] =>
  breaks.map((entry) => ({
    name: entry.name,
    startsAt: entry.startsAt,
    minutes: String(entry.durationMinutes),
  }));

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The first thing wrong with a break, in a sentence, or null. */
export function breakProblem(draft: BreakDraft): string | null {
  if (draft.name.trim() === "") return "Give the break a name.";
  if (draft.name.trim().length > BREAK_NAME_MAX) {
    return `A name is at most ${String(BREAK_NAME_MAX)} characters.`;
  }
  if (!HH_MM.test(draft.startsAt)) return "Choose a start time.";
  if (!/^\d+$/.test(draft.minutes.trim()))
    return "Enter the minutes as a whole number.";
  const minutes = Number(draft.minutes);
  if (minutes < 1 || minutes > BREAK_MINUTES_MAX) {
    return `A break is 1 to ${String(BREAK_MINUTES_MAX)} minutes.`;
  }
  return null;
}

/** The whole policy, ready to send, or the first reason it is not. */
export function toPolicyBody(input: {
  enabled: boolean;
  intervalsText: string;
  breaks: readonly BreakDraft[];
}): Parsed<ReminderPolicyBody> {
  const intervals = parseIntervals(input.intervalsText);
  if (!intervals.ok) return intervals;
  for (const draft of input.breaks) {
    const problem = breakProblem(draft);
    if (problem) return { ok: false, message: problem };
  }
  return {
    ok: true,
    value: {
      enabled: input.enabled,
      intervals: intervals.value,
      breaks: input.breaks.map((draft) => ({
        name: draft.name.trim(),
        startsAt: draft.startsAt,
        durationMinutes: Number(draft.minutes),
      })),
    },
  };
}
