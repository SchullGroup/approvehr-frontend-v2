"use client";

import { useSyncExternalStore } from "react";

/**
 * One decision, every count that shows it.
 *
 * ## The defect this closes
 *
 * `useApprovalQueue` holds its own `useState`, so every call site is a separate
 * copy of the queue. `/approvals` mounts one and the sidebar badge in
 * `portal/shell.tsx` mounts another, and `decide` refreshed only the instance it
 * was called from. Approving from the inbox removed the row, fired the toast,
 * and left the badge reading **3** against a queue of 2 until the page was
 * reloaded — a number on permanent display, contradicting the screen beside it.
 *
 * A longer list of reloads at the call site is the thing that was already
 * wrong: the badge is mounted by the shell and the inbox has never heard of it.
 * So the mutation announces and every approval read listens, which is the shape
 * `store/attendance.ts` settled on for exactly the same bug one module along.
 *
 * ## Why this is its own module and `announceClock` is not
 *
 * Two stores publish here. `approvals-api.ts` announces when a queue item is
 * decided or reopened, and `leave-api.ts` announces when a leave request is
 * decided, reopened or withdrawn — because the API mirrors a leave decision
 * onto its `ApprovalRequest` row in the same transaction, so a leave write
 * moves the approvals count without going anywhere near the queue. A bus that
 * lived inside either store would make the other import it for one function.
 *
 * ## Deliberately not `lib/revalidate.ts`
 *
 * That bus fires when a window regains focus — a guess that something somewhere
 * may have changed, rate-limited because it is a guess. This is a write this
 * browser just made and had confirmed: neither a guess, nor frequent, and it
 * re-asks only the reads a decision can actually move.
 */
let generation = 0;
const listeners = new Set<() => void>();

/** Called after a decision, a reopen or a withdrawal the server accepted. */
export function announceApprovalChange(): void {
  generation += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = (): number => generation;

/* The server decides nothing, and `generation` starts at zero, so the first
   client render matches the markup it is hydrating. Getting this wrong is the
   hydration mismatch `store/persisted.ts` documents at length. */
const getServerSnapshot = (): number => 0;

/**
 * The number that goes up on every approval write.
 *
 * Put it in a fetch effect's dependency list, **never** in a key a hook
 * compares during render to decide `loading` — same rule as `useRevalidation`.
 * The effect refires, the answer replaces the old one when it lands, and a
 * badge never blanks itself on the way to the same number.
 */
export function useApprovalGeneration(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
