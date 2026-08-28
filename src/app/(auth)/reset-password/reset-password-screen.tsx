"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { Button, ButtonLink, Callout } from "@/components/ui";
import { account, passwordAccepted } from "@/lib/api/account";
import { PasswordField } from "@/components/portal/password-field";

/**
 * Setting a new password from the emailed link.
 *
 * ## The link is the credential, so there is no email field
 *
 * Asking for the address again would prove nothing — whoever holds the token has
 * already proved they read mail at that address. One field, and it is the new
 * password.
 *
 * ## Every failure reads the same, and that is the API's design
 *
 * Wrong token, expired token, already-used token, right token but the wrong kind:
 * all of them come back as one 422 with one sentence. A screen that
 * distinguished them would tell somebody holding a stolen token which of those
 * it was, which is the one thing worth knowing. So there is no branch on the
 * failure mode here, only "ask for a new link".
 *
 * The 422 also matters mechanically: a 401 would make `client.ts` refresh and
 * retry, and a refresh in the middle of a reset revokes every session on the
 * account. `account.resetPassword` sends the request anonymously for the same
 * reason.
 */
export function ResetPasswordScreen({ token }: { token: string | null }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ sessionsRevoked: number } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  /* Lenient until the preview answers. A dead token never gets past the length
     check below to make this matter, and defaulting the other way — strict
     until proven otherwise — would show four rules to somebody whose account
     has never needed them, for the second it takes this to resolve. */
  const [strict, setStrict] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void account
      .requirementsForReset(token)
      .then((result) => {
        if (!cancelled) setStrict(result.requiresStrongPassword);
      })
      .catch(() => {
        /* Leave the lenient default — the real submit below still enforces
           whatever the account actually needs, so nothing is lost by a
           preview that could not be reached; only the checklist would be
           wrong for a few seconds, and it is caught either way. */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit() {
    if (!token || !passwordAccepted(password, strict) || busy) return;
    setBusy(true);
    setError(null);
    try {
      setDone(await account.resetPassword(token, password));
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

  /* No token at all: the link was truncated by a mail client, or somebody typed
     the address. Nothing to do here but get them a working one. */
  if (!token) {
    return (
      <>
        <h1 className="text-h2 text-ink">This link is incomplete</h1>
        <ButtonLink href="/forgot-password" variant="accent" className="mt-6 self-start">
          Send me a new link
        </ButtonLink>
      </>
    );
  }

  if (done) {
    return (
      <>
        <h1 className="text-h2 text-ink">Password changed</h1>
        <Callout
          tone="success"
          icon={<CheckCircle2 aria-hidden="true" />}
          className="mt-5"
        >
          {done.sessionsRevoked > 0
            ? `You were signed out on ${done.sessionsRevoked} ${
                done.sessionsRevoked === 1 ? "device" : "devices"
              }. Sign in again with your new password.`
            : "Sign in with your new password."}
        </Callout>
        <ButtonLink href="/dashboard" variant="accent" className="mt-6 self-start">
          Sign in
        </ButtonLink>
      </>
    );
  }

  /* A dead link is not a form error — there is nothing to correct in the box —
     so it replaces the banner and brings its own way out. */
  const deadLink =
    error && error.status === 422 && !error.messageFor("newPassword")
      ? error
      : null;

  return (
    <>
      <h1 className="text-h2 text-ink">Choose a new password</h1>

      {deadLink && (
        <Callout tone="danger" title="This link no longer works" className="mt-5">
          <p>{deadLink.message}</p>
          <ButtonLink
            href="/forgot-password"
            variant="secondary"
            size="sm"
            className="mt-3"
          >
            Send me a new link
          </ButtonLink>
        </Callout>
      )}

      {error && !deadLink && error.fieldErrors.length === 0 && (
        <Callout
          tone="danger"
          title={
            error.code === "rate_limited"
              ? "Too many attempts"
              : "That did not work"
          }
          className="mt-5"
        >
          {error.message}
        </Callout>
      )}

      <div className="mt-6 flex flex-col gap-4">
        <PasswordField
          label="New password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          error={error?.messageFor("newPassword")}
          onEnter={() => void submit()}
          strict={strict}
        />

        <Button
          variant="accent"
          disabled={!passwordAccepted(password, strict) || deadLink !== null}
          loading={busy}
          onClick={() => void submit()}
        >
          {busy ? "Saving…" : "Save new password"}
        </Button>
      </div>
    </>
  );
}
