import type { ApiGoal } from "@/lib/api/performance";
import { formatDateShort } from "@/lib/time";

/**
 * What an objective was told when it was declined, newest first.
 *
 * The API keeps every decline with who made it and when, and clears
 * `approvalNote` when the objective is sent again. The screens showed only
 * `approvalNote`, so a second decline hid the first and nothing said who had
 * written either (F12), and an approver who was sent an objective again could
 * not see what it had been told before.
 *
 * Where the server sends no list, the one note is all there is: it has no name
 * or date, and it is shown without them rather than with a made-up author.
 */
export type DeclineEntry = {
  reason: string;
  byName: string | null;
  at: string | null;
};

export function declineEntries(
  goal: Pick<ApiGoal, "declines" | "approvalNote" | "approval">,
): DeclineEntry[] {
  const kept = (goal.declines ?? [])
    .filter((entry) => entry.reason.trim() !== "")
    .map((entry) => ({
      reason: entry.reason,
      byName: entry.byName.trim() === "" ? null : entry.byName,
      at: entry.at === "" ? null : entry.at,
    }))
    .reverse();
  if (kept.length > 0) return kept;
  return goal.approval === "NEEDS_REVISION" && goal.approvalNote
    ? [{ reason: goal.approvalNote, byName: null, at: null }]
    : [];
}

/** "Fatima Bello, 22 Nov 2026". Whatever is known, and nothing where it is not. */
export function declineByline(
  entry: Pick<DeclineEntry, "byName" | "at">,
  timeZone: string,
): string | null {
  const when = entry.at === null ? null : formatDateShort(entry.at, timeZone);
  if (entry.byName && when) return `${entry.byName}, ${when}`;
  return entry.byName ?? when;
}

/** "1 earlier decline" or "3 earlier declines". */
export function earlierDeclines(count: number): string {
  return count === 1
    ? "1 earlier decline"
    : `${String(count)} earlier declines`;
}
