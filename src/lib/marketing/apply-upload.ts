import { API_URL, parseRetryAfter, waitPhrase } from "@/lib/marketing/careers";
import {
  mediaTypeOf,
  refuseFile,
  type FileProfile,
} from "@/lib/marketing/apply-files";
import type { UploadedFile } from "@/lib/marketing/apply-form";

/**
 * Getting one file from an applicant's phone into storage.
 *
 * ## The flow, and why the browser does the second half
 *
 * 1. Ask the API for an upload address for this advert (`upload-url`), naming the
 *    file's name, type and size. The API refuses a wrong type or an oversize file
 *    here, with a sentence, before a byte has moved.
 * 2. `PUT` the file to that address, **directly to storage**, with exactly the
 *    content type that was asked for. The API never carries the bytes, which is
 *    what lets a hundred applicants upload at once without the API noticing.
 * 3. Hand the `key` back. It goes into the application, and the API checks the
 *    object really is there, is the right type and belongs to this advert.
 *
 * ## XHR for the second step, `fetch` for the first
 *
 * `fetch` cannot report how much of a request body has gone. A person on a slow
 * connection uploading a 12 MB scan needs to see it moving, or they will press
 * Send twice, so the `PUT` uses `XMLHttpRequest` and its upload `progress` event.
 *
 * ## Every failure says what to do
 *
 * `retryable` is the one fact the form needs: true means "the same file may
 * work if you press Try again" (the connection dropped, the link expired,
 * storage hiccuped), false means "this file will not be accepted, choose
 * another". A cancelled upload is neither and says so with `cancelled`.
 */

export type UploadOutcome =
  | { ok: true; file: UploadedFile }
  | {
      ok: false;
      message: string;
      retryable: boolean;
      cancelled?: boolean;
    };

export type UploadRequest = {
  org: string;
  roleSlug: string;
  file: File;
  profile: FileProfile;
  /** 0 to 1. Called as bytes leave the browser. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

type UploadTarget = {
  key: string;
  url: string;
  maxBytes?: number;
};

const CONNECTION_DROPPED =
  "The connection dropped before the file arrived. Check your signal and try again.";

/** Longest a single `PUT` may run: 25 MB over a poor mobile link is minutes. */
const PUT_TIMEOUT_MS = 15 * 60 * 1000;

async function requestTarget(
  request: UploadRequest,
): Promise<
  | { ok: true; target: UploadTarget }
  | { ok: false; message: string; retryable: boolean; cancelled?: boolean }
> {
  if (!API_URL) {
    return {
      ok: false,
      message: "This page cannot take files yet.",
      retryable: false,
    };
  }
  try {
    const response = await fetch(
      `${API_URL}/careers/public/${encodeURIComponent(request.org)}/${encodeURIComponent(request.roleSlug)}/upload-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: request.file.name,
          contentType: mediaTypeOf(request.file),
          sizeBytes: request.file.size,
        }),
        ...(request.signal ? { signal: request.signal } : {}),
      },
    );
    const payload = (await response.json().catch(() => null)) as {
      data?: UploadTarget;
      error?: { message?: string; retryAfterSeconds?: number };
    } | null;

    if (response.ok && payload?.data?.url && payload.data.key)
      return { ok: true, target: payload.data };

    if (response.status === 429) {
      const wait =
        parseRetryAfter(response.headers.get("Retry-After")) ??
        (typeof payload?.error?.retryAfterSeconds === "number" &&
        payload.error.retryAfterSeconds > 0
          ? Math.ceil(payload.error.retryAfterSeconds)
          : null);
      return {
        ok: false,
        message:
          payload?.error?.message?.trim() ||
          `Too many uploads from your network. Try again in ${waitPhrase(wait)}.`,
        retryable: true,
      };
    }
    if (response.status >= 500) {
      return {
        ok: false,
        message:
          "The upload could not start, and the fault is ours. Try again in a minute.",
        retryable: true,
      };
    }
    return {
      ok: false,
      message:
        payload?.error?.message?.trim() ||
        "That file could not be uploaded. Choose another.",
      retryable: false,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      return {
        ok: false,
        message: "Upload cancelled.",
        retryable: true,
        cancelled: true,
      };
    return { ok: false, message: CONNECTION_DROPPED, retryable: true };
  }
}

/** `PUT` the file to its address and report progress. Resolves; never throws. */
function putToStorage(
  target: UploadTarget,
  file: File,
  onProgress: ((fraction: number) => void) | undefined,
  signal: AbortSignal | undefined,
): Promise<
  | { ok: true }
  | { ok: false; message: string; retryable: boolean; cancelled?: boolean }
> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const finish = (
      outcome:
        | { ok: true }
        | {
            ok: false;
            message: string;
            retryable: boolean;
            cancelled?: boolean;
          },
    ) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      resolve(outcome);
    };
    const onAbort = () => {
      xhr.abort();
      finish({
        ok: false,
        message: "Upload cancelled.",
        retryable: true,
        cancelled: true,
      });
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort);

    xhr.open("PUT", target.url);
    /* Exactly what was asked for when the address was issued: the address is
       signed for this header and for nothing else. The browser adds the length. */
    xhr.setRequestHeader("Content-Type", mediaTypeOf(file));
    xhr.timeout = PUT_TIMEOUT_MS;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0)
        onProgress?.(Math.min(1, event.loaded / event.total));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        finish({ ok: true });
      } else if (xhr.status === 403 || xhr.status === 400) {
        finish({
          ok: false,
          message:
            "The upload link ran out before the file got there. Try again and it will ask for a new one.",
          retryable: true,
        });
      } else {
        finish({
          ok: false,
          message: "Storage did not accept the file. Try again in a minute.",
          retryable: true,
        });
      }
    };
    xhr.onerror = () =>
      finish({ ok: false, message: CONNECTION_DROPPED, retryable: true });
    xhr.ontimeout = () =>
      finish({ ok: false, message: CONNECTION_DROPPED, retryable: true });
    xhr.onabort = () =>
      finish({
        ok: false,
        message: "Upload cancelled.",
        retryable: true,
        cancelled: true,
      });

    xhr.send(file);
  });
}

/**
 * Upload one file for an advert. Checks the file first so a wrong one costs
 * nothing, then the two steps above. Never throws.
 */
export async function uploadFile(
  request: UploadRequest,
): Promise<UploadOutcome> {
  const refusal = refuseFile(request.file, request.profile);
  if (refusal) return { ok: false, message: refusal, retryable: false };

  const issued = await requestTarget(request);
  if (!issued.ok) return issued;

  const sent = await putToStorage(
    issued.target,
    request.file,
    request.onProgress,
    request.signal,
  );
  if (!sent.ok) return sent;

  return {
    ok: true,
    file: {
      key: issued.target.key,
      name: request.file.name,
      sizeBytes: request.file.size,
    },
  };
}
