"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { ApiError, onAuthChange, tokens } from "@/lib/api/client";
import { Button, ButtonLink, Callout } from "@/components/ui";
import { account, type DeliveryHint } from "@/lib/api/account";
import { DeliveryNote } from "../delivery-note";

/**
 * Confirming an email address.
 *
 * Two arrivals, one screen.
 *
 * **With a token** — somebody opened the link, quite possibly on a phone where
 * they have never signed in. So this runs unauthenticated and confirms on
 * arrival: there is no "click here to confirm" button, because the click already
 * happened, in the mail app.
 *
 * **Without one** — somebody followed a prompt from inside the product. All that
 * is on offer here is a fresh link, and asking for one is authenticated (the
 * caller already holds a token for the account, so no address has to be looked
 * up and there is no way to use the route to discover who has an account).
 * Without a session there is nothing to offer but sign-in.
 *
 * ## The `started` ref is not optional
 *
 * A token is single-use, enforced server-side by compare-and-set. React runs
 * effects twice in development, so without the guard the second call would spend
 * an already-spent token and this screen would report failure on every
 * successful confirmation — in development only, which is the worst place for a
 * bug to live.
 */

/**
 * Whether this browser holds a session, without a hydration mismatch.
 *
 * The naive version — `useState(false)` plus a `setState` in an effect — reads
 * correctly but re-renders on every mount and is what the
 * `react-hooks/set-state-in-effect` rule exists to catch.
 * `useSyncExternalStore` is the primitive for this: the server snapshot is
 * `false`, the client reads localStorage after hydration, and `onAuthChange`
 * means a sign-out in another tab is reflected here rather than leaving a button
 * on screen that can no longer work. Same rule the stores in `lib/store` follow.
 */
function useHasSession(): boolean {
  return useSyncExternalStore(
    onAuthChange,
    () => tokens.has(),
    () => false,
  );
}

type Phase =
  | { kind: "confirming" }
  | { kind: "confirmed"; email: string }
  | { kind: "dead"; message: string }
  /** No token in the URL: offer a new link. */
  | { kind: "idle" }
  | { kind: "sent"; hint: DeliveryHint }
  | { kind: "already" };

export function VerifyEmailScreen({ token }: { token: string | null }) {
  const [phase, setPhase] = useState<Phase>(
    token ? { kind: "confirming" } : { kind: "idle" },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const signedIn = useHasSession();
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    void (async () => {
      try {
        const result = await account.confirmEmail(token);
        setPhase({ kind: "confirmed", email: result.email });
      } catch (caught) {
        setPhase({
          kind: "dead",
          message:
            caught instanceof ApiError
              ? caught.message
              : "Something went wrong. Try again.",
        });
      }
    })();
  }, [token]);

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      const result = await account.requestEmailVerification();
      setPhase(
        result.alreadyVerified
          ? { kind: "already" }
          : { kind: "sent", hint: result.emailVerification },
      );
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

  if (phase.kind === "confirming") {
    return (
      <>
        <h1 className="text-h2 text-ink">Confirming your email</h1>
        <p className="mt-4 flex items-center gap-2 text-[0.9375rem] text-muted">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          One moment.
        </p>
      </>
    );
  }

  if (phase.kind === "confirmed") {
    return (
      <>
        <h1 className="text-h2 text-ink">Email confirmed</h1>
        <Callout
          tone="success"
          icon={<CheckCircle2 aria-hidden="true" />}
          className="mt-5"
        >
          {phase.email} is confirmed.
        </Callout>
        <ButtonLink href="/dashboard" variant="accent" className="mt-6 self-start">
          Open ApproveHR
        </ButtonLink>
      </>
    );
  }

  if (phase.kind === "already") {
    return (
      <>
        <h1 className="text-h2 text-ink">Already confirmed</h1>
        <ButtonLink href="/dashboard" variant="accent" className="mt-6 self-start">
          Open ApproveHR
        </ButtonLink>
      </>
    );
  }

  if (phase.kind === "sent") {
    return (
      <>
        <h1 className="text-h2 text-ink">Confirm your email</h1>
        {phase.hint ? (
          <DeliveryNote
            hint={phase.hint}
            href={(fresh) => `/verify-email?token=${encodeURIComponent(fresh)}`}
            action="Confirm my email"
          />
        ) : (
          <Callout tone="info" title="Link sent" className="mt-5">
            Open it from your inbox to finish. It lasts a day.
          </Callout>
        )}
        <ButtonLink href="/dashboard" className="mt-6 self-start">
          Back to ApproveHR
        </ButtonLink>
      </>
    );
  }

  /* `idle` and `dead` share everything below the heading: in both cases the only
     thing that helps is a new link, and the only question is whether this
     browser is holding a session that can ask for one. */
  return (
    <>
      <h1 className="text-h2 text-ink">Confirm your email</h1>

      {phase.kind === "dead" && (
        <Callout tone="danger" title="This link no longer works" className="mt-5">
          {phase.message}
        </Callout>
      )}

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

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {signedIn ? (
          <Button variant="accent" loading={busy} onClick={() => void resend()}>
            {busy ? "Sending…" : "Send me a new link"}
          </Button>
        ) : (
          <ButtonLink href="/dashboard" variant="accent">
            Sign in to get a new link
          </ButtonLink>
        )}
      </div>
    </>
  );
}
