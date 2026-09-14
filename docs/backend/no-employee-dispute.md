# For the backend: the employee dispute is gone from the product

The frontend no longer lets an employee dispute their rating. Everything below
is what the **API** still does, and the decisions that are yours rather than
ours. Nothing in this document has been changed on the backend.

| | |
|---|---|
| **Asked for by** | the product owner — "we wanna remove the ability of an employee to dispute a review" |
| **Done on the frontend** | the dialog's dispute half, the "I do not accept it" button, `useSignOff().dispute`, the `disputeReview` wrapper and `ApiReviewDisputed` |
| **Not done, and cannot be** | the endpoint itself |

---

## 1. The endpoint is still live and still writes

`POST /performance/reviews/:id/dispute` — `src/modules/performance/router.ts:1812`,
service at `src/modules/performance/service.ts:5881`.

Nothing in the product calls it any more. **Deleting a client wrapper closes
nothing**: anybody holding a valid token can still call it with `curl`, and it
will still

- set `Review.disputedAt` and overwrite `Review.employeeComment`,
- notify `finalisedById` *and* `authorId` when they differ,
- write a `review.disputed` audit entry,
- return `{ disputed: true, note: "The rating stands and the dispute is on the record beside it." }`.

A review would then carry a dispute that nothing in the product could have
produced, and the screens would render it — because they still read
`disputed`, deliberately (see §3).

**The decision is yours, and there are three defensible answers:**

| Option | What it means |
|---|---|
| **Refuse it** — `410 Gone`, or `403` | the capability is withdrawn. Cleanest if the product owner means "this is not a thing we do" |
| **Keep it, gate it** on `EDIT_RECORDS` | disputing becomes something HR records on an employee's behalf, off a conversation or an email. Keeps the evidence trail without a self-service button |
| **Leave it** | it is unreachable from the product and stays available to an integration. The weakest of the three — an open write path nobody owns |

We have not assumed which. If you refuse it, the refusal sentence is what our
screens would show, so make it one a person can read.

## 2. What must NOT be changed

- **`Review.disputedAt` and `employeeComment` stay, and existing rows stay.**
  There are real disputes in the data — the demo company has one. A record of
  what somebody formally refused to accept is the last thing a performance
  module should lose, and a migration that cleared them would destroy evidence
  a company may need years later.
- **`GET /performance/reviews?disputed=true`, `marks.disputed` on the cycle
  report, and `report.disputed[]` all stay.** Our register filter, the cycle
  report's Disputed panel and the period status strip still read all three.
  They report history now rather than a live queue, and that is correct.
- **`assertMaySignOff`'s `row.disputedAt` conflict stays**
  (`service.ts:5826`). A review disputed before this change **has been
  answered**. Drop that branch and its subject could acknowledge it as well,
  and one review would carry both answers.

## 3. Why we kept reading `disputed` rather than hiding it

Stated so it does not read as something we forgot. Removing the *ability* to
raise a dispute is not the same as removing the *record* of ones already
raised. Hiding an existing dispute would be a wrong claim about a real
decision, in the module whose entire pitch is that a mark can be defended.

The honest consequence: the Disputed panel on a cycle report will be empty for
every new cycle. If the product owner wants that panel and the register filter
retired once no live dispute remains, that is a second, separate change — and
it needs the data question answered first: are there disputes in production,
and does anybody still need to see them?

## 4. Two open defects this intersects — please read before scheduling

Both were found walking the dispute flow and **both are still live**. Removing
the button does not fix either.

### BE-21 — a send-back nulls the dispute and keeps the words

Reproduced in the dev database on 11 September. Sequence: Chidi disputed his
rating at 10:08; an administrator sent the review back at 10:14.

After the send-back: `disputedAt` **NULL**, `submittedAt` **NULL**,
`finalisedAt` **NULL** — and `employeeComment` still holds
*"Oga manager, I no like am abeg, change abeg."*

So the review records **no dispute** while carrying the dispute's own words,
which the acknowledged branch of our UI would quote as though the employee had
written it in acceptance. The dispute also disappears from
`?disputed=true` and from `marks.disputed`, so the count of disputes in a
cycle can silently fall.

Still reachable after this change, for every dispute already on record.

### BE-22 — a send-back tells nobody

The same send-back produced **no notification of any kind**. Baseline before:
Chidi 34, Adaeze 37. After: Chidi 34, Adaeze 37. Neither the subject nor the
appraiser was told their review had been reopened, and the most recent
notification in the whole database is still the 10:08 dispute.

**This one is entirely independent of disputes** and does not become less
important — a review can be sent back for any reason, and the two people who
have to act on it are not told.

### A third thing, noted in passing

With `disputedAt` nulled by the send-back, `assertMaySignOff`'s
"already disputed" conflict no longer fires, so the one-answer-only rule
resets silently along with the record. Confirmed by reading the guard, not by
pressing it twice.

## 5. Where the frontend change is

Branch `feat/no-employee-dispute`, four files:

| File | What |
|---|---|
| `reviews/[id]/sign-off-dialog.tsx` | acknowledge-only; the dispute half removed |
| `reviews/[id]/review-screen.tsx` | the "I do not accept it" button, and the copy that promised the choice |
| `lib/store/performance.ts` | `useSignOff().dispute` removed |
| `lib/api/performance.ts` | `disputeReview` and `ApiReviewDisputed` removed |

Every read of `disputed` / `disputedAt` is untouched.
