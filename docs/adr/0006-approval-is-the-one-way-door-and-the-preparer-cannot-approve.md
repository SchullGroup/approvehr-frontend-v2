# 0006 — Approving a payroll is the one-way door, and whoever prepared it cannot approve it

- **Status:** Proposed
- **Date:** 2026-08-20
- **Decided by:** kene (author of `cc9e0c0`, `710b365` and `cf9839a`, all approvehr-backend; acceptance pending)
- **Scope:** both
- **Supersedes:** —
- **Superseded by:** —
- **Enforced by:** approvehr-backend tests, run by its `npm run check` and CI: `tests/payroll-cancel-and-reprepare.test.ts` ("approval is still the one-way door", "cancelling cannot be used to walk back through it"), `tests/payroll-overtime-override.test.ts` ("the person who prepared it does not approve it"), `tests/payroll-maker-checker.test.ts` (who counts as "somebody else", including the "can actually sign in" clause), `tests/payroll-deduction-switches.test.ts` ("an approved run cannot be rewritten by a later switch"). Not pinned by any test: that preparing settles nothing. Frontend: review only.
- **Backfilled:** 2026-10-11 from `HANDOVER.md` §§ "Assembling a payroll run", "Maker and checker" and "Walking the payroll flow found four things 2,109 tests did not", checked against `origin/staging` of approvehr-backend; decision dated by `cc9e0c0`

## Context

A payroll run is built, read, fixed and built again several times before anyone pays from it, and
approving it consumes real things: loan instalments, expense claims, overtime. Three commits,
each with its reasoning in its message, made the rules:

- `cc9e0c0` (2026-08-20): preparing is re-runnable and settles nothing, "because the normal loop
  is run it, read the exceptions, fix a bank account, run it again", and consuming an instalment
  on prepare would take two months of repayment from somebody on the second run. Approval is the
  one-way door, and the settings are frozen onto the run there so a 2026 payslip still explains
  itself in 2029.
- `710b365` (2026-08-29): `RUN_PAYROLL` and `APPROVE_PAYROLL` were separate permissions, but one
  person holding both could change a figure and release the money alone. Hand-entered tax and
  overtime had just made figures adjustable.
- `cf9839a` (2026-08-29): found by walking the flow end to end. `cancel` refused only `PAID`, so an
  `APPROVED` run could be cancelled and the loans it settled stayed settled; with `prepare` also
  reopening cancelled periods, approve, cancel, prepare would have made approval reversible.

## Decision

1. **Preparing settles nothing.** In `src/modules/payroll/service.ts` the settlement calls
   (`applyRepayment`, `markClaimsPaid`, overtime `markPaid`, `recordRecovery`) appear only inside
   `approve`.
2. **Approving is one-way.** It settles what the run consumed and writes `settingsSnapshot` (the
   run's own deduction columns, not today's settings). `prepare` refuses an `APPROVED` or `PAID`
   run; `cancel` refuses both too, with separate messages: "cannot re-run" and "cannot take back".
   A cancelled run can be prepared again.
3. **Whoever prepared a run cannot approve it, unless nobody else could.** `approve` compares the
   approver with `preparedById` and refuses (409) if they match and at least one other account
   exists that is not archived, has a password and holds `APPROVE_PAYROLL` through a role. That is
   counted from the database at approval time, not configured. A null `preparedById` is not
   refused.

## Consequences

- **Easier:** the prepare, fix, prepare loop is safe. An approved payslip does not change when a
  setting later does. A one-owner company can still run payroll, and segregation starts by itself
  when a second approver is added and relaxes when they go.
- **Harder:** nothing in the product undoes an approval. The refusal says to raise a correction on
  the next period, and the code supports off-cycle runs for that.
- **Accepted:** the control exists only while a second approver does. `preparedById` is set from
  the caller's employee id only (`POST /payroll/runs`), so an account with no linked employee
  record leaves it null and is never refused at approval; the null rule was written for seeds and
  scripts and this case was not recorded as a decision. **Still open:** it needs the employee id or,
  failing that, the user id stamped on the prepare side, at about a dozen call sites, and the
  approver excluded from the count by either id.
- **Fixed on 2026-10-21 (approvehr-backend #201):** the count of "somebody else" filtered
  `employeeId: { not: approvedById }`, and on a nullable column that drops the rows where it is null.
  A company whose only other approver has no employee record counted 0 other approvers, so the
  preparer could approve their own run although a second approver existed (checked on 2026-10-11 on
  the scratch database, Prisma 7.9.1, Postgres 16). It reads
  `OR: [{ employeeId: null }, { employeeId: { not: approvedById } }]` now. The "can actually sign in"
  clause (`passwordHash: { not: null }`) has a test that fails without it: removing any one of the
  `passwordHash`, `archivedAt` or `roleHolds` clauses fails a case in
  `tests/payroll-maker-checker.test.ts`.
- `RUN_PAYROLL` plus `APPROVE_PAYROLL` in one role is only reported in the role editor, never
  blocked; the approval-time check is the control. The maker is whoever last rebuilt the figures, by
  design.
- **Revisit if:** a customer needs reversible approval (it would need its own ledger and audit),
  or accounts without employee records start preparing runs.

## Alternatives considered

- **Settle on prepare.** Rejected in `cc9e0c0`: running it twice takes two months of repayment.
- **Let `cancel` take back an approved run** (the code before `cf9839a`). A defect, not an
  option: it left loans settled against a run called cancelled.
- **Refuse the lone owner, or make segregation a setting.** Rejected in `710b365`: refusing stops
  the business and people would share a login, which is worse than no control.

Same shape elsewhere, each with its own copy of the count: hiring (`assertHiringSegregation`,
keyed on the hiring manager) and employment changes (`approverCount`, on the proposer).

## References

- Commits (approvehr-backend): `cc9e0c0`, `710b365`, `cf9839a`; all on `origin/main` and
  `origin/staging`.
- Binds: `approvehr-backend:src/modules/payroll/service.ts` (`prepare`, `approve`, `cancel`,
  `assertNotApprovingOwnWork`), `approvehr-backend:src/modules/payroll/router.ts`,
  `approvehr-backend:src/modules/recruitment/service.ts`,
  `approvehr-backend:src/modules/employees/employment-changes.ts`,
  `src/app/(app)/payroll/runs/new/wizard.tsx` (offers Cancel only in `DRAFT` or `IN_REVIEW`),
  `src/lib/api/payroll.ts`, `HANDOVER.md` §§ above.
