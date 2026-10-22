"use client";

/**
 * A read that failed, rendered as a sentence somebody can act on.
 *
 * The implementation moved to `components/ui/load-state.tsx`, beside the rule it
 * is half of: while loading a screen shows skeletons and no counts, and after a
 * failure it shows this and neither the empty state nor any count. This file is
 * the old address, kept so the hundred-odd screens that import `LoadFailure`
 * from here — and `failureMessage`, for the few places that need the sentence as
 * a string — did not have to move with it. New code should import from
 * `@/components/ui`, and a screen with a list on it should reach for
 * `LoadState` rather than for this directly.
 */
export {
  LoadFailure,
  failureMessage,
  type MissingMeans,
} from "@/components/ui/load-state";
