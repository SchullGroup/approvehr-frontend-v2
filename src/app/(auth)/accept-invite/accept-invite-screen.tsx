"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { Button, Callout } from "@/components/ui";
import { account, passwordAccepted } from "@/lib/api/account";
import { markSignedIn } from "@/lib/store/session";
import { PasswordField } from "../password-field";

/**
 * Turning an invitation into an account.
 *
 * Same shape as `ResetPasswordScreen` — the link is the credential, so there
 * is no email field — with one difference in what happens on success.
 * Resetting a password ends every session and sends somebody to sign in
 * again, because the point of that flow is proving you still control an
 * account you already had. Accepting an invitation is opening one for the
 * first time, so it lands signed in immediately, the same way `register`
 * does: `markSignedIn(result.user)` is the same non-hook escape hatch
 * `register-screen.tsx` uses, for the same reason documented there — nothing
 * in this route group may call `useSession()`.
 *
 * Every failure — wrong token, expired, already used, the record archived
 * since it was sent — comes back as one 422 with one sentence, and this
 * screen does not try to tell them apart. Whoever holds a stolen link should
 * learn nothing from the failure beyond "ask for a new one".
 */
export function AcceptInviteScreen({ token }: { token: string | null }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function submit() {
    if (!token || !passwordAccepted(password) || busy) return;
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

  /* No token at all: truncated by a mail client, or somebody typed the
     address. There is no "send me a new one" here the way reset-password has
     — asking for a fresh invitation is whoever sent this one's job, not a
     self-service form, because sending one is a privileged act. */
  if (!token) {
    return (
      <>
        <h1 className="text-h2 text-ink">This link is incomplete</h1>
        <p className="mt-4 text-body text-muted">
          Ask whoever invited you to send it again.
        </p>
      </>
    );
  }

  const deadLink =
    error && error.status === 422 && !error.messageFor("newPassword")
      ? error
      : null;

  return (
    <>
      <h1 className="text-h2 text-ink">Set your password</h1>
      <p className="mt-2 text-body-sm text-muted">
        One more step and you are in.
      </p>

      {deadLink && (
        <Callout tone="danger" title="This link no longer works" className="mt-5">
          <p>{deadLink.message}</p>
        </Callout>
      )}

      {error && !deadLink && error.fieldErrors.length === 0 && (
        <Callout
          tone="danger"
          title={
            error.code === "rate_limited" ? "Too many attempts" : "That did not work"
          }
          className="mt-5"
        >
          {error.message}
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
          disabled={!passwordAccepted(password) || deadLink !== null}
          loading={busy}
          onClick={() => void submit()}
        >
          {busy ? "Setting it up…" : "Create my account"}
        </Button>
      </div>
    </>
  );
}
