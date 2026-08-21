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

Two rules that follow, both in `PARITY.md` and both load-bearing:

1. **One route per concept, rendered by role.** Not `/performance/manager` and
   `/performance/my-objectives` and `/performance/executive`. One
   `/performance` that reads `useCan()` and `useIsManager()`. The incumbent has
   ~120 routes largely because it did the opposite.
2. **Turning a flag off never deletes data.** That is why the flags are a table
   and not a migration.

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

### Teams have no demo mode, on purpose

`lib/store/teams.ts` refuses every write offline, in the same words
`store/departments.ts` uses, and the reason is that one rule: on a departmental
team, adding somebody moves their `departmentId`, and a cost centre built in
browser storage would never reach a payroll run. `shifts.ts` argues the opposite
for the rota and is right, because nothing else reads the rota. The honest
consequence, stated on screen: **the teams surface can only be demonstrated
against a running API.**

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
