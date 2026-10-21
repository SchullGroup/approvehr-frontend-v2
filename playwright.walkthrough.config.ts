import { defineConfig } from "@playwright/test";

/**
 * The walkthrough's own runner. It is not `playwright.config.ts` and is not part
 * of `npm run e2e` or `npm run check`: a walkthrough needs a staged stack (an
 * empty database, an API, a production build, a mail sink and a stand-in for
 * Atlassian), and a recording takes the better part of an hour.
 *
 * ```
 * WALK_OUT=<main checkout>/out/walkthrough/<slug> \
 *   npx playwright test -c playwright.walkthrough.config.ts
 * ```
 *
 * One worker, one test at a time, no retries and no parallelism: a retry would
 * be a second go at something a person only gets one go at, and the recording is
 * one continuous file. Journeys are `*.walk.ts` so that vitest, which matches
 * `*.test.ts`, never picks one up.
 *
 * Video is switched **off** here on purpose: the fixture makes its own browser
 * context so that it controls the video's folder and size, and a second
 * recording by the runner would be a second, unwanted copy.
 */
export default defineConfig({
  testDir: "./tests/walkthrough",
  testMatch: "**/*.walk.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 90 * 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  outputDir: "./test-results-walkthrough",
  use: {
    video: "off",
    trace: "off",
    screenshot: "off",
  },
});
