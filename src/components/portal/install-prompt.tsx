"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Share, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * "Put ApproveHR on your home screen" — on a phone, once, and only where it
 * can actually be done.
 *
 * ## Why this exists
 *
 * The manifest, the worker, the icons and the offline page have all been
 * shipping for a while, and none of it told anybody. On Android Chrome offers
 * its own banner sometimes, on its own schedule, in a form we do not control.
 * **On iOS there is no prompt at all** — Add to Home Screen lives behind the
 * Share sheet and Safari never mentions it — so an install on an iPhone
 * happened only if somebody had been told in person. For a product whose
 * reader is a staff member clocking in on a phone, that is the difference
 * between a tool and a URL nobody remembers.
 *
 * ## It renders nothing unless the install can be done, right now, here
 *
 * That is the whole design. An instruction somebody cannot follow is worse
 * than silence, and there are four ways to get it wrong:
 *
 * - **Already installed.** `display-mode: standalone` catches every browser;
 *   `navigator.standalone` is the iOS-only one that predates it and is still
 *   what an iPhone reports. Both, because Safari answers to the second.
 * - **Not a phone.** Chrome on a laptop can install too, and a strip about
 *   home screens above somebody's payroll on a 27-inch monitor is noise. A
 *   coarse pointer *and* a narrow viewport, so a touchscreen laptop is not
 *   mistaken for a phone.
 * - **A browser that cannot install.** Chrome, Firefox and Edge on iOS are all
 *   WebKit and none of them can add to the home screen — only Safari can. They
 *   get nothing rather than an instruction that leads to a Share sheet with no
 *   such item.
 * - **Android before Chrome is ready.** The Install button exists only once
 *   `beforeinstallprompt` has actually fired, because that event *is* the
 *   installability check — Chrome withholds it when the manifest is
 *   incomplete, when the worker has not been claimed yet, or when the app is
 *   already installed. Guessing from the user agent instead would put a dead
 *   button in front of people on exactly the deployments where something is
 *   wrong.
 *
 * ## Two different things, because they are two different acts
 *
 * Android gets a **button** that opens the real browser dialog — the deferred
 * `beforeinstallprompt` event, prompted on a click, which is the only way to
 * trigger it. iOS gets a **sentence** naming the two taps, because there is no
 * API to call and pretending otherwise would be a button that does nothing.
 *
 * ## Dismissal persists, and that is a trade-off worth naming
 *
 * `VerificationBanner` dismisses for the session, because verifying an email
 * is something you do need to do. This is a suggestion, and a suggestion that
 * returns every morning is an irritation — so "Not now" is remembered in
 * `localStorage` for this browser.
 *
 * The cost: somebody who dismissed it and later wants the app has no way back
 * to the instruction from inside the product. That is a real gap and it is
 * left open deliberately rather than papered over with a timer nobody can
 * predict. The fix is a permanent home for the same sentence — a row under
 * Settings — which is a separate, small piece of work.
 */

/** Remembered per browser, per origin. Each company has its own subdomain. */
const DISMISSED = "approvehr.install.dismissed";

/**
 * The bit of the spec TypeScript's DOM lib does not have.
 *
 * `beforeinstallprompt` is Chromium-only and not in the standard, so
 * `WindowEventMap` does not know it and `BeforeInstallPromptEvent` does not
 * exist. Declared here rather than cast at the call site, so the two fields
 * actually used are named and checked.
 */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** True when the app is already running from the home screen. */
function installed(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  /* Safari's own, from before `display-mode` existed, and still the one an
     iPhone answers to. */
  const legacy = navigator as Navigator & { standalone?: boolean };
  return legacy.standalone === true;
}

/** A phone, rather than a laptop that happens to have a touchscreen. */
function onAPhone(): boolean {
  return (
    window.matchMedia("(pointer: coarse)").matches &&
    window.matchMedia("(max-width: 767px)").matches
  );
}

/**
 * Safari on iOS — the only browser on that platform that can install.
 *
 * `CriOS`, `FxiOS` and `EdgiOS` are Chrome, Firefox and Edge. They are all
 * WebKit underneath and none of them has Add to Home Screen, so they must not
 * be told to look for it.
 */
function iosSafari(): boolean {
  const ua = navigator.userAgent;
  if (!/iphone|ipod|ipad/i.test(ua)) return false;
  return !/crios|fxios|edgios|opios/i.test(ua);
}

/**
 * Whether an install could be offered here at all, without a hydration
 * mismatch and without a `setState` in an effect.
 *
 * Every input is client-only — `matchMedia`, `navigator`, `localStorage` — so
 * the server has no honest answer and the snapshot is `false`: the server
 * renders nothing, and the client decides after hydration. The naive version
 * (`useState(true)` plus a flip in an effect) reads correctly and is exactly
 * what `react-hooks/set-state-in-effect` exists to catch — the same reasoning
 * `verify-email-screen.tsx` records for `useHasSession`.
 *
 * Nothing subscribes, because none of these change while the page is open: a
 * phone does not become a laptop, and the one input that *can* change —
 * dismissal — is a `setState` in a click handler, which is where state belongs.
 */
function useCouldInstall(): boolean {
  const subscribe = useCallback(() => () => undefined, []);
  return useSyncExternalStore(
    subscribe,
    () => {
      let dismissed = false;
      try {
        dismissed = window.localStorage.getItem(DISMISSED) === "1";
      } catch {
        /* Private mode, or storage disabled. Treat it as not dismissed: the
           worst case is a strip somebody closes again, which is better than
           never offering the install at all. */
      }
      return !dismissed && !installed() && onAPhone();
    },
    () => false,
  );
}

export function InstallPrompt() {
  /** Null until Chrome says the app is installable. */
  const [offer, setOffer] = useState<InstallPromptEvent | null>(null);
  const couldInstall = useCouldInstall();
  /** Set by the dismiss button, which is a click and not an effect. */
  const [dismissed, setDismissed] = useState(false);

  /* iOS is decided without an event, because Safari fires none — and it is a
     pure read, so it needs no state. */
  const showIosSteps = couldInstall && iosSafari();

  useEffect(() => {
    if (!couldInstall) return;

    const onAvailable = (event: Event) => {
      /* Stop Chrome's own mini-infobar, so there is one offer rather than two
         saying the same thing in different words. */
      event.preventDefault();
      setOffer(event as InstallPromptEvent);
    };
    /* If it fired before this mounted, Chrome fires it again on the next
       navigation — so a miss costs a page view, not the feature. */
    window.addEventListener("beforeinstallprompt", onAvailable);

    /* Chrome fires this when the install completes, including from its own
       menu rather than our button. */
    const onInstalled = () => close();
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onAvailable);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [couldInstall]);

  function close() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED, "1");
    } catch {
      /* Nothing to do. It will be offered again next visit, which is the
         honest failure for a browser that keeps nothing. */
    }
  }

  /* Nothing to offer: not a phone, already installed, dismissed, or a browser
     that has not said it can install and is not Safari on iOS. */
  if (!couldInstall || dismissed || (!offer && !showIosSteps)) return null;

  return (
    <div
      className="sticky top-14 z-20 flex items-start gap-3 border-b border-line bg-accent-soft px-5 py-3"
      /* A suggestion, not an alert. Announced when a screen reader gets to it
         rather than interrupting whatever it is reading. */
      role="region"
      aria-label="Install ApproveHR"
    >
      <Smartphone
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-accent-text"
      />
      <div className="min-w-0 flex-1">
        <p className="text-body-sm font-medium text-ink">
          Add ApproveHR to your home screen
        </p>
        {offer ? (
          <p className="mt-0.5 text-meta text-body">
            It opens like an app, and clocking in works even when the signal
            drops.
          </p>
        ) : (
          <p className="mt-0.5 text-meta leading-relaxed text-body">
            Tap{" "}
            <Share
              aria-label="the Share button"
              className="inline size-3.5 align-text-bottom"
            />{" "}
            in Safari&apos;s toolbar, then <strong>Add to Home Screen</strong>.
            It opens like an app afterwards.
          </p>
        )}
      </div>

      {offer && (
        <Button
          size="sm"
          variant="accent"
          onClick={() => {
            void (async () => {
              /* The dialog can only be opened from a click, and the event is
                 single-use — Chrome refuses a second `prompt()` on the same
                 one. So the strip closes either way: accepted means installed,
                 dismissed means they were asked and said no. */
              await offer.prompt();
              close();
            })();
          }}
        >
          Install
        </Button>
      )}

      <button
        type="button"
        onClick={close}
        aria-label="Not now"
        className="mt-0.5 shrink-0 text-muted hover:text-ink"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
