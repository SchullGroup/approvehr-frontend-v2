# Track 7, step 2: visual audit of the ApproveHR web app

**Date:** 2026-10-20 · **Base:** `base/staging-20261020` (origin/staging as of 2026-10-18) · **Status:** complete for every route reachable on this base; see Section 20 for what was not reachable

> Read-only audit: no UI code was changed. Every screen below was opened in a real browser on a populated demo tenant, at desktop (1440×900) and phone (390×844), as the roles that can reach it, and then looked at. The scores are a judgement made from the screenshots, with objective measurements beside them; they are not computed from the measurements.

## 1. Summary

**What was done.** Every route reachable on this base was opened in a real browser on a populated demo tenant, at 1440×900 and 390×844, as the six seeded roles that can reach it, and then looked at: **160 screens and states scored** (129 signed-in routes, 7 payroll-wizard steps and dialogs, 15 signed-out and public pages, 9 role probes). Loading and error states were captured separately. Nothing was changed in the app.

**The app is more consistent than the brief assumed.** **106 of 160 score 4**, 48 score 3, 5 score 2 and one scores 5; none score 1. Pages share one header, one card, one stat card, one table, one empty state and one importer. The problem is not that screens look unlike each other; it is concentrated in a handful of screens and a handful of shared behaviours.

**By criterion,** **grouping is the strongest (3.7)** and **density, actions and phone the weakest (3.3 each)**. Related information is mostly in the right place; there is too much of it on a page, and the actions on it are too small and too repeated.

**The screens that need a redesign** (score 2):
1. **Payroll run wizard, Review step** (D11 first). Seven columns and four small underlined controls per payslip row (40+ identical links for ten people), two edited inline and two in dialogs. Check, Period and the approved-run state around it are sound; Approve puts "what approving does" under two cards about funding.
2. **Appraisal period screen** (`/performance/periods/[id]`, D11 second): the largest screen in the app, with six equal-weight action pills, a text list where a table belongs, and a marks table whose Score cell wraps a five-part breakdown into four lines.
3. **Requisition screen** (`/hiring/requisitions/[id]`): the pipeline board is at the very bottom, under three configuration sections.
4. **Two permission gaps**: a plain employee can open the full admin Settings hub and the whole Run payroll wizard by URL.

**Loading and error states are the biggest shared defect.** Six screens say something false while loading (Payslips: "this month has no payslips"; Attendance: "You have not clocked in today" beside a live Clock in button), and after a failed request at least ten show the failure callout and then an empty state with a call to action under it ("No adverts yet", "Nothing waiting on you"). The sign-in screen's error states are the model to copy.

**Family means:** settings 3.8, payroll 3.8, people 3.7, recruitment 3.6, performance 3.4. Performance is the lowest multi-screen family, but only its period screen scores 2, nine score 3 (mostly long lists and a repeated header action) and seven score 4 or 5; the payroll wizard's problem is one table. The dashboard (3) and the role dashboards (3) are the next-weakest, and are best redesigned together with Track 2's Today panel.

**Phone.** No screen at any width scrolls sideways, for any role. The phone problems are length and stacking: 37 of 127 screens are more than three phone screens tall, seven exceed 5,000 px, and four stat cards in a column push content a screen down on a dozen screens.

**Arc.** The free tier is enough. The one Pro gap that costs is the **data grid** (the wizard's Review table and the period marks table need inline editing and row detail); it is composed from the free Sortable data table, Filter toolbar, Drawer and Dialog. D8 stands.

**Not visual, but found on the way** (Section 19): the app's "today" is a hard-coded `2026-08-19` (so the wizard opens on August in October), help articles show raw Markdown, the leave screen asks for a batch balances route this API revision does not have, and the footer's prefetch of redirected marketing routes trips the app's own CSP. Seven of the 142 routes are not served by this app (they redirect to `approvehr.io`), so the marketing step must start in the landing repo.

**Effort**, from the route table: 117 screens are S (re-skin), 40 are M (re-arrange) and 3 are L (redesign). These are screen-level only; the shared fixes in Section 17 (loading and failure rule, compact metric card, row-actions menu, not-found state) come first and each touches several dozen screens.

## 2. Method

**Stack.** A private copy of the stack, so nothing shared was touched: API on `base/staging-20261020` (own worktree, own databases `approvehr_audit` and `approvehr_audit_test`, port 8461) seeded with `npm run demo` (seed, demo company, demo performance cycle); web app built from this branch with `next build` and served with `next start` on port 3461. A **production build** was used on purpose: it has no dev overlay, and demo mode compiles out, so what was audited is the connected product that ships (`DEMO_ENABLED` is false in production builds).

**Browser.** Playwright driving the system Chrome (`channel: "chrome"`), headless, reduced-motion on so screenshots are stable. Desktop is 1440×900 at scale 1; phone is 390×844 at scale 2 with mobile emulation and touch. Each width signs in separately through the real sign-in screen (refresh tokens rotate, so one session is never shared between two contexts).

**Roles.** Administrator (Amara) for the full sweep; HR manager (Fatima), Payroll analyst (Grace), Finance approver (Tunde), Line manager (Adaeze) and Employee (Emeka) for everything each of them can reach in the sidebar, plus deliberate probes at screens they should *not* reach, to see the refusal states.

**Routes.** All `page.tsx` files on the base: 142 route patterns in `src/app` (the roadmap said 143; the base has 142). 127 signed-in routes (plus two extra candidate pages for careers-page applicants) were resolved with real ids from the demo database for every `[id]`; 17 signed-out or public pages (auth, public careers, pricing, not-found) were captured, 15 of them scored separately because two repeat an in-app screen. Pages with a tab bar were walked tab by tab. The payroll wizard was driven step by step, opening and cancelling every dialog (nothing was confirmed and no Calculate or Approve button was pressed, so the demo tenant kept the two payroll runs it started with; the October state shown is the empty "Nothing calculated yet" step, not a calculated run).

**Signals recorded per route** (in `scores.csv`): page height at both widths, horizontal overflow on phone (tested by actually scrolling, not by `scrollWidth`), console errors, failed API calls, count of interactive elements, tap targets under 44 px on phone, `h1` count, which empty state was shown, what the screen shows at 250 ms, what it shows when the API is slow (six seconds) and what it shows when the API fails (HTTP 500 on every data request). The last two come from separate passes at desktop width.

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

**Better than the roadmap's "known worst" label suggests, except one screen.** At desktop width the Overview, KPIs, the review record, the score history, the approvals queue and the weekly tasks page all score 3 or 4: a consistent page header with breadcrumb, a row of stat cards, then cards. The Overview's "2 things need you" hero is the right idea for the whole app. The Objectives-to-agree empty state ("Nothing waiting") is a model.

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

12 routes, mean overall 3.75, second only to settings. Pay setup (tabs with a consistent table), the payment batch ("Everything adds up" reconciliation), the wallet, loans, expenses and the payslip document all score 4. The payslip is print-style, works on phone, and is a good model of an information-dense page that is still easy to read.

Weaknesses are about ordering and stacking, not density:
- **Statutory filings** leads with a large explanatory warning ("Nothing to file, and what that means") before the schedules the page exists to show.
- **Pay early** stacks three callouts (you cannot draw right now; this is an estimate; nothing waiting) above the figures.
- **Payslips** puts the "Send the payslips" panel above the distribution list it acts on.
- **Phone:** the payroll home, payslips and payment pages put four to five stat cards in a single column ahead of the content; the Pay setup tab bar clips ("Extras" cut off) with no scroll cue.

## 7. Dashboard (`/dashboard`)

Overall 3. "Needs you" at the top is right. After it, nine widgets share an uneven two-column masonry that leaves dead space (beside Last payslip, beside Appraisals); "7 requests waiting for a decision" is said in "Needs you" and again as a stat card two inches below; the stat row wraps into an orphan; "Start something" is eight tiles. 4,541 px on phone. The page is customisable (a Customise drawer exists), which is the right mechanism; what is missing is a strong default for each role.

Target: page header, a single row of metric cards, a two-column grid of cards of equal height, quick actions collapsed into a Command-palette entry point. Arc free: Page header, Metric card, Card, Progress, Command palette. Effort M. Track 2's "Today" panel lands here, so this screen should be redesigned together with it rather than before it.

## 8. People: Core HR, time and leave (`/people/**`)

26 routes, mean 3.73. The most consistent family: a page header with breadcrumb, a row of stat cards, then a table or list, with the same importer (file dropzone, template download, three steps) reused across the app. The directory, employee record (identity rail plus tabs), department detail, attendance and the add-employee stepper all score 4.

What pulls scores down:
- **Departments** (`/people/departments`): each row carries five icon-only buttons (assign people, assign head, add, edit, delete); 38 tap targets under 44 px on phone. A row menu would remove four of them.
- **Exit detail** (`/people/offboarding/[id]`): nine checklist items with three controls each (checked by, say what happened, give it to somebody); 3,135 px desktop, 4,798 px phone, 46 small targets. A checklist with a progress bar is the right idea; the per-item controls need to collapse until the item is opened.
- **Shifts**: the rota is a hand-built week calendar with tiny cells (Arc's week calendar is a Pro block, so this is built from table, badge and tabs); on phone it scrolls sideways inside its card.
- **Org chart** is a nested list, not a chart.
- **Leave** and **Attendance** show zeros and "Nobody has booked leave yet" while loading, and the screen asks for balances through `GET /leave/balances?employeeIds=`, a batch route this API revision does not define (404), so it renders without them ("Annual leave used —") and tells nobody.
- **Overtime** and the **payroll wizard** both default to August 2026 (see findings).
- Empty states are consistent and good (Probation, Onboarding, Signatures, Incomplete records, One-to-ones). A missing one-to-one is the exception: it is a red error ("did not load") rather than a calm not-found.

## 9. Recruitment (`/hiring/**`)

28 routes (26 plus two candidate variants captured separately), mean 3.61. The overview, adverts, applications, offers, the new-role stepper and the seven-tab Hiring settings are consistent and score 4.

**The requisition screen (`/hiring/requisitions/[id]`) scores 2 and is the clearest structural failure after the wizard's Review step.** It is one long column (3,121 px desktop, 5,111 px phone, 99 interactive elements, 85 under 44 px on phone) in this order: role details; "Who can see this job" (a restricted-job switch, a score-visibility select, who has access, a change log); the four careers-page applicants as cards; the pipeline-stage editor (move up, move down, edit, delete per stage); and, at the very bottom, the pipeline board that recruiters actually work in, followed by "Stage emails and interview panels". The working surface is under three configuration sections. Target: tabs for Pipeline (default), Applicants, Access and Stages; the board first. The board is a Kanban (Pro in Arc), so it stays hand-built and is restyled with Card, Badge and Dialog. Effort L.

Other findings:
- **Candidate page.** For a person added by hand (no careers-page application) it prints three red "no application, score or answers to read" errors, one with a Try again that cannot help, over an empty assessment form; the page also tries two endpoints and logs two 404s. For somebody who applied through the careers page it is sound on desktop, but on phone an identity rail fills two screens before their application text and the Screen in / Turn down buttons.
- **Careers page settings** (2,226 px) and **Hiring emails** (4,129 px desktop, 5,885 px phone) are long single columns with no section navigation or collapsing.
- Recruitment settings (7 tabs) and the general `/settings/*` (24 pages) are two separate settings areas reached from two places.
- Candidates, interviews and offers read well. `My interviews` could only be seen in its empty state because the seed has no interview panelists.

## 10. Settings (`/settings/**`)

25 routes, mean 3.84, the highest family. Individual settings pages are consistent (stat cards, then cards or a table, one save pattern) and most score 4. The problems are navigation and a few long pages.

- **The hub is the only way in, and it does not list everything.** There are 24 settings pages. `/settings` links 18 of them as cards (4,045 px on phone); five more (Locations, Leave policies, Bank accounts, Payroll settings, Roles) appear only inside the collapsed "Setting up your company" checklist; Integrations and Webhooks are linked from neither. The sidebar for the Settings group shows only "Settings" and "Roles". To move from Leave policies to Overtime a person goes back to the hub and picks again. This is the screen where Arc's Settings page (Pro) would help, and it can be built from free pieces: Page header, a vertical Tabs list, Card. Score 3.
- **Leave policies** (`/settings/leave`) is the worst page: leave types are a table of six inline-editable fields per row; 2,590 px desktop and 7,185 px on phone with 78 tap targets under 44 px. Score 3.
- **Roles and permissions** squeezes each role's description into a one-word-wide column on phone beside People / Open / Copy.
- **Appraisal scoring** and **Payroll settings** are good models of a form with a live consequence beside it (a running 100% total; a payslip preview).
- **A plain employee can open the full Settings hub** (see Role probes).

## 11. Help, and the other signed-in screens

**Help** (3 routes, mean 3.67): the help desk (stats, what people ask about, the queue) and the article list are clear. **The article body shows raw Markdown**: `**Gross**`, `**PAYE**` with their asterisks.

**Other** (17 routes, mean 3.76): the approvals inbox is one of the best screens (tabs, a value-at-stake stat, filter chips, Approve / Send back on each row). The profile, documents, equipment, surveys, assistant and ask screens are simple and fine; the assistant and ask screens are two entry points for nearly one job. Weaker:
- **Notifications** (score 3): 22 unread in a flat list, ten of them near-identical "rating was recorded" items, each with Open, tick and cross; 2,837 px desktop, 77 small tap targets on phone. This is where Arc's Notification center (free) earns its place: grouping and a summary line.
- **Billing** (`/billing/pay`): three plan cards that do not line up, a disabled Continue, and a failed request to `/billing/checkout`.
- **Reports / Explore**: an orbitable sphere visualisation that shows two or three spheres by default and has no table equivalent; hard to read and to use by touch.
- **Projects** is off for this tenant and renders a calm "not switched on" state (the `projects-*` branches are already in this base; the module was not populated here, so only the off state was scored).

## 12. Auth and public pages

**Auth** (9 screens, mean 3.67): a split layout with the form left and product art right; on phone the art drops away and only the form remains. The sign-in screen's error states are the best in the app: when the API cannot be reached it says "Cannot reach the server", that nothing was lost and nothing was signed in, what usually fixes it, and offers Try again; wrong credentials get a plain red "That did not work" callout above the fields. Weaker: the no-token states ("This link is incomplete", "Confirm your email" over a bare button) say little, and the invalid-token state reads "This link no longer works. Some fields are not valid." (validation wording). The art quotes invented figures (August payroll ₦93,004,500) as illustration; it is a drawing, but it is the first screen anybody sees.

**Public** (pricing, PAYE calculator, careers, 404): well designed and consistent, scoring 4 apart from the not-found pages. The unknown-organisation careers 404 shows the announcement bar and site header **twice**, and the 404 a signed-in person gets for a mistyped URL is the marketing one ("Book a demo").

**Not in this app.** `/demo`, `/privacy`, `/terms`, `/security`, `/dpa` and `/product/[module]` are redirected (308) by `proxy.ts` to `approvehr.io`, and `/` redirects (307) to `/dashboard`. Those pages live in the standalone landing repo and were not audited here; step 9 of the roadmap (marketing last) has to start from that repo, not this one.

## 13. What each role sees

Sidebars were read per role (drilling into every group), and every reachable screen was captured for each. The shell is role-aware and the dashboards differ, which is right. Findings:

| Role | Sidebar groups | Notes |
|---|---|---|
| Administrator | Core HR, Payroll, Recruitment, Time & Leave, Performance, Employee Support, Reports, Settings | The only role with Settings |
| HR manager | Same, without Settings | |
| Payroll analyst | Core HR (4 items), Payroll, Time & Leave, Performance, Employee Support, Reports | No Recruitment |
| Finance approver | Core HR, Payroll, Recruitment (3 items), Time & Leave, Performance, Employee Support | Has Explore at top level |
| Line manager | Core HR (5), Payroll (4), Recruitment (10), Time & Leave, Performance, Employee Support | The manager sees the whole Recruitment menu, including Hiring settings |
| Employee | Core HR (4), Payroll (4), Time & Leave, Performance, Employee Support | |

- **Two permission gaps show at the URL, not in the sidebar.** A plain employee who opens `/settings` gets the full admin Settings hub (setup progress, billing, module switches, job roles), and one who opens `/payroll/runs/new` gets the whole Run payroll wizard with a Continue button. The API refuses the writes, but the screens offer them. `/payroll` and `/people` do it correctly: a clear refusal that names the missing permission. `/people` still shows Import and Add employee in its header to somebody who cannot use either.
- **The line manager's Recruitment menu lists ten items**, including New role and Hiring settings; the finance approver gets three. That is a permission question as much as a layout one.
- **Dashboards.** The manager's is the most focused; HR, payroll and finance get the admin layout, with the same "7 requests waiting" counted twice.
- **Phone overflow.** No screen reached by any of the six roles scrolls sideways at 390 px.

## 14. Loading and error states

Captured by slowing every data request by six seconds, and by failing every data request with a 500 (the shell's own calls were left alone so it still rendered: session, company profile, permissions, features, unread count, approvals summary, holidays and dashboard layout), then looking 1 to 2.5 seconds in. 127 screens each; desktop.

**Loading has four treatments** across the app: a grey shimmer block (payroll home, statutory, directory, record, applications); a spinner with "Loading…" text (performance, KPIs, dashboard, pay setup); stat cards showing "—" (help desk, hiring adverts); and a bare centred spinner (profile). The shimmer is the right one, and the primitive exists (`Skeleton`).

**Six screens make a false claim while loading**, which is the product's own rule (absent is not zero) turned against it:

| Screen | What it says before the data arrives |
|---|---|
| Payslips | "Nothing here: this month has no payslips on it" |
| Departments | 0 departments, ₦0 monthly payroll |
| Leave | zero counts and "Nobody has booked leave yet" |
| Attendance | "You have not clocked in today" beside a live Clock in button |
| Hiring overview | "No adverts yet" |
| Approvals | "Nothing waiting on you", ₦0.00 at stake |

**Errors have three treatments:** a proper "did not load" callout with what to do and a Try again (about 85 of 127 screens; good); a bare red one-line message; and nothing. Worse, **the empty state is often still rendered under the failure callout**, with its call to action: Payslips says "No payslips yet" with a Run payroll button; the directory says "Nothing here: add somebody"; Leave says "No leave booked yet"; Hiring and Job adverts say "No adverts yet"; Approvals says "Nothing waiting on you". The profile screen says "No employee record: this account is not linked to anyone on the payroll" when its request merely failed, which is false. The dashboard's failure state is a small plain line with a Try again link.

**What to carry forward.** One rule for list and stat screens: while loading, show skeletons and no counts; on failure, show the failure card and render **neither** the empty state nor the counts. The sign-in screen's unreachable state is the copy to imitate (what happened, what is safe, what usually fixes it, one button).

**Not-found.** Four treatments: a calm card ("This endpoint is not here"), a red "did not load" error (one-to-ones), an inline "That batch is not here", and the marketing 404 for unknown URLs.

## 15. Cross-cutting findings

Measured over the 127 signed-in routes at 390 px.

- **Weakest criteria across the app are density, actions and phone** (each averages 3.31 over all 160 scored rows); grouping is the strongest (3.73). The roadmap's hypothesis was that the problem is "at screen level, in what is grouped with what and how much sits on one page". The audit supports the second half and not the first: related information is mostly grouped correctly; there is too much per page, and the actions on it are too small and too many.
- **Phone length.** Median page is 1,690 px on phone against 1,107 px on desktop. 37 of 127 screens are more than three phone screens tall; seven exceed 5,000 px (Leave policies 7,185, Competency ratings 7,001, Period report 6,192, Hiring emails 5,885, Period screen 5,638, Roles 5,486, Requisition 5,111).
- **Phone stacking.** Stat cards stack one per row, so four stats take more than a screen before the content on at least a dozen screens (payroll home, payslips, the period screen, KPIs, competency ratings, who-appraises-whom, directory, departments, hiring overview, help desk, leave, shifts). A compact 2×2 metric card would remove the problem in one place.
- **Tap targets.** Median 15 targets under 44 px per phone screen, and about seven of them are the shell's own (menu, theme, amounts, clock, bell, account). Worst: requisition 85, Leave policies 78, Notifications 77, period screen 47, exit detail 46. The source is repeated icon-only and underlined-text row actions, not buttons.
- **Header action leakage.** "Start an appraisal period" sits in the header of at least six performance screens where it is not what the page is for; the payroll wizard's destructive "Cancel this payroll" sits in the stepper row.
- **Sticky action bars** (wizard, add employee, new requisition) are right on phone and read as bars floating mid-content in a full-page capture; they are not a defect.
- **Tab bars clip on phone** with no scroll cue (Performance overview, Pay setup, profile).
- **Breadcrumbs are doubled** on most detail screens: a "Back to X" link and the full breadcrumb trail sit side by side (wizard, period, review, payslip, candidate, record).
- **Empty states are consistent** (icon, title, one sentence, one action) and are the strongest shared pattern; the roadmap counted 75 files with their own copy, and the audit found the visual treatment identical, so the work there is consolidating copy, not restyling.
- **Console.** Apart from the CSP prefetch errors (see findings), the only repeated errors were a 404 on `/leave/balances` and the not-found probes.
- **No horizontal scroll at 390 px on any screen, for any role.**
- **Every screen has exactly one `h1`**, on both widths.

## 16. Arc mapping, and which Pro gaps matter

Arc's free tier covers what this app needs for almost every screen. The pattern column in the route table names free pieces only. Where Arc ships only a Pro block, the free pieces it would be composed from are named; nothing from a Pro block is copied or reconstructed.

| Screen need | Free pieces it is built from | Pro block it stands in for | Does the gap matter? |
|---|---|---|---|
| App shell, sidebar | existing drill-in sidebar + Command palette + Notification center | Workspace sidebar, Sidebar rail | **No.** The sidebar works and no screen failed on it; Settings needs a vertical list (below) |
| Settings (24 pages) | Page header + vertical Tabs list + Card | Settings page | **Yes, modestly.** The hub-only navigation is a real defect; composing it from free pieces is straightforward |
| Payroll Review table, period marks table | Sortable data table + Filter toolbar + row Drawer + Dialog | Data grid | **Yes: the one gap that costs.** Inline-editable, expandable rows are the whole of the Review step and the period screen. Free Sortable data table sorts; editing and row detail must be composed with Drawer/Dialog |
| Wizards (payroll run, add employee, new role, new period) | Stepper + Card + Page header + sticky action bar | Multi-step form | No. `ui/stepper` and the free Stepper cover it |
| Pipeline board | existing hand-built board restyled with Card + Badge + Dialog | Kanban board | Partly: keep the existing board; do not rebuild |
| Rota, leave calendar | existing grid + Badge + Tabs + Date pickers | Week calendar | Low |
| Dashboard | Metric card + Card + Progress + Page header | Metrics dashboard, KPI drilldown | No |
| Wallet | Metric card + Card + Timeline | Wallet card | No |
| People directory | Sortable data table + Filter toolbar + Avatar | Team directory | No: the directory already scores 4 |
| Roles and permissions, security, webhooks, help centre, invite | existing screens, re-skinned | the matching Pro blocks | No: all score 4 today |
| Assistant | Card + Textarea + Badge | AI side panel | Decide with Track 2: the panel UI is held until the shell exists (D10) |

**Recommendation: D8 stands.** One pattern (the data grid) is worth designing carefully; nothing found in the audit needs a Pro block.

## 17. Suggested order of work

Ordered so that the shared pieces land before the screens that use them, and the biggest wins come early. Effort is the S/M/L from the route table.

1. **Shared fixes that move many screens at once** (foundation, step 3): one loading and failure rule (Section 14); compact metric card for phone; a single row-actions menu; one not-found state; breadcrumb de-duplication; tab-bar scroll cue. Mostly S, and each touches several dozen screens.
2. **Permission gates** for `/settings` and `/payroll/runs/new` (an employee should get the same refusal `/payroll` gives). S, and not visual, but it is the finding most worth acting on immediately.
3. **Payroll run wizard, Review then Approve** (D11): the table redesign (L) and the reorder of Approve (M). Use the existing dialogs as the edit pattern.
4. **Performance period screen** (L): tabs, stage indicator, one primary action, marks table with expandable breakdown.
5. **Requisition screen** (L): pipeline first.
6. **Dashboard** (M), designed together with Track 2's Today panel.
7. **Settings navigation** (M) and the three long settings pages (Leave policies, Hiring emails, Roles).
8. **Notifications** (M): grouping, using the free Notification center.
9. Everything else: S re-skins, family by family (people, recruitment, settings, help, auth).
10. **Marketing** (D9): start in the landing repo, not this one.

## 18. Ranked list, worst first

Screens scoring 3 or below, ordered by overall score, then by the sum of the six criteria. "Why" is the one-line reason from the route table.

| # | Screen | Family | Overall | Effort | Why |
|---|---|---|---|---|---|
| 1 | `/settings` (as employee) | Role probes | 2 | S | A plain employee opens the full admin Settings hub (setup progress, billing, module switches, job roles). The sidebar hides it; the URL does not. Needs a permission gate like /payroll and /people have |
| 2 | `/payroll/runs/new` (as employee) | Role probes | 2 | S | A plain employee opens the whole Run payroll wizard, including the Continue button. The API refuses the write, but the screen offers it. Needs a permission gate like /payroll has |
| 3 | `/hiring/requisitions/[id]` | Recruitment | 2 | L | The working surface (the pipeline board) is at the very bottom, under role details, an access-control panel, four applicant cards and a stage editor; 3,121 px desktop, 5,111 phone, 99 interactive elements, 85 under 44 px on phone |
| 4 | `/performance/periods/[id]` (period screen [id]) | Performance | 2 | L | Largest screen (2,795px desktop, 5,638px phone): six equal-weight action pills, truncated stat cards, outstanding forms as a text list, and a marks table whose Score cell wraps a five-part breakdown into four lines with two repea… |
| 5 | `/payroll/runs/new` (Wizard step 3: Review) | Payroll wizard | 2 | L | Seven columns and four tiny underlined controls per row (40+ identical links); overtime and PAYE edit inline, bonus and deduction open dialogs; deductions total repeated above its own line; phone is a 4,666px stack of ten cards |
| 6 | `/notifications` | Other app | 3 | M | A flat list of ten near-identical 'rating was recorded' items among 22 unread; each row carries Open, tick and cross; 2,837 px desktop, 77 small tap targets on phone; nothing is grouped or summarised. When the request fails it sh… |
| 7 | `/reports/explore` (report explorer) | Other app | 3 | M | An orbitable sphere visualisation: few clusters at default, little to read, and hard to use by touch; no table alternative |
| 8 | `/performance/skills` | Performance | 3 | M | 4,800px desktop list (7,001px phone) of competencies with dashed level bars; categories are not collapsible |
| 9 | `/dashboard` (home) | Dashboard | 3 | M | Nine widgets in an uneven two-column masonry with dead space; '7 requests waiting' is said twice (Needs you and a stat card); 4,541px on phone. When the request fails the only message is a small plain line with a Try again link. |
| 10 | `/hiring/candidates/[id]` (candidate (application id)) | Recruitment | 3 | M | A candidate added by hand shows three red 'no application' errors (with a Try again that cannot help) over an empty assessment form, and the page logs two 404s while it tries two endpoints; on phone identity cards fill two screen… |
| 11 | `/hiring/candidates/[id]` (candidate (candidate id)) | Recruitment | 3 | M | Same screen reached by the candidate id |
| 12 | `/settings/leave` | Settings | 3 | M | Leave types as a table of six inline-editable fields per row; 2,590 px desktop, 7,185 px phone with 78 tap targets under 44 px |
| 13 | `/hiring/settings/emails` | Recruitment | 3 | M | Email templates as a 4,129 px list (5,885 px phone) with one card per template and no collapsing |
| 14 | `/people/offboarding/[id]` (exit detail) | People | 3 | M | Nine checklist items, each with three controls (checked by, say what happened, give it to somebody); 3,135 px desktop, 4,798 px phone, 46 small tap targets |
| 15 | `/payroll/statutory` | Payroll | 3 | M | Leads with an explanatory warning callout before the schedules you came for |
| 16 | `/careers/[org]` (careers, unknown org) | Public | 3 | S | The not-found page nests its own marketing chrome inside the marketing layout, so the announcement bar and nav appear twice |
| 17 | `/design-system` (internal design-system showcase) | Other app | 3 | S | Not found in a production build (deliberate: it is gated on DEMO_ENABLED) and falls through to the marketing 404 with a Book a demo button |
| 18 | `/people/departments` | People | 3 | M | Five icon-only buttons per department row (assign people, assign head, add, edit, delete); 38 tap targets under 44 px on phone. While loading it shows 0 departments and ₦0 monthly payroll. When the request fails it shows the call… |
| 19 | `/performance/periods/[id]/nine-box` | Performance | 3 | M | Nine-cell grid repeats long descriptions and 'Nobody' filler in every cell |
| 20 | `/people/shifts` | People | 3 | M | Rota grid is a hand-built week calendar (a Pro Arc block) with tiny cells; on phone it scrolls sideways inside its card |
| 21 | `/performance/periods` (periods list) | Performance | 3 | S | Almost empty page: one period row, and the same 'Start an appraisal period' action appears twice (header and inline) |
| 22 | `/dashboard` (as hr) | Role probes | 3 | M | Same nine-widget layout as the admin's, with the same duplicated '7 requests' counts |
| 23 | `/dashboard` (as payroll) | Role probes | 3 | M | Same layout as the admin's; the payroll card ('start this month's payroll') is mid-page rather than first |
| 24 | `/dashboard` (as finance) | Role probes | 3 | M | Same layout as the admin's |
| 25 | `/performance/periods/[id]/report` (period report) | Performance | 3 | M | Report is four tables and a chart in one 6,192px phone scroll; no way to jump between them |
| 26 | `/settings` (settings hub) | Settings | 3 | M | Of 24 settings pages the hub links 18; five more (Locations, Leave policies, Bank accounts, Payroll settings, Roles) appear only inside the collapsed set-up checklist, and Integrations and Webhooks are linked from neither; no nav… |
| 27 | `/performance/appraisers` (appraiser mapping) | Performance | 3 | M | Good problem framing (people with no appraiser), but ten rows each with a Change button, and the 'only what is wrong' toggle is easy to miss; 3,797px on phone |
| 28 | `/payroll/payslips` (payslip index) | Payroll | 3 | M | Five stacked sections; the 'send the payslips' panel sits above the distribution list it acts on. While loading it says "Nothing here: this month has no payslips". When the request fails it shows a bare red line over "No payslips… |
| 29 | `/people/leave` | People | 3 | M | Requests table with inline approve and decline works; the web asks for balances through a batch route this API revision does not define, so the screen renders without them and says nothing; the twelve-month calendar sits far belo… |
| 30 | `/payroll/advances` | Payroll | 3 | S | Three callouts stack above the figures (cannot draw, estimate, nothing waiting) |
| 31 | `/billing/pay` | Other app | 3 | M | Three plan cards that do not line up and leave half the row empty, a disabled Continue, and a failed request to /billing/checkout |
| 32 | `/payroll/runs/new` (Wizard step 4: Approve) | Payroll wizard | 3 | M | What approving does and the totals sit below the wallet and bank-register cards; the primary action is a floating bar; negative 'Available now' reads oddly |
| 33 | `/hiring/settings/interviews` | Recruitment | 3 | M | A warning (no reply-to configured) sits above the settings it would block; two toggle groups |
| 34 | `/hiring/candidates/[id]` (candidate: careers-page application (received)) | Recruitment | 3 | M | Candidate who applied through the careers page: clear application, screening and history cards; on phone the identity rail stacks above the application text and decision buttons |
| 35 | `/hiring/candidates/[id]` (candidate: careers-page application (advanced)) | Recruitment | 3 | M | Same screen for a screened-in applicant |
| 36 | `/does-not-exist` (404 page) | Internal | 3 | S | The 404 a signed-in person gets is the marketing one, with Book a demo and a module list |
| 37 | `/people/org-chart` | People | 3 | M | A nested list, not a chart: reporting lines cannot be seen |
| 38 | `/performance/how-it-works` | Performance | 3 | S | Reads as a document of nine prose sections rather than a screen; belongs in a help context as expandable answers |
| 39 | `/people/overtime` | People | 3 | S | Defaults to August 2026 (stale TODAY); a warning with a figure sits above an empty state |
| 40 | `/performance/kpis/import` (kpi import) | Performance | 3 | M | Import screen: see people/import family |
| 41 | `/people` (as employee) | Role probes | 3 | S | Clear refusal, but the header still offers Import from spreadsheet and Add employee to somebody who cannot use them |
| 42 | `/settings/roles` | Settings | 3 | M | Role description wraps into a one-word-wide column on phone beside People, Open and Copy |
| 43 | `/hiring/postings/[id]` (advert detail) | Recruitment | 3 | M | Two tabs; the share-links list is long (six tracked links) and sits above the form the page is for; 67 interactive elements |
| 44 | `/hiring/postings/settings` (posting settings) | Recruitment | 3 | M | Long single form (2,226 px) with no section navigation |
| 45 | `/performance/kpis` (objectives (kpis)) | Performance | 3 | M | Good cascade of objectives with filters; on phone four stat cards stack to a screen before any objective. When its request fails, the failure callout is followed by a "No KPIs yet" empty state. |
| 46 | `/performance/periods/new` (start-a-period wizard) | Performance | 3 | S | 'Step 1 of 4' is labelled but no stepper is shown; a single form on an otherwise empty page |
| 47 | `/people/one-on-ones/[id]` (one-to-one detail (no data seeded: not-found state)) | People | 3 | S | A missing record is shown as a red 'did not load' error rather than a calm not-found state (same pattern on webhook and project not-found) |
| 48 | `/hiring/my-interviews/[id]` (my interview candidate) | Recruitment | 3 | S | Only the refusal state was reachable (no interview panelists are seeded); copy is clear |
| 49 | `/settings/webhooks/[id]` (webhook endpoint (none seeded: not-found state)) | Settings | 3 | S | A missing endpoint is a calm not-found card (better than the one-to-one's red error) |
| 50 | `/verify-email` (verify email, no token) | Auth | 3 | S | 'Confirm your email' heading over a bare button and no explanation of what to do |
| 51 | `/accept-invite` (accept invite, no token) | Auth | 3 | S | Says 'This link is incomplete' and 'Ask whoever invited you', with no action |
| 52 | `/help/kb/[slug]` (article) | Help | 3 | S | Article body shows raw Markdown (**Gross**, **PAYE** with their asterisks) instead of rendering it |
| 53 | `/verify-email` (verify email, invalid token) | Auth | 3 | S | The refusal reads 'This link no longer works. Some fields are not valid.', which is validation wording, not an explanation |

### Scores by family and effort

| Family | Screens scored | Mean overall | Effort S / M / L | Worst screen |
|---|---|---|---|---|
| Payroll wizard | 7 | 3.57 | 5 / 1 / 1 | `/payroll/runs/new` (Wizard step 3: Review) (2) |
| Performance | 17 | 3.41 | 7 / 9 / 1 | `/performance/periods/[id]` (period screen [id]) (2) |
| Payroll | 12 | 3.75 | 10 / 2 / 0 | `/payroll/statutory` (3) |
| Dashboard | 1 | 3.0 | 0 / 1 / 0 | `/dashboard` (home) (3) |
| People | 26 | 3.73 | 18 / 8 / 0 | `/people/offboarding/[id]` (exit detail) (3) |
| Recruitment | 28 | 3.61 | 19 / 8 / 1 | `/hiring/requisitions/[id]` (2) |
| Settings | 25 | 3.84 | 22 / 3 / 0 | `/settings/leave` (3) |
| Auth | 9 | 3.67 | 9 / 0 / 0 | `/verify-email` (verify email, no token) (3) |
| Help | 3 | 3.67 | 3 / 0 / 0 | `/help/kb/[slug]` (article) (3) |
| Other app | 17 | 3.76 | 14 / 3 / 0 | `/notifications` (3) |
| Public | 5 | 3.8 | 3 / 2 / 0 | `/careers/[org]` (careers, unknown org) (3) |
| Internal | 1 | 3.0 | 1 / 0 / 0 | `/does-not-exist` (404 page) (3) |
| Role probes | 9 | 3.11 | 6 / 3 / 0 | `/settings` (as employee) (2) |
| **All** | **160** | **3.64** | **117 / 40 / 3** | |

## 19. Findings that are not visual

Found while walking; outside this step's remit, and nothing here was fixed. Ordered by how much it matters.

1. **A plain employee can open `/settings` and `/payroll/runs/new`.** Both render in full (the admin Settings hub; the Run payroll wizard with a Continue button). The API refuses the writes. `/payroll` and `/people` gate correctly, so the pattern exists. See Section 13.
2. **`TODAY` is a constant.** `src/lib/today.ts` exports `TODAY = "2026-08-19"` and 57 files import it, in a connected production build. The payroll wizard's default month is derived from it, so on 20 October the wizard opens on August 2026 ("August 2026 is already prepared") and Overtime defaults to August 2026. `daysSince` and other date arithmetic that uses it is anchored to the demo day. HANDOVER.md records it as the demo's "now"; in a build with no demo it states a wrong date.
3. **Screens assert emptiness while loading or after a failed request** (Section 14): "No payslips yet" with a Run payroll button, "You have not clocked in today" with a live Clock in button, "No employee record" on the profile. Under the product's own absent-is-not-zero rule these are defects, not styling.
4. **The help article body shows raw Markdown** (`**Gross**`, `**PAYE**`).
5. **Web and API revisions disagree on leave balances.** `/people/leave` calls `GET /leave/balances?employeeIds=…` (the web's `balancesForMany`); the API on this base defines only `/leave/balances/:id`. The call 404s, the screen renders without balances ("Annual leave used —") and shows no message.
6. **Console errors on every page that links to a redirected marketing route.** The footer's Privacy and Terms links (and `/demo` and `/product/*` elsewhere) are prefetched by Next; `proxy.ts` answers with a 308 to `approvehr.io`; the cross-origin prefetch violates the app's own `connect-src` and logs `Connecting to 'https://approvehr.io/privacy' violates the following Content Security Policy directive`. It affects every signed-out page and pushes them past an 8-second network-idle wait. Harmless to a visitor; noisy for error reporting (`NEXT_PUBLIC_ERROR_REPORT_URL`).
7. **The candidate page tries two endpoints and logs two 404s** (`/careers/applications/:id`, then `/recruitment/candidates/:id`, or the reverse) before it finds the record. Both ids resolve to a screen; the 404s are the lookup, not a broken page.
8. **`/design-system` returns not-found in a production build**, by design (`if (!DEMO_ENABLED) notFound()`), so the primitives can only be reviewed in a development build.
9. **The not-found page for a signed-in person is the marketing 404** (Book a demo, Pricing, module list), because `src/app/not-found.tsx` brings its own marketing chrome and there is no `(app)/not-found.tsx`. The unknown-organisation careers 404 shows that chrome twice.

## 20. Coverage, routes not reached, and overlap with in-flight work

**Coverage.** 142 `page.tsx` files, 142 distinct route patterns. 134 were captured directly; `/payroll/runs/new` was captured by the wizard walk (so 135 in all). Seven are not reachable in this app:

| Route | Why |
|---|---|
| `/` | Redirects (307) to `/dashboard` |
| `/demo`, `/privacy`, `/terms`, `/security`, `/dpa`, `/product/[module]` | Redirected (308) by `src/proxy.ts` to `https://approvehr.io/...`; they are served by the standalone landing repo, not this one |

**States that could not be reached** on the demo tenant, so the screen was scored on what it does show: the first-run setup wizard (the seeded company has finished it; only the completion screen was seen); `/hiring/my-interviews/[id]` as a real candidate (no interview panelists are seeded); one-to-one detail, webhook endpoint detail and project detail (no records seeded; their not-found states were scored); the two-factor sign-in step (no account has two-factor on). Projects is off for the tenant, so its populated screens were not seen.

**Not exercised.** Nothing that moves money or sends mail was confirmed: no payment, no payslip email, no approval. The demo tenant's data was not changed (it still has its original two payroll runs). No account was created and no credential was entered other than the seeded test users' sign-in on the local stack.

**What this audit describes.** `staging` as of 2026-10-18. Track 0's re-measurement (sibling note `track0-gate.md`) records web `staging` as 71 commits ahead of and 160 behind `main`, so a screen that was changed on `main` only will look different in production; re-check any screen before rebuilding it against `main`. The API ran at the same date (`base/staging-20261020`); the leave-balances 404 is a skew between the two at that date.

**Interaction with other tracks.** Track 2's hand-over (`track2-today-api-handover.md`) confirms the Today panel is a right-rail on the dashboard and asks that the payslip figure be masked by default; the app already has a "Hide amounts" control in the top bar. The dashboard recommendation in Section 7 (redesign it together with that panel, after the shell, D10) stands. Track 5's money screens (advance, pension top-up) did not exist on this base to audit; the existing Pay early and Wallet screens are scored.

**Overlap with in-flight web work.** The base already contains `fix/mobile-dialog-field-overflow` and the four `projects-*` branches (zero commits ahead). Seven unmerged local branches touch screens scored here; check them before rebuilding the same file, since a rebuild would conflict with each:

| Branch | Touches | Screens affected |
|---|---|---|
| `fix/payroll-wizard-cleanup-and-sheet-modal` | `payroll/runs/new/sheet-panel.tsx`, `wizard.tsx` | wizard Check step (the spreadsheet reveal) |
| `feat/appraisal-navigation-and-builder` (6 commits) | `performance/now.tsx`, `kpis.tsx`, `page.tsx`, `how-it-works.tsx`, manager questions | Performance overview, KPIs, how-it-works |
| `fix/auth-visual-overlap-and-performance-banner` | `portal/auth-visual.tsx`, `performance/now.tsx` | sign-in art; Performance overview |
| `fix/modal-drawer-wrapping-audit` (wip) | help, setup guide, hiring candidate and pipeline | candidate screen, help desk |
| `fix/remaining-dead-ends` | dashboard, attendance, profile, clock and time-off cards | employee dashboard, attendance, profile |
| `feat/objectives-import` | `performance/kpis.tsx`, `kpis/import` | KPIs, KPI import |
| `feat/park-onboarding` (2 commits) | onboarding | `/people/onboarding` |

`feat/paye-calculator-seo` (52 commits, the owner's own checkout) was not touched and not read; it overlaps `/paye-calculator`. The owner's checkout was left alone entirely.

## 21. Artefacts and how to re-run

- **Screenshots (outside git):** `/private/tmp/claude-501/-Users-mac-Documents-Schulltech-ApproveHR-web--claude-worktrees-trusting-swanson-d2f9b6/6518ed4b-25e2-4616-b6c1-515d01903021/scratchpad/shots/` (196 MB; `admin`, `hr`, `payroll`, `finance`, `manager`, `employee`, `public`, `wizard-admin`, `states-delay`, `states-error`, `auth-states`, each split `desktop` and `phone`, plus 47 contact sheets named `_*.png`). A copy of the contact sheets, the wizard captures and the scripts is in the shared notes folder for this group of sessions.
- **Scripts:** `scratchpad/audit/` (`sweep.mjs`, `wizard.mjs`, `states.mjs`, `nav2.mjs`, `build.py`, `build-md.py`). Raw measurements: `scratchpad/data/*.jsonl`.
- **Stack to re-run:** an API worktree on `base/staging-20261020` with `DATABASE_URL` pointed at its own database, `npm run demo`, API on port 8461 with `CORS_ORIGINS` set to the web origin; the web app built with `NEXT_PUBLIC_API_URL=http://localhost:8461/api/v1` and served with `next start -p 3461`. Seeded password for every account: `approvehr-dev-2026` (it is `SEED_PASSWORD` in `prisma/seed.ts`).

## 22. Route table

G grouping, H hierarchy, D density, S states, A actions, P phone. 1 to 5, higher is better. "Arc free pattern" names the free-tier Arc pieces the screen would be built from; where only a Pro block fits, the free pieces it would be composed from are named, never the Pro block. The full table with measurements is in [`scores.csv`](./scores.csv).

| Route | Family | G | H | D | S | A | P | Overall | Arc free pattern | Effort |
|---|---|---|---|---|---|---|---|---|---|---|
| `/payroll/runs/new` — Wizard step 1: Period | Payroll wizard | 4 | 4 | 3 | 4 | 4 | 4 | **4** | Stepper + Card + Date and Range pickers | S |
| `/payroll/runs/new` — Wizard step 2: Check | Payroll wizard | 4 | 4 | 4 | 3 | 3 | 4 | **4** | Stepper + Card + existing Callout rows | S |
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
| `/performance/periods/new` — start-a-period wizard | Performance | 3 | 3 | 4 | 3 | 3 | 4 | **3** | Stepper + Card + existing Textarea | S |
| `/performance/kpis` — objectives (kpis) | Performance | 4 | 4 | 3 | 3 | 3 | 3 | **3** | Metric card + Filter toolbar + Card | M |
| `/performance/kpis/import` — kpi import | Performance | 3 | 3 | 4 | 3 | 3 | 3 | **3** | File dropzone + Stepper | M |
| `/performance/approvals` — objective approvals queue | Performance | 4 | 4 | 4 | 5 | 3 | 4 | **4** | Empty state + Page header | S |
| `/performance/appraisers` — appraiser mapping | Performance | 3 | 3 | 3 | 3 | 3 | 3 | **3** | Sortable data table + Filter toolbar + Metric card | M |
| `/performance/review-tasks` — review tasks | Performance | 3 | 3 | 4 | 4 | 3 | 4 | **4** | Page header + Empty state + existing Textarea | S |
| `/performance/skills` — skills | Performance | 3 | 3 | 2 | 3 | 3 | 2 | **3** | Accordion + Progress + Sortable data table | M |
| `/performance/how-it-works` — how it works | Performance | 3 | 3 | 3 | 3 | 4 | 3 | **3** | Accordion (FAQ) + Page header | S |
| `/performance/history/[employeeId]` — score history | Performance | 4 | 4 | 4 | 4 | 3 | 3 | **4** | Metric card + Timeline + Card | S |
| `/performance/reviews/[id]` — review record (manager review) | Performance | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Page header + Timeline + Comment thread + Card | M |
| `/performance/reviews/[id]/answer` — review answer (focus mode) | Performance | 5 | 5 | 5 | 4 | 5 | 5 | **5** | Stepper + Card (focus mode) | S |
| `/payroll` — payroll home | Payroll | 4 | 4 | 3 | 4 | 4 | 3 | **4** | Page header + Metric card + Sortable data table | S |
| `/payroll/payslips` — payslip index | Payroll | 4 | 3 | 3 | 2 | 3 | 3 | **3** | Metric card + Filter toolbar + Sortable data table | M |
| `/payroll/payslips/[id]` — one payslip | Payroll | 5 | 4 | 4 | 4 | 4 | 4 | **4** | Card (document) | S |
| `/payroll/payments` — wallet | Payroll | 4 | 4 | 4 | 4 | 3 | 4 | **4** | Metric card + Empty state + Timeline | S |
| `/payroll/payments/[id]` — payment batch | Payroll | 4 | 4 | 3 | 4 | 4 | 3 | **4** | Metric card + Card | S |
| `/payroll/payments/history` — payment history | Payroll | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Filter toolbar + Sortable data table | S |
| `/payroll/pay-setup` — pay setup | Payroll | 4 | 4 | 3 | 4 | 4 | 3 | **4** | Tabs + Sortable data table | S |
| `/payroll/statutory` — statutory | Payroll | 3 | 2 | 3 | 3 | 3 | 3 | **3** | Page header + Sortable data table + Accordion | M |
| `/payroll/loans` — loans | Payroll | 4 | 4 | 4 | 4 | 4 | 3 | **4** | Tabs + Metric card + Sortable data table | S |
| `/payroll/loans/[id]` — loan detail | Payroll | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Metric card + Sortable data table | S |
| `/payroll/expenses` — expenses | Payroll | 4 | 4 | 3 | 4 | 4 | 3 | **4** | Tabs + Filter toolbar + Sortable data table | S |
| `/payroll/advances` — advances | Payroll | 3 | 3 | 3 | 3 | 3 | 3 | **3** | Metric card + existing Callout | S |
| `/dashboard` — home | Dashboard | 3 | 3 | 2 | 2 | 3 | 3 | **3** | Metric card + Card + Progress + Page header | M |
| `/people` — directory | People | 4 | 4 | 3 | 2 | 4 | 3 | **4** | Page header + Metric card + Filter toolbar + Sortable data table | M |
| `/people/[id]` — employee record | People | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Page header + Tabs + Card + Avatar | M |
| `/people/new` — add employee wizard | People | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Stepper + Card + Progress | M |
| `/people/import` — bulk import | People | 4 | 4 | 4 | 4 | 4 | 4 | **4** | File dropzone + Stepper | S |
| `/people/incomplete` — incomplete records | People | 4 | 4 | 3 | 4 | 3 | 4 | **4** | Empty state | S |
| `/people/changes` — employment changes | People | 4 | 4 | 3 | 4 | 4 | 4 | **4** | Empty state + Page header | S |
| `/people/probation` — probation | People | 4 | 4 | 3 | 4 | 3 | 4 | **4** | Empty state + Card | S |
| `/people/departments` — departments | People | 3 | 4 | 3 | 2 | 2 | 3 | **3** | Tabs + Sortable data table + Tooltip | M |
| `/people/departments/[id]` — department detail | People | 4 | 4 | 4 | 4 | 3 | 4 | **4** | Metric card + Sortable data table | S |
| `/people/org-chart` — org chart | People | 3 | 3 | 3 | 4 | 3 | 3 | **3** | Accordion + Card | M |
| `/people/leave` — leave | People | 4 | 3 | 3 | 2 | 3 | 3 | **3** | Metric card + Sortable data table + Date and Range pickerss | M |
| `/people/attendance` — attendance | People | 4 | 4 | 3 | 2 | 3 | 3 | **4** | Tabs + Metric card + Sortable data table | S |
| `/people/attendance/history` — attendance history | People | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Tabs + Card + Date and Range pickerss | S |
| `/people/attendance/import` — attendance import | People | 4 | 4 | 4 | 4 | 4 | 4 | **4** | File dropzone + Stepper | S |
| `/people/shifts` — shifts | People | 3 | 3 | 3 | 3 | 3 | 2 | **3** | Tabs + Sortable data table + Badge | M |
| `/people/overtime` — overtime | People | 3 | 3 | 3 | 4 | 3 | 3 | **3** | Empty state + existing Callout + Select | S |
| `/people/onboarding` — onboarding | People | 4 | 4 | 3 | 4 | 4 | 4 | **4** | Empty state + Metric card | S |
| `/people/offboarding` — exit management | People | 4 | 4 | 3 | 4 | 4 | 3 | **4** | Metric card + Filter toolbar + Timeline | S |
| `/people/offboarding/[id]` — exit detail | People | 4 | 3 | 2 | 4 | 2 | 2 | **3** | Page header + Timeline + Accordion + Progress | M |
| `/people/offboarding/checklist` — exit checklist | People | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Sortable data table | S |
| `/people/documents` — documents (people) | People | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Metric card + Tabs + Sortable data table | S |
| `/people/signatures` — signatures | People | 4 | 4 | 4 | 4 | 4 | 4 | **4** | Empty state | S |
| `/people/assets` — assets | People | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Metric card + Tabs + Sortable data table | S |
| `/people/assets/import` — assets import | People | 4 | 4 | 4 | 4 | 4 | 4 | **4** | File dropzone + Stepper | S |
| `/people/one-on-ones` — one-to-ones | People | 4 | 4 | 4 | 4 | 4 | 4 | **4** | Empty state + Tabs | S |
| `/people/one-on-ones/[id]` — one-to-one detail (no data seeded: not-found state) | People | 3 | 3 | 4 | 3 | 3 | 4 | **3** | Empty state | S |
| `/hiring` — pipeline | Recruitment | 4 | 4 | 3 | 2 | 4 | 3 | **4** | Page header + Metric card + Sortable data table + Progress | S |
| `/hiring/candidates/[id]` — candidate (application id) | Recruitment | 3 | 3 | 3 | 2 | 3 | 2 | **3** | Page header + Card + existing Callout | M |
| `/hiring/candidates/[id]` — candidate (candidate id) | Recruitment | 3 | 3 | 3 | 2 | 3 | 2 | **3** | Page header + Card + existing Callout | M |
| `/hiring/hired` — hired | Recruitment | 4 | 4 | 3 | 4 | 4 | 4 | **4** | Empty state + Filter toolbar | S |
| `/hiring/interviews` — interviews | Recruitment | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Metric card + Card + Timeline | S |
| `/hiring/my-interviews` — my interviews | Recruitment | 4 | 4 | 4 | 5 | 4 | 4 | **4** | Empty state | S |
| `/hiring/my-interviews/[id]` — my interview candidate | Recruitment | 3 | 3 | 4 | 3 | 3 | 4 | **3** | Empty state | S |
| `/hiring/offers` — offers | Recruitment | 4 | 4 | 3 | 4 | 4 | 4 | **4** | Card + Badge + Dialog | S |
| `/hiring/postings` — adverts | Recruitment | 4 | 4 | 3 | 3 | 3 | 3 | **4** | Tabs + Sortable data table | S |
| `/hiring/postings/[id]` — advert detail | Recruitment | 4 | 3 | 3 | 4 | 3 | 3 | **3** | Tabs + Card + Combobox | M |
| `/hiring/postings/[id]/assessment-scores` — assessment scores | Recruitment | 4 | 4 | 4 | 4 | 4 | 4 | **4** | File dropzone + Stepper | S |
| `/hiring/postings/[id]/below-pass-mark` — below pass mark | Recruitment | 4 | 4 | 4 | 5 | 4 | 4 | **4** | Empty state + existing Callout | S |
| `/hiring/postings/[id]/preview` — advert preview | Recruitment | 4 | 4 | 4 | 4 | 4 | 4 | **4** | Card (preview) | S |
| `/hiring/postings/applications` — applications | Recruitment | 4 | 4 | 3 | 4 | 4 | 3 | **4** | Tabs + Filter toolbar + Sortable data table | S |
| `/hiring/postings/settings` — posting settings | Recruitment | 4 | 3 | 3 | 4 | 3 | 3 | **3** | Card + existing Field and existing Toggle (the Pro Settings page is not used) | M |
| `/hiring/requisitions/[id]` — requisition | Recruitment | 2 | 2 | 2 | 3 | 2 | 2 | **2** | Page header + Tabs + Filter toolbar + Card + Dialog (board from Card + Badge) | L |
| `/hiring/requisitions/new` — new requisition wizard | Recruitment | 4 | 4 | 4 | 4 | 4 | 3 | **4** | Stepper + Card + Select | S |
| `/hiring/talent-pool` — talent pool | Recruitment | 4 | 4 | 4 | 5 | 4 | 4 | **4** | Empty state + Filter toolbar | S |
| `/hiring/settings` — hiring settings | Recruitment | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Tabs + Card | S |
| `/hiring/settings/accepted-offers` — hiring settings: accepted-offers | Recruitment | 4 | 4 | 3 | 4 | 3 | 4 | **4** | Tabs + Card + existing Radio | S |
| `/hiring/settings/emails` — hiring settings: emails | Recruitment | 3 | 3 | 2 | 4 | 3 | 2 | **3** | Tabs + Accordion + existing Toggle | M |
| `/hiring/settings/interviews` — hiring settings: interviews | Recruitment | 4 | 3 | 3 | 3 | 3 | 3 | **3** | Tabs + existing Callout + existing Toggle | M |
| `/hiring/settings/pipelines` — hiring settings: pipelines | Recruitment | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Tabs + Card | S |
| `/hiring/settings/rejection-reasons` — hiring settings: rejection-reasons | Recruitment | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Tabs + Sortable data table | S |
| `/hiring/settings/retention` — hiring settings: retention | Recruitment | 4 | 4 | 4 | 4 | 3 | 4 | **4** | Tabs + Card + existing Field | S |
| `/hiring/settings/tags` — hiring settings: tags | Recruitment | 4 | 4 | 4 | 5 | 4 | 4 | **4** | Tabs + Empty state | S |
| `/hiring/candidates/[id]` — candidate: careers-page application (received) | Recruitment | 4 | 3 | 3 | 4 | 3 | 2 | **3** | Page header + Card + existing Callout | M |
| `/hiring/candidates/[id]` — candidate: careers-page application (advanced) | Recruitment | 4 | 3 | 3 | 4 | 3 | 2 | **3** | Page header + Card | M |
| `/settings` — settings hub | Settings | 3 | 3 | 3 | 3 | 3 | 3 | **3** | Page header + vertical Tabs list + Card (stands in for the Pro Settings page) | M |
| `/settings/ai` — settings: ai | Settings | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Page header + Card + Progress | S |
| `/settings/announcements` — settings: announcements | Settings | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Metric card + Sortable data table | S |
| `/settings/appearance` — settings: appearance | Settings | 4 | 4 | 4 | 4 | 4 | 4 | **4** | Card + existing Toggle | S |
| `/settings/attendance` — settings: attendance | Settings | 4 | 4 | 4 | 4 | 4 | 4 | **4** | Card + existing Field + existing time input | S |
| `/settings/audit` — settings: audit | Settings | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Filter toolbar + Timeline | S |
| `/settings/bank-accounts` — settings: bank-accounts | Settings | 4 | 4 | 4 | 4 | 3 | 4 | **4** | Metric card + Sortable data table | S |
| `/settings/company` — settings: company | Settings | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Card + existing Field + File dropzone | S |
| `/settings/devices` — settings: devices | Settings | 4 | 4 | 3 | 4 | 4 | 3 | **4** | Empty state + Metric card | S |
| `/settings/features` — settings: features | Settings | 4 | 3 | 3 | 4 | 4 | 3 | **4** | Card + existing Toggle | S |
| `/settings/helpdesk` — settings: helpdesk | Settings | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Card + Sortable data table | S |
| `/settings/integrations` — settings: integrations | Settings | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Card | S |
| `/settings/job-roles` — settings: job-roles | Settings | 4 | 4 | 4 | 5 | 4 | 4 | **4** | Empty state | S |
| `/settings/knowledge` — settings: knowledge | Settings | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Metric card + Tabs + Sortable data table | S |
| `/settings/leave` — settings: leave | Settings | 3 | 3 | 2 | 4 | 3 | 2 | **3** | Tabs + Sortable data table + Accordion | M |
| `/settings/locations` — settings: locations | Settings | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Metric card + Sortable data table | S |
| `/settings/notifications` — settings: notifications | Settings | 4 | 4 | 3 | 4 | 4 | 3 | **4** | Card + existing Toggle matrix | S |
| `/settings/overtime` — settings: overtime | Settings | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Card + existing Field + Select | S |
| `/settings/payroll` — settings: payroll | Settings | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Accordion + Card (live preview) | S |
| `/settings/performance` — settings: performance | Settings | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Card + existing Field + Progress | S |
| `/settings/policies` — settings: policies | Settings | 4 | 4 | 4 | 4 | 3 | 4 | **4** | Accordion + Sortable data table | S |
| `/settings/roles` — settings: roles | Settings | 4 | 4 | 3 | 4 | 3 | 2 | **3** | Metric card + Sortable data table | M |
| `/settings/security` — settings: security | Settings | 4 | 4 | 4 | 4 | 4 | 4 | **4** | Card + existing Toggle | S |
| `/settings/webhooks` — settings: webhooks | Settings | 4 | 4 | 4 | 5 | 4 | 4 | **4** | Empty state | S |
| `/settings/webhooks/[id]` — webhook endpoint (none seeded: not-found state) | Settings | 3 | 3 | 4 | 3 | 3 | 4 | **3** | Empty state | S |
| `(app) auth gate` — sign-in gate (signed out) | Auth | 4 | 4 | 4 | 5 | 4 | 4 | **4** | Sign in / Login centered, OTP input | S |
| `/forgot-password` — forgot password | Auth | 4 | 4 | 4 | 4 | 4 | 4 | **4** | Sign in / Login centered | S |
| `/register` — create a company account | Auth | 4 | 4 | 3 | 4 | 4 | 4 | **4** | Sign in / Login centered | S |
| `/reset-password` — reset password, no token | Auth | 4 | 4 | 4 | 3 | 4 | 4 | **4** | Empty state + Sign in / Login centered | S |
| `/reset-password` — reset password, real dev token (not submitted) | Auth | 4 | 4 | 4 | 4 | 4 | 4 | **4** | Sign in / Login centered | S |
| `/verify-email` — verify email, no token | Auth | 3 | 3 | 4 | 3 | 3 | 4 | **3** | Empty state | S |
| `/verify-email` — verify email, invalid token | Auth | 4 | 4 | 4 | 3 | 4 | 4 | **3** | Empty state + existing Callout | S |
| `/accept-invite` — accept invite, no token | Auth | 3 | 3 | 4 | 3 | 3 | 4 | **3** | Empty state | S |
| `/accept-invite` — accept invite, invalid token | Auth | 4 | 4 | 4 | 4 | 4 | 4 | **4** | Sign in / Login centered | S |
| `/help` — help desk | Help | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Metric card + Progress + Filter toolbar + Sortable data table | S |
| `/help/kb` — knowledge base | Help | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Tabs + Filter toolbar + Card | S |
| `/help/kb/[slug]` — article | Help | 3 | 3 | 4 | 4 | 3 | 4 | **3** | Page header + Card | S |
| `/approvals` — approvals inbox | Other app | 4 | 4 | 3 | 2 | 4 | 3 | **4** | Tabs + Metric card + Filter toolbar + Card | S |
| `/notifications` — notifications | Other app | 3 | 3 | 2 | 2 | 3 | 2 | **3** | Notification center + Tabs | M |
| `/profile` — profile | Other app | 4 | 4 | 3 | 2 | 3 | 3 | **4** | Tabs + Accordion + Card + Avatar | S |
| `/assistant` — assistant chat | Other app | 4 | 4 | 4 | 4 | 4 | 4 | **4** | Card + existing Textarea + Badge (stands in for the Pro AI side panel) | S |
| `/ask` — ask | Other app | 4 | 4 | 4 | 4 | 4 | 4 | **4** | Card + existing Textarea | S |
| `/documents` — my documents | Other app | 4 | 4 | 4 | 4 | 4 | 4 | **4** | Card + Badge | S |
| `/equipment` — my equipment | Other app | 4 | 4 | 4 | 4 | 4 | 4 | **4** | Empty state | S |
| `/surveys` — surveys | Other app | 4 | 4 | 4 | 4 | 4 | 4 | **4** | Empty state | S |
| `/billing/pay` — billing | Other app | 3 | 3 | 3 | 3 | 3 | 3 | **3** | Card + existing Radio (plan picker) | M |
| `/reports` — reports hub | Other app | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Metric card + Card (chart) + Date and Range pickerss | S |
| `/reports/builder` — report builder | Other app | 4 | 4 | 4 | 4 | 4 | 4 | **4** | Stepper + Card | S |
| `/reports/explore` — report explorer | Other app | 3 | 2 | 3 | 3 | 2 | 2 | **3** | Card + Tabs | M |
| `/projects` — projects | Other app | 4 | 4 | 4 | 5 | 4 | 4 | **4** | Empty state | S |
| `/projects/[id]` — project (none seeded: not-found state) | Other app | 4 | 4 | 4 | 5 | 4 | 4 | **4** | Empty state | S |
| `/setup` — setup wizard | Other app | 4 | 4 | 4 | 4 | 4 | 4 | **4** | Stepper + Card | S |
| `/design-system` — internal design-system showcase | Other app | 3 | 3 | 4 | 2 | 2 | 3 | **3** | Page header | S |
| `/offline` — offline page (service worker) | Other app | 4 | 4 | 4 | 4 | 4 | 4 | **4** | Empty state | S |
| `/pricing` — pricing + calculator | Public | 4 | 4 | 3 | 4 | 4 | 4 | **4** | Site header + Hero + Stats band + CTA + FAQ | M |
| `/paye-calculator` — PAYE calculator | Public | 4 | 4 | 4 | 4 | 4 | 4 | **4** | Site header + Card + Stats band | M |
| `/careers/[org]` — public careers page (tenant) | Public | 4 | 4 | 4 | 4 | 4 | 4 | **4** | Site header + Card + Site footer | S |
| `/careers/[org]/[role]` — public job page + apply form | Public | 4 | 4 | 3 | 4 | 4 | 3 | **4** | Site header + Card + File dropzone | S |
| `/careers/[org]` — careers, unknown org | Public | 3 | 3 | 3 | 2 | 3 | 3 | **3** | Site header + Empty state | S |
| `/does-not-exist` — 404 page | Internal | 3 | 3 | 4 | 3 | 3 | 3 | **3** | Empty state + Site header | S |
| `/dashboard` — as employee | Role probes | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Page header + Metric card + Progress | S |
| `/settings` — as employee | Role probes | 2 | 2 | 3 | 1 | 1 | 2 | **2** | Page header + Empty state (gate) | S |
| `/payroll/runs/new` — as employee | Role probes | 2 | 2 | 3 | 1 | 1 | 2 | **2** | Page header + Empty state (gate) | S |
| `/payroll` — as employee | Role probes | 4 | 4 | 4 | 4 | 3 | 4 | **4** | Empty state | S |
| `/people` — as employee | Role probes | 3 | 3 | 4 | 3 | 2 | 4 | **3** | Empty state | S |
| `/dashboard` — as manager | Role probes | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Page header + Metric card | S |
| `/dashboard` — as hr | Role probes | 3 | 3 | 2 | 3 | 3 | 3 | **3** | Page header + Metric card | M |
| `/dashboard` — as payroll | Role probes | 3 | 3 | 2 | 3 | 3 | 3 | **3** | Page header + Metric card | M |
| `/dashboard` — as finance | Role probes | 3 | 3 | 2 | 3 | 3 | 3 | **3** | Page header + Metric card | M |

