import { NextResponse, type NextRequest } from "next/server";

/**
 * There are now two live copies of the public marketing pitch: this app's own
 * `(marketing)` route group, and the standalone `aprrovehr-frontend` repo,
 * which was rebuilt on this app's design system specifically to be the one
 * canonical landing page. Two live copies of the same argument is how they
 * drift — this file's sibling HANDOVER.md records that lesson for payroll
 * figures and appraisal scores, and it applies just as much to a pricing page.
 *
 * So: every marketing route below except the two exceptions further down
 * 308s out to the canonical landing site, `https://approvehr.io` by default.
 * This app's own `(marketing)` group is retired there, not maintained as a
 * second copy — `NEXT_PUBLIC_LANDING_URL` exists only to point somewhere
 * else for local work (a `localhost:5173` landing dev server, a staging
 * landing deploy), never to turn the redirect off.
 *
 * `/` is the exception to all of that and goes **inward**, to `/dashboard`.
 * It used to leave with the rest, which meant this app's own front door threw
 * whoever opened it — including somebody already signed in — out to read
 * marketing copy. The pitch lives on the landing site and is reachable from
 * there; the app's root belongs to the product.
 *
 * `/careers/**` is deliberately excluded. It renders a real tenant's live
 * hiring data (`/careers/[org]/[role]`) — there is no equivalent in the
 * standalone repo, which ships no backend connection at all, and redirecting
 * it would send a candidate to a 404.
 *
 * `/pricing` is also excluded, for the same class of reason: checked live
 * against the standalone site on 2 September 2026, `/pricing` (along with
 * `/demo`, `/product/*`, and every legal page) 404s there — only the
 * homepage has actually been built so far. Redirecting a real, working page
 * here into a dead link on the target is worse than not redirecting it.
 * Remove this exception once the standalone site's pricing page is live, not
 * before.
 *
 * Renamed from `middleware.ts`: Next 16 deprecates that file convention in
 * favour of `proxy.ts` — see node_modules/next/dist/docs/.../proxy.md. Same
 * mechanism, same execution point, new name and export.
 */
const LANDING_URL =
  process.env.NEXT_PUBLIC_LANDING_URL?.trim().replace(/\/$/, "") ||
  "https://approvehr.io";

/** Where the app's own root sends somebody: into the product. */
const APP_ENTRY = "/dashboard";

const REDIRECTED_PATHS = new Set([
  "/demo",
  "/privacy",
  "/terms",
  "/security",
  "/dpa",
]);

const REDIRECTED_PREFIXES = ["/product"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  /* Inward, and deliberately 307 rather than the 308 used below.
     ------------------------------------------------------------
     A 308 is permanent and browsers cache it indefinitely, so it is right for
     the marketing retirement — that decision is settled — and wrong here:
     where this app's root points is a product decision, and a permanent
     redirect would keep firing from every browser that ever saw it long after
     somebody changed their mind.

     No loop is possible: `/dashboard` is not in the matcher below. Signing in
     is not a concern either — the auth gate renders in place rather than
     redirecting, so a visitor with no session lands on `/dashboard` and is
     asked to sign in there, keeping the deep link. */
  if (pathname === "/") {
    return NextResponse.redirect(
      new URL(`${APP_ENTRY}${search}`, request.url),
      307,
    );
  }

  const matches =
    REDIRECTED_PATHS.has(pathname) ||
    REDIRECTED_PREFIXES.some((prefix) => pathname.startsWith(`${prefix}/`));

  if (!matches) return NextResponse.next();

  return NextResponse.redirect(`${LANDING_URL}${pathname}${search}`, 308);
}

export const config = {
  matcher: [
    "/",
    "/demo",
    "/demo/:path*",
    "/product/:path*",
    "/privacy",
    "/terms",
    "/security",
    "/dpa",
  ],
};
