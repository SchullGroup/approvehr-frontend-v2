# Components and functions — ApproveHR landing site

_Repo:_ `aprrovehr-frontend` · _Generated from_ `src/**/*.{ts,tsx}`

The smallest of the three frontends. Every exported symbol, grouped by folder.

| Group | Files | Components | Hooks | Functions |
|---|---:|---:|---:|---:|
| [Layout — `src/layout`](#layout-src-layout) | 1 | 1 | 0 | 0 |
| [Components — `src/components`](#components-src-components) | 14 | 33 | 0 | 0 |
| [Pages — `src/pages`](#pages-src-pages) | 11 | 11 | 0 | 0 |
| [Content — `src/data`](#content-src-data) | 5 | 0 | 0 | 14 |
| [Helpers — `src/lib`, `src/services`](#helpers-src-lib-src-services) | 2 | 0 | 0 | 2 |
| [Everything else](#everything-else) | 2 | 1 | 0 | 0 |
| **Total** | **35** | **46** | **0** | **16** |

---

## Layout — `src/layout`

The marketing shell: nav, footer, page frame.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/layout/MarketingLayout.tsx` | `MarketingLayout` | — | — | — |

---

## Components — `src/components`

Sections, cards, mockups and the page transition wrapper.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/components/ErrorBoundary.tsx` | — | — | — | `ErrorBoundary` (class) |
| `src/components/PageWrapper.tsx` | `PageWrapper` | — | — | — |
| `src/components/StatusPage.tsx` | `StatusPage` | — | — | — |
| `src/components/marketing/chrome.tsx` | `AnnouncementBar`, `MarketingNav`, `MarketingFooter` | — | — | — |
| `src/components/marketing/legal.tsx` | `LegalDocument` | — | — | — |
| `src/components/marketing/mockups.tsx` | `Bar`, `Dot`, `PayrollMockup`, `PipelineMockup`, `PayrollCardMockup`, `LeaveMockup`, `RecordMockup`, `ReviewMockup`, `DeskMockup`, `StatutoryMockup` | — | — | — |
| `src/components/marketing/module-mockups.tsx` | — | — | — | 1 const |
| `src/components/marketing/motion.tsx` | `Reveal`, `Marquee`, `CountUp` | — | — | — |
| `src/components/marketing/payroll-figures.tsx` | `PayrollTotalFigure`, `PayrollRowFigures` | — | — | — |
| `src/components/marketing/pill.tsx` | `Pill`, `PillButton`, `LearnMore` | — | — | — |
| `src/components/marketing/platform-overview.tsx` | `PlatformOverview` | — | — | — |
| `src/components/marketing/sections.tsx` | `SectionHeading`, `ModuleCard`, `ModuleGrid`, `ProofRow` | — | — | — |
| `src/components/marketing/social-proof.tsx` | `ClientLogos`, `Testimonials` | — | — | 1 const |
| `src/components/brand/logo.tsx` | `LogoMark`, `Logo` | — | — | — |

---

## Pages — `src/pages`

One folder per screen.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/pages/NotFound/NotFound.tsx` | `NotFound` | — | — | — |
| `src/pages/Careers/ApplyForm.tsx` | `ApplyForm` | — | — | — |
| `src/pages/Careers/CareersList.tsx` | `CareersListPage` | — | — | — |
| `src/pages/Careers/RolePage.tsx` | `RolePage` | — | — | — |
| `src/pages/Pricing/Pricing.tsx` | `PricingPage` | — | — | — |
| `src/pages/Pricing/PricingCalculator.tsx` | `PricingCalculator` | — | — | — |
| `src/pages/Legal/Legal.tsx` | `Legal` | — | — | — |
| `src/pages/Demo/Demo.tsx` | `DemoPage` | — | — | — |
| `src/pages/Demo/DemoForm.tsx` | `DemoForm` | — | — | — |
| `src/pages/Home/Home.tsx` | `HomePage` | — | — | — |
| `src/pages/Product/Product.tsx` | `ModulePage` | — | — | — |

---

## Content — `src/data`

The words and figures the site renders. Nothing here is fabricated proof.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/data/marketing/careers.ts` | — | — | `formatNaira`, `payRange`, `workTypeLabel`, `readableDate`, `listRoles`, `getRole`, `apply` | 2 const · 7 types |
| `src/data/marketing/legal.ts` | — | — | — | 3 const · 3 types |
| `src/data/marketing/links.ts` | — | — | `newTabIfApp`, `liveProductCta`, `appNavLinks` | 2 const · 1 type |
| `src/data/marketing/modules.ts` | — | — | `moduleById` | 3 const · 3 types |
| `src/data/marketing/pricing.ts` | — | — | `tierFor`, `quote`, `cumulativeIncludes` | 2 const · 3 types |

---

## Helpers — `src/lib`, `src/services`

Formatting, the careers API client and anything else shared.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/services/marketing/demo.ts` | — | — | `submitDemoRequest` | 1 const · 3 types |
| `src/lib/cn.ts` | — | — | `cn` | — |

---

## Everything else

Entry points and loose files.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/App.tsx` | `App` | — | — | — |
