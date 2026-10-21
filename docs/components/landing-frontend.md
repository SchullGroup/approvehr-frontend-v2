# Components and functions — ApproveHR landing site

_Repo:_ `aprrovehr-frontend` · _Generated from_ `src/**/*.{ts,tsx}`

_Snapshot:_ `origin/main` at `2dbf44b` (2026-09-24) · regenerate with `npm run docs`, never by hand

The smallest of the three frontends. Every exported symbol, grouped by folder.

| Group                                                               |  Files | Components | Hooks | Functions |
| ------------------------------------------------------------------- | -----: | ---------: | ----: | --------: |
| [Layout — `src/layout`](#layout--srclayout)                         |      1 |          1 |     0 |         0 |
| [Components — `src/components`](#components--srccomponents)         |     14 |         35 |     0 |         0 |
| [Pages — `src/pages`](#pages--srcpages)                             |     13 |         13 |     0 |         0 |
| [Content — `src/data`](#content--srcdata)                           |      6 |          0 |     0 |        14 |
| [Helpers — `src/lib`, `src/services`](#helpers--srclib-srcservices) |      3 |          0 |     0 |         3 |
| [Everything else](#everything-else)                                 |      2 |          1 |     0 |         0 |
| **Total**                                                           | **39** |     **50** | **0** |    **17** |

---

## Layout — `src/layout`

The marketing shell: nav, footer, page frame.

| File                             | Components        | Hooks | Functions | Also |
| -------------------------------- | ----------------- | ----- | --------- | ---- |
| `src/layout/MarketingLayout.tsx` | `MarketingLayout` | —     | —         | —    |

---

## Components — `src/components`

Sections, cards, mockups and the page transition wrapper.

| File                                             | Components                                                                                                                                                                     | Hooks | Functions | Also                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | --------- | ----------------------- |
| `src/components/ErrorBoundary.tsx`               | —                                                                                                                                                                              | —     | —         | `ErrorBoundary` (class) |
| `src/components/PageWrapper.tsx`                 | `PageWrapper`                                                                                                                                                                  | —     | —         | —                       |
| `src/components/StatusPage.tsx`                  | `StatusPage`                                                                                                                                                                   | —     | —         | —                       |
| `src/components/brand/logo.tsx`                  | `LogoMark`, `Logo`                                                                                                                                                             | —     | —         | —                       |
| `src/components/marketing/chrome.tsx`            | `AnnouncementBar`, `MarketingNav`, `MarketingFooter`                                                                                                                           | —     | —         | —                       |
| `src/components/marketing/legal.tsx`             | `LegalDocument`                                                                                                                                                                | —     | —         | —                       |
| `src/components/marketing/mockups.tsx`           | `Bar`, `Dot`, `PayrollMockup`, `PipelineMockup`, `PayrollCardMockup`, `LeaveMockup`, `RecordMockup`, `ReviewMockup`, `DeskMockup`, `StatutoryMockup`, `NightFrame`, `DayFrame` | —     | —         | —                       |
| `src/components/marketing/module-mockups.tsx`    | —                                                                                                                                                                              | —     | —         | 1 const                 |
| `src/components/marketing/motion.tsx`            | `Reveal`, `Marquee`, `CountUp`                                                                                                                                                 | —     | —         | —                       |
| `src/components/marketing/payroll-figures.tsx`   | `PayrollTotalFigure`, `PayrollRowFigures`                                                                                                                                      | —     | —         | —                       |
| `src/components/marketing/pill.tsx`              | `Pill`, `PillButton`, `LearnMore`                                                                                                                                              | —     | —         | —                       |
| `src/components/marketing/platform-overview.tsx` | `PlatformOverview`                                                                                                                                                             | —     | —         | —                       |
| `src/components/marketing/sections.tsx`          | `SectionHeading`, `ModuleCard`, `ModuleGrid`, `ProofRow`                                                                                                                       | —     | —         | —                       |
| `src/components/marketing/social-proof.tsx`      | `ClientLogos`, `Testimonials`                                                                                                                                                  | —     | —         | 1 const                 |

---

## Pages — `src/pages`

One folder per screen.

| File                                          | Components           | Hooks | Functions | Also |
| --------------------------------------------- | -------------------- | ----- | --------- | ---- |
| `src/pages/Careers/ApplyForm.tsx`             | `ApplyForm`          | —     | —         | —    |
| `src/pages/Careers/CareersList.tsx`           | `CareersListPage`    | —     | —         | —    |
| `src/pages/Careers/RolePage.tsx`              | `RolePage`           | —     | —         | —    |
| `src/pages/Demo/Demo.tsx`                     | `DemoPage`           | —     | —         | —    |
| `src/pages/Demo/DemoForm.tsx`                 | `DemoForm`           | —     | —         | —    |
| `src/pages/Home/Home.tsx`                     | `HomePage`           | —     | —         | —    |
| `src/pages/Legal/Legal.tsx`                   | `Legal`              | —     | —         | —    |
| `src/pages/NotFound/NotFound.tsx`             | `NotFound`           | —     | —         | —    |
| `src/pages/PayeCalculator/Calculator.tsx`     | `TaxCalculator`      | —     | —         | —    |
| `src/pages/PayeCalculator/PayeCalculator.tsx` | `PayeCalculatorPage` | —     | —         | —    |
| `src/pages/Pricing/Pricing.tsx`               | `PricingPage`        | —     | —         | —    |
| `src/pages/Pricing/PricingCalculator.tsx`     | `PricingCalculator`  | —     | —         | —    |
| `src/pages/Product/Product.tsx`               | `ModulePage`         | —     | —         | —    |

---

## Content — `src/data`

The words and figures the site renders. Nothing here is fabricated proof.

| File                                    | Components | Hooks | Functions                                                                                   | Also              |
| --------------------------------------- | ---------- | ----- | ------------------------------------------------------------------------------------------- | ----------------- |
| `src/data/marketing/careers.ts`         | —          | —     | `formatNaira`, `payRange`, `workTypeLabel`, `readableDate`, `listRoles`, `getRole`, `apply` | 2 const · 7 types |
| `src/data/marketing/legal.ts`           | —          | —     | —                                                                                           | 3 const · 3 types |
| `src/data/marketing/links.ts`           | —          | —     | `newTabIfApp`, `liveProductCta`, `appNavLinks`                                              | 2 const · 1 type  |
| `src/data/marketing/modules.ts`         | —          | —     | `moduleById`                                                                                | 3 const · 3 types |
| `src/data/marketing/nigerian-states.ts` | —          | —     | —                                                                                           | 1 const           |
| `src/data/marketing/pricing.ts`         | —          | —     | `tierFor`, `quote`, `cumulativeIncludes`                                                    | 2 const · 3 types |

---

## Helpers — `src/lib`, `src/services`

Formatting, the careers API client and anything else shared.

| File                                       | Components | Hooks | Functions           | Also              |
| ------------------------------------------ | ---------- | ----- | ------------------- | ----------------- |
| `src/lib/cn.ts`                            | —          | —     | `cn`                | —                 |
| `src/services/marketing/demo.ts`           | —          | —     | `submitDemoRequest` | 1 const · 3 types |
| `src/services/marketing/tax-calculator.ts` | —          | —     | `calculatePaye`     | 1 const · 7 types |

---

## Everything else

Entry points and loose files.

| File           | Components | Hooks | Functions | Also |
| -------------- | ---------- | ----- | --------- | ---- |
| `src/App.tsx`  | `App`      | —     | —         | —    |
| `src/main.tsx` | —          | —     | —         | —    |
