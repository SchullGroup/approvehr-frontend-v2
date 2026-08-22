"use client";

import { Callout } from "@/components/ui";
import { ApiError } from "@/lib/api/client";

/**
 * A read that failed, rendered as a sentence somebody can act on.
 *
 * ## Why this exists
 *
 * Thirty-five screens each carried their own version of this:
 *
 * ```tsx
 * <Callout tone="danger" title="Could not load the audit log">
 *   {trail.error.message}
 * </Callout>
 * ```
 *
 * Two things were wrong with it, and both only show up in front of a real
 * reader. *"Could not load the audit log"* is a **restatement of the blank
 * space** — the reader can already see nothing loaded; what they need is what to
 * do about it. And `error.message` was whatever came back, which for anything
 * that did not pass through the API's own error handler was
 * `Request failed with 502.` — a status code, on screen, to a payroll clerk.
 * (That string is gone; see `fallbackMessage` in `lib/api/client.ts`.)
 *
 * So: one component, and the title says **what is missing**, in the reader's
 * words, while the body says **what to do**. The two halves come from different
 * places on purpose — the caller knows what the panel was for, and only the
 * error knows why it failed.
 *
 * ## The advice is chosen by the class of failure, not by the code
 *
 * Because that is the granularity at which the advice actually differs:
 *
 * | | What the reader is told |
 * |---|---|
 * | no connection | check the connection, try again |
 * | session gone | sign in again |
 * | 403 | **the API's own sentence** — it names the permission; we do not |
 * | 404 | it is not here any more |
 * | 409 / 422 | **the API's own sentence** — it names the refusal |
 * | 429 | wait a moment |
 * | 5xx | ours, not yours; try again, then tell an administrator |
 *
 * Where the API wrote a sentence *about this situation* it is shown verbatim,
 * because paraphrasing a server message locally is how the two stop agreeing —
 * the same rule the performance screens follow for a no-appraiser message. Where
 * the API wrote nothing better than a category, this supplies the sentence.
 *
 * **No status code, no error code, no stack, ever.** `ApiError.status` is still
 * on the object for code that needs to branch; it does not reach a screen.
 *
 * ## When to use an empty state instead
 *
 * A read that succeeded and returned nothing is **not** a failure, and must not
 * render this. "No timesheet rows yet" and "the timesheet did not load" are
 * opposite facts, and showing the second for the first is the same class of
 * mistake as rendering 0 for an absent figure.
 */

/** True when the API wrote a sentence about this specific refusal. */
function apiSentenceIsBetter(error: ApiError): boolean {
  if (error.status === 403) return true;
  if (error.status === 409 || error.status === 422) return true;
  /* A validation failure names the field. Nothing here can. */
  if (error.status === 400) return true;
  return false;
}

function adviceFor(error: unknown, subject: string): string {
  if (!(error instanceof ApiError)) {
    return (
      `Something went wrong while loading ${subject}. Try again in a moment; ` +
      "if it keeps happening, tell your administrator."
    );
  }
  if (apiSentenceIsBetter(error)) return error.message;

  switch (true) {
    case error.status === 0:
      return (
        "The app cannot reach the server. Check your internet connection, " +
        "then try again."
      );
    case error.status === 401:
      return "Your session has ended. Sign in again to carry on.";
    case error.status === 404:
      return `${capitalise(subject)} is not here — it may have been removed.`;
    case error.status === 408 || error.status === 504:
      return `The server took too long to send ${subject}. Try again in a moment.`;
    case error.status === 429:
      return "Too many requests at once. Wait a moment, then try again.";
    case error.status >= 500:
      return (
        `Something went wrong on our side, so ${subject} did not load. Try ` +
        "again in a moment; if it keeps happening, tell your administrator."
      );
    default:
      /* Anything else the API did write a sentence for. Better than a guess. */
      return error.message;
  }
}

const capitalise = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1);

export function LoadFailure({
  /**
   * What did not arrive, as a noun phrase that fits mid-sentence and starts
   * lower case: `"the timesheet"`, `"your roles"`, `"this person's record"`.
   * It is read twice — once as the title and once inside the advice — so a
   * phrase rather than a sentence is what works.
   */
  subject,
  error,
  /** Extra guidance the screen itself knows, shown under the advice. */
  children,
}: {
  subject: string;
  error: unknown;
  children?: React.ReactNode;
}) {
  if (!error) return null;
  return (
    <Callout tone="danger" title={`${capitalise(subject)} did not load`}>
      <p>{adviceFor(error, subject)}</p>
      {children ? <div className="mt-2">{children}</div> : null}
    </Callout>
  );
}
