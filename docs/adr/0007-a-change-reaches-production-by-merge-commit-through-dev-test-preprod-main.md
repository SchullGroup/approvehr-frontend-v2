# 0007 — A change reaches production by merge commit through `dev`, `test`, `preprod` and `main`

- **Status:** Proposed
- **Date:** 2026-09-01
- **Decided by:** Abdullah Jamiu (merges every promotion PR; acceptance pending)
- **Scope:** process
- **Supersedes:** —
- **Superseded by:** —
- **Enforced by:** review only. GitHub allows merge, squash and rebase merges on this repo and none of `dev`, `test`, `preprod`, `main` or `staging` is protected.
- **Backfilled:** 2026-10-11 from observed practice (PR history), not from a document; see Context for what was never written down

## Context

Nothing in either repo describes how a change reaches production. This record is rebuilt from the
PR history of `SchullGroup/approvehr-frontend-v2`, and the dates below are what that history shows.

- **The chain.** Work is merged by PR into `dev`. A PR then carries `dev` into `test`, `test` into
  `preprod`, and `preprod` into `main`. PRs from `dev` into `test` (#150) and into `preprod` (#149)
  begin on 2026-09-01. Before that, and for some weeks after, `dev` was also merged straight into
  `main` (#1 on 2026-08-26 up to #326 on 2026-09-18). PRs from `preprod` into `main` begin at #309
  (2026-09-15) and are the only route into `main` from #328 (2026-09-18) on, with two exceptions
  that are not promotions: a feature branch (#379, 2026-10-07) and a hotfix (#399, 2026-10-10).
  So the strict four-step chain is a habit that settled in September, not a day it was switched
  on. 2026-09-01 is the first day the first two steps are PRs.
- **Merge commits only.** A squash of `staging` into `dev` (#354, `66e41b1`, 2026-09-28) cut the
  ancestry between the two lines. Mending it took two reconcile PRs on 2026-09-30 (#368 and #369).
  After that, every promotion has been merged with "Create a merge commit".
- **`staging` is a separate line.** It is not a step in the chain. Several people commit to it
  (non-merge commits since 2026-09-10: kene 135, Joseph Chinedu 89, roji-tech 46, Tolu Joel 12,
  Abdullah Jamiu 5), it has at times carried work `dev` lacked, and it is kept level with `dev` by
  merging `dev` into it, never by resetting it. This was inferred from the commits and from how
  it was handled on 2026-10-09 and 2026-10-10; no document says it.
- **What deploys.** On GitHub, the Vercel *Production* deployment follows `test`, and that site
  is the one QA tests. A merge into `main` shows only a Preview deployment, so GitHub cannot tell
  us when the production site builds `main`. `.github/workflows/ci.yml` (8a9d758d, 2026-09-07)
  says `test` "is the branch that ships" and `main` "is a record rather than a release". That
  contradicts the idea that `main` is production, and nobody has recorded which is right.

**Not written down, and not reconstructed here:** why four lines rather than fewer, why `staging`
is separate, and which branch the customers' own site is built from. The reasoning above is
inferred from behaviour. Whoever accepts this ADR should correct the last point.

## Decision

A change reaches production only through a PR from the line before it, merged as a **merge commit**,
in the order `dev`, `test`, `preprod`, `main`. Each PR carries what the line before it holds, with
nothing added on the way. `staging` is kept out of the chain and is synchronised with `dev` by
merging, in either direction, never by reset or force-push.

## Consequences

- **Easier:** a promotion is a diff of two named lines. The tree of `dev`, `test` and `preprod`
  can be proved equal with `git merge-tree --write-tree`, so a verified tree is not re-verified at
  each step. Ancestry stays intact, so `git cherry` and `git log A..B` keep telling the truth.
- **Harder:** one change takes up to four PRs, each waiting for a 2 to 3 minute CI run before it
  can be merged. A fix meant for two lines (`dev` and `staging`) is merged twice, from one branch.
- **Accepted:** nothing stops a squash, a direct push, or a force-push on any of these branches.
  The rule holds only while people hold to it, and it was broken once at a cost of two PRs. vitest,
  Playwright and `verify-demo:build` are not in CI, so a promotion is only as tested as whoever
  opened it ran.
- **Revisit if:** the production site is confirmed to build from a branch other than `main`,
  `staging` stops being its own line, or a second squash happens.

## Alternatives considered

- **Squash or rebase merges.** Both are enabled on the repo. Squash was used once (#354) and
  forced the 2026-09-30 reconcile; the reason it was dropped is the ancestry it cut.
- **Fewer lines.** The reasoning for four was not recorded.
- **Protecting the branches.** No branch is protected. Whether that was a choice is not recorded.

## References

- PRs: #1, #149, #150, #309 (first of each route), #354 (the squash), #368 and #369 (the
  reconcile), #398 and #401 (the most recent promotions, 2026-10-10).
- `.github/workflows/ci.yml`: runs on pushes to `main`, `preprod` and `test`, and on every PR.
- `HANDOVER.md` § "There is a second Vercel deployment, and it is the one to test against" names
  the QA site and its backend.
