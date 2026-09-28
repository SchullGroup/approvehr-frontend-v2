import type { MetadataRoute } from "next";
import { execFileSync } from "node:child_process";
import { MODULES } from "@/lib/marketing/modules";
import { SITE_URL } from "@/lib/marketing/site";

/**
 * Every marketing route this domain actually serves. Until 2026-09,
 * `proxy.ts` 308ed all of these except `/pricing` out to the standalone
 * landing repo unconditionally, which is why this list used to hold exactly
 * one URL — see git history on this file for that entry, and `proxy.ts`
 * itself for the redirect it mirrored. Once this app's own marketing surface
 * is what's actually deployed at the real domain, every route it serves
 * belongs here; there is nothing left for a sitemap to omit on the grounds
 * that "the real copy lives elsewhere."
 *
 * `/careers/[org]/**` is real content this domain owns but isn't listed:
 * enumerating it needs a dynamic query for which organisations have a
 * published careers page, which nothing here builds yet.
 */
const STATIC_ROUTES: { path: string; sourceFile: string; priority: number }[] =
  [
    { path: "/", sourceFile: "src/app/(marketing)/page.tsx", priority: 1 },
    {
      path: "/pricing",
      sourceFile: "src/app/(marketing)/pricing/page.tsx",
      priority: 0.9,
    },
    {
      path: "/paye-calculator",
      sourceFile: "src/app/(marketing)/paye-calculator/page.tsx",
      priority: 0.9,
    },
    {
      path: "/demo",
      sourceFile: "src/app/(marketing)/demo/page.tsx",
      priority: 0.7,
    },
    {
      path: "/privacy",
      sourceFile: "src/app/(marketing)/privacy/page.tsx",
      priority: 0.3,
    },
    {
      path: "/terms",
      sourceFile: "src/app/(marketing)/terms/page.tsx",
      priority: 0.3,
    },
    {
      path: "/security",
      sourceFile: "src/app/(marketing)/security/page.tsx",
      priority: 0.3,
    },
    {
      path: "/dpa",
      sourceFile: "src/app/(marketing)/dpa/page.tsx",
      priority: 0.3,
    },
  ];

/**
 * The real date content last changed, read out of git rather than invented.
 * `lastModified` is a claim about the world; a build-time `new Date()` would
 * make every route look freshly edited on every deploy, which is a claim
 * this codebase's own rules would refuse anywhere else.
 *
 * Absent on any failure — no git binary, a shallow clone with no history for
 * this file, a checkout with `.git` stripped — rather than a guessed date.
 * `MetadataRoute.Sitemap` already treats `lastModified` as optional for
 * exactly this reason.
 */
function lastModifiedOf(file: string): Date | undefined {
  try {
    const iso = execFileSync("git", ["log", "-1", "--format=%cI", "--", file], {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim();
    return iso ? new Date(iso) : undefined;
  } catch {
    return undefined;
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries = STATIC_ROUTES.map(({ path, sourceFile, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: lastModifiedOf(sourceFile),
    changeFrequency: "weekly" as const,
    priority,
  }));

  const moduleEntries = MODULES.map((m) => ({
    url: `${SITE_URL}/product/${m.id}`,
    lastModified: lastModifiedOf("src/lib/marketing/modules.ts"),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  return [...staticEntries, ...moduleEntries];
}
