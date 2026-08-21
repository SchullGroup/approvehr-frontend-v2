import type { MetadataRoute } from "next";
import { hasLiveApp } from "@/lib/marketing/links";

/**
 * The app surface is disallowed explicitly rather than merely left out of the
 * sitemap — a missing sitemap entry is not an instruction, and a crawler that
 * finds `/dashboard` through a link would otherwise index it.
 *
 * The list is gated on `hasLiveApp` because the standalone marketing deployment
 * has none of these routes, and a `Disallow` for a path that does not exist is
 * noise that invites someone to go looking for it.
 */
const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://approvehr.io"
).replace(/\/$/, "");

/** Signed-in product routes. Kept in one place so robots and any future auth
    middleware can agree on what counts as "inside the app". */
const APP_PATHS = [
  "/dashboard",
  "/approvals",
  "/people",
  "/payroll",
  "/hiring",
  "/performance",
  "/reports",
  "/help",
  "/settings",
  "/sign-in",
  "/design-system",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        ...(hasLiveApp ? { disallow: APP_PATHS } : {}),
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
