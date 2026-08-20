import type { MetadataRoute } from "next";
import { MODULES } from "@/lib/marketing/modules";
import { LEGAL_DOCS, type LegalDocId } from "@/lib/marketing/legal";

/**
 * Only the public marketing surface is listed. The signed-in app under `(app)`
 * is deliberately absent — those routes require a session and indexing them
 * would put "Payroll run — ApproveHR" in search results pointing at a sign-in
 * redirect. `robots.ts` disallows them separately, since a sitemap omission is
 * not itself an instruction.
 *
 * Routes are derived from the same content modules the pages render from, so a
 * new module or legal document appears here without anyone remembering to.
 */
const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://approvehr.io"
).replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: { path: string; priority: number }[] = [
    { path: "", priority: 1 },
    { path: "/pricing", priority: 0.9 },
    { path: "/demo", priority: 0.9 },
  ];

  const modulePages = MODULES.map((m) => ({
    path: `/product/${m.id}`,
    priority: 0.8,
  }));

  const legalPages = (Object.keys(LEGAL_DOCS) as LegalDocId[]).map((id) => ({
    path: `/${id}`,
    priority: 0.3,
  }));

  return [...staticPages, ...modulePages, ...legalPages].map(
    ({ path, priority }) => ({
      url: `${SITE_URL}${path}`,
      changeFrequency: priority >= 0.8 ? "weekly" : "yearly",
      priority,
    }),
  );
}
