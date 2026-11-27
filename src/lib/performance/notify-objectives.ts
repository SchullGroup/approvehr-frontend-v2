import { dayLabel, type ApiNotifyObjectives } from "@/lib/api/performance";
import { kindOf } from "@/lib/api/failure";

/**
 * "Ask everyone to set objectives" (owner, 24 Nov 2026): the words and the
 * rules around the one button. An invitation, never a warning.
 */

/** "Asked 61 people. 7 already have objectives." Tolerant of missing figures. */
export function askedLine(result: Partial<ApiNotifyObjectives>): string {
  const asked = typeof result.notified === "number" ? result.notified : null;
  const had = typeof result.alreadyHad === "number" ? result.alreadyHad : null;
  const noAccount =
    typeof result.noAccount === "number" ? result.noAccount : null;
  const parts: string[] = [];
  if (asked === 0) {
    /* Asking nobody has two causes, and only the time tells them apart: the
       server sends it when people were asked in the last day, and has none to
       send when there was nobody left to ask. */
    parts.push(
      result.askedAt
        ? "Everyone was asked in the last day."
        : "Nobody new was asked.",
    );
  } else if (asked !== null) {
    parts.push(`Asked ${String(asked)} ${asked === 1 ? "person" : "people"}.`);
  }
  if (had !== null && had > 0) {
    parts.push(
      `${String(had)} already ${had === 1 ? "has an objective" : "have objectives"}.`,
    );
  }
  if (noAccount !== null && noAccount > 0) {
    parts.push(
      `${String(noAccount)} ${noAccount === 1 ? "has" : "have"} no sign-in, so could not be asked in the app.`,
    );
  }
  return parts.join(" ") || "Asked.";
}

/** "Last asked 24 Nov 2026", or null when the API gave no time. */
export function lastAskedLine(
  result: Partial<ApiNotifyObjectives>,
): string | null {
  if (!result.askedAt) return null;
  const day = result.askedAt.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `Last asked ${dayLabel(day)}` : null;
}

/** An API that does not have it switched on: the button is hidden for good. */
export function notSwitchedOn(error: unknown): boolean {
  if (kindOf(error) === "missing") return true;
  const status = (error as { status?: number } | null)?.status;
  return status === 410;
}
