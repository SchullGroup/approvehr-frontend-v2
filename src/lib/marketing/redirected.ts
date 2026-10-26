/**
 * The marketing routes this app does not serve, and what that means for a
 * `<Link>` to one.
 *
 * `src/proxy.ts` answers each of them with a 308 to the landing site. Next
 * **prefetches** every `<Link>` that scrolls into view, so each one sent a
 * background request that was redirected to another origin, which the app's own
 * `connect-src` Content Security Policy forbids. Every page with such a link
 * (the footer, the sign-in footer, the product menu, every public careers page)
 * logged a console error per link, and the sign-in page missed an eight-second
 * network-idle wait. Harmless to a visitor, and noise for error reporting.
 *
 * A link that leaves the app has nothing to prefetch, so it should not. The click
 * still works: it is a normal navigation, which the proxy redirects.
 *
 * One list for both readers, so the proxy and the links cannot disagree about
 * which routes have left. `tests/hiring-layout-across-devices.test.tsx` checks
 * the proxy's matcher against it.
 */
export const REDIRECTED_PATHS: readonly string[] = [
  "/demo",
  "/privacy",
  "/terms",
  "/security",
  "/dpa",
];

export const REDIRECTED_PREFIXES: readonly string[] = ["/product"];

/** The proxy's question: is this pathname one it redirects off the site? */
export function isRedirectedOffSite(pathname: string): boolean {
  return (
    REDIRECTED_PATHS.includes(pathname) ||
    REDIRECTED_PREFIXES.some((prefix) => pathname.startsWith(`${prefix}/`))
  );
}

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
