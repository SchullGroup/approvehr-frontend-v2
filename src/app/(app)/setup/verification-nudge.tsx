"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Button, Callout } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { account, type DeliveryHint } from "@/lib/api/account";
import { DeliveryNote } from "@/app/(auth)/delivery-note";

/**
 * "Confirm your email", shown above the setup wizard right after
 * registering. A nudge, not a gate — the API has no mail transport yet
 * (`src/modules/auth/delivery.ts`), so nothing in the product blocks on
 * `emailVerifiedAt`, and this doesn't either. Setup works either way; this
 * only exists so the confirmation link isn't silently lost.
 *
 * `hint` is the `DeliveryHint` the register call already returned — present
 * only outside production, where there is no transport to deliver it. In
 * production it is `null` and this renders the plain "check your inbox"
 * copy instead, same as every other screen that touches `DeliveryHint`.
 */
export function VerificationNudge({
  email,
  hint,
  onDismiss,
}: {
  email: string;
  hint: DeliveryHint;
  onDismiss: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [currentHint, setCurrentHint] = useState(hint);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      const result = await account.requestEmailVerification();
      if (result.alreadyVerified) {
        onDismiss();
        return;
      }
      setCurrentHint(result.emailVerification);
      setResent(true);
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
    <Callout
      tone="info"
      title="Confirm your email"
      icon={<Mail aria-hidden="true" />}
      className="mb-6"
    >
      <p>
        We sent a confirmation link to {email}. Setup works either way — this
        is just so the link isn&apos;t lost.
      </p>

      {currentHint && (
        <DeliveryNote
          hint={currentHint}
          href={(token) => `/verify-email?token=${encodeURIComponent(token)}`}
          action="Confirm my email"
        />
      )}

      {error && (
        <p className="mt-2 text-body-sm text-danger-text">{error.message}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Button
          variant="secondary"
          size="sm"
          loading={busy}
          disabled={resent}
          onClick={() => void resend()}
        >
          {resent ? "Link sent again" : "Resend link"}
        </Button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-body-sm text-muted underline underline-offset-2 hover:text-ink"
        >
          Dismiss
        </button>
      </div>
    </Callout>
  );
}
