# 0005 — Tenancy lives in the scoped client, not in each query

- **Status:** Proposed
- **Date:** 2026-08-20
- **Decided by:** kene (author of 21db4ad; acceptance pending)
- **Scope:** backend
- **Supersedes:** —
- **Superseded by:** —
- **Enforced by:** `approvehr-backend:tests/tenant-isolation.test.ts` (the extension's behaviour, and the hole and the door for the child models it names) and `tests/tenant-scoped-models.test.ts` (every schema model with an `organizationId` is scoped or listed with a reason), both run by `npm test` in CI; the doors themselves, raw SQL and `unscopedDb` are review only
- **Backfilled:** 2026-10-11 from HANDOVER.md § "Conventions worth knowing before you write a module" and § "Tenancy: two models with no organizationId, and both are pinned"; decision dated by `21db4ad` (approvehr-backend)

## Context

Every customer's rows share the same tables, separated by `organizationId`. The obvious design is
`where: { organizationId }` on every query. The header of `src/db/tenant.ts` and
`docs/architecture.md` (both in `21db4ad`, 2026-08-20) reject it for how it fails: it works until
somebody forgets once, the cost is one customer reading another's payroll, and no test exists for the
query nobody remembered. The initial commit also records that `tests/tenant-isolation.test.ts` covers
"the one a hand-rolled version misses": `findUnique` by a primary key belonging to another tenant.

The public security page promises that tenant separation "is enforced in the data layer rather than
only in the interface" (`src/lib/marketing/legal.ts` in this repo). This is the mechanism behind
that sentence, and the test file's own header says a failure there means the page has to change.

Not recorded: why a client extension rather than any other database-level approach. The only
alternative named anywhere is the per-query filter.

## Decision

Services receive a scoped client, never the raw one. `authenticate` builds it with
`forOrganization(claims.org)` from the verified token, and handlers fetch it with `requireDb(req)`.
For every model in `SCOPED_MODELS` the extension merges `organizationId` into reads, updates and
deletes, injects it into creates, and rewrites `findUnique` to `findFirst`, because a lookup by a
globally unique id would otherwise ignore the filter. A service cannot read across tenants
whatever it writes in `where`. The unscoped client is exported as `unscopedDb`, named so it shows in
a diff.

A model without an `organizationId` (a child such as `Payslip`, `TeamMember` or `Interview`) is not
scoped. It has exactly one door, a lookup of its scoped parent (`requireOpenRun`, `requireTeam`,
`requireRequisition`), and is never read by a bare id. The reason for each such model is written in
the comment under `SCOPED_MODELS`.

## Consequences

- **Easier:** isolation comes free on the common path for any listed model, and the test file is
  the evidence for a promise made to customers.
- **Harder:** a model with an `organizationId` must be in `SCOPED_MODELS`, or in
  `DELIBERATELY_UNSCOPED` in `tests/tenant-scoped-models.test.ts` (two rows today, both written
  where no scoped client exists; HANDOVER does not mention that list). Child models rest on a
  convention: nothing stops a new service calling `db.payslip.findFirst({ where: { id } })`, and the
  tests prove the hole and the door only for the children they name.
- **Accepted:** raw SQL bypasses the extension. `modules/knowledge/store.ts` and `search.ts` write
  `"organizationId" = …` by hand and say so; no check covers it. 19 files under `src/modules` use
  `unscopedDb`, with no lint rule. HANDOVER's "never thread an `organizationId` through a service
  signature" does not describe the code: over a hundred places in `src/modules` declare an
  `organizationId: string`, mostly parameters (timezone lookup, the unscoped `Organization` row,
  notifications), and dozens of queries name it in a `where`. On a scoped client that is redundant
  and harmless, since the client adds it anyway; where the code uses `unscopedDb` (billing and
  other cross-organisation work) it is required. Either way it is not a rule that holds.
- **Real leaks of the shape this guards against, each caught late:** `c66d07b` (2026-08-21) counted
  every organisation's applications, interviews and offers in the dashboard, found only because a
  different test failed; `32d9a94` (2026-08-28) found `LeaveYearRollover` unregistered, so scoped
  reads searched every organisation, and `OrgFeatures` unscoped all along (not leaking, only
  because every caller filtered by hand); HANDOVER records an insights read of payslips by period
  alone, whose test landed in `9eb9a2d` (2026-08-22).
- **Revisit if:** a leak through a child model or raw SQL happens again, or the list of door-only
  children outgrows what review can hold.

## Alternatives considered

- **`where: { organizationId }` on every query.** Named and rejected in `tenant.ts` and
  `docs/architecture.md`: it fails by omission, and the missing test is the one for the query nobody
  remembered. No other alternative is recorded.

## References

- Commits (approvehr-backend): `21db4ad` (2026-08-20, the extension, `requireDb`, first isolation
  tests), `c66d07b`, `32d9a94` (the completeness test), `9eb9a2d`.
- Binds: `approvehr-backend:src/db/tenant.ts`, `src/middleware/auth.ts`, `docs/architecture.md`
  § "Multi-tenancy", `tests/tenant-isolation.test.ts`, `tests/tenant-scoped-models.test.ts`;
  in this repo `src/lib/marketing/legal.ts` (the public claim) and `HANDOVER.md` § "Conventions
  worth knowing before you write a module".
- Verified against `origin/staging` (94837d8). `origin/main` is behind it: its `src/db/tenant.ts`
  lacks seven models and two door notes added since, and the two test files are identical on both.
