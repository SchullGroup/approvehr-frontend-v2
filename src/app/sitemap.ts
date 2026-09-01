import type { MetadataRoute } from "next";

/**
 * Every static page this sitemap used to list — home, pricing, demo, the
 * module walkthroughs, the legal docs — is now 308ed by `proxy.ts` out to the
 * standalone landing repo unconditionally (it defaults
 * `NEXT_PUBLIC_LANDING_URL` to `https://approvehr.io` rather than gating on
 * it). Listing a redirect in a sitemap tells a crawler to index the *target*,
 * not this URL, so there is nothing left here for this domain to claim — the
 * standalone repo publishes its own sitemap for those routes now.
 *
 * `/careers/[org]/**` is real content this domain still owns (a tenant's live
 * hiring data), but it was never in this static list to begin with — it would
 * need a dynamic sitemap querying which organisations have a published
 * careers page, which nothing here builds yet.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [];
}
