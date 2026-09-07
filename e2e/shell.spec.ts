import { expect, test } from "@playwright/test";
import { scrollsSideways, signIn } from "./sign-in";

/**
 * The routes render, and the shell does not scroll sideways on a phone.
 *
 * ## Why a smoke walk earns its place
 *
 * `npm run build` proves a route compiles. It does not prove the segment
 * renders: a hook order that changes on a branch, a `useCan` called
 * conditionally, a store read during render, a nested anchor that silently
 * blanks the page — every one of those builds clean and throws in a browser.
 * This repo's HANDOVER records the nested-anchor case producing "a blank page,
 * no console error pointing at the real cause".
 *
 * So the assertion is not "the page looks right" — it is that the segment
 * mounted, produced a heading, and put nothing in the console that a person
 * would call a crash.
 */

/**
 * The routes a person actually opens, one per module.
 *
 * Not every route: a walk of ninety is a walk nobody runs. These are the ones
 * whose failure would be reported within an hour of a deploy.
 */
/** The port `playwright.config.ts` pins the API at. Nothing listens there. */
const DEAD_API = "http://127.0.0.1:59999";

const ROUTES: [string, RegExp][] = [
  ["/dashboard", /Home|Good|Dashboard|Welcome/i],
  ["/people", /Employees|People|Directory/i],
  ["/people/leave", /Leave/i],
  ["/people/attendance", /Attendance/i],
  ["/people/org-chart", /Org chart/i],
  ["/people/one-on-ones", /One-to-ones/i],
  ["/people/signatures", /Signatures/i],
  ["/payroll", /payroll/i],
  ["/payroll/payslips", /Payslips/i],
  ["/performance", /Performance/i],
  ["/approvals", /approvals/i],
  ["/reports", /Reports/i],
  ["/settings", /Settings/i],
];

test.describe("every module opens", () => {
  for (const [route, heading] of ROUTES) {
    test(`${route} renders and logs no crash`, async ({ page }) => {
      const crashes: string[] = [];
      /* Every request that failed, by URL. The suite pins demo mode by
         pointing `NEXT_PUBLIC_API_URL` at a dead port, so refusals to *that*
         origin are the arrangement rather than a defect — and asserting the
         list is exactly those is stronger than filtering the console text,
         because it also proves the app asks for nothing else it cannot get. */
      const failedUrls: string[] = [];
      page.on("requestfailed", (request) => failedUrls.push(request.url()));
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const text = message.text();
        /* Next's dev overlay, the HMR socket and a blocked favicon are noise in
           `next dev` and say nothing about the app. `ERR_CONNECTION_REFUSED`
           carries no URL in the console; `failedUrls` below is what checks it. */
        if (
          /HMR|hot-update|favicon|Download the React DevTools|ERR_CONNECTION_REFUSED/i.test(
            text,
          )
        ) {
          return;
        }
        /* React's dev-only warning about the theme-init `<script>` in each
           layout. It is right that the script does not run on a client
           navigation — which is precisely why `components/portal/theme-effect.tsx`
           exists, and that file documents it. A warning about an arrangement
           the codebase already answers is not a crash. */
        if (
          /Encountered a script tag while rendering React component/.test(text)
        ) {
          return;
        }
        crashes.push(text);
      });
      page.on("pageerror", (error) => crashes.push(error.message));

      await signIn(page);
      await page.goto(route);
      await expect(
        page.getByRole("heading", { name: heading }).first(),
      ).toBeVisible();
      expect(crashes, `console errors on ${route}`).toEqual([]);
      expect(
        failedUrls.filter((url) => !url.startsWith(DEAD_API)),
        `${route} asked for something it could not get`,
      ).toEqual([]);
    });
  }
});

test.describe("nothing scrolls sideways", () => {
  /* Only meaningful on the phone project — a 1280px desktop viewport would
     pass these trivially. */
  test.skip(({ isMobile }) => !isMobile, "a phone-width question");

  for (const [route] of ROUTES) {
    test(`${route} fits the screen`, async ({ page }) => {
      await signIn(page);
      await page.goto(route);
      /* Wait for the page's own content, not the shell: a measurement taken
         while a segment is still a skeleton measures the skeleton. */
      await expect(page.locator("main")).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 1 }).first(),
      ).toBeVisible();
      expect(await scrollsSideways(page), `${route} scrolls sideways`).toBe(
        false,
      );
    });
  }
});
