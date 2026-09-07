import { buildReport, redact } from "../src/lib/error-reporting";

/**
 * What must never leave the browser inside a crash report.
 *
 * ## Why this is gated rather than documented
 *
 * `report-error.ts` already says, in prose, that a report must not carry a
 * salary, a bank account or somebody's name. Prose is not a check — and the
 * thing that carries them is not the `context` a developer fills in
 * deliberately, it is the **error message**, which frequently contains whatever
 * was being processed when it threw. `Cannot read properties of undefined
 * (reading 'x') on 0123456789` is an account number in a stack trace nobody
 * decided to send.
 *
 * A crash report is read by whoever has access to the reporting tool, which is
 * a wider set of people than the ones allowed to open a payslip. That is the
 * same argument `lib/audit.ts` makes on the API, and it is why this is a gate.
 *
 * ## The false-positive half matters as much
 *
 * A redaction that strips anything which might be personal leaves a report
 * nobody can act on, and then the reporting is worse than none — so the
 * assertions below check just as hard that ordinary text survives. A bare
 * ten-digit number is an account number; the same digits inside a longer one
 * are not, and an ISO timestamp is not.
 */

const results: [string, boolean][] = [];
const check = (name: string, ok: boolean) => results.push([name, ok]);

/* ------------------------------------------------------- what is removed */

check(
  "a work email is redacted",
  redact("failed for grace.effiong@schull.io") === "failed for [email]",
);
check(
  "a pension PIN is redacted",
  redact("bad PIN PEN100482913 on record") ===
    "bad PIN [pension-pin] on record",
);
check(
  "a NUBAN account number is redacted",
  redact("account 0123456789 rejected") === "account [account-number] rejected",
);
check(
  "a bearer token is redacted",
  redact(
    "Authorization eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.abc123 failed",
  ).includes("[token]"),
);
check(
  "several in one message are all redacted",
  redact("ada@x.io PEN123456789 0123456789") ===
    "[email] [pension-pin] [account-number]",
);

/* --------------------------------------------- what must survive intact */

check(
  "an ordinary message is untouched",
  redact("Cannot read properties of undefined (reading 'payslips')") ===
    "Cannot read properties of undefined (reading 'payslips')",
);
check(
  "an ISO timestamp survives",
  redact("failed at 2026-09-06T08:11:30.000Z") ===
    "failed at 2026-09-06T08:11:30.000Z",
);
check(
  "a long number is not mistaken for an account number",
  /* Sixteen digits is not a NUBAN, and the pattern is bounded so it does not
     eat a run of digits out of the middle of one. */
  redact("id 1234567890123456") === "id 1234567890123456",
);
check(
  "a kobo figure survives",
  redact("expected 866931297 got 0") === "expected 866931297 got 0",
);
check(
  "a route with an id survives, because a route is not a record",
  redact("/payroll/runs/01a05c09") === "/payroll/runs/01a05c09",
);

/* ------------------------------------------------------------ the report */

{
  const error = new Error("save failed for ada@x.io on account 0123456789");
  error.stack = "Error: save failed for ada@x.io\n    at save (/app/x.js:1:1)";
  const report = buildReport(error, { route: "/people/[id]" }, "/people/p-01");

  check(
    "the message is redacted in the report",
    !report.message.includes("ada@x.io"),
  );
  check(
    "the STACK is redacted too",
    !(report.stack ?? "").includes("ada@x.io"),
  );
  check(
    "the stack is otherwise intact, or the report is useless",
    (report.stack ?? "").includes("at save (/app/x.js:1:1)"),
  );
  check("the context travels", report.context["route"] === "/people/[id]");
  check(
    "the page is a path with no query string",
    report.page === "/people/p-01" && !report.page.includes("?"),
  );
  check(
    "it carries a timestamp",
    typeof report.at === "string" && report.at.length > 0,
  );
}

let failed = 0;
for (const [name, ok] of results) {
  if (!ok) failed += 1;
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}`);
}
console.log(
  `\nError reporting check: ${String(results.length - failed)}/${String(results.length)} hold.`,
);
if (failed > 0) process.exit(1);
