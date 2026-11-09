/**
 * Linking or clearing many tasks at once.
 *
 * One call per task, so each task is judged by the same rule and the same API as
 * when it is linked one at a time, and a refusal is about that task and nothing
 * else. This runs them a few at a time (the API is not asked for forty at once)
 * and gathers what came back: how many changed, and for each that did not, one
 * plain reason. It never stops at the first failure, and it never says it did
 * something it did not.
 *
 * The result is for a person to read in one line. A task that could not be
 * changed is a fact about that task (somebody else's, or gone), so it is listed
 * quietly beside the count and never styled as an alarm.
 */

import {
  BULK_LINK_LIMIT,
  type BulkLinkFailure,
  type BulkLinkResult,
} from "./completions";
import { count } from "./terms";

export { BULK_LINK_LIMIT };
export type { BulkLinkResult, BulkLinkFailure };

/** Where the tasks go: an objective (and a measure), or `null` to clear the link. */
export type BulkTarget = { goalId: string; keyResultId: string | null } | null;

export type BulkItem = { id: string; key: string };

/** What one task's change answered. */
export type BulkOutcome = { ok: true } | { ok: false; message: string };

const NOT_CHANGED = "It could not be changed.";

/** At most this many tasks are changed at one moment. */
const AT_ONCE = 3;

export async function runBulkLink<T extends BulkItem>(
  items: readonly T[],
  changeOne: (item: T) => Promise<BulkOutcome>,
): Promise<BulkLinkResult> {
  const queue = items.slice(0, BULK_LINK_LIMIT);
  const failed: BulkLinkFailure[] = [];
  let changed = 0;
  let next = 0;

  async function worker() {
    for (;;) {
      const item = queue[next];
      next += 1;
      if (!item) return;
      let outcome: BulkOutcome;
      try {
        outcome = await changeOne(item);
      } catch {
        outcome = { ok: false, message: NOT_CHANGED };
      }
      if (outcome.ok) changed += 1;
      else {
        failed.push({
          id: item.id,
          key: item.key,
          reason: outcome.message.trim() || NOT_CHANGED,
        });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(AT_ONCE, queue.length) }, worker),
  );
  /* In the order they were picked, not the order they happened to finish. */
  const order = new Map(queue.map((item, index) => [item.id, index]));
  failed.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { changed, failed };
}

const tasks = (n: number) => count(n, "task");

/**
 * The one line a bulk change ends in. Names what happened and how many, and the
 * count that did not change when some did not. `title` is the objective's name
 * when linking, and `null` when clearing.
 */
export function bulkLinkLine(
  result: BulkLinkResult,
  total: number,
  title: string | null,
): string {
  const { changed, failed } = result;
  if (changed === 0) {
    return total === 1
      ? "That task could not be changed."
      : `None of the ${count(total, "task")} could be changed.`;
  }
  const done = title
    ? `Linked ${tasks(changed)} to ${title}`
    : `Cleared the link on ${tasks(changed)}`;
  if (failed.length === 0) return `${done}.`;
  return `${done}. ${tasks(failed.length)} could not be changed.`;
}
