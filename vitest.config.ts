import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * The frontend's first test runner.
 *
 * ## Why there was none, and why there is one now
 *
 * The API has ~2,600 assertions. `web/` had **zero tests** and thirteen bespoke
 * `verify-*` scripts — one per invariant that something invisible to `tsc` got
 * wrong. Those scripts are good and are staying: each answers a question a
 * component test cannot (does a built chunk carry a seeded persona, does every
 * store write through `current()`, do the two import dictionaries agree).
 *
 * What none of them can do is **render something and press it**. Every defect
 * this repo's history records as "found in the browser, not by `tsc`" — the
 * count true of the wrong noun, the dead retry button beside a 409, the two
 * mutually exclusive claims on one screen — is that shape, and each was found
 * by a person looking. This is the cheapest way to stop the next one.
 *
 * ## `jsdom`, not a real browser
 *
 * A real browser is `e2e`'s job and needs Playwright, a download and a server.
 * These are component tests: mount, assert, press, assert. `jsdom` is enough
 * for that and runs in milliseconds, which is what makes it a thing people
 * actually run.
 *
 * ## Not in `npm run check`, deliberately — for now
 *
 * `check` is the gate CI enforces and it is currently 13 scripts that finish in
 * under a minute. `npm test` is separate until there is enough here to be worth
 * the wall clock; wire it into `check` when the suite is load-bearing rather
 * than illustrative.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    /* `.next-verify` holds a production build and `.claude` can hold a linked
       worktree — the two directories that have made a gate report errors in
       files nobody wrote, twice. */
    exclude: ["node_modules", ".next", ".next-*", ".claude"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
