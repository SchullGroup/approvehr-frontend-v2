# ApproveHR — handover

You are continuing a prototype build, not starting one. Read this whole file
before touching code — several things here contradict what you'd guess from
first principles, and each one cost real debugging time to find.

## Start here

```bash
cd /Users/mac/Documents/Schulltech/ApproveHR/web
npm run check   # typecheck + lint + contrast verification + payroll maths verification
npm run build   # 52 routes, 93 prerendered pages, all currently green
npm run dev     # then use your browser tool against the printed localhost port
```

If any of those three fail before you've changed anything, something is
wrong with the environment, not the code — stop and investigate that first.

**Use the Browser tool to run the dev server, never Bash.** This project has
its own `preview_start` / `computer` / `read_page` browser tooling. If you
don't have it, ask the user which browser tool is configured for this
session before falling back to anything else.

## Who this is for and why it exists

ApproveHR is Schull Technologies' HR/payroll/hiring SaaS for Nigerian
companies. The user is building it to compete with **SeamlessHR**, an
established, well-funded incumbent.

**This is no longer a prototype and this file used to say it was.** There is a
real backend — Express 5, Prisma 7, Postgres, 16 modules, 347 tests — with real
password auth, real JWT sessions and a real database. The frontend detects
whether the API answers and runs in one of two modes; see "The API connection"
below. Demo mode against localStorage is still there, deliberately, because this
product gets shown on laptops in rooms with no database, but it is now the
fallback rather than the whole thing.

The user cares a great deal about two things, consistently, across the whole
session — keep both in mind for every decision you make:

1. **Never fabricate proof.** No invented customer logos, no made-up
   statistics, no testimonials for features that don't exist. If the site
   needs social proof and none is verified, say so in the UI rather than
   inventing it. (Real logos were pulled from the live `approvehr.io` site
   and live in `public/clients/` and `public/avatars/`. Real photos are in
   `public/photos/`, sourced from `Website Images/` at the repo root.)
2. **The Nigerian statutory maths must be actually correct**, not
   plausible-looking. This is the entire competitive pitch. See the payroll
   engine section below before changing anything under `lib/payroll/`.

## Repo layout — four things now, not two

- `/Users/mac/Documents/Schulltech/ApproveHR/web/` — **the frontend.** Read on.
- `/Users/mac/Documents/Schulltech/approvehr-api/` — **the backend**, added
  later. Express 5 + Prisma 7 + Postgres, pushed to
  `Kenewachukwu/approvehr-api` (private). Has its own README and
  `docs/architecture.md`; read those rather than guessing from this file. The
  payroll engine now exists in **both** places — see the warning below.
- `/Users/mac/Documents/Schulltech/approvehr-marketing/` — a **generated**
  standalone copy of the public site, pushed to `Kenewachukwu/approvehr` (public).
  Never edit it directly: run `npx tsx scripts/export-marketing.ts` from `web/`
  and commit the result. The export script asserts the marketing surface has not
  reached into app code, and fails loudly if it has.
- `/Users/mac/Documents/Schulltech/ApproveHR/Marketing/` — two generated PDFs
  for the creative department, plus the Python that builds them.

Also still present, and still to be ignored:

- `/Users/mac/Documents/Schulltech/ApproveHR/` (repo root) — an **old,
  abandoned Vite/React frontend** (`src/`, `MDs/`, etc. at the root). Audited
  early on and found to be in poor shape. **Do not work in it.** Not deleted
  because nobody has asked for that. The root also holds generated employee
  CSVs and a Postman collection — none of which should ever reach a public repo,
  which is why the marketing export is generated rather than a subtree.

`web/` is Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4.
Everything below refers to paths inside it.

`web/AGENTS.md` (imported into `web/CLAUDE.md`) contains a Next.js
version-drift warning that regenerates itself — this is normal, not a bug,
and not something you introduced.

## Design system — two distinct visual languages, on purpose

There are **two separate component systems**. Do not cross-import between
them; they are intentionally different products wearing the same brand.

### 1. `components/ui/*` — the signed-in app

Adapted from a sibling project's design system (called "Enrich" in the
commit history/comments you'll see referenced) — Stripe-style layout
language: tight type scale, hairline borders, soft layered elevation. The
palette in `src/app/globals.css` was remapped from that project's amber
accent onto **ApproveHR's actual brand colours**, extracted from the real
logo:

- `--color-accent` = `#2B3990` (the logo wordmark indigo) — dark enough to
  carry **white** text.
- `--color-success` = `#8AC97D` (the logo checkmark green) — light enough
  that it must carry **ink**, never white. This is why `Button` has a
  dedicated `approve` variant separate from `accent` — green is reserved for
  the approval action specifically, matching the product's name.

Every colour pair is checked in `scripts/verify-contrast.ts` against WCAG
2.1 AA — 27 pairs currently pass. **If you add or change a token, add its
check to that script and re-run `npm run verify-contrast`.** Don't eyeball
contrast.

Import everything from the barrel: `import { Button, Card, ... } from
"@/components/ui"` — check `src/components/ui/index.ts` for the exact
exported surface before assuming a prop exists. Notably:

- `Button`/`ButtonLink` have **no `asChild` prop and no `prefix`/`suffix` on
  `Input`.** Both were tried during this build and don't exist — see the
  gotchas section.
- `Field`/`FieldSet` own accessible wiring via React context
  (`useFieldContext`/`useFieldControl`) — ids, `aria-describedby`, and
  `aria-invalid` are generated automatically. Pass `error`/`help`/`required`
  to `Field`, not raw ARIA props.
- `Card` takes an `as` prop (defaults to `div`) and `CardHeader` takes a
  `level` prop (2/3/4) to keep heading hierarchy correct wherever a card is
  nested.

### 2. `components/marketing/*` — the public site

A completely different register, modelled on **Zelt** (zelt.app): warm sand
background (`--color-sand`), tight display type at `text-mega` (88px), pill
buttons (`components/marketing/pill.tsx`), scroll reveals, a looping logo
marquee. Tokens for this live in the same `globals.css` but under the
"MARKETING SURFACE" block — deliberately separate from the app's `--color-*`
tokens because the two surfaces have different jobs (argument vs. tool).

`components/marketing/mockups.tsx` and `module-mockups.tsx` are **hand-drawn
SVG/CSS illustrations of the product**, not screenshots — this was a
deliberate choice so they never go stale and weigh nothing. Every one has a
hover animation that **performs the sentence its card is making** (a
candidate card travels between pipeline columns, a payroll "Ready to
approve" badge flips to "✓ Approved", leave days turn green one at a time).
If you add a new module card, give it a hover animation with the same
principle — motion should demonstrate the claim, not just prove the card is
interactive.

`--text-mega` was tuned for large monitors. **The container width was not, and
has changed**: it was 1440px stepping to 1520px above 1600px, and is now a flat
1200px with padding that grows with the viewport (1.5rem → 2rem → 3rem). An
earlier version of this file told you not to shrink it; the user looked at the
result on a real screen and said it read as too wide. Whitespace at the margins
is what makes a page look composed rather than merely full.

## The payroll engine exists ONCE. Keep it that way.

**This section used to say the engine existed twice and that it was temporary.
It is now one, and the second one is deleted.** The whole of the rest of this
section is kept because the reasoning is still the reasoning; read it as history
plus a standing rule.

`approvehr-api/src/modules/payroll/engine.ts` is the payroll engine. Integer
kobo, dated `TAX_SCHEDULES`, a relief regime that rides on the schedule, and
100-odd hand-worked assertions. There is no other. `web/src/lib/payroll/` now
holds `settings.ts` and `use-settings.ts` and nothing that computes tax.

**Do not add a second one, for any reason, including offline mode.** The one that
existed cost real money in wrong figures: when the Nigeria Tax Act 2025 bands
went into the backend, the frontend copy stayed on the 2011 bands and four
screens quoted ₦63,266.67 on ₦500,000 a month where the answer was ₦63,950. See
"The frontend engine is gone" below for what those four screens do now.

### The frontend engine, in detail — HISTORICAL

Kept because the *reasoning* below is still binding on the backend engine and on
anybody reading a payslip: the order of operations, statutory rates being company
settings rather than constants, bands being statute and therefore not a setting,
and employer pension sitting on top of gross. Only the file it describes is gone.
`scripts/verify-payroll.ts` is now a cross-repo fixture check — see the last
section of this file.

`src/lib/payroll/engine.ts` implemented real Nigerian PAYE, pension and NHF
maths against the Personal Income Tax Act, the Pension Reform Act 2014, and
the NHF Act. **This is hand-verified, not vibes-verified.**
`scripts/verify-payroll.ts` has 33 assertions with hand-worked expected
values in the comments — run `npm run verify-payroll` after any change to
the engine or to `lib/payroll/settings.ts`, and add a new assertion for
whatever you changed.

Things that are easy to get wrong here and were gotten wrong once already
during this build:

- **Order of operations**: pension and NHF are deducted *before*
  consolidated relief is applied. Consolidated relief is `max(₦200,000, 1%
  of annual gross) + 20% of annual gross`. Get this order wrong and every
  number downstream is plausible-looking but incorrect.
- **Nothing statutory is hardcoded as a constant** — it's all
  `PayrollSettings` (`lib/payroll/settings.ts`), read via
  `usePayrollSettings()` (`lib/payroll/use-settings.ts`), which persists to
  localStorage. Working days per month, salary split (basic/housing/
  transport), pension rates, NHF rate/basis, and every exception threshold
  are company settings, not constants — a shift-based company has a
  different working month than an office, and this must stay adjustable.
  `STATUTORY` in `settings.ts` defines the *floors* (8%/10% pension
  minimums) that `validateSettings()` refuses to let a company undercut, but
  a company can pay above them.
- **PAYE bands themselves** (`PAYE_BANDS` in `engine.ts`) are the one thing
  that *is* a constant — they're statute, not company policy, and a company
  cannot choose its own tax bands. Don't move these into settings.
- Employer pension is **added on top of gross**, never subtracted from it.
  Every place that renders a payslip or a payroll total says this explicitly
  in the copy — don't let a future screen imply employer pension reduces net
  pay.

`src/components/payroll/payslip-document.tsx` is the print-ready payslip
that reads settings live, so the rates it quotes can never drift from what
actually computed the numbers on it.

## Data layer: mock seed data vs. live stores

Two different things, don't confuse them:

- **`lib/mock/*.ts`** — static seed arrays (`EMPLOYEES`, `REQUISITIONS`,
  `APPROVALS`, `LEAVE_REQUESTS`, `TICKETS`, `GOALS`, etc.). These are the
  "day one" dataset. They do not persist edits.
- **`lib/store/employees.ts`** — the one live, edit-aware store, backed by
  localStorage. This is the pattern to copy for any new editable data (see
  "Immediate next task" below).

### The employee store pattern — copy this exactly for new stores

`useEmployeeStore()` keeps three separate arrays rather than one blob:

```ts
type StoreState = {
  overrides: Record<string, Partial<Employee>>; // sparse patches on seed records
  created: Employee[];                           // whole new records
  archived: string[];                             // hidden, never deleted
};
```

Reasons this shape matters, not just style:

1. **Overrides are a diff, not a copy.** `{"p-09": {"pensionPin": "..."}}`
   is exactly what a future `PATCH` request body looks like, and it means
   changing the seed data doesn't strand an unrelated edit.
2. **Archived, never deleted.** An employment record is a legal document;
   past payslips and approvals have to keep resolving. `archive()` /
   `restore()` toggle membership in the `archived` array; nothing is ever
   spliced out. The confirm dialog on the record page says this to the user
   explicitly — keep that copy if you touch it.
3. **`runPeopleFrom(employees)` is a function, not a constant.** Payroll,
   payslips, and anything else that needs "who gets paid this period" must
   call this against **live store data**
   (`runPeopleFrom(useEmployeeStore().directory)`), never against the
   static `RUN_PEOPLE` export, which is a snapshot taken at import time for
   server rendering only. Using the static export was a real bug during
   this build — an edited employee's payroll blocker didn't clear because
   the run wizard was reading stale data. If you add a new screen that
   needs the employee list, grep for `runPeopleFrom` usage first and follow
   the same pattern.

### The `useSyncExternalStore` + localStorage hydration gotcha

**This bit us once already — read before writing a new store.** The naive
version reads `localStorage` inside `getSnapshot`. That works, but the
server has no `localStorage`, so it renders the empty/default state; the
client then reads the real stored state on its very first render, and
React throws a hydration mismatch because server and client HTML disagree.

**Since this was written, `lib/store/persisted.ts` encapsulates the fix** — use
`createPersistedState` and you get it for free. The explanation below is still
worth reading, because you need to recognise the symptom.

The fix, applied in `lib/store/persisted.ts` and in the two stores that predate
it (`lib/store/employees.ts`, `lib/payroll/use-settings.ts`): `getSnapshot`
always returns an in-memory
`cache` variable that starts equal to the empty/default state and is **only
populated from `localStorage` inside `subscribe()`**, deferred with
`queueMicrotask`, which runs after hydration completes. Don't reach for `useEffect` + `useState`, and don't read
storage directly in the hook body — but prefer the factory to copying.

## Known gotchas — things that look right but aren't

- **`e.currentTarget` inside a `setState` updater function is `null` by the
  time the updater runs** — React nulls it out once the synthetic event
  finishes dispatching, and a `setDraft((d) => ({...d, x: e.currentTarget.value}))`
  pattern will crash. Read the value into a local const *before* the
  updater, or use `e.target` (not pooled in React 17+) if you must reference
  it inside a callback. This crashed the payroll settings form once.
- **Never nest an `<a>` inside another `<a>`.** A module card that was a
  full-surface `<Link>` wrapping a "Find out more" `<Link>` is invalid HTML
  and silently breaks hydration (renders a blank page, no console error
  pointing at the real cause). The fix pattern used throughout
  `components/marketing/sections.tsx`: make the outer wrapper a plain
  `<article>`, and give the *inner* link `after:absolute after:inset-0` so
  it stretches to fill the card as the click target.
- **`Button` has no `asChild` prop.** If you want button styling on a link,
  use `ButtonLink`, not `<Button asChild><Link>...</Link></Button>`.
- **`Input` has no `prefix`/`suffix` prop.** For a search-icon-in-input
  pattern, wrap manually (see `people/directory.tsx`'s search box) — an
  absolutely positioned icon plus left padding on the input.
- **A funnel chart assumes monotonically decreasing values.** Don't feed it
  "current occupancy per stage" data (which isn't monotonic — a later stage
  can have more people in it than an earlier one this week) or the bars
  overflow their track. Use `BarChart` for point-in-time counts; reserve
  `FunnelChart` for genuine conversion-over-time data.
- **Dev-server hot reload can hold a stale chunk referencing a since-deleted
  export** and throw a confusing runtime error that has nothing to do with
  your last edit. If a browser error mentions a symbol you know you removed
  cleanly (`tsc`/`lint` both pass), stop the preview server, `rm -rf .next`,
  and restart before debugging further — don't chase a phantom.
- **The old employee-store shape didn't have `created`/`archived`.** If you
  see a bug report about "my edit disappeared," the user's browser likely
  has a stale `localStorage['approvehr.employee.store']` payload from
  before this key existed. `EMPTY` spread guards against missing *new*
  fields on old payloads, but a full shape change (like the overrides→store
  rename this session) orphans old data. Consider a version field in the
  persisted payload if you change the shape again.

## Route map (52 routes, all currently building clean)

### Marketing (`app/(marketing)/`) — public site, own chrome/nav/footer

| Route | Purpose |
|---|---|
| `/` | Homepage — hero, "shapes of company" photo section, platform rail, module grid, Nigeria section, stats, pricing teaser, testimonials, CTA |
| `/pricing` | Tiered pricing + live calculator (`app/(marketing)/pricing/calculator.tsx`) |
| `/product/[module]` | One page per module (payroll, core-hr, hiring, time, performance, desk) — capability walkthrough with hand-drawn mockups |
| `/demo` | Demo request form (not centered — intentionally paired with the form beside it) |
| `/privacy`, `/terms`, `/security`, `/dpa` | Legal and trust documents. Content in `lib/marketing/legal.ts`; one renderer. These were 404ing from the footer before they existed. |
| `/sitemap.xml`, `/robots.txt` | Generated from the same content modules the pages render from |

### App (`app/(app)/`) — signed-in product, shares `AppShell` + sidebar nav

| Route | Purpose | Data source |
|---|---|---|
| `/dashboard` | Home/landing after sign-in | mixed |
| `/approvals` | **Cross-module approval inbox** — ranks by deadline then age. Leave rows are derived, not authored | `lib/workflows/queue.ts` over the leave + approvals stores |
| `/hiring`, `/hiring/requisitions/new`, `/hiring/requisitions/[id]`, `/hiring/candidates/[id]`, `/hiring/interviews`, `/hiring/offers` | Full ATS: pipeline board+table, 5-step requisition wizard, candidate record, offer approval with band-position indicator | static `lib/mock/hiring.ts` |
| `/people`, `/people/[id]`, `/people/new` | **Editable** directory + record + creation | `lib/store/employees.ts` (live) |
| `/people/leave` | Leave requests, balances, holidays, booking | `lib/store/leave.ts` (live, editable) |
| `/people/attendance` | Clock in/out, roster, 15-day timesheet with payroll proration | `lib/store/attendance.ts` (live) |
| `/people/onboarding` | Starter checklists | static `ONBOARDING` |
| `/payroll`, `/payroll/runs/new`, `/payroll/payslips`, `/payroll/payslips/[id]`, `/payroll/statutory` | Payroll dashboard, 5-step run wizard with real exception detection, payslip index with delivery-status tracking, statutory filing schedules | `runPeopleFrom(store)` + `lib/payroll/engine.ts` |
| `/performance` | Goals cascade + review cycle | static `GOALS`/`REVIEW_CYCLE` |
| `/help` | Ticket queue + knowledge base | static `TICKETS`/`KB_ARTICLES` |
| `/reports` | Cross-module charts, all computed live from the employee store (never a separate reporting dataset) | derived |
| `/settings`, `/settings/payroll` | Settings hub — every card is now a real link — plus the payroll settings form with live payslip preview | `lib/payroll/use-settings.ts` (live) |
| `/settings/company`, `/settings/leave`, `/settings/roles`, `/settings/notifications`, `/settings/integrations` | The five sections that used to be "Not built yet" cards | `lib/store/company.ts` (live) |
| `/design-system` | Internal token/component showcase — not part of the product, keep it working as you add components |

## What's genuinely done vs. stubbed

**Done and load-bearing** (break these and you break the pitch):

- Payroll engine, statutory settings, exception detection, the run wizard,
  payslip generation and distribution tracking.
- Employee CRUD (create/edit/archive/restore) with live propagation into
  payroll blockers — verified end to end multiple times this session.
- The full ATS pipeline (requisition → candidate → scorecard → offer →
  employee record).
- Design system contrast verification and the marketing site.

**Explicitly stubbed / read-only** — do not treat these as working just
because a page renders:

- **Goals and tickets are read-only.** No store, no approve/decline action
  wired to state. (Leave is no longer in this list — see below.)
- No backend connection **yet**. The API exists and runs; no screen calls it.
  That is the next substantial piece of work.
- localStorage is per-browser — there is no cross-device sync, and the
  record page for a `people/new`-created id will 404 in a different browser
  (it says so explicitly rather than crashing).
- Attendance corrections, leave decisions and settings changes all persist to
  localStorage only. Per-browser, no sync, gone when site data is cleared.

## What was built after the original handover

Recorded here because several of these contradict what this file used to say.

### Leave and approvals now share one store — the gap is closed

`/approvals` no longer holds its own copy of anything. `lib/workflows/queue.ts`
**derives** leave rows from `LEAVE_REQUESTS` and deciding one writes through to
the request itself, so the inbox, `/people/leave` and the employee's record
cannot disagree. Two pending requests the old hand-written `APPROVALS` array had
simply forgotten (`lv-02`, `lv-07`) appeared in the inbox as a direct result.

Verified in the browser both ways: approving in the inbox flipped the request on
the leave screen and moved the balance from "13 left · 5 pending" to "8 left".

### New pieces worth knowing about

| File | What and why |
|---|---|
| `lib/store/persisted.ts` | The localStorage store pattern, extracted. **Use this for any new store** rather than copying `employees.ts` — it carries the hydration rule and adds a version field so a shape change drops stale payloads instead of stranding them. `employees.ts` predates it and still has its own copy; leaving it alone was deliberate. |
| `lib/store/leave-balances.ts` | `useLeaveBalances()`. The **only** way a screen should ask for a balance. `leaveBalancesFor` takes the company policy as an optional third argument, and optional was the bug: the settings page passed it and every other screen forgot, so changing Annual leave from 20 to 26 days moved one preview and nothing else. |
| `lib/today.ts` | `TODAY`. The demo's "now", previously a `"2026-08-19"` literal in five files. |
| `lib/store/session.ts` | Who is signed in. Deliberately **not** built on `createPersistedState`: every other store treats "empty" and "not yet loaded" as the same thing, and here they are opposites — empty means signed out, which would flash the sign-in screen at a signed-in user on every load. |
| `lib/marketing/links.ts` | Whether "Sign in" and "see it live" appear at all. Unset `NEXT_PUBLIC_APP_URL` and they are dropped rather than pointed at a 404 — which is what makes the standalone marketing repo possible. |
| `scripts/export-marketing.ts` | Generates the public repo. The assertions at the end are the point: reach from marketing into `@/components/ui` or `@/lib/payroll` and the export fails rather than shipping a repo that cannot build. |

### New screens

- **`/people/attendance`** — clock in/out, today's roster, a 15-day timesheet.
  Reads the leave store (approved leave shows as "on leave", never a no-show)
  and payroll settings (the proration column divides by the same
  `workingDaysPerMonth` payroll uses). Corrections require a note.
- **The five settings pages** — company, leave, roles, notifications,
  integrations. `/settings/leave` is load-bearing, not preferences: its
  `entitled` figure is what every balance measures against.
- **Legal pages** — `/privacy`, `/terms`, `/security`, `/dpa`. These were
  **404ing from the footer** the whole time, which broke the project's own rule
  about never linking at a page that isn't there. Plus `sitemap.ts` and
  `robots.ts`.
- **Sign-in gate** — `components/portal/auth-gate.tsx`. Renders in place rather
  than redirecting, so a deep link survives sign-in. Says plainly that it is not
  authentication, because it isn't.

### Accessibility, and the grid that had to go

Three related fixes, in order of how much they mattered:

- **The ambient grid and the gradients are gone from the app surface.** They
  were a 32px indigo lattice behind every page header, a fall of colour down the
  sidebar, and a radial wash on empty states. At 4% opacity they were invisible
  against a card and clearly visible *through* 11px text, which put a varying
  background luminance behind every glyph — unsteady to read, and it made the
  real contrast ratio of any text on them unknowable. Contrast you cannot
  measure is contrast you cannot promise. The utilities in `globals.css` are
  kept as flat fills so no call site changed. **The marketing surface is
  untouched** — large type, solid sand ground, never had the grid.

- **`--color-muted` and `--color-faint` were darkened** to `#586675` and
  `#616d76`. `faint` was previously exempted from AA at 3:1 on the grounds that
  it was "large text and icons only", and that was simply not true of the code:
  it renders 11px section headings and table hints. Every text token now clears
  4.5:1 on all eight backgrounds the app uses. The cost is a compressed bottom
  to the scale — muted 5.9:1, faint 5.3:1 — which is the arithmetic of fitting
  five text weights above 4.5.

- **`scripts/verify-contrast.ts` now checks a matrix, not a hand-written list.**
  It modelled `surface` and `canvas` only, and passed while three real pairs
  failed in the browser. It now generates every text-token × background
  combination: 27 named pairs plus 40 generated. **A model that omits a
  background cannot catch a failure on it** — which is why the empirical browser
  audit matters too, and why it is worth re-running after a palette change:
  walk every element with visible text, composite the effective background up
  the ancestor chain, and compare. 404 combinations across 16 screens, zero
  failures.

### The sidebar highlighted more than one item

`/people/attendance` lit up both "Directory" (a prefix match on `/people`) and
"Attendance" (an exact match). `resolveActiveHref` in `shell.tsx` now picks the
**longest** matching href and only that one. `/people/p-01` still highlights
Directory, because a record page genuinely belongs to it and has no nav item of
its own.

### Decisions that reversed something this file used to say

- **The container is 1200px now**, not 1440 stepping to 1520. This file said
  don't shrink it; the user looked at it and said it was too wide. Padding grows
  with the viewport instead of the content.
- **Module names are canonical**: Recruitment, Time & Leave, Employee Support.
  And the homepage leads with "All your HR and payroll, in one system" rather
  than "Payroll day should be boring" — the old copy was judged vague and
  over-written against how PeopleForce, SeamlessHR, PaidHR and NotchHR actually
  read. `lib/marketing/modules.ts`'s header records the new rules.
- **"Payroll day should be boring" is retired as an endline** too. The campaign
  doc now recommends "The only thing left to do is approve." — boring reads as a
  negative, and the feeling being sold is confidence.

## The API connection — how it works now

The frontend runs in **two modes**, detected rather than configured, and every
screen says which one it is in.

| | Connected | Demo |
|---|---|---|
| Trigger | `GET /health` answers | it does not |
| Sign-in | real email + password, JWT session | pick a seeded employee, no password |
| Data | Postgres, server-side search and paging | localStorage, filtered in memory |
| Badge | "Live from the API" | "Demo data, this browser only" |

Demo mode is not a leftover. This prototype gets shown on laptops in rooms with
no database, and a product that cannot be demonstrated without infrastructure
does not get demonstrated. The rule is that it must never *look* connected when
it is not — hence the badges, and hence `useApiReachable`.

### The files

| File | Role |
|---|---|
| `lib/api/client.ts` | `fetch` wrapper. Read the note on `refreshing` before touching it: refresh tokens **rotate**, so two concurrent refreshes make the second present an already-rotated token, which the API correctly treats as theft and answers by revoking every session. One shared promise is what stops a multi-panel screen signing itself out on every token expiry. |
| `lib/api/endpoints.ts` | One typed wrapper per endpoint, and the **kobo → naira** boundary. The API speaks integer kobo; `Employee` is still in naira. `toEmployee` is the seam, and it is meant to shrink to nothing once the frontend engine is deleted. |
| `lib/store/session.ts` | Both sign-in paths. Note it does **not** use `createPersistedState` — every other store treats "empty" and "not loaded" as the same, and here they are opposites. |
| `lib/store/employees-api.ts` | `useEmployeeDirectory` / `useEmployeeMutations`. Picks the source; screens do not care which. Copy this shape for the next store. |

### Two gotchas found doing it

- **Relative imports in `web/` must have no extension.** The API is Node ESM and
  needs `./x.js`; Next resolves with the bundler convention and cannot. `tsc`
  maps `.js` → `.ts` so **typecheck passes either way** — only the bundler
  complains, and only in the browser. Another entry for the list of bugs that
  `tsc` and `lint` cannot see.
- The directory rendered the unfiltered `rows` while computing a filtered
  `visible`, so the archived view showed active records. Caught by clicking it,
  not by a type.

### Still not done

1. **Only the directory is switched over.** `/people/[id]`, `/people/leave`,
   `/approvals`, `/people/attendance` and `/settings/*` still read localStorage.
   The endpoints all exist; each screen is a `useEmployeeDirectory`-shaped hook
   and a browser check. Do them one at a time.
2. Payroll runs, recruitment, performance and help desk have no API module yet.
3. Goals and tickets are still read-only even locally.
4. The ETL out of the existing Django database.
5. `web/src/lib/payroll/engine.ts` should be deleted once payroll screens read
   from the API, and `Employee.grossMonthly` renamed to kobo with it.

## Verification workflow — do this before claiming anything works

1. `npm run check` (typecheck + lint + contrast + payroll maths) — must be
   clean.
2. `npm run build` — must succeed, confirm the route count didn't silently
   drop.
3. Open the relevant page(s) with your browser tool and **read the DOM or
   take a screenshot** — don't infer success from the build alone. Multiple
   real bugs this session (the hydration mismatch, the stale `RUN_PEOPLE`
   read, the `e.currentTarget` crash, the nested-anchor blank page) only
   surfaced in the browser, never in `tsc`/`lint`/`build`.
4. When testing a change that should propagate across screens (an edit, an
   approval, an archive), **prove the propagation** — change it on screen A,
   navigate to screen B, confirm B reflects it. Don't assume a shared store
   is wired correctly just because it compiles.

## One more thing

If you disagree with a decision recorded here, that's fine — but change it
deliberately and update this file to say what you changed and why, the same
way this file itself exists because the user asked for continuity. The next
person after you will thank you for it.

---

# What changed in the parity build

Everything below happened after the section above was written, and several
entries contradict it. Where they conflict, this is the later word.

Read `PARITY.md` first for *why* — it is the gap analysis against the incumbent
and the phased plan. This section is the *what*.

## Both repos now exist, and the frontend is finally in version control

- `web/` → **`SchullGroup/approvehr-frontend`** (private). Before this session it
  had **zero tracked files in any git repo** — the whole frontend existed on one
  disk. If you take one thing from this file: commit early.
- `approvehr-api/` → `SchullGroup/approvehr-backend` (private).
- `.env` is now **ignored** and `.env.example` is the committed template. It was
  briefly the other way round, on the documented grounds that `NEXT_PUBLIC_*`
  values compile into the client bundle and are therefore public anyway. True,
  and still a footgun: the next person adds a real secret to a file they
  reasonably assume is ignored.

## A real bug in the payroll engine, and what it means for the pitch

`computePayslip` folded additions into gross **before** applying the
basic/housing/transport split. A ₦100,000 bonus on a ₦500,000 salary therefore
raised "basic" by ₦60,000, which raised the employee's pension deduction from
₦40,000 to ₦48,000 and their NHF from ₦7,500 to ₦9,000.

Both wrong. Pension is charged on monthly emoluments (Pension Reform Act 2014);
NHF on basic salary (NHF Act). A discretionary bonus is neither. **The old
assertion only checked that gross and PAYE went up, so it passed for months** —
which is the lesson: an assertion that does not name the figure it is protecting
protects nothing.

The split now applies to the contractual figure alone. Allowances sit beside it
and enter the pension and NHF bases only when explicitly marked `pensionable`,
which **defaults to false because that is what the statute says**.

### The engine's public shape changed

- `Variation` now carries itemised `allowances: AllowanceSpec[]` and
  `deductions: DeductionSpec[]`. The old scalar `additionsKobo` /
  `postTaxDeductionsKobo` still work and behave as one unlabelled taxable,
  **non-pensionable** allowance and one post-tax deduction respectively.
- Percentages resolve against the **contractual** figure, never a running total.
  That is deliberate and has its own assertion: resolving against a total makes
  each line's value depend on the order the array happens to be in, so two runs
  of the same data can disagree.
- Post-tax deductions are **capped at available net**, with the shortfall
  reported as `unrecoveredDeductionKobo`. A loan instalment cannot be recovered
  from somebody who earned less than it — one month of unpaid leave is enough to
  cause it — and the loans module carries the remainder rather than the engine
  producing a negative payslip.
- **89 assertions**, up from 50, every expected value hand-worked against a
  separate implementation written in Python purely to check the TypeScript.

### PAYE bands are versioned now

`PAYE_BANDS` was a single hardcoded array, defended on the grounds that a
company cannot choose its own tax brackets. Right, and incomplete: bands are
*versioned*. `TAX_SCHEDULES` holds dated schedules with citations and
`scheduleFor(schedules, date)` resolves one.

**The Nigeria Tax Act 2025 bands are now entered** — this file used to say they
were deliberately absent, on the grounds that a guessed band is worse than a
missing one. That reasoning still stands; the bands are in because three
independent sources were checked and agree exactly:

- PwC Worldwide Tax Summaries, which states them as band *widths*, the form this
  engine stores.
- KPMG GMS Flash Alert 2025-168, which states them as cumulative thresholds. The
  two reconcile: 800,000 / +2,200,000 = 3,000,000 / +9,000,000 = 12,000,000 /
  +13,000,000 = 25,000,000 / +25,000,000 = 50,000,000 / above.
- EY, for the 26 June 2025 signing date and the abolition of the CRA.

First ₦800,000 exempt, then 15 / 18 / 21 / 23 / 25 per cent. The wider 0% band
also replaces the old 1%-of-income minimum tax.

### The relief regime changed, not just the table

**The Consolidated Relief Allowance is abolished**, replaced by relief on *rent*
— 20% of annual rent paid, capped at ₦500,000. That is a different **input**, not
a different formula: the old relief was a function of income, the new one of
something the employee has to declare and the old regime never asked for.

So `ReliefRegime` rides on the `TaxSchedule`. December 2025 gets the CRA, January
2026 onwards gets rent relief, from one code path with no date branch anybody has
to remember. `Employee.annualRent` and `rentDeclaredAt` are new;
`Variation.annualRentKobo` carries it into the engine.

**Null means undeclared, and undeclared means no relief.** That is the statute,
not a defensive default, and it costs real money — on ₦500,000 a month, somebody
who has not declared pays ₦63,950 against ₦63,266.67 under the old regime, so the
reform makes them *worse off* until they declare. `ComputedPayslip.reliefUnclaimed`
reports it per person and the run raises a WARNING naming the headcount, because
the only way those people find out is if something tells them.

At the other end, ₦60,000 a month now pays exactly nothing against ₦1,819.67
before.

`confirmedThrough` on the 2026 schedule stops at the end of 2026. Push it forward
when somebody checks again; do not remove it. A 2027 period comes back
`stale: true` and still computes — my first draft *threw* on a stale schedule,
and since today is 2026 that would have broken every run in the product. Refusing
to pay anybody because a lookup table is stale is the worse failure.

## The reconciliation gate — read this before touching the run

`src/modules/payroll/reconcile.ts` exists because of what an audit of the live
incumbent system found in its own data on 20 August 2026:

| Their live figure | Why it is impossible |
|---|---|
| Net ₦3,218,741.96 against gross ₦1,833,500.33 | net exceeded gross by ₦1.47m |
| Gross ₦833,500.33 − deductions ₦88,958.37 = net ₦700,211.96 | out by ₦44,330 |
| PAYE ₦1.8m on ₦3.2m payroll | 56% effective; top *marginal* band is 24% |
| Millions in gross, `0` employees | two separate runs |

All rendered on screen without complaint. **The failure was not the arithmetic
— it was that nothing between the arithmetic and the screen ever asked whether
the answer added up.** Each of those five figures now has an assertion proving
it is refused.

Checks are exact integer identities with **no tolerance**. A tolerance is a
decision that being slightly wrong is acceptable, and on a payment file it is
not. `reconcile()` returns every discrepancy rather than throwing on the first,
because one refusal naming eleven problems beats eleven refusals naming one.

If you add a figure to `ComputedPayslip`, add its identity here too.

## Backend: 16 modules, 86 models, 347 tests

New this build: `permissions`, `notifications`, `setup`, `pay-components`,
`grades`, `loans`, `reimbursements`, `imports`, `payroll` (router/service — it
was engine-only), plus `auth` completed with register, verify-email and password
reset.

### Conventions worth knowing before you write a module

- **Copy `src/modules/departments/`.** It is the reference shape:
  `router.ts` + `schemas.ts` + `service.ts`, and its service is the reference for
  refusing an operation and *naming* the blockers rather than failing silently.
- **"Writes return ids, reads return shapes."** No `include` on a create or
  update — Prisma loads relations in parallel inside a transaction and it
  surfaces as a pg deprecation warning.
- **Multi-tenancy is in the client, not the arguments.** `requireDb(req)` returns
  a scoped client. Never thread an `organizationId` through a service signature,
  and never `findUnique` on a scoped model (the extension rewrites it to
  `findFirst`). New model with an `organizationId`? Add it to `SCOPED_MODELS` in
  `src/db/tenant.ts`. Without one? Add it to the comment below that list *with
  the reason* — `TaxBand` is there because statute belongs to no tenant.
- **Money crosses the API as integer kobo.** Prisma returns `Decimal`; never
  `Number()` one into arithmetic. `toKobo(String(value))` is the seam.
  `Number(Decimal)` is fine for a *rate* — five decimal places, far inside float
  precision — and that distinction is written where it is relied on.
- `exactOptionalPropertyTypes` is on. Use `compact()` from `lib/http.ts` rather
  than relaxing the compiler.
- A create through the scoped client needs
  `as Prisma.<Model>UncheckedCreateInput`, because the extension injects
  `organizationId` and the checked type does not know that.

### Six new permissions, and why they are separate

`MANAGE_ROLES` is deliberately **not** folded into `MANAGE_SETTINGS`: changing
the company address and granting yourself `APPROVE_PAYROLL` are not the same
kind of act, and one permission covering both means the office manager who
maintains the address can also pay themselves. Same reasoning splits
`MANAGE_PAY_STRUCTURE` from `RUN_PAYROLL`, and `IMPORT_DATA` from
`EDIT_RECORDS` — one careless upload creates or overwrites hundreds of records,
and blast radius is what a permission is for.

The permissions module enforces two guards worth keeping: a caller cannot grant
a permission they do not themselves hold (otherwise `MANAGE_ROLES` *is* every
permission), and a change that would leave nobody holding `MANAGE_ROLES` is
refused, because locking everyone out is unrecoverable without database access.

## Progressive disclosure is the usability argument — don't remove it

`OrgFeatures` holds per-company feature flags written by the setup wizard's five
questions. A five-person business sees six nav items instead of thirty. The
incumbent shows ~120 routes to that same business, and that is the single
biggest thing we do better.

Three rules that follow, all three in `PARITY.md` and all three load-bearing:

1. **One route per concept, rendered by role.** Not `/performance/manager` and
   `/performance/my-objectives` and `/performance/executive`. One
   `/performance` that reads `useCan()` and `useIsManager()`. The incumbent has
   ~120 routes largely because it did the opposite.
2. **Turning a flag off never deletes data.** That is why the flags are a table
   and not a migration.
3. **A screen answers one question, and the rest is behind a reveal** —
   `PARITY.md` Rule 5, the same argument applied inside one page rather than
   across the nav. Closed by default for a year of dates, an audit trail, a
   settings sub-form; **open** for a blocker, an exception, an approval waiting
   on the reader. A reveal that hides something costing money is the failure
   mode, which is why the leave screen's ungazetted-holidays warning renders
   *outside* the closed calendar. The primitive is `Disclosure` in
   `components/ui/disclosure.tsx` — there is exactly one, on purpose.

`src/lib/permissions.ts` (`usePermissions` / `useCan` / `<Can>` /
`useIsManager`) and `src/lib/store/features.ts` (`useFeatures`) are the
primitives. The sidebar is filtered by both — see `nav.tsx`, where every item
may carry a `permission` and a `feature`.

## Assembling a payroll run

`src/modules/payroll/assemble.ts` is the join between four modules that
deliberately do not know about each other. Each exports one function returning
specs in the engine's own shape:

| Module | Seam |
|---|---|
| pay-components | `resolveComponentsFor(db, employeeId, period)` |
| loans | `dueRepaymentsFor(db, employeeId, period)` |
| reimbursements | `payableClaimsFor(db, employeeId, period)` |

Nothing in `assemble.ts` does arithmetic on money. That stays in the engine,
which is what keeps its 89 assertions meaningful.

Two things there that will bite you:

- **`unpaidDaysFor` mirrors the attendance roster's precedence exactly** —
  holiday, then rest day, then approved leave, then no clock-in. If those two
  ever diverge, the timesheet and the payslip disagree about the same day, and
  the person who finds out is the employee docked for a day they filed leave
  for. The order is stated in a comment in both places.
- **Prepare settles nothing.** It is re-runnable, because the normal loop is run
  it, read the exceptions, fix a bank account, run it again. If preparing
  consumed a loan instalment, running twice would take two months of somebody's
  repayment. **Approval is the one-way door**, and it is where the settings
  snapshot is frozen onto the run.

`BLOCKER` versus `WARNING` on a `PayrollException` is whether the run would be
*wrong* or merely *surprising*. A missing account number blocks; a stale tax
schedule warns.

## Capabilities we cannot perform: the seam pattern

Three places need a credential or a transport nobody has wired. All three follow
the same shape, first established in `src/modules/auth/delivery.ts`:

> One registration function, one accessor, a warning logged at module load
> **and** at every call, dev behaviour that is obviously dev, and production
> behaviour that **refuses**.

- **Email** — `delivery.ts`. Outside production it returns the token so you can
  test a reset flow; in production it returns null, always.
- **Payments** — `src/modules/payments/provider.ts`. With no provider
  registered, `submit` refuses. It does not return a fake reference and it does
  not set the batch to COMPLETED. The bank upload file **does** work and is the
  real fallback.
- **File upload** — receipts, CVs and documents accept an object-storage *key*.
  The schema never stores a file.

Do not "finish" any of these with something that looks like success. A green
"Paid" that moved no money is the worst thing a payroll product can ship, and
the audit above found the incumbent doing a version of exactly that.

## CI

`.github/workflows/ci.yml`. Runs a real Postgres service rather than mocking one
— the tenant-isolation tests open transactions and assert that one organisation
cannot read another's rows, which cannot be mocked usefully.

Two checks in the docker job exist for specific failure modes:

- The container must **start** and answer `/health`. An image that builds and
  then cannot boot is what a build-only job misses.
- `/health/ready` must return **503** with no database reachable. A 200 there
  means a broken task stays in the ALB target group taking traffic — the exact
  bug `docs/deployment.md` asks the infrastructure to stop having. Asserting it
  stops readiness quietly degrading into a second liveness endpoint.

## New verification in `npm run check`

Beyond typecheck, lint, contrast and payroll: a CSV parser suite (97 assertions
— quoted fields containing commas and newlines, and the BOM Excel writes) and
**600 reconciled loan schedules**. Neither was asked for; both were written by
the module that needed them, and that is the right instinct. Keep it.

## Things that are still not done

1. **The screens are switched over.** Every one reads the API when one answers,
   with the local store as the demo fallback. That is not a leftover: the product
   gets shown on laptops with no database, and the rule is that it must never
   *look* connected when it is not.
2. **Done — `web/src/lib/payroll/engine.ts` is deleted.** See "The frontend
   engine is gone" at the end of this file for what replaced it, including the
   one backend endpoint that had to be added and what demo mode does now.
3. **The ETL out of the Django database** exists at `scripts/etl/` — introspect,
   plan, fixture, migrate — and is tested against a synthetic legacy database.
   What is *not* done is the mapping: every column name in `plan.ts` is still
   `inferred`, and the fixture is built from the same guesses, so the tests prove
   the machinery and not the aim. `--apply` refuses to write until the tiers it
   touches are confirmed. Somebody with credentials runs `introspect.ts`,
   corrects `plan.ts`, and the guard opens on its own. Six models are mapped but
   unimplemented; `migrate.ts` names each one rather than omitting it quietly.
4. **The Nigeria Tax Act 2025 bands are in.** See above.
5. **The suite is flaky.** Six or seven different backend tests have failed
   intermittently and passed on a clean re-run. `fileParallelism` is already
   false, so it is not files racing — it is tests asserting exact counts against
   a database other files write to. One instance was a genuine bug (an unscoped
   count in the insights module reading another organisation's rows), so the
   flakes are worth chasing rather than retrying past.
6. **The infrastructure deltas are on a branch, unapplied.**
   `SchullGroup/approvehr-infrastructure`, branch `node-worker-and-secrets`:
   the Celery worker command replaced with the Node one, secrets moved from an
   S3 `.env` to Secrets Manager, and the target group pointed at
   `/health/ready`. Terraform is not installed on the machine that wrote them,
   so they are **not validated** — read the diff and run a plan before anything
   is applied.

---

# The frontend engine is gone

The last entry in the list above is closed. `web/src/lib/payroll/engine.ts` — the
second implementation of Nigerian statutory tax, in floating-point naira, in the
browser — is deleted. This section is what replaced it and why each choice was
made, because two of the choices are ones a reasonable person would make
differently and should not undo by accident.

## Who was using it, and what each one does now

| Screen | Was | Is |
|---|---|---|
| `/settings/payroll` preview | `calculatePayslip` on ₦1,000,000 with the **draft** settings | `POST /payroll/quote` with the draft settings in the body |
| `/people/new` first payslip | `calculatePayslip` on the salary being typed | `POST /payroll/quote`, settings omitted so the company's **saved** ones answer |
| `/people/[id]` compensation | API when connected, engine offline | API when connected, fixed illustrative figures offline |
| Loan application take-home | two `calculatePayslip` calls, before and after | one `GET /pay-components/preview/:id` for their real net, minus the instalment |
| `lib/store/payroll.ts` demo run | `calculatePayslip` per person | fixed illustrative figures, or a refusal |

`lib/store/payslip-quote.ts` is the hook. `lib/mock/payroll.ts` now owns the
`PayrollEmployee` type, which used to live in the engine.

## One endpoint had to be added: `POST /payroll/quote`

`GET /payroll/preview` already existed and could not serve three of those five
callers, because it takes an `employeeId` and they have no employee: one is
previewing settings nobody has saved, one a person nobody has created. So the
backend gained `POST /payroll/quote` — a gross figure, an optional settings
block, an optional variation, and no database row required.

Two rules in it are load-bearing:

- **The caller may choose the settings. It may never choose the bands.** Bands
  and the relief regime come from the period, because a company cannot choose its
  own tax brackets or decide the Consolidated Relief Allowance still exists.
- **Supplied settings that are invalid are refused, not computed.** Stored
  settings that are invalid are reported in `settingsIssues` and computed anyway
  — the reader of a quote is usually not the person who can fix the company's
  settings, and a blank panel would not tell them why.

`tests/payroll-quote.test.ts`, 16 assertions, including ₦63,950.00 on ₦500,000
under the 2025 Act and ₦63,266.67 on the same salary in December 2025. Those are
the two figures from the incident, and having both come out of one code path is
the point of the whole exercise.

### And a real bug found next door

`engineSettingsFor` in `pay-components/service.ts` resolved the PAYE bands from
the period and **did not carry the schedule's `relief` with them**.
`computePayslip` defaults to the CRA when no regime is passed, so
`GET /pay-components/preview` was granting 2026 employees a relief the Act
abolished while `payroll/prepare` was not — one engine, two answers, on adjacent
screens. Fixed, with an assertion in `tests/pay-components.test.ts` that is
deliberately the only 2026 block in a file otherwise disciplined to June 2025.

## Demo mode: fixed illustrative figures, and two refusals

This is the decision to read before changing anything here.

With no API there is no authoritative figure. The options were to omit payroll
from demo mode, or to show fixed figures and label them. **Fixed figures won**,
for one reason: this product is shown on laptops in rooms with no database, and a
payroll product whose payroll module is empty in that room does not get bought.
Omission is the right answer for a *preview* — a salary being typed is not a
figure anybody needs to see wrong — and it is the wrong answer for the module
that carries the pitch.

- `src/lib/mock/demo-payslips.ts` is **generated** by
  `approvehr-api/scripts/emit-demo-payslips.ts`, which is in that repo because it
  is the only place allowed to import the engine. Its header carries the exact
  command. Do not hand-edit it.
- It covers the ten demo salaries, on the default settings, with no allowances
  and no declared rent. Every screen that renders a figure from it says
  "illustrative" in the same breath.
- **It refuses twice.** A salary it has no row for — an edited one, or a person
  created in demo mode — raises a BLOCKER on the run naming them, and shows no
  figures on their record. Settings moved away from what the figures were
  generated on raises a BLOCKER for the whole run, because the figures no longer
  describe that company. `settingsMatchFixture` is that rule.
- The one piece of arithmetic left in the browser is the post-tax deduction, and
  it is the piece that needs no engine: an after-tax deduction takes exactly its
  own amount off take-home, capped at what is there. Same rule as
  `demoNetEffectKobo` in `lib/store/pay-components.ts`.

## `npm run verify-payroll` is now a cross-repo check

It used to test the frontend engine (33 assertions) with a divergence guard
bolted on. There is no frontend engine to test, so it checks what this repo can
still be wrong about: 51 assertions over the fixture's reconciliation identities
(exact integers, no tolerance, the same ones `reconcile.ts` demands), every demo
salary having a row, the fixture's settings still being this repo's defaults, and
— when `approvehr-api` is checked out beside this repo — the fixture's recorded
tax schedule matching the API's newest **band for band**, parsed out of the
backend source as text.

That last one is the guard the original incident needed. It was tested by
tampering with a band and a relief cap in the fixture and confirming both fail.
It still skips when the sibling repo is absent, because the frontend's CI clones
this repo alone — so CI proves the fixture reconciles, and a developer with both
repos proves it is current. The package script keeps its name, so `npm run check`
and `.github/workflows/ci.yml` needed no change.

## Staleness, which is the frontend bug worth knowing about

`usePayslipQuote` debounces the request and matches the answer against the
**live** key, not the debounced one. Debouncing alone leaves last keystroke's
figure on screen beside an input that has already moved, which on a salary
preview is a wrong number wearing a right number's label. `lib/use-debounced.ts`
says this in its header.

**The same defect still exists in `payroll/pay-setup/pay-components-panel.tsx`**,
which debounces an amount into `usePayPreview` and derives nothing from the live
value. It was left alone deliberately — it is not one of the five callers this
change was about — but it is a two-line fix and worth doing next time that file
is open.

# The public holiday calendar

`/people/leave` used to say "The API does not publish a holiday calendar yet".
It did not, and then it did — `GET/POST/PATCH/DELETE /leave/holidays` — so that
string, and the `unavailable` state it hung off, are both gone.

## What was built

| File | What |
|---|---|
| `lib/api/leave.ts` | `holidays()` reshaped to the real envelope (`{ holidays, awaitingProclamation }`), plus `createHoliday` / `updateHoliday` / `deleteHoliday`. `PublicHolidayRow` gained the `id` that edit and delete address. The old "no route yet, returns `null` on 404" branch is deleted. |
| `lib/store/holidays.ts` | **New.** `usePublicHolidays(year)` and `useHolidayMutations()`, shaped on `lib/store/shifts.ts` — demo value in a `useMemo`, fetch in an async IIFE behind a `cancelled` guard, staleness by comparing a key during render. Split out of `leave-api.ts` because the calendar and two hundred leave requests should not share a refresh. |
| `people/leave/holiday-calendar.tsx` | **New.** Twelve mini-months, full width, replacing the four-line list in the 340px rail. |
| `settings/leave/holidays-panel.tsx`, `holiday-form.tsx` | **New.** List, add, edit, delete, mark confirmed. Gated on `MANAGE_SETTINGS`; read-only for anybody else, with a line saying why. |
| `lib/mock/workflows.ts` | `PUBLIC_HOLIDAYS` grew from 4 dates to Nigeria's 2026 set, with ids and a header explaining which dates are statute and which are lunar estimates. |

## Three things worth not re-deciding

- **`confirmedOnly` is never sent.** The API defaults it off deliberately;
  Nigerian dates are frequently not gazetted until days before, and an
  unconfirmed row is the one somebody needs to plan around. A calendar that
  filters them shows only the dates nobody had to think about.

- **The confirmed/unconfirmed distinction does not depend on colour.** Filled
  disc against dashed outline, plus the name and status as `sr-only` text in
  every marked cell. The tint is a second cue, not the cue.

- **Deleting is a hard delete and the API checks nothing**, because no leave
  request, payslip or timesheet references a holiday by id — they all match on
  the date. So a date a leave request has already been costed against can be
  removed with no refusal and no cascade: the request keeps its stored day
  count, an approved run keeps its own figures, and everything that recomputes
  live (timesheet, overtime rates, payroll's unpaid days, the help desk's SLA
  clock) quietly treats the day as ordinary. `HOLIDAY_DELETE_EFFECTS` in
  `lib/api/leave.ts` is that paragraph, written once so the confirm dialog and
  the calendar cannot drift. **Do not replace it with "are you sure?"** — and do
  not make the UI refuse the delete either, since the API allows it and
  pretending otherwise teaches the wrong model.

## The asymmetry that surprises people

`UNCONFIRMED_HOLIDAY_EFFECT`, also in `lib/api/leave.ts`: payroll proration and
the overtime calculation read **every** holiday row and never look at
`confirmed`, while attendance's day status and the help desk's working-hours SLA
filter to `confirmed: true`. An expected date therefore already costs money
before it is announced and still shows as a working day on the timesheet. Both
screens say so beside the `awaitingProclamation` count, which is the only reason
that count is worth surfacing.

## One honest gap, demo mode only

`lib/workflows/attendance.ts#isHoliday` reads the `PUBLIC_HOLIDAYS` seed array
directly, not the demo store. An untouched demo calendar agrees with the demo
timesheet exactly — same source — and stops agreeing the moment somebody adds or
removes a date in `/settings/leave`. The settings panel says this in a callout
rather than leaving it to be discovered. Connected there is no gap: every reader
is the one table. Threading a holiday set through `workflows/attendance.ts` is
the real fix if anybody wants it.

## Verified

`npm run check` and `npm run build` green. In the browser, in demo mode: add
(sorted into place, persisted), edit (date moved, weekday recomputed), mark
confirmed, delete (the four-point dialog), the duplicate refusal shown verbatim,
year switching to an empty year, and the propagation — confirming Eid al-Fitr in
settings flipped the March cell on `/people/leave` from dashed to filled and
moved both the callout and the legend from 3 to 2. **Connected mode was not
exercised**: no API was running on this machine. The wire shapes were checked
against `approvehr-api/tests/holidays.test.ts` rather than against a live server.

---

# Adding an employee is a wizard now

`/people/new` was one page of thirty-odd fields with a "Save and add another"
button that navigated away and left a toast behind. It is now four steps plus a
success state, with the statutory fields as opt-in groups and a company setting
that removes them altogether. Four separate requests landed in one change
because they were all the same file.

## What the API actually requires — this had never been tested

There was **no `tests/employees.test.ts` at all**, which is how the following
survived: the wizard's whole premise is "two steps get somebody paid", and one
part of it was false. `taxState` was required by `createEmployeeSchema`, so
offering to skip tax setup would have handed somebody a 422 for taking the offer.

`taxState` is now optional and `employees/service.ts#create` falls back to the
organisation's own PAYE state — which is what `Organization.taxState` is
documented as being for, and exactly what `modules/imports` already did with a
spreadsheet that has no `tax_state` column. It refuses only when neither exists,
and the message names both places a state can come from. The two create paths
now default the same way on purpose; if you change one, change the other.

Pension PIN, TIN, NHF and bank account were already optional. `tests/employees.test.ts`
pins all of it, 13 assertions, including the org in **Kano** rather than Lagos so
an inherited state cannot pass by matching a hardcoded default.

`organizationTaxState` reaches the organisation through `db.user` rather than
`unscopedDb` or a threaded `organizationId`. `User` is scoped, every
authenticated caller has one, and every user in the tenant reaches the same
organisation — so the extension guarantees the answer. See the comment there
before "simplifying" it to `unscopedDb.organization`.

## The rent declaration finally has a field — two of them

Third attempt at this slice. `Employee.annualRent` + `rentDeclaredAt`, the
engine's `RENT_RELIEF` regime and the run's `rent_relief_unclaimed` warning had
all existed for a while with **nowhere in the UI to enter the figure**. A warning
about a problem nobody can fix is worse than no warning.

- `annualRentKobo` is on the employee create and update schemas, and on the
  serializer. Integer kobo, converted through `toNaira`/`toKobo`, never a float
  multiply.
- **Three states, not two.** `null` is undeclared and earns no relief; `0` is a
  declaration that happens to earn nothing; a figure earns 20% capped at
  ₦500,000. A figure — including zero — stamps `rentDeclaredAt`; `null` clears
  both, because "declared, amount unknown" would earn a relief nobody claimed.
  A PATCH that does not mention rent does not re-date an old declaration.
- On the frontend it is the **one money field on `Employee` already in kobo**
  (`annualRentKobo`), deliberately, because `grossMonthly` being in naira is a
  legacy this type is waiting to shed. Do not add a second naira money field.
- The wizard's tax group has it, and so does `/people/[id]` → Pay & statutory,
  through a new `type: "money"` on `EditableSection` — which exists precisely
  because `type: "number"` there would have written naira into a kobo column and
  under-declared somebody's rent by a factor of a hundred.
- The live preview passes it to `POST /payroll/quote` as
  `variation.annualRentKobo`, so the panel answers the question the field raises:
  declaring ₦1.8m of rent is worth ₦360,000 of relief.

## Three new feature flags, and why they are not wizard questions

`OrgFeatures.taxSetup`, `pensionSetup`, `bankDetails`. Migration
`20260821160000_employee_field_group_flags`. They hide **fields on a form**
rather than screens, which is the one thing that makes them different from the
seven above them:

- **All three default `true`**, in the schema, the migration and `BASE_FLAGS`.
  Every company that existed before the columns did was shown those fields, and
  a flag arriving switched off would have silently stopped asking for somebody's
  pension PIN. A new company turns them off in Settings in one click.
- **No sixth wizard question.** `TOTAL_STEPS` is still 5. Asking a shop owner
  about RSA PINs before they have added anybody is the opposite of what those
  five questions are for — and the groups are collapsed and opt-in anyway, so
  the minute-long add works with the flags on.
- **The headcount rule does not touch them.** PAYE and pension are statutory for
  four people exactly as much as for four hundred, so headcount is not an
  argument for hiding the fields.
- `FEATURE_KEYS` in `lib/api/setup.ts` is now `MODULE_FEATURE_KEYS` +
  `RECORD_FIELD_KEYS`. `/setup`'s summary lists modules only; `/settings/features`
  shows both, in two cards. If you add a flag, put it in the right list — the
  wizard's "you turned these on" panel is the thing that breaks otherwise.
- Turning one off still blocks payroll for the same reasons. The readiness panel
  says "Not asked for here — switched off in Settings" beside each item rather
  than quietly dropping it, because a checklist that omits the reason looks like
  the product changed its mind about needing a TIN.

## Drafts are local, and the UI says so in those words

`lib/store/employee-draft.ts`, on `createPersistedState`. A server-side draft
would need a model, a migration, a router, a tenant-isolation test and a decision
about who may read somebody else's half-typed salary, for a thing whose value is
four minutes of typing. **The cost is one sentence and it is on screen wherever
the draft is mentioned:** this draft does not follow you to another device and
clearing site data removes it. A draft that silently vanishes when somebody opens
their laptop instead of their desktop is worse than no draft, because they would
have trusted it.

Explicit save only, never on keystroke — a draft that saves itself is one nobody
can choose not to keep. Resuming is a banner with two buttons and never
automatic, which also keeps it out of an effect. A successful create discards it:
a draft that has become a record is not a draft.

## Small things in the wizard worth not undoing

- **Content is chosen by step id, never index.** The flags arrive
  asynchronously, so the step list can shrink under somebody mid-form; by id
  that moves them to a real step, by index it moves them to whatever sits at 2.
- **A real `<form>`, so Enter submits the step.** Every control that is not the
  primary action therefore carries `type="button"` — `Button` sets no default
  type and an HTML button in a form defaults to submit. Adding a button here
  without it will make Enter do the wrong thing.
- **A closed group is `hidden`, not unmounted**, so closing it does not throw
  away what was typed. `Accordion` from the design system was wrong for this: it
  is single-open, and somebody may have a bank account and a pension PIN to hand
  at once.
- **`focusField` queries a `data-employee-field` attribute.** The old form passed
  `id="firstName"` to `Input` inside a `Field` — which generates the id and wires
  `<label for>` to it, so all six of those labels pointed at nothing. Do not put
  an `id` on a control inside a `Field`.
- The success step clears the form and the aside disappears with it. "3 still
  needed" beside a blank page reads as a complaint about the person just created.
  What is outstanding for the real record is in the modal, with a link to fix it.

## Verified

`npm run check` green (the one remaining lint warning is in `shell.tsx`, another
agent's in-flight edit, not this change). `npx vitest run tests/employees.test.ts
tests/setup.test.ts tests/imports.test.ts tests/payroll-quote.test.ts` — 59
passing.

In the browser, demo mode: required-field refusal with the message on the field,
both essential steps, the three groups opening and closing independently with the
consequence sentence swapping for the purpose, the review step reading
"Nothing declared — no personal relief", the success modal naming the person,
"Add another" returning to a blank step 1 of 5, Save draft → reload → the resume
banner → "Carry on with it" restoring the value, and all three flags off
collapsing the wizard to **4** steps with the readiness panel explaining why each
item is not being asked for.

**Not exercised:** connected mode (no API was running on this machine — the wire
shapes are checked by `tests/employees.test.ts` instead), and the rent field's
*edit* interaction on `/people/[id]`, where the preview pane's scrolling gave up.
Its arithmetic is asserted separately: the kobo round-trip through
`koboFromDecimal`/`naira` is exact for whole and fractional naira and for zero.

---

# Teams, and who appraises whom

Two things, one change, because the second could not be built honestly without
the first: a **Team** that is not a department, and an explicit **appraiser
mapping** per cycle so a person can be marked by more than one manager.

## The word "team" meant two things, and now it means one

`/people/departments` used to label a nested department "Team", on the argument
that "a team is a department with a parent". That argument is still right about
*structure* — Division → Department → Sub-department is a shape a group company
needs and it is still one table — and it was wrong about the word. A department
is one column on the employee (`departmentId`), so a person is in exactly one
node of it and every payroll report and every past payslip depends on that. What
that shape cannot express is somebody being in Engineering **and** on the
Platform team, which is the shape every company with more than one project
actually has.

So: nested departments are **sub-departments** now, everywhere in that screen,
and `Team` is its own model with its own membership list. Two things called a
team, one of which moves your cost centre and one of which does not, is the kind
of ambiguity somebody eventually gets paid wrong over.

The "With teams" column on each row is now "Rolled up", for the same reason.

### The one rule, enforced in one function

**A team that belongs to a department implies its members are in that
department.** `alignMemberDepartments` in `modules/teams/service.ts` is the only
place that is true, and every write that could break it calls it: adding members,
and moving the team between departments.

It is enforced by **moving people**, not by refusing them, and it reports exactly
who it moved. Refusing would make the ordinary act — "put Ada on Backend" — fail
with a lecture about cost centres. The move is never silent: every such write
returns `moved` as a **list of names**, `lib/api/teams.ts` types it, and the
screen renders the names in the toast. `membershipEffect` in that file is the
sentence shown *before* the write, so the dialog and the toast cannot describe
the same act differently.

The inverse is deliberately **not** enforced: leaving a team does not leave a
department. Their department stands on its own and guessing where to put them
instead would be worse.

A team with `departmentId: null` is cross-functional and implies nothing.

`departmentMismatch` on a member is surfaced, never repaired. It should be false
everywhere the rule has run; a true one is a row from before the rule or a
department changed on the person's own record afterwards. Quietly re-aligning it
would be moving a cost centre without being asked.

### Teams have no demo mode, on purpose — REVERSED, see the last section

`lib/store/teams.ts` refuses every write offline, in the same words
`store/departments.ts` uses, and the reason is that one rule: on a departmental
team, adding somebody moves their `departmentId`, and a cost centre built in
browser storage would never reach a payroll run. `shifts.ts` argues the opposite
for the rota and is right, because nothing else reads the rota. The honest
consequence, stated on screen: **the teams surface can only be demonstrated
against a running API.**

**That is no longer true and the paragraph above is kept as history.** Both
stores now have a full local implementation. The reasoning was sound and the
conclusion was not, for one reason: it applies to every demo write in the
product. See "Departments and teams work in demo mode" at the end of this file.

## Multi-appraiser: a table, not a second manager column

The request is always "Ada reports to Chidi but Ngozi actually judges her
engineering". The cheap answer is `secondManagerId` on `Employee`, and it fails
three ways at once: it cannot say in what capacity, it cannot differ between this
half and last half, and it cannot say how much each opinion counts — which is the
one thing anybody asks when they dispute a mark.

`AppraiserAssignment` is one row per (cycle, subject, appraiser) with an
`AppraiserRole` (line manager / functional / project lead / skip-level) and
`weightBp`.

- **Per cycle**, because who was best placed to judge somebody last half is not
  who is best placed this half, and a mark has to keep explaining itself years
  later against the mapping that produced it.
- **Basis points, not percentages.** Three appraisers at "33.3%" that sum to 99.9
  is a rounding argument nobody can win. `evenWeights(3)` is 3334/3333/3333 and
  sums to exactly 10000. This is the same reasoning as money being kobo, and
  `evenWeights` exists so nobody has to do the arithmetic by hand.

### The weight rule is real because of the shape of the endpoint

`PUT /performance/cycles/:id/appraisers/:employeeId` takes the **whole set** and
refuses it unless the weights sum to exactly 10000. That is the only shape in
which the rule is checkable: an endpoint that added one appraiser at a time would
leave the first of three at 34%, so the check would end up in a form somewhere
and be a suggestion. `weightProblem` in `lib/api/performance.ts` shows the same
refusal in the same words while somebody is still editing, **as well as** the
server check, never instead of it.

Four more refusals, each of which would otherwise live in a form: a published
cycle is closed to re-weighting; nobody appraises themselves; at most one line
manager; and **an appraiser who has already sent their review cannot be
removed** — their answers exist, and dropping the row that gives them weight
would leave a submitted mark counting for nothing with no record of why. Change
their weight instead.

### The default is the simple one and nobody configures it

`activateCycle` calls `autoAssignFromReportingLine` **before** it creates
anything, so a company that has never opened the mapping screen gets exactly what
it had before: one line manager each, at 100%. The mapping is therefore always
the source of truth once a cycle is running, and every downstream reader has one
answer instead of "the assignment if there is one, else `managerId`". Manager
forms come from the mapping and never from `managerId` — reading both would let
the two disagree about who owes a form.

`multiAppraiser` on `OrgFeatures` gates the *interface*, not the data. Off — the
default, and the wizard never asks — a person has one manager who appraises them
and the word "matrix" appears nowhere. The dependency is asymmetric and lives in
`applyAppraisalDependency` in `modules/setup/service.ts`: turning it on while
appraisals are off is **refused** and names the fix, while turning appraisals off
takes it off quietly, because a flag whose parent is off is not a decision
anybody made. Nothing is deleted either way.

### Nobody appraising somebody is an exception, in the payroll run's shape

An employee with no appraiser in an open cycle is the performance module's
missing bank account: every screen looks finished and one person silently
finishes the period with no mark. So `appraiserMap` returns
`BLOCKER`/`WARNING` exceptions with the same severities and the same
name-the-person discipline the payroll run uses, and the screen renders them
**above** the table. A blocker buried in row 40 is a blocker nobody read.

`NO_APPRAISER` is a WARNING in a draft and a BLOCKER once the cycle is running —
colouring the whole company red before anybody has started teaches people to
ignore the colour.

This also has to work with the flag **off**, and it does: `activateCycle` returns
`withoutAppraiser` by name, and `appraisals.tsx` renders it as a dismissible
callout rather than only a toast, because somebody has to act on it and a toast
is gone in six seconds. `startCycle` is kept out of the shared `run` helper for
exactly that reason — `run` throws its result away, which is right for the other
five mutations and would here discard the only warning anybody gets.

### The weighted mark divides by submitted weight, not by 10000

Dividing by the whole weight while half the appraisers have not answered halves
everybody's mark mid-cycle and reads as a company-wide collapse in performance.
`weightedRating` is over `submittedWeightBp`, which is returned beside it so a
reader can see how much of the mark it is, and it is **null** rather than 0 when
nothing is in.

Same discipline on the review form: `ApiReviewDetail.appraiser` is **absent**
when there is no assignment — a manager review written before the mapping existed
has no answer to "what are you to this person", and rendering "line manager, 0%"
would be a claim rather than a blank. The strip checks for the key, never a
value. When there is more than one appraiser it says so, because a 2 written as
the whole judgement and a 2 written as one of three opinions are different acts.

### Reading rights follow the mapping

A functional manager does not appear in the reporting line, so `mayReadReview`
and `listReviews` now also admit an **assigned appraiser** — scoped to
`(cycleId, subjectId)` pairs rather than a flat subject list, because appraising
Ada at mid-year is not permission to read her end-of-year form. Marking somebody
without being allowed to read their self-review is worse than not being asked.

## Tenancy: two models with no organizationId, and both are pinned

`Team` is scoped and is in `SCOPED_MODELS`. **`TeamMember` and
`AppraiserAssignment` are not, and cannot be** — no column. `TeamMember` is a
join between two already-scoped tables and the churniest table in its section;
`AppraiserAssignment` hangs off `ReviewCycle` exactly like `Review`.

So each has exactly one door, and `tests/tenant-isolation.test.ts` asserts
**both halves**: that a bare `db.teamMember.findMany` / `db.appraiserAssignment
.findFirst` genuinely reads across tenants, and that starting the read at the
scoped parent closes it. A test that only asserted the door would pass just as
well if the extension had silently started scoping them, and then nobody would
notice the day it stopped.

`requireTeam` is the door for teams. `assignmentsInCycle` is the door for
assignments. Do not query either model by a bare id.

## Selection, not drag

The brief asked for "drag-or-select" assignment. `assign-people-dialog.tsx` is
select, and the choice is not laziness: assigning staff is a **bulk** act, and
nine drags is nine chances to drop somebody in the wrong unit with no record of
it. Select-many-then-confirm also gets keyboard and screen-reader support free
from a native checkbox. People already in the unit are shown, ticked and
disabled, not filtered out — "who is already in Sales" is most of what somebody
needs while choosing.

## Verified

Backend, `npx vitest run` on the touched files: `teams.test.ts` +
`appraiser-mapping.test.ts` + `tenant-isolation.test.ts` = **58 passing**;
`performance.test.ts` + `setup.test.ts` = **70 passing**. Three cases were added
to `setup.test.ts` for the appraisal dependency, which had none.

Frontend: `npm run check` green (typecheck, lint, contrast, payroll, CSV, loans),
`npm run build` green at 77 routes.

In the browser, **connected** against the live API on port 8000, signed in as the
seeded administrator: the Structure/Teams tabs, "Sub-departments" and "Rolled up"
replacing the two old team labels, the teams list with the cross-functional
badge, the team drawer, the add-people dialog showing `membershipEffect`
verbatim, and — on the mapping tab — the stats, seven named blockers, the
33.34/33.33/33.33 chips, the live weight refusal ("These add up to 90%. Add
10%."), the disabled Save behind it, and a real `PUT` that moved "Nobody
appraising" from 7 to 6. Over the wire with `curl`: the flag dependency refusal,
the department move naming Grace Effiong and not naming the person already there,
and `getReview` returning `appraiser: { FUNCTIONAL_MANAGER, 33.33%, of 3 }`.

**Not exercised:** the review form's appraiser strip rendered in a browser. The
appraisals screen could not load its list — see below — so the strip was verified
from the endpoint payload it reads plus `tests/appraiser-mapping.test.ts`'s
"tells the appraiser what they are on the form, and for how much".

### One thing found and not fixed

`GET /performance/reviews/mine` intermittently 500s from the running dev API with
`PrismaClientKnownRequestError: Server has closed the connection.`, at a
different Prisma call site each time (`cyclesInOrg`, then `myReviews`) — neither
of which this change touched. Serial `curl` to the same endpoint with the same
token returns 200 every time; three concurrent curls returned `500 200 500` once
and `200 200 200` later. `/employees`, `/leave/requests`,
`/performance/cycles` and `/performance/competencies` all survived the same
3-way concurrency test.

This is the class of flakiness this file already records under "The suite is
flaky", and that entry says it is worth chasing rather than retrying past,
because one instance of it turned out to be a genuine cross-tenant bug. It is
left alone here because it is not this change's, and because the port-8000
process was started outside the session that found it.

---

# The import can be finished now

The bulk import had the hard half already: a column matcher that reads anybody's
headings, a two-step validate/apply with a fingerprint, per-row errors, and a
partial-success report that names its shortfall. What it did not have was a way
to *finish* — every problem was reported and nothing could be resolved without
leaving the screen. This section is what closed that, and four of the decisions
are ones a reasonable person would make differently, so they say why.

## `employee_no` is no longer required, and that was a real disagreement

The importer refused every row without a staff number. `/people/new` generates
one when nobody supplies it. Both were defensible alone and together they were
the product disagreeing with itself about the same person: a twelve-person shop
whose spreadsheet has no staff numbers could add all twelve through the form and
none of them through the importer.

So the required set is now **exactly the five the single-employee form refuses
without** — first name, last name, job title, start date, monthly gross — plus a
PAYE state that may come from the company rather than the row.
`tests/imports.test.ts` asserts the list and says in a comment that a column
added here has to be added to `createEmployeeSchema` in the same change. If you
find yourself adding a sixth, that is the check.

What a missing staff number costs is said rather than hidden: it is the key a
re-import matches on, so the API generates `AHR-0001` and up (the same rule as
`nextEmployeeNo`), reports `employeeNoGenerated` per row, and raises a note
saying that importing the same file twice would add those people twice unless it
carries their email or their date of birth.

## Three kinds of unfinished business, because they end differently

This is the shape of the whole feature and it is worth not collapsing:

| | What it is | What happens |
|---|---|---|
| **Problem** | a cell that cannot be read, or a required one that is empty | the row does not import; fixable in place |
| **Duplicate** | this row looks like somebody already on file | the row waits for a human answer |
| **Missing detail** | a recommended field nobody filled in | the row imports; the person is named on a list |

The third one is the user's own words — *it shows under important that this
user's detail is missing* — and the reason it does not block is that refusing the
record does not produce the bank account. It is acknowledged with a real
checkbox, and the acknowledgement **resets on every re-check**, because a new
check produces a new list and a tick against the old one describes nothing on
screen.

`recommended` on a `ColumnSpec` carries the `OrgFeatures` flag that decides
whether the company is asked for that field at all, so a company that turned
pension setup off is not nagged for RSA PINs by the importer while the form
beside it has stopped asking. Offline every group is flagged and the screen says
the list is longer than the live one would be.

## Duplicates: reported, never decided

By work email, and by name **plus** date of birth — both, because a name alone
matches cousins and a date of birth alone matches strangers. A staff-number match
is not one of these: that match *is* the update key and there is nothing to
decide.

The API refuses to choose. An undecided duplicate is an error on the row, so it
does not import and says why; `decisions: [{ row, action }]` answers it, and the
decisions are **folded into the fingerprint** — a batch checked with "skip Ada"
and applied with "update Ada" is two different imports wearing one confirmation,
and it is refused with the same 409 a tampered row gets. An update keeps the
staff number already on the record, which is stated as a warning before it
happens rather than discovered afterwards.

In-file repeats of an email, or of a name and date of birth, are errors naming
the earlier row. Two people on file with one name and one birthday is refused
with "add a staff number to this row" rather than guessed at.

## The template is generated, in both formats, and there is no xlsx dependency

`lib/imports/template-file.ts` builds the CSV and the workbook from **the same
column dictionary the importer validates against** — the API's copy when it
answers, the compiled-in one when it does not. There are no column names in that
file at all. `scripts/verify-template.ts` (in `npm run check`, 26 assertions)
proves the loop rather than an expected list: build the file, read it back the
way the upload does, and assert the values land on the fields the dictionary
names. Add a column and it is covered without editing the script.

Required headings are marked `first_name *`. That is safe rather than cute —
heading matching normalises punctuation away on both sides — and it is asserted
for all five rather than assumed.

**`lib/xlsx.ts` is a hand-written reader and writer**, same reasoning as
`lib/csv.ts` beside it: the job is a ZIP container and two XML parts, and this
file records five CI failures from invented dependency ranges. The writer stores
entries uncompressed (method 0, legal and universally read) so it needs no
compressor and produces byte-identical output every time. Verified against
**openpyxl**, an independent implementation, which reads the sheet names, the
frozen header, the bold row, the text number format and every value including a
leading zero.

Three things in the reader that were got wrong first, all commented at the top of
it: cells are **sparse** (a missing C4 shifts every later column if you read
positionally — in a payroll import that puts an account number in a TIN); dates
are **numbers** with only the cell's number format to say so; and numeric cells
have already lost a leading zero before we see them, which is why the template
formats every column as text.

Offering an .xlsx template and then refusing .xlsx uploads would have been a trap
of our own making, so the upload reads both. It picks the first sheet with rows
in it — a cover-note tab is common, and so is our own guide tab — and says which
one it read.

## Parts carry row numbers now, not a span

`CheckedPart.rowNumbers` replaced `from`/`to`. The rows a part carries are not
always contiguous: after a partial import, "try those 3 again" sends rows 12, 47
and 300 in one request, and every number the report prints has to stay the number
Excel shows. `translate` maps the API's per-part numbering back through that
list, and `decisionsFor` renumbers the decisions the same way — getting either
wrong would apply one person's answer to somebody else, which is why both are
named functions with the arithmetic in one place.

## Small things worth not undoing

- **A fix typed after a check refuses to apply.** `CheckOutcome.fixCount` is a
  snapshot; the screen compares it with the live count and makes the re-check the
  primary action. Without that, confirming after a correction imports the
  unmended row while the screen shows it as mended.
- **`apply`'s `skippedRows` is every row that did not land**, not only the ones
  with errors. A duplicate somebody chose to skip is also a person who is not in
  the directory.
- **The confirm button names what it will not do**: "Add 47 people, leave 3 out".
- **The rows-to-fix download excludes duplicates you chose to skip.** Those rows
  are not broken, and sending somebody to Excel to look for a problem that is
  actually their own decision is worse than not offering the file.

## Verified

Backend: `npx vitest run tests/imports.test.ts` — 28 passing, including the
generated staff number, all four duplicate paths, the decision fingerprint
refusal, the feature-flag effect on the flagged list, the rent declaration's
three states, and a case proving a matching email in **another organisation** is
invisible. `tests/employees.test.ts tests/setup.test.ts
tests/tenant-isolation.test.ts` — 49 passing, unchanged.

Frontend: `npm run check` green (typecheck, lint, titles, contrast, payroll, CSV
101 assertions, template 26 assertions, loans).

In the browser, **demo mode**: an .xlsx with a cover-note tab uploading and
landing on the right sheet, a real date cell read as its date, 13 of 14 columns
matched with `Religion` left out, five row problems each naming their own column
(`Surname`, `Date of Employment`, `Email Address`, `Monthly Salary`, `State`),
the in-file duplicate email caught on row 4 naming row 1, a row with no staff
number *not* refused for it, the "Important: 2 people are missing a detail"
list with its per-person reasons, the acknowledgement flipping the button from
"Tick the box above to carry on" to "Continue", a correction typed in place
flipping it to "Check the correction" and then clearing that row's error on the
re-check, the same file as CSV behaving identically, and step four's honest
demo-mode refusal. Both template downloads run without error.

**Not exercised in a browser:** the duplicates card, the result screen and the
"try those again" loop. All three need the directory, and signing in needs a
password this session could not enter — they are covered by the backend tests
above instead. Somebody with credentials should walk them once.

---

# The importer and the ETL now disagree on purpose

The change above — `employee_no` no longer required, a number generated instead —
was right for the surface it was written for and **silently wrong one layer
down**, because `scripts/etl/migrate.ts` reuses the importer's own `checkRows`
rather than writing a second validator. That reuse is the right design and is
why it broke: a rule relaxed for spreadsheet uploads was relaxed for the legacy
migration at the same instant, and nothing in either module said they were
different callers.

Four assertions in `tests/etl.test.ts` caught it. They were the only thing that
did, and it is worth being precise about what they caught, because "8 imported
where 7 was expected" reads like a stale expectation somebody should update:

- **The migration is re-runnable, and `(organizationId, employeeNo)` is its
  idempotency key** — the table at the top of `migrate.ts` says so. A generated
  `AHR-0001` exists in no legacy database, so a second run cannot match it.
- **`employeeNoByLegacy` only records numbers the legacy row actually carries.**
  So a generated number is never learned, and tiers 4 and up cannot resolve that
  person's payslips, leave or approvals. They land as a record with no history —
  a directory row that looks complete and quietly is not.

Only the fixture's DOB saved it from literal duplication: the row happens to
carry `01/01/1990`, so the second run caught it on the name-plus-date-of-birth
duplicate check. A legacy row with no staff number, no email **and** no date of
birth would have been added again on every run, and nothing would have said so.

## The fix, and why it is a parameter

`CheckOptions.requireEmployeeNo` in `src/modules/imports/service.ts`, threaded
through `checkRows`, `validateEmployees` and `applyEmployees` as a **function
argument, never a request field** — a client must not be able to choose how
strict its own import is. `ETL_CHECK` in `migrate.ts` is the one caller that
sets it.

Both behaviours are correct for their caller and neither is a default worth
having globally:

| | Spreadsheet upload | Legacy ETL |
|---|---|---|
| How often | once, by hand | repeatedly, by script |
| No staff number | generate `AHR-0001`, say what it costs | **refuse the row**, name the column |
| Why | refusing a shop owner whose file has no such column is the product disagreeing with itself | the number *is* the key; generating one breaks idempotency and strands history |

The refusal names the consequence rather than the rule, so somebody reads it and
goes and puts a number in the legacy database.

**Standing rule this leaves behind:** `src/modules/imports/` has two callers with
different contracts. Relaxing a validation rule there is not a local change —
run `tests/etl.test.ts` as well as `tests/imports.test.ts`, and if only the ETL
ones move, ask which caller the rule was really for before editing the
expectation.

## The suite's flakiness is a dev server, and it is measurable now

The entry above says six or seven tests fail intermittently and guesses that
`tests/setup.ts` sharing a database with development is the cause. That guess is
right, and it is worth writing down how it was separated from a real bug, because
this batch contained one of each:

- **With two `tsx watch src/server.ts` dev servers running** against the same
  `DATABASE_URL`: 4 failures, all in `tests/etl.test.ts`, all reproducible alone
  with the dev servers stopped. **Genuine bug** — the one above.
- **With no dev server:** 997/997, then 996/997 where the single failure was
  `tests/webhooks.test.ts` timing out at 5000ms on a file this batch never
  touched, passing 3/3 alone.

So the test that distinguishes them is cheap and should be the first move every
time: **stop every dev server, re-run the file alone.** An assertion that fails
on exact values is a bug; a 5s timeout on an untouched file is the shared
database. `pgrep -f "src/server.ts"` before running the suite is worth the two
seconds.

---

# The backend suite has its own database, and takes one run at a time

The entry above got the diagnosis right and stopped one step short of the fix.
It ends with "`pgrep -f "src/server.ts"` before running the suite is worth the
two seconds" — which is true, and is a habit rather than a guarantee. This is the
guarantee.

## The diagnosis, stated once

`approvehr-api/tests/setup.ts` deliberately shared the **development** database,
and `vitest.config.ts` leaned on `fileParallelism: false` for safety. That
combination reads like isolation and is not:

- `fileParallelism: false` serialises test files **within one process**. That is
  the whole of what it does. Two concurrent `vitest run` invocations, a `tsx
  watch src/server.ts`, Prisma Studio, or a seed all write to the same tables
  with nothing between them.
- The comment in `vitest.config.ts` said "Integration tests share one database,
  so they must not race each other", and the one in `tests/setup.ts` called the
  shared database "a deliberate trade for a small team". **Both sentences were
  read as isolation for months**, which is why nobody went looking for the real
  cause. Two stray `tsx watch src/server.ts` processes turned out to be it.

That is the expensive part of this story. The failures were real, the arithmetic
in them was real, and one of them was a genuine cross-tenant bug (the unscoped
count in the insights module) hiding inside noise everybody had learned to
re-run past.

## Two mechanisms, because neither closes both halves

| | Closes | Cannot close |
|---|---|---|
| A dedicated database (`TEST_DATABASE_URL`) | everything that is not a test writing to the tests' tables | two test runs, which would both use it |
| A Postgres session advisory lock | two test runs interleaving | a dev server, which does not take one |

Both are in now.

- **`approvehr-api/tests/setup.ts`** runs per *file*. It loads `.env` and copies
  `TEST_DATABASE_URL` over `DATABASE_URL` at the process boundary. One
  assignment, so every reader agrees: `src/config/env.ts`, the `pg` pool built
  from it, and `tests/etl.test.ts`, which reads `process.env["DATABASE_URL"]`
  directly to build its synthetic legacy schema **in the same database it
  migrates into**. Resolve the URL anywhere but there and that one file would
  quietly build fixtures in the development database while the rest of the suite
  ran elsewhere.
- **`approvehr-api/tests/global-setup.ts`** is new and runs once per `vitest
  run`, in vitest's own process. It takes `pg_try_advisory_lock(0x41485221, 1)`
  on a dedicated `pg` session and holds it for the run. A second run **queues**,
  says on the console that it is queueing and how long it has waited, and gives
  up after ten minutes with the pid holding the lock.
- **`src/config/env.ts`** declares `TEST_DATABASE_URL` and asserts the copy
  happened: `NODE_ENV=test` with `TEST_DATABASE_URL` set and `DATABASE_URL` still
  pointing elsewhere throws. The one silent failure this design has is an import
  order that beats `setupFiles`, and that assertion is what turns it into a
  refusal instead of a run writing to the wrong database while every message on
  screen says otherwise.
- **`prisma.config.ts`** honours `PRISMA_DB=test`, which only `npm run
  db:test:deploy` and `npm run db:test:reset` set, and **refuses** when
  `TEST_DATABASE_URL` is unset instead of falling back. Without that refusal,
  `db:test:reset` on a machine that had not been set up would drop every table in
  the database somebody develops in.
- **`.github/workflows/ci.yml`** creates `approvehr_ci_test` and migrates *that*,
  leaving `DATABASE_URL` unmigrated. So CI exercises the dedicated-database path
  on every run. If CI had left `TEST_DATABASE_URL` unset, the only path ever
  proved would be the fallback — the arrangement this whole entry is about.

### Why an advisory lock and not a lock file

It lives in the database the runs contend over and is held exactly as long as
the session holding it. Ctrl-C, a crash, a closed laptop: the connection drops
and Postgres releases the lock with it. There is no stale lock file to explain to
somebody at nine in the morning, and no cleanup that has to run on the unhappy
exit.

It polls `pg_try_advisory_lock` rather than blocking on `pg_advisory_lock`,
deliberately. A blocking wait is indistinguishable from a hang, and misreading a
hang is the entire history of this suite.

### The lock does nothing on `prisma dev`, and every run proves it

`prisma dev` — the local database this repo reaches for first — is Postgres
compiled to wasm behind a proxy that hands **every client connection the same
backend session**. Two connections to it both report `pg_backend_pid() = 42`.
Advisory locks are re-entrant within a session, so a second run takes the lock
this run is holding and walks straight through.

Found by holding the lock in one process for thirty seconds and watching a
`vitest run` sail past it. That is the same shape of mistake as
`fileParallelism` — a mechanism that reads like isolation and is not — so it is
**measured on every run** rather than assumed. `assertLockIsEnforceable` opens a
second connection, tries to take the lock, and prints a warning naming the cause
if it succeeds. On a real Postgres the probe is excluded and the check says
nothing.

So on this machine as it stands: the dedicated-database half works, the queueing
half does not. Point `TEST_DATABASE_URL` at a real Postgres and both work. CI
already does.

### Three things found while verifying, so nobody spends the hour again

- **A second `prisma dev` server does not start.** `npx prisma dev --name
  approvehr-test --detach` writes a state file with `port`, `databasePort` and
  `shadowDatabasePort` all 8000, binds 8000, and never publishes a database
  port. Tried twice, with and without explicit `--db-port`. It also quietly
  occupies port 8000, which is the API's. Use Docker; the recipe is in
  `.env.example`.
- **A separate *schema* is not a substitute for a separate database.** With
  `TEST_DATABASE_URL=...?schema=approvehr_test`, `npm run db:test:deploy`
  applies every migration and 150 tests pass — and then four files fail with
  "The table `public.announcements` does not exist", because the generated
  client resolves at least one model against `public` whatever the connection's
  search path says. CI uses a separate database with `?schema=public`, and that
  is the shape to copy.
- **`npm run db:test:reset` needs a human.** Prisma 7 refuses `migrate reset`
  when it detects an agent driving it and asks for consent in the user's own
  words. That is correct behaviour and not something to route around — run it
  yourself.

## Setting it up, once

```bash
cd /Users/mac/Documents/Schulltech/approvehr-api
npx prisma dev --name approvehr-test --detach   # any Postgres will do
# paste the printed TCP url into .env as TEST_DATABASE_URL
npm run db:test:deploy                          # applies the migrations
npm test
```

Skip it and the suite still runs, against `DATABASE_URL`, behind a warning
banner that names the consequence. A suite that refuses to run on a machine
nobody has set up teaches people to skip the suite.

## How to read a failure — the rule that saves the most time

**A TIMEOUT is a flake. A failed ASSERTION is not.**

- A test that times out at 5000ms, especially in a file the change never
  touched, is contention: something else is holding rows or connections.
  `tests/webhooks.test.ts` is the standing example — it times out at 5000ms in a
  contended run and passes 3/3 alone.
- A test that fails on an exact value or an exact count is a defect, and this
  repo has already paid for treating one as noise. Chase it.

First move either way is unchanged and cheap: stop every dev server, re-run the
file alone.

```bash
pgrep -fl "src/server.ts"      # should print nothing
npx vitest run tests/webhooks.test.ts
```

## What this does not fix

- **Files inside a run still share one database.** `fileParallelism: false`
  stays on for that reason, and its comment now says exactly that and nothing
  more. Genuine per-file isolation would need a schema per file, which is a
  bigger change than the flakiness currently justifies.
- **Nothing stops a dev server pointed at `TEST_DATABASE_URL`.** Don't do that.
- The `GET /performance/reviews/mine` intermittent 500 recorded earlier is a
  connection-lifetime problem in a long-running dev API, not this. It should be
  looked at on its own.

## Verified

- `npx tsc --noEmit` clean. ESLint clean on every file this change touches.
  `npm run format:check` lists 16 files and none of them are from this change —
  they are other in-flight work, including a `.claude/worktrees/` copy. Four
  pre-existing lint errors in `src/modules/payments/service.ts` and
  `tests/employees.test.ts` are likewise not from here.
- **The fallback path**: with `TEST_DATABASE_URL` unset, the banner prints, the
  lock is taken and released, and the run completes.
- **The dedicated path**: `npm run db:test:deploy` created a virgin target and
  applied all 15 migrations to it; `employees`, `payroll-no-attendance`, `etl`,
  `webhooks` and `imports` came to 112 passing against it, `etl` alone 38.
- **The override reaches the workers, which is the whole point.** Both databases
  were watched at 150ms intervals during `tests/etl.test.ts`: its synthetic
  `legacy_etl_*` schema appeared in the **test** database and never in the
  development one. The development database entered and left the run with the
  same 17 organisations and no `legacy_etl_*` schemas. Observed, not reasoned
  about — that file reads `process.env["DATABASE_URL"]` directly and is the one
  the single override exists for.
- **`prisma.config.ts`**: `PRISMA_DB=test` with no `TEST_DATABASE_URL` refuses;
  with one, `prisma validate` loads and reports the test datasource.
- **`src/config/env.ts`**: `NODE_ENV=test` with a mismatched pair throws; a
  matching pair loads; no `TEST_DATABASE_URL` at all loads.
- Frontend `npm run check` green.

**Not verified, and honestly cannot be here:** the queueing itself, the
ten-minute give-up path and the holder lookup all need a Postgres that gives each
connection its own session. There is no real Postgres and no Docker on this
machine. CI exercises the dedicated-database path on every run; somebody with
Docker should watch two runs queue once.

---

# Everybody was paid ₦0, and the arithmetic reconciled at every step

This is the worst defect the codebase has carried, it is fixed, and it is the
reason for a rule that appears in half a dozen places in this file. Recorded here
because the rule is much easier to follow once you have read what it cost.

## What happened

`unpaidDaysFor` in `approvehr-api/src/modules/payroll/assemble.ts` adds an unpaid
day whenever no `AttendanceEntry` covers a working day. Nothing asked whether the
company records attendance **at all** — `OrgFeatures` has flags for shifts,
loans, expenses, appraisals, departments, hiring and grades, and had none for
attendance, so the deduction was unconditional.

So for any company that had not adopted clock-in — the default state, and the
likely state of most of the small businesses this product is aimed at — every
working day in the period counted as unpaid. `engine.ts` computes
`paidDays = workingDays - unpaidDays`, which came to zero, and prorated the
contract to nothing. Measured on the fixture: 21 unpaid days out of 21 working
days for August 2026.

**Every employee of every company not using clock-in was paid ₦0.**

## Why nothing caught it

Because every figure was internally consistent. Gross prorated to zero, PAYE on
zero was zero, pension on zero was zero, net was zero, and the run's totals
matched the sum of the payslips exactly. `reconcile.ts` — the gate written
precisely to refuse impossible arithmetic — had nothing to object to. Zero is a
number, and a wrong number that reconciles is invisible to every check that only
asks whether the sums agree.

## The fix

`organizationUsesAttendance(db, periodStart, periodEnd)` asks the **organisation
-level** question once per run, threaded through `assembleFor` from `prepare` so
a 200-person run asks once rather than 200 times. `unpaidDaysFor` returns 0 when
attendance is not in use, and works the answer out itself when the caller omits
the flag.

The narrow case the guard deliberately leaves alone: a company that *does* clock
in, where one person has nothing against their name. A director exempt from
clocking and somebody who never came in are indistinguishable there, so `prepare`
raises a WARNING (`no_attendance_all_period`) naming the person instead of
guessing.

`tests/payroll-no-attendance.test.ts` is six assertions shaped as claim, cause
and boundary — including one that **bypasses the guard and reproduces the bug**,
so the first assertion cannot silently stop proving anything.

## The rule this is the reason for

> **Permission-gated and feature-gated data arrives ABSENT, not zeroed. Check
> presence, never falsiness.**

"No attendance rows" and "attendance rows showing nobody came in" are opposite
facts. Reading the first as the second moved money. Every instance of the rule
elsewhere in this file — the frontend's `weightedRating` being `null` rather than 0
while appraisers have not answered, `ApiReviewDetail.appraiser` being **absent**
rather than "line manager, 0%", `Employee.annualRent` distinguishing `null` from
`0` — is the same rule, applied where it costs nothing, by people who had seen
what it cost here.

Rendering 0 where nothing belongs is not a cosmetic slip. It is a wrong claim,
and on a payslip it is a wrong claim somebody is owed money over.

---

# Departments and teams work in demo mode

Two decisions recorded above are reversed here, deliberately, and this section is
the "why" the last one asked for.

## What was refused, and the argument for refusing it

`lib/store/departments.ts` refused every write with no API. `lib/store/teams.ts`
refused outright and `/people/departments` rendered "Read-only in demo mode" with
no buttons on one tab and "Teams need the API" where the list should be on the
other. The argument, in both files:

> A department is a payroll reporting boundary — a cost centre, a roll-up, the
> unit a head is responsible for. A tree built in browser storage would never
> reach a real payroll run, so building one teaches the wrong model.

Every clause of that is true.

## Why it was still the wrong conclusion

**It applies to every demo write there is.** A demo leave approval never moves a
real balance. A demo employee never appears on a real payslip. A demo rota never
prorates a real run. Employees, leave, attendance, shifts, holidays, overtime and
the rest all write locally, say so on screen, and are the product being
demonstrated. Departments was the outlier — and demo mode is the mode everybody
opens first, so the feature did not read as deliberately withheld. It read as
missing.

So the warning stays and the refusal goes. `DEMO_STRUCTURE_NOTE` in
`lib/store/demo-structure.ts` is the warning, written once and rendered above
both tabs, and it says the one thing that is actually true: local structure never
reaches a payroll run.

**Other store headers cite `store/departments.ts` as the precedent for refusing a
demo write** — `grades`, `assets`, `conduct`, `loans`, `reimbursements`,
`careers`, `documents`, `helpdesk`, `knowledge`, `offboarding`, `performance`,
`permissions`. Those citations are now stale in their *conclusion* and still
sound in their *reasoning*: each is a separate judgement about whether local data
would contradict something else the demo shows. **None of them was revisited.**

## Membership is `Employee.department`, not a second table

The one design decision worth not re-deciding. Connected, a person's department
is `Employee.departmentId` — one column, and every payroll report reads it.
Offline, `Employee` carries the department **name** and nothing else, and that
name is what the directory, the record page, the payslip header and `/reports`
all render.

So `lib/store/demo-structure.ts` holds only the *structure* — nodes, nesting,
heads, cost centres, teams, memberships — and **who is in a department is the
name on the person**. Headcount and payroll are derived from the live employee
store on every read, never stored. A second copy of "who is in Engineering" is a
second answer, and the demo would then disagree with its own directory about a
cost centre. That is the `runPeopleFrom` lesson from earlier in this file, one
module along.

Two consequences that follow and are commented where they happen:

- **Renaming a department rewrites the name on everybody in it.** It has to: in
  this mode the name is the pointer. Connected a rename moves nobody, because the
  id does not change. Not rewriting would empty the department and show the
  rename as a mass unassign.
- **Duplicate names are refused case-insensitively.** The API compares exactly
  (Postgres default collation); here the name is the identity, so "engineering"
  and "Engineering" would split one department into two.

## The one rule still holds, and demo enforces it the same way

A team that belongs to a department implies its members are in that department,
enforced by **moving people** rather than refusing them, and reported as a list
of names. `pendingAlignment` is the pure half — it computes who would move — and
the writes in `store/teams.ts` perform it against the employee store and return
`moved`, so the toast names the people whose department changed exactly as it does
connected. `departmentMismatch` is surfaced, never repaired. Taking somebody off
a team still leaves their department alone.

Every refusal is the API's own, sentence for sentence, from
`approvehr-api/src/modules/{departments,teams}/service.ts` — including the two
that name the people blocking an archive. The only wording changed is the API's
stale "team" for a nested department, which the demo calls a sub-department
because that is what the screen has called it since the teams build. **The
backend strings are still stale** and were left alone; see below.

## Three fixes that came with it

- **Archiving was one-way from the interface, in both modes.** The screen fetched
  `useDepartments()` with `includeArchived` defaulting to false, so an archived
  unit vanished the moment it was archived and the Restore button on its row could
  never render. It is `useDepartments(true)` now, with archived units in their own
  card — the shape the Teams tab already used. The row's `opacity-60` for an
  archived node went with it: it had never rendered, and dimming 5.9:1 text to
  about 3.5:1 would have broken the contrast promise the palette work made.
- **The screen had no permission gate at all**, while the API needs
  `MANAGE_SETTINGS` to change the structure and `EDIT_RECORDS` to move people into
  it. It offered an office manager buttons the API would refuse. Same split as the
  Teams tab now.
- **The record page's department picker did nothing in demo mode.**
  `useEmployeeMutations().update` destructured `departmentId` out and dropped it
  with a comment saying an id means nothing to the local store — true, and the
  consequence was an edit that looked saved and moved nobody. `demoDepartmentName`
  is the seam. **`workLocationId` still has the identical bug**: locations live in
  `store/attendance.ts`, which is a different store and a different fix.
- **One placeholder, not three.** `/people/new` wrote the literal `"Unassigned"`
  as the department of a person created without one, so the assign dialog said
  "Now in Unassigned" and the count read them as assigned. It writes
  `NO_DEPARTMENT` now, and `isUnassigned` accepts all three so an existing demo
  browser still counts its own people correctly.

## Verified

`npx tsc --noEmit` and `eslint` clean over every file touched.

In the browser, in demo mode, signed in as the seeded owner: the demo badge and
the note; create refused on a duplicate name; create; a sub-department inside it;
`Assign people` moving two people and the Unassigned stat falling to 0 with the
monthly figure landing on ₦1m for two ₦500,000 salaries; a rename carrying both
people with it and the head resolving to a name; archive refused naming the two
people in it; archive refused on the parent of a live sub-department; archive of
the empty leaf, its Archived card, and Restore putting it back under its parent.

On the Teams tab: the seeded teams with the cross-functional badge, 6 distinct
people on a team counted once across two teams, the drawer's members and monthly
cost, `membershipEffect` shown before the write, adding two people from Finance
and Operations and the toast naming both moves, a create refused on a duplicate
name, a create into the new department, moving a team from cross-functional to
Finance with the "This moves people" warning and a toast naming all three moves,
`departmentMismatch` surfacing for the two people that left, "Take off" leaving a
department alone, and archive refused naming three of five members.

Then the record page's department picker saving in demo mode, which it did not
before.

**Not exercised:** connected mode. No API was running, and none of this changes
the connected path beyond `useDepartments(true)` and the permission gates. The
demo refusals were written against the service source rather than a live server.

## Deliberately not done

- **The backend's stale "team" wording.** `modules/departments/service.ts` still
  says "inside one of its own teams" and "still has N teams inside it" for nested
  departments. The demo says sub-department. Fixing the backend means touching
  `tests/departments.test.ts` and was out of scope for a frontend change.
- **`workLocationId` in the demo employee update.** See above.
- **The other twelve stores that cite the old refusal.** Each needs its own
  judgement, not a find-and-replace.

---

# A payroll can go out with somebody left off it

`missing_bank_account` was a BLOCKER, and it should be — you cannot pay somebody
without somewhere to pay them. What was wrong is what that blocker held: **one
incomplete record stopped every other salary in the company.** Three hundred
people wait because Grace has not sent her account number in.

## The fix is a table, not a filter

`PayrollExclusion` — run, employee, reason, who decided, when. Migration
`20260821225244_payroll_exclusions`, plus `excludedCount` on `PayrollRun`.

A client-side filter would have let the run go out just as well and left nothing
behind, and the question a year later is not "who was on the August run" — it is
**"why was Grace not paid in August?"**. The only acceptable answer is a row with
a name, a reason, a person and a date on it. That is the whole feature; the rest
is plumbing.

Three properties, each a rule rather than an accident, each with its own test:

1. **The default is safe.** Nothing infers an exclusion from an incomplete
   record. Doing nothing leaves the blocker exactly where it was and approval
   stays refused, naming the person.
2. **Only an explicit decision downgrades it**, and it becomes an
   `excluded_from_payroll` WARNING carrying the reason, the decider and the date
   — never a silent omission.
3. **It expires with the period.** Exclusions hang off the run, so preparing the
   next month starts with none and the blocker returns by itself. An exclusion
   that outlived its period would be a person quietly unpaid for months, which is
   the failure this table exists to prevent, not to automate.

`prepare` deletes payslips and exceptions wholesale and **does not touch
exclusions** — if it did, excluding somebody and pressing Calculate again would
resurrect the blocker and the loop would never terminate. That is the case worth
keeping if you ever refactor `prepare`.

## Excluding rebuilds the period, and that is not laziness

`POST /payroll/runs/:id/exclusions` writes the row and then calls `prepare`.
A run is a function of the directory *and* this run's exclusions, so recording
the exclusion and leaving the payslips alone would produce a screen showing a
payslip for somebody the same screen says is not being paid. Rebuilding is free:
preparing settles nothing, by design, and that is exactly what makes it safe to
call from here. `DELETE …/exclusions/:employeeId` is the way back, and whatever
blocked the person returns with them if it was never fixed.

`RUN_PAYROLL`, not `APPROVE_PAYROLL`: excluding somebody is part of working a
period up rather than releasing it, and the clerk who reads the exceptions is the
person who knows Grace resigned on the 12th. Asserted over HTTP rather than
assumed.

## Honest counts, in one helper instead of five sentences

`employeeCount` is **payslips**. It is the right answer to "how many were paid"
and a wrong claim under a label like *People*, and a bare 9 where ten people work
is the same class of statement as a zero standing in for an absent figure.

`headcountLabel` / `payslipCountLabel` / `excludedNote` in `lib/api/payroll.ts`
are the only places that sentence is written. `headcountLabel` is for a `Stat` or
a `Badge` where the label carries the noun; `payslipCountLabel` puts the noun
next to its number, because appending one to the other helper produces "9 of 10 —
1 excluded payslips", which reads as though one payslip was excluded. That was a
real bug, caught in the browser and not by `tsc`.

Applied to the run wizard (all four steps), the payroll home stat and the runs
table, the payslip index, the totals panel, the approval consequences, and the
dashboard card.

## Demo mode does the whole loop, on purpose

`store/departments.ts` refuses every write offline; `store/shifts.ts` allows
them. An exclusion is the shifts case: it is one run's decision about one person,
it lives in the same persisted record as the run, and nothing outside
`store/payroll.ts` reads it. So the demo shows blocker → exclude with a reason →
recalculate → approve, which is the loop the feature exists for and the thing a
buyer needs to watch happen. The persisted payload is at version 2.

## Two bugs found on the way, both fixed, neither mine

- **`prepare` could not finish.** It awaited `exitExceptionsFor(db, …)` and
  `pendingIn(db, …)` from inside its `$transaction` — on the outer client, so
  they never saw the transaction's writes and gained nothing from being in there.
  What they did do is hold an interactive transaction open across two more round
  trips against Prisma's **5 second** default, in a body that already writes two
  rows per employee. It failed on a company of *three* on this machine, on the
  last statement, after every payslip had been written and rolled back. Hoisted,
  and the transaction now carries an explicit `timeout`. Preparing a three-person
  payroll went from a timeout to 400ms.

- **`insights` read two unscoped models by period alone.** `Payslip` and
  `PayrollException` carry no `organizationId` — they hang off `PayrollRun`, which
  is scoped — so `where: { payrollRun: { period: start } }` filtered on the period
  and nothing else. `GET /insights/reports` returned **every ApproveHR customer's
  payslips for the month**, and reported their gross and net by department to
  anybody here holding `VIEW_SALARIES`; the dashboard's blocker and warning counts
  had the same hole. Both now start at a scoped `payrollRun.findFirst` and read by
  `run.id`. `tests/insights.test.ts` had a case failing on exactly this and it read
  like flakiness — it is in `tests/tenant-isolation.test.ts` now, with the hole
  asserted beside the door so nobody closes the wrong one.

## Verified

Backend: `npx vitest run` over the fourteen payroll-, insights-, tenancy- and
audit-adjacent files — **410 passing**, including `tests/payroll-exclusions.test.ts`
(26: the blocker holding the run, the reason being required, the downgrade to a
recorded warning, no payslip rather than a zero one, the counts adding up, the
exclusion surviving a rebuild, September starting clean, an approved run refusing
to change who was on it, putting somebody back, and six cases over HTTP) and four
new tenant-isolation cases.

Frontend: `npm run check` green, `npm run build` green at 79 routes and 112
prerendered pages.

In the browser, **demo mode**: the blocker naming Grace Effiong and offering both
"Add account number" and "Exclude from this payroll"; the dialog refusing an empty
reason; the exclusion dropping gross from ₦12,500,000 to ₦11,650,000 and the
header to "9 of 10 payslips — 1 excluded"; the blocker becoming a warning quoting
the reason, the decider and the date; "Not on this payroll" under the payslip
table; the approve step and its confirm dialog both naming the excluded person;
the payroll home, the runs table and the payslip index all reading "9 of 10 — 1
excluded"; **Calculate again keeping the exclusion**; September coming back with
ten payslips and Grace's blocker; and "Put back on this payroll" restoring both
the payslip and the blocker.

**Not exercised:** connected mode. No API was running on this machine — the wire
shapes are covered by the six HTTP cases in `tests/payroll-exclusions.test.ts`
instead. The dashboard card's excluded line was not seen rendered, because the
demo dashboard sends `payroll: null` by design; its type and copy are in place.

## Deliberately not done

- **`exit_final_pay` still says "this is their last payslip"** for a leaver who
  has been excluded, where there is no payslip. Both rows appear together and the
  exclusion row says plainly that there is none, so a reader is not misled — and
  filtering another module's exceptions from here would widen the blast radius of
  a payroll change for a sentence. Worth a look next time `offboarding` is open.
- **No "put back" from the payroll home.** That screen renders the exception list
  read-only and does not pass `actionFor`, on purpose: it is a place you look at a
  run, and the write belongs where the run is being worked on.
- **Exclusions are not carried into `/payroll/payments`.** A batch is built from
  payslips, and somebody with no payslip cannot be in one, so nothing there needs
  to know. If a future screen totals a batch against a headcount, it will.

---

# The performance screens, and where an employee finds out nobody is marking them

`PERFORMANCE.md` §5 step 8. Steps 1–4 — the defensibility core — landed in the
backend last session with no interface on them at all: the objective approval
lifecycle, the composite score, and the four sign-off columns on `Review` existed
and nothing in the product could reach any of them. This is that interface, plus
one backend fix the interface could not be built honestly without.

## Three routes, and why each is a route rather than a tab

| Route | Why not a tab |
|---|---|
| `/performance/approvals` | it is a **queue**: somebody arrives from a notification with one job and leaves. A tab puts it behind a screen about something else, and a notification link lands on KPIs |
| `/performance/cycles/[id]` | one cycle at a time, and the id is the thing being looked at |
| `/performance/reviews/[id]` | one appraisal, and the record has to be linkable — from a notification, from the cycle register, from a task list |

All three are **one route per reader**, narrowed by the API rather than the URL.
The incumbent ships `self-appraisal`, `manager-appraisal`, `manager-view` and
`hr-view` over the same record; `reviews/[id]` decides from `review.mine`, the
subject id and one permission, and says on screen which reading you are getting.
Four endpoints differing only in a `where` clause are four places for a
permission bug to hide — PARITY.md Rule 1, one level below a module.

## The backend bug the acknowledge step could not be built on

`myReviews.aboutMe` filtered manager reviews to **published cycles only**.
`mayReadReview` has always opened a *finalised* manager review to its subject
whether or not the cycle is published, because asking somebody to acknowledge a
rating they are not allowed to read would be absurd — and the list did not match
the guard. So `finaliseReview` sent the employee a notification saying their
rating was final, and the screen it pointed at listed nothing. The rating was
reachable by id and invisible in the list.

The clause is finalised **or** published now, matching `mayReadReview` clause for
clause, with two assertions in `tests/performance-defensibility.test.ts`: the
finalised rating appears, and an unfinalised one in the same unpublished cycle
still does not. If that guard changes, change the list with it.

This is the same shape of defect as the payroll figures and the zero-pay bug: not
wrong arithmetic, but a screen that could not show the fact somebody had to act
on. Nothing in `tsc`, lint or the existing 70 assertions could see it, because
each half was correct on its own.

## An employee with no appraiser finds out from their own screen

The requirement is that this surfaces as an exception rather than as silence, and
it now does in three places, each reading a different door:

1. **At activation** — `withoutAppraiser` and `withoutAgreedObjectives`, by name,
   as two separate dismissible callouts on the appraisals tab. Two, not one,
   because the fixes are different: one needs an appraiser, the other needs an
   objective agreed. Both were already returned by the API and only the first was
   being rendered.
2. **On the cycle screen, persistently** — the appraiser map read with
   `exceptionsOnly`, above the table, in the payroll run's blocker shape. Not
   only at activation: a mapping can be emptied afterwards, and an exception that
   only appears once is an exception nobody catches the second time.
3. **On the employee's own appraisals tab** — `useMyAppraisers`, which asks
   `GET /cycles/:id/appraisers/:employeeId`. That endpoint is deliberately open
   to the subject ("knowing who marks you is not privileged"), and it is the only
   honest source for this on that screen.

**Do not try to infer it from `myReviews`.** A manager review is absent from
`aboutMe` until it is finalised or the cycle is published, so an absence there is
the ordinary mid-cycle state for almost everybody. Reading it as "nobody is
appraising you" would be a wrong claim in the common case — the same class of
error as reading "no attendance rows" as "nobody came in".

The mapping *interface* stays behind `multiAppraiser`, off by default and never
asked about by the wizard. **The exception is behind no flag**, and must not be:
the company that never opens the mapping screen is exactly the company that will
finish a period with somebody unmarked.

## Absent is absent, in five specific places

The rule costs nothing to state and everything to get wrong, so here is where it
lands in this change:

- A **component with no data** renders "Nothing recorded" and the API's own
  reason, never 0%. `scoreLabel(bp: number)` takes a non-null number *in its
  signature*, so the compiler asks every caller what it wants to say about an
  absence instead of letting one fall through as zero.
- A **person with no mark** renders "No mark" in the register, never 0%.
- **`rating: null`** renders "None given" — a form the author chose not to put a
  number on is not a form scored nought.
- **`review.appraiser` absent** still renders no strip at all, which was already
  true and is now true in two surfaces instead of one.
- **`acknowledged: false`** is not "they disagreed". Three separate booleans,
  three separate badges, and the third state — nobody has asked them yet — is the
  common one.

## The two axes on a KPI card

`status` is how it is going. `approval` is whether anybody agreed to it. A KPI
can be **agreed and off track at once**, which is ordinary rather than an edge
case, so both badges are on the card and neither is derived from the other.

An agreed target is frozen: the title, the period, every measure's target, and no
new measure — because adding one changes what delivering the objective means. The
API refuses all four; the screen stops offering them and says why in a sentence
above the buttons, because a button that returns "that is refused" was a design
failure two clicks earlier. Reopening is the one way through and it takes a
reason.

## What demo mode does now, and the reversal in it

The approval loop and the employee's answer are **demo writes**. That reverses
the store's own rule that a write about somebody else is refused offline, and
agreeing another person's objective is plainly one of those.

It is allowed anyway for one reason: the approval loop **is** the product. Three
goals, one manager agrees, rate once, the employee acknowledges. A demo that can
show every screen of that path and not the click in the middle of it demonstrates
a form rather than a workflow — the same argument that put the payroll exclusion
loop into demo mode. Every refusal the API makes, the demo makes too, in the
API's own words: nobody agrees their own, a send-back and a refusal carry a
reason, a refusal is terminal, and reopening counts the revision.

Two things stay refused, and the reasons are different:

- **Finalising somebody's rating** is the one-way door that decides what a person
  is told their mark is. It belongs with their record.
- **A cycle's register** is an aggregate over everybody, the read
  `useAppraiserMap` already refuses offline, and one assembled in a browser would
  describe a cycle nothing else in the demo is running. The cycle screen renders
  the cycle's own head and that refusal, rather than a register it would have to
  invent.

The persisted payload is at **version 2** — `approvals` and `signOff` arrived
with this change, and a version 1 payload is dropped rather than left to render
`undefined.approval`.

### One demo-data fix that came out of it

`demoMyReviews` fabricated a manager review for **anybody**, including somebody
with nobody above them. `Review.authorId` is not nullable, so that state cannot
exist connected — and it made the demo contradict the rule this whole change is
about: a person with no appraiser has no manager review, which is an exception to
surface rather than a form to invent. It now returns none for them, and
`demoReviewDetail` refuses the same id so a link cannot reach a form the list
says does not exist. Signed in as Tunde (`p-02`, who has no manager) the demo now
shows the no-appraiser callout instead of a review from nobody.

## `review-parts.tsx` exists so two surfaces cannot drift

The modal answers a form; the page is the record of a rating. Both need to render
a question and a read-back answer, and a second copy of that drifts until one of
them renders a question the form has stopped asking, or renders an unanswered one
as blank rather than as unanswered. So the question, the 1–5 scale in words, the
appraiser strip and the draft helpers live in one module that neither surface
owns. The page reads the form and **opens the modal** to answer it rather than
growing its own answering path.

## Verified

Frontend: `npm run check` green (typecheck, lint, titles, contrast, payroll, CSV,
template, loans). `npm run build` green at **82 routes**, up from 79 — the three
new ones, with `/performance/approvals` prerendered and both `[id]` routes on
demand.

Backend: `npx tsc --noEmit` clean. `npx vitest run
tests/performance-defensibility.test.ts tests/performance.test.ts
tests/appraiser-mapping.test.ts` — **151 passing**, including the two new
`reviews/mine` assertions. `tests/tenant-isolation.test.ts tests/setup.test.ts` —
45 passing. One run of the defensibility file timed out at 5000ms on
`the approval queue…never shows somebody their own` and passed on a clean re-run:
a timeout, which this file's own rule says is contention rather than a defect.

In the browser, **demo mode**, signed in as the seeded owner and then as Amara:

- the KPI cascade with both badges on every card, the sent-back objective showing
  its reason, the freeze sentence on the agreed ones, and "Not everything here
  can be scored yet" counting 2 waiting and 1 unsent
- the approval queue with the caller's **own** waiting objective absent from it,
  and the agree confirmation naming the person and the period
- agree → the queue empties to "Nothing waiting", and the KPI callout drops from
  2 waiting to 1. Propagation proved across two screens
- send back with a reason → the queue drops to one row, and the KPI card shows
  "Sent back" with the reason on it and a "Send it again" button
- send it again → back to waiting, and back in somebody else's queue
- the dispute dialog refusing nine characters with the API's floor, then
  recording the dispute: the mark stays at 4 out of 5, the badge and the card
  appear, and the appraisals tab drops "Ratings needing your answer" to 0
- acknowledge with no comment → "They added nothing, which they were not obliged
  to"
- the review record's projection line, the score panel rendering the demo
  refusal rather than a blank or a zero, and "Not answered" on both unanswered
  questions
- the cycle screen rendering the cycle head from the demo and the register
  refusal
- the no-appraiser callout for `p-02` and **no false positive** for `p-06`, who
  has a manager

**Not exercised: connected mode.** No API was running on this machine. Every wire
shape is covered by the backend tests above, and the two new assertions were
written against the endpoint the acknowledge step reads. Somebody with a running
API should walk the finalise button once — it is the one control in this change
that demo mode refuses outright, so it has never rendered against a real 200.

## Deliberately not done

- **`/performance/cycles/[id]/report` and `/performance/history/[employeeId]`.**
  §4.8 lists both; they are §5 steps 6 and 9, not step 8. The register on the
  cycle screen is the read a cycle owner needs to *finish* a cycle; a distribution
  and a trend across cycles are a different question and a different screen, and
  building a thin version of each now would be two screens to replace.
- **`/settings/performance`.** The weights endpoint is wrapped
  (`scoringWeights` / `setScoringWeights`) and nothing renders it. Weighted
  components are one of the §4.8 toggles and the five-person company must never
  see them; the panel belongs with the other feature-gated settings, and it needs
  the whole-set-at-once form the API's refusal implies rather than five inputs.
- **A `weightedScoring` / `calibration` / `perDepartmentQuestions` flag.**
  `OrgFeatures` has `appraisals` and `multiAppraiser` and no others for this, and
  adding three columns is a migration plus a setup-wizard decision, not a
  frontend change. The word "calibration" appears nowhere in these screens, which
  is what §4.9 actually asks for.
- **Per-department questions and the question publish gate** (§4.7). No API for
  either yet — `addQuestion` has no `departmentId` and `ReviewQuestion` has no
  `publishedAt`. Building the interface first would be a form that cannot save.
- **Batch approve on the queue.** §3.2 wants it at 200 reviews and the endpoint
  does not exist. Worth noting that a batch *agree* is in tension with the whole
  point of the queue: the guard on agreeing a target is reading the target, which
  is why the measures are on the card rather than behind it.
- **Wording the no-appraiser message in the second person** on the employee's own
  screen. It arrives as "Nobody is appraising Tunde Bakare", which is the API's
  own sentence; the callout title supplies the "you". Paraphrasing a server
  message so it reads better locally is how the two stop agreeing.

---

# The verification pass over eight agents, and four things it found

Eight agents built in parallel — announcements, exclusions, the performance
defensibility screens, the test-isolation work, departments in demo mode, the
importer/ETL split, payment history, the wizard. This section is what verifying
all of it together turned up. Nothing here is a disagreement with those
decisions; each one is something that only shows up when you look across all of
them at once, or that no gate was watching.

## The type scale had already regressed, and nothing was watching

`globals.css` states the rule plainly: `--text-meta` (14px) is the floor, and
"Nothing in the app renders smaller than 14px." That sentence had stopped being
true. The four `people/import/*` screens carried **sixteen** sizes below it —
seven at 12px, eight at 13px, one `text-sm` — all written as arbitrary values
(`text-[0.75rem]`), which is the form that survives review because no reviewer
reading a class list recognises `0.8125rem` as a number.

The importer is the wrong screen to lose this on. It is a dense table of things
wrong with a spreadsheet, read by the owner-manager of a Nigerian SME doing their
own payroll — a reader who is frequently over fifty, where presbyopia is
near-universal. Small *and* consequential is the combination the scale exists to
prevent.

Fixed to the tokens, and **`npm run verify-typescale` now gates it**
(`scripts/verify-typescale.ts`, wired into `npm run check`). It bans arbitrary
font sizes below 14px in any unit, plus `text-xs`. Arbitrary sizes *above* the
floor are left alone: the marketing site uses a few display sizes deliberately,
and this check is about the floor rather than about tokenising the repo. Tamper-
tested both ways — reintroducing `text-[0.75rem]` and `text-xs` each fail it, and
removing them passes.

### `text-body` is a COLOUR, not a size — this is a trap

Worth knowing before you write `text-body` expecting 16px. `globals.css` defines
both `--color-body: #4a5a68` and `--text-body: 1rem`, they collide on the same
utility name, and **Tailwind v4 resolves it in favour of the colour**. Confirmed
against the built CSS:

```
.text-body     { color: var(--color-body) }          ← what you get
.text-body-sm  { font-size: var(--text-body-sm) }    ← the others are sizes
.text-meta     { font-size: var(--text-meta) }
```

So `--text-body` generates no utility at all. Nothing is visibly broken, because
all 416 uses are as a colour and `body` already inherits 16px from the browser —
but the 16px baseline token is unreachable by name, and a future author writing
`text-body` for a size will silently get no size. Left as-is deliberately:
churning 416 call sites in a verification pass is the wrong trade. The
`verify-typescale` failure message says this, which is where somebody will
actually read it.

## The demo emitted a payroll exception code the API has never sent

`store/payroll.ts` raised `"leaver"` for somebody whose end date falls in the
period. Wrong twice over:

1. It is a word this product does not use. The vocabulary is **exit**.
2. **No API code has ever been called that.** `exitExceptionsFor` emits
   `exit_final_pay` for exactly this case (`lastWorkingDay >= periodStart`, which
   is what `leftThisPeriod` means). The function's own header promises "the codes
   match so a fix link resolves the same way", and this one did not.

It survived because `fixFor` has a `default` arm returning "Open record", so the
button looked right while switching on a string the connected product never
sends — the failure mode a `default` arm is for and also hides. Now
`exit_final_pay`, with the API's own sentence about there being no next month to
correct the figure in.

## Two honesty gaps in places a headcount appears

The exclusion work applied `headcountLabel` thoroughly, and two spots were
outside its sweep:

- **The payment batch modal** rendered a bare `employeeCount` under a label
  reading **People** — the exact "9 where ten people work" claim the helper
  exists to stop. `ApiPayableRun` now carries `excludedCount` (already on the
  wire; `payroll.list` returns whole rows) and the modal uses `headcountLabel` +
  `excludedNote`. Nothing about what gets paid changes — a batch cannot contain
  somebody with no payslip — only whether the sentence beside it is true.
- **The run wizard's "already prepared" callout** read *"It has 9 of 10 payslips
  — 1 excluded and is approved."* The em-dash clause captures the trailing verb,
  so it parses as though the *exclusion* had been approved. Two sentences now.

## The backend gate was red on committed code

`npx tsc --noEmit && npx vitest run` was green, which is what the previous
sessions checked. `npm run check` — which is what **CI** runs, as four separate
steps — was not:

- **4 lint errors**, all in already-committed code: an unnecessary `month!` in
  `payments/service.ts` (`Date.UTC` declares `monthIndex` optional, so it already
  accepts `number | undefined`), and three `async` test callbacks with no `await`
  in `employees.test.ts`.
- **`format:check` failed on 15 files**, four of which were committed unformatted.

Three of those fifteen belonged to **a linked git worktree** at
`.claude/worktrees/sharp-leavitt-a4221a`, parked on `1504fe4`. `.git/info/exclude`
keeps it out of git's view, but that file is local and uncommitted, so every other
tool in the repo walks straight into it. `.claude` is in `.prettierignore` now.
The worktree itself is left alone — it may hold somebody's work — but it is worth
removing with `git worktree remove` once you know it does not.

**Run `npm run check` in the API repo, not `tsc && vitest`.** That is the gate CI
enforces.

## Migrations: replay verified, and `migrate diff` cannot tell you

All 14 migrations apply cleanly in sequence onto an empty schema, and there is no
drift. Getting a trustworthy answer took a detour worth recording.

`prisma migrate diff --from-migrations … --to-schema` **is useless on this
machine**. Against `prisma dev` — Postgres compiled to wasm — introspection of
the replayed shadow loses every enum, index and foreign key, so it reports all 38
enums and 359 indexes as "added" while showing **zero** column or table
differences. That is a false positive that looks like catastrophic drift.

What actually answers it, and what was run:

1. Empty the shadow. Note its default schema is **`approvehr_test`**, not
   `public` — `DROP SCHEMA public` there succeeds and clears nothing, which is
   why the first three attempts kept hitting `type "Permission" already exists`.
2. `DATABASE_URL=$SHADOW_DATABASE_URL SHADOW_DATABASE_URL= npx prisma migrate
   deploy` — replays all 14 from empty. Exit 0.
3. Compare the two databases' **catalogs** directly (`information_schema.columns`,
   `pg_enum`, `pg_indexes`, `pg_constraint`), normalising the schema name out of
   `indexdef`. Result: **1116 columns, 58 enums, 270 indexes, 282 constraints,
   identical on both sides. No drift.**

Also note `${PIPESTATUS[0]}` is empty in this shell — it is **zsh**, so it is
`$pipestatus`. Two exit codes were silently blank before this was noticed; redirect
to a file and read `$?` instead of piping to `tail`.

## Reconciled, and found consistent

- **`OrgFeatures`: no collisions.** Eleven flags, identical names and defaults in
  `prisma/schema.prisma`, `modules/setup/schemas.ts` and
  `lib/store/features.ts`/`lib/api/setup.ts`. One dependency rule (appraisals off
  takes `multiAppraiser` with it), enforced server-side and mirrored in demo.
- **Migrations do not collide.** Three new ones, distinct timestamps, disjoint
  tables.
- **The wizard and the importer still agree**: `first_name, last_name, job_title,
  start_date, gross_monthly` required in both, and in the API's zod schema.
  `employee_no` optional in all three. Confirmed rendered in the browser.
- **No hardcoded money, headcount or tax figures.** Every `₦` literal in the diff
  is a comment or the statutory ₦500,000 rent-relief cap, which traces to
  `engine.ts`'s `capKobo: 500_000_00`. The scoring basis points sum to exactly
  10000 and are validated at the write.
- **No green primary buttons possible.** `Button` maps `primary`/`accent` to one
  blue fill and `approve`/`success` to one tinted green secondary; no hand-rolled
  solid-green button exists outside `button.tsx`.
- **Payment history never claims "Paid" for money nobody moved.** `paymentOutcome`
  returns "Paid" only on `SETTLED`. Verified arithmetically in the browser: the
  "Net paid" total of ₦8,277,067.11 is *exactly* the nine settled-elsewhere rows,
  excluding ten unapproved and nine cancelled, with the hint naming the
  exclusion.

## "run" as a noun: reported, not changed

The vocabulary rule is "payroll" not "run", and ~30 user-facing strings say "the
run" / "this run" / "Every run" — most of them predating this session, in
`run-panels.tsx` and `payroll-screen.tsx`. They read as the *entity* ("This run
is approved"), which is defensible, and "payroll run" — the compound — is used
correctly throughout.

Not rewritten, deliberately. Thirty copy strings the user has already reviewed and
iterated on is not a change to make unilaterally inside a verification pass, and
"Approve this payroll" for "Approve this run" is a decision about product voice
rather than a defect. Worth one deliberate pass if the rule is meant strictly.

---

# A write from a screen that never reads destroys the store

`/people/[id]` grew a "Record their exit" action — the last entry point the exit
flow was missing, beside a badge that had been saying "Offboarding" with nothing
to do about it. Wiring it up surfaced a bug in `lib/store/persisted.ts` that had
been latent since that file was written, and it is worth reading before you add
a write to any screen.

## What happened

The hydration rule in `persisted.ts` says `getSnapshot` must return the **seed**
until after hydration, and storage is therefore only loaded from inside
`subscribe()`. Correct, and it has a consequence nobody had hit: **until
something subscribes, `read()` does not return what is in storage.**

The record page reads no exits. So nothing subscribed to the offboarding store,
`demoStart` computed its write from the seed, and `commit` persisted that:

- the exit recorded a minute earlier was **gone**, replaced;
- the duplicate refusal — "…already has an exit in progress. Open that one
  instead of starting a second." — never fired, because as far as the store knew
  the person had no exit.

Two clicks, two exits for one person, the first one silently discarded. Nothing
in `tsc`, lint or the build can see it: `read()` and `commit()` are both
correctly typed and individually correct.

## The rule

> **`read()` is for rendering. `current()` is for writing.**

`current()` is new on `PersistedState` and hydrates on first call. It must never
be reached during render — that would put stored state into the client's first
paint and bring back the mismatch the whole file is arranged to avoid — and it
never needs to be, because every write path is a click or an async action, long
after hydration. There is no case where the right answer is `read()` then
`commit()`.

`lib/store/offboarding.ts` is converted. **The other stores on
`createPersistedState` are not**, deliberately: each is only wrong if some
screen writes to it without reading it, which is a per-store question rather
than a find-and-replace, and the twelve of them were not audited here. If you
are adding a write to a screen, that is the moment to check.

`lib/store/employees.ts` predates the factory and holds its own copy of the
hydration logic, so it has the same latent trap with no `current()` to reach
for. It has always been written from screens that also read it.

> **Both paragraphs above are now out of date. The audit is done — every store,
> every call site — and it found that this store was not fully converted either.
> See "The audit is done" at the end of this file.** They are kept because the
> per-store reasoning is what somebody should still apply when adding a store,
> and because the second one turned out to be the wrong prediction in an
> instructive way.

## Two smaller things in the same change

- **`StartExitDialog` takes an optional `employeeId` + `employeeName`.** When
  they are supplied the person is *stated*, not offered in a picker, and
  `<PersonPicker>` is a separate component so the directory fetch does not
  happen at all — a record page should not pull two hundred employees to record
  one exit, and a `<Select>` holding a preselected id whose option has not
  arrived yet renders blank, which is a wrong name on a consequential form. The
  props are a union, so an id without a name will not compile.

- **`tests/insights.test.ts` had a hardcoded `subjectId: "x"`.**
  `ApprovalRequest` is unique on `(subjectType, subjectId)` **globally**, not per
  organisation, so one crashed run left a row behind that locked the whole file
  out until somebody found it by hand. Suffixed now. Worth checking for the same
  shape elsewhere.

# The dashboard says when somebody is leaving and nothing has been handed back

`GET /insights/dashboard` gained an `exits` block: open exits, and how many of
them have a mandatory checklist line still unticked. It is a row inside the
existing "Needs you" card rather than a card of its own — an account nobody
disabled and a laptop nobody chased are the only things on that screen whose
cost grows the longer they are left.

Three decisions in it:

- **Composed in the one request, not a second fetch.** `openExitLoad` in
  `modules/offboarding/service.ts` is the seam, in the same batch as `boardFor`,
  and it defines "open" and "outstanding" on the offboarding side so the count
  and `/people/offboarding` cannot come to mean different things.
- **Absent, not zeroed, for somebody who may not see the register.** The gate is
  `EXIT_REGISTER_PERMISSIONS`, exported from the offboarding module and now the
  single definition `seesEveryExit` reads too.
- **A row only when something is outstanding.** "Needs you" promises every line
  on it is one click from being dealt with, and three exits progressing normally
  is not that. The open total still travels, and gives the figure its
  denominator: "1 of 1" and "1 of 9" are different situations.

**`exits` is deliberately absent in demo mode**, which is the one thing here that
could look like an oversight. Deriving it would mean subscribing the dashboard to
a fourth local store, and the header of `lib/store/insights.ts` records why the
first version's coupling to three other screens' stores was removed. Absent and
zero render identically — nothing — so no wrong claim reaches a screen; the cost
is that the row cannot be seen offline. `/people/offboarding` is where the demo
shows exits.

---

# The last three performance screens

`PERFORMANCE.md` §5 step 6, plus the settings form the previous entry left with
"the weights endpoint is wrapped and unrendered". Three routes:
`/settings/performance`, `/performance/cycles/[id]/report`,
`/performance/history/[employeeId]`. That closes §4.8's route list.

## Two reads were added to the API rather than computed in the browser

`GET /performance/cycles/:id/report` and
`GET /performance/employees/:id/score-history`, both assembled from
`scoreRegister` rather than from their own arithmetic. The rule this follows is
worth stating as a rule, because the temptation was real and both screens could
have been built without touching the backend:

> **A second implementation of a score is how two screens end up disagreeing
> about the same person.**

A distribution is `bandFor` over marks. A trend is one register call per cycle.
Both are cheap to write client-side and both would have drifted — and the trend
screen exists *in order to* be compared against the cycle screen, so a
disagreement there is not a cosmetic bug, it is the product contradicting itself
about somebody's rating. The history endpoint calls `scoreRegister` once per
cycle, sequentially, which is slower than a hand-written aggregate across cycles
and is the whole point: every point on the chart is the same figure, from the same
weights snapshot, with the same exclusions and the same rounding.

`tests/performance-report.test.ts` is new — 28 assertions, one organisation, six
people, three cycles, every figure hand-worked in a comment beside it.

## Bands: the sixth place absent-is-not-zero lands

`SCORE_BANDS`, `BAND_LABELS`, `BAND_MEANING` and `bandFor` are in
`modules/performance/scoring.ts`, and `ScoreRow` now carries `band` and
`bandLabel`. Three decisions in there not to re-make:

- **`bandFor` takes a `number`, never `number | null`.** Same signature
  discipline as `scoreLabel`, and the reason is sharper here: a formatter that
  accepted null would have to pick a band for an absence, and the band it would
  pick is *Below expectations*. That is the distribution's version of paying
  somebody ₦0 because no attendance row exists. `band` is null on the row and the
  report has a sixth row, outside the five bands, that says so in words.

- **The boundaries are the midpoints of the 1–5 scale**, computed from
  `FULL_SCORE_BP` and `BAND_COUNT` rather than written down: 1250 / 3750 / 6250 /
  8750. Not 60/75/90, which is the shape most appraisal products ship and which
  puts a straight "3 out of 5 on everything" — 5000 bp — in *partially meets*.
  That is not what the manager who wrote three 3s said about anybody.

- **A mark landing exactly on a midpoint goes in the lower band**, at all four
  edges, by one rule. These bands decide confirmation, promotion and bonus, so
  nobody is moved up by a rounding somebody would then have to justify. The test
  asserts contiguity — no gap, no overlap, 0 to 10000 — because a gap is a mark in
  no band and an overlap is a mark in two.

`BAND_TONE` in `lib/store/performance.ts` is the only band fact on the frontend,
because a colour is the one thing the API cannot send. The middle band is
**neutral** deliberately: delivering what was agreed is the ordinary outcome, and
colouring most of a company amber teaches people to read the colour rather than
the words.

## The report returns two headcounts and the screen never divides them

This is the §1.1 defect refused structurally rather than avoided by care. The
audit of the incumbent found *"Completed Criteria 0 — out of 0 total criteria"*
rendered directly above *"Performance Score 3.9 — Organization Avg"*. So:

- `forms.{people,selfIn,selfOutstanding,managerIn,managerOutstanding}` is over
  everybody who **has a form**.
- `marks.{people,scored,unscored,written,finalised,acknowledged,disputed,awaitingAnswer,noReview}`
  is over everybody **the register covers**.
- They are two nested objects for that reason, they are two cards on the screen
  for that reason, and each states its own total in its own card description.
- `distribution.meanBp` is over the marks that exist and is **null** when there
  are none. The stat's hint says how many it is over.

`tests/performance-report.test.ts` asserts the identities the way
`payroll/reconcile.ts` does: bands sum to `scored`, and `scored + unscored` is
`marks.people`. A report whose figures do not add up is the defect this whole
product is sold against.

`noReview` is its own count on purpose. "Nobody has written it" and "nobody was
ever asked to" are different problems with different fixes, and the second is the
appraiser map's to explain.

## The trend never turns an absence into a fall and a recovery

`changeBp` on a history point is measured against the previous cycle **that has a
mark**, skipping an unscored one rather than treating it as zero. The chart plots
only the marks that exist and names the empty periods beneath it in a callout.

This is the zero-pay bug wearing a chart, and it is the one place on these screens
where getting it wrong would be invisible: two right-looking numbers and a
plausible line between them. `tests/performance-report.test.ts` has Emeka scored
at 100%, then a cycle with nothing recorded, then 50% — and asserts the third
point reads −50% against the first rather than +50% against a zero.

## Who may read a trend is narrower than who may read one cycle's score

`employeeScore` admits an assigned appraiser. `employeeScoreHistory` does **not**
— it is `assertSeesEmployee`: self, direct report, or `EDIT_RECORDS`.
`isAppraiserOf` is scoped to one `(cycle, subject)` pair on purpose, because
appraising Ada at mid-year is not permission to read her end-of-year form, and a
trend is every form at once. An appraiser reads the one period they were asked to
judge through `GET /cycles/:id/scores/:employeeId`. Both halves are asserted: the
403 on the history and the 200 on the cycle score, in the same test.

The **subject** reads their own history narrowed to finalised marks, with
`withheldCycles` and `withheldNote`. Same rule as `employeeScore` and for the same
reason — a working figure moves every time somebody records a rating. The deltas
are recomputed over the visible points, so nothing leaks a provisional figure by
subtraction.

## `ScoreRegisterQuery.includeInactive`, and why it is a function argument

`scoreRegister` filters to `archivedAt: null, status != EXITED`, which is right
for "who is in this cycle" and wrong for a history. A trend for somebody who has
left is exactly the read a dispute needs, and an empty one for somebody who was
scored for three years would be a silent wrong answer rather than a missing
feature. So `scoreHistory` sets `includeInactive`, and it is a **function
argument, never a query parameter** — same shape and same reasoning as
`CheckOptions.requireEmployeeNo` in the importer: a client must not choose how
wide its own read is. `tests/performance-report.test.ts` has Femi, EXITED, absent
from the cycle report and present in his own history at 25%.

## The settings form is whole-set-at-once because the endpoint is

`PUT /performance/scoring-weights` refuses anything that does not total exactly
10000 bp, so a field-at-a-time form would be unsubmittable at every intermediate
state: move objectives from 40% to 30% and the set is at 90% until the second
field saves, and there is no second save. The form is shaped by that rather than
in spite of it, and there is **no Resolve Weights button** — the incumbent ships
one only because their weights are allowed to drift.

`scoringWeightProblem` in `lib/api/performance.ts` is the local refusal, and it is
`assertWeightsWhole`'s sentence **character for character**. That needed a second
percent formatter (`serverPercentOfBp`), because the existing `percentOfBp` puts a
fractional percentage through `Number()` and prints 33.30% as `33.3%` while the
server keeps both decimals. Two copies exist because they are two different
requirements: one is for a table cell, and this one's entire job is to be the
sentence the server would have sent. Verified against the running API: both say
*"Those weights add up to 90%. They have to make 100% exactly, so a score can be
explained. Add 10%."*

Separate from `weightProblem`, which is the appraiser-weights version. Same
arithmetic, different sentence, and showing one where the server sends the other is
how a screen starts lying about what the API said.

### The self-assessment argument is on the screen, with a live figure

`PERFORMANCE.md` §4.3 says the reasoning belongs on the settings screen, and it
does: the API's `selfAssessmentNote`, plus what turning it on costs, plus one
number that moves with the draft — *"At 20%, somebody who rates themselves 5 out
of 5 rather than 3 out of 5 moves their own final mark by 10% — more if any other
part has nothing recorded against it."*

That figure is half the component's weight, because 5-out-of-5 against
3-out-of-5 is half the component's range (`levelToBp`). It is a multiplication
over a hypothetical, deliberately **not** a composite score: computing anybody's
mark on this side is the thing the whole first section of this entry is about.

### One real defect, found in the browser and not by a type

The badge read *"Counting for 20%"* directly above the API's sentence *"Self-
assessment is weighted at 0% … it does not change the score."* Both correct — the
badge described the draft, the sentence described what was saved — and together
they were two mutually exclusive claims on one screen. Which is, exactly, the
defect §1.1 catalogues on the incumbent's own weights page.

Fixed by labelling them apart: *"Would count for 20%"*, *"Saved now, not yet
changed: …"*, *"If you save this: at 20%, …"*. `tsc` and lint could not see it;
nothing but reading the rendered page could.

## Demo mode: the read works, the write refuses

`useScoringWeights` reads from `DEMO_WEIGHTS` — a copy of the server's
`DEFAULT_WEIGHTS`, the only duplicated figures in the store — and refuses to save.
The split is not arbitrary. Reading is how somebody learns what turning
self-assessment on would do to a mark, which is the argument the screen exists to
make, and it needs no server. Writing changes how everybody in a real company is
scored, and a locally stored set would move no mark on any screen in this product:
the same failure as a green "Paid" that transferred nothing.

The report and the history refuse offline outright, for the reason
`useCycleRegister` already gives — every point is a register row.

## One backend change to an existing function

`cycleReport` composes `scoreRegister` and `cycleParticipants` **sequentially**
rather than in `Promise.all`. `scoreRegister` already fans out to six queries, and
adding the participant read beside it made this the heaviest request in the module;
against the local `prisma dev` database it reliably came back `P1017 Server has
closed the connection` while the same two reads in sequence never did. One extra
round trip on a report nobody opens in a loop.

## Verified

Backend: `npx tsc --noEmit` clean, ESLint and Prettier clean on every file
touched. `npx vitest run tests/performance-report.test.ts
tests/performance-defensibility.test.ts tests/performance.test.ts
tests/appraiser-mapping.test.ts tests/tenant-isolation.test.ts` — **210 passing**,
with no dev server running. Three new tenant-isolation cases: a history for a
foreign employee is refused, a bare `db.review.findMany({ where: { subjectId } })`
is proved to still cross tenants, and the cycle-list query `scoreHistory` actually
runs is proved to close it.

Frontend: `npm run check` green (typecheck, lint, titles, typescale, contrast,
payroll, CSV, template, loans). `npm run build` green at **86 routes** and 114
prerendered pages — the two `[id]` routes on demand, `/settings/performance`
prerendered.

**Against the live API on port 8000**, over `curl`, signed as a seeded
administrator: the report on a real cycle of twelve people, with both identities
reconciling (6 banded == 6 scored; 6 + 6 == 12), the average 73.25% over the six
marks that exist and not over twelve, `LEADERSHIP` counted for 2 with
`NOT_A_MANAGER` naming the other 10, `SELF_ASSESSMENT` at `meanBp: null` with
`NOT_WEIGHTED` for all 12, six people named as unscored and two as unfinalised;
Chidi's history with its point ordered by due date and the component block
matching the cycle's; Grace's history with two points and no mark on either; and
the weights refusal quoted above.

**In the browser, connected**, on `/settings/performance`: the form rendering the
company's saved 45/25/15/15/0, the running total falling to 95% and the local
refusal appearing in the server's words, the total reaching 120% and the refusal
inverting to "Take off 20%", the self-assessment card at 20% with the draft and
the saved value labelled apart, and a real `PUT` returning 200 — 44/26 saved,
confirmed on the server, then restored to 45/25 so the seed is as it was.

**In the browser, demo mode**: the settings form read-only from the shipped
defaults with "Saving needs the API", both new routes rendering their refusals
verbatim, and the new Appraisal scoring card on `/settings`.

**Not exercised: the report and history screens rendered against the live API.**
Not for want of trying. The local database is `prisma dev` — Postgres compiled to
wasm behind a proxy — and it drops roughly half of any burst of concurrent
connections with `P1017 Server has closed the connection`. With the browser's
normal six-request page load, `/setup/features`,
`/notifications/unread-count`, `/permissions/…`, `/employees` and
`/performance/cycles/:id` were failing alongside the report, and the pre-existing
cycle screen showed the same "Something went wrong on our side". This is the
entry already recorded above under "One thing found and not fixed", now
reproducible on every screen rather than intermittently on one. Serial `curl`
against the same endpoints with the same token is 200 every time, which is what
the connected verification above is. Somebody with a real Postgres in
`DATABASE_URL` should load both screens once.

---

# Setting the company up is one job now, and offices are a screen

Two complaints, one change: the parameters of a company were scattered, and
`WorkLocation` had a table, a `POST`, a `DELETE` and **nothing that rendered any
of it**. A five-branch company had one place to be.

## `/settings` answers a different question

It was eight `LinkCard`s in four groups — "here are eight pages" — and the
question people arrive with is "what do I still need to set up". The seven things
that constitute setting a company up are now a checklist, each row carrying its
own state, what it affects, and a link that goes somewhere real.

| File | Role |
|---|---|
| `approvehr-api/src/modules/setup/checklist.ts` | `GET /setup/checklist`. Counts and booleans, **no prose** — the opposite choice from `GET /setup/wizard`, and the header says why. Fifteen reads, deliberately **sequential**: the same `P1017` that made `cycleReport` sequential. |
| `web/src/lib/store/setup-checklist.ts` | One request connected; composed from six localStorage stores offline, which is the thing `store/insights.ts` warns against and is justified in the header — every demo read is synchronous, and a hub that cannot answer its own question on a laptop with no database is worse. |
| `web/src/app/(app)/settings/checklist.ts` | The judgement: which facts add up to "done", and the sentence for each state. Apart from the JSX so a sentence is not written twice. |
| `web/src/app/(app)/settings/settings-screen.tsx` | The rows, plus the ten ongoing surfaces as an index below them. |

Three decisions in it worth not re-making:

- **`optional` is what keeps the count honest.** "6 of 7" has to mean something,
  so a row that *cannot* be incomplete is excluded from the denominator rather
  than counted as done. Employee record fields are the only one: their columns
  default to on, so there is no state where a company has failed to choose.
- **`attention` is not a softer `todo`.** It means something is set up and is
  wrong right now — nobody holding `APPROVE_PAYROLL`, an account with no role
  that can sign in and see nothing, a calendar with no holidays so every one of
  them prorates as an ordinary working day.
- **The payroll-check counts are the run's own conditions**, read against the
  same `requireBankAccount` / `requirePensionPin` switches. A hub counting
  "missing bank account" its own way would nag about a payroll that would go
  through, or stay quiet about one that would not.

Demo mode reports `null` — not zero — for bank accounts, pay components and
salary bands. All three are API-only surfaces and the screen says so.

## Work locations: `/settings/locations`

Add, edit, switch off, turn back on, with a geofence per office. No map: a tile
provider is a credential nobody has wired, and the substitute that actually makes
coordinates usable is a sentence saying what a radius *does* (`GEOFENCE_EXPLANATION`,
written once in `lib/api/attendance.ts`). `remoteAllowed` is worded as **"Staff may
clock in from anywhere"** on every surface.

Three states are kept apart, because conflating them is a wrong claim:

1. **No fence** — nothing is checked. Renders "Not checked", never `0 m`.
2. **A fence that is applied** — radius and coordinates, `geofenceEnforced: true`.
3. **A fence that is not applied** — coordinates *and* `remoteAllowed`, so the
   radius sits on the record doing nothing. A real arrangement, and the row says
   "Set, but not applied" rather than showing a radius that bites nothing.
   `geofenceEnforced` is computed **on the API** so the screen and `clockIn`
   cannot disagree about it.

### The API had to grow, and `attendance/service.ts` was not touched

`src/modules/attendance/locations.ts` is new: the read that carries the fence,
`PATCH /attendance/locations/:id`, and `POST /attendance/locations/:id/restore`.
`createLocation` and `archiveLocation` stay in `service.ts`, which is the clocking
engine — the split is between drawing a fence and enforcing one.

- **The old `GET` returned four fields and none of them was the fence.** A fence
  you cannot read is a fence you cannot edit, so `POST` could set coordinates
  nothing would ever show back.
- **`restore` closes a sentence that named a route which did not exist.**
  `createLocation` refuses an archived name with "Turn it back on rather than
  making a second one" — and until now you could not.
- **A PATCH validates the fence it would *end up with*.** Sending only
  `latitude` slips past a schema-level check and leaves two thirds of a fence in
  the table, which decides nothing and refuses nothing. `GEOFENCE_ALL_OR_NOTHING`
  is one exported sentence so the create and the patch cannot drift, and the
  frontend copies it character for character for its demo refusal.
- **`null` clears, absent leaves alone.** That is the only way to remove a fence
  drawn by mistake, and it is why `updateWorkLocationSchema` is not the create
  schema with everything optional.

### One frontend bug found on the way

`attendanceApi.createLocation` passed `body: JSON.stringify(input)` to `request`,
which stringifies its body itself. Every field reached the API as a quoted string
where an object belonged, so the one write that existed had never worked. Nothing
rendered it, which is how it survived.

### A reversed decision: demo mode may now write locations

`useWorkLocations` refused every write offline on the grounds that "a location is
company configuration, and inventing one locally would have it vanish on the next
machine". **The employees are in localStorage too** — a person created in demo
mode vanishes the same way and the product creates them anyway — so that is an
argument against demo mode, not against this screen. `lib/store/departments.ts`
still refuses and still should: a demo department would contradict the demo's own
payroll screens, and a location contradicts nothing.

The honest cost, stated on the screen: **a demo fence is never applied**, because
clocking in offline does not ask the device where it is. Connected, `clockIn` is
the only thing that judges a fence and it judges every one.

`assigned` is `number | null` for the same reason: `Employee.location` offline is
a city ("Lagos, NG") and nothing joins it to a work location, so the count is
absent rather than 0.

## Verified

`web`: `npm run check` and `npm run build` green — 87 routes, 116 prerendered,
`/settings/locations` among them. `approvehr-api`: `npm run check` green (the gate
CI runs, not `tsc && vitest`) — **46 files, 1233 tests**, including
`tests/setup-checklist.test.ts` (7 assertions, one of them tenant isolation) and
`tests/work-locations.test.ts` (16, up from 6, two of them tenant isolation on the
new writes).

In the browser, demo mode: five branches with two fences, the exact coordinates
round-tripping (`6.601838` in and out), the partial-fence refusal in the API's
own sentence with save disabled, the case-insensitive duplicate refusal, switch
off → show switched-off → turn back on with the fence intact, `remoteAllowed`
flipping a fence to "Set, but not applied", clearing a fence to "Not checked",
and the propagation — adding a fifth office moved the hub's row from "4 offices.
1 has a geofence" to "5 offices. 2 have a geofence, and each one is applied."

**Connected mode was not exercised in the browser.** The local database is
`prisma dev` and the wire shapes were checked against the two test files instead.

---

# Connected mode works now, and the errors were one environment problem

The complaint was *"lets not have all these api error messages, I want this as
close to the system we are launching"*. Almost none of those messages were bugs
in the product. This section is what they actually were, because the diagnosis
is the useful part and every previous session recorded a symptom of it without
finding the cause.

## `prisma dev` cannot serve a single-page app, and that is the whole story

Six sections above end with **"connected mode was not exercised"** and a note
about `P1017 Server has closed the connection`. Two of them blame concurrency
and one calls it "the class of flakiness this file already records". All three
were right about the shape and none of them measured it. Measured:

| Pool size against `prisma dev` | Result over 60 queries, 12 at a time |
|---|---|
| 1, 2, 4, 5 | 60 succeed |
| 6 | 50 succeed, 10 `ECONNRESET` |
| 8 | 43 succeed |
| **10 — what `src/db/client.ts` actually uses** | **35 succeed, 25 dropped** |

`prisma dev` is Postgres compiled to wasm behind a proxy; the same property that
makes the test suite's advisory lock useless there (every connection gets the
same backend session — see the entry above) makes it drop the sixth concurrent
connection. `GET /health/ready` — one `SELECT 1` — returned **503 on a third of
requests** in a burst of eight. A browser opening one screen fires six.

So: every "api error message" on every screen, every intermittent 500 on
`/performance/reviews/mine`, and the "Something went wrong on our side" that made
the report screens unverifiable, were the same connection being dropped.

**The fix is a real Postgres, not a code change.** `brew install postgresql@17`,
three databases, and `.env` pointed at them. After that, 36 out of 36 concurrent
`/health/ready` requests answered 200, and **all 158 GET endpoints the API
exposes answered 2xx** in one sweep with ids resolved from the seed.

Do not "fix" the pool size for `prisma dev`. Ten per task is right for RDS, it is
sized in a comment that explains itself, and shrinking it to suit a wasm
development database would make production worse to make a laptop quieter.

### Setting the database up, once

```bash
brew install postgresql@17 && brew services start postgresql@17
psql -h 127.0.0.1 -d postgres -c "CREATE ROLE approvehr LOGIN PASSWORD 'approvehr' SUPERUSER"
psql -h 127.0.0.1 -d postgres -c "CREATE DATABASE approvehr OWNER approvehr"
psql -h 127.0.0.1 -d postgres -c "CREATE DATABASE approvehr_shadow OWNER approvehr"
psql -h 127.0.0.1 -d postgres -c "CREATE DATABASE approvehr_test OWNER approvehr"
```

Then `DATABASE_URL`, `SHADOW_DATABASE_URL` and `TEST_DATABASE_URL` in `.env`, and
`npm run demo`. The old `prisma dev` values are kept in `.env.prismadev.bak` on
the machine this was done on; the daemon is still running and can be left alone.

## The rate limit is the second thing that looks like a broken API

`RATE_LIMIT_MAX` is 300 in fifteen minutes, per session. The comment in
`src/app.ts` argues at length for keying on the token rather than the IP and is
right, and it says in passing that "opening three screens spends that" — which is
the ceiling, not the key, and nobody had drawn the conclusion. In development,
where hot reload re-runs every fetch on a screen, walking twenty screens exhausts
it and **every panel on the page says "Too many requests" at once**. That reads
as the API being broken.

`.env` is at 20000 locally with the reason in `.env.example`. The production
default is untouched: 300 in fifteen minutes is right for somebody working.

Worth knowing while debugging this: `pkill -f "tsx watch src/server.ts"` **does
not match**, because the command line is `tsx watch --env-file=.env src/server.ts`.
Four stale wrappers were running from earlier sessions, one of them still holding
the old limit, which is why the first attempt at raising it appeared to do
nothing. `pkill -f "src/server.ts"` is the pattern that works, and
`pgrep -fl "src/server.ts"` is worth two seconds before any of this.

## One command brings up a company with something on every screen

`npm run demo` = `db:deploy` → `db:seed` → `demo:company` → `demo:performance`.
Idempotent end to end; re-running changes nothing.

### `prisma/seed.ts` grew the things a company *is*

The seed created ten people and five departments and nothing else, so two thirds
of the product had no data at all and the empty states were being read as broken
screens. It now also writes: **the reporting line** (three levels), `OrgFeatures`
with every flag on and the wizard recorded as finished, four offices with the
**three distinct geofence states**, salary bands every seeded salary falls inside,
pay components with one deliberately pensionable line, a bank account, expense
types, asset categories, the exit checklist templates, SLA policies and ticket
categories that point at them, six knowledge-base articles, three policies (one
draft), shifts and rota patterns, notification rules, three teams (one
cross-functional), and Nigeria's 2026 holiday calendar instead of four dates.

Two of those are load-bearing rather than decorative:

- **The reporting line had to exist for the performance demo to run at all.**
  `assertMayApproveGoal` lets somebody agree an objective only for their own
  reports or with `EDIT_RECORDS`. With `managerId` null on everybody,
  `npm run demo:performance` stopped on a `ForbiddenError` at the first
  objective. That is the guard working; the fix belonged in the seed.
- **`Finance approver` gained `APPROVE_LOANS` and `APPROVE_EXPENSES`.** The role
  held `APPROVE_PAYROLL` alone, so the persona named "Finance approver" could not
  approve a staff loan — `/payroll/loans` offered a button the API refused. The
  three are the same act (releasing money) and belong together; what the role
  must never hold is `RUN_PAYROLL`, which is the half that *prepares*.

### `scripts/demo-company.ts` writes what the company has *done*

New, ~1,300 lines, shaped on `demo-performance-cycle.ts` and separate from the
seed for one reason: reference data is fixed, an operating history is measured
from today. It is anchored on the real clock, so "waiting 2 days" stays true —
the drift `lib/today.ts` records for demo mode does not apply to a mode with a
database in it.

It drives the **services** wherever a guard exists — loans, expenses, assets, the
exit, the payroll run, the payment batch — so every refusal a person would meet
applies. It writes tables directly only where the table carries no rule beyond
its own shape.

Three decisions in it worth not undoing:

- **Attendance covers every working day of every period a payroll is prepared
  for.** `unpaidDaysFor` counts a working day with no clock-in as unpaid, so
  partial coverage prorates every salary towards zero. That is the bug that paid
  a whole company ₦0; the script's header says so and the coverage is not an
  accident. The current month is deliberately left without a payroll run, because
  preparing a month that is not over counts every remaining day as an absence.
- **Nothing is marked paid.** `submitBatchToProvider` refuses with no provider
  registered and that refusal is correct. The batch stops at APPROVED with its
  instructions PENDING, which is exactly where a real company stands the moment
  before somebody downloads the bank file. A green "Paid" against money nobody
  moved is the failure this product is sold against.
- **An absence is a missing row, not a row saying nothing happened.** A row with
  a null clock-in would make the timesheet claim somebody was recorded as not
  turning up, which is a different fact.

What it produces: 589 timesheet rows, leave at four statuses, overtime at three,
one loan being repaid and one waiting, expenses at all four, documents and three
document requests, nine assets with one damaged return, a verbal warning, an
onboarding checklist part done, two requisitions with somebody in every pipeline
stage plus scorecards and an offer awaiting approval, a published advert with four
public applications, five tickets against a live SLA clock, an exit `IN_PROGRESS`
with the equipment line deliberately open, two payroll periods — one approved and
batched, one left in review to be approved by hand — and three remittances at
three states. Three of ten people declare rent, so the run's
`rent_relief_unclaimed` warning names the other seven, which is the only way any
of them find out.

## "Could not load" is gone, and so is the status code behind it

Thirty-two screens each carried their own version of this:

```tsx
<Callout tone="danger" title="Could not load the audit log">
  {trail.error.message}
</Callout>
```

Both halves were wrong in front of a real reader. *"Could not load the audit
log"* is a **restatement of the blank space** — the reader can see nothing
loaded; what they need is what to do. And `error.message` was whatever came
back: `toApiError` in `lib/api/client.ts` defaulted to
`` `Request failed with ${response.status}.` `` for any response that did not
carry the API's own error envelope — a gateway page, a proxy timeout, an HTML
error from a load balancer. **A status code, on screen, to a payroll clerk.**

- `components/portal/load-failure.tsx` is new and is the one place that sentence
  is written. The title says what is missing; the body says what to do, chosen by
  the **class** of failure, because that is the granularity at which the advice
  differs. `ApiError.status` still carries the number and it does not reach a
  screen.
- Where the API wrote a sentence about *this* refusal — 400, 403, 409, 422 — it
  is shown verbatim. It knows which permission is missing or which field is
  wrong; nothing on the client does. Paraphrasing a server message locally is how
  the two stop agreeing, which is the rule the performance screens already
  follow.
- `fallbackMessage(status)` in `client.ts` replaced the status-code string, and
  the two network-failure sentences now say what to check.
- `/people/[id]` keeps its own copy (`recordFailureDetail`) because it renders an
  `EmptyState` rather than a `Callout` — there is no partial page to put a banner
  on.

**An empty read is not a failure and must not render this.** "No timesheet rows
yet" and "the timesheet did not load" are opposite facts, and showing the second
for the first is the same class of mistake as rendering 0 for an absent figure.

### What was deliberately left alone

The ~40 write-path fallbacks reading `error instanceof ApiError ? error.message :
"Something went wrong. Try again."`. The `ApiError` branch is the server's own
sentence and the fallback only fires for a non-`ApiError` throw, where there is
genuinely nothing to say beyond "try again" — and with the status-code string
gone, neither branch can now put a number on screen. Rewriting forty confirmed
strings inside a connect-and-verify pass is a copy decision, not a defect.

## The frontend gate was red on committed code, again, and for the same reason

`npm run lint` reported **977 errors** — 578 of them inside
`.claude/worktrees/festive-snyder-3212ef`, a linked git worktree with its own
`.next` build output. `.git/info/exclude` hides it from git and from nothing
else, and that file is local and uncommitted, so it cannot be the fix. `.claude/**`
is in `eslint.config.mjs`'s `globalIgnores` now — the committed counterpart, the
same fix `.prettierignore` got in the API repo one session earlier for the same
class of failure in the same directory.

That is twice. **If a gate reports errors in files you did not write, check for a
worktree before reading a single one of them.**

## Verified

Backend `npm run check` in parts, real exit codes read from `$?` on their own
line: `tsc --noEmit` 0, `eslint src prisma scripts tests` 0, `format:check` 0
(after formatting the two new files), `vitest run` **0 — 46 files, 1233 tests**.
A second `vitest run` came back 1 on a **5000ms timeout** in
`tests/imports.test.ts`, a file this change does not touch; `npx vitest run
tests/imports.test.ts` alone is 28/28 in 1.46s. That is contention, by this
file's own rule, and the rule earned its place — chasing it would be chasing the
browser walk that was running at the time.

Frontend: `npm run check` and `npm run build` green.

Against the live API, signed in as the seeded administrator: every GET the API
exposes (158 of them, ids resolved from the seed) answered 2xx, and every app
route rendered with real data and no 4xx or 5xx in the network log.

**One thing that is honestly labelled rather than fixed:** `/hiring`,
`/hiring/interviews` and `/hiring/offers` show "Demo data, this browser only"
**while connected**, and that is correct. There is no API for the internal ATS —
`/careers` covers public adverts and applications, and there are no
`requisitions`, `candidates`, `applications`, `interviews` or `offers` endpoints
for the pipeline those three panels render. The badge is telling the truth. The
module is the next substantial piece of work, and a screen that says which half of
itself is real is better than one that does not.

## How somebody sits down and tests this

```bash
brew services start postgresql@17                     # once per boot
cd /Users/mac/Documents/Schulltech/approvehr-api && npm run demo && npm run dev
npm run dev
```

Open `http://localhost:3000`, and the sign-in screen states the accounts:
`amara.nwachukwu@schull.io` (Administrator) or `grace.effiong@schull.io` (Payroll
analyst), password `approvehr-dev-2026`. Both verified present in the database
with an argon2 hash and their role, and the screen's copy matches
`SEED_PASSWORD` in `prisma/seed.ts`.

The one thing worth doing first: `/payroll` has last month prepared and left in
review, with its exceptions readable and an Approve button that has never been
pressed against a real database.

---

# The importer is a framework now, and required columns lead

The product owner's rule is that **anywhere a user can add several of something,
there is a bulk upload with an Excel template.** `ImportKind` already has four
members and one implementation, so the next three were going to be three more
copies of a 700-line checker, a 1,400-line four-step screen and a router. This
change extracts the machine from the employee importer without changing what the
employee importer does: **one machine, many column dictionaries.**

## What a new importable entity is now

On the API — `src/modules/imports/`:

| File | What it holds |
|---|---|
| `columns.ts` | `ColumnSpec`, `Dictionary`, `buildDictionary`, the heading matcher, `parseDate`, `parseMoneyKobo`, `templateOf`. **No entity in it, and no column name in it.** |
| `entity.ts` | The `ImportEntity` contract, the per-row report types, `CheckOptions`, `fingerprintOf`, `MAX_ROWS_PER_BATCH`. |
| `service.ts` | The generic driver: `validate`, `apply`, `list`, `get`, the batch record, the fingerprint refusal, the count sentence, the registry. Employee-named wrappers at the bottom for the ETL and the tests. |
| `router.ts` | **One route trio per registered entity**, mounted from `ENTITIES` in a loop. There is no employee-specific line in the file. |
| `employees.ts` | The employee dictionary, `checkEmployees`, `writeEmployees`, and the `ImportEntity` that binds them. |
| `schemas.ts` | The zod request shapes, which are the same for every entity, plus the re-exports the ETL imports by name. |

On the frontend:

| File | What it holds |
|---|---|
| `lib/imports/spec.ts` | The same `ColumnSpec` / `Dictionary` / `buildDictionary`, the two parsers, `orderColumns`. |
| `lib/imports/mapping.ts` | The matcher, every function taking a dictionary. |
| `lib/imports/check.ts` | The browser check as a **generic engine**: required-presence, the declared date and money cells, then the entity's own `rowRules`. |
| `lib/imports/template-file.ts` | The CSV and workbook writer. Already had no column names; now has no entity either. |
| `lib/imports/surface.ts` | `ImportSurface` — the screen's description of an entity: title, breadcrumb, where the records live, where its prerequisites are created. |
| `lib/imports/employees.ts` | The employee dictionary and its row rules. Replaces `lib/imports/template.ts`, **which is deleted**. |
| `components/imports/*` | The four steps, moved out of the route and parameterised. `ImportFlow`, `MatchColumns`, `CheckReport`, `ImportResult`. |
| `lib/store/imports.ts` | `useImport(dictionary)`. `useEmployeeImport()` is one line at the bottom. |

`app/(app)/people/import/` is now `page.tsx`, a six-line client boundary, and
`surface.ts`. **That is the whole cost of an importer**: a dictionary, a surface,
and a validate/apply pair.

## Required columns lead, and the order is derived rather than written down

The dictionary declared its four — five, in fact — required columns scattered
through thirty-three, so the sheet a customer downloads opened on
`employee_no, first_name, last_name, middle_name, email, phone, date_of_birth…`
and the fields they cannot leave out were spread across the width of Excel.

`buildDictionary` now orders every dictionary **required, then recommended, then
the rest**, stable inside each tier, and it is the only way to make a
dictionary — so the template writer, the matching dropdowns, the checker and the
API's own response all read one ordered list and none of them can be handed a
list that has not been through it. The declaration keeps its readable grouping by
subject; the emitted order is computed. A dictionary that grows a required column
gets it in the right place without anybody remembering to move it.

Done in both copies **by construction**, which is what makes it true of the one
that answers: the API's `GET /imports/template/employees` now returns
`first_name, last_name, job_title, start_date, gross_monthly` first, then the
five recommended, then everything else.

**`employee_no` therefore no longer leads the sheet** — it leads the optional
block, and the comment on the spec that said "the template asks for it first"
now says why it does not. It is still the match key and the screen still says
what you lose without it.

`scripts/verify-template.ts` gates the derivation rather than a list — every
required column before every recommended one, the header opening on
`REQUIRED_FIELDS` in order, and `employee_no` still first inside its tier. 26
assertions became **34**.

## Two copies of the dictionary, and now a check instead of a sentence

`lib/imports/employees.ts` mirrors the API's dictionary, and its header has
always said "if you change the API's dictionary, re-copy it here". A sentence is
not a gate, and the API's copy is the one that answers — so drift shows up as a
column the offline screen offers as "do not import".

`verify-template.ts` now parses `EMPLOYEE_COLUMNS` out of
`approvehr-api/src/modules/imports/employees.ts` **as text** — the same trick
`verify-payroll.ts` uses for the tax schedules, because this package cannot
resolve that tree — and asserts the same columns, the same required set, the same
recommended set and the same date/money declarations. It skips when the sibling
repo is not checked out. Tamper-tested: flipping one `required: false` to `true`
in the API fails it, and restoring passes.

## `ColumnSpec.cell` — a declared cell type, not a validation language

`{ kind: "date" }` and `{ kind: "money", zeroAllowed, subject }`, declared on the
column. Three things read it:

- `dateOf` / `moneyOf` on the API **throw** when a checker reads a column the
  dictionary has not declared that way. So the template's `accepts.dates`, the
  column's note and the parser cannot drift apart, and `annual_rent`'s
  "zero is a declaration" rule lives on the column instead of at a call site.
- The browser's generic engine drives its whole date-and-money pass off it.
- It **travels in the template payload**, so the browser and the API cannot hold
  two opinions about which columns are dates.

Deliberately *not* a general validation language. Word lists — employment type,
status, gender — need a different message and a different severity per field, and
encoding that would be a template nobody can read. They stay in the entity's
`rowRules`, which is allowed to be prose. `ColumnSpec.templateExample` travels
the same way, which is what moved "DELETE THIS ROW" out of a hardcoded map in the
file writer and into the declaration.

## Things that changed shape on the wire, and one that did not

- **`missing` is a map now**, not two named fields: `{ departments: [...],
  salaryGrades: [...] }` is the same JSON it always was, and the check report
  renders one callout per key from the surface's `prerequisites`. An entity with
  three such lists gets three callouts without editing the screen.
- **`accepts` is a loose record**, because what vocabularies an entity has is its
  own business. Nothing branches on it; the screen prints it.
- **The apply response is unchanged**, `managersLinked` included. An entity's
  writer returns `extra`, the driver spreads it flat, and `ImportEntity`'s third
  type parameter is what keeps `scripts/etl/migrate.ts` reading it typed.

`GET /imports/template/employees`, `POST /imports/employees/validate` and
`POST /imports/employees/:batchId/apply` are all still exactly those paths — the
router builds them from the entity's slug, and the templates are registered in
their own loop first so `/template/employees` can never be read as a batch id.

## `buildDictionary` refuses an ambiguous dictionary

Two specs claiming one heading used to be settled by declaration order — "first
spec to claim a key keeps it". That made the *order of the list* part of the
matching rules, so reordering it for the template could silently move a column's
meaning. Since the order is now derived, the ambiguity has to be refused instead:
a duplicate alias across two specs **throws at module load**. Checked first that
the employee dictionary has none, so this is a guard rather than a migration.
Within one spec, alias order is still priority — `job_title` still beats
`position`.

## What deliberately did not change

- **Every message, every refusal and every count sentence.** The checker was
  *moved*, not rewritten: `employees.ts` was assembled from the existing sources
  by a script whose every edit is an asserted string replacement, so the prose a
  customer reads is byte-identical. The employee legend is supplied by the entity
  rather than taken from the generic one for the same reason.
- **`CheckOptions.requireEmployeeNo` is still a function argument**, threaded
  through the entity's `check` and never a request field. The standing rule holds:
  `src/modules/imports/` has two callers with different contracts, and relaxing a
  rule there means running `tests/etl.test.ts` as well.
- **The order of errors within one row** moved slightly on the frontend, because
  the generic engine runs the declared cells in dictionary order and then the
  entity's rules, where the old hand-written pass interleaved them. Which errors
  a row gets is identical; the sequence they are listed in is not. Cosmetic, and
  the API is the authority in connected mode anyway.

## Verified

Backend `npm run check` — the gate CI runs, exit code read from `$?` on its own
line: **0. 46 files, 1233 tests**, `tests/imports.test.ts` 28/28 and
`tests/etl.test.ts` unchanged. (HANDOVER's earlier entry says 28 for the import
suite; the brief for this change said 29. 28 is the real number, before and
after.)

One run of it came back 1 with three failures in `tests/careers.test.ts`, a file
this change does not touch: a 5000ms **timeout** on the first, and two 400s
cascading from the record it never created. That is the flake this file's own rule
names — a timeout is contention, a failed assertion is a defect — and the rule
held: `npx vitest run tests/careers.test.ts` alone is 33/33, and the next full run
is 1233/1233 at exit 0. Three API dev servers and a browser session were on the
same machine at the time.

Frontend `npm run check` exit 0 — typecheck, lint, 87 titles, type scale,
contrast, payroll 51, CSV 101, **template 34**, loans 28. `npm run build` exit 0
at 87 routes.

Over `curl` against the live API: the reordered template payload, the `cell` and
`templateExample` declarations arriving on their columns, and a three-row
validate returning row-keyed errors, the `departments` prerequisite, the unmapped
`religion` column, a generated `AHR-0011`, the flagged list, and every note.

**In the browser, connected**, on `/people/import` with a five-row CSV whose
headings are `Employee ID / Surname / Date of Employment / Monthly Salary / State`
and a `Religion` column we do not import:

- step one showing the five required and five recommended columns as chips, "The
  other 23 columns are optional", and the past-imports table
- step two matching 10 of 11 with `Religion` left out, and the dropdowns listing
  the fields in the new order
- step three: 2 to add, 3 not importing, six errors each naming *their own*
  heading, the in-file duplicate email caught on row 4 naming row 1, the
  10-digit-NUBAN warning that imports anyway, the "Important: 2 people are
  missing a detail" list with `AHR-0011 · number generated`, and the button
  reading "Tick the box above to carry on"
- a correction typed in place → "1 correction not checked yet", the row badge
  flipping to "Fixed — check again", the primary action becoming "Check the
  correction", and the re-check clearing that row's error
- step four reading **"Add 2 people, leave 3 out"**

And then the three things HANDOVER has recorded as never exercised in a browser,
walked for the first time: the **apply** (2 added, 0 updated, "Reporting lines
set 0", the three rows named with their reasons), and the **retry loop** ("Fix
those 3 now" → step two with "This will check 3 rows, not the whole file").
Console clean apart from Next's HMR socket.

The two employees that import created — `EMP-7001` and the generated `AHR-0011` —
and the three test import batches were deleted from the demo database afterwards.

**Not exercised:** demo mode in a browser, because the API was up and
`useApiReachable` correctly reports connected. The offline engine is covered by
`verify-csv.ts`'s 101 assertions plus an ad-hoc run proving its three notes
(ambiguous date, "inactive" read as suspended, employment_type versus work_type)
still come out of the new `rowRules` / `fileNotes` hooks, and that a written `0`
in `annual_rent` still counts as a declaration rather than a missing detail.

## Deliberately not done

- **A second entity.** Pay components, attendance and leave balances are the
  three `ImportKind` members with no importer, and building one now would be
  guessing at columns nobody has specified. The framework is the deliverable; the
  next dictionary is a separate piece of work with a product conversation in it.
- **Rewriting the API's checker into declarative rules.** Its interesting half is
  a question about the database — does that department exist, is this person
  already on file, does the pay fit its grade — and no declaration answers that.
  `check` is a function on the entity for that reason, and the parts that *are*
  declarable moved to the dictionary.
- **Folding `lib/imports/employees.ts` into the API's copy.** Two copies is still
  one too many and still deliberate: the first two steps of an import must work
  with no database. What changed is that the drift is now gated instead of
  described.

---

# Demo mode cannot exist in a production build

The owner's instruction was: *"Remove 'Demo data, this browser only' or anything
that signifies this is demo, I don't want these artifacts anywhere when we go
live."*

Read literally that is the most dangerous change in this file's history. Those
badges label **invented local data**. Demo mode serves seeded salaries,
fabricated NUBAN account numbers and a persona list out of `localStorage`, and
the badge is the only thing on the screen saying whose numbers those are.
Deleting the label and leaving the mode running would have the product present
made-up figures as the company's own — which is the exact defect the audit in
`PARITY.md` catches the incumbent doing, and worse than any badge.

So the badges are not what was removed. **The mode was.** In a production build
there is no demo store, no seeded personas, no fallback — and therefore nothing
left for a badge to label.

## The mechanism, and the version of it that silently did nothing

`DEMO_ENABLED` is a **compile-time literal with no import**: an ambient global
declared in `src/lib/demo.ts` and substituted by `compiler.define` in
`next.config.ts`. Every `if (DEMO_ENABLED)`, `DEMO_ENABLED ? SEED : []` and
`{DEMO_ENABLED && <Callout …/>}` becomes `false && …` in the source the minifier
sees, and the branch — strings, seed arrays and all — is dropped.

**The first attempt exported it as a `const` from `src/lib/demo.ts`, and that
folded nothing.** Every guard was correct, every screen behaved correctly, and
the production bundle came back with `a.DEMO_ENABLED&&"demo"===e.source&&…` still
in it — carrying every seeded salary, every fabricated bank account and every
"Demo data, this browser only" string. Turbopack keeps the module boundary and
will not propagate a constant across it. If you find yourself tidying this into
a normal export, that is the bug you are re-creating, and `verify-demo` is what
will tell you.

`NEXT_PUBLIC_DEMO=off` makes a development build render exactly what production
will. It can only ever *remove* the demo, never add one.

## `npm run verify-demo` — two halves, and only one of them proves anything

`scripts/verify-demo.ts`, wired into `npm run check` **and** into CI after the
build step:

1. **Source check** (always) — every banned phrase in `src/` sits in a file that
   mentions `DEMO_ENABLED`, so a new unguarded badge fails here rather than in
   production. This half only proves a string is *capable* of being folded.
2. **Bundle check** (when `.next` holds a production build) — greps the built
   client and server chunks for the phrases themselves. **This is the half that
   is worth anything**, and it is the half that caught the `const`. It skips with
   a message on a dev-only `.next` rather than passing quietly, because a pass
   there would mean the opposite of what it says.

`TRUE_IN_PRODUCTION` in that script is a short allowlist of sentences that carry
a banned phrase and are *true in a production build* — the employee draft's "In
this browser only. It will not be here on another device." Local drafts are a
real production feature and that sentence is the whole justification for not
building a server-side one. Banning it would delete a true warning to satisfy a
grep, which is the same mistake as deleting the badges and keeping the demo.

## What a production build now does with no API

`components/portal/auth-gate.tsx` shows **`Unreachable`**: "Cannot reach the
server", what to check, and a Try again button. Not a blank screen, and not a
demo. The persona picker, the "Development seed accounts" card and the "Demo
mode" badge are all behind the flag.

`lib/store/session.ts` is the root of it: the offline restore, `signInOptions()`
and `signInOffline` are gated, so `mode` can only ever be `"api"` and **no
store's demo branch is reachable** — which is what makes the other forty-odd
stores safe without each having been rewritten. `can()` no longer answers true
for everything, because there is no demo session to answer for.

## What is empty in production, and what that means

Gated seed payloads: `lib/mock/*` (personas, attendance, hiring, payroll
distribution, roles, workflows, announcements, demo payslips) and the
module-scope seeds in `store/{assets,audit,conduct,documents,features,grades,
helpdesk,knowledge,leave-api,loans,notifications,payments,performance,
reimbursements,shifts,webhooks}.ts` plus `store/demo-structure.ts`. Derived
exports (`LEAVE_ENTITLEMENTS`, `DOCUMENTS`, `RUN_PEOPLE`, `ATTENDANCE`) empty
themselves.

`CURRENT_USER` is now typed **`Employee | undefined`** rather than `Employee`.
It was `EMPLOYEES[5]`, which with an empty seed is `undefined` while the type
said otherwise — a lie the compiler would have helped keep, and `CURRENT_USER.id`
would have thrown on the first read. Its four callers are all demo store paths
and each now says what it does without one.

`session.actingId` falls back to `""` rather than the seed persona. It matches
nobody, so a "mine" filter returns nothing instead of somebody else's rows —
which is the honest answer, since `employeeId` is only null for an account with
no staff record behind it.

## The real finding: the internal ATS has no API at all

This is the thing to act on rather than the thing that was fixed.
`/hiring`, `/hiring/interviews`, `/hiring/offers`, `/hiring/requisitions/[id]`
and `/hiring/candidates/[id]` render the pipeline board, interviews, scorecards
and offers from `lib/mock/hiring.ts`. There are **no endpoints** for any of it —
`/careers` covers public adverts and applications and nothing else. Those panels
pass `live={false}` outright, which is why an earlier entry in this file records
them showing "Demo data, this browser only" *while connected*, correctly.

With the seed gated they are now **empty in production**, and the honest label is
the only thing standing between that and a screen that looks broken:
`sourceNote(false)` returns **"Not available yet"** in a production build.
"Live from the API" there would have been a wrong claim about rows that do not
exist. Every other `SourceBadge` in the app is `live={true}` in production, so
this reads correctly everywhere it appears.

**That is a label on a gap, not a fix for it.** The ATS is the next substantial
piece of work, and until it exists those five routes show empty panels saying so.
The alternative — shipping fabricated candidates with real-looking phone numbers
— is what the owner just told us not to do.

## Also worth a look, and out of scope here

- **`/design-system` ships to production.** It is an internal token showcase and
  it carries example personas and a fabricated pension PIN (`PEN100482913`). Not
  demo *mode*, so `verify-demo` says nothing about it, but it is an internal
  artifact on a public build.
- **`store/webhooks.ts` sample payloads** and the import template's example row
  use seeded persona names. Both are real production features (an example
  payload, a template's "delete this row"), so both were left alone.
- **Doc comments explaining a demo branch were kept.** The branch still exists in
  a development build; deleting its explanation would make the code worse rather
  than cleaner, and comments do not survive minification anyway.

---

# A company can switch PAYE, pension and NHF off, and the payslip says so

`OrgFeatures.taxSetup` and `pensionSetup` already existed and only ever decided
whether the **employee form asks for** a TIN or an RSA PIN. The engine computed
PAYE, pension and NHF regardless — so a Nigerian SME with no pension scheme, or
one whose staff file their own returns, got a payroll that was wrong in a way
that looked perfectly plausible: 8% off every salary, remitted to nobody.

## The switches live on `PayrollSettings`, not on `OrgFeatures`

`payeEnabled` is new; `pensionEnabled` and `nhfEnabled` already existed there and
already reached the engine. That table is the right home for all three because it
is what `engineSettingsFrom` reads and what the approval snapshot freezes. Putting
PAYE-off on `OrgFeatures` while pension-off sat on `PayrollSettings` would have
been incoherent.

They are **not** coupled to the field-group flags, and the asymmetry is the
interesting part: somebody who files their own return still has a TIN — that is
how they file — so switching PAYE off must not stop the form asking for one.
`GET/PATCH /payroll/settings` is new (`MANAGE_PAY_STRUCTURE` to write,
`VIEW_SALARIES` to read); there was no endpoint for payroll settings at all
before, which is why the settings screen could not reach the engine.

## Absent is not zero, and this is the third time

`ComputedPayslip.operates` is a required `{ paye, pension, nhf }` of
`"DEDUCTED" | "NOT_OPERATED"`, and every renderer reads it before an amount:

- **`DEDUCTED`, ₦0.00** — computed and came to nothing. Lawful and common: the
  first ₦800,000 a year is exempt, so ₦60,000 a month pays no tax.
- **`NOT_OPERATED`** — there is no figure. Nothing to print, nothing to remit,
  no schedule to file.

`PayrollRun` records the three as columns **at prepare**, not at approval, so a
stored `paye = 0.00` is readable years later and switching PAYE back on in
September cannot put tax on an August payslip. The approval snapshot carries
`deductions` taken from the **run**, not from the live settings row — flip a
switch between prepare and approve and a snapshot built from settings would
claim the run deducted nothing while every payslip on it has tax on it.

The payslip document suppressed the pension line on `amountKobo > 0`, which
conflated the two: a person whose pay prorated to nothing had their pension line
vanish as though the company had no scheme. It gates on the operation now, a
genuine nil prints as a nil, and a not-operated deduction is **named in a
sentence under the column** — absent from the arithmetic, stated in words,
because a ₦500,000 salary taking home ₦500,000 needs the explanation.

## Nothing is refused, and nothing is silent

PAYE deduction is an employer obligation under the Personal Income Tax Act and a
pension scheme is compulsory at fifteen employees under the Pension Reform Act
2014. Refusing the configuration would push a customer we intend to serve back to
a spreadsheet, so `statutoryNotices(settings, headcount)` in the engine is the
**one copy** of what switching one off means, and three callers render it
verbatim: the settings form beside the switch, the setup wizard under the answer,
and every payroll run as a WARNING on the list somebody reads before releasing
money. A switch is decided once; a payroll is decided every month.

`STATUTORY.pensionHeadcountThreshold` is 15, and the notice names the company's
real headcount against it — or states the rule without a figure when it has none,
because a confident "0 people" is the same mistake one level down.

`missing_pension_pin` is now gated on pension being operated. "The pension
schedule will be incomplete" is a false claim on a payroll with no schedule, and
a warning about a remittance that does not exist teaches people to ignore the
list.

## Two more wizard questions, appended and never inserted

`TOTAL_STEPS` is 7. `setupStep` is a forward-only number meaning "answered up to
here", so renumbering an existing question would claim a company had answered one
it never saw — new questions go on the end whatever the tidier reading order
would be. Five decide which modules exist and cost nothing to get wrong; two
decide what the engine computes, and their "No" carries the API's own consequence
sentence on screen **before** the click.

`GET /setup/wizard` now returns `payroll` — what the company deducts today, or
**null** where it has no settings row — so the wizard can mark the option it is
already on. Null is unknown, not "everything on": marking "Yes" from a default
would tell somebody they had answered a question nobody asked.

## `/payroll/statutory` no longer offers to file what was never deducted

Each group is gated on what the company deducts, and a group that is off is
replaced by a sentence naming the body and why there is nothing for it — never an
empty schedule with a Download button. A nil return you had no obligation to make
is worse than no return. NSITF is deliberately not gated: the Employees'
Compensation Act is an employer contribution and has nothing to do with the three
payslip deductions.

## Only three settings on `/settings/payroll` reach the engine, and it says so

"What you deduct" is API-backed through `lib/store/payroll-deductions.ts` and
saves on the switch. Everything else on that screen is still
`usePayrollSettings`, which is localStorage. That split is deliberate rather than
half-finished — a switch that looks saved and moves no payslip is the same failure
as a green "Paid" against money nobody transferred, while a working month kept in
one browser is merely local. The pension and NHF sections lost their own
`enabled` switches: two switches for one decision is how a screen starts
disagreeing with itself.

The effective settings are **derived every render** from the local draft plus the
API's three switches, never synchronised into state — that would be a `setState`
in an effect, and the preview has to quote what a real run will do.

## Demo mode

The wizard's two answers persist to `DemoState.deductions` (payload **version 2**),
`/settings/payroll` reads them so the two screens cannot disagree, and the write
is refused there with the reason. `settingsMatchFixture` now compares all three
switches, so switching one off in demo mode makes the run raise its existing
`demo_settings_changed` BLOCKER instead of printing figures that contradict the
settings screen. `demo-payslips.ts` gained `paye: { enabled: true }` — the
emitter writes it and `verify-payroll` asserts it, because a fixture generated
with PAYE off would be a completely different set of numbers wearing the same
filename.

## Verified

Backend `npm run check` exit **0** — 50 files, **1330 tests**, including
`tests/payroll-deduction-switches.test.ts` (22: pension off raising PAYE because
the relief went with it, PAYE off with relief and taxable pay absent rather than
zeroed, all three off with net equal to gross, a computed nil kept apart from an
absent one, the notices' wording and headcount handling, the run's operated
columns, the pension-PIN warning disappearing, the frozen snapshot, and the same
switch not reaching another organisation) and four updated cases in
`tests/setup.test.ts`.

Frontend `npm run check` exit **0** (typecheck, lint, 88 titles, type scale,
contrast, payroll **52**, CSV 101, template 34, loans 28) and `npm run build` exit
**0** at 88 routes.

In the browser, **demo mode**: the wizard at "Question 6 of 7" and "7 of 7" with
both consequence paragraphs rendered, the "Now" marker moving onto "No — staff
handle their own tax" after answering and `payeEnabled: false` in storage with
`taxSetup` untouched; `/settings/payroll` reading "Pension and National Housing
Fund · 1 switched off"; `/payroll` refusing the whole run with
`demo_settings_changed` while PAYE was off and coming back to 10 payslips when it
was restored; `/payroll/statutory` dropping the two PAYE rows and three pension
rows, stating why for each, and recomputing the total to ₦3.3m over what is
actually filed.

**Not exercised: connected mode.** No API was running on this machine. The wire
shapes are covered by the 22 backend assertions above. Two console errors seen
during the walk (`DEMO_ENABLED is not defined` and a parse error in
`people/import/surface.ts`) were another agent's in-flight edits, not this change.

## Deliberately not done

- **A row on the `/settings` checklist hub.** `GET /setup/checklist` returns
  facts and would need a new field plus a judgement about whether "we do not
  deduct PAYE" is something to nag about — it is a decision, not an omission, so
  it is not a to-do. The hub already links to `/settings/payroll`.
- **Converting `usePayrollSettings` to the API.** It is read synchronously from
  inside four other stores, so doing it here would put loading states into the
  attendance and overtime screens. The three switches that had to reach the
  engine do; the rates still do not.
- **Generating real `StatutorySchedule` rows.** Nothing writes that model yet.
  What this change fixes is which bodies appear, which is the half that was
  making a wrong claim.

---

# The demo gate could not see a fabricated record, and that is what shipped

The entry above closes with two items under "Also worth a look, and out of scope
here": `/design-system` shipping a fabricated pension PIN, and `store/webhooks.ts`
sample payloads using seeded persona names. Both are closed now, and finding out
why they survived turned up five more of the same thing.

## What was actually in the production bundle

Built with `NEXT_PUBLIC_DEMO=off` and grepped, which is the only way any of this
is knowable:

| Value | Where it came from |
|---|---|
| `PEN100482913` | `/design-system`, as a definition-list value |
| `PEN100234567` | the import template's example row, in **both** dictionaries |
| `PEN100000000` | the add-employee wizard's pension-PIN placeholder |
| five seed personas | `/design-system`, sixteen lines of it |
| `Grace Effiong` + `grace.effiong@schulltech.com` | `store/audit.ts` |
| a whole fabricated payment history | `store/payments.ts` — `SEED_BOOK` |
| `Tunde Bakare` | `store/reimbursements.ts`, a default inside a helper |

Three fabricated RSA PINs and a payment book with batches, instructions, a ledger
and approver names, in a build with no demo mode in it.

## Why `verify-demo` passed the whole time

It looks for demo-mode **copy** — "Demo data, this browser only" and eleven
similar phrases. Every value above is an ordinary component prop or an ordinary
seed array. The check was not weak at what it did; it was answering a different
question, and its own header says the bundle half is the only half that proves
anything. It proved the badges were gone and nobody had asked it about the data.

## Four things that each looked like the fix and were not

Worth reading in order, because three of them are the kind of thing that gets
committed with a confident message.

1. **`notFound()` at the top of the page.** Stops the render. The chunk is still
   written to `.next/static` and still fetchable, so every value is still
   published — a gate on the *route* is not a gate on the *payload*.
2. **`next/dynamic` around the demos.** Same outcome, measured rather than
   reasoned about: the build emitted the chunk anyway. Lazy is not absent. This
   was tried, built, grepped, and found to have changed nothing.
3. **Gating the declaration's consumer.** `store/audit.ts` has a gated `SEED` and
   two ungated `const`s holding the actors it attributes entries to. **A separate
   `const` does not fold just because everything that reads it does.**
4. **Asking whether the file mentions `DEMO_ENABLED`.** This is how the first
   version of the new check let `store/payments.ts` through: two of its seeds are
   gated, a third was not, and a file-level question answers "gated" for all
   three. The unit that folds or does not is the **declaration**.

## The fix, in two halves

**Values that have no business being persona-shaped are not.** The design system
shows Example Alpha through Example Echo and a PIN of `PEN000000000` — a real
PIN's length, all zeroes, so the layout demo is still honest and nothing can be
mistaken for a record. Same for the wizard placeholder and both copies of the
import template's example row. This half needs no bundler cooperation, which is
why it leads: it is true however the thing is chunked.

**Values that are genuinely demo data are gated at the declaration.**
`SEED_BOOK`, `DEMO_DELIVERIES`, `DEMO_CATALOGUE`, and the two actors in
`store/audit.ts`. `DEMO_CATALOGUE` became `CatalogueView | null` rather than an
invented empty catalogue: its one consumer already returns `CatalogueView | null`,
and an empty events list would be a claim that the API publishes no events.

## The marketing illustrations have their own roster now, and that is the load-bearing part

This is the decision to read before undoing anything here.

The marketing mockups are hand-drawn SVG illustrations of the product on the
public site. They are not records, they claim nothing about any reader's data, and
they were shipping the **same six personas as the seed directory**. That coincidence
is what made the whole class unenforceable: a built chunk cannot tell you which
file a name came from, so as long as one legitimate surface shipped the seed's
names, a seed persona in a production bundle could always be explained away — and
`verify-demo` would have needed an allowlist that exempted those names everywhere,
which is no check at all.

So they have their own six: Chioma Aduba, Segun Adeyemi, Obinna Ezeh, Kemi
Balogun, Zainab Yusuf, Folake Adisa. Plausible Nigerian names, the same register
the site argues in, **none of them on the seed roster**. Nothing about what those
pages claim has changed. What changed is that a seed persona in the built output
is now unambiguous, which is what lets the bundle check run with no allowlist.

**Do not put a seed name back into a marketing file to save a rename.** That is
the change that quietly turns the gate off.

## `npm run verify-demo:build` — the reason nobody was verifying this

Proving the bundle is clean means a production build, and a production build lands
on `.next`, which is what `next dev` is serving from. So verifying the demo gate
killed the dev server every time, and verifying got skipped. That is the whole
reason seven fabricated values accumulated behind a passing check.

`next.config.ts` takes its build directory from `NEXT_DIST_DIR`, and the script
puts a production build in `.next-verify`, restores the `tsconfig.json` that Next
rewrites on every build, and runs the check against it. One command, no
interruption, `.next` untouched. Verified: dev server answering 200 throughout,
`git diff tsconfig.json` empty afterwards.

## What the check does now, and which half proves anything

Three sections in `scripts/verify-demo.ts`:

- **Demo copy in source** — unchanged. Says a phrase is *capable* of folding.
- **Demo copy in the bundle** — unchanged, and skips loudly on a dev-only `.next`
  rather than passing quietly.
- **Fabricated records** — new. Seed personas, read out of `lib/mock/people.ts`
  itself so the list cannot go stale, plus a credential-shape regex. Source side
  is per **declaration**, with the seed as the only allowlisted file. Bundle side
  has **no allowlist at all**, and covers names as well as credentials.

Tamper-tested in all three directions, each restoring to exit 0: an ungated
persona in `lib/cn.ts` (exit 1, named), a `PEN123456789` added to a file that is
gated *elsewhere* (exit 1, named — the case the first version missed), and a
persona appended to a built chunk (exit 1, named).

The credential regex excludes an all-zero PIN by its digit class rather than by an
allowlist. A placeholder that reads as a placeholder is the point.

## Verified

`npm run check` exit **0** — typecheck, lint, 88 titles, demo, contrast, type
scale, payroll 52, CSV 101, template 34, loans 28. `npm run verify-demo:build`
exit **0**.

Independently grepped, not taken from the script: a production build with
`NEXT_PUBLIC_DEMO=off` contains **zero** occurrences of all three PINs, all six
formerly-leaked personas, `grace.effiong@schulltech.com`, and `PAY-202607-1`,
across `.next-verify/static` and `.next-verify/server` with maps excluded — and
does contain the marketing roster, which is the control proving the grep works.

## One more gate that went red on files nobody wrote

Third time in this file. `npm run check` reported **496 errors and 7592 warnings**
— `require()` imports, `@ts-ignore`, `__turbopack_context__` — and 565 of the 567
offending files were in `.next-verify`, because `eslint.config.mjs` ignored `.next`
and not the new directory. It is `.next-*/**` now.

The standing rule from the two earlier instances held exactly: **if a gate reports
errors in files you did not write, find out which directory they are in before
reading a single one of them.**

## Deliberately not done

- **The comments naming seed personas** in `performance/now.tsx`,
  `lib/reference/lists.ts` and `globals.css`. Comments do not survive
  minification — checked, including the CSS, where no built stylesheet carries
  one — and each explains a real incident. Deleting the explanation to satisfy a
  grep is the mistake `lib/demo.ts` warns about one level up.
- **The seed's own personas and PINs.** They are gated, the bundle check proves
  they are absent, and demo mode is what they exist for.

---

# The audit is done, and `read()` was never once the right answer

The entry above ends by saying the other twelve stores "were not audited here"
and that `employees.ts` "has always been written from screens that also read
it." Both were reasonable and both are now closed — the first by doing the work,
the second by being wrong in a way worth recording.

## The headline: there were no render reads to preserve

The expectation going in was a judgement call per call site — leave the reads,
convert the writes. What the audit actually found is that **all 98 `.read()`
calls in `src/lib/store/*.ts` were write paths. Not one was a render read.**

The reason is structural rather than lucky, and it makes the rule mechanical:
a render read never *calls* `read`. It hands the function to
`useSyncExternalStore(store.subscribe, store.read, store.getServerSnapshot)` as
a bare reference and React calls it. There are 44 of those and they were correct
already. So:

> `store.read` is render. `store.read()` is a bug. The parentheses are the whole
> distinction.

All 98 are `current()` now. There is no `.read()` call left in the directory and
no judgement call left in the rule.

## `scripts/verify-stores.ts`, because nothing else can see this

Wired into `npm run check` as `verify-stores`. Every gate in this repo exists
because something invisible to `tsc` went wrong, and this is the worst of that
class so far: both functions are correctly typed, both are individually correct,
lint has no opinion, the build is green, and the only witness is a browser with
something already in `localStorage` — which is the state a developer's browser
is *least* often in, because the fastest way to test a store is to clear it.

Two rules:

1. **`read` may be referenced, never called.** With a `read-for-render` escape
   hatch on the line or the line above, so that adding a genuine render read is
   a sentence somebody writes rather than a check somebody deletes. There are
   none today.
2. **`current()` never appears in render** — not inside a `useMemo`, and not in
   the immediate body of an exported hook (depth 1 inside its opener, which is
   render by definition).

Tamper-tested four ways, each on a real file: reintroducing a `read()` call
fails; the escape hatch excuses it; `current()` in a `useMemo` fails;
`current()` in a hook body fails. Restored, and green.

**What it cannot see, stated because a model that omits a case cannot catch a
failure on it:** rule 2 covers the two constructs this codebase renders through.
It will not catch `current()` inside a plain helper that a hook body then calls
during render. That needs a call graph.

One trap found while writing it, worth knowing if you edit the script: the
*continuation* lines of a `/* … */` block start with neither `*` nor `/`, so a
leading-marker test is not a comment test. The first draft reported the prose in
`departments.ts` as a violation. It strips comments properly now.

## Four real defects, not just a rule tidy-up

### 1. The offboarding fix was half-applied — in the store the entry above is about

`demoUpdateTask` and `demoVerifyTask` still found their exit through
`store.read()` while the `replace()` they both call had been moved to
`current()`. That combination is worse than either mistake alone:

- a task on an exit that exists only in storage came back **"That task could not
  be found"**, because the find ran against the seed;
- a task on a *seed* exit was computed from the seed's ticks and then written
  over the stored ones by a `replace()` that could see them — so previously
  ticked tasks silently reverted.

The store the previous session declared fixed was the one still carrying the
bug. A find-and-replace would have caught it; a per-store judgement call did
not, because the store had already been judged.

### 2. `demoDepartmentName` refused departments that plainly existed

`demo-structure.ts`'s seam for the record page's department picker. Its caller is
`useEmployeeMutations`, which subscribes to the **employee** store and never to
this one — so with `read()` the lookup ran against the seed and refused every
department created in this browser with *"That department does not exist."*

Latent in practice only because `/people/[id]` also happens to render
`useDepartments()`. One screen that picks a department without listing them and
it fires.

### 3. `assertNameFree` checked the seed

`permissions.ts`'s duplicate-role-name refusal, computed from `read()` inside the
create path. Structurally identical to the duplicate-exit refusal that started
all this: a guard that cannot see the rows it is guarding against is not a guard.

### 4. `useKbSearch` destroyed article votes on `/help`

The one place the bug **fires today**, and the one this was proved on. Recording
a failed search joins the "backlog" — a write to `approvehr.knowledge.store` from
a hook that never subscribes to it. `/help` mounts `KbSearch` and nothing that
reads that store. So the write was computed from the seed and persisted, taking
the `votes` key with it.

Measured, before and after, in demo mode:

| | `votes` | `misses` |
|---|---|---|
| voted on an article | `{"p-02\|kba-payslip":"helpful"}` | `{}` |
| then searched on `/help`, with `read()` | **`{}`** | only the new one |
| then searched on `/help`, with `current()` | preserved | both, accumulated |

That is not a hypothetical about a future screen. It is a person telling the
product an article helped them, and the next thing they typed erasing it.

## `employees.ts` is on the factory now

The entry above predicted this store was safe because it "has always been
written from screens that also read it." That is still true of every current
caller and it is not why the store is safe — it is why nobody had noticed. It
had no `current()` to reach for and nowhere to put one, which is a store one
screen away from the same bug with no fix available. So it moved rather than
growing a second `hydrate()`.

Two things the move fixed for free:

- the old `subscribe` set `hydrated = true` **before** the microtask and with no
  `typeof window` guard, so a server render reaching it would have marked the
  module hydrated and stopped the browser from ever loading storage;
- there was no version field, which is what stranded payloads when
  `created`/`archived` arrived.

`get()` stays a render read and now takes the subscribed snapshot instead of
calling `read()` twice while memoising on `[overrides, created]` — the same
answer with the `exhaustive-deps` suppression removed, which is what leaves this
file with no `read()` call at all.

### `createPersistedState` gained `legacy`, and it is deliberately narrow

This store's payload was a bare `StoreState`; the factory expects `{ v, data }`.
Every existing demo browser would have had its directory emptied on load —
which, in a change whose entire subject is writes that silently discard stored
data, would be its own joke.

`legacy` is called **only when `v` is absent**, which means the payload predates
the envelope and its *shape* is unchanged. A payload that has a `v` and does not
match is still dropped, so the discard rule the factory documents is intact for
actual version bumps. `employees.ts` recognises its own old payload by the three
arrays rather than by "it parsed", so a key holding something else is dropped
rather than spread over the state.

## Two stores audited and found immune, for a reason worth reusing

- **`lib/payroll/use-settings.ts`** — also predates the factory, also has its own
  hydration copy, and has **no read-then-write path at all**: `save(next)` takes
  a whole `PayrollSettings` and replaces. A write that does not merge cannot
  merge stale data. Left alone.
- **`lib/store/session.ts`** — `set()` is a whole-value replace, and the one place
  it reads `cache` (`signOut` checking `mode` to pick a path) is reachable only
  from a signed-in UI, which has subscribed by definition. Left alone, and its
  documented reason for not being on the factory still stands.

## Live versus latent, honestly

Only `useKbSearch` could be *proved* to fire today. Everywhere else the screen
happens to mount a reader alongside the mutation hook, so the bug is latent.

That is not reassurance, it is the point. These fifteen hooks never subscribe to
the store they write — `useKbSearch`, `useRaiseTicket`, `useHolidayMutations`,
`useShiftMutations`, `usePayrollActions`, `useTeamMutations`,
`useKpiMutations`, `useObjectiveMutations`, `useReviewMutations`, `useSignOff`,
`useLoanActions`, `usePaymentActions`, plus `demoDepartmentName`,
`demoUpdateTask` and `demoVerifyTask` — and each is safe purely because of what
else the screen mounting it happens to render. That is exactly the state
`offboarding.ts` was in for months before `/people/[id]` grew a button. Splitting
a component, adding a route, or moving a dialog is enough.

## Verified

`npm run check` exit **0** (typecheck, lint, titles, contrast, typescale,
**stores**, payroll, CSV 101, template 26, loans 28+600). `npm run build` exit
**0**, **86 routes**, **114/114** prerendered — unchanged, nothing silently
dropped.

In the browser, in demo mode, signed in as Tunde Bakare. Each walk is: write on
one page load, **full reload**, write again, and assert the first value survived
— which is the only sequence that can tell these two functions apart.

| Store | What was walked |
|---|---|
| `knowledge` | the before/after table above, both directions, including reverting the line to `read()` to reproduce the loss and restoring it |
| `employees` | seeded the **pre-envelope** payload → "LEGACY PAYLOAD TITLE" rendered in the directory and on a record page; an unrelated edit then re-wrote the payload as `{v:1,data:…}` **keeping** the legacy override beside the new one |
| `demo-structure` | created "Internal Audit" on `/people/departments`; on a fresh load of `/people/p-03` the picker offered `dept-mt42zdui-1` and saving resolved it to the name — the path that used to refuse |
| `offboarding` | recorded an exit from the record page, then on a **fresh load** got the refusal verbatim — *"Chidi Nwosu already has an exit in progress (waiting for their manager). Open that one instead of starting a second."* — with the first exit intact and no second one written. Then `demoUpdateTask` and `demoVerifyTask` across three page loads: 5 tasks done, 2 confirmed, accumulating, with the other exit untouched |
| `onboarding` | `p-08` `[o1,o2,o3,o4]` → `+o6` across a reload |
| `approvals` | `ap-01` then `ap-05` across a reload |
| `leave` | `lv-01` then `lv-02` across a reload |
| `holidays` | "FIRST HOLIDAY" then "SECOND HOLIDAY", both present, 13 dates |
| `company` | `rcNumber` then `tradingName` across a reload |

**Not walked individually:** `assets`, `attendance`, `conduct`, `helpdesk`,
`notifications`, `overtime`, `payments`, `payroll`, `performance`, `permissions`,
`reimbursements`, `shifts`, `teams`, and the write paths in `departments`. Their
edits are the same one-token substitution as the nine above, they are covered by
`verify-stores` and by `tsc`, and the two mechanisms they rely on are the two the
nine walks exercise. Somebody adding a write to one of those screens should still
do the reload check.

**Connected mode was not exercised.** No API was reachable — port 8000 answers on
this machine but refuses CORS from the dev server's port. None of this touches
the connected path: every changed call site is inside an `if (!isConnected)`
branch or a demo-only helper.

**One environment note, not a finding about the app:** the preview pane's
screenshot coordinate frame drifts from the page on screens with an inner scroll
container, so some clicks landed nowhere until they were dispatched on the
elements directly. Same React handlers, same store code — but the visible-click
verification of a few steps was done that way rather than through the pane.

## Two things found and deliberately not changed

- **`--check/` is a committed directory**, 59 tracked files, and it is a
  generated marketing export — somebody ran `npx tsx scripts/export-marketing.ts
  --check` and the script took the flag as its output path. It is not this
  change's to delete, but nothing should be reading it.
- **`.claude/launch.json` gained `"autoPort": true`** so a second session can run
  the dev server while another holds 3000. Revert it if 3000 is ever required
  for a callback.

---

# A PAYE state was still blocking an import, after the fix that was supposed to end it

An earlier session made `taxState` optional on the single-employee create path
and thought that closed it. It did not: `checkEmployees` still refused a row
outright — `fail("taxState", "A PAYE state is required...")` — whenever the
company had no default anywhere, which for the bulk importer is *every* row,
because `taxState` was never a matchable spreadsheet column in the first place
(see below). A company with no default PAYE state therefore could not import a
single person, and the product owner's own words were exactly that: *"I still
had errors when uploading the file and I cant move forward."*

## The actual fix, end to end

- **`Employee.taxState` is nullable now** (`prisma/schema.prisma`, migration
  `20260824150000_employee_tax_state_optional`), on the same footing as
  `grossMonthly`. The doc comment on the column explains why this is safe: PAYE
  itself is one national schedule (`payroll/engine.ts`'s bands are selected by
  date, never by state), so a person with no state anywhere is taxed exactly
  correctly — only the *filing* is incomplete, and that is a `payroll/prepare`
  question, not a create-time one.
- **`employees/service.ts#create` no longer throws.** `taxState = input.taxState
  ?? (await organizationTaxState(db)) ?? null` — was a 422 when neither existed,
  is a plain `null` now. `tests/employees.test.ts`'s
  "refuses when neither..." became "still creates when neither..." and asserts
  `taxState: null` on a 201, not a 422.
- **`payroll/service.ts#prepare` raises `missing_tax_state` as a WARNING**,
  gated on `settings.payeEnabled`, in the employees `select` clause that was
  missing the column entirely. Same severity and reasoning as
  `missing_pension_pin` — unlike `missing_bank_account`, nothing about what the
  person is paid or what is deducted changes.
- **`imports/employees.ts#checkEmployees`'s `fail()` for the "no value, no org
  default" case is gone.** The `fail()` for a *named but unresolvable* state
  (a genuine typo) is untouched — that is still a real data error. `taxState`
  moved into the `compact({...})` spread rather than being a required
  top-level write field, and `ImportedEmployeeWrite.taxState` is `string?`.

### The thing that made this confusing to verify: `taxState` was never a spreadsheet column

`EMPLOYEE_COLUMNS` — the dictionary that answers `/imports/employees/validate`
— has never declared a `tax_state` `ColumnSpec`. It only exists inside
`MIGRATION_ONLY_COLUMNS`, which `ETL_EMPLOYEES` adds on top of `EMPLOYEES` and
only `migrate.ts` reads (`CheckOptions.dictionary`, the same "two callers,
different contracts" shape as `requireEmployeeNo`). So a bulk upload can never
carry a PAYE state per row — it always falls back to the organisation's
default, or nothing. That was true before this fix and is true after it; what
changed is only what happens when the fallback is also nothing. Confirmed by
diffing `EMPLOYEE_COLUMNS`' field list against the frontend's mirror in
`web/src/lib/imports/employees.ts`: identical 29 fields, so there was no drift
to reconcile — the frontend was never missing anything.

The `missingOrgTaxState` callout in `check-report.tsx` still claimed rows "are
being skipped" for it, which stopped being true the moment the `fail()` came
out. Reworded, and the tone dropped from `danger` to `warning`:
*"Rows below with no `tax_state` cell will still import — their tax is
deducted correctly either way. Only the state filing for it is left
incomplete..."*

## Verified

Backend `npm run check` exit **0** — 55 files, **1380 tests**.
Frontend `npm run check` exit **0** (typecheck, lint, 89 titles, demo, contrast,
type scale, stores, payroll, CSV 102, template 34, loans).

Against the live API, with `schull`'s `taxState` cleared by hand: `POST
/imports/employees/validate` on a row with none of the recommended columns
came back `toCreate: 1`, `errors: []`, `missingOrgTaxState: true` — applied,
and the created row's `taxState` was `NULL` in the database, not a fabricated
default. Row and batch deleted afterwards, organisation restored to `Lagos`.

# The missing-details list now opens on what actually stops a payday

Closing the other half of the same complaint: *"any main required field should
come first in a 2-step process where all the required come first and second
step all the optional."* Scoped to the Fixes step's "Missing details"
sub-step specifically (confirmed with the product owner rather than guessed —
the Match-the-columns step was the other candidate and was not it).

## `Recommendation.important`, declared once, read by both repos

The ten-odd recommended employee fields are not one kind of gap. `grossMonthly`
and `bankAccount` are the two `payroll/service.ts` raises as a **BLOCKER**
(`missing_pay`, `missing_bank_account`) the moment a run actually reaches
them — nobody gets a payslip without them. Everything else recommended
(`pensionPin`, `tin`, `annualRent`, `email`, `addressLine`, `nin`,
`stateOfOrigin`, `lgaOfOrigin`) is a **WARNING** at most, or never checked by
payroll at all — a schedule or a filing is incomplete, the person is still
paid the right amount.

That distinction is now `Recommendation.important?: boolean`
(`imports/columns.ts` and its frontend mirror `imports/spec.ts`), set `true`
on exactly those two fields in both dictionaries, and carried per missing item
on the wire as `MissingField.important` / `ApiMissingField.important` — the
same channel `why` already travels on, not a client-side guess re-derived from
field names. `lib/imports/check.ts`'s offline engine sets it from the same
declaration, so demo mode and the API cannot disagree about which tier a field
is in. `departments.ts` and `assets.ts`'s importers pass `important: false` for
everything they recommend — neither pays anybody, so nothing in either
qualifies.

## `check-report.tsx`'s `Flagged` component splits by field, not by person

A row can have both kinds of gap (missing an account number *and* an email),
so the split is per missing item, not per row — the same person can appear in
both tiers, each time showing only the items that belong there.

- **"Needed to pay them"** is where the sub-step opens, when it has anything in
  it — required leads, as asked. Its own line under the header says why:
  *"A payroll run cannot pay these people at all without one of these — set it
  now, or exclude them from a run until it is there."*
- **"Add later"** is where the single acknowledgement checkbox and the
  sub-step's Continue button live — unchanged wiring, `acknowledged` is still
  one boolean, reset on every re-check exactly as before. If nobody has an
  important gap, this is the only tier and it opens here directly; if nobody
  has a later gap, the checkbox renders on the important tier instead of a
  "Next" button.
- A `SegmentedControl` between the two (Match-the-columns' own filter control,
  reused) lets somebody jump straight to "Add later" — deliberately not
  locked behind visiting "Needed to pay them" first, because nothing here is a
  gate on anything else. "Required first" is the default landing, not an
  enforced order.

No new acknowledgement state, no change to `lib/store/imports.ts`'s five reset
call sites — the split is presentational over the same `RowLine[]`, computed
with two small `useMemo`s (`importantOnly` / `laterOnly`) in `check-report.tsx`
alone.

## Verified

Backend `npm run check` exit **0**, unchanged counts (the `important` field is
additive on the wire). Frontend `npm run check` exit **0**, including
`verify-template`'s cross-repo column-set assertion.

In the browser, connected, against `schull` with its PAYE state cleared: a
two-row CSV of nothing but the four required columns, matched, checked,
landing on "Missing details" already open to **"Needed to pay them (2)"**
showing only `gross_monthly` and `account_number` per person; **"Next: what can
wait (2)"** advancing to **"Add later (2)"** with the other eight fields per
person and `gross_monthly`/`account_number` correctly absent from it; the
checkbox appearing only there; ticking it enabling Continue. Confirmed over
`curl` first, independent of the UI: the validate response's `missing[]`
carries `important: true` on exactly `grossMonthly` and `bankAccount`, `false`
on the rest. Test batches deleted and the organisation's PAYE state restored
afterwards.

---

# Five smaller things, all fixed in one pass: dropdowns, a button, a
paragraph, and where a payroll exception actually sends you

## The template's dropdown-worthy columns are real Excel dropdowns now

The product owner's rule that removed `employment_type`, `work_type`,
`status`, `pension_provider` and the rest from the spreadsheet importer
(`MIGRATION_ONLY_COLUMNS`'s own header) is **"remove any field that requires
a dropdown and can introduce errors."** That rule is still right, and it does
not cover the three fields that stayed: `gender`, `state_of_origin` and
`pay_frequency` are each a **fixed, universal** vocabulary — nobody's own
data, nothing to reconcile against a company list — which is exactly what
the header says did *not* need removing. Give those three a real dropdown
cell and the "less errors" the product owner actually asked for is closed
for the columns that are still here, with nothing reopened that was
deliberately taken away.

`ColumnSpec.dropdown?: readonly string[]`, declared once per column in both
dictionaries (`approvehr-api/src/modules/imports/employees.ts`,
`web/src/lib/imports/employees.ts`), travels in the template payload the
same way `cell` and `templateExample` already do, and reaches
`buildTemplateFiles` through `TemplateColumn.dropdown`.

**The Nigerian states alone rule out an inline list.** Excel caps
`formula1="\"A,B,C\""` at 255 characters and the 37 states are past it, so
every dropdown here is a **range reference** to a new hidden `Lists` sheet —
one column per dropdown field, written at template-build time, never opened
by a person. `xlsx.ts` gained `SheetSpec.hidden` and `SheetSpec.validations`
on the writer side, and `XlsxSheet.hidden` / `XlsxSheet.dataValidations` on
the reader side, so `verify-template.ts` can prove the round trip rather than
assert that a column merely looks selectable. **Independently cross-checked
with openpyxl** — a completely separate implementation — reading the built
file back: `state_of_origin` → `Lists!$A$1:$A$37`, `gender` →
`Lists!$B$1:$B$3`, `pay_frequency` → `Lists!$C$1:$C$1`, `Lists` sheet
`hidden`, all 37 state names present and correctly ordered.

`buildDictionary`'s vocabulary section (`NIGERIAN_TAX_STATES`,
`GENDER_WORDS`, and friends) had to move **above** the column declarations in
both dictionaries — it was defined after them, which only worked because
nothing previously referenced it from inside a `ColumnSpec` literal at
module-load time. `GENDER_OPTIONS` is `[...new Set(Object.values(GENDER_WORDS))]`
rather than a second hand-typed list, so the dropdown's three options cannot
drift from what the checker actually accepts.

`verify-template.ts` grew from 34 to 42 assertions, including a new
cross-repo one (`"and the same columns get a dropdown"`) parsed out of the
API's source as text, the same trick the others already use.

## "Open record" now opens the record at the field the exception named

`fixFor` in `lib/api/payroll.ts` had two working cases
(`missing_bank_account`, `missing_pension_pin`) and a `default` arm that
sent everything else to a bare `/people/{id}` — the Personal tab, regardless
of what was actually wrong. Two gaps closed:

- **`missing_tax_state`** → `?tab=pay&field=taxState`. Was always answerable,
  just never wired.
- **`missing_pay`** → `?tab=employment&field=grossMonthly`. This one needed
  more than a new `case`: `grossMonthly` lives on the **Employment** tab, not
  Pay & statutory, and only the pay tab's `EditableSection` was passing
  `openOnField` at all. `record.tsx`'s employment-tab section now does the
  same `tab === "employment" && focusField` gating the pay tab already had.
- **`overtime_awaiting_approval`** had no employee to link to at all — it is
  a count across the whole run — and so had never had a fix link, not even a
  wrong one. `fixFor` now answers this one *before* the `employeeId` gate,
  pointing at `/people/overtime` rather than a person's record.

`rent_relief_unclaimed`, `tax_schedule_unconfirmed` and
`no_attendance_all_period` were looked at and left alone: the first two are
run-level facts about several people or no person, and the third names a
person but has no single field to send them to — a human has to look, not a
form to fill in. Verified live: nulled a real employee's `grossMonthly`,
recalculated, clicked "Set their pay," and landed on the Employment tab with
Gross monthly focused rather than the Personal tab; cleared a pension PIN and
confirmed the sidebar item, separately, below.

## The Pension PIN/TIN callout moved from the page's headline to its sidebar

`/people/[id]`'s `payrollAdvisory` Callout — "Recommended, but not
pay-blocking" — used to be the first thing rendered in the main column,
above the tabs, in the same size and weight as the genuine blocker beside
it. The whole point of splitting `payrollGapsFor` into `payrollBlocking` /
`payrollAdvisory` was that a missing TIN and a missing bank account are not
the same kind of fact; rendering both as page-headline callouts undid that
distinction visually even though the data already carried it.

`payrollAdvisory` now renders inside the identity rail's first `Card`, under
the completeness meter, as a compact icon-and-label list — no separate
Callout, no paragraph of `consequence` text competing with the record itself
for attention. `consequence` is not gone, just no longer forced onto the
page: it is a `title` attribute, one hover away. `payrollBlocking` is
untouched — a missing bank account still gets the loud red callout at the
top, because it is still the one fact that actually stops a payslip.

## A pre-payroll checklist, inline, never a redirect

The run wizard's Period step reads `useSetupChecklist()` — the same hook
`/settings` itself answers from — and renders "Before you run this": what
you deduct decided, a default PAYE state set, everybody has a bank account,
everybody has a pension PIN (only asked about when the company requires
one), the company has a payout account on file. Every row states a fact and
offers a link; nothing here navigates on its own, and declining every link
changes nothing about what Calculate does next. `facts.pay.hasPrimaryBankAccount`
is skipped entirely rather than shown as a false "no account" when it is
`null` (offline) — absent, not a wrong claim, the same rule everywhere else
in this file.

Verified live: cleared the organisation's PAYE state, confirmed the row
flipped from a green check to an amber warning with a "Set it" link and the
description recomputed ("1 thing worth sorting first…"), restored it,
confirmed all five rows read green again.

## The `size="lg"` button contrast bug — found already fixed

Investigated as a live bug and found the fix already on disk, uncommitted:
`SIZES.lg` in `components/ui/button.tsx` used to include `text-body`, and
`text-body` is the **colour** utility (`--color-body`, dark slate grey), not
the size — the same Tailwind v4 name collision this file's accessibility
section already documents. It was silently clobbering white text on every
coloured `size="lg"` button. The setup wizard's "Go to the dashboard"
button, on the completion screen, was the reported instance. Confirmed live:
`getComputedStyle` on that exact button reads `color: rgb(255,255,255)` on
`background: rgb(43,57,144)` — white on the ApproveHR blue, correctly.

## Bank-account-name verification: not buildable, and said so rather than faked

The product owner asked whether the API can show an account holder's name
immediately after an account number is typed, the way a bank transfer
confirmation screen does. It cannot, and nothing in this codebase pretends
otherwise: there is no NUBAN-resolution integration anywhere, no provider
credential scaffolded in `.env.example` or `src/config/env.ts`, and
`Employee` has no `accountName` column to hold a resolved name even if there
were. The bank **picker** already exists and is well-built
(`lib/reference/banks.ts`, 255 NIBSS-capable banks from Paystack's public,
credential-free bank list) — it is specifically the name-resolution call
that is missing, and that half needs a signed-up provider before it can be
code. The existing seam pattern (`payments/provider.ts`'s `useProvider()` /
refuse-rather-than-fake shape, documented above under "Capabilities we
cannot perform") is what a real integration should follow once one is
credentialed. Nothing was built here, on purpose — inventing a fake account
name would be exactly the kind of thing this file's own rules exist to
prevent.

## One thing found and deliberately not touched

`record.tsx`'s Employment-tab `EditableSection` throws "Invalid UUID" on
`departmentId` and `workLocationId` when either is saved while showing "Not
assigned" / "Not set" — discovered while restoring test data after the
`missing_pay` verification above, not caused by anything in this pass. Left
alone: it is a pre-existing bug in a form this change only added one prop
to, and chasing it here would have been solving a problem nobody asked
about instead of the five they did.
afterwards.

---

# Performance opens on the period, and the assistant can be found

The product owner's words: *"the entire current performance module is very
confusing especially the current flow in terms of layout arrangement and the
many options"*, and — separately — *"I need you to explain how we use AI here
too, I didn't see a single AI element."*

Both were right, and the second one is the more interesting failure.

## Two different things were called "Approvals"

The tab whose id is `now` was labelled **Approvals**. `/performance/approvals`
is a different screen — the objective agreement queue, titled "Objectives to
agree". One word, two things, one module, and a notification linking to one
could land somebody on the other.

The tab's own doc block, two hundred lines above the label, had always called it
*"what is open, what is waiting on you, what is waiting on somebody else"*. The
string had drifted away from the documentation sitting beside it, which is worth
knowing about as a class: nothing in `tsc`, lint or a test can see a label
contradicting the comment that explains it.

It reads **Overview** now. **The id stays `now`** so every `?tab=now` link
written before the rename still resolves — the label was what was wrong.

`/performance/approvals` **survives as a route**, deliberately, against the
tidier reading. The reason is already in this file: it is a queue somebody
reaches from a notification with one job, and folding it into a tab lands that
notification on a screen about something else. The overview surfaces the same
queue as a task row reading one `useObjectiveApprovals()`, so both cannot drift.

## The module opened on a list, not on the period

`periods` was the default tab. So `/performance` gave you a list of periods and
no answer to "where is this up to" — that was two more clicks — and `periods` is
gated on `canManage || canSeeCompany`, so **staff hit a fallback on every single
load**.

`app/(app)/performance/period-status.tsx` is new and puts four figures on the
landing:

| Cell | Numerator | Denominator |
|---|---|---|
| Self-reviews | `forms.selfIn` | `forms.people` |
| Manager reviews | `forms.managerIn` | `forms.managerIn + forms.managerOutstanding` |
| Marks final | `marks.finalised` | `marks.people` |
| Signed off | `marks.acknowledged` | `marks.finalised` |

Every figure comes from `GET /performance/cycles/:id/report`, which already
returned all of them. **Nothing is computed on the frontend**, for the reason
the report and history screens already record: a second implementation of a
score is how two screens end up disagreeing about the same person, and
`performance-report.test.ts` asserts the identities these satisfy.

### The manager denominator is not the headcount, and the demo proves it

`forms.managerOutstanding` counts **reviews** still to come in, not people —
`performance/service.ts` says so where it is computed, because somebody with two
appraisers and one answer contributes 1 to it rather than 0.

The seeded company has ten people and `noReview: 1`, so the honest reading is
**5 of 9** and `forms.people` would have said 5 of 10. Not a hypothetical: it
was wrong in the first dataset it was pointed at.

### Three absences, and none of them is a zero

- **No permission.** `useCycleReport`'s `enabled` is `EDIT_RECORDS`. An employee
  gets no strip, not four zeroed cells — that would be a claim about a company
  they are not allowed to read.
- **Offline.** The report refuses in demo mode for the reason `useCycleRegister`
  gives. The strip is absent; the work list under it is untouched.
- **A cell with a zero denominator.** Sign-off before any mark is final reads
  "No mark is final yet", never "0 of 0". *Nobody has signed off* and *nothing is
  ready to sign off* are different facts, and this is the same rule as
  `operates: NOT_OPERATED` on a payslip.

## The assistant was invisible, and — the actual defect — undiscoverable

This is the part worth reading, because "it's off" was not the problem.

The assistant **is** built and mounted in three places: suggested objectives
under a company goal (`goal-dialogs.tsx`), a drafted progress note from a typed
headline (`kpis.tsx`), development areas from competencies below target
(`review-form.tsx`). All three render nothing, because
`components/performance/suggestions.tsx` does `if (checking || !available)
return null;` and no `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` is set.

**That rule is right and was not changed.** A button that is present and always
refuses teaches people the product is broken.

What was wrong: `useAssistantAvailable` had **exactly one consumer in the entire
frontend** — that same file. So no card, no row, no sentence anywhere told an
administrator that an assistant existed, that it was off, or that there was a
key to switch it on. `ApiAssistantStatus.assistant` even carried a comment
saying *"for a settings screen"*, and there was no settings screen.

That is the company-logo defect exactly, and it is now the third instance: a
feature present, correct, and findable by nobody. **A thing you cannot find is a
thing you do not have.**

`/settings/ai` is the fix — what it does, whether it is on, which model answers,
and what is sent to it. **No field for the key**, because the credential is read
at boot: a box that looks like it saves one and does not is the same failure as
a green "Paid" against money nobody moved. `useAssistantAvailable` gained
`reason` for it.

**Standing rule this leaves behind:** if a capability is hidden by "absent, not
disabled", something else has to say it exists. The rule and the discoverability
are two different jobs and the first one does not do the second.

## A period, drafted from a paragraph

`/performance/periods/new`, and two new `SuggestionKind`s — `period_goals` and
`period_questions`. The first kinds that start from nothing: the other three all
start from a record that already exists.

- **Two calls, not one.** `parseSuggestions` returns a flat list, so one call
  carrying goals *and* questions would need a discriminator on every element.
  They also fail differently and should: a period with drafted goals and
  hand-written questions is a period.
- **`periodGrounding` is one function behind both**, asserted, so they cannot
  drift into describing two different companies.
- **These two carry `MANAGE_SETTINGS` and the other three carry no permission.**
  `modules/ai/router.ts` argues at length that the gate should be the underlying
  read, and it is right for the three that narrow to a goal or an employee. A
  period draft takes **no subject** — nothing narrowed by the caller — so a
  read-gate has nothing to check. `MANAGE_SETTINGS` is what
  `POST /performance/cycles` already needs.

### The target rule is in the type, not only in the prompt

A measure with an invented figure is not a suggestion; it is the number the
whole period is judged against, and a model cannot know whether ₦40m is
ambitious or already banked. The prompt says so twice — and it is not relied on:
`CreateKeyResultBody.targetValue` is **required**, so a measure with no figure
cannot be created at all. Every suggested measure arrives with an empty box and
whatever the model put in `fields` is not read.

The review screen **names** the measures being left out rather than dropping
them quietly.

### Edits are a diff, not a copy — and why that was not a style choice

The obvious shape is one `useState` holding the edited list, seeded from the
draft when it arrives. That seeding has to happen somewhere and both places are
wrong: during render it is a `setState` in the render phase, and in an effect it
is the cascading render `lib/store/my-record.ts` was restructured to remove.

So the draft is derived during render and state holds only what was typed over
it — `store/employees.ts`'s overrides pattern, one module along. Nothing has to
be seeded, so nothing has to decide when to seed it.

## Three defects the browser found and no type could

- **`EXCEPTION_CODE_SUMMARY` did not pluralise.** A company with one unassigned
  person read **"1 people have no appraiser yet."** on the first screen of the
  module. Defensible while it only rendered inside a table somebody had gone
  looking for; not on a landing page.
- **The wizard rendered its form before the assistant status arrived**, then
  replaced it — under somebody who might already have typed the period's name in.
  `useAssistantAvailable`'s header makes this argument about a Suggest button
  appearing late; here it was the whole screen.
- **Nothing linked to the wizard.** Building the route and leaving it unreachable
  would have been the logo defect a third time in one change. `StartPeriodDialog`
  offers it now, and only when an assistant is wired.

## Verified

Frontend `npm run check` and `npm run build` exit 0, **97 routes**, both new ones
prerendered. Backend typecheck, lint and `prettier --check` on `src/` exit 0;
`ai-suggestions.test.ts` 75 passing, full suite 1892/1893.

The one failure was `Parse Error: Expected HTTP/` in `tests/employees.test.ts` —
a **transport** error, in a file another session was editing at the time, which
passed 35/35 alone. Contention, by this file's own rule, and the rule held: the
cheap first move separated it in one command.

Against the live API as the seeded administrator: the four cells match the report
read over `curl` and worked out by hand, the exception callout names one person,
`/settings/ai` reports Off with the reason, and the wizard refuses honestly with
both escape routes.

**Not exercised:** demo mode in a browser, and the wizard with a real key. The
strip's absence offline is structural — `useCycleReport` returns `report: null`
when not connected and the component returns `null` on that — rather than walked.

## Deliberately not done

- **Deleting `/performance/approvals`.** Reasoned above.
- **Renaming the `now` tab id.** The label was the defect; changing the id would
  break every existing link for a string nobody reads.
- **Written-review coaching**, which would flag language describing a person
  rather than their work before a manager sends a review. Offered and not chosen.
  It is the highest-value guardrail left in this module and it protects the
  defensibility argument the whole thing is sold on.
- **The cascade, competency and weight steps of the wizard.** All three have
  their own screens on the period already, and thin versions inside a wizard
  would be three surfaces to replace later.

---

# Language a mark could not be defended on

The last of the four AI options offered in the performance rebuild, and the only
one that turned out not to be AI at all.

## Why this is not the assistant, and could not have been

The brief was a model call: read the manager's draft, flag language describing a
person rather than their work. It is not, because of a promise made two changes
earlier: **`/settings/ai` and the DPA both state that no written appraisal
comment leaves the platform.** A model-based coach sends a manager's written
judgement of a named colleague to a third party, and would have made that
sentence false the day it shipped.

That constraint turned out to improve the feature rather than limit it:

- It works with **no credential**, which is the state the product is in today
  and the state most companies start in. Every other AI surface here is dark
  until somebody sets a key; this one is not.
- It is instant, so it runs while somebody types rather than at the end.
- It quotes **the exact phrase**. "This reads as judgemental" is an opinion to
  argue with; "you wrote *Tunde is quite disorganised*" is a fact to act on or
  dismiss in a glance.

**Standing rule:** before reaching for the assistant, check what the product has
already promised about where text goes. `src/lib/performance/review-language.ts`
is deterministic because a published document says it has to be.

## What it flags, and the one nobody asks for

Character-not-conduct, absolutes, comparison to a colleague — and **protected
characteristics**, which is the category with money attached and the reason to
keep this feature. Nigerian law makes it more than a style note: section 42 of
the Constitution, the Labour Act, and the Discrimination Against Persons with
Disabilities (Prohibition) Act 2018 all bear on it, and the National Industrial
Court hears claims in which the written record *is* the evidence.

Ethnicity is listed by name in `SENSITIVE_WORDS`, because a generic "do not
mention ethnicity" catches nothing. The list is a prompt to look, not a filter
to trust, and it says so.

## Precision is the half that decides whether anybody keeps reading it

The character rules require a **person as the subject**. `slow`, `negative` and
`difficult` are all ordinary words about a piece of work — "the Lagos migration
was difficult" is correct English and correct management. "He is difficult" is a
sentence about a person. `verify-review-language` asserts the false-positive
half as heavily as the true-positive half, because a checker that flags half a
page is one people learn to scroll past, and then it protects nothing while
looking like it does.

`late` and `absent` are deliberately **not** traits: those are facts about
attendance with rows behind them.

## It never blocks, and the button says what the next press does

First press of Send shows the findings and does not send. Second press sends,
and the label reads **"Send anyway"**. The API accepts the review either way and
so must the form — refusing what the server allows is the rule this codebase
keeps restating.

`FINDINGS_CAVEAT` renders with every list and admits the limit in as many words:
four rules cannot tell whether a review is fair. A checker presenting itself as
a verdict gets argued with; one presenting itself as a prompt gets read.

Self-reviews are exempt. This asks whether a judgement of somebody **else**
would survive scrutiny, and an employee mentioning their own maternity leave is
a disclosure they are entitled to make.

## Three defects, and the third is the instructive one

- **`are` was missing from the copula**, so every plural was invisible. "They
  are unprofessional" is the single most likely sentence this exists to catch
  and it was the one form that could not match.
- **Contractions had nowhere to go.** "She's arrogant" carries its own verb and
  the pattern demanded a second one, so most of how people actually write
  slipped through.
- **Names were not matched at all.** The first draft knew pronouns only, on the
  written grounds that matching a name would mean threading it in from the form.
  The very first sentence typed into a real review was *"Chidera is quite
  disorganised"* and it sailed straight through.

That third one is worth keeping in mind as a class: a documented reason for a
limitation is not evidence that the limitation is acceptable. The comment
explaining why names were excluded made the gap **harder** to see, not easier —
it read as a decision rather than a hole. Threading the name in was one optional
argument.

## Where the "ten screens" catalogue actually stands

An earlier entry recorded that ten screens display a company-configured figure
without linking to the setting that decides it. Re-derived while looking for
work: **the list is shorter than that and several are already done.**
`performance/how-it-works.tsx` and `people/leave/holiday-calendar.tsx` both link
already; the leave entitlement was fixed in `3a9e81c`.

The remaining genuine one is the payslip, which quotes pension and NHF rates,
and it is not obviously worth a link: its reader is usually an employee, who
cannot change them, so the control would be absent for almost everybody who sees
the figure. Left alone deliberately rather than swept, and the count corrected
here so nobody else goes looking for ten.

---

# A payroll can be adjusted by hand, and one of the four is not like the others

Four requests in one session, and the first thing worth recording is that **the
first of them already existed**.

## "Let us have a way to manually change the tax"

`PayrollTaxOverride` was already built, committed and wired end to end — model,
engine parameter, service, routes, and an "Enter manually" link in the PAYE
column of the payslip table. The product owner could not find it for two
reasons, neither a bug:

1. it is on the **Review** step and he was on **Check**;
2. his run was **approved**, which freezes every control on it.

**Third instance of the same class.** The company logo, the assistant, and now
this: a feature present, correct, and findable by nobody. The rule is now in
three places and belongs here too — *if a control lives somewhere the reader is
not, something where they are has to say so.* `wizard.tsx`'s Check step says it.

**Check before building.** Half a day of work was avoided by grepping the schema
first. The doc comment on `PayrollTaxOverride` describes the feature better than
the request did.

## What was actually missing

| | Scope | Writes |
|---|---|---|
| PAYE override | one run | the payslip |
| **Overtime by hand** | one run | the payslip |
| **Bonus** | one run | the payslip |
| **Monthly pay** | **from now on** | `Employee.grossMonthly` |

The first three hang off the run, expire with the period, and survive
"Calculate again" because `prepare` reads those tables and never writes to
them. The fourth is the employment contract.

`MONTHLY_PAY_EFFECT` in `lib/api/payroll.ts` is that difference in one sentence,
written once and rendered in bold above the field. It is the only thing on that
screen somebody could get badly wrong.

## Hours and a kind. Never a rate.

`PayrollOvertimeOverride` stores minutes and WEEKDAY/WEEKEND/PUBLIC_HOLIDAY. The
multiplier comes from `OvertimePolicy` at prepare time through `valueOvertime`,
which is built out of the same `rateFor` and `hourlyRateKobo` that clock-in
detection uses — so a typed Saturday hour and a clocked one are worth the same.

A rate on the request would make two people's overtime incomparable for a reason
nobody could see afterwards; a rate stored on the row would go stale the day the
policy changed. Same rule as the tax schema not accepting its own tax bands.

**It replaces, and what it replaced is named.** Detected records are set aside,
not added to — adding would pay the wrong hours *and* the right ones. Nothing is
deleted: they stay APPROVED with a null `payslipId`, still payable later, and
`prepare` raises `overtime_entered_by_hand` naming them and totalling their
hours. Approved overtime vanishing off a payslip with nothing saying where it
went is the entire risk of the feature.

## The overtime formula came from a real payslip, and this repo had it wrong

A May 2026 workbook from an engineering firm in Port Harcourt, 34 payslips, 29
of them carrying:

    =(F25*12)/365/8*hours*1.5

Monthly salary annualised, over **every day of the year**, and an eight-hour
day. This repo divided by the *working* month. On ₦400,000 that is ₦2,500.00 an
hour against their ₦1,643.84 — about a third out, every time somebody works
late.

`OvertimePolicy.hourlyBasis` now chooses, `CALENDAR_DAYS` is the default, and
**the migration sets every existing row to `WORKING_DAYS`**. Silently re-pricing
a live customer's overtime by a third on a deploy is the worst kind of change
and this does not do it.

365 rather than 365.25: the workbook uses 365, and a leap-year correction nobody
asked for would put every figure a few kobo off the one they check against.

### Fourteen kobo, and why they are not a bug

On 21 hours at ₦400,000 this engine pays ₦51,780.96; their spreadsheet shows
₦51,780.82. We round to the kobo **once, before the multiplier**, as every money
figure here does; the sheet rounds at the end. Kobo-first is what makes a
payslip reconcile exactly, which is worth more than matching a float to the
penny. Written into the test rather than left to be discovered.

## A bonus is one month, by construction

Keyed to the run. A standing arrangement is a `PayComponent`; confusing the two
is how a company pays a December bonus every month until somebody notices in
March.

**Taxable and not pensionable**, and that is the assertion worth having. This
file records the defect where an addition flowed into the salary split and
raised somebody's pension by ₦8,000 and their NHF by ₦1,500 — the old test only
checked that gross and PAYE went *up*, so it passed for months. The new cases
check the bases that must **not** move.

## Maker and checker

`RUN_PAYROLL` and `APPROVE_PAYROLL` were always separate, and the split alone
achieved little: one person holding both could adjust a figure and release the
money with nobody else in the loop. That matters more now that hand-entered
figures exist.

Whoever prepared it cannot approve it — **unless nobody else could**. The
exception is *counted from the database at approval time*, not configured:

- a lone owner still runs payroll, because refusing them would stop the business
  rather than protect it, and they would share a login instead — which is worse
  than no control, since then nothing in the trail is true;
- the day a second person gets `APPROVE_PAYROLL`, segregation begins by itself;
- only accounts that can actually sign in count, or an unaccepted invitation
  would hold a payroll;
- a run with a null `preparedById` is not refused, because refusing on the
  strength of a null is inventing a maker.

## One bug that only the screen could catch

The overtime preview first derived monthly salary by subtracting allowance lines
from `grossKobo`. Right for somebody paid a full month; wrong for everybody
else — a prorated payslip carries the *prorated* contract, while the API values
overtime on the whole month.

Adaeze, with five unpaid days, was shown **₦1,587.80** an hour against the
**₦2,054.79** she is actually paid on. 23% low, on a figure somebody would have
signed off.

`tsc`, lint and `npm run build` were all green with that number on the screen.
It reads `Employee.grossMonthly` from the directory now, and `monthlyOf` says
why.

**`hourlyOf` in `by-hand.tsx` is a second implementation of a money figure**,
which this file warns about at length. It is allowed to exist for one reason,
stated in its header: *it renders the working, it does not decide the pay.* The
payslip figure is computed server-side. If the two ever disagree, the server is
right and the preview is the bug.

## Deliberately not done

- **Pension and NHF are not editable.** They are statutory computations, and a
  free-text override there would break the correctness argument this product is
  sold on. The three that are editable are a company's own decisions; those two
  are not.
- **One bonus per person per run.** Two separate bonuses in one month are added
  together with one reason — one figure with one explanation is more auditable
  than two with none, and the payslip shows one line either way.

---

# A payroll worked in a spreadsheet, and two defects only a browser could see

The inline cells recorded above are for correcting two or three people while
looking at the table. This is the other way a payroll actually gets worked:
somebody has a file from a supervisor, or three hundred rows of overtime that
came off a different system. `POST /payroll/runs/:id/adjustments` and
`src/app/(app)/payroll/runs/new/sheet-panel.tsx`.

## The sheet downloads filled in, and that is the feature

Staff number, name, email, phone, department, **bank and account number** —
enough for a person to be sure a row is about who they think it is — plus the
overtime, bonus, tax and salary the run holds now. A blank template for three
hundred staff is a spreadsheet somebody has to type three hundred names into, in
our spelling, in the right order.

It has one consequence the whole feature turns on. Because the file arrives
carrying today's figures, **emptying a cell is a statement**:

| | Means | Because |
|---|---|---|
| column absent from the file | leave that figure alone | a sheet of overtime hours says nothing about anybody's bonus |
| column present, cell blank | take that figure off | the only way somebody can say "remove this" |

Collapsing the two either makes clearing impossible or wipes every figure a
partial sheet does not mention. `SHEET_BLANK_RULE` is that sentence, written
once and rendered on the workbook's guide tab **and** above the upload button,
so the file and the product cannot describe it differently.

The router `compact()`s every row for exactly this. A zod-parsed row spread
straight through carries `payeKobo: undefined` on every row that had no such
column, and the service reads which columns a file carried with `in` — which is
true for a key holding `undefined`. A sheet of overtime hours would have wiped
every bonus on the run.

**Monthly pay is the deliberate exception.** It writes `Employee.grossMonthly`,
which is the contract, and there is no such thing as an employee with no salary
— so a blank cell there leaves it standing. Reading an empty cell as "pay them
nothing from now on" is the worst available reading of a half-filled sheet.

## Nothing is applied unless every row can be

Different from the importer next door, which imports the good rows and reports
the rest, and the difference is the subject. An import is many independent
people: 47 of 50 arriving is 47 people who now exist. A payroll sheet is **one
statement about one period**, and 297 of 300 leaves a run that is neither what it
was nor what the sheet says, with nothing on screen able to tell a reader which
of the two any figure came from. Refusing it whole leaves the run in a state
somebody can reason about, with every problem named at once.

The same person twice is refused rather than last-one-wins. A blank row for
somebody not on this payroll passes — the template carries the whole company and
most of a returned sheet is rows nobody touched.

## Why this is not an `ImportEntity`

`lib/imports/` exists because a file arrives from outside and nobody knows what
is in it: a heading matcher, duplicate detection, a two-step apply with a
fingerprint. This is ours going out and coming back, everybody in it already
exists, and it is applied whole or not at all. Reusing the framework would mean
a matcher that never matches anything unexpected, a duplicate step that can
never fire, and a batch record for a file with no partial state. What is
genuinely shared — writing a workbook, reading one back — is `lib/xlsx.ts` and
`lib/csv.ts`, used directly.

## One bulk route, because four hundred calls is not the same shape

`setTaxOverride`, `setOvertimeOverride`, `setBonus` and `setMonthlyPay` each end
by calling `prepare`, which deletes and rebuilds **every payslip on the run**.
Right for one figure typed into one cell; catastrophic in a loop. A 300-row sheet
touching two columns is 600 requests and 600 full rebuilds. This writes every row
and rebuilds once, and resolves every person in one query rather than one per row.

If you add a fifth adjustable figure, add it here too, or the sheet and the cell
will disagree about what a payroll can carry.

## The two defects, both found by looking

Neither was visible to `tsc`, lint or the build, and both are worth reading as
classes rather than incidents.

### 1. State owned by a component that unmounts

The panel showed "Applied" from its own `useState`. Applying rebuilds the run,
and the wizard unmounts that whole subtree while it does — so the confirmation
was destroyed before it could be read, and a successful upload looked like a
panel snapping shut for no reason.

I moved the message twice before the diagnosis was right: inside the reveal, then
just outside it. **The problem was never where the message sat but which
component owned it.** It is the wizard's toast now, and the wizard survives.

> If a component triggers a refetch that unmounts it, its own success state
> cannot be the thing that reports the success.

### 2. A count that was true of the wrong noun

The panel's button read **Apply to 1 person** and the toast that followed it read
**4 people's figures changed** — two mutually exclusive claims about one act, on
one page, which is the defect this product is sold against.

Both were honest about different things. The client counted figures that move;
the server counted rows it wrote, and an upsert with an identical value is still
an upsert. A returned sheet is mostly rows saying exactly what they left with.

Fixed on the server, because that count is the one in the audit trail: three
`findMany`s up front, and a column is recorded in `changed` only when the stored
value actually differs — which also stops nine untouched rows moving nine `setAt`
stamps and putting nine decisions nobody made into the trail.

Same rule as `headcountLabel` one module along: **a number under a label has to
be true of the thing the label names.**

## The payslip

- **The overtime line shows its working**: `6 hours at ₦2,054.79 an hour, times
  1.5` under the label. The hourly figure is **divided out of the amount the
  payslip already carries**, never computed from a salary and a policy —
  `hourlyRateKobo` on the API owns that, from a basis and a contractual salary
  this document does not have. A second implementation here is the
  duplicate-engine mistake this file records at length. So the sentence always
  reconciles: it is the stored figure, factored. A clocked line carries no
  multiplier in its label, so none is invented — it says the hours and what they
  averaged an hour. Nothing is said at all when the hours are missing or nil.
- **The rent-relief paragraph is gone**, at the product owner's instruction. Four
  sentences of tax-reform history under a line reading nothing is a leaflet
  stapled to a receipt. The fact is not lost: `prepare` still raises
  `rent_relief_unclaimed` naming everybody it applies to, on the list somebody
  reads before releasing money, and `/people/[id]` has the field. Explaining a
  gap at length to the one person who cannot close it, while saying nothing to
  the people who can, was the wrong half.
- **`bonusOn` matched `"Bonus — "` only.** Correct while a reason was compulsory,
  and silently broken the day it stopped being: a bonus awarded without one
  rendered as an empty cell offering to add the bonus already on the payslip. A
  guard written against a required field is a guard with an expiry date on it.

## Verified

Against the live API on a ten-person August run: the sheet downloading
pre-filled, a hand-entered 6 hours read back out of its payslip line, a
bonus-only sheet leaving both overtime overrides untouched, an emptied cell
clearing a figure, a blank `monthly_salary` changing nothing, the button and the
toast agreeing at 1, the whole-sheet refusal naming an unknown staff number and
a repeated person by row and column, the company logo uploading and rendering on
the payslip above the company name, and the overtime working on a real payslip.
Every test figure and the test logo were cleared off the demo afterwards.

`npm run check` green in both repos — 54 payroll assertions here, 2076 tests
there. One run of the backend gate had six failures in `tests/payments.test.ts`,
a file this change does not touch, which passed **49/49 alone**: contention, by
this file's own rule, with a dev server on the same database.

## Working in a git worktree, which this session had to do throughout

Three concurrent sessions share these trees, and a peer's uncommitted files
abort every `git checkout`. `git worktree add` is the way through, and two
things about it cost time:

- **Symlinking `node_modules` breaks the build.** Turbopack refuses a symlink
  that points out of the project root — *"Symlink [project]/node_modules is
  invalid"*. `cp -Rl` hard-links it in a second and costs no disk.
- **`preview_start` reads `.claude/launch.json` from the session root**, not from
  the worktree, so it will happily serve the *other* tree's code while you read
  its output as yours. A parse error from somebody else's in-flight edit is the
  tell. Add a config with `npm --prefix /path/to/worktree run dev` on its own
  port, and remove it afterwards.

---

# Walking the payroll flow found four things 2,109 tests did not

An end-to-end pass over payroll — sign in as each real role, prepare, exclude,
adjust, upload a sheet, approve, pay — as a script over HTTP rather than against
the service layer, because what is being tested is what a browser can do
**including what it is refused**. 75 assertions.

The walk is `npm run walk:payroll` in `approvehr-api` — a script rather than a
test because it needs a running API and a seeded company, which is not what
`npm run check` is, and because it drives HTTP **as the real seeded roles**: a
service-layer test cannot see a router gate, and three of the four findings
below are router gates or their absence.

**Everything it found is pinned by vitest**, which is the half that catches a
regression. The script is the other half — the thing that finds the next one.
Re-run it after any change to the run lifecycle, and the reason is this entry.

## What it found, and why unit tests could not

Every one of these is a **sequence**. Each individual guard reads as correct;
the defect is what happens when you perform the acts in order.

### 1. Cancelling a payroll made that month permanently unrunnable

`prepare` refused any run that was not DRAFT or IN_REVIEW:

> The 2026-09 run is already cancelled. **Cancel it before preparing that period
> again.**

Advice nobody can follow for a run that is already cancelled — and
`@@unique([organizationId, period])` means one row per month, so there is no
second attempt to make. Cancel September by mistake and **nobody in that company
can ever be paid for September through this product**.

Three things kept it hidden: the guard reads as obviously correct; `cancel`
answers 200 on an already-cancelled run, so the suggested fix *appears* to work
and changes nothing; and nothing tested the sequence.

### 2. And cancelling an approved run walked back through the one-way door

`cancel` refused only PAID, so an APPROVED run could be cancelled — leaving
every loan instalment, expense claim and overtime record that approving had
settled **still settled**, against a run the product then called cancelled.

Alone, that produced a dead period: bad, and quiet. Paired with the fix above it
would have made approval reversible by anybody holding `RUN_PAYROLL` — approve,
cancel, prepare. **The two bugs were masking each other**, which is why fixing
one without the other would have been worse than fixing neither.

The two guards are stated separately on purpose. `prepare` refuses "you cannot
re-run this"; `cancel` refuses "you cannot take this back". Two acts, two
reasons, and sharing one predicate is how the next person changes both while
meaning one.

### 3. A checker could approve a batch it was not allowed to read

Every payments **read** was gated on `RUN_PAYROLL`. The seeded Finance approver
deliberately holds only `APPROVE_PAYROLL`, so the one role whose whole job is
releasing a batch could call approve and could not list or open the thing it was
approving.

Approving what you cannot read is worse than not approving at all: a rubber
stamp with a real signature on it, and a trail afterwards showing a considered
decision nobody was able to consider.

`requireAnyPermission` in `middleware/auth.ts` is new, and is the "any of" that
`requirePermissions`'s own comment says to write explicitly where it comes up.
Reads take either permission; **every write stays on exactly one**.

### 4. Salaries were readable by any signed-in account

Not from the walk — from re-checking an earlier audit against current staging,
and it was still live. `GET /departments` returned `payrollKobo` per department
beside a headcount, so a department of one published that person's exact pay
without a record being opened; `GET /departments/:id` returned
`grossMonthlyKobo` against a **named member**. Reproduced as the seeded Employee
role, which holds zero permissions: `Halima Sani | Operations Lead | 95000000`.

In the same session `GET /employees` withheld the same figures from the same
caller. Two routes disagreed about one fact and the permissive one won.

**`GET /teams/:id` had the identical leak and was not in the audit.** Found by
asking what else answered the same question the same way — which is the move
worth copying, rather than the fix.

The rule: gate the money, not the tree. An org chart is not privileged and
gating it would break the directory for everyone; that was never an argument for
the salaries travelling alongside it. `VIEW_SALARIES` is passed **into the
service** rather than enforced as a router gate, defaults to withholding, and
withheld is `null` — never `0`, which would claim the department costs nothing.

## The fifth, which the walk did not find and a test did

`prepare` selected `status: "ACTIVE"`. `EmploymentStatus` has five members and
**three matched no branch at all** — `ONBOARDING`, `ON_LEAVE`, `SUSPENDED` got
no payslip and no exception naming them.

Two ways in, neither requiring a mistake: the add-an-employee form pre-selected
`ONBOARDING` and nothing promoted anybody out of it, and `imports/employees.ts`
maps a spreadsheet's "maternity leave" onto `ON_LEAVE`.

Dates decide pay now. `startDate: { lte: periodEnd }` was always in that query
and already kept future joiners out; the status check only ever dropped people
carrying a label nobody had changed. `SUSPENDED` still withholds — a deliberate
act rather than a label left alone — and raises `withheld_by_status` naming each
person, because **the failure was never the withholding, it was the silence**.

`settingsResponse` counted the same wrong set for the Pension Reform Act
threshold: 14 active and 2 onboarding read as 14, so a company that had become
obliged to run a scheme was never told.

## Two rules worth carrying forward

**A read with no test is a read whose contract is whatever it happens to do.**
Nothing exercised `departments.tree()` at all. That is how a salary leak lived
in a route whose own doc comment explained why it was safe.

**Sequences need their own tests.** Four of the five above are compound: a guard
that is right, followed by an act that is right, producing a state that is
wrong. Nothing that tests one call at a time can see them, and the suite was at
2,109 passing while all four were live.

## A correction on flakiness

This file's rule — *a timeout is a flake, a failed assertion is not* — held for
one occurrence and was then mis-applied twice by me. Six `tests/payments.test.ts`
failures in a full run, passing 54/54 alone, looked exactly like the contention
the rule describes. They were not: I had appended a `describe` **after** the
block whose header says it must stay last in the file, so every assertion above
it ran against a registered payment provider instead of the no-provider state
that ships.

The rule is still right. What it does not cover is order-dependence inside one
file, and "passes alone, fails in the suite" is the signature of both. **Check
what you added to the file before reaching for the rule.**

---

# The logo takes an SVG, and a payroll can be run before its month ends

Two requests, and each one reverses a decision recorded above. Both reversals
are narrower than they look, and the reasoning that produced the original
decision is still sound in both cases — what changed is what follows from it.

## SVG was refused for a good reason, and the reason was about the renderer

`logo-card.tsx` refused SVG with a comment that is still true as written: an SVG
is a document that can carry `<script>`, and this value is rendered inside a
payslip. What that argument never established is that *this* value could
execute anything, and it cannot: `logoUrl` renders in exactly two places —
the settings preview and the payslip masthead — and both are `<img src={…}>`,
which is a script-disabled context in every browser. No script, no fetch, no
navigation.

**If you add a third renderer, keep it an `<img>`.** Inline `<svg>`, `<object>`
and `<embed>` all re-enable everything the old comment was worried about.

That is an argument about today's callers rather than about the value, so it is
deliberately not the only thing standing between a hostile file and the
database. Two independent mechanisms:

- **`web/src/lib/logo-file.ts#sanitiseSvg` strips**, before the file is encoded:
  `<script>`, `<foreignObject>`, media and `<handler>` elements, every `on*`
  attribute by shape rather than by list, every `href` that is not a fragment
  or an inline `data:image/`, editor namespaces and `<metadata>`. The
  parse-and-reserialise round trip is load-bearing on its own — it drops the
  DOCTYPE, which is what closes entity expansion.
- **`company/schemas.ts#svgIsInert` refuses** the same constructs at the API.
  It refuses rather than sanitises deliberately: a rewrite that is subtly wrong
  is a bypass wearing a defence's clothes, while a refusal that is subtly wrong
  costs somebody one re-export. The client sanitiser is a convenience; **this is
  the boundary**, because nothing stops somebody sending the PATCH by hand.

Verified in the browser by driving a file carrying all six vectors through the
real input: every one stripped, and the result accepted by the API — which is
also the proof that the two sides agree about what is safe.

## Too large is resized now, not refused

The old behaviour told somebody to go and export the file smaller, which sends
a person who wanted a logo on their payslip off to find image software.
`prepareLogo` brings a raster down — dimensions first, quality second, because
a logo at half the pixels is still a clean logo and a logo at 40% quality is a
smear around its own lettering — and WebP rather than JPEG throughout, since a
masthead logo usually has a transparent background and JPEG would put a white
box on the page.

**Resizing does not shrink an SVG**, which is the asymmetry worth knowing: its
size is markup, not pixels. An oversized one is minified, and one still over
budget after that is carrying an embedded photograph, so it is rasterised —
the only thing that actually makes it smaller.

**What is done is always said.** `PreparedLogo.note` is rendered on the card. A
file quietly replaced by a different file is worse than a refusal, however
convenient, and that sentence is the whole reason resizing without asking is
acceptable at all.

## A day that has not happened is not a day somebody failed to turn up

The request was to run next month's payroll this month. The month picker could
*already* reach any period — a bare `type="month"` input with no min or max —
which makes this the fourth instance of the class this file keeps recording: a
capability present, correct, and findable by nobody. It has arrows now, and the
native input stays behind them for jumping a year rather than stepping to one.

**The interesting half is what running an unfinished month actually did.**
`unpaidDaysFor`'s loop ran to `periodEnd` whatever the date, so every working
day still to come counted as a day nobody had turned up for: prepare August on
the 29th and everybody is docked for the 30th and the 31st.

That is the ₦0 defect one level down, and it fails the same way — silently, with
arithmetic that reconciles at every step. There is no clock-in on a future
Monday because the Monday has not happened. The loop stops at `countTo` now,
defaulting to today.

A **wholly future** month was never affected: `organizationUsesAttendance` is
scoped to the period, finds no rows, and returns false. Confirmed against the
live demo, where two future runs prepared before this fix had paid everybody
correctly. It is the **partly elapsed** month — exactly the case the request is
about — that was wrong.

Two consequences worth not undoing:

- **An early run must not look final.** `prepare` raises `period_not_finished`
  naming the days still to come, and preparing again after the month ends picks
  up whatever actually happened. That is what `prepare` being re-runnable is
  for.
- **`countTo` is passed explicitly in `tests/payroll-no-attendance.test.ts`,
  and must stay passed.** 31 August 2026 is a Monday, so a defaulted `countTo`
  makes those counts depend on the date the suite runs — 20 rather than 21 —
  and the file fails for a reason that has nothing to do with what it tests.

### One thing that had to be un-built

The wizard's first draft worked out its own "N days to come" and would have
rendered **"12 days"** beside the API's **"2 days"** — one fact, two numbers, on
adjacent surfaces. The frontend was counting from `TODAY`, which is pinned to
the demo dataset's day, while the API counts from the real clock. The count is
gone from the frontend entirely: `period_not_finished` carries the figure, and
the screen carries the consequence. Same rule as never re-implementing a score
on this side.

Reading the clock during render is safe in that component and would not be in
most: the route is prerendered, the wizard uses `useSearchParams`, so its
Suspense boundary renders the fallback on the server and the subtree is
client-only. Remove either and a build-time date gets baked into the page.

## Verified

Frontend `npm run check` exit **0**. API `npm run check`: typecheck, lint,
format and lockstep clean; **2119 passing**, with 6 failures in
`tests/payments.test.ts` — a file neither change touches, which passes **54/54
alone**, and which failed identically before these changes. The known
contention case, with a dev server on the same database.

In the browser: the hostile SVG walk above; the month stepper moving forward
into two future months and back past today into a finished one, with the pay
date following and the 31st clamping to the 30th rather than rolling into
October; and a real November run against the live API returning **10 payslips,
no ₦0 figures**, with `period_not_finished` rendered in the API's own words.

The November run and the test logo were removed from the demo afterwards. The
September and October runs already there were left alone — they are not ours.

## Deliberately not done

- **A fix link for `period_not_finished`.** `fixFor` returns null for it, which
  is right: the answer is to wait or to calculate again, and neither is a screen
  to navigate to. Same treatment as `rent_relief_unclaimed`.
- **Refusing a future or unfinished period.** A company paying on the 25th has
  no choice, and one paying a December run before the holidays is doing
  something ordinary. Naming the consequence is the job; refusing is not.
- **The default period.** Still `TODAY`-based, which is pre-existing and a demo
  concern. Only the standing line reads the real clock.

---

# The development-areas suggestion worked for five people out of nine

The complaint was that scoring the competencies would make the review
suggestion work. Investigating it found the diagnosis was nearly right and the
thing everybody had assumed was missing was not.

## Three things that were assumed missing and were already built

Recorded because an earlier session's note in this file said "no frontend screen
calls the rate endpoint", and that was wrong:

- **`SkillsTab` exists and is mounted**, as a closed disclosure titled "Skills
  and levels" on the Overview tab (`now.tsx`). It reads `useSkills`, `useGaps`,
  `useHeatmap` and writes through `useRating`.
- **`performanceApi.rate` and `useRating()` were both already wired.**
- **48 competency ratings already existed**, 17 of them below target.

So neither the screen, the store, the wrapper nor the data was the gap. Check
what is there before building it — this is the second time in two sessions that
grepping first would have saved the work.

## What was actually wrong: coverage, not capability

Activating a cycle creates a manager review for **everybody who has an
appraiser** — nine people in the demo. `rateEverybody` in
`scripts/demo-performance-cycle.ts` iterated `PEOPLE`, which is six, and one of
those six has no manager and therefore no manager review.

So **four people had a review form and no competency scores at all**: Grace
Effiong, Halima Sani, Musa Ibrahim, Tunde Bakare. Open any of their reviews,
press "Suggest development areas", and `suggestDevelopment` refuses with its own
sentence — *"Nobody has scored them on any competency yet, so there is nothing
to base a suggestion on. Score the competencies first."*

That refusal is correct, and it is exactly what was being read as the feature
being broken. A capability that works for five of nine people does not read as
"those four are unscored"; it reads as unreliable.

### The cause is one list doing two jobs

`PEOPLE` decided both what an appraiser *recorded against each competency* and
what they *wrote on the form*, including how far sign-off was taken. Those are
separate acts. `RATED_NOT_REVIEWED` is now a second list, and the split is the
fix rather than four more `PEOPLE` entries — adding them there would also give
each one a self-review, a written manager form and a sign-off state, moving
`noReview`, `unscored` and `awaitingAcknowledgement` on the cycle report. The
demo needs one person with no review at all, or that state never renders.

**Levels are shaped so each person has at least one genuine gap.** Somebody at
or above target everywhere is refused too — correctly, with a different sentence
— so straight fives would have left the button looking just as broken.

## A warning that fired on every boot, including the healthy ones

`provider.ts` logged *"no suggestion assistant is wired… Set ANTHROPIC_API_KEY
to enable it"* at **module load**, unconditionally — before `server.ts` had a
chance to register anything. A boot with a key configured printed that warning
and then "suggestion assistant registered" on the next line.

Wrong twice: a warning that fires on every boot is one people stop reading, and
it named `ANTHROPIC_API_KEY` alone while `GEMINI_API_KEY` is read **first** — so
somebody following the advice sets the key that loses the tie. It is in
`server.ts`'s `else` branch now, the one place that knows the answer, and names
both variables.

## Verified

`GEMINI_API_KEY` is set in this environment, so the whole path was exercised
rather than reasoned about. Calling `suggestDevelopment` directly for Grace
Effiong against the live H2 2026 cycle returned three grounded, role-aware
development areas naming Initiative, Communication and Dependability with her
actual scores and targets.

**The facts that left the building were logged and read.** Three lines, each a
competency name, category, score, target and scale. **No personal name**, which
is the property `/settings/ai` and the DPA both promise — `buildMessage` sends
`grounding.facts` and never `grounding.summary`, which is where the name is.

After re-running `npm run demo:performance`: **79 ratings, and all 9 people with
a manager review form have at least one gap.** 0 refuse.

## One thing worth knowing, not changed

`suggestDevelopment` appends the appraiser's free-text `note` to each fact. The
structured fields carry no name, but a note is prose somebody typed and could
name a colleague. The seeded ratings set no notes, so nothing here exercises it.
If the no-names promise is meant strictly, that is the hole — and stripping it
would cost the model the only qualitative signal it gets, so it is a decision
rather than an oversight.

---

# Payroll pays people now, and "Payments" is the Wallet

The product owner's brief: *"For the payroll module we need to completely
rework it. We do not automatically debit users accounts. We fund the wallet
using 9JApay, Monnify virtual accounts then pay all salaries from there. This
means we do not need this page: `/payroll/payments`. The staff get paid
immediately the run is approved and it can say proceed to pay staff or even
prepare and download only the sheet and send it to bank to pay the staff."*

Most of the plumbing already existed — `reserved-accounts.ts`, the Monnify and
9jaPay webhooks, `LedgerEntry` with FUNDING/SALARY/FEE kinds, the provider seam,
the bank file. Three things did not: nothing computed a balance, approval did
not touch payments, and no screen could say where money goes *in*.

## One push-back, and the shape it produced

*"The staff get paid immediately the run is approved"* is not what shipped, and
the reason is on the screen. **Approval is already the one-way door** — it
settles the loan instalments and the expense claims and freezes the settings
snapshot onto the run — and putting "and the money leaves" on that same click
makes it a door nobody can stand at and think.

So approval **builds the payment** and the run then offers both paths, one
press each: *Pay ₦8,497,077.00 to 9 people*, or *Download the bank file*. That
is the "proceed to pay staff or prepare and download only the sheet" half of the
brief, without collapsing two decisions into one irreversible click.

## The wallet, and what `availableKobo` is for

`modules/payments/wallet.ts`. **Derived from the ledger, never stored** — a
stored total is a second copy of a fact, and the day it disagrees with the
entries there is no way to tell which is wrong.

Four figures rather than one, and the fourth is the point:

| | |
|---|---|
| `balanceKobo` | funded less paid out — what a bank statement shows |
| `committedKobo` | approved or submitted and **not yet settled** |
| `availableKobo` | balance less commitments |

Approving two payrolls in a morning is ordinary. If both asked only *is the
balance enough*, both would say yes and the second would fail at the provider —
after the run was approved, the loans settled and the figures frozen.

**`afterKobo` is negative when short and is reported as such.** "You cannot pay
this" is not something anybody can act on; "you are ₦1,480,000 short" is the
figure they take to whoever funds the account. Flooring it at zero would make a
₦2m shortfall read exactly like an empty wallet.

`GET /payments/wallet` returns the funding accounts alongside it, because a
shortfall is not an instruction until there is an account number under it.
`ReservedAccount` rows were provisioned by our staff and readable only by our
staff; `fundingAccounts` is the company's own read. Inactive ones are excluded
rather than greyed: money sent to an old collection account arrives somewhere
real and is attributed to nobody.

## The wallet never blocks an approval

Stated on the Approve step and nowhere near the button's `disabled`. Approving
is a decision about the **figures**; funding is a decision about the **money**,
and a company that approves on the 25th and funds on the 28th is doing something
completely ordinary. What the strip must do is put the position *before* the
one-way door rather than after it.

`funds` is **optional** on the run detail and absent twice — for a caller
without `VIEW_SALARIES`, and offline. Both render nothing. A ₦0.00 wallet is a
claim about a company's money and would be false in both cases.

## `/payroll/payments` is the Wallet

The route survives; what is on it does not. It was a batch console — build,
check, approve, download — four acts of bookkeeping between an approved payroll
and the people it pays. **"Build a payment batch" and `build-batch-modal.tsx`
are deleted**: two ways to build a batch for one run is how a company pays
somebody twice.

What is left is the thing with no other home: what the company holds, where
money goes in, and the ledger. The payments themselves stay at the bottom as a
record — every row opens, and every approved row still hands over its bank file,
because somebody who downloaded one and lost it needs it again months later.

The nav item reads **Wallet**. `/payroll/payments/history` is unchanged.

## A hand-entered PAYE stands even where the bands are not run

Separate request, same session. `payeEnabled: false` meant *this payslip has no
tax line at all*, and an override entered against it was discarded. That reads
the switch as "nobody here pays tax" and it means something narrower: an
employer who switches PAYE off has not stopped deducting tax, they have stopped
asking this engine to work it out. Crafwell is the case — a flat figure per
person that no band produces.

The switch now means **do not compute PAYE from the bands**. `operates.paye`
follows the figure rather than only the switch, because a payslip showing
₦9,500 of tax while calling that line `NOT_OPERATED` contradicts itself. The
run's `payroll_tax_overridden` warning was gated on the switch too — ungated, or
the one case this exists for is the one case nobody is warned about.

With the switch off and **no** override there is still no tax, no relief and no
taxable figure. That half is unchanged and is what the switch is for.

## A bonus is often more than one thing

The Bonus cell took one amount and one reason, so ₦50,000 for the Lagos install
and ₦20,000 for the weekend cover had to be typed into one sentence — and twelve
months later nobody can say which project the ₦50,000 belonged to.

`payroll/runs/new/lines-dialog.tsx` holds named lines for both bonuses and
deductions; the table keeps showing one total, because a payroll table is a
column of totals. Saved **whole, once**: somebody who adds two lines, edits a
third and removes a fourth has made one decision, and four requests make four,
any of which can fail alone.

The deduction modal opens from **inside** the breakdown, not from the "Other"
figure. "Other" is loans, expense claims *and* typed lines together and the
frontend cannot tell them apart in that total — nor should it, since a loan
instalment belongs to the loan.

## Payslips can actually be sent

`Payslip.emailedAt` has existed since the model did, the distribution screen has
counted three delivery states off it, and **nothing ever wrote it**. Every
payslip in the product sat at "Not sent" for ever — the screen reporting the
exact truth about a thing nobody could change, which looks like a working
feature and therefore never gets reported.

`POST /payroll/runs/:id/payslips/send`, and rules worth not undoing:

- **Only an approved run.** `prepare` deletes and rebuilds every payslip; an
  email is the one act here that cannot be taken back.
- **`emailedAt` is stamped after a provider accepts, never beside the attempt.**
  "Sent" against a rejected email is the green "Paid" over money nobody moved —
  and worse, because the screen then hides that person behind a filter.
- **Four outcomes, kept apart**: sent, `noEmail` (named — nothing attempted,
  nothing wrong, somebody has to add an address), `failed` (named, somebody
  chases it), `alreadySent` (the ordinary second press). `resend` defaults to
  false so pressing twice cannot re-mail a company.
- The mail carries **their own net pay** and a link. Not a PDF: there is no
  renderer and no object storage, and a link-only mail is useless to the many
  people who have not been given a login yet.
- Sends are **sequential**. Three hundred at once is a wall of rate-limit
  rejections this would then report as three hundred failed payslips.

Demo mode refuses, and for a different reason from every other demo write: the
demo has **real addresses** on its seeded people, so a send would put actual
mail in an actual inbox about a payroll that never happened.

## Four defects the browser found and no type could

Recorded as classes, because each is repeatable:

- **A count true of the wrong noun.** The pay button read *"Pay ₦8,497,077.00 to
  9 of 10 — 1 excluded"*. `headcountLabel` is right in a `Stat` where the label
  carries the noun and wrong inside a sentence, where it reads as though the
  money were being split with somebody who is not being paid. Same family as the
  `payslipCountLabel` bug recorded earlier in this file.
- **Two explanations for one absence.** A callout said the API was needed and
  the card below it said no bank account was on file — offline only one was
  true. One card now, and the offline case is **derived** rather than
  remembered: component state does not survive a reload, and on the second load
  the generic fallback was confidently blaming a setting that was never the
  problem.
- **A button whose only outcome was a refusal.** `createBatch` refuses with no
  API, so "Prepare the payment" is absent offline rather than present and always
  failing.
- **Typing in a modal wiped what you typed.** `usePayrollActions()` returns a
  **fresh object literal every render**, so an effect depending on the whole
  thing re-runs on every render — here it re-seeded the row state. Offline the
  read resolves instantly, so the field emptied itself before the keystroke
  finished. Fixed by destructuring the one function out, which is also what
  `exhaustive-deps` can reason about; suppressing the rule would have left the
  next person to rediscover it.

> **Standing rule from the last of those:** every `useX()` in `lib/store/*`
> returns a new object each render unless it says otherwise. Never put one in a
> dependency array. Destructure the function you need — its own `useCallback`
> is the stable thing.

## One wire rename

`PUT /runs/:id/lines` returned `total: number` for a kobo figure. Every money
value crossing this API is integer kobo and says so in its name, and the router
was already writing it into the audit entry as `totalKobo` — the mismatch was
the tell. Renamed while nothing consumed it.

## Verified

Both gates green in both repos on the rebased branches — a PR green alone can
still break the merge. API `npm run check` **2238 passing**; web `npm run check`
and `npm run build` at **97 routes**, unchanged.

Walked in demo mode end to end: prepare, exclude with a reason, approve, and the
pay panel appearing in place with the honest offline reason and no dead button;
the Wallet screen showing em-dashes rather than ₦0.00 for figures it cannot
know; the bonus modal with two named lines totalling ₦70,000.50 and the demo
refusal preserving what was typed; and the send panel refusing on an in-review
month, offering "Send 9 payslips" on the approved one, and refusing honestly
when pressed.

**Not exercised: connected mode, anywhere in this batch.** Signing in needs a
password this session does not enter. Every wire shape is pinned by backend
assertions instead — `payroll-run-funds.test.ts` (7) proves `funds` and `batch`
on the detail from both sides, `payments-wallet.test.ts` (15) the balance and
the funding accounts, `payslip-email.test.ts` (9) the send. Somebody with
credentials should walk the Pay button and a real payslip send once.

## Deliberately not done

- **Wiring a payment provider.** `NINEJAPAY_*` and `MONNIFY_*` are unset and
  setting them is the user's to do. Until then `release` refuses in the API's own
  words and the bank file is the way out — which is not a workaround, it is how
  most Nigerian companies pay staff today.
- **Provisioning a reserved account from inside the app.** `reserved-accounts.ts`
  takes a BVN and is deliberately internal-staff-only. The wallet screen reads
  what exists and says who to ask when there is none.
- **A PDF payslip attachment.** Needs a renderer and object storage, neither of
  which exists. The headline figure in the mail body works for the reader with
  no login, and the link rewards the one who has one.
