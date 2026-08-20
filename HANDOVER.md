# ApproveHR — handover

You are continuing a prototype build, not starting one. Read this whole file
before touching code — several things here contradict what you'd guess from
first principles, and each one cost real debugging time to find.

## Start here

```bash
cd /Users/mac/Documents/Schulltech/ApproveHR/web
npm run check   # typecheck + lint + contrast verification + payroll maths verification
npm run build   # 77 routes, all currently green
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
established, well-funded incumbent. Everything in this repo is a **design
and product prototype** — there is no backend, no auth, no database. State
lives in localStorage or in-memory mock data. The point of this phase is a
fully-clickable product to demo and user-test, not a shippable app.

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

## The payroll engine exists twice, and that is temporary

`web/src/lib/payroll/engine.ts` (floating-point naira, 33 assertions) and
`approvehr-api/src/modules/payroll/engine.ts` (**integer kobo**, 50 assertions)
implement the same statute. The backend one is authoritative and is the one to
trust: it was cross-checked against an independent Decimal implementation before
being committed, and it cannot drift the way the float version can.

The frontend copy stays only until the payroll screens read from the API. When
they do, delete `web/src/lib/payroll/engine.ts` rather than keeping it "for
offline" — two implementations of tax law is exactly one too many. If you change
statutory maths before that happens, **change both**, and put the new assertion
in both suites.

### The frontend engine, in detail

`src/lib/payroll/engine.ts` implements real Nigerian PAYE, pension and NHF
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

## Route map (77 routes, all currently building clean)

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
