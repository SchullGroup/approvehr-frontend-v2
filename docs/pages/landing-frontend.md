# Pages — ApproveHR landing site

_Repo:_ `aprrovehr-frontend` · _Framework:_ React 19 + React Router (Vite) · _Generated from_ `src/App.tsx`

The public marketing and careers site. No authentication anywhere in it. Every page sits inside
`MarketingLayout` (nav and footer) and `PageWrapper` (the page transition); the screen named below is
the content itself.

**14 routes.**

| Route | Screen | File | What it is |
|---|---|---|---|
| `/` | `Home` | `src/pages/Home/Home.tsx` | Homepage — hero, module grid, pricing teaser, testimonials. |
| `/product/:moduleId` | `Product` | `src/pages/Product/Product.tsx` | One page per module: payroll, core-hr, hiring, time, performance, desk. |
| `/pricing` | `Pricing` | `src/pages/Pricing/Pricing.tsx` | Tiered pricing with a live headcount calculator. |
| `/demo` | `Demo` | `src/pages/Demo/Demo.tsx` | Demo request form. |
| `/careers/:org` | `CareersList` | `src/pages/Careers/CareersList.tsx` | A company's public job board. |
| `/careers/:org/:role` | `RolePage` | `src/pages/Careers/RolePage.tsx` | One advert, with the application form. |
| `/about` | `→ /` | — | Redirect. |
| `/products` | `→ /` | — | Redirect. |
| `/waitlist` | `→ /demo` | — | Redirect. |
| `/*` | `NotFound` | `src/pages/NotFound/NotFound.tsx` | Not found. |
| `/privacy` | `Legal` | `src/pages/Legal/Legal.tsx` | Legal document, one renderer over a content module. |
| `/terms` | `Legal` | `src/pages/Legal/Legal.tsx` | Legal document, one renderer over a content module. |
| `/security` | `Legal` | `src/pages/Legal/Legal.tsx` | Legal document, one renderer over a content module. |
| `/dpa` | `Legal` | `src/pages/Legal/Legal.tsx` | Legal document, one renderer over a content module. |
