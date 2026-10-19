@AGENTS.md
@HANDOVER.md

# Before you build

- `docs/pages/` — every page on every platform (113 here, 152 platform-frontend, 14 landing).
- `docs/components/` — every exported component, hook and function, grouped by purpose, plus all
  644 API endpoints.
- `docs/walkthroughs/` — how the product is used rather than how it is built.
  `performance.md` walks the Performance module click by click, with every on-screen label quoted.
- `docs/adr/` — why it is like this, and whether you may change it: one decision per file
  (money as integer kobo, one payroll engine, an absent figure is never a zero, no demo mode in a
  production build). **Read the one that covers a thing before you reverse it.** If a change would
  contradict an accepted record, stop and propose a superseding one rather than working around it.
  A record still marked `Proposed` is a draft awaiting a person's acceptance: it says what the code
  does and why, but does not yet bind.

Each folder has its own `index.md`; `docs/index.md` says which one you want.

The first two are generated from source. **Grep them before writing a new component, hook, helper
or endpoint** — this repo has paid three times for a second copy of something that already existed.
If a route or symbol is missing, re-derive the file rather than patching the row; a hand-edited
inventory goes stale in the way nobody notices.
