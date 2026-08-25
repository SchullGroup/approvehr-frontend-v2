# Company setup — the new-organisation onboarding flow

This is about onboarding a new **company** into ApproveHR (register → the
setup wizard). It is a different flow from new-**employee** onboarding
(`/people/onboarding`, `lib/store/onboarding.ts`), which has its own
checklist and no wizard. Don't conflate the two — several files in this repo
use "onboarding" for both.

## 1. Register (`app/(auth)/register`)

Company name, first/last name, email, password → `POST /auth/register`,
which returns a session directly (no separate "now sign in" step), even
though the response also says `setupCompleted: false`.

## 2. Lands on `/dashboard`, not `/setup` — deliberately

`register-screen.tsx` sends everyone to `/dashboard` even though it already
knows setup is outstanding. `components/portal/setup-gate.tsx` owns the
actual redirect decision instead, and it knows things the register screen
doesn't: whether this account even holds `MANAGE_SETTINGS` (an invited
employee registering wouldn't), and whether the features row has finished
loading. Two places deciding the same redirect is how you get one of them
wrong — so register always goes to `/dashboard` and lets the gate take it
from there.

## 3. `SetupGate` redirects into `/setup`

Mounted inside `AuthGate`, outside the sidebar shell (`app/(app)/layout.tsx`),
so the redirect fires before the app paints. It sends you to `/setup` only
when **all** of:

- signed in, session resolved, features row loaded (no guessing on a
  loading state — that's a redirect somebody has to click their way back
  out of)
- `features.setupRequired` is true
- `can("MANAGE_SETTINGS")` — an employee checking a payslip is not the
  person who decides whether the company runs appraisals
- not already on `/setup` or `/settings/features` (the other half of the
  same job)

It's a `router.replace`, so Back doesn't loop you into it. This is a
redirect rather than a banner on purpose: setup's value is being seen
*before* you've formed a picture of how big the product is, and a banner on
a thirty-item sidebar has already lost that argument. In demo mode this
fires too — once per browser, since `setupRequired` stays true until the
wizard finishes there as well.

## 4. The wizard — 8 questions, one per screen

Served from `GET /setup/wizard` (wording/order/options come from the API,
not hardcoded on the frontend, so copy can change without a release) and
answered one at a time via `POST /setup/wizard/answer`.

| # | Question | What it decides |
|---|---|---|
| 1 | How many people do you pay? | headcount band → turns departments/grades on or off |
| 2 | Does anyone work shifts or nights? | shifts module |
| 3 | Do you give staff loans or salary advances? | loans module |
| 4 | Do staff claim money back from you? | reimbursements module |
| 5 | Do you run formal appraisals? | performance module |
| 6 | Do you deduct PAYE from staff pay? | **payroll engine** — `payeEnabled` |
| 7 | Do you run a pension scheme? | **payroll engine** — `pensionEnabled` |
| 8 | Check in/out on ApproveHR? | attendance module |

Questions 1–5 and 8 decide which **modules** show up in the nav — cheap to
get wrong, since `/settings/features` flips them back on any time.
Questions 6–7 are different in kind: they change what the payroll engine
**computes**. A company with no pension scheme, asked nothing, would have 8%
taken off every salary it runs. So "No" on either renders the API's own
consequence sentence on screen before the click can be made — e.g. pension
"No" cites the Pension Reform Act's 15-employee compulsory-scheme threshold.
That sentence is served, not paraphrased locally, on purpose: two wordings
for one legal fact is how they stop agreeing.

Backend source of truth: `approvehr-backend/src/modules/setup/service.ts`.

## 5. Skipping is real, not deferred

**"Skip this one"** writes nothing — no request at all. The safe default is
already the stored value, and the option carrying it is marked "Now" on
screen, so skipping has a visible consequence rather than a promised one.
Progress on the server is a single forward-only step counter, not a record
per question, so a skipped question is only re-asked if you stop on it
again — answering a later question moves the counter past it.

**"Skip setup"** jumps straight to completion, leaving every unanswered
question at its default.

## 6. Finishing — `POST /setup/wizard/complete`

Idempotent: a second completion does not rewrite `setupCompletedAt`, because
that timestamp is the audit answer to "when did this company go live," and a
stray second POST is not a new go-live.

It also **seeds defaults** so there's something to run on day one without
configuring anything first:

- Nigerian statutory/near-universal leave types (Annual — 20 days, Sick —
  10, etc., per the Labour Act minimums).
- Default payroll settings.

## 7. Done screen

Lists only what got turned **on** — never what didn't, since a list of
things a company doesn't do reads as a list to feel behind about. Two ways
out: straight to `/dashboard`, or "Turn on more features" →
`/settings/features` for anything skipped or answered "No".

## Email verification — a nudge, not a gate

Added 2026-08-25. Registration already issues a verification token
(`issueEmailToken` in `approvehr-backend/src/modules/auth/service.ts`), and
`/verify-email` already exists as a working confirm/resend screen — neither
was ever wired to the setup flow, and nothing checks `emailVerifiedAt`
anywhere. That second part stays true: **the API has no mail transport**
(`src/modules/auth/delivery.ts`), so gating setup on verification would lock
every production signup out with no way to receive the link. Until a
transport is wired, this can only be a nudge.

What was added, frontend-only, no backend change:

- `register-screen.tsx` stashes the register call's `emailVerification`
  hint via `lib/pending-email-verification.ts` (`sessionStorage`, consumed
  once) before the redirect to `/dashboard`.
- `app/(app)/setup/wizard.tsx` picks it up on mount and renders
  `VerificationNudge` — a dismissible callout with a resend button — above
  both the question view and the "Done" screen. Dismissing or resending
  clears it; it does not reappear on a later visit in the same tab, and
  never appears at all for anyone who wasn't the one who just registered
  (e.g. an invited employee signing in for the first time).
- It never blocks a question, "Skip setup", or reaching `/dashboard`.

Known gap: there's no *persistent* signal anywhere in the frontend for "is
this account's email still unverified" — `ApiUser` (`lib/api/endpoints.ts`)
doesn't carry `emailVerifiedAt`, even though `/auth/me` already returns it
in the wire payload. Exposing it there is a small backend-adjacent step
(typing an already-present field) that would let a persistent "still
unverified" indicator exist beyond the one-time post-registration nudge —
not done here, out of scope for a soft nudge scoped to company setup.
