import type { BulkOutcome } from "./model";

/**
 * The words over a bulk results panel.
 *
 * Plain, and exact about who was not done: a count that says "42 done" and hides
 * the three that were refused is the shape of claim this product refuses to make.
 * No React, no state.
 */

const n = (count: number) => count.toLocaleString("en-NG");
const people = (count: number) => (count === 1 ? "person" : "people");

export const NO_OUTCOME: BulkOutcome = {
  requested: 0,
  done: 0,
  skipped: 0,
  refused: [],
  emailed: null,
};

/** `what` is the past-tense action: "Moved to Interview", "Rejected", "Tagged". */
export function summarise(outcome: BulkOutcome, what: string): string {
  const { requested, done, skipped, refused } = outcome;
  if (refused.length === 0 && skipped === 0) {
    return `${what}: ${n(done)} ${people(done)}.`;
  }
  const parts = [
    `${what}: ${n(done)} of ${n(requested)} ${people(requested)}.`,
  ];
  if (skipped > 0) {
    parts.push(
      `${n(skipped)} ${skipped === 1 ? "was" : "were"} left as they were, with nothing to do.`,
    );
  }
  if (refused.length > 0) {
    parts.push(`${n(refused.length)} could not be done.`);
  }
  return parts.join(" ");
}

/** Whether the panel should open by itself: something was not done. */
export const needsAttention = (outcome: BulkOutcome): boolean =>
  outcome.refused.length > 0;
