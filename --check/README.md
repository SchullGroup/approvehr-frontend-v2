# ApproveHR — website

The public marketing site for [ApproveHR](https://approvehr.io), Schull
Technologies' HR, payroll and hiring platform for Nigerian companies.

Next.js 16.3.1 (App Router, Turbopack), React 19, TypeScript, Tailwind v4.

## Running it

```bash
npm install
npm run dev     # http://localhost:3000
npm run check   # typecheck + lint + production build
```

## Pages

| Route | What it is |
|---|---|
| `/` | Homepage — the argument, the module grid, pricing teaser |
| `/pricing` | Tiers plus a live per-employee calculator |
| `/product/[module]` | One walkthrough per module: payroll, core-hr, hiring, time, performance, desk |
| `/demo` | Demo request form |
| `/privacy`, `/terms`, `/security`, `/dpa` | Legal and trust documents |

`/sitemap.xml` and `/robots.txt` are generated from the same content modules
the pages render from, so a new module or legal document appears in both without
anyone remembering to add it.

## How it is put together

- **`src/lib/marketing/`** holds the copy — module descriptions, pricing tiers,
  the legal documents. Text lives in these modules rather than inline in JSX so
  the homepage, the module pages and the footer quote the product identically. A
  claim cannot drift between two places if it only exists in one.
- **`src/components/marketing/mockups.tsx`** and `module-mockups.tsx` are
  hand-drawn SVG and CSS illustrations of the product, not screenshots. They
  never go stale and weigh nothing. Each one has a hover animation that performs
  the sentence its card is making.
- **`src/app/globals.css`** carries the design tokens. The marketing surface
  has its own block: warm sand ground, near-black warm ink, tight display type.
  Every colour pair in use is checked against WCAG 2.1 AA.
- **`src/lib/marketing/links.ts`** decides whether the "sign in" and "see it
  live" links appear at all, from `NEXT_PUBLIC_APP_URL`. Unset means no app is
  deployed, so those affordances are dropped rather than pointed at a 404. See
  `.env.example`.

## Two rules this site is built on

1. **Nothing is claimed that is not true.** No invented customer logos, no
   made-up statistics, no testimonials for features that do not exist. The
   security page leads with the assurances we do *not* have. The legal documents
   say they are drafts.
2. **Never link to a page that is not there.** Any affordance for something
   unbuilt is either absent or visibly marked as unbuilt.

## Deploying

Any Node host that runs Next.js. Set `NEXT_PUBLIC_SITE_URL` so the sitemap
emits absolute URLs for the right domain.

---

Generated from the `web/` project in the ApproveHR monorepo by
`scripts/export-marketing.ts`. Edit the site there and re-run the export —
changes made directly in this repo will be overwritten on the next one.
