import { ApiError, buildUrl, tokens } from "./client";

/**
 * Fetching an endpoint that answers with a file rather than the JSON envelope.
 *
 * Two endpoints do this — the bank upload file and the three exports — and both
 * need the same four things: the bearer token, a session-expiry message that
 * says what to do, the server's own refusal read out of the error envelope when
 * one arrives, and a filename taken from `Content-Disposition`.
 *
 * It is here rather than copied because the third of those is the one that
 * matters and the easiest to get quietly wrong. `payments.bankFile`'s refusals
 * — "this batch has not been approved yet", "this batch no longer adds up" —
 * and the export's "this file does not add up" are the useful part of the
 * response, and a second copy that replaced them with "download failed" would
 * look like it worked.
 *
 * `request()` cannot serve these: it parses the body as JSON and would throw on
 * a perfectly good CSV.
 */

export type FileDownload = {
  filename: string;
  /** The file's text. Every file this API produces is CSV. */
  body: string;
};

/**
 * The filename the server asked for, or a fallback.
 *
 * A saved file with a name nobody recognises is a file nobody opens again, so
 * the fallback is a real stem rather than `download.csv`.
 */
export function filenameFrom(
  header: string | null,
  fallbackStem: string,
): string {
  const match = header?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  if (match?.[1]) return match[1];
  return `${fallbackStem.replace(/[^A-Za-z0-9._-]/g, "-")}.csv`;
}

export async function fetchFile(
  path: string,
  fallbackStem: string,
  /** Serialised by `buildUrl`, so a file request carries the JSON request's own filter. */
  query?: Record<string, string | number | boolean | undefined>,
  /** What to say when the server produced nothing and said nothing about why. */
  nothingProduced = "No file was produced.",
): Promise<FileDownload> {
  const access = tokens.access();
  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      headers: access ? { Authorization: `Bearer ${access}` } : {},
      /* A register moves the moment somebody is added. A cached spreadsheet is
         the kind of wrong that gets emailed to an accountant. */
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      0,
      "network_error",
      "Could not reach the server, so no file was produced.",
    );
  }

  if (response.status === 401) {
    throw new ApiError(
      401,
      "session_expired",
      "Your session has ended. Sign in again, then download the file.",
    );
  }

  if (!response.ok) {
    /* The refusal is the useful part. Read it out of the envelope rather than
       replacing it with a generic failure — the server knows which permission
       is missing or which figure does not reconcile, and nothing here does. */
    let message = nothingProduced;
    let code = "http_error";
    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string };
      };
      message = body.error?.message ?? message;
      code = body.error?.code ?? code;
    } catch {
      /* Not JSON. Keep the default. */
    }
    throw new ApiError(response.status, code, message);
  }

  return {
    filename: filenameFrom(
      response.headers.get("content-disposition"),
      fallbackStem,
    ),
    body: await response.text(),
  };
}
