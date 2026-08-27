"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { ButtonLink, Button, Callout } from "@/components/ui";
import { account, passwordAccepted } from "@/lib/api/account";
import { markSignedIn } from "@/lib/store/session";
import { PasswordField } from "../password-field";

/**
 * Accepting an invitation.
 *
 * Unauthenticated, like `/verify-email` with a token — this is opened from
 * mail, quite possibly on a device that has never signed in. There is no
 * "resend" self-service here the way `/verify-email` offers one: resending is
 * something whoever invited them does, from Settings → Roles, because the
 * only account this screen could ask on behalf of has no password yet to
 * authenticate the request with.
 *
 * On success `account.acceptInvite` returns the same shape `register` does —
 * a signed-in session — so this closes exactly the way registering does:
 * `markSignedIn` so the next `AuthGate` mount sees it, then `replace` into the
 * product rather than back to a link that has just been spent.
 */
export function AcceptInviteScreen({ token }: { token: string | null }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const ready = token !== null && passwordAccepted(password);

  async function submit() {
    if (!ready || busy || !token) return;
    setBusy(true);
    setError(null);
    try {
      const result = await account.acceptInvite(token, password);
      markSignedIn(result.user);
      router.replace("/dashboard");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "unknown", "Something went wrong. Try again."),
      );
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <>
        <h1 className="text-h2 text-ink">This link is not complete</h1>
        <p className="mt-4 text-body text-muted">
          Open the invitation from the email it arrived in, or ask whoever
          invited you to send a new one.
        </p>
        <ButtonLink href="/dashboard" className="mt-6 self-start">
          Back to ApproveHR
        </ButtonLink>
      </>
    );
  }

  const banner = error && error.fieldErrors.length === 0 ? error : null;

  return (
    <>
      <h1 className="text-h2 text-ink">Set a password to get started</h1>
      <p className="mt-2 text-body text-muted">
        Choose a password to open your ApproveHR account.
      </p>

      {banner && (
        <Callout
          tone="danger"
          title={
            banner.code === "rate_limited" ? "Too many attempts" : "That link no longer works"
          }
          className="mt-5"
        >
          {banner.message}
        </Callout>
      )}

      <div className="mt-6 flex flex-col gap-4">
        <PasswordField
          label="Password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          error={error?.messageFor("newPassword")}
          onEnter={() => void submit()}
        />

        <Button
          variant="accent"
          disabled={!ready}
          loading={busy}
          onClick={() => void submit()}
        >
          {busy ? "Setting your password…" : "Set password and sign in"}
          {!busy && <ArrowRight aria-hidden="true" className="size-4" />}
        </Button>
      </div>
    </>
  );
}
