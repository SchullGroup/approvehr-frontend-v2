/**
 * The one place the public domain and the brand's off-site profiles are
 * written down. `sitemap.ts`, `robots.ts`, every page's `alternates.canonical`,
 * and the `Organization` JSON-LD in the root layout all read from here —
 * before this existed, `SITE_URL` was defined three times over, which is
 * exactly the kind of fact that drifts the day only one of the three gets
 * updated for a domain change.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://approvehr.io"
).replace(/\/$/, "");

/**
 * Where the brand is off-site. `sameAs` on the `Organization` schema is what
 * tells Google these accounts and this domain are the same entity — the
 * mechanism behind a Knowledge Panel, not just a footer nicety. Add an
 * account here only once it is real and live; an unlaunched or dead profile
 * in `sameAs` is a broken citation Google has to discover is wrong.
 */
export const SOCIAL_PROFILES = {
  linkedin: "https://www.linkedin.com/company/approvehr/",
  instagram: "https://www.instagram.com/approvehr/",
} as const;
