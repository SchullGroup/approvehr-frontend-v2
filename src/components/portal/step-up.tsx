"use client";

import { useCallback, useState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  Button,
  Callout,
  Field,
  Input,
  Modal,
  useToast,
} from "@/components/ui";
import { ApiError, request } from "@/lib/api/client";
import type { StepUpAction } from "@/lib/api/setup";

/**
 * A code in front of one act, without every call site knowing about it.
 *
 * ## The shape, and why it is a wrapper rather than a guard
 *
 * A screen does not ask "does this need a code" before acting. It **acts**, and
 * if the API answers `403 step_up_required` this catches it, collects the code,
 * and **retries the same call**:
 *
 * ```tsx
 * const stepUp = useStepUp();
 * await stepUp.run(() => payrollApi.approve(runId), {
 *   action: "PAYROLL_APPROVE",
 *   subjectId: runId,
 * });
 * ```
 *
 * Asking first would mean every guarded screen carrying a copy of the rule
 * about which company requires what — and the day the two copies disagree, a
 * screen either nags for a code nobody needs or skips one somebody does. The
 * server already knows; the refusal is how it says so.
 *
 * It also means a company with the switch off notices nothing at all: the
 * action succeeds on the first attempt and this code never runs.
 *
 * ## The retry is the same call, not a re-implementation
 *
 * `run` is handed a thunk. After a verified code it invokes **that same thunk**
 * again, so there is no second copy of the request to drift — and no chance of
 * the retry sending something subtly different from what was refused.
 */

type Pending<T> = {
  action: StepUpAction;
  subjectId: string | null;
  challengeId: string;
  /** The code itself, where the server cannot send email. */
  delivery: { token: string } | null;
  recoveryCodesLeft: number;
  attempt: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

export function useStepUp() {
  const [pending, setPending] = useState<Pending<unknown> | null>(null);
  const toast = useToast();

  const run = useCallback(
    async <T,>(
      attempt: () => Promise<T>,
      scope: { action: StepUpAction; subjectId?: string | null },
    ): Promise<T> => {
      try {
        return await attempt();
      } catch (caught) {
        if (!(caught instanceof ApiError) || caught.code !== "step_up_required") {
          throw caught;
        }

        /* The server has asked for a code. Get one, then hold the promise open
           until the dialog resolves it — the caller awaits a single `run` and
           never has to know a round trip happened in the middle. */
        const challenge = await request<
          | { available: false; reason: string }
          | {
              available: true;
              challengeId: string;
              expiresAt: string;
              delivery: { token: string; expiresAt: string } | null;
              recoveryCodesLeft: number;
            }
        >("/auth/step-up/request", {
          method: "POST",
          body: {
            action: scope.action,
            ...(scope.subjectId ? { subjectId: scope.subjectId } : {}),
          },
        });

        if (!challenge.available) {
          /* The company asks for a code and this person has not set two-factor
             up, so there is nowhere to send one. Surfaced as the API's own
             sentence rather than a silent failure — the fix is on their own
             settings page and nobody else can do it for them. */
          toast.push({
            title: "This needs a code and you have no way to get one",
            tone: "danger",
            detail: challenge.reason,
          });
          throw caught;
        }

        return await new Promise<T>((resolve, reject) => {
          setPending({
            action: scope.action,
            subjectId: scope.subjectId ?? null,
            challengeId: challenge.challengeId,
            delivery: challenge.delivery,
            recoveryCodesLeft: challenge.recoveryCodesLeft,
            attempt,
            resolve: resolve as (value: unknown) => void,
            reject,
          } as Pending<unknown>);
        });
      }
    },
    [toast],
  );

  const dialog = pending ? (
    <StepUpDialog
      pending={pending}
      onClose={() => {
        /* Cancelling rejects the caller's promise with the original refusal, so
           a screen's own catch runs exactly as it would have without this
           wrapper. Resolving with undefined would have every call site treat a
           cancel as a success. */
        pending.reject(
          new ApiError(403, "step_up_cancelled", "You did not confirm that."),
        );
        setPending(null);
      }}
      onVerified={() => {
        void (async () => {
          try {
            /* The same thunk, invoked again. The grant now exists, so the
               middleware lets it through. */
            pending.resolve(await pending.attempt());
          } catch (error) {
            pending.reject(error);
          } finally {
            setPending(null);
          }
        })();
      }}
    />
  ) : null;

  return { run, dialog };
}

function StepUpDialog({
  pending,
  onClose,
  onVerified,
}: {
  pending: Pending<unknown>;
  onClose: () => void;
  onVerified: () => void;
}) {
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const verify = async () => {
    setBusy(true);
    setFailed(null);
    try {
      await request("/auth/step-up/verify", {
        method: "POST",
        body: {
          challengeId: pending.challengeId,
          ...(useRecovery
            ? { recoveryCode: recovery.trim() }
            : { code: code.trim() }),
        },
      });
      onVerified();
    } catch (caught) {
      setFailed(
        caught instanceof ApiError
          ? caught.message
          : "That did not work. Try again.",
      );
      setBusy(false);
    }
  };

  const ready = useRecovery
    ? recovery.trim().length >= 4
    : code.trim().length === 6;

  return (
    <Modal
      open
      onClose={onClose}
      title="Confirm it is you"
      size="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={!ready || busy}
            onClick={() => void verify()}
          >
            Confirm
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-body">
          {ACTION_LINE[pending.action]} Your company asks for a code before this
          one.
        </p>

        {pending.delivery && !useRecovery && (
          <Callout tone="warning" title="No email was sent">
            This server cannot send email, so here is the code:{" "}
            <span className="font-mono font-medium text-ink">
              {pending.delivery.token}
            </span>
          </Callout>
        )}

        {failed && (
          <p
            role="status"
            className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-body-sm text-ink"
          >
            {failed}
          </p>
        )}

        {useRecovery ? (
          <Field
            label="Recovery code"
            help={`${String(pending.recoveryCodesLeft)} left. Each one works once.`}
          >
            <Input
              value={recovery}
              autoFocus
              className="font-mono"
              placeholder="ABCDE-FGHJK"
              onChange={(event) => setRecovery(event.target.value)}
            />
          </Field>
        ) : (
          <Field label="Code from your email">
            <Input
              value={code}
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className="font-mono tracking-[0.3em]"
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
            />
          </Field>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setUseRecovery((now) => !now);
            setFailed(null);
          }}
        >
          <ShieldCheck aria-hidden="true" className="size-3.5" />
          {useRecovery ? "Use the emailed code" : "Use a recovery code"}
        </Button>
      </div>
    </Modal>
  );
}

/** What is about to happen, in the words of the act rather than the enum. */
const ACTION_LINE: Record<StepUpAction, string> = {
  PAYROLL_APPROVE: "Approving a payroll releases the money on it.",
  PAYMENT_SUBMIT: "Sending a batch moves money out of the account.",
  ROLE_CHANGE: "This changes what somebody can do in the system.",
  BANK_DETAILS: "This changes where money is paid.",
};
