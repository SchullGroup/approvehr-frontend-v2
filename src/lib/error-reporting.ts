import {
  registerErrorReporter,
  reportError,
  type ErrorContext,
} from "./report-error";

/**
 * The adapter behind `report-error.ts`, and the global handlers nothing had.
 *
 * ## Two gaps, and the second is the bigger one
 *
 * `registerErrorReporter` had **no callers**, so `reportError` logged to the
 * console and stopped. And only React's error boundaries ever called it: an
 * uncaught `TypeError` in an event handler, or a rejected promise nobody
 * awaited, reached nothing at all. Those are the majority of what actually
 * breaks in a browser, and in production they were invisible.
 *
 * ## Why this is not a vendor SDK
 *
 * The backlog said Sentry. This posts a small JSON body to whatever
 * `NEXT_PUBLIC_ERROR_REPORT_URL` names — a Sentry tunnel, a collector, a
 * Lambda — and that is a deliberate choice rather than an avoidance:
 *
 * - a vendor SDK cannot be **verified** here. It needs a real DSN and a real
 *   project, and shipping an unconfigured one would be the seam's own warning
 *   about a green Paid button that moved no money;
 * - `@sentry/nextjs` brings a build plugin, source-map upload and a wrapped
 *   config. That is a deployment decision with a bill attached, and it is the
 *   user's to make;
 * - the seam takes a vendor adapter just as easily. `registerErrorReporter`
 *   accepts any function; swapping this for `Sentry.captureException` is one
 *   line and nothing else in the app moves. **That was the whole point of the
 *   seam** and it stays true.
 *
 * Unset, nothing is registered and `errorReportingConfigured()` answers false —
 * which is a state a settings screen can state honestly rather than a service
 * that silently swallows.
 */

/** Where reports go. Unset in every environment until somebody sets it. */
const ENDPOINT = process.env["NEXT_PUBLIC_ERROR_REPORT_URL"];

/**
 * The most reports one page will send.
 *
 * A render loop produces thousands of identical errors a second. Without a cap
 * the first customer to hit one turns their own bad afternoon into an outage of
 * the collector — and the hundredth copy of a stack trace says nothing the
 * first did not.
 */
const MAX_PER_PAGE = 5;

/**
 * Shapes that must never leave the browser inside a crash report.
 *
 * A stack trace is read by whoever has access to the reporting tool, which is a
 * wider set of people than the ones allowed to see a payslip — the same
 * argument `lib/audit.ts` makes on the API. An error message frequently carries
 * whatever was being processed when it threw, so this is a redaction rather
 * than a rule somebody has to remember.
 *
 * Deliberately narrow. Redacting anything that *might* be personal would strip
 * the message down to nothing and leave a report nobody can act on; these are
 * the four shapes this product actually handles.
 */
const REDACTIONS: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]"],
  /* An RSA pension PIN: PEN followed by nine digits. */
  [/\bPEN\d{9}\b/g, "[pension-pin]"],
  /* A NUBAN account number. Ten digits standing alone — bounded, so an ISO
     timestamp or a kobo figure inside a longer number is left alone. */
  [/\b\d{10}\b/g, "[account-number]"],
  /* A bearer token, which turns up in a message when a fetch wrapper throws. */
  [/\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[token]"],
];

/** Applied to the message and the stack, never to the context keys. */
export function redact(text: string): string {
  let out = text;
  for (const [pattern, replacement] of REDACTIONS)
    out = out.replace(pattern, replacement);
  return out;
}

export type ErrorReport = {
  message: string;
  stack: string | null;
  /** The route pattern, the digest, and nothing personal. */
  context: ErrorContext;
  /** Which build produced it, so a fixed crash can be told from a live one. */
  release: string | null;
  at: string;
  /** The page, without a query string — an id in a URL is a record. */
  page: string;
};

/** Built and redacted here so the gate can assert on it without a network. */
export function buildReport(
  error: Error,
  context: ErrorContext,
  page: string,
): ErrorReport {
  return {
    message: redact(error.message),
    stack: error.stack ? redact(error.stack) : null,
    context,
    release: process.env["NEXT_PUBLIC_BUILD_ID"] ?? null,
    at: new Date().toISOString(),
    /* Path only. `?employeeId=…` is a record, and a crash report is not the
       place for one. */
    page,
  };
}

let sent = 0;

/**
 * Wire the reporter and the two global handlers.
 *
 * Idempotent, because it is called from a mounted component and React may run
 * an effect twice. Returns a teardown so the component can remove the handlers
 * it added and nothing leaks between mounts.
 */
export function startErrorReporting(): () => void {
  if (typeof window === "undefined") return () => {};

  if (ENDPOINT) {
    registerErrorReporter((error, context) => {
      if (sent >= MAX_PER_PAGE) return;
      sent += 1;
      const body = JSON.stringify(
        buildReport(error, context, window.location.pathname),
      );
      /* `keepalive` so a report survives the navigation that often follows a
         crash. No retry and no queue, per `report-error.ts`'s own rule: a
         reporter that cannot deliver drops it, and the console kept it. */
      void fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {
        /* Reporting the failure to report is a loop. */
      });
    });
  }

  /* These two are the gap. React's boundaries never see them: an uncaught
     handler error and a rejected promise nobody awaited are most of what
     actually breaks, and neither reached `reportError` before. */
  const onError = (event: ErrorEvent) => {
    reportError(event.error ?? event.message, {
      route: window.location.pathname,
    });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    reportError(event.reason, {
      route: window.location.pathname,
      kind: "unhandled-rejection",
    });
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
