import { NextResponse, type NextRequest } from "next/server";

/**
 * There are now two live copies of the public marketing pitch: this app's own
 * `(marketing)` route group, and the standalone `aprrovehr-frontend` repo,
 * which was rebuilt on this app's design system specifically to be the one
 * canonical landing page. Two live copies of the same argument is how they
 * drift — this file's sibling HANDOVER.md records that lesson for payroll
 * figures and appraisal scores, and it applies just as much to a pricing page.
 *
 * So: every marketing route below 308s out to the canonical landing site,
 * `https://approvehr.io` by default. This app's own `(marketing)` group is
 * retired, not maintained as a second copy — `NEXT_PUBLIC_LANDING_URL` exists
 * only to point somewhere else for local work (a `localhost:5173` landing dev
 * server, a staging landing deploy), never to turn the redirect off.
 *
 * `/careers/**` is deliberately excluded. It renders a real tenant's live
 * hiring data (`/careers/[org]/[role]`) — there is no equivalent in the
 * standalone repo, which ships no backend connection at all, and redirecting
 * it would send a candidate to a 404.
 *
 * Renamed from `middleware.ts`: Next 16 deprecates that file convention in
 * favour of `proxy.ts` — see node_modules/next/dist/docs/.../proxy.md. Same
 * mechanism, same execution point, new name and export.
 */
const LANDING_URL =
  process.env.NEXT_PUBLIC_LANDING_URL?.trim().replace(/\/$/, "") ||
  "https://approvehr.io";

const REDIRECTED_PATHS = new Set([
  "/",
  "/pricing",
  "/demo",
  "/privacy",
  "/terms",
  "/security",
  "/dpa",
]);

const REDIRECTED_PREFIXES = ["/product"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const matches =
    REDIRECTED_PATHS.has(pathname) ||
    REDIRECTED_PREFIXES.some((prefix) => pathname.startsWith(`${prefix}/`));

  if (!matches) return NextResponse.next();

  return NextResponse.redirect(`${LANDING_URL}${pathname}${search}`, 308);
}

export const config = {
  matcher: [
    "/",
    "/pricing",
    "/pricing/:path*",
    "/demo",
    "/demo/:path*",
    "/product/:path*",
    "/privacy",
    "/terms",
    "/security",
    "/dpa",
  ],
};
