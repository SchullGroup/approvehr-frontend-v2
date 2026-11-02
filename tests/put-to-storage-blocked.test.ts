import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  putToStorage,
  UPLOAD_BLOCKED,
  UploadBlockedError,
  type PresignedUpload,
} from "@/lib/api/uploads";

/**
 * A file the browser refuses to send.
 *
 * A site built without `NEXT_PUBLIC_UPLOAD_ORIGINS` has a security policy that
 * does not name the storage address, so every upload is blocked before it
 * leaves. The request then fails with a bare `error` and nothing else, which
 * used to read "Check your connection and try again" however often somebody
 * did. The browser does say why, as a `securitypolicyviolation` event, and that
 * is the one cause this helper can name. Everything else keeps its old words.
 */

class FakeXhr {
  static current: FakeXhr;
  status = 0;
  private listeners: Record<string, Array<() => void>> = {};
  upload = { addEventListener: vi.fn() };
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn(() => {
    FakeXhr.current = this;
  });
  addEventListener(type: string, fn: () => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  fire(type: string) {
    for (const fn of this.listeners[type] ?? []) fn();
  }
}

const URL_OF_STORAGE =
  "https://uploads.example.com/bucket/leave/key?X-Amz-Signature=abc";
const presigned: PresignedUpload = {
  key: "leave/key",
  url: URL_OF_STORAGE,
  expiresAt: "2026-11-02T10:00:00.000Z",
  maxBytes: 5 * 1024 * 1024,
  headers: { "Content-Type": "application/pdf" },
};
const file = () =>
  new File([new Uint8Array(10)], "certificate.pdf", {
    type: "application/pdf",
  });

/** What a browser dispatches when it blocks a request. */
function violation(over: {
  blockedURI?: string;
  violatedDirective?: string;
  effectiveDirective?: string;
}) {
  document.dispatchEvent(
    Object.assign(new Event("securitypolicyviolation"), {
      blockedURI: URL_OF_STORAGE,
      violatedDirective: "connect-src",
      effectiveDirective: "connect-src",
      ...over,
    }),
  );
}

/** Starts an upload and returns it settled-so-far, so a rejection is never unhandled. */
function start() {
  const outcome = putToStorage(file(), presigned).then(
    () => ({ ok: true as const }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  return { xhr: FakeXhr.current, outcome };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a request this site's own policy blocks", () => {
  it("says the site is not set up for it, and not that the connection dropped", async () => {
    const { xhr, outcome } = start();
    violation({});
    xhr.fire("error");
    await vi.advanceTimersByTimeAsync(200);
    const result = await outcome;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(UploadBlockedError);
    expect((result.error as Error).message).toBe(UPLOAD_BLOCKED);
    expect(UPLOAD_BLOCKED).not.toMatch(/check your connection/i);
    expect(UPLOAD_BLOCKED).toMatch(/trying again will not help/i);
  });

  it("is still named when the browser reports the block after the request's own error", async () => {
    const { xhr, outcome } = start();
    xhr.fire("error");
    await vi.advanceTimersByTimeAsync(40);
    violation({});
    await vi.advanceTimersByTimeAsync(200);
    const result = await outcome;
    expect(!result.ok && result.error).toBeInstanceOf(UploadBlockedError);
  });

  it("is named by the effective directive where the policy only has a default-src", async () => {
    const { xhr, outcome } = start();
    violation({
      violatedDirective: "default-src",
      effectiveDirective: "connect-src",
    });
    xhr.fire("error");
    await vi.advanceTimersByTimeAsync(200);
    const result = await outcome;
    expect(!result.ok && result.error).toBeInstanceOf(UploadBlockedError);
  });

  it("is named when the browser gives only the origin of what it blocked", async () => {
    const { xhr, outcome } = start();
    violation({ blockedURI: "https://uploads.example.com" });
    xhr.fire("error");
    await vi.advanceTimersByTimeAsync(200);
    const result = await outcome;
    expect(!result.ok && result.error).toBeInstanceOf(UploadBlockedError);
  });
});

describe("a failure that is not that", () => {
  it("still reads as the connection when nothing says otherwise", async () => {
    const { xhr, outcome } = start();
    xhr.fire("error");
    await vi.advanceTimersByTimeAsync(200);
    const result = await outcome;
    expect(!result.ok && result.error).not.toBeInstanceOf(UploadBlockedError);
    expect(!result.ok && (result.error as Error).message).toBe(
      "The upload did not finish. Check your connection and try again.",
    );
  });

  it("is not blamed on the policy because the page prefetched somewhere else it also refuses", async () => {
    const { xhr, outcome } = start();
    violation({ blockedURI: "https://approvehr.io/privacy" });
    xhr.fire("error");
    await vi.advanceTimersByTimeAsync(200);
    const result = await outcome;
    expect(!result.ok && result.error).not.toBeInstanceOf(UploadBlockedError);
  });

  it("is not blamed on the policy for another kind of block on the same address", async () => {
    const { xhr, outcome } = start();
    violation({ violatedDirective: "img-src", effectiveDirective: "img-src" });
    xhr.fire("error");
    await vi.advanceTimersByTimeAsync(200);
    const result = await outcome;
    expect(!result.ok && result.error).not.toBeInstanceOf(UploadBlockedError);
  });

  it("leaves a refusal by storage as it was", async () => {
    const { xhr, outcome } = start();
    xhr.status = 403;
    xhr.fire("load");
    const result = await outcome;
    expect(!result.ok && (result.error as Error).message).toBe(
      "The file could not be stored. Try attaching it again.",
    );
  });

  it("leaves a stopped upload as it was", async () => {
    const { xhr, outcome } = start();
    xhr.fire("abort");
    const result = await outcome;
    expect(!result.ok && (result.error as Error).message).toBe(
      "The upload was stopped.",
    );
  });

  it("resolves on a 2xx", async () => {
    const { xhr, outcome } = start();
    xhr.status = 200;
    xhr.fire("load");
    expect(await outcome).toEqual({ ok: true });
  });
});

describe("listening for the reason", () => {
  it("stops once the request has finished, however it finished", async () => {
    const remove = vi.spyOn(document, "removeEventListener");
    const first = start();
    first.xhr.status = 200;
    first.xhr.fire("load");
    await first.outcome;
    const second = start();
    second.xhr.fire("abort");
    await second.outcome;
    const third = start();
    third.xhr.fire("error");
    await vi.advanceTimersByTimeAsync(200);
    await third.outcome;
    const stopped = remove.mock.calls.filter(
      ([type]) => type === "securitypolicyviolation",
    );
    expect(stopped).toHaveLength(3);
  });

  it("does not let a block from one upload name the next one's failure", async () => {
    const first = start();
    violation({});
    first.xhr.fire("error");
    await vi.advanceTimersByTimeAsync(200);
    await first.outcome;
    const second = start();
    second.xhr.fire("error");
    await vi.advanceTimersByTimeAsync(200);
    const result = await second.outcome;
    expect(!result.ok && result.error).not.toBeInstanceOf(UploadBlockedError);
  });
});
