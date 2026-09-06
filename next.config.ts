import type { NextConfig } from "next";

/**
 * Turns demo mode on inside an otherwise-real production build.
 *
 * Exists for exactly one deployment: a standalone, publicly-hosted site for
 * prospects to click through unsupervised — a `next build` + `next start` on
 * ordinary hosting, never the real customer-facing product. See
 * `src/lib/sales-script.ts` for why that deployment needs a real production
 * build rather than `next dev` run persistently.
 *
 * The variable name and value are both deliberately long, unlike every other
 * flag in this file. The one failure this must never allow is the real
 * production deployment picking this up from a stray copy-pasted environment
 * variable — the risk `DEMO_ENABLED` guards against for `NODE_ENV` alone, one
 * level up, and worth the same care rather than a plain `=== "on"`. Absent or
 * misspelled, this is `false`, which is what keeps the default answer for a
 * production build the same as it always was: `NODE_ENV=production` and
 * nothing else set is demo-free, unchanged from before this existed.
 * `scripts/verify-public-demo-build.ts` proves both halves — the default
 * stays clean, and the explicit opt-in genuinely turns it on.
 */
const ENABLE_DEMO_IN_PRODUCTION_BUILD =
  process.env["NEXT_PUBLIC_ENABLE_DEMO_IN_PRODUCTION_BUILD"] ===
  "yes-this-is-the-standalone-demo-deployment";

/**
 * Whether this build has a demo mode.
 *
 * Read once, here, and substituted into the source as a literal — see the
 * `compiler.define` block below and `src/lib/demo.ts` for the whole argument.
 * `NEXT_PUBLIC_DEMO=off` is an absolute override in both directions: it can
 * only ever *remove* the demo, and it wins even over
 * `ENABLE_DEMO_IN_PRODUCTION_BUILD` above — `scripts/verify-demo.ts` still
 * builds with it set, and that proof must keep meaning what it always meant.
 * Without either of the two env vars above, a production build is `false`
 * exactly as it was before `ENABLE_DEMO_IN_PRODUCTION_BUILD` existed.
 */
const DEMO_ENABLED =
  (process.env.NODE_ENV !== "production" || ENABLE_DEMO_IN_PRODUCTION_BUILD) &&
  process.env["NEXT_PUBLIC_DEMO"] !== "off";

/**
 * Whether this build replays prepared assistant answers for a live sales call.
 * See `src/lib/sales-script.ts` for the whole argument.
 *
 * `&& DEMO_ENABLED` is load-bearing, not decoration: it means there is no build
 * where the scripted assistant exists without the rest of the offline demo
 * behind it, and a production build (`DEMO_ENABLED` false) folds this to
 * `false` regardless of the env var. Opt-in (`=== "on"`), unlike
 * `NEXT_PUBLIC_DEMO`'s opt-out — this is the rarer, more specific build, so the
 * plain demo stays the thing you get by default.
 */
const SALES_SCRIPT_ENABLED =
  DEMO_ENABLED && process.env["NEXT_PUBLIC_SALES_SCRIPT"] === "on";

/**
 * The security headers every response carries.
 *
 * ## Why these are here and were not
 *
 * Measured against the live deployment on 5 September 2026:
 * `api.approvehr.io` sends the full helmet set — a strict CSP, HSTS, `nosniff`,
 * cross-origin opener and resource policies — and the app people actually click
 * payroll approvals in sent **none of them**, and advertised `x-powered-by`
 * besides. The API was locked down and the front door was not.
 *
 * The one that matters most is `frame-ancestors`. Without it the signed-in app
 * can be embedded in somebody else's page, and the primary control on several
 * of these screens approves money. Everything else here is ordinary hygiene a
 * procurement questionnaire will ask about by name.
 *
 * ## The CSP is deliberately not `default-src 'none'`
 *
 * The API can afford that because it serves JSON. This serves an application:
 * Next injects inline bootstrap scripts and the theme script in
 * `lib/theme-init-script.ts` runs before paint specifically so the page does
 * not flash the wrong theme, so `'unsafe-inline'` on `script-src` is load
 * bearing rather than lazy. `connect-src` has to admit the API's own origin,
 * which is a different host — read from `NEXT_PUBLIC_API_URL` rather than
 * hardcoded, so a staging deployment does not silently block its own backend.
 *
 * If you tighten this to nonces later, `frame-ancestors` is the clause to keep
 * exactly as it is; the rest is negotiable.
 */
const apiOrigin = (() => {
  try {
    return new URL(
      process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:8000",
    ).origin;
  } catch {
    /* A malformed value must not take the build down over a header. */
    return "";
  }
})();

/**
 * Where crash reports go, if anywhere.
 *
 * `connect-src` has to name it or the reporter is blocked and **says nothing** —
 * which is the worst possible failure for error reporting: it looks configured,
 * it never delivers, and the one signal that would have told you is the thing
 * being blocked. Found by pointing a real build at a real collector and getting
 * nothing; the browser refused it against `connect-src 'self' <api>`.
 *
 * The same clause is what a hosted service needs. Pointing this at Sentry means
 * putting Sentry's ingest origin here too — that is not an oversight to work
 * around, it is the allowlist doing its job.
 */
const errorReportOrigin = (() => {
  const raw = process.env["NEXT_PUBLIC_ERROR_REPORT_URL"];
  if (!raw) return "";
  try {
    const { origin } = new URL(raw);
    return origin === apiOrigin ? "" : origin;
  } catch {
    /* A malformed value must not take the build down over a header. */
    return "";
  }
})();

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  /* `'unsafe-eval'` in development only. React's development build uses
     `eval()` to reconstruct callstacks across the server/client boundary, and
     without it every page logs a CSP error that reads as a bug in the app.
     React never uses `eval()` in a production build, so production keeps the
     stricter policy — which is the half that faces a real reader. */
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  /* Explicit rather than left to the fallback chain. `worker-src` falls back to
     `child-src` and then `script-src`, so `'self'` was already reaching it —
     but a directive a reader has to derive is one somebody tightens `script-src`
     and silently breaks. The service worker (`public/sw.js`) is same-origin and
     is the only worker this app registers. */
  "worker-src 'self'",
  "manifest-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ""}${
    errorReportOrigin ? ` ${errorReportOrigin}` : ""
  }`,
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  /* Two years, subdomains included. Every tenant is a subdomain of
     approvehr.io, so leaving them out would protect the marketing site and not
     the product. */
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    /* Geolocation is granted to self on purpose: clocking in against a
       geofence is a real feature and revoking it here would break it. */
    value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  /* The legacy Vite frontend still sits in the parent directory with its own
     lockfiles. Pin the workspace root here so Turbopack does not walk up and
     adopt it. Remove once the old app is deleted. */
  turbopack: {
    root: __dirname,
  },

  /* Stops Next advertising itself. One line, and it is the first thing an
     automated scan reports. */
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
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
      SALES_SCRIPT_ENABLED,
    },
  },
};

export default nextConfig;
