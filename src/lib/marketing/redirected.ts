/**
 * The marketing routes this app does not serve.
 *
 * `src/proxy.ts` answers each of them with a 308 to the landing site, so a
 * `<Link>` to one of them must not be prefetched: the prefetch is a `fetch`, it
 * follows the redirect to another origin, and the app's own
 * `Content-Security-Policy` (`connect-src`) refuses it. The page still works and
 * the click still leaves for the landing site, but every public careers page
 * (which wears this chrome) printed a console error per footer link.
 *
 * One list for both readers, so the proxy and the links cannot disagree about
 * which routes have left.
 */
export const REDIRECTED_PATHS: ReadonlySet<string> = new Set([
  "/demo",
  "/privacy",
  "/terms",
  "/security",
  "/dpa",
]);

export const REDIRECTED_PREFIXES: readonly string[] = ["/product"];

export function isRedirectedOffSite(pathname: string): boolean {
  return (
    REDIRECTED_PATHS.has(pathname) ||
    REDIRECTED_PREFIXES.some((prefix) => pathname.startsWith(`${prefix}/`))
  );
}
