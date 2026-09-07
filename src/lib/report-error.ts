/**
 * Where a crash goes.
 *
 * ## The gap this closes
 *
 * `app/error.tsx` said it plainly: *"there is no error-tracking service wired
 * into this repo, and pretending to send one would be the green Paid button
 * that moved no money"*. That was the right instinct and the right sentence,
 * and it left the product in a state where a render crash in production is
 * invisible unless a customer troubles themselves to report it — which most do
 * not; they close the tab.
 *
 * So this is the seam, in the shape `modules/auth/delivery.ts` and
 * `modules/payments/provider.ts` already established on the API side: **one
 * registration function, one accessor, and behaviour that is obviously honest
 * when nothing is registered.** Adding a provider later is one adapter and one
 * call to `registerErrorReporter` — no error boundary changes, no call sites
 * move.
 *
 * ## What it deliberately does not do
 *
 * It does not queue, retry or persist. A reporter that cannot deliver drops the
 * report, and the console keeps it either way. Buffering crashes in
 * `localStorage` to send later is a way of turning one bad afternoon into a
 * storm against a service that has just come back up, and it puts a customer's
 * stack traces somewhere nobody audits.
 *
 * It also never throws. A reporter that breaks while reporting a break would
 * replace a useful error with a useless one, and the boundary calling it is
 * already the last thing standing between the reader and a blank page.
 *
 * ## Personal data
 *
 * `context` is for identifiers and route names, never for records. Nothing here
 * should carry a salary, a bank account, a pension PIN or somebody's name —
 * same rule `lib/audit.ts` applies on the API, and for the same reason: a crash
 * report is read by whoever has access to the reporting tool, which is a
 * different and usually wider set of people than the ones allowed to see a
 * payslip.
 */

export type ErrorContext = {
  /** Where it happened — a route pattern, never a URL with ids in it. */
  route?: string;
  /** Next's own error digest, which is the key to the server-side log line. */
  digest?: string;
  /** Anything else small and non-personal. */
  [key: string]: string | number | boolean | undefined;
};

export type ErrorReporter = (error: Error, context: ErrorContext) => void;

let reporter: ErrorReporter | null = null;

/**
 * Register the reporter. Called once, from a provider adapter.
 *
 * Deliberately not an environment variable read here: which service is in use
 * is a deployment decision, and this module should not need editing when it
 * changes.
 */
export function registerErrorReporter(next: ErrorReporter): void {
  reporter = next;
}

/** True when something is actually listening. For a settings screen to read. */
export function errorReportingConfigured(): boolean {
  return reporter !== null;
}

/**
 * Report a crash.
 *
 * The console line happens either way and comes first, so a developer with the
 * tab open sees it whether or not a service is wired — and so the last thing
 * before an unreachable reporter is still a record somebody can read.
 */
export function reportError(error: unknown, context: ErrorContext = {}): void {
  const real =
    error instanceof Error ? error : new Error(String(error ?? "unknown error"));

  console.error("Rendering failed:", real, context);

  if (!reporter) return;
  try {
    reporter(real, context);
  } catch (failed) {
    /* The reporter broke while reporting. Say so once, plainly, and never let
       it reach the boundary that called us. */
    console.error("The error reporter itself failed:", failed);
  }
}
