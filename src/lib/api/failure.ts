import { ApiError } from "./client";

/**
 * What kind of failure this is — the one classification the whole app shares.
 *
 * ## Why this is separate from the words
 *
 * `components/portal/load-failure.tsx` already turns a failed **read** into a
 * sentence, and it does it well. What it could not do is lend that judgement to
 * a failed **write**, because its wording is baked in — "did not load", "while
 * loading" — and a save that is refused did not fail to load anything.
 *
 * So 126 write sites across 84 files each made the call themselves, and 89 of
 * them ended at the same hand-typed `"Something went wrong. Try again."`. That
 * is the same duplication `LoadFailure` was created to remove, one verb along.
 *
 * The fix is not a second `LoadFailure`. It is to notice that **the wording
 * differs between a read and a write and the classification does not**: a 403
 * names a permission whichever verb provoked it, a 409 is a refusal rather
 * than a fault either way, and retrying a 404 is futile in both directions.
 * This module is that shared half. `LoadFailure` keeps its own sentences and
 * `useAction` writes its own; neither decides *what happened* on its own any
 * more.
 *
 * Keep this file free of React and of wording. The moment a sentence lands
 * here, one of the two surfaces will want it phrased the other way and the
 * split stops holding.
 */
export type FailureKind =
  /** Never reached the server. */
  | "offline"
  /** 401 — the session is gone. */
  | "session"
  /** 400/403/409/422 — reached, understood, refused, and said why. */
  | "refused"
  /** 404 — not there. */
  | "missing"
  /** 408/504 — the server took too long. */
  | "timeout"
  /** 429 — too much at once. */
  | "throttled"
  /** 5xx — ours, not theirs. */
  | "server"
  /** An ApiError with a status none of the above claims. */
  | "other"
  /** Not an `ApiError` at all — a thrown string, a bug in our own code. */
  | "unknown";

/**
 * Narrow a caught `unknown` to an `ApiError`, or `null`.
 *
 * There are 111 hand-written copies of this ternary in `src/`. It is here so
 * the 112th is an import.
 */
export function asApiError(error: unknown): ApiError | null {
  return error instanceof ApiError ? error : null;
}

export function kindOf(error: unknown): FailureKind {
  const api = asApiError(error);
  if (!api) return "unknown";
  const { status } = api;
  if (status === 0) return "offline";
  if (status === 401) return "session";
  if (status === 400 || status === 403 || status === 409 || status === 422) {
    return "refused";
  }
  if (status === 404) return "missing";
  if (status === 408 || status === 504) return "timeout";
  if (status === 429) return "throttled";
  if (status >= 500) return "server";
  return "other";
}

/**
 * The API's own sentence, when the API wrote one **about this refusal**.
 *
 * This is the rule that must never be duplicated, because it is the one this
 * codebase restates in a dozen places: *paraphrasing a server message locally
 * is how the two stop agreeing.* A 403 names the permission that is missing, a
 * 422 names the field, a 409 names what it collided with — nothing on this side
 * knows any of that.
 *
 * `null` where the server said nothing better than a category, and the caller
 * should supply its own sentence.
 *
 * `"other"` returns the message too: an unrecognised status is one this file
 * has no opinion about, and the server's own words beat a guess.
 */
export function serverSentence(error: unknown): string | null {
  const api = asApiError(error);
  if (!api) return null;
  const kind = kindOf(api);
  return kind === "refused" || kind === "other" ? api.message : null;
}

/**
 * Whether trying the same thing again could plausibly change the answer.
 *
 * Short on purpose, and the reasoning is `LoadFailure`'s: a 403 refuses
 * identically for as long as the permission is missing, a 404 stays missing,
 * and a 409 or 422 is a refusal *about* the request rather than a failure *of*
 * it. Offering a retry on any of those teaches people to press a button that
 * cannot work.
 *
 * A non-`ApiError` gets `true`: we do not know what it was, and one retry is
 * cheaper than a dead end.
 */
export function retryCouldHelp(error: unknown): boolean {
  switch (kindOf(error)) {
    case "offline":
    case "timeout":
    case "throttled":
    case "server":
    case "unknown":
      return true;
    default:
      return false;
  }
}
