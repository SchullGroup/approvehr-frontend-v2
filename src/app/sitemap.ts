import type { MetadataRoute } from "next";

/**
 * Every static page this sitemap used to list — home, pricing, demo, the
 * module walkthroughs, the legal docs — is 308ed by `proxy.ts` out to the
 * standalone landing repo unconditionally (it defaults
 * `NEXT_PUBLIC_LANDING_URL` to `https://approvehr.io` rather than gating on
 * it). Listing a redirect in a sitemap tells a crawler to index the *target*,
 * not this URL, so there is nothing left here for this domain to claim — the
 * standalone repo publishes its own sitemap for those routes.
 *
 * `/pricing` is the one exception, and it mirrors `proxy.ts`'s own exception
 * for it: the standalone site's `/pricing` 404s as of 2 September 2026, so
 * this domain's own page is the one actually live, and it belongs in this
 * domain's sitemap for exactly as long as that stays true. Remove this entry
 * in the same change that removes `proxy.ts`'s `/pricing` exclusion.
 *
 * `/careers/[org]/**` is real content this domain still owns (a tenant's live
 * hiring data), but it was never in this static list to begin with — it would
 * need a dynamic sitemap querying which organisations have a published
 * careers page, which nothing here builds yet.
 */
const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://approvehr.io"
).replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/pricing`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
  ];
}
