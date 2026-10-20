# Track 7, step 2: visual audit of the ApproveHR web app

**Date:** 2026-10-20 · **Base:** `base/staging-20261020` (origin/staging as of 2026-10-18) · **Status:** interim: priority families scored; remaining families follow

> Read-only audit: no UI code was changed. Every screen below was opened in a real browser on a populated demo tenant, at desktop (1440×900) and phone (390×844), as the roles that can reach it, and then looked at. The scores are a judgement made from the screenshots, with objective measurements beside them; they are not computed from the measurements.

## 1. Summary

*Interim summary: written after the priority families (payroll run wizard, performance, payroll, dashboard). It is replaced when the remaining families are scored.*

- **Scores so far** (overall, 1 to 5): 1: 0 · 2: 2 · 3: 15 · 4: 20 · 5: 0.
- **The wizard's Review step is the worst payroll screen**, not the wizard as a whole. Check, Period and Approved are sound; Review packs seven columns and four tiny underlined controls into every payslip row, and Approve puts the consequences below two cards about money you are not deciding.
- **The performance module is better than its reputation at desktop width.** Its Overview and the review record are good. The one screen that needs a redesign is the period screen (`/performance/periods/[id]`): it is the largest screen in the app and everything about it is flat.
- **Phone layout holds everywhere measured.** No route scrolls sideways at 390 px on any screen swept. The phone problem is length and stacking (four stat cards before content, ten near-identical cards), not breakage.
- **Not visual, but found on the way** (see the findings section): the app's "today" is a constant (`TODAY = "2026-08-19"`, used by 57 files), so the payroll wizard opens on August in October; the sign-in screen tries to fetch `approvehr.io/privacy` and `/terms` from the browser and its own CSP blocks both.

## 2. Method

**Stack.** A private copy of the stack, so nothing shared was touched: API on `base/staging-20261020` (own worktree, own databases `approvehr_audit` and `approvehr_audit_test`, port 8461) seeded with `npm run demo` (seed, demo company, demo performance cycle); web app built from this branch with `next build` and served with `next start` on port 3461. A **production build** was used on purpose: it has no dev overlay, and demo mode compiles out, so what was audited is the connected product that ships (`DEMO_ENABLED` is false in production builds).

**Browser.** Playwright driving the system Chrome (`channel: "chrome"`), headless, reduced-motion on so screenshots are stable. Desktop is 1440×900 at scale 1; phone is 390×844 at scale 2 with mobile emulation and touch. Each width signs in separately through the real sign-in screen (refresh tokens rotate, so one session is never shared between two contexts).

**Roles.** Administrator (Amara) for the full sweep; HR manager (Fatima), Payroll analyst (Grace), Finance approver (Tunde), Line manager (Adaeze) and Employee (Emeka) for everything each of them can reach in the sidebar, plus deliberate probes at screens they should *not* reach, to see the refusal states.

**Routes.** All `page.tsx` files on the base: 142 route patterns in `src/app` (the roadmap said 143; the base has 142). 127 are signed-in routes, resolved with real ids from the demo database for every `[id]`; 17 are signed-out or public (auth, public careers, pricing, internal). Pages with a tab bar were walked tab by tab. The payroll wizard was driven step by step, opening and cancelling every dialog (nothing was confirmed that moves money; a fresh October run was prepared in the private tenant).

**Signals recorded per route** (in `scores.csv`): page height at both widths, horizontal overflow on phone (tested by actually scrolling, not by `scrollWidth`), console errors, failed API calls, count of interactive elements, tap targets under 44 px on phone, whether an empty state or skeleton was present. Loading and error states were captured separately by delaying and failing the API.

**Not scored from numbers.** Priority families were read at full size; the rest through contact sheets, desktop and phone.

## 3. Rubric

Each criterion is 1 to 5. Overall is a judgement, weighted toward hierarchy and grouping, not a mean.

| Score | Meaning | What it implies for the rebuild |
|---|---|---|
| 5 | Nothing to change structurally | Re-skin only |
| 4 | Sound; one small regrouping or label change | Re-skin plus a small fix |
| 3 | Works, with one structural weakness | Re-arrange the screen; keep the data |
| 2 | Hard to read or use: density, hierarchy or action placement fails | Redesign the layout |
| 1 | Rebuild | Start again |

**Criteria.** *Grouping*: related information together, unrelated apart. *Hierarchy*: is the main thing obvious in the first screenful. *Density*: how much per screen, too much or too sparse. *States*: empty, loading and error. *Actions*: where the buttons sit, whether the primary one is findable and the destructive one is kept apart. *Phone*: does the layout hold at 390 px.

**Effort.** S: a day or less, mostly a re-skin onto shared patterns. M: a few days, the screen is re-arranged. L: a week or more, the screen is redesigned and has several states.

## 4. Priority family 1: the payroll run wizard (`/payroll/runs/new`)

Four steps (Period, Check, Review, Approve), plus the approved-run state where payment starts. Walked as the Administrator at both widths: every step, the in-review run (September), the approved run (August), a fresh month (October), and each dialog opened and cancelled.

| Step | G | H | D | S | A | P | Overall |
|---|---|---|---|---|---|---|---|
| Period | 4 | 4 | 3 | 4 | 4 | 4 | 4 |
| Check | 4 | 4 | 4 | 3 | 3 | 4 | 4 |
| **Review** | 3 | **2** | **2** | 3 | **2** | 3 | **2** |
| Approve | 3 | **2** | 3 | 4 | 3 | 3 | 3 |
| Approved: pay | 4 | 4 | 3 | 4 | 3 | 3 | 4 |
| Fresh month (nothing calculated) | 4 | 4 | 4 | 5 | 4 | 4 | 4 |
| Dialogs and sheets | 4 | 4 | 4 | 4 | 4 | 4 | 4 |

**What works, and should survive the rebuild.** The stepper becomes a "Step 3 of 4" progress bar on phone. Every dialog leads with its consequence ("This is the one step that cannot be undone from here. It will: …") and becomes a bottom sheet on phone. The fresh-month state is the best empty state in the app: one sentence, one button ("Calculate October 2026"). The Check step is one card for the calculation and one list for "worth a look", and stops there.

**Review is the problem.**
- Seven columns (Employee, Gross, Overtime, Bonus, PAYE, Deductions, Net). Each row carries four small underlined text controls ("Add hours", "Add", "Change", "Add or edit a deduction"). With ten people that is 40+ links with identical text; with 300 it is 1,200.
- The four controls edit in two different ways: overtime and PAYE open an inline editor with two icon buttons well under 44 px; bonus and deduction open a dialog. Same table, two interaction models.
- Editable values (PAYE, deductions) and read-only values (Gross, Net) are the same weight; the only difference is a dotted underline. The one number a reader came to check (Net) is the lightest thing in the row.
- The Deductions cell prints a total above a box that repeats the same amount as its first line (₦152,000.00 twice).
- On phone each payslip becomes a card, which is the right instinct, but ten of them make a 4,666 px page with no filter, search or "show only people with an adjustment".
- Target: a sortable data table with a filter toolbar ("All / With adjustments / With warnings"), one edit pattern (row drawer or the existing dialog), and the net figure as the emphasised column. Arc free: Sortable data table, Filter toolbar, Dialog, Drawer. Effort L.

**Approve ranks the information backwards.** The page opens on the wallet ("Available now ₦-9,400,272.00", "Short by ₦18,600,544.00", a low-balance callout), then the bank register download, and only then "What leaves the account" and "What approving does". The decision being made is below two cards about funding it. The primary action lives in a floating bar that, in a full-page capture, cuts across the middle of the content. The consequences are already written well; they only need to move to the top, with the wallet reduced to one line and the register download to a secondary action. Effort M.

**Period.** The five-row pre-flight checklist ("What you deduct is decided", "A default PAYE state is set", …) renders as five bordered cards even when every one passes. All-pass should be one line. The default month is August 2026 when the date is 20 October (see findings: `TODAY` is hard-coded). Effort S.

**Approved run.** "Pay ₦9,400,272.00 to 10 people" and "Download the bank file" are two clear paths; the footer carries a disabled "Already approved" button that does nothing. Remove it.

**Cancel this payroll** is a red button inside the stepper row, level with the step labels. A destructive action next to navigation is easy to hit; it belongs in an overflow menu in the page header.

## 5. Priority family 2: performance (`/performance/**`)

17 routes. The module's own sub-navigation lives in the sidebar (Overview, KPIs, Weekly tasks, Competency ratings, Appraisal periods, Objectives to agree, Who appraises whom), so most screens have no tab bar of their own; the exceptions are the Overview's three inner tabs and the KPI scope tabs.

**Better than its reputation, except one screen.** At desktop width the Overview, KPIs, the review record, the score history, the approvals queue and the weekly tasks page all score 3 or 4: a consistent page header with breadcrumb, a row of stat cards, then cards. The Overview's "2 things need you" hero is the right idea for the whole app. The Objectives-to-agree empty state ("Nothing waiting") is a model.

**The period screen (`/performance/periods/[id]`) scores 2 and is the largest screen in the app** (2,795 px desktop, 5,638 px phone, 66 interactive elements).
- Six equal-weight action pills under the title (Sections and subsections, See the report, Nine-box, Move to calibration, Nudge who is late, Publish the results). Two are navigation, two are stage changes, one publishes results to employees; nothing separates them.
- Four stat cards whose descriptions are cut off mid-word ("Asked across the self and mana…").
- "Still to come in" is eight sentences, each ending "Open it", under three metric cards. This is a table wearing a list's clothes.
- "Where the marks stand" is the real table, and its Score cell prints the headline mark plus a five-part breakdown ("Delivery against objectives 83.5% · Core competencies 91.67% · …") right-aligned and wrapped into four lines; the name column wraps "Adaeze / Okonkwo". Every row repeats "Ask colleagues" and "Send back" buttons.
- Target: page header with a stage indicator and a single primary action for the current stage; tabs (Overview, Outstanding, Marks, Appraisers); a sortable table with the breakdown behind a row expander. Arc free: Page header, Tabs, Stepper, Sortable data table, Filter toolbar, Metric card. Effort L.

**Smaller issues.**
- "Start an appraisal period" appears in the header of Overview, KPIs, Competency ratings and Weekly tasks, where it is not what the page is for, and twice on the Periods list (header and inline).
- The draft-a-period page says "Step 1 of 4" and shows no stepper.
- Competency ratings is a 4,800 px list (7,001 px on phone) with no collapsing by category.
- "How appraisals work" is nine paragraphs of prose in an app screen; it reads as help content and would sit better as expandable answers in the help desk.
- On phone, four stat cards stack to a screen of numbers before the first real item (KPIs, Competency ratings, Who appraises whom), and the Overview's tab bar clips with no scroll cue.

## 6. Payroll beyond the wizard (`/payroll/**`)

12 routes, mean overall 3.8: the strongest family audited so far. Pay setup (tabs with a consistent table), the payment batch ("Everything adds up" reconciliation), the wallet, loans, expenses and the payslip document all score 4. The payslip is print-style, works on phone, and is a good model of an information-dense page that is still easy to read.

Weaknesses are about ordering and stacking, not density:
- **Statutory filings** leads with a large explanatory warning ("Nothing to file, and what that means") before the schedules the page exists to show.
- **Pay early** stacks three callouts (you cannot draw right now; this is an estimate; nothing waiting) above the figures.
- **Payslips** puts the "Send the payslips" panel above the distribution list it acts on.
- **Phone:** the payroll home, payslips and payment pages put four to five stat cards in a single column ahead of the content; the Pay setup tab bar clips ("Extras" cut off) with no scroll cue.

## 7. Dashboard (`/dashboard`)

Overall 3. "Needs you" at the top is right. After it, nine widgets share an uneven two-column masonry that leaves dead space (beside Last payslip, beside Appraisals); "7 requests waiting for a decision" is said in "Needs you" and again as a stat card two inches below; the stat row wraps into an orphan; "Start something" is eight tiles. 4,541 px on phone. The page is customisable (a Customise drawer exists), which is the right mechanism; what is missing is a strong default for each role.

Target: page header, a single row of metric cards, a two-column grid of cards of equal height, quick actions collapsed into a Command-palette entry point. Arc free: Page header, Metric card, Card, Progress, Command palette. Effort M. Track 2's "Today" panel lands here, so this screen should be redesigned together with it rather than before it.

## Ranked list, worst first

Screens scoring 3 or below, ordered by overall score, then by the sum of the six criteria. "Why" is the one-line reason from the route table.

| # | Screen | Family | Overall | Effort | Why |
|---|---|---|---|---|---|
| 1 | `/performance/periods/01a15822-793b-7168-938c-75e07c777064`  | Performance | 2 | L | Largest screen (2,795px desktop, 5,638px phone): six equal-weight action pills, truncated stat cards, outstanding forms as a text list, and a marks table whose Score cel… |
| 2 | `/payroll/runs/new?period=2026-09&step=review` Wizard step 3: Review | Payroll wizard | 2 | L | Seven columns and four tiny underlined controls per row (40+ identical links); overtime and PAYE edit inline, bonus and deduction open dialogs; deductions total repeated… |
| 3 | `/performance/skills`  | Performance | 3 | M | 4,800px desktop list (7,001px phone) of competencies with dashed level bars; categories are not collapsible |
| 4 | `/dashboard`  | Dashboard | 3 | M | Nine widgets in an uneven two-column masonry with dead space; '7 requests waiting' is said twice (Needs you and a stat card); 4,541px on phone |
| 5 | `/payroll/statutory`  | Payroll | 3 | M | Leads with an explanatory warning callout before the schedules you came for |
| 6 | `/performance/periods/01a15822-793b-7168-938c-75e07c777064/nine-box`  | Performance | 3 | M | Nine-cell grid repeats long descriptions and 'Nobody' filler in every cell |
| 7 | `/performance/periods`  | Performance | 3 | S | Almost empty page: one period row, and the same 'Start an appraisal period' action appears twice (header and inline) |
| 8 | `/performance/periods/01a15822-793b-7168-938c-75e07c777064/report`  | Performance | 3 | M | Report is four tables and a chart in one 6,192px phone scroll; no way to jump between them |
| 9 | `/performance/appraisers`  | Performance | 3 | M | Good problem framing (people with no appraiser), but ten rows each with a Change button, and the 'only what is wrong' toggle is easy to miss; 3,797px on phone |
| 10 | `/payroll/advances`  | Payroll | 3 | S | Three callouts stack above the figures (cannot draw, estimate, nothing waiting) |
| 11 | `/payroll/runs/new?period=2026-09&step=approve` Wizard step 4: Approve | Payroll wizard | 3 | M | What approving does and the totals sit below the wallet and bank-register cards; the primary action is a floating bar; negative 'Available now' reads oddly |
| 12 | `/performance/how-it-works`  | Performance | 3 | S | Reads as a document of nine prose sections rather than a screen; belongs in a help context as expandable answers |
| 13 | `/performance/reviews/01a15822-7d47-70c3-8067-6c3316c4f61f/answer`  | Performance | 3 | M | Admin is redirected away from /answer; see the payroll-role capture for the focus-mode screen |
| 14 | `/performance/kpis/import`  | Performance | 3 | M | Import screen: see people/import family |
| 15 | `/payroll/payslips`  | Payroll | 3 | M | Five stacked sections; the 'send the payslips' panel sits above the distribution list it acts on |
| 16 | `/performance/periods/new`  | Performance | 3 | S | 'Step 1 of 4' is labelled but no stepper is shown; a single form on an otherwise empty page |
| 17 | `/performance/kpis`  | Performance | 3 | M | Good cascade of objectives with filters; on phone four stat cards stack to a screen before any objective |

### Scores by family

| Family | Screens scored | Mean overall | Worst screen |
|---|---|---|---|
| Payroll wizard | 7 | 3.57 | `/payroll/runs/new?period=2026-09&step=review` (2) |
| Performance | 17 | 3.29 | `/performance/periods/01a15822-793b-7168-938c-75e07c777064` (2) |
| Payroll | 12 | 3.75 | `/payroll/statutory` (3) |
| Dashboard | 1 | 3.0 | `/dashboard` (3) |

## Findings that are not visual

Found while walking, outside this step's remit and not fixed here.

1. **`TODAY` is a constant.** `src/lib/today.ts` exports `TODAY = "2026-08-19"` and 57 files import it, in a connected production build. The payroll wizard's default month is built from it, so on 20 October it opens on August 2026 ("August 2026 is already prepared") rather than October. Any "days since" arithmetic that uses it is anchored to the demo day. HANDOVER.md records this as the demo's "now"; in a build with no demo it is a wrong claim. Worth fixing before the wizard is rebuilt, because the rebuilt wizard would inherit it.
2. **The sign-in screen fetches the landing site and its own CSP blocks it.** Two console errors on every signed-out page (and on every sign-in): `Connecting to 'https://approvehr.io/privacy' violates … connect-src` and the same for `/terms`. The footer's Privacy and Terms links work as plain links; the `fetch` does not.
3. **`/people/leave` calls an endpoint that does not exist on this API revision**: `GET /leave/balances?employeeIds=…` returns 404 (one red callout on the screen). It may be a web/API revision skew rather than a bug.
4. **`/design-system` renders a not-found page in a production build** and logs 11 console errors, so the internal component showcase cannot be used to review the rebuilt primitives in place.
5. **Recruitment candidate links take a different id than the pipeline gives them.** `/hiring/candidates/[id]` returned 404s on both ids tried (application id and candidate id) until real links were taken from the pipeline page; see the Recruitment section.

## Route table

G grouping, H hierarchy, D density, S states, A actions, P phone. 1 to 5, higher is better. "Arc free pattern" names the free-tier Arc pieces the screen would be built from; where only a Pro block fits, the free pieces it would be composed from are named, never the Pro block. The full table with measurements is in [`scores.csv`](./scores.csv).

| Route | Family | G | H | D | S | A | P | Overall | Arc free pattern | Effort |
|---|---|---|---|---|---|---|---|---|---|---|
| `/payroll/runs/new` — Wizard step 1: Period | Payroll wizard | 4 | 4 | 3 | 4 | 4 | 4 | **4** | Stepper + Card + Date picker | S |
| `/payroll/runs/new` — Wizard step 2: Check | Payroll wizard | 4 | 4 | 4 | 3 | 3 | 4 | **4** | Stepper + Card + Callout list | S |
| `/payroll/runs/new` — Wizard step 3: Review | Payroll wizard | 3 | 2 | 2 | 3 | 2 | 3 | **2** | Sortable data table + Dialog + Popover | L |
| `/payroll/runs/new` — Wizard step 4: Approve | Payroll wizard | 3 | 2 | 3 | 4 | 3 | 3 | **3** | Stepper + Metric card + Dialog | M |
| `/payroll/runs/new` — Wizard step 4: Approved run, pay and send | Payroll wizard | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Stepper + Card + Dialog | S |
| `/payroll/runs/new` — Wizard: fresh month, nothing calculated | Payroll wizard | 4 | 4 | 4 | 5 | 4 | 4 | **4** | Empty state + Stepper | S |
| `/payroll/runs/new` — Wizard dialogs and sheets | Payroll wizard | 4 | 4 | 4 | 4 | 4 | 4 | **4** | Dialog + Bottom sheet | S |
| `/performance` — default tab | Performance | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Page header + Tabs + Accordion + Empty state | M |
| `/performance` — 'now' tab (Overview) | Performance | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Page header + Tabs + Accordion + Empty state | M |
| `/performance/periods` — periods list | Performance | 3 | 3 | 3 | 3 | 2 | 3 | **3** | Page header + Empty state + Card | S |
| `/performance/periods/[id]` — period screen [id] | Performance | 3 | 2 | 2 | 3 | 2 | 2 | **2** | Page header + Tabs + Stepper + Sortable data table + Filter toolbar + Metric card | L |
| `/performance/periods/[id]/nine-box` — nine-box | Performance | 3 | 3 | 2 | 3 | 3 | 3 | **3** | Card + Tooltip + Metric card | M |
| `/performance/periods/[id]/report` — period report | Performance | 3 | 3 | 3 | 4 | 3 | 2 | **3** | Metric card + Sortable data table + Tabs | M |
| `/performance/periods/new` — start-a-period wizard | Performance | 3 | 3 | 4 | 3 | 3 | 4 | **3** | Stepper + Card + Textarea | S |
| `/performance/kpis` — objectives (kpis) | Performance | 4 | 4 | 3 | 4 | 3 | 3 | **3** | Metric card + Filter toolbar + Card | M |
| `/performance/kpis/import` — kpi import | Performance | 3 | 3 | 4 | 3 | 3 | 3 | **3** | File dropzone + Stepper | M |
| `/performance/approvals` — objective approvals queue | Performance | 4 | 4 | 4 | 5 | 3 | 4 | **4** | Empty state + Page header | S |
| `/performance/appraisers` — appraiser mapping | Performance | 3 | 3 | 3 | 3 | 3 | 3 | **3** | Sortable data table + Filter toolbar + Metric card | M |
| `/performance/review-tasks` — review tasks | Performance | 3 | 3 | 4 | 4 | 3 | 4 | **4** | Page header + Empty state + Textarea | S |
| `/performance/skills` — skills | Performance | 3 | 3 | 2 | 3 | 3 | 2 | **3** | Accordion + Progress + Sortable data table | M |
| `/performance/how-it-works` — how it works | Performance | 3 | 3 | 3 | 3 | 4 | 3 | **3** | Accordion (FAQ) + Page header | S |
| `/performance/history/[employeeId]` — score history | Performance | 4 | 4 | 4 | 4 | 3 | 3 | **4** | Metric card + Timeline + Card | S |
| `/performance/reviews/[id]` — review record (manager review) | Performance | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Page header + Timeline + Comment thread + Card | M |
| `/performance/reviews/[id]/answer` — review answer (focus mode) | Performance | 3 | 3 | 4 | 3 | 3 | 3 | **3** | Stepper + Card | M |
| `/payroll` — payroll home | Payroll | 4 | 4 | 3 | 4 | 4 | 3 | **4** | Page header + Metric card + Sortable data table | S |
| `/payroll/payslips` — payslip index | Payroll | 4 | 3 | 3 | 4 | 3 | 3 | **3** | Metric card + Filter toolbar + Sortable data table | M |
| `/payroll/payslips/[id]` — one payslip | Payroll | 5 | 4 | 4 | 4 | 4 | 4 | **4** | Card (document) | S |
| `/payroll/payments` — wallet | Payroll | 4 | 4 | 4 | 4 | 3 | 4 | **4** | Metric card + Empty state + Timeline | S |
| `/payroll/payments/[id]` — payment batch | Payroll | 4 | 4 | 3 | 4 | 4 | 3 | **4** | Metric card + Card | S |
| `/payroll/payments/history` — payment history | Payroll | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Filter toolbar + Sortable data table | S |
| `/payroll/pay-setup` — pay setup | Payroll | 4 | 4 | 3 | 4 | 4 | 3 | **4** | Tabs + Sortable data table | S |
| `/payroll/statutory` — statutory | Payroll | 3 | 2 | 3 | 3 | 3 | 3 | **3** | Page header + Sortable data table + Accordion | M |
| `/payroll/loans` — loans | Payroll | 4 | 4 | 4 | 4 | 4 | 3 | **4** | Tabs + Metric card + Sortable data table | S |
| `/payroll/loans/[id]` — loan detail | Payroll | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Metric card + Sortable data table | S |
| `/payroll/expenses` — expenses | Payroll | 4 | 4 | 3 | 4 | 4 | 3 | **4** | Tabs + Filter toolbar + Sortable data table | S |
| `/payroll/advances` — advances | Payroll | 3 | 3 | 3 | 3 | 3 | 3 | **3** | Metric card + Callout | S |
| `/dashboard` — home | Dashboard | 3 | 3 | 2 | 3 | 3 | 3 | **3** | Metric card + Card + Progress + Page header | M |

