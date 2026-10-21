/**
 * Which addresses this app answers with a redirect to the landing site, and what
 * that means for a `<Link>` to one.
 *
 * ## The console error this is for
 *
 * `src/proxy.ts` answers `/privacy`, `/terms`, `/security`, `/dpa`, `/demo` and
 * `/product/*` with a 308 to `https://approvehr.io`. Next **prefetches** every
 * `<Link>` that scrolls into view, so each one sent a background request that was
 * redirected to another origin — which the app's own `connect-src` Content
 * Security Policy forbids. Every page with such a link (the footer, the sign-in
 * screen's footer, the product menu) logged
 * `Connecting to 'https://approvehr.io/privacy' violates the following Content
 * Security Policy directive` for each, and pushed the sign-in page past an
 * eight-second network-idle wait. Harmless to a visitor and noise for error
 * reporting, which is exactly the signal `NEXT_PUBLIC_ERROR_REPORT_URL` exists
 * to keep clean.
 *
 * A link that leaves the app has nothing to prefetch, so it should not. The click
 * still works — it is a normal navigation, which the proxy redirects.
 *
 * ## Kept in step with the proxy by a test
 *
 * `src/proxy.ts` owns the redirect and is where somebody changing it will be
 * looking, so it keeps its own list; `tests/redirected-links.test.ts` reads that
 * file and fails if this one disagrees. A route added to the proxy and not here
 * would bring the error back for exactly that route.
 */
export const REDIRECTED_PATHS: readonly string[] = [
  "/demo",
  "/privacy",
  "/terms",
  "/security",
  "/dpa",
];

export const REDIRECTED_PREFIXES: readonly string[] = ["/product"];

/** Whether following this address leaves the app for the landing site. */
export function leavesTheApp(href: string): boolean {
  const path = href.split(/[?#]/)[0] ?? href;
  return (
    REDIRECTED_PATHS.includes(path) ||
    REDIRECTED_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    )
  );
}

/**
 * What to spread onto a `<Link>`: nothing for an ordinary route, and no prefetch
 * for one that is redirected away.
 */
export function prefetchFor(href: string): { prefetch?: false } {
  return leavesTheApp(href) ? { prefetch: false } : {};
}
