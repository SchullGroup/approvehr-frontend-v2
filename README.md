# ApproveHR — web

The ApproveHR front end: the public marketing site and the signed-in product,
in one Next.js application.

ApproveHR is Schull Technologies' HR, payroll and hiring platform for Nigerian
companies. The competitive claim is a narrow one and the whole repo is arranged
around it: **the statutory arithmetic is correct, and provably so.**

```bash
cp .env.example .env
npm install
npm run dev      # http://localhost:3000
npm run check    # typecheck + lint + contrast + payroll maths — run before pushing
npm run build
```

The app runs with or without the API. If `GET /health` on
`NEXT_PUBLIC_API_URL` answers, you get real sign-in against Postgres; if it does
not, you get a local demo backed by `localStorage`. Every screen says which mode
it is in, because a product that looks connected when it is not is worse than
one that admits it. The API lives in
[`approvehr-backend`](https://github.com/SchullGroup/approvehr-backend).

## Read these before writing code

| File | Why |
|---|---|
| **`HANDOVER.md`** | The working brief. Design-system rules, the payroll engine's traps, the store patterns, and a list of bugs that `tsc` and `lint` cannot see. Several entries contradict what you would guess from first principles. |
| **`PARITY.md`** | What the incumbent system does that this does not, and the phased plan to close it. Start here for *what to build next*. |
| **`AGENTS.md`** | A Next.js version-drift warning that `next dev` regenerates. Normal, not a bug. |
| **[`docs/pages/`](docs/pages/index.md)** | Every page on every platform — 113 routes here, 152 on the platform frontend, 14 on the landing site. Generated from the routing source, so a row exists because the code puts it there. |
| **[`docs/components/`](docs/components/index.md)** | Every exported component, hook and function, grouped by what it is for. Also all 644 API endpoints. **Check this before adding anything** — the three most expensive bugs in `HANDOVER.md` were second copies of something that already existed. |

## Walking the product

For anybody who has to *use* ApproveHR rather than change it — a PM, a new joiner, somebody running
a demo — there is a click-by-click walkthrough of the Performance module:
**[`docs/walkthroughs/performance.md`](docs/walkthroughs/performance.md)**. Thirty numbered steps
from setting the scoring up to publishing the marks, a relay diagram of who hands what to whom, a
card per role, and a twenty-minute demo script. Every button label in it is quoted from the screen
rather than paraphrased, so the two cannot drift apart. If a label there stops matching the product,
the document is what is wrong.

## Layout

```
src/
  app/(marketing)/   public site — own chrome, warm sand palette, large display type
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
scripts/             verification that runs in `npm run check`
```

Two visual languages live here on purpose, and they do not share components.
The marketing site is an argument; the app is a tool. Do not cross-import.

## Two things that will bite you

**The payroll engine exists twice.** `src/lib/payroll/engine.ts` (floating-point
naira) and the backend's `src/modules/payroll/engine.ts` (integer kobo, 65
assertions). **The backend one is authoritative.** The copy here goes away once
the payroll screens read from the API — delete it then rather than keeping it
"for offline", because two implementations of tax law is exactly one too many.
If you change statutory maths before that, change both and add the assertion to
both suites.

**Relative imports must have no file extension.** The backend is Node ESM and
needs `./x.js`; the Next bundler cannot resolve that. `tsc` maps `.js` → `.ts`,
so typecheck passes and only the browser breaks.

## Verification

`npm run check` is typecheck, lint, WCAG contrast across every text-token ×
background combination, and the payroll assertions. It must be clean before a
push. It is not sufficient: open the page in a browser and read the DOM.
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
