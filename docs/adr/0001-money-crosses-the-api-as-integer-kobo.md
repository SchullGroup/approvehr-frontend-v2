# 0001 — Money crosses the API as integer kobo

- **Status:** Proposed
- **Date:** 2026-08-20
- **Decided by:** kene (author of bfd2244; acceptance pending)
- **Scope:** both
- **Supersedes:** —
- **Superseded by:** —
- **Enforced by:** partly. Backend `engine.test.ts` ("keeps every figure a whole number of kobo"), `payroll-quote.test.ts` and `payroll-public-calculator.test.ts` ("refuses a gross that is not an integer number of kobo"), and the runtime identities in `reconcile.ts`. That every wire field is kobo is review only.
- **Backfilled:** 2026-10-11 from HANDOVER.md § "Conventions worth knowing before you write a module"; decision dated by bfd2244 (`approvehr-backend`, 2026-08-20 13:00 UTC)

## Context

Payroll here has to reconcile to the bank file. Binary floating point cannot represent 0.1, so a run
summed in floats across a few hundred people can be out by kobo and will not match the payment file.
That reasoning was written down at the time, in three places in the backend's first commit
(21db4ad): the `prisma/schema.prisma` header ("Money is `Decimal`, never `Float`"), the
`src/lib/money.ts` header, and the "Why integers" note in `payroll/engine.ts`, which also says the
frontend prototype had been using floating-point naira. `money.ts` adds that whole kobo are exact up
to 2^53 (about ninety trillion naira), so integers are used "rather than a decimal library".

The next commit that returned money over HTTP, bfd2244 (the employees module), is where the wire
rule appears: `serialize()` sends `grossMonthlyKobo` ("the unit is in the name, the value is an
exact integer, and no float ever crosses the wire"), and the create schema refuses fractional kobo
instead of rounding it ("if a caller sends 12345.6 they have a bug").

Not recorded: why integers on the wire rather than decimal strings, which are what the database
column type would have produced for free.

## Decision

Money is held and exchanged as whole kobo (1 naira = 100 kobo). JSON fields that carry it end in
`Kobo`, and a request carrying a fractional kobo is refused, not rounded. The database stores naira
as `Decimal(x, 2)`; conversion happens at the edge through `toKobo` and `toNaira` in
`approvehr-backend:src/lib/money.ts`, and arithmetic between the two edges is on integers. The
frontend keeps `…Kobo` types and converts to naira only where a figure is rendered.

## Consequences

- **Easier:** sums and comparisons are exact, so `reconcile.ts` can demand equality in kobo with no
  tolerance. A unit in the field name makes a naira/kobo mix-up visible in review.
- **Harder:** two units meet at every edge, and a missed or doubled conversion is a hundredfold
  error on a payment file. The frontend `Employee.grossMonthly` is still naira, so `toEmployee` in
  `src/lib/api/endpoints.ts` is a live seam; `annualRentKobo` is deliberately the one field already
  in kobo, and the record page's `type: "money"` exists to stop naira being written into it.
- **Accepted:** the rule is not uniform today, and HANDOVER's "every money value crossing this API
  is integer kobo" overstates it.
  - `GET /payroll/runs` and `GET /payroll/runs/:id` return raw Prisma rows, so their money is naira
    `Decimal` strings (`totalNet`, `gross`, `net`). The frontend converts them with
    `koboFromDecimal` in `src/lib/api/payroll.ts`, and a second copy, `koboFromDecimalString`,
    lives in `src/lib/api/payments.ts`.
  - At b44b34f the frontend defines `naira`/`kobo`/`toNaira`/`toKobo` 36 times across 26 files,
    although the `endpoints.ts` header calls itself the only place that conversion happens, and
    `payroll.ts` says screens never write `/ 100` while `advances-screen.tsx` divides a kobo
    figure by 100 itself 13 times.
  - `toKobo` itself is `Math.round(Number(x) * 100)`. That is exact for two-decimal naira at payroll
    magnitudes, but it means the convention is "convert once at the edge", not "no float is ever
    involved". Two backend sites convert a `Decimal` without going through `toKobo`:
    `employees/employment-changes.ts:133` and `payroll/service.ts:2193` (the wallet debit on
    approval), at 94837d8 on `origin/staging`.
  - The billing models (`Plan`, `Subscription`, `BillingPayment`, `SubscriptionOrder`) store `Int`
    kobo; the payroll, employee and wallet columns are `Decimal`.
- **Revisit if:** a figure could exceed 2^53 kobo, or the payroll read endpoints get a serialiser
  and `Employee.grossMonthly` is renamed to kobo (HANDOVER § "Still not done", item 5), at which
  point the duplicated helpers should collapse to one module.

## Alternatives considered

- **Floating-point naira.** What the frontend prototype used; replaced because it cannot reconcile
  (`engine.ts` header).
- **A decimal library.** Named in `money.ts` as the alternative integer kobo was chosen over;
  no further reasoning is recorded.

No other alternatives were recorded.

## References

- Commits: bfd2244 (wire rule, 2026-08-20), 21db4ad (representation and rationale, 2026-08-20),
  both in `approvehr-backend`.
- `approvehr-backend:src/lib/money.ts`, `prisma/schema.prisma` (header rule 2),
  `src/modules/employees/schemas.ts` and `service.ts`, `src/modules/payroll/engine.ts` and
  `reconcile.ts`, `docs/architecture.md` § 4.
- `src/lib/api/endpoints.ts`, `src/lib/api/payroll.ts`, `src/lib/api/payments.ts`;
  `HANDOVER.md` § "Conventions worth knowing before you write a module".
- Related: ADR 0003 (an absent figure is never a zero; `grossKoboOrNull` in `money.ts`).
