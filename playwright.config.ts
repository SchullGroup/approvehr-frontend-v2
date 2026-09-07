import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests, against a real browser and a real build.
 *
 * ## What these are for, and what they are not
 *
 * They are not a second copy of the component tests. `tests/*.test.tsx` mount a
 * component and assert what it renders; these open the app the way a person
 * does and assert the things that **only exist between layers** — a route that
 * renders, a screen that keeps its promise about an absence, a control that is
 * absent rather than present-and-refusing.
 *
 * Every defect this repo's HANDOVER records as "found in the browser, not by
 * `tsc`" is that shape: a live "Try again" beside a 409, a checkbox that ticked
 * and left its button grey, `₦0.00` where a figure does not belong, a count
 * true of the wrong noun. None of those is visible to a type or to a mounted
 * component with a stubbed store.
 *
 * ## Demo mode, deliberately
 *
 * `NEXT_PUBLIC_DEMO` is left on and no API is required, so these run in CI with
 * nothing but Node. That is a real constraint on what they can assert — they
 * cover the shell, the routes and the offline refusals — and it is the right
 * trade for a suite that has to run on every push. Anything that needs a
 * database is a backend test, of which there are 2,834.
 *
 * ## Not in `npm run check`
 *
 * `check` is what CI enforces and it finishes in under a minute; this starts a
 * dev server and drives Chromium. `npm run e2e` is separate until somebody
 * decides the wall-clock is worth it in the same job.
 */
export default defineConfig({
  testDir: "./e2e",
  /* One worker locally: the dev server is shared and Next compiles a route on
     first request, so parallel workers race the same compile and time out. */
  workers: process.env["CI"] ? 2 : 1,
  /* No retries. A test that passes on the second attempt is a test nobody can
     read a failure from, and this repo has already paid for treating a real
     defect as flakiness. */
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    /* `localhost`, not `127.0.0.1`. Next 16 blocks cross-origin requests for
       dev resources, and it treats the two as different origins: the server
       binds `localhost`, so a page loaded from `127.0.0.1` gets 403 on every
       chunk, never hydrates, and sits on the session spinner for ever. The only
       clue is a warning in the dev server's own output. */
    baseURL: "http://localhost:3210",
    /* Kept only for a failure. A trace per passing test is gigabytes nobody
       opens. */
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    /* The responsive pass fixed three shared causes and asserted ten routes at
       375px by hand. This is the half that keeps it fixed. */
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    /* Its own port, so a dev server somebody is already using on 3000 is not
       disturbed — three sessions share this checkout.
     *
     * **`next dev` rewrites `tsconfig.json`** on start, adding its dist
     * directory's generated types to `include` and reformatting the whole file.
     * With a dist directory only this suite creates, committing that would make
     * `tsc` depend on a build nobody else runs. `git checkout tsconfig.json`
     * after a run, exactly as `verify-demo:build` already does for the same
     * reason. */
    command: "npm run dev -- --port 3210",
    env: {
      /* Pointed at a dead port on purpose, so the suite is **always** in demo
         mode. Without this it depends on whether somebody happens to have the
         API running on 8000 — the same run would exercise two different
         products and a green result would mean nothing.

         A high unused port, not 9: Chromium blocks the low well-known ports
         outright (`ERR_UNSAFE_PORT`), so a fetch to one never becomes the
         immediate connection refusal the probe is relying on to fail fast. */
      NEXT_PUBLIC_API_URL: "http://127.0.0.1:59999",
      /* Its own build directory. `next dev` refuses to start a second server
         out of one directory — it holds a lock under `.next/dev` — and three
         sessions share this checkout, so a suite that could only run when
         nobody else was working would be a suite nobody ran. `next.config.ts`
         reads this, and `eslint.config.mjs` already ignores `.next-*`. */
      NEXT_DIST_DIR: ".next-e2e",
    },
    url: "http://localhost:3210",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
