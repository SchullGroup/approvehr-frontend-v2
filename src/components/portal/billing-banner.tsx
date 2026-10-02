"use client";

import { Clock } from "lucide-react";
import Link from "next/link";
import { bannerFor, daysLabel, useBilling } from "@/lib/billing";
import { usePermissions } from "@/lib/permissions";

/**
 * "Your trial ends in 2 days" / "Your subscription has ended" — a sticky
 * strip above `VerificationBanner`, for the countdown window `bannerFor`
 * defines: the last three days of a trial, and the whole of a grace period.
 *
 * ## Why no dismiss button
 *
 * `VerificationBanner`'s dismiss is a `useState` that only ever hides a nag
 * for the rest of the session — appropriate there because confirming an
 * email has no deadline. This banner is counting down to one (access gets
 * paused), so a dismiss would let somebody click away the one warning they
 * had before that happens. It returns `null` on its own once the condition
 * it is reporting no longer holds (the trial converts, the grace period
 * ends), which is the only way this is allowed to disappear.
 *
 * ## Why it renders while `enforced` is false
 *
 * `constraints.md` is explicit that the paywall switch only ever gates
 * *locking* (see `isLockedOut`, `BillingGate`) — "only the banner can show"
 * while it's off. `bannerFor` already has no opinion on `enforced`, so this
 * component doesn't need one either: it renders whatever `bannerFor` says,
 * full stop.
 *
 * ## Why the Subscribe link is conditional and nothing replaces it
 *
 * Unlike `Paywall`, which fills the whole screen and so needs an
 * "ask your administrator" line for whoever can't act, this is a thin strip
 * that already said the one thing that matters (the deadline) before the
 * permission check. Nothing stands in for the link; it's simply absent for
 * anybody without `MANAGE_SETTINGS`.
 */
export function BillingBanner() {
  const billing = useBilling();
  const banner = bannerFor(billing);
  const { can } = usePermissions();

  if (!banner) return null;

  const message =
    banner.kind === "trial"
      ? `Your trial ends ${daysLabel(banner.days)}.`
      : `Your subscription has ended. You have ${
          banner.days === 0
            ? "until today"
            : `${banner.days} day${banner.days === 1 ? "" : "s"}`
        } before access is paused.`;

  return (
    <div className="no-print sticky top-14 z-20 border-b border-warning-line bg-warning-soft px-4 py-2.5 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex min-w-0 flex-1 items-center gap-2 text-body-sm text-warning-text">
          <Clock aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0">{message}</span>
        </span>

        {can("MANAGE_SETTINGS") && (
          <Link
            href="/billing/pay"
            className="shrink-0 text-body-sm font-medium text-warning-text underline underline-offset-2 hover:text-ink"
          >
            Subscribe / Pay
          </Link>
        )}
      </div>
    </div>
  );
}
