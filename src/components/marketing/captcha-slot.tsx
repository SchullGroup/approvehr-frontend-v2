"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The "are you a person" check on the apply form — a slot, not a fixture.
 *
 * ## It is not on the page unless the API asks for it
 *
 * The check is off in every environment until somebody gives the API a secret.
 * Until then this component is never mounted, which means the third-party script
 * is never requested either: a visitor reading a job advert should not be
 * handing their address to a challenge provider for a form they have not sent.
 * The parent mounts it only after the API has said the check is on — either
 * because the advert says so up front, or because an application was refused with
 * `captcha_required`.
 *
 * ## What it loads
 *
 * Cloudflare Turnstile, because that is what the API verifies against. One script
 * tag for the whole page, added on first mount and shared if the slot comes and
 * goes. The site key is public by design (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`); the
 * secret lives on the API and never reaches the browser.
 *
 * ## Tokens are spent once
 *
 * A token the API has seen — accepted or refused — cannot be used again. So when
 * the parent bumps `resetKey` after a refused submission the widget is reset and
 * hands back a fresh one, rather than leaving the applicant clicking Send with a
 * dead token and getting "that check did not pass" on a check they passed.
 *
 * ## When it cannot load
 *
 * An ad blocker, a corporate proxy or a dead connection will stop the script. The
 * form cannot be sent without the token, so the one honest thing is to say so and
 * offer to try again — a blank gap above the button reads as a broken page.
 */

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("no window"));
  }
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("turnstile missing after load"));
    };
    script.onerror = () => reject(new Error("turnstile script blocked"));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    /* Forget the failure so "Try again" really asks again, and drop the dead
       tag so the retry is not a second copy of it. */
    scriptPromise = null;
    document.querySelector(`script[src="${SCRIPT_SRC}"]`)?.remove();
    throw error;
  });
  return scriptPromise;
}

export function CaptchaSlot({
  siteKey,
  onToken,
  resetKey,
}: {
  /** `null` when this deployment has no site key: the slot says so. */
  siteKey: string | null;
  /** The token the visitor earned, or `null` when it expired or was reset. */
  onToken: (token: string | null) => void;
  /** Change it to discard the current token and ask for a new one. */
  resetKey: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const tokenSink = useRef(onToken);

  useEffect(() => {
    tokenSink.current = onToken;
  });

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    loadTurnstile()
      .then((turnstile) => {
        const node = container.current;
        if (cancelled || !node) return;
        widget.current = turnstile.render(node, {
          sitekey: siteKey,
          callback: (token) => tokenSink.current(token),
          "expired-callback": () => tokenSink.current(null),
          "error-callback": () => {
            tokenSink.current(null);
            setState("failed");
          },
        });
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("failed");
      });

    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) {
        window.turnstile.remove(widget.current);
      }
      widget.current = null;
    };
  }, [siteKey, attempt]);

  /* After a refusal: a spent token is worth nothing. */
  const firstReset = useRef(resetKey);
  useEffect(() => {
    if (firstReset.current === resetKey) return;
    if (widget.current && window.turnstile) {
      window.turnstile.reset(widget.current);
    }
    tokenSink.current(null);
  }, [resetKey]);

  if (!siteKey) {
    return (
      <p
        role="alert"
        data-testid="captcha-slot"
        data-state="no-site-key"
        className="rounded-xl bg-wash-rose p-3.5 text-body-sm leading-relaxed text-slate-soft"
      >
        This form asks for a check that is not set up on this site, so it cannot
        be sent from here. Please contact the company directly.
      </p>
    );
  }

  return (
    <div role="group" aria-label="Security check" data-testid="captcha-slot">
      {/* Turnstile draws into this box. A fixed height stops the form jumping
          when the widget arrives. */}
      <div ref={container} className="min-h-[65px]" />
      <p role="status" className="text-meta text-slate-muted">
        {state === "loading" ? "Loading the check…" : ""}
      </p>
      {state === "failed" && (
        <div role="alert" className="mt-2 text-body-sm text-slate-soft">
          <p>
            The check did not load. An ad blocker or a weak connection can stop
            it, and the form cannot be sent without it.
          </p>
          <button
            type="button"
            onClick={() => {
              setState("loading");
              setAttempt((n) => n + 1);
            }}
            className="mt-1.5 font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate"
          >
            Try loading it again
          </button>
        </div>
      )}
    </div>
  );
}
