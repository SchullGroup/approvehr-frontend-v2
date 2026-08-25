"use client";

import type { DeliveryHint } from "@/lib/api/account";

/**
 * Hands the just-issued verification hint from the register screen to the
 * setup wizard, across the `router.replace("/dashboard")` → `SetupGate`
 * redirect that lands a new company on `/setup`.
 *
 * `sessionStorage`, not a store: this is a one-shot handoff between two
 * screens in one navigation, not state anything else reads or subscribes to.
 * `takePendingVerification` removes the key on read, so it is consumed
 * exactly once — a remount of the wizard later in the same tab (navigate
 * away and back) does not show the nudge a second time. That is deliberate:
 * a soft nudge shown once is doing its job; shown on every visit it is just
 * nagging.
 *
 * Both functions are silent on failure (private browsing, storage disabled)
 * — a missing nudge is a cosmetic loss, not a reason to break setup.
 */

const KEY = "approvehr.pending-email-verification";

export type PendingVerification = { email: string; hint: DeliveryHint };

export function stashPendingVerification(pending: PendingVerification): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(pending));
  } catch {
    /* ignored — see file header */
  }
}

export function takePendingVerification(): PendingVerification | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as PendingVerification;
  } catch {
    return null;
  }
}
