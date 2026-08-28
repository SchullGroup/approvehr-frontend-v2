"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { account, type DeliveryHint } from "@/lib/api/account";
import { useSession } from "@/lib/store/session";
import { DeliveryNote } from "@/components/portal/delivery-note";

/**
 * "Verify your email" — a full-width strip below the top bar, on every
 * signed-in screen, for as long as the account stays unverified.
 *
 * ## Persistent, not permanent
 *
 * This is a step up from the one-shot nudge on the setup wizard
 * (`app/(setup)/setup/verification-nudge.tsx`, which only ever appears once,
 * to whoever just registered, and is gone for good once dismissed). That one
 * is scoped to company setup; this one is scoped to the account, and shows
 * to *anybody* signed in with an unverified email — an invited employee
 * included, not just whoever created the company.
 *
 * Dismissing this hides it for the rest of the current signed-in session,
 * not forever: dismissal is a plain `useState`, and `AuthGate` unmounts this
 * component's whole subtree on sign-out (it renders the sign-in screen
 * instead of `children` — see `auth-gate.tsx`), so a fresh sign-in always
 * remounts this banner with `dismissed` back at `false`. Still not a gate —
 * nothing here blocks navigation or an action, because nothing in the
 * product is gated on verification. See the setup-wizard nudge's own header
 * for why: no mail transport existed when that one was written. One now
 * does (`approvehr-backend`, `useTransport` wired in `server.ts`), which is
 * what makes a persistent version of this worth having at all — a banner
 * nagging about a link nobody could ever have received would be worse than
 * no banner.
 *
 * ## Why `isConnected` gates it, not just `emailVerified`
 *
 * `emailVerified` already defaults to `true` in demo mode (see
 * `useSession()`), so this would not render there regardless. The explicit
 * `isConnected` check is belt-and-suspenders in the same spirit as the rest
 * of this file's reasoning: a banner about confirming an email address that
 * demo mode never asked for would be confusing on its own terms even if the
 * boolean happened to cooperate.
 */
export function VerificationBanner() {
  const { isConnected, emailVerified, user } = useSession();
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<DeliveryHint>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  if (!isConnected || emailVerified || dismissed) return null;

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      const result = await account.requestEmailVerification();
      if (result.alreadyVerified) {
        setDismissed(true);
        return;
      }
      setHint(result.emailVerification);
      setSent(true);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "unknown", "Something went wrong. Try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print sticky top-14 z-20 border-b border-warning-line bg-warning-soft px-4 py-2.5 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex min-w-0 flex-1 items-center gap-2 text-body-sm text-warning-text">
          <Mail aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0">
            {sent
              ? `Sent — check ${user?.email ?? "your inbox"} for the link.`
              : `Confirm ${user?.email ?? "your email"} to keep your account secure.`}
          </span>
        </span>

        {error && (
          <span className="text-body-sm text-danger-text">{error.message}</span>
        )}

        <div className="flex shrink-0 items-center gap-3">
          {!sent && (
            <Button
              variant="secondary"
              size="sm"
              loading={busy}
              onClick={() => void resend()}
            >
              Resend link
            </Button>
          )}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-body-sm font-medium text-warning-text underline underline-offset-2 hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      </div>

      {hint && (
        <div className="mt-2">
          <DeliveryNote
            hint={hint}
            href={(token) => `/verify-email?token=${encodeURIComponent(token)}`}
            action="Confirm my email"
          />
        </div>
      )}
    </div>
  );
}
