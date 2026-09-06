"use client";

import { request } from "@/lib/api/client";

/**
 * Web push — `/api/v1/push`.
 *
 * Every route here is about the caller's **own browser**, so none of it carries
 * a permission: whether somebody wants their phone to buzz when a payroll needs
 * approving is not a question about their role.
 *
 * ## The server cannot read what it pushes
 *
 * The payload is encrypted to `p256dh`/`auth`, which the browser generates and
 * only the browser holds. That is a property of the protocol rather than a
 * decision, and it is the reason a push carries "a payroll needs approving"
 * rather than the figure — a notification is drawn by the operating system, on
 * a screen that may be locked.
 */

export type ApiPushKey = {
  /** False when no VAPID key is set on the server. */
  configured: boolean;
  /** base64url. Not secret — every subscribing browser receives it. */
  publicKey: string | null;
};

export type ApiPushDevice = {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  /** The push service said this browser has unsubscribed. */
  gone: boolean;
};

const signalOf = (signal?: AbortSignal) => (signal ? { signal } : {});

export const pushApi = {
  key: (signal?: AbortSignal) =>
    request<ApiPushKey>("/push/key", signalOf(signal)),

  devices: (signal?: AbortSignal) =>
    request<ApiPushDevice[]>("/push/subscriptions", signalOf(signal)),

  subscribe: (body: {
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string;
  }) =>
    request<{ subscribed: boolean }>("/push/subscriptions", {
      method: "POST",
      body,
    }),

  /**
   * By endpoint, not by id.
   *
   * The browser knows its own endpoint and has no reason to know our row id —
   * and this is what sign-out calls, where there is no screen to have looked
   * one up.
   */
  unsubscribe: (endpoint: string) =>
    request<{ removed: number }>("/push/unsubscribe", {
      method: "POST",
      body: { endpoint },
    }),
};

/**
 * A VAPID public key as the bytes `pushManager.subscribe` wants.
 *
 * `Uint8Array<ArrayBuffer>` rather than a bare `Uint8Array`: the DOM type is
 * `BufferSource`, which excludes a view over a `SharedArrayBuffer`, and
 * `Uint8Array.from` produces the wider type. Allocating the buffer first is what
 * makes it the narrow one.
 */
export function applicationServerKey(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** An `ArrayBuffer` from the browser's subscription, as base64url. */
export function toBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
