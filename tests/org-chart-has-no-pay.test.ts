import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The org chart shows no money, and this is a source check on purpose.
 *
 * ## Why the rule exists
 *
 * A department total is an aggregate everywhere except where it matters: "1
 * person here · ₦550,000.00 a month" **is that person's salary, printed beside
 * their name**, and two people is a subtraction away. The org chart is the one
 * screen that gets projected in a standup and read over a shoulder, so the
 * reader who holds `VIEW_SALARIES` is not the only person who sees what is on
 * it.
 *
 * ## Why source and not a render
 *
 * The API's own `walk-payroll` script found pay riding along on the "an org
 * chart is not privileged" argument in **three separate routes**. The screen
 * was the fourth instance: the payload was clean and the component put the
 * money back from the departments endpoint, which still carries
 * `payrollKobo` — legitimately, because `/people/departments` is a screen
 * somebody opens to look at cost.
 *
 * So the figure is still one import away, and the way it comes back is
 * somebody adding a line to a component, not somebody changing a permission. A
 * render test would need the whole screen mounted with a tree, a session, a
 * permission set and a drag context, and it would assert the absence of a
 * string in one fixture — passing happily for a two-person department while
 * leaking on a one-person one. Reading the file asserts the rule itself.
 */

const CHART = path.resolve(
  import.meta.dirname,
  "../src/app/(app)/people/org-chart/chart.tsx",
);

/**
 * Comments out, code in.
 *
 * The header of the file under test explains the rule and quotes the example
 * that motivates it, naira sign and all — so a naive search finds the very
 * documentation that exists to prevent the leak. Prose may discuss money; code
 * may not render it. Same split `scripts/verify-demo.ts` makes with its own
 * `withoutComments`, and for the same reason.
 */
const withoutComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("no pay on the org chart", () => {
  const raw = readFileSync(CHART, "utf8");
  const source = withoutComments(raw);

  it("renders no money component", () => {
    expect(source).not.toMatch(/<Money\b/);
  });

  it("does not read a payroll figure", () => {
    /* `payrollKobo` may still appear in prose — the header explains at length
       why it is absent — so this looks for a *read* of it rather than the word.
       A mention is documentation; `department.payrollKobo` is a leak. */
    expect(source).not.toMatch(/\.payrollKobo/);
  });

  it("formats no currency by hand", () => {
    /* The other way it comes back: skipping `Money` and writing ₦ or a
       `toLocaleString` with a currency, which no amount of gating on the
       component would catch. */
    expect(source).not.toMatch(/₦/);
    expect(source).not.toMatch(/currency:\s*["']NGN["']/);
  });

  it("still reads the file it thinks it does", () => {
    /* A path that stops resolving would make every assertion above pass on an
       empty string. This is the assertion that keeps the other three honest. */
    expect(source).toMatch(/export function OrgChartScreen/);
    expect(source.length).toBeGreaterThan(2000);
  });

  it("strips comments without stripping the code", () => {
    /* And this keeps *that* honest: a `withoutComments` that ate too much
       would leave nothing for the assertions to find, which is the same
       silent pass by another route. The header genuinely contains a naira
       sign, so the raw file must fail the check the stripped one passes. */
    expect(raw).toMatch(/₦/);
    expect(source).not.toMatch(/₦/);
    expect(source).toMatch(/departmentsApi\.tree/);
  });
});
