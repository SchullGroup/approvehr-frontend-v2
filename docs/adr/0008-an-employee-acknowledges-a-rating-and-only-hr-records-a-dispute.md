# 0008 — An employee acknowledges a rating, and only HR records a dispute

- **Status:** Proposed
- **Date:** 2026-09-11
- **Decided by:** kene (author of `04451f4`, backend) and roji-tech (author of `c7bdeb42`, frontend); acceptance pending
- **Scope:** both
- **Supersedes:** —
- **Superseded by:** —
- **Enforced by:** approvehr-backend `tests/performance-defensibility.test.ts` ("refuses a dispute from the person the rating is about", and the one-answer-only case beside it). Nothing on the frontend enforces it; the control was simply removed.
- **Backfilled:** 2026-10-11 from `docs/backend/no-employee-dispute.md` and the two commits above

## Context

A rating that has been finalised can be answered in two ways: the person it is about acknowledges
it, or it is formally disputed. Until 2026-09-11 the subject could do either from the product. The
product owner then asked for the employee's ability to dispute to be removed ("we wanna remove the
ability of an employee to dispute a review"). The reason recorded in the backend commit is that the
person a rating is about is exactly who should not also decide whether a disagreement becomes a
formal record.

Two things were done the same day, in two repos, and the second did not know about the first:

- **Backend, `04451f4`** (kene, 12:31 UTC+1): `POST /performance/reviews/:id/dispute` is gated by
  `assertMayDispute`, which needs the `EDIT_RECORDS` permission (the same `isHr` check that
  `finaliseReview` uses). Acknowledging stays the subject's own. Merged to `staging` in PR #137
  (2026-09-16) and is on `main`.
- **Frontend, `c7bdeb42`** (roji-tech, 17:50 UTC+1): the dispute half of the sign-off dialog, the
  "I do not accept it" button, `useSignOff().dispute` and the `disputeReview` wrapper were
  deleted. `docs/backend/no-employee-dispute.md` was written as a hand-off asking the backend to
  choose between refusing the endpoint, gating it on `EDIT_RECORDS`, or leaving it. It says
  nothing on the backend had changed; the backend had already chosen the second option.

The reasoning beyond the one sentence in the commit message was not recorded.

## Decision

An employee can acknowledge a finalised rating and cannot dispute it. A dispute is recorded by
someone holding `EDIT_RECORDS`, after the employee has told them, and a rating is answered once:
acknowledged or disputed, never both. A dispute sits beside the rating and never changes the mark.
Existing disputes, and every way of reading them, stay.

## Consequences

- **Easier:** the person a rating is about cannot create the record that questions it. A dispute is
  always attributable to a named HR user in the audit trail (`review.disputed`).
- **Harder:** an employee who disagrees must go to HR outside the product. The product has no
  screen for HR to record one either: the wrapper was deleted and nothing calls the endpoint.
  `reviews/[id]/review-screen.tsx` still lists "recording a dispute" among what the Records
  permission can do in its header comment, but no control does it.
- **Accepted:** two defects on the send-back path, both still present on `staging`. `requestRevision`
  clears `disputedAt` but leaves `employeeComment`, so a review can carry a dispute's words with no
  dispute on record, and the dispute drops out of `?disputed=true` and the cycle report's count. It
  also notifies nobody that a review was reopened. Both were found on 2026-09-11 (the hand-off
  calls them BE-21 and BE-22) and neither is fixed here.
- **Revisit if:** HR needs to file a dispute from the product (build the control), the product
  owner wants disputes gone entirely (then the read paths, the register filter and the cycle
  report's Disputed panel go too, after asking whether production holds any), or send-back is
  changed.

## Alternatives considered

- **Refuse the endpoint** (`410` or `403` for everyone). Cleanest if disputes are "not a thing we
  do". Not chosen: real disputes exist in the data and a way for HR to record one was wanted.
- **Leave it open.** The weakest of the three: an open write path nobody owns, reachable with a
  token and `curl` although nothing in the product calls it.

## References

- Commits: `04451f4` (approvehr-backend), `c7bdeb42` (this repo). PR #137 (approvehr-backend).
- `docs/backend/no-employee-dispute.md`, the hand-off this answers.
- approvehr-backend: `src/modules/performance/service.ts` (`assertMayDispute`, `assertMayAcknowledge`,
  `assertSignOffIsOpen`, `disputeReview`, `requestRevision`), `src/modules/performance/router.ts`
  (`/reviews/:id/dispute`).
- This repo: `src/lib/api/performance.ts` (a comment where `disputeReview` was),
  `src/app/(app)/performance/reviews/[id]/review-screen.tsx`.
