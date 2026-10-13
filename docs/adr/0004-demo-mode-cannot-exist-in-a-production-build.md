# 0004 — Demo mode cannot exist in a production build

- **Status:** Proposed
- **Date:** 2026-08-22
- **Decided by:** kene (author of `6a28f2e3`; acceptance pending)
- **Scope:** frontend
- **Supersedes:** —
- **Superseded by:** —
- **Enforced by:** `npm run verify-demo` (`scripts/verify-demo.ts`). In CI it runs after `npm run build` (step "No demo artifact in the production bundle", `.github/workflows/ci.yml`) and reads the built default production build. Inside `npm run check` it runs the source half only (see Consequences). The opt-in described below is not covered by CI.
- **Backfilled:** 2026-10-11 from `HANDOVER.md` § "Demo mode cannot exist in a production build" and § "The demo gate could not see a fabricated record, and that is what shipped"; decision dated by `6a28f2e3`

## Context

The app has two modes: connected to the API, and an offline demo that invents its own data in
`localStorage` (seeded salaries, bank account numbers, a persona list) so it can be shown with no
database. Every screen showing invented figures carried a badge saying so. The product owner's
instruction was to remove those badges before going live. Read literally, that leaves the mode
running and the product presenting invented numbers as the company's own, with the one label that
said otherwise deleted. The commit message of `6a28f2e3` and `HANDOVER.md` both record this
reasoning: the mode was removed, not the badges.

The first attempt exported `DEMO_ENABLED` as an ordinary `const`. It shipped the whole payload
behind correct-looking guards, because Turbopack does not fold a constant across a module
boundary. That attempt is not in this branch's history (`src/lib/demo.ts` first appears in
`6a28f2e3` in its final form), so the evidence is the commit message and code comments, not a
diff. `a117321a` (same day) found that `verify-demo` had passed while the bundle carried three
fabricated RSA PINs, five seed personas, a staff email and an invented payment history, because it
only looked for demo copy. The gate was widened to fabricated records.

**A later narrowing, not recorded in `HANDOVER.md`.** `32e06d67` (2026-09-05) added
`NEXT_PUBLIC_ENABLE_DEMO_IN_PRODUCTION_BUILD`, which must equal one long literal string, for a
standalone public sales-demo deployment; `c4b9c6ad` (2026-09-09) added the module behind it and
`verify-public-demo-build`. The message of `32e06d67` does not mention it. The reasoning exists
only in comments in `next.config.ts`. A person should decide whether it needs its own ADR.

## Decision

A production build contains no demo mode. `DEMO_ENABLED` is an ambient global with no import,
declared in `src/lib/demo.ts` and substituted as a literal by `compiler.define` in
`next.config.ts`, so every demo branch, seed array and demo sentence guarded by it is dropped by
the minifier. It is `false` in any `NODE_ENV=production` build unless the one opt-in above is set.
`NEXT_PUBLIC_DEMO=off` overrides everything and can only remove the demo. With no API in
production, the sign-in gate shows "Cannot reach the server" (`Unreachable` in
`src/components/portal/auth-gate.tsx`), not a demo. Demo values are gated at the declaration, and
values with no need to look like a person or credential are made obviously synthetic instead.

## Consequences

- **Easier:** a production bundle cannot present invented figures as a company's own, and this is
  checked against build output rather than asserted.
- **Harder:** every demo-only value must sit behind `DEMO_ENABLED` at its own declaration (a
  separate `const` does not fold because its readers are gated). The seed's personas have a
  separate roster for the marketing mockups so the check can run with no allowlist.
  `CURRENT_USER` is `Employee | undefined`.
- **Accepted:** the gate is a list. It bans specific phrases, seed personas read out of
  `src/lib/mock/people.ts`, and three credential shapes (the TIN shape names one fabricated value
  on purpose). A new fabricated record that matches none of them passes. Inside `npm run check`,
  `verify-demo` exits 0 early when there is no production `.next`, so the bundle half **and** the
  fabrication check are skipped there; they run in CI only after the build, and locally via
  `npm run verify-demo:build`. Nothing in CI builds with the opt-in, runs
  `verify-public-demo-build`, or inspects the production deployment's environment variables.
  Two comments are stale since the opt-in: `src/lib/demo.ts` ("This cannot be turned on") and the
  header of `scripts/verify-demo.ts`.
- **Revisit if:** a second build needs a demo (it already has once; supersede or amend this
  rather than adding another flag), or a bundler upgrade changes how constants fold. The failure
  was silent, so the bundle check is what to keep.

## Alternatives considered

- **Delete the badges and leave the mode.** `HANDOVER.md` calls this the most dangerous edit in
  the repo's history: the badge is the only thing saying whose numbers they are.
- **A runtime flag** (environment variable, feature toggle, query parameter). `src/lib/demo.ts`
  rejects it as something that can be turned on in front of a customer.
- **An exported `const`.** The first attempt; it folded nothing.
- **For the fabricated records (`a117321a`):** `notFound()` on the route, `next/dynamic` around
  the demos, and gating only a declaration's consumers. Each was measured against build output
  and the values still shipped.

## References

- Commits: `6a28f2e3` (introduced, 2026-08-22), `a117321a` (fabricated-record gate and
  `verify-demo:build`, 2026-08-22), `32e06d67` (opt-in, 2026-09-05), `c4b9c6ad` (sales demo and
  `verify-public-demo-build`, 2026-09-09).
- Binds: `src/lib/demo.ts`, `next.config.ts`, `scripts/verify-demo.ts`,
  `scripts/verify-public-demo-build.ts`, `package.json` scripts, `.github/workflows/ci.yml`,
  `src/lib/mock/people.ts`, `src/components/portal/auth-gate.tsx`, `HANDOVER.md` § above.
