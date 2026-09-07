import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * The rules this product is sold on, checked where only a browser can see them.
 *
 * Every one of these is a defect class the codebase's own HANDOVER records
 * finding *in the browser* after `tsc`, lint and the build were all green:
 *
 * - **A control whose only outcome is a refusal.** "A button that returns 'that
 *   is refused' was a design failure two clicks earlier." A screen that cannot
 *   do something offline must say so and **not offer the button**.
 * - **A refusal is the server's own sentence**, not "something went wrong".
 * - **An absence is not a zero.** `₦0.00` where nothing was recorded is a wrong
 *   claim, and it is the claim that once paid a whole company nothing.
 *
 * These run in demo mode with no API, which is exactly the state in which a
 * dead control is easiest to ship: the developer has an API running.
 */

/** Screens whose whole module refuses without an API, and the sentence each shows. */
const REFUSING: [string, RegExp][] = [
  ["/people/one-on-ones", /one-to-one is a private conversation/i],
  ["/people/signatures", /signature record says a named person/i],
  ["/reports/builder", /report is a table somebody built/i],
];

test.describe("a screen that cannot act says so, and offers nothing that would fail", () => {
  for (const [route, refusal] of REFUSING) {
    test(`${route} explains itself rather than failing on a press`, async ({
      page,
    }) => {
      await signIn(page);
      await page.goto(route);

      /* The refusal, in the store's own words — not "could not load". */
      await expect(page.getByText(refusal).first()).toBeVisible();

      /* And nothing on the page that would only ever produce that refusal.
         Every button here is either absent or does something local. */
      const doomed = page.getByRole("button", {
        name: /^(Start one|Sign it|Run it|Save this report|Put one in the diary)$/,
      });
      expect(
        await doomed.count(),
        `${route} offers a control whose only outcome is a refusal`,
      ).toBe(0);
    });
  }
});

test.describe("a figure and its headcount agree", () => {
  test("a payroll with nobody on it does not also claim a total", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/payroll");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

    /* The incumbent's own defect, from the audit that started this work:
       "Millions in gross, 0 employees" rendered on screen without complaint.
       The identity is the assertion — a row that names a headcount and a total
       has to have both or neither, whichever way round it is wrong. */
    const rows = await page.getByRole("row").allInnerTexts();
    for (const row of rows) {
      const money = /₦([\d,]+\.\d{2})/.exec(row);
      if (!money) continue;
      const naira = Number((money[1] ?? "0").replace(/,/g, ""));
      if (naira === 0) continue;
      expect(row, "a row shows money and claims nobody was paid").not.toMatch(
        /\b0 (?:people|payslips)\b/,
      );
    }
  });
});

test.describe("the demo says it is a demo", () => {
  test("the sign-in gate is explicit before anybody is let in", async ({
    page,
  }) => {
    /* The one promise this build makes, and the one place it must be
       unambiguous: a person choosing a persona has to know the figures behind
       it are seeded. `verify-demo` proves the other half — that a production
       build contains none of this at all. */
    await page.goto("/dashboard");
    await expect(page.getByText(/Demo mode/i).first()).toBeVisible({
      timeout: 40_000,
    });
    await expect(
      page.getByText(/There is no password and nothing is secured/i),
    ).toBeVisible();
  });
});
