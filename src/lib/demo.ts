/**
 * Whether this build has a demo mode at all.
 *
 * ## Why the mode went, and not just the badges
 *
 * The app has always had two modes: connected to `approvehr-api`, and an
 * offline demo that invents its own data in `localStorage` so the product can
 * be shown on a laptop in a room with no database. Every screen that could
 * show a locally-invented figure carried a badge saying so, because a figure
 * that looks real and is local is the exact dishonesty this product exists to
 * fix — see the payroll audit in `PARITY.md`.
 *
 * The owner's instruction was to remove those badges before going live. Taking
 * that literally would have been the worst possible reading of it: demo mode
 * would still run, and the product would then present invented numbers as the
 * company's own. So the badges are not what got removed. **The mode did.**
 *
 * In a production build there is no demo store, no seeded personas, no
 * fallback — and therefore nothing left for a badge to label.
 *
 * ## `DEMO_ENABLED` is a compile-time literal with no import
 *
 * It is declared as an ambient global below and substituted by
 * `compiler.define` in `next.config.ts`, so **every** occurrence of it in the
 * source is replaced with `true` or `false` before minification. A production
 * build therefore reads `false && <Callout …/>`, `false ? SEED : []`, and the
 * minifier drops the branch — the seeded salaries, the fabricated bank
 * accounts, the "Demo data, this browser only" strings are not in the shipped
 * bundle to be found.
 *
 * **Do not turn this back into an exported `const`.** That was the first
 * attempt and it failed silently: the guards were correct at runtime and the
 * payload shipped regardless, because Turbopack does not propagate a constant
 * across a module boundary. `next.config.ts` records the evidence.
 *
 * That is deliberately stronger than a runtime check. A runtime flag is
 * something an environment variable, a feature toggle or a stray query
 * parameter can turn on in front of a customer. This cannot be turned on: the
 * code is not there. `scripts/verify-demo.ts` proves it against the build
 * output rather than asserting it.
 *
 * `NEXT_PUBLIC_DEMO=off` exists for one purpose — standing in a development
 * build and seeing exactly what production will render, without deploying to
 * find out. It can only ever *remove* the demo, never add it.
 */
declare global {
  /** True only in a build that has a demo. Substituted at compile time. */
  const DEMO_ENABLED: boolean;
}

/**
 * Where the figures on a screen came from — or `null` when that is simply
 * "the database", which is not something a user needs told to them.
 *
 * Roughly thirty screens carried this as an inline ternary against their own
 * `connected` flag. It lives here now for the same reason the flag does: the
 * copy that names demo mode should exist in exactly one module, so removing it
 * is one edit and verifying it is gone is one grep.
 *
 * `live` used to render "Live from the API" — true and uninteresting. A
 * badge that only ever says "this is real" on a real product is a badge for
 * nobody; every caller that renders one is expected to skip it when this
 * returns `null`, the same way they already skip `loading`/`error` when those
 * are absent.
 */
export function sourceNote(live: boolean): string | null {
  if (live) return null;
  /**
   * Not live, and no demo to blame it on.
   *
   * In a production build every store is connected, so the only callers that
   * can reach this are the panels that pass `live={false}` outright — the
   * internal ATS pipeline, interviews, scorecards and offers, which have Prisma
   * models and **no API routes at all**. "Live from the API" there would be a
   * wrong claim about where the rows came from, and with the seed gone there
   * are no rows: the panel is empty and this says why.
   */
  return DEMO_ENABLED ? "Demo data, this browser only" : "Not available yet";
}
