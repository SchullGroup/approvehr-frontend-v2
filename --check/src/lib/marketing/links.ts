/**
 * Where the signed-in product lives, as far as the marketing site is concerned.
 *
 * In this monorepo the app ships alongside the site, so the default is a local
 * route. The standalone marketing repo (see `scripts/export-marketing.ts`) has
 * no app behind it — leaving `NEXT_PUBLIC_APP_URL` unset there makes every
 * "see it live" affordance fall back to something that actually exists rather
 * than linking at a page that doesn't. Same rule the `/settings` placeholder
 * cards follow: never link to a page that isn't there.
 *
 * Set `NEXT_PUBLIC_APP_URL=https://app.approvehr.io` (or `/dashboard` when the
 * two surfaces are deployed together) to turn the live-product links back on.
 */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.trim() || null;

/** True when there is a real product to send someone into. */
export const hasLiveApp = APP_URL !== null;

export type Cta = { href: string; label: string };

/**
 * The secondary call to action that sits beside "Book a demo".
 *
 * `live` is the copy used when the app is reachable — it promises a running
 * product, so it may only be shown when one exists. `fallback` is what the
 * marketing-only build shows instead, and each call site picks its own because
 * the honest next step differs by page: the homepage can offer the module
 * walkthroughs, a module page has already shown them and should offer pricing.
 */
export function liveProductCta(live: string, fallback: Cta): Cta {
  return APP_URL ? { href: APP_URL, label: live } : fallback;
}

/**
 * Nav and footer entries that only make sense with the app deployed. Filtered
 * out entirely rather than disabled — a greyed-out "Sign in" in a public header
 * reads as broken, an absent one reads as a site that doesn't have accounts yet.
 */
export function appNavLinks(): [string, string][] {
  return APP_URL
    ? [
        [APP_URL, "Live demo"],
        [APP_URL, "Sign in"],
      ]
    : [];
}

/**
 * Internal-only footer entries. `/design-system` is a route of the full app
 * deployment, so it ships with the app, not with the standalone marketing repo —
 * gating it on the same flag keeps the public footer free of dead links.
 */
export function internalNavLinks(): [string, string][] {
  return hasLiveApp ? [["/design-system", "Design system"]] : [];
}
