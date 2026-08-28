"use client";

import { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Button, Callout, Field, Input } from "@/components/ui";
import { Logo } from "@/components/brand/logo";
import { ApiError } from "@/lib/api/client";
import type { TwoFactorChallengeState } from "@/lib/store/session";

/**
 * The second step of a sign-in: the code.
 *
 * ## The recovery path is not hidden behind a link nobody finds
 *
 * It is one click away and it says how many codes are left, because on a
 * deployment with **no mail transport** the emailed code is never arriving and
 * the recovery code is the only way in. A product that buried that would have
 * locked somebody out of their own payroll and told them to check their email.
 *
 * `delivery` carries the code itself where the server could not send it — the
 * same seam the invitation screens use, `null` in production. Shown rather than
 * hidden for exactly the reason `DeliveryNote` gives: a screen that silently
 * dropped it would be a dead end wearing a form.
 *
 * ## What is deliberately not here
 *
 * No "remember this device". It would need a device token, a way to revoke one,
 * and a screen listing them — and a half-built version is a second credential
 * nobody can see or withdraw. Better absent than present and unmanageable.
 */
export function TwoFactorStep({
  challenge,
  onCancel,
  onVerify,
}: {
  challenge: TwoFactorChallengeState;
  onCancel: () => void;
  onVerify: (input: {
    challengeId: string;
    code?: string;
    recoveryCode?: string;
  }) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onVerify({
        challengeId: challenge.challengeId,
        ...(useRecovery
          ? { recoveryCode: recovery.trim() }
          : { code: code.trim() }),
      });
    } catch (caught) {
      /* The API's own sentence. It deliberately says the same thing for a wrong
         code, an expired one and a used one — telling them apart tells somebody
         guessing which half they got right. */
      setError(
        caught instanceof ApiError
          ? caught.message
          : "That did not work. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const ready = useRecovery ? recovery.trim().length >= 4 : code.trim().length === 6;

  return (
    /* The sign-in screen's own chrome, inline.
       -----------------------------------------
       Not a shared `AuthShell`: one exists in another branch's working tree
       and importing it would make this file depend on something unmerged —
       which is exactly how this branch first went red in CI. The markup is
       twelve lines and identical to the step before it, so the two screens
       read as one flow. Extract it the day both are on the same branch. */
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
          <Link href="/" aria-label="ApproveHR home" className="text-ink">
            <Logo size={24} />
          </Link>
        </div>
      </header>

      <main
        id="main"
        className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-14"
      >
        <div className="flex flex-col gap-5">
        <div className="flex items-start gap-2.5">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 text-accent-text" />
          <div>
            <h1 className="text-h4 text-ink">One more step</h1>
            <p className="mt-1 text-body-sm text-muted">
              {useRecovery
                ? "Use one of the recovery codes you saved when you set this up."
                : "We have sent a six-digit code to your email address."}
            </p>
          </div>
        </div>

        {/* The code, where the server could not send it. Same seam as the
            invitation screens, and null in production. */}
        {challenge.delivery && !useRecovery && (
          <Callout tone="warning" title="No email was sent">
            This server cannot send email, so here is the code:{" "}
            <span className="font-mono font-medium text-ink">
              {challenge.delivery.token}
            </span>
          </Callout>
        )}

        {error && (
          <p
            role="status"
            className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-body-sm text-ink"
          >
            {error}
          </p>
        )}

        {useRecovery ? (
          <Field
            label="Recovery code"
            help={`${String(challenge.recoveryCodesLeft)} of your recovery codes ${challenge.recoveryCodesLeft === 1 ? "is" : "are"} still unused. Each one works once.`}
          >
            <Input
              value={recovery}
              autoFocus
              autoComplete="one-time-code"
              placeholder="ABCDE-FGHJK"
              className="font-mono"
              onChange={(event) => setRecovery(event.target.value)}
            />
          </Field>
        ) : (
          <Field label="Code">
            <Input
              value={code}
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className="font-mono tracking-[0.3em]"
              onChange={(event) =>
                /* Digits only, so a pasted "123 456" still works rather than
                   failing a six-digit check on the space. */
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
            />
          </Field>
        )}

        <Button
          variant="accent"
          block
          loading={busy}
          disabled={!ready || busy}
          onClick={() => void submit()}
        >
          Sign in
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setUseRecovery((now) => !now);
              setError(null);
            }}
          >
            <KeyRound aria-hidden="true" className="size-3.5" />
            {useRecovery ? "Use the emailed code" : "Use a recovery code"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Start again
          </Button>
        </div>

        {challenge.recoveryCodesLeft === 0 && !useRecovery && (
          <p className="text-meta text-muted">
            You have no recovery codes left. If the email does not arrive, an
            administrator can turn two-factor off for your account.
          </p>
        )}
        </div>
      </main>
    </div>
  );
}
