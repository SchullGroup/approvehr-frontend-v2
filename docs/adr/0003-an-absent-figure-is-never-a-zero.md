# 0003 — An absent figure is never a zero

- **Status:** Proposed
- **Date:** 2026-08-21
- **Decided by:** kene (author of 1504fe4; acceptance pending)
- **Scope:** both
- **Supersedes:** —
- **Superseded by:** —
- **Enforced by:** each instance in the table below has its own test (backend tests run in CI, this repo's vitest tests do not), and two signatures refuse `null` at compile time (`npm run typecheck`); the general rule is review only
- **Backfilled:** 2026-10-11 from HANDOVER.md § "Everybody was paid ₦0, and the arithmetic reconciled at every step"; decision dated by `1504fe4` (approvehr-backend)

## Context

On 2026-08-21 `1504fe4` fixed the worst defect the backend had carried. `unpaidDaysFor` counted
every working day with no clock-in as unpaid, and nothing asked whether the company records
attendance at all. For a company that had not adopted clock-in, August 2026 came out as 21 unpaid
days of 21, the contract prorated to nothing, and everybody was paid ₦0. Every figure reconciled
(gross, PAYE, pension, net, run totals), so a check that only asks whether sums agree had nothing to
refuse. The commit message names it "the absent-versus-zero mistake `insights/service.ts` warns
about, in the one module where it moves money".

That warning was the same day's earlier commit, `c4e5699`: dashboard blocks are omitted entirely
when the caller lacks the permission, "not zeroed, not nulled", so the screen never receives what it
cannot show. A different reason (leaking salaries), the same shape.

The reasoning for the rule is recorded in those two commit messages. Not recorded: why `6879c86`
(2026-09-30, cherry-picked from `49eb272` on `main`) removed the incident's own guard. It deleted
`unpaidDaysFor` and `organizationUsesAttendance` so that attendance no longer decides pay at all,
and its message states the behaviour ("pay is now the contractual figure whatever the clock says")
but not the reason. HANDOVER.md still describes the guard as if it were there.

## Decision

A figure that does not exist is represented as absent and shown as absent. A computed zero is a
different fact and stays a zero. Callers test for presence, never for falsiness. The absence takes
one of three shapes, each meaning something different:

- **Key omitted**: the caller may not see it (`insights` dashboard blocks).
- **Explicit `null`**: the caller may see it and there is nothing yet (`payroll: null`, a weighted
  rating before an appraiser has answered).
- **A named state**: it does not apply here (`operates: "NOT_OPERATED"` against `"DEDUCTED"` with a
  real ₦0.00).

Where it applies today, checked on `approvehr-backend` `origin/staging` (94837d8) and on this
branch (paths without a prefix are in this repo):

| Instance                                                       | Code                                                                                                                                     | Pinned by                                                                                                                         |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard blocks omitted; `payroll: null` differs from absent  | `approvehr-backend:src/modules/insights/service.ts`                                                                                      | `approvehr-backend:tests/insights.test.ts` (`"money" in d` is false; "distinguishes 'no run yet' from 'not allowed to see runs'") |
| Deduction not operated vs computed nil                         | `approvehr-backend:src/modules/payroll/engine.ts` (`Operated`), `src/lib/api/payroll.ts`                                                 | `approvehr-backend:tests/payroll-deduction-switches.test.ts` ("keeps a computed nil apart from an absent one")                    |
| Pay spreadsheet: not-operated deduction is a blank cell        | `approvehr-backend:src/modules/exports/service.ts` (`operatedNaira`)                                                                     | `approvehr-backend:tests/exports.test.ts` (NHF cell is `""`, PAYE carries its figure)                                             |
| No mark has no band and no percentage                          | `approvehr-backend:src/modules/performance/scoring.ts` `bandFor(scoreBp: number)`; `src/lib/api/performance.ts` `scoreLabel(bp: number)` | the compiler (`strict`), plus `approvehr-backend:tests/performance-report.test.ts` (null scores, null mean, trend skips a gap)    |
| Weighted rating is `null` until an appraiser answers           | `approvehr-backend:src/modules/performance/service.ts` (`weightedRatingOf`); `src/app/(app)/performance/appraiser-map.tsx`               | `approvehr-backend:tests/appraiser-mapping.test.ts` ("is null until somebody has answered")                                       |
| Rent declaration: `null`, `0` and a figure are three states    | `approvehr-backend:src/modules/employees/service.ts`; `src/lib/types.ts` (`annualRentKobo`)                                              | `approvehr-backend:tests/employees.test.ts`                                                                                       |
| Dashboard widgets draw nothing for an absence, ₦0.00 for a nil | `src/app/(app)/dashboard/widgets.tsx`                                                                                                    | `tests/dashboard-widgets.test.tsx`                                                                                                |

## Consequences

- **Easier:** a reader of a payslip, an export or a report can tell "nothing here" from "nil". A
  wrong zero becomes findable by asking which of the three shapes the value should have been.
- **Harder:** every consumer handles three states. Types carry `?` and `| null`, formatters cannot
  be total (`scoreLabel` and `bandFor` refuse `null` on purpose, so each caller writes its own
  sentence for the absence), and a stored run has to record what it did (`deductsPaye` and the
  like are set at prepare) or a later settings change rewrites what an old payslip says.
- **Accepted:** the rule itself is review only. Nothing catches a new field whose missing value is
  rendered as 0; the type of `netKobo: number` is satisfied by a zero (said in
  `tests/dashboard-widgets.test.tsx`). The rule is restated in comments across both repos rather
  than held in one helper. The incident's own guard is gone: what now prevents the ₦0 payroll is that
  attendance does not feed pay, pinned by `approvehr-backend:tests/payroll-no-attendance.test.ts`.
  That test pins the decoupling, not the rule. Backend tests run in CI (`npm test`); this repo's
  vitest tests are not part of `npm run check` or the CI workflow, so the last row above is not gated.
- **Revisit if:** anything derived from an absence (attendance, a missing rating, a missing date)
  is allowed to feed pay again, in which case the company-level question "does it record this at
  all" has to be asked first; or a shared absent-value type or lint rule becomes practical.

## Alternatives considered

- **Return every figure and let the client hide what the caller may not see.** Named and rejected in
  `c4e5699`: it leaks salaries to whoever opens devtools.
- **Keep `organizationUsesAttendance` and warn on the leftover case.** This was the original fix
  (`1504fe4`, with a `no_attendance_all_period` warning) and the code visibly replaced it in
  `6879c86`. Why was not recorded.
- No other alternative is recorded.

## References

- Commits (approvehr-backend): `c4e5699` (rule first written, 2026-08-21), `1504fe4` (incident and
  fix, same day), `0195186` (`NOT_OPERATED`, 2026-08-22), `6879c86` (guard removed, 2026-09-30).
  Frontend: `5ff5a271` (`scoreLabel`, 2026-08-22), `6a28f2e3` (`Operated` in the client).
- Binds: the files in the table above; `HANDOVER.md` § "Everybody was paid ₦0, and the arithmetic
  reconciled at every step" and the sections that restate the rule.
- `origin/main` is behind `origin/staging` in `insights/service.ts` and `performance/scoring.ts`;
  both still carry the rule there.
- Stale after `6879c86`: comments in `approvehr-backend` (`attendance/day-status.ts`,
  `attendance/summary.ts`, `exports/service.ts`, `imports/attendance.ts`) still cite the removed
  functions.
