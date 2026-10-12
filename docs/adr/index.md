# Architecture decision records

An ADR records one decision that somebody could reasonably make the other way, and why it was
made this way, so the next person (or agent) does not undo it by accident.

This repo already records decisions, in prose. [`HANDOVER.md`](../../HANDOVER.md) is over 8,000
lines of them, and the rule that an absent figure is not a zero is restated under at least five
separate headings because there is nowhere to cite it from. An ADR is the same record with one
decision per file, so it can be found, linked from code, and superseded.

## When to write one

Write an ADR when the decision is any of these:

- **Costly to reverse.** A data shape, a wire format, a permission, a state machine: anything
  customers' records or money depend on.
- **Easy to undo by accident.** A reasonable newcomer would read the code, think "that is odd",
  and fix it. Money crossing the API as integer kobo, and no demo mode in a production build, are
  both this.
- **Shared between repos**, or about how we ship.

Do not write one for a bug fix, a style preference, something the code already says plainly, or a
feature's design and plan (those go in `docs/superpowers/`). If there was no real alternative, it
was probably not a decision.

## Rules

1. **One decision per file**, titled as the decision ("Money crosses the API as integer kobo"),
   not as the topic ("Money").
2. **`NNNN-kebab-title.md`.** Four digits, the next free number, never reused or renumbered. If
   two open PRs claim the same number, the later one renumbers before it merges.
3. **Status** is `Proposed`, `Accepted`, `Rejected`, `Deprecated` or `Superseded`. Write
   `Accepted` when the decision has been made and the PR records it. Write `Proposed` only while
   it is still open, and let the PR that settles it change the Status and the Date. Keep rejected
   ones: "we looked at this and said no" is worth finding.
4. **An accepted ADR is not rewritten.** Fix a typo or a dead link in place. Anything that
   changes the meaning is a new ADR that says `Supersedes: NNNN`, and the old one becomes
   `Superseded` with `Superseded by: NNNN`. The old text stays, because its value is what was
   known at the time.
5. **Land it with the change.** When a decision comes with code in this repo, the ADR is in the
   same PR, so the reason and the change arrive together. A backend-only decision gets its own
   small PR here, and the backend PR cites the number. A decision made ahead of the code lands
   alone.
6. **Name who decided, and when.** `Date` is the day the decision was made (UTC), not the day it
   was written down. `Decided by` is the person who could have said no. An agent may draft an
   ADR; only a person can accept it.
7. **Say what enforces it.** A gate (`npm run verify-…`), a test, or `review only`, written out.
   Prose is not a check: where a decision has already cost money once, add the gate in the same
   change.
8. **Write the downsides and the alternatives.** Consequences list what gets harder, what is being
   accepted, and what would make us revisit. Each alternative says why not. An ADR with only
   benefits is a sales page.
9. **Backfilling is allowed and must be honest.** Add a `Backfilled` line, date the decision by
   the commit that introduced it, and cite that commit. Where the reasoning was never written
   down, say so; do not reconstruct a context nobody recorded.
10. **Treat an accepted ADR as a constraint.** If a change would contradict one, stop and propose
    a superseding ADR instead of working around it. Code that enforces or depends on a decision
    cites it in a comment (`ADR-0007`), and the ADR lists the files and documents it binds.
11. **Short, and no secrets.** One page, two at most; link out for detail. No passwords, tokens,
    customer names or real employee data.

## Where ADRs sit

| Document                                                                         | Answers                                        | Lifetime                                            |
| -------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------- |
| `docs/adr/`                                                                      | Why is it like this, and may I change it?      | Permanent: superseded, never rewritten              |
| [`docs/superpowers/`](../superpowers/) specs and plans                           | What are we building, and how?                 | One feature; stale once it ships                    |
| [`HANDOVER.md`](../../HANDOVER.md)                                               | What happened, in order, and what to watch for | Accretes. A decision in it worth citing gets an ADR |
| [`docs/pages/`](../pages/index.md), [`docs/components/`](../components/index.md) | What exists                                    | Generated: re-derive, never patch                   |
| [`docs/walkthroughs/`](../walkthroughs/index.md)                                 | How to use the product                         | Hand-written, follows the product                   |

One sequence covers both repos and lives here. `docs/` in this repo already describes the
backend's endpoints and carries hand-offs addressed to it, and the decisions that matter most
(kobo, absent is not zero) span both. Each ADR has a `Scope` of `frontend`, `backend`, `both` or
`process`.

## Writing one

Copy [`template.md`](template.md) to `NNNN-your-title.md`, fill in the header block, and delete
the guidance comments. Add a row to the index below, by hand. `npm run verify-adr` (part of
`npm run check`) fails on a duplicate or skipped number, a header that is not the template's,
supersession that the other record does not agree with, a dead relative link, a leftover template
comment, more than two pages, or an index that does not match the files.

## Index

| #    | Decision | Status | Decided | Scope |
| ---- | -------- | ------ | ------- | ----- |
| 0001 | [Money crosses the API as integer kobo](0001-money-crosses-the-api-as-integer-kobo.md) | Proposed | 2026-08-20 | both |
| 0002 | [The payroll engine exists once, in the backend](0002-the-payroll-engine-exists-once-in-the-backend.md) | Proposed | 2026-08-21 | both |
| 0003 | [An absent figure is never a zero](0003-an-absent-figure-is-never-a-zero.md) | Proposed | 2026-08-21 | both |
| 0004 | [Demo mode cannot exist in a production build](0004-demo-mode-cannot-exist-in-a-production-build.md) | Proposed | 2026-08-22 | frontend |
| 0005 | [Tenancy lives in the scoped client, not in each query](0005-tenancy-lives-in-the-scoped-client-not-in-arguments.md) | Proposed | 2026-08-20 | backend |
| 0006 | [Approving a payroll is the one-way door, and whoever prepared it cannot approve it](0006-approval-is-the-one-way-door-and-the-preparer-cannot-approve.md) | Proposed | 2026-08-20 | both |
| 0007 | [A change reaches production by merge commit through `dev`, `test`, `preprod` and `main`](0007-a-change-reaches-production-by-merge-commit-through-dev-test-preprod-main.md) | Proposed | 2026-09-01 | process |
| 0008 | [An employee acknowledges a rating, and only HR records a dispute](0008-an-employee-acknowledges-a-rating-and-only-hr-records-a-dispute.md) | Proposed | 2026-09-11 | both |

Every record above is `Proposed`. They were drafted by an agent from the code and the git history
(rule 9), and only a person can accept one. Accepting is changing the Status to `Accepted` in the PR
that merges the record, after reading it against the commits it cites. `Date` is the day of the
commit that introduced the decision, not the day the record was written.
