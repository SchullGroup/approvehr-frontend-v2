import type { NextConfig } from "next";

/**
 * Whether this build has a demo mode.
 *
 * Read once, here, and substituted into the source as a literal — see the
 * `compiler.define` block below and `src/lib/demo.ts` for the whole argument.
 * `NEXT_PUBLIC_DEMO=off` can only ever *remove* the demo, never add one: a
 * production build is `false` whatever it says.
 */
const DEMO_ENABLED =
  process.env.NODE_ENV !== "production" && process.env["NEXT_PUBLIC_DEMO"] !== "off";

const nextConfig: NextConfig = {
  /* The legacy Vite frontend still sits in the parent directory with its own
     lockfiles. Pin the workspace root here so Turbopack does not walk up and
     adopt it. Remove once the old app is deleted. */
  turbopack: {
    root: __dirname,
  },

  /* Where the build lands. `.next` unless something asks otherwise.
   *
   * `scripts/verify-demo.ts` greps the *built* output, because that is the only
   * half of it that proves anything — and proving it used to mean a production
   * build over `.next`, which is what `next dev` serves from. So verifying the
   * demo gate killed the dev server every time, and verifying got skipped, which
   * is how seven fabricated values accumulated behind a passing check. Use
   * `npm run verify-demo:build`, which sets this and puts the build somewhere
   * harmless. */
  distDir: process.env["NEXT_DIST_DIR"] ?? ".next",

  compiler: {
    /**
     * `DEMO_ENABLED` is a compile-time literal, not an import.
     *
     * This is the mechanism the whole demo gate rests on, and it is here rather
     * than in a module because **an exported `const` does not fold.** The first
     * version of this exported `DEMO_ENABLED` from `src/lib/demo.ts`; the
     * production bundle came back with `a.DEMO_ENABLED&&"demo"===e.source&&…`
     * still in it, and with it every seeded salary, fabricated bank account and
     * "Demo data, this browser only" string — because Turbopack keeps the module
     * boundary and will not propagate a constant across it. The guard was
     * correct at runtime and the payload shipped anyway.
     *
     * `define` substitutes the identifier at every use site, so each guard
     * becomes `false && …` in the source the minifier sees, and the branch —
     * strings, seed arrays and all — is dropped. `scripts/verify-demo.ts` greps
     * the built chunks and fails if any of it survives; that check is the only
     * reason this is known to work rather than believed to.
     *
     * Deliberately not a runtime flag. There is nothing to switch on in
     * production: the code is not there.
     */
    define: {
      DEMO_ENABLED,
    },
  },
};

export default nextConfig;
