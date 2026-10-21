"use client";

import { useState } from "react";
import { RotateCw } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { kindOf, retryCouldHelp, serverSentence } from "@/lib/api/failure";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { Callout } from "./card";
import { Skeleton } from "./feedback";

/**
 * One rule for a screen that waits on something, and what it may say meanwhile.
 *
 * ## The rule
 *
 * | The read is… | The screen shows | and never |
 * |---|---|---|
 * | **loading** | skeletons | a count, a ₦0.00, an empty state |
 * | **failed** | the failure card | the empty state, or any count |
 * | **answered** | the content, or its empty state | — |
 *
 * ## Why it is a rule and not a style
 *
 * It is the product's own "absent is not zero" rule turned on its own screens.
 * A visual audit found six that said something false while the data had not
 * arrived — Payslips: *"this month has no payslips on it"*; Attendance: *"You
 * have not clocked in today"* beside a live Clock in button; Approvals:
 * *"Nothing waiting on you"* and ₦0.00 at stake — and about ten more that,
 * after a failed request, showed the failure callout **and then an empty state
 * with a call to action under it** ("No adverts yet", "Nothing here: add
 * somebody"). Every one of those is a screen asserting a fact about the
 * company's records that it does not know.
 *
 * Each was written by somebody who handled `loading`, `error` and `rows.length
 * === 0` correctly in isolation. The defect is the **combination**: an empty
 * list is the right answer to "nothing came back" and the wrong one to "we
 * have not asked yet" or "the asking failed", and three booleans checked in
 * the order a component happens to read them do not say which one is true.
 * So the decision is made once, here, by `loadPhase`, and a screen asks it.
 *
 * ## How to use it
 *
 * ```tsx
 * <LoadState loading={loading} error={error} onRetry={reload} subject="the payslips">
 *   <Stats counts={counts} />
 *   {rows.length === 0 ? <EmptyState … /> : <Table … />}
 * </LoadState>
 * ```
 *
 * The children are the part that may contain a count or an empty state, and they
 * are **not rendered** until the read has answered. Anything that is true
 * whatever the answer — the page header, a filter, the Add button — stays
 * outside.
 *
 * Pass `hasData` when a reload should keep what is already on screen: a list
 * that refetches after somebody saves a row should not collapse to skeletons
 * under their cursor. A failure still wins over stale data, because a count
 * from before a failed refresh is a claim nobody can vouch for.
 *
 * ## The failure card
 *
 * What happened, what is safe, what usually fixes it, and a button — the shape
 * the sign-in screen's "service is not answering" state already has. The
 * wording for each class of failure, and the rule that the API's own sentence is
 * shown verbatim wherever it wrote one about *this* refusal, are carried over
 * unchanged from `LoadFailure`, which lived in `components/portal/` and is now
 * re-exported from there so its hundred-odd importers did not have to move.
 */

/* -------------------------------------------------------------------------- */
/* The decision                                                               */
/* -------------------------------------------------------------------------- */

export type LoadPhase = "loading" | "failed" | "ready";

/**
 * What a screen may say, given what it knows about its read.
 *
 * - A read in flight with nothing to show is `loading`, whatever else is true —
 *   and so is a retry after a failure, even with old data on screen, because it
 *   should read as "trying" and not as the old failure.
 * - Anything else with an error is `failed`, even if old data is on screen.
 * - Otherwise `ready`, and only then may a screen print a count or an empty state.
 *
 * Pure, so the rule can be asserted rather than believed.
 */
export function loadPhase({
  loading,
  error,
  hasData = false,
}: {
  loading: boolean;
  error: unknown;
  hasData?: boolean;
}): LoadPhase {
  if (loading && (!hasData || error)) return "loading";
  if (error) return "failed";
  return "ready";
}

/**
 * Whether this read has answered at least once — the right `hasData` for a
 * screen whose controls live inside the loaded part.
 *
 * A filter, a scope switch or a sort changes the request, `loading` goes true
 * again, and a screen that treated that as "nothing yet" would collapse to
 * skeletons and take the very control somebody is pressing with it. What is on
 * screen after a first answer is that answer, not a claim made without one, so
 * it stays until the next one lands; a failure still replaces it (see
 * `loadPhase`).
 *
 * Derived during render rather than in an effect, which would be a synchronous
 * `setState` and a cascaded render.
 */
export function useHasAnswered(loading: boolean): boolean {
  const [answered, setAnswered] = useState(!loading);
  if (!loading && !answered) setAnswered(true);
  return answered;
}

/* -------------------------------------------------------------------------- */
/* The failure card                                                           */
/* -------------------------------------------------------------------------- */

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

const capitalise = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The title, which is a different question from the advice.
 *
 * "Did not load" is a claim that something went wrong. A **403 is not that**:
 * the read reached the server, the server understood it, and it said no. Worded
 * without a copula on purpose: `subject` may be singular or plural ("the audit
 * log", "the article figures") and this has to read for both.
 */
function titleFor(error: unknown, subject: string): string {
  if (error instanceof ApiError && error.status === 403) {
    return `You cannot see ${subject}`;
  }
  return `${capitalise(subject)} did not load`;
}

function adviceFor(
  error: unknown,
  subject: string,
  missingMeans: MissingMeans = "record",
): string {
  /* Where the API wrote a sentence about this refusal, it is the sentence.
     `serverSentence` is the shared rule — see `lib/api/failure.ts`. */
  const said = serverSentence(error);
  if (said) return said;

  switch (kindOf(error)) {
    case "offline":
      return (
        "The app cannot reach the server. Check your internet connection, " +
        "then try again."
      );
    case "session":
      return "Your session has ended. Sign in again to carry on.";
    case "missing":
      return missingMeans === "module"
        ? `${capitalise(subject)} is not switched on here yet. ` +
            "Ask your administrator if you were expecting it."
        : `${capitalise(subject)} is not here, it may have been removed.`;
    case "timeout":
      return `The server took too long to send ${subject}. Try again in a moment.`;
    case "throttled":
      return "Too many requests at once. Wait a moment, then try again.";
    case "server":
      return (
        `Something went wrong on our side, so ${subject} did not load. Try ` +
        "again in a moment; if it keeps happening, tell your administrator."
      );
    default:
      /* "unknown" — not an ApiError at all. "refused" and "other" cannot reach
         here: both answer with the server's own sentence above. */
      return (
        `Something went wrong while loading ${subject}. Try again in a moment; ` +
        "if it keeps happening, tell your administrator."
      );
  }
}

/**
 * What is safe, for the failures where that is a true thing to say.
 *
 * A read changes nothing, so a read that failed has lost nothing — but saying so
 * to somebody who was just refused, or whose session ended, would be reassurance
 * for a problem they do not have. It is said where the likeliest worry is "did I
 * break something": the connection dropped, the server stumbled, the answer was
 * slow.
 */
function safeLine(error: unknown): string | null {
  switch (kindOf(error)) {
    case "offline":
    case "timeout":
    case "throttled":
    case "server":
    case "unknown":
      return "Nothing has been changed or lost.";
    default:
      return null;
  }
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
  /** What a 404 means here — see `MissingMeans`. */
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
  const safe = safeLine(error);
  return (
    <Callout tone="danger" title={titleFor(error, subject)}>
      <p>{adviceFor(error, subject, missingMeans)}</p>
      {safe && <p className="mt-1">{safe}</p>}
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

/* -------------------------------------------------------------------------- */
/* Skeletons                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The stat row, as shapes. Same grid as the real one, so the page does not jump
 * when the numbers arrive.
 */
export function StatsSkeleton({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4",
        className,
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border border-line bg-surface p-3.5 sm:p-5"
        >
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="mt-3 h-7 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Rows of a list, as shapes. */
export function ListSkeleton({
  rows = 5,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex flex-col gap-2.5 rounded-lg border border-line bg-surface p-4",
        className,
      )}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export type SkeletonVariant = "page" | "list" | "stats" | "table" | "detail";

function SkeletonFor({ variant }: { variant: SkeletonVariant }) {
  switch (variant) {
    case "stats":
      return <StatsSkeleton />;
    case "list":
      return <ListSkeleton />;
    case "table":
      return <ListSkeleton rows={7} />;
    case "detail":
      return (
        <div aria-hidden="true" className="flex flex-col gap-4">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      );
    default:
      return (
        <div aria-hidden="true" className="flex flex-col gap-6">
          <StatsSkeleton />
          <ListSkeleton />
        </div>
      );
  }
}

/* -------------------------------------------------------------------------- */
/* The boundary                                                               */
/* -------------------------------------------------------------------------- */

export type LoadStateProps = {
  /** The read has not answered. */
  loading: boolean;
  /** The read failed. Anything falsy means it did not. */
  error: unknown;
  /** What is being waited for, as `LoadFailure` wants it: "the payslips". */
  subject: string;
  onRetry?: (() => void) | undefined;
  missingMeans?: MissingMeans;
  /**
   * Something is already on screen from an earlier answer, so a reload keeps it
   * instead of collapsing to skeletons. See the header for why a failure still
   * wins.
   */
  hasData?: boolean;
  /**
   * Which shape of skeleton to hold the place while loading, or your own. The
   * default is a stat row over a list, which is most screens in this product.
   */
  skeleton?: SkeletonVariant | React.ReactNode;
  className?: string;
  /**
   * Rendered only once the read has answered — so anything in it that counts, or
   * says there is nothing, is true.
   */
  children: React.ReactNode;
};

const VARIANTS: readonly string[] = [
  "page",
  "list",
  "stats",
  "table",
  "detail",
];

export function LoadState({
  loading,
  error,
  subject,
  onRetry,
  missingMeans,
  hasData = false,
  skeleton = "page",
  className,
  children,
}: LoadStateProps) {
  const phase = loadPhase({ loading, error, hasData });

  if (phase === "failed") {
    return (
      <div className={className}>
        <LoadFailure
          subject={subject}
          error={error}
          onRetry={onRetry}
          {...(missingMeans ? { missingMeans } : {})}
        />
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className={className}
      >
        <span className="sr-only">Loading {subject}</span>
        {typeof skeleton === "string" && VARIANTS.includes(skeleton) ? (
          <SkeletonFor variant={skeleton as SkeletonVariant} />
        ) : (
          skeleton
        )}
      </div>
    );
  }

  return <>{children}</>;
}
