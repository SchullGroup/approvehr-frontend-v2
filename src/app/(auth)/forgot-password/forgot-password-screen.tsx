"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api/client";
import { Button, ButtonLink, Callout, Field, Input } from "@/components/ui";
import { account, type ForgotPasswordResult } from "@/lib/api/account";
import { DeliveryNote } from "../delivery-note";

/**
 * Asking for a reset link.
 *
 * ## The answer is the same either way, and this screen must not spoil that
 *
 * The API returns an identical status, an identical set of fields and an
 * identical sentence whether or not the address has an account — otherwise this
 * endpoint tells an attacker which staff at a known company have accounts here.
 * So the success state **renders the API's own `message`** rather than composing
 * a warmer one from the address that was typed, and there is no branch anywhere
 * below on whether the account was found. There is nothing on this side that
 * knows.
 */
export function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<ForgotPasswordResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  async function submit() {
    if (email.trim() === "" || busy) return;
    setBusy(true);
    setError(null);
    try {
      setSent(await account.forgotPassword(email));
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

  if (sent) {
    return (
      <>
        <h1 className="text-h2 text-ink">Reset your password</h1>

        {/* Only one of these is ever true, and saying both would contradict
            itself: the note appears exactly when no email went out. */}
        {sent.passwordReset ? (
          <DeliveryNote
            hint={sent.passwordReset}
            href={(token) => `/reset-password?token=${encodeURIComponent(token)}`}
            action="Set a new password"
          />
        ) : (
          <Callout tone="info" title="Check your email" className="mt-5">
            {sent.message}
          </Callout>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <ButtonLink href="/dashboard">Back to sign in</ButtonLink>
          <Button
            variant="ghost"
            onClick={() => {
              setSent(null);
              setEmail("");
            }}
          >
            Try another email
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="text-h2 text-ink">Reset your password</h1>

      {error && (
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
        <Field label="Work email" required error={error?.messageFor("email")}>
          <Input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => {
              const next = e.target.value;
              setEmail(next);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
        </Field>

        <Button
          variant="accent"
          disabled={email.trim() === ""}
          loading={busy}
          onClick={() => void submit()}
        >
          {busy ? "Sending…" : "Email me a link"}
        </Button>
      </div>

      <p className="mt-7 text-body-sm text-muted">
        Remembered it?{" "}
        <Link
          href="/dashboard"
          className="font-medium text-accent-text underline underline-offset-2 transition-colors hover:text-ink"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
