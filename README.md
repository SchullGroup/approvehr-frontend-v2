# ApproveHR — web

The ApproveHR front end: the signed-in product, in one Next.js application with
the few public pages that have no equivalent yet on the standalone landing site
(pricing, the careers boards and the PAYE calculator). The rest of this app's own
marketing site is retired: `src/proxy.ts` sends those routes to the landing site,
[`aprrovehr-frontend`](https://github.com/SchullGroup/aprrovehr-frontend).

ApproveHR is Schull Technologies' HR, payroll and hiring platform for Nigerian
companies. The competitive claim is a narrow one and the whole repo is arranged
around it: **the statutory arithmetic is correct, and provably so.**

```bash
cp .env.example .env
npm install
npm run dev      # http://localhost:3000
npm run check    # typecheck, lint, format and the verify scripts — run before pushing
npm run build
npm run docs     # re-derive the page and component inventories under docs/
```

The app runs with or without the API. If `GET /health` on
`NEXT_PUBLIC_API_URL` answers, you get real sign-in against Postgres; if it does
not, you get a local demo backed by `localStorage`. Every screen says which mode
it is in, because a product that looks connected when it is not is worse than
one that admits it. The API lives in
[`approvehr-backend`](https://github.com/SchullGroup/approvehr-backend).

## Read these before writing code

| File                                               | Why                                                                                                                                                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`HANDOVER.md`**                                  | The working brief. Design-system rules, the payroll engine's traps, the store patterns, and a list of bugs that `tsc` and `lint` cannot see. Several entries contradict what you would guess from first principles.                              |
| **`PARITY.md`**                                    | What the incumbent system does that this does not, and the phased plan to close it. Start here for _what to build next_.                                                                                                                         |
| **`AGENTS.md`**                                    | A Next.js version-drift warning that `next dev` regenerates. Normal, not a bug.                                                                                                                                                                  |
| **[`docs/pages/`](docs/pages/index.md)**           | Every page on every platform — 145 routes here, 152 on the platform frontend, 15 on the landing site. This repo's list is generated (`npm run docs`) from the routing source, so a row exists because the code puts it there.                    |
| **[`docs/components/`](docs/components/index.md)** | Every exported component, hook and function, grouped by what it is for. Also all 851 API endpoints. **Check this before adding anything** — the three most expensive bugs in `HANDOVER.md` were second copies of something that already existed. |

## Walking the product

For anybody who has to _use_ ApproveHR rather than change it — a PM, a new joiner, somebody running
a demo — there are click-by-click walkthroughs in [`docs/walkthroughs/`](docs/walkthroughs/index.md):
**[`performance.md`](docs/walkthroughs/performance.md)** (thirty-four numbered steps from setting the
scoring up to publishing the marks, a relay diagram of who hands what to whom, a card per role, and a
twenty-minute demo script) and **[`approvals.md`](docs/walkthroughs/approvals.md)** (the inbox, its
filters, Approve, Reject, Archive and Approve routine). Every button label in them is quoted from the
screen rather than paraphrased, so the two cannot drift apart. If a label there stops matching the
product, the document is what is wrong.

## Layout

```
src/
  app/(marketing)/   public pages — own chrome, warm sand palette, large display
                     type. Most are retired (see above); pricing, careers and the
                     PAYE calculator are still served from here.
  app/(app)/         signed-in product — sidebar shell, tight Stripe-ish density
  components/
    marketing/       the public site's components. Hand-drawn SVG product
                     illustrations, not screenshots, so they never go stale.
    ui/              the app's design system. Import from the barrel.
    portal/          app shell, nav, sign-in gate
  lib/
    payroll/         PAYE, pension and NHF. See the warning below.
    api/             the API client and the kobo↔naira boundary
    store/           localStorage-backed stores. Copy `persisted.ts`, not the
                     older hand-rolled ones.
tests/               vitest suites
scripts/             verification that runs in `npm run check`, and `generate-docs.ts`
docs/                inventories (generated), walkthroughs, decision records
```

Two visual languages live here on purpose, and they do not share components.
The marketing site is an argument; the app is a tool. Do not cross-import.

## Two things that will bite you

**The payroll engine exists once, in the backend.** The backend's
`src/modules/payroll/engine.ts` (integer kobo, dated tax schedules, hand-worked
assertions) is the only implementation of Nigerian PAYE, pension and NHF. There
used to be a second one here, in floating-point naira. It is deleted, and
`src/lib/payroll/` now holds settings and nothing that computes tax. Do not add
one back, not even "for offline": two implementations of tax law is exactly one
too many, and `HANDOVER.md` records what the second one cost.
`npm run verify-payroll` checks what this repo can still get wrong — that the
generated demo figures reconcile and, when the backend is checked out beside
this repo, that they still match its tax schedule.

**Relative imports must have no file extension.** The backend is Node ESM and
needs `./x.js`; the Next bundler cannot resolve that. `tsc` maps `.js` → `.ts`,
so typecheck passes and only the browser breaks.

## Verification

`npm run check` is typecheck, lint, format, and a run of `verify-*` scripts —
WCAG contrast across every text-token × background combination, the type scale,
the payroll fixtures, the import templates, and more; the `check` script in
`package.json` is the list. It must be clean before a push. It is not
sufficient: open the page in a browser and read the DOM.
Every real bug found during this build — a hydration mismatch, a stale store
read, a crash on `e.currentTarget`, a blank page from a nested anchor — survived
`tsc`, `lint` and `build` and only showed up on screen.

## Two standing rules

1. **Never fabricate proof.** No invented customer logos, statistics or
   testimonials. If a page needs social proof and none is verified, the page
   says so. Real assets are in `public/clients/`, `public/avatars/` and
   `public/photos/`.
2. **The statutory maths must be actually correct**, not plausible-looking. It
   is the entire pitch. `scripts/verify-payroll.ts` carries hand-worked expected
   values in its comments — work the arithmetic by hand before you change an
   expectation.
