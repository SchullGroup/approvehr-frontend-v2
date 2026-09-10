"use client";

import { RotateCw } from "lucide-react";
import { Button, Callout } from "@/components/ui";
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

/**
 * The title, which is a different question from the advice.
 *
 * "Did not load" is a claim that something went wrong. A **403 is not that**:
 * the read reached the server, the server understood it, and it said no. The
 * body has always shown the API's own sentence for a refusal — it names the
 * permission — while the title above it said the request had failed, so the
 * two halves of one callout disagreed about what had happened.
 *
 * That mattered most where it fired: `/performance/history/[employeeId]` told
 * a payroll analyst "This person's score history did not load" directly above
 * "You can see your own record and the records of people who report to you."
 * Every screen in this product that gates a whole page words this correctly
 * already — "Attendance history is not part of your access", "You cannot view
 * payroll" — and only the shared panel did not.
 *
 * Worded without a copula on purpose: `subject` may be singular or plural
 * ("the audit log", "the article figures") and this has to read for both.
 */
function titleFor(error: unknown, subject: string): string {
  if (error instanceof ApiError && error.status === 403) {
    return `You cannot see ${subject}`;
  }
  return `${capitalise(subject)} did not load`;
}

/** True when the API wrote a sentence about this specific refusal. */
function apiSentenceIsBetter(error: ApiError): boolean {
  if (error.status === 403) return true;
  if (error.status === 409 || error.status === 422) return true;
  /* A validation failure names the field. Nothing here can. */
  if (error.status === 400) return true;
  return false;
}

/**
 * The sentence `LoadFailure` would show, for the few places that need a string.
 *
 * A description prop, mostly. Exported rather than copied so a screen that
 * cannot render the component still says the same thing the component would —
 * the whole point of having one place that turns a failure into words.
 */
export function failureMessage(
  error: unknown,
  subject: string,
  missingMeans: MissingMeans = "record",
): string {
  return adviceFor(error, subject, missingMeans);
}

/**
 * What a 404 means for this screen.
 *
 * `"record"` — the thing had an id and is not there. The default, and right
 * for almost everything: an employee, a payroll run, a requisition somebody
 * followed a stale link to.
 *
 * `"module"` — the screen asked for a *list* and the route itself is absent,
 * which does not mean anybody deleted anything. It means this deployment does
 * not have that part of the API yet.
 *
 * The distinction is not pedantry. Signatures and One-to-ones sat in the
 * sidebar of a production deployment whose API did not carry those modules, and
 * both said **"is not here, it may have been removed"** — so the product
 * looked broken, and the feedback was "why did we add signatures, I can't find
 * any flows". A gap that says it is a gap is a different conversation from one
 * that reads as a bug.
 */
export type MissingMeans = "record" | "module";

function adviceFor(
  error: unknown,
  subject: string,
  missingMeans: MissingMeans = "record",
): string {
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
      return missingMeans === "module"
        ? `${capitalise(subject)} is not switched on for this deployment yet. ` +
            "Nothing is missing from your company's records — the part of the " +
            "service that answers for it has not been released here. Tell your " +
            "administrator if you were expecting it."
        : `${capitalise(subject)} is not here, it may have been removed.`;
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

/**
 * Whether pressing "Try again" could plausibly change the answer.
 *
 * The advice above tells somebody to try again for five of these classes and,
 * until now, gave them nothing to try with — a sentence naming an action the
 * screen does not offer, which is the shape of dead end this component was
 * created to remove. It was the last one left, and the widest: forty screens
 * render this.
 *
 * The list is short on purpose. A 403 will refuse identically for as long as
 * the permission is missing, a 404 will stay missing, and a 409 or a 422 is a
 * refusal about the request rather than a failure of it — offering a retry on
 * any of those teaches people to press a button that cannot work, which is the
 * same defect one step along. Retrying an ended session is worse than useless:
 * the honest action there is signing in, which the advice already says.
 *
 * So: no connection, a timeout, a rate limit, and anything 5xx. Those are the
 * four where the request was sound and the moment was wrong.
 */
function retryCouldHelp(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  if (error.status === 0) return true;
  if (error.status === 408 || error.status === 504) return true;
  if (error.status === 429) return true;
  return error.status >= 500;
}

export function LoadFailure({
  /**
   * What did not arrive, as a noun phrase that fits mid-sentence and starts
   * lower case: `"the timesheet"`, `"your roles"`, `"this person's record"`.
   * It is read twice — once as the title and once inside the advice — so a
   * phrase rather than a sentence is what works.
   */
  subject,
  error,
  /**
   * Load the thing again. Usually the store's own `reload`.
   *
   * Optional because a few call sites genuinely have nothing to re-run — a
   * value handed down as a prop, or a read whose hook exposes no reload. Where
   * one exists it should be passed: the advice already tells somebody to try
   * again, and a button is the difference between that being an instruction and
   * being a dead end.
   */
  onRetry,
  /**
   * What a 404 means here. `"module"` for a screen that lists a whole module
   * and can therefore only 404 because the API does not carry it — see
   * `MissingMeans`.
   */
  missingMeans = "record",
  /** Extra guidance the screen itself knows, shown under the advice. */
  children,
}: {
  subject: string;
  error: unknown;
  onRetry?: (() => void) | undefined;
  missingMeans?: MissingMeans;
  children?: React.ReactNode;
}) {
  if (!error) return null;
  return (
    <Callout tone="danger" title={titleFor(error, subject)}>
      <p>{adviceFor(error, subject, missingMeans)}</p>
      {children ? <div className="mt-2">{children}</div> : null}
      {onRetry && retryCouldHelp(error) && (
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={onRetry}
        >
          <RotateCw aria-hidden="true" className="size-3.5" />
          Try again
        </Button>
      )}
    </Callout>
  );
}
