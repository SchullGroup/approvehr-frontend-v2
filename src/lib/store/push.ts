"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  applicationServerKey,
  pushApi,
  toBase64Url,
  type ApiPushDevice,
} from "@/lib/api/push";
import { useRevalidation } from "@/lib/revalidate";
import { useSession } from "./session";

/**
 * Turning browser notifications on for this device.
 *
 * ## Five states, not two
 *
 * A switch implies on or off. There are five, and collapsing them is how a
 * settings screen ends up saying "off" to somebody who has *blocked*
 * notifications and will never be able to turn them on from here:
 *
 * - `unsupported` — no service worker or no push manager (an older browser, or
 *   an iOS home screen the app is not installed to).
 * - `unconfigured` — the server has no VAPID key. Nothing to subscribe to, and
 *   the person reading cannot fix it.
 * - `blocked` — the browser permission is denied. **Asking again does nothing**;
 *   only the browser's own site settings can undo it, and the screen has to say
 *   so rather than offer a button that silently fails.
 * - `off` — allowed to ask, not subscribed.
 * - `on` — subscribed here.
 */
export type PushState =
  | "loading"
  | "unsupported"
  | "unconfigured"
  | "blocked"
  | "off"
  | "on";

export function usePush(): {
  state: PushState;
  devices: ApiPushDevice[];
  error: string | null;
  busy: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  reload: () => void;
} {
  const { isConnected } = useSession();
  /* What the probe found. The returned `state` is derived from this and from
     `isConnected`, rather than stored — writing "unconfigured" into state
     synchronously when there is no API is a `setState` in the render path of
     an effect, and the cascading-render rule is right to refuse it. */
  const [probed, setProbed] = useState<PushState>("loading");
  const [devices, setDevices] = useState<ApiPushDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  /* Re-probe when somebody comes back to the window. This is the one store
     whose answer can change **outside the app**: blocking notifications in the
     browser's own site settings, or in another tab, leaves this screen saying
     "on" for a device that will never ring again. */
  const revalidation = useRevalidation();

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    void (async () => {
      /* Feature detection before anything else: reading `Notification` on a
         browser that has none throws, and asking the server for a key we
         cannot use is a request for nothing. */
      const supported =
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;
      if (!supported) {
        if (!cancelled) setProbed("unsupported");
        return;
      }
      try {
        const [key, rows] = await Promise.all([
          pushApi.key(),
          pushApi.devices(),
        ]);
        if (cancelled) return;
        setDevices(rows);
        if (!key.configured || !key.publicKey) {
          setProbed("unconfigured");
          return;
        }
        if (Notification.permission === "denied") {
          setProbed("blocked");
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setProbed(existing ? "on" : "off");
      } catch (caught) {
        if (!cancelled) {
          setProbed("off");
          setError(
            caught instanceof ApiError
              ? caught.message
              : "Could not tell whether notifications are on for this browser.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, tick, revalidation]);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const key = await pushApi.key();
      if (!key.configured || !key.publicKey) {
        setProbed("unconfigured");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        /* Denied is terminal from here — only the browser's own site settings
           undo it, so the state has to say that rather than leave a switch
           somebody presses forever. */
        setProbed(permission === "denied" ? "blocked" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        /* Required by every browser: a push that could be sent without a
           payload is one a site could use to track somebody silently. */
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(key.publicKey),
      });
      await pushApi.subscribe({
        endpoint: subscription.endpoint,
        p256dh: toBase64Url(subscription.getKey("p256dh")),
        auth: toBase64Url(subscription.getKey("auth")),
        userAgent: navigator.userAgent,
      });
      setProbed("on");
      setTick((value) => value + 1);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "This browser refused to subscribe. Nothing has changed.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        /* Tell the server first. Unsubscribing in the browser first and then
           failing to reach the API leaves a row that will be pushed to for
           ever with nothing listening. */
        await pushApi.unsubscribe(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setProbed("off");
      setTick((value) => value + 1);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not turn them off. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    /* Derived, not stored: with no API there is nothing to subscribe to, which
       is the same answer as a server with no key set. */
    state: isConnected ? probed : "unconfigured",
    devices,
    error,
    busy,
    enable,
    disable,
    reload: useCallback(() => {
      setTick((value) => value + 1);
    }, []),
  };
}
