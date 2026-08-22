# Performance management, from first principles

Companion to `PARITY.md`. That document covers the whole product; this one covers
one module, because performance is the module where the incumbent is genuinely
strong and where the cost of being merely comparable is highest.

Audited against `tester.approvehr.io/performance` on 2026-08-21, two ways: by
reading their shipped bundle (`/assets/index-CkXzaI_x.js`, 7.5 MB, unminified
strings), and by reading their live screens in a session the account owner had
already signed in to. No credentials were entered and nothing was written.
Everything attributed to them below comes from one of those two sources.

---

## 1. What an appraisal is actually for

Not "a form once a year". In Nigerian practice an appraisal outcome decides
confirmation after probation, promotion, bonus, and sometimes termination. So the
question the software has to answer is not "did everyone fill it in" but:

> When an employee disputes their rating, can the company show who judged what,
> against which criteria, with which weights, on what evidence, and when?

If it cannot, the rating is not defensible, and an indefensible rating is a
liability rather than a record. **The product's job is an audit trail of
judgement.** Every design decision below follows from that sentence.

This is the same reframing that carried payroll. We did not win the payroll
argument on feature count; we won it because their figures did not reconcile.
The same opening exists here, and §1.1 is the evidence.

### 1.1 What their live performance module actually shows

Four findings, all from their running system.

**Their scoring formula, verbatim from `/performance/configure-scoring-weights`:**

```
Final Score = (Task Completion × 50%) + (Self-Appraisal × 20%) + (Manager Appraisal × 30%)
              ÷ 20 to get score out of 5
```

Three things are wrong with it as a design, independent of any bug:

1. **An employee's self-rating is 20% of their own official score.** Two people
   who delivered identically receive different scores according to how generously
   they rated themselves. "Why is my score lower than his?" — "because you were
   more modest about yourself" is not a defensible answer, and it is a standing
   incentive to inflate. Self-assessment belongs in the *conversation*, as input,
   not as a weighted term in the outcome.
2. **There is no competency component at all.** Task completion, self, manager —
   that is the whole formula. Their appraisal collects competency and behavioural
   ratings and then does not use them for the score. They gather the evidence and
   discard it.
3. **`÷ 20` hardcodes a five-point scale** into the score calculation.

Their own worked example on that page also does not add up: it states
`(90 × 50%) + (85 × 20%) + (88 × 30%) = 88`, where the terms are 45 + 17 + 26.4
= **88.4**. Minor, but it is on the page that explains how everybody's rating is
computed.

**A contradiction on the same screen.** It renders "Weights are properly
configured — Total Weight: 100%" directly above "No Active Review Cycle — Create
and activate a review cycle first before configuring weights", while leaving the
weights editable and *Save Weights* enabled. Two mutually exclusive states, both
asserted, with a live write button.

**A dashboard that does not reconcile.** `/performance` reports:

> Completed Criteria **0** — "Out of **0** total criteria" · Avg Weight Used **0%**
>
> and simultaneously: Performance Score **3.9** "Organization Avg"; distribution
> "Outstanding — 1 employees, Avg criteria completion: **92.4**".

There are zero criteria in total, yet an employee has 92.4% criteria completion
and the organisation has an average score. `/performance/self-appraisal` confirms
there is no active cycle at all ("You don't have an active performance review at
this time"), and the Active Review Cycle card shows `Status: ----`. The headline
number on the module's front page is computed from data the rest of the product
says does not exist. This is the same class of defect as the payroll figures that
were arithmetically impossible.

**An empty framework.** `/performance/competencies` says "No competencies found —
Create your first competency to build your skills framework", and its category
filter offers only *Core Competency*. This is the exact problem `framework.ts`
was written to solve, and its doc comment says so: "every new company faced an
empty screen and had to invent a framework before it could review anybody." We
seed **13 competencies across four categories** on day one. They ship a blank
page — which is also why their formula has no competency term. Nobody has any
competencies to rate.

Their UI carries the scars of the weighting problem too: a **"Resolve Weights"**
button and an **"Avg Weight Used"** column. Both only exist because weights are
allowed to stop summing to 100 and then need patching after the fact. A score
assembled from weights that drifted is exactly the un-defensible artefact above.

### The three rules this module is built on

1. **Agreed before, not graded after.** An objective must be approved before the
   period it covers. Otherwise a manager can set the target after seeing the
   result, and rule 1 is dead.
2. **Weights are validated at the point of entry and frozen at activation.**
   Never "resolved" later. This reuses the pattern payroll already uses — the run
   freezes a settings snapshot at approval, so a later settings change cannot
   silently rewrite history.
3. **Simple by default, complex on request.** A five-person business should set
   three goals, rate them once, and be done, never seeing the words
   "calibration" or "matrix". Their product shows 23 performance routes to
   everybody. That is the usability gap the whole company is built to exploit.

---

## 2. What the backend already has

`src/modules/performance/` is 4,200 lines across `framework.ts` (161),
`router.ts` (788), `schemas.ts` (377), `service.ts` (2,874). Eight Prisma models:
`Goal`, `KeyResult`, `ReviewCycle`, `Review`, `ReviewQuestion`,
`ReviewResponse`, `Competency`, `CompetencyRating`, plus `ScorecardRating`.

Genuinely done, and good:

- **The four-category appraisal framework**, seeded per company and idempotently
  re-runnable — Core competency, Behavioural competency, Key result area,
  Leadership (`framework.ts`). This is what the marketing review email asked
  for, and it already ships. `seedAppraisalFramework` skips a competency whose
  name exists, so a company that renamed one keeps their name.
- **Leadership is deliberately its own category** so that appraising a
  non-manager on it cannot produce a meaningless score somebody then averages.
  The reasoning is already written down in `framework.ts`; it needs *enforcing*
  (see §4.6).
- Competency CRUD, per-employee ratings, **`competencies/gaps` and
  `competencies/heatmap`** — we match their `competency_gaps` and
  `competency_heatmap` already.
- Cycles: create, activate, close, participants, questions with ordering,
  peer reviews, reminders.
- Goals with a **parent/child tree** (`GoalTree`) and `KeyResult` progress —
  their goal model appears flat, so cascading company → team → individual
  objectives is ours to win.
- Reviews with `kind` SELF / MANAGER / PEER, uniqueness on
  `(cycle, subject, author, kind)`, and question/response plumbing with an
  audience per question.

**The `CALIBRATION` discrepancy is settled: neither of the two options above.**
It is a member of `enum ReviewCycleStage`, and `service.ts` uses it correctly —
`STAGE_ORDER` and `STAGE_LABELS` are the cycle's own progression (DRAFT · SELF ·
MANAGER · CALIBRATION · PUBLISHED). It has nothing to do with `ReviewKind` and
nothing to do with `ReviewAudience`.

The paragraph above was comparing a stage constant against the wrong enum, and it
is worth recording *why* that was easy to do, because it will recur: **three**
enums in this module share member names.

| Enum | Members | Means |
|---|---|---|
| `ReviewCycleStage` | DRAFT · SELF · MANAGER · **CALIBRATION** · PUBLISHED | where the whole cycle has got to |
| `ReviewKind` | SELF · MANAGER · PEER | what one review *is* |
| `ReviewAudience` | SELF · MANAGER · PEER · REPORT | who a question is asked of |

`SELF` and `MANAGER` therefore appear in all three and mean something different
in each. The failure mode is somebody "resolving" the discrepancy by adding
`CALIBRATION` to `ReviewKind`, which typechecks cleanly and invents a fourth kind
of review that nothing writes and nothing reads. All three memberships are now
pinned at runtime in `tests/performance-defensibility.test.ts`, and the reasoning
is in a comment above `STAGE_ORDER`.

---

## 3. The gap, precisely

Their 23 routes against ours. Ordered by what it costs us to lack it.

### 3.1 Blocking — the module is not defensible without these

| Gap | Theirs | Ours |
|---|---|---|
| **Goals have no cycle link** | objectives belong to a review period | `Goal` has `dueQuarter String?` and **no `reviewCycleId`** |
| **No objective approval workflow** | `submit-for-review`, `approve`, `reject`, `send-back`, `revert`, `approval-queue` | `publish`, `complete`, `cancel` only |
| **No composite score** | Self-Appraisal Weight + Manager Appraisal Weight + Task Completion Weight, per cycle | nothing |
| **No employee acknowledgement** | — (they lack it too) | `Review` has no `acknowledgedAt` / dispute path |

`Goal.dueQuarter` being a free-text quarter rather than a relation is the root
problem. It means "delivery against objectives" — one of our own four framework
categories, and a `Key result area` we seed by default — **cannot be computed at
review time**. We ship the heading with no way to fill it.

Employee acknowledgement is the one place where neither product has anything and
the legal exposure is real: without a recorded acknowledgement there is no
evidence the employee was ever told their rating.

### 3.2 Significant — present in theirs, absent in ours

- **Confirmation / probation reviews** — `reviews/confirmation_reviews/`. A
  distinct Nigerian practice: probation ends in a confirmation appraisal, which
  often triggers a salary change and pension enrolment. We have no concept of
  it, and it should reach payroll and the employee record, not just performance.
- **Distinct self / manager / HR projections** — `reviews/:id/self-appraisal`,
  `manager-appraisal`, `manager-view`, `hr-view`. We have the *kinds* but one
  `respond` endpoint. HR legitimately sees what a manager must not (e.g. peer
  comments, other managers' scores before calibration).
- **Per-department question sets** — `review-cycles/:id/questions/department/:id/`
  plus `questions/publish`, `questions/status`, `notify-managers`. Ours are
  cycle-wide with no publish gate, so editing a question mid-cycle silently
  changes a form people have already answered.
- **Batch approve** — `reviews/batch-approve/`. An HR lead with 200 reviews needs
  it; without it the product is unusable at size.
- **Longitudinal history** — `appraisal-history/employee_history/`,
  `rating_trends/`, `comparison/`. Performance is only meaningful over time. We
  have none of it.
- **Cycle report** — `review-cycles/:id/report/`; **reminder summary** —
  `reminder_summary/` (who is outstanding, not just "remind everyone");
  **`goal_completion_rates`**, **`review_summary`**.
- **Role dashboards** — `/performance/executive` and `/performance/manager`. We
  have one `/performance` screen for everybody.

### 3.3 Deliberately not copying

**`reviews/:id/generate-ai-judgement/`.** They generate an appraisal judgement
with a model. We should not, and this is a position worth stating publicly
rather than a gap to close:

An AI-authored verdict on a named employee, used to decide pay, promotion and
termination, is unauditable in precisely the way §1 forbids — and in an
employment context it carries discrimination exposure that no Nigerian employer
wants to inherit from their HR vendor. If we touch this at all, the only
defensible shape is: **summarise evidence the humans already entered, label it a
draft, never emit a rating, and keep a human's name on the record.** The
judgement stays the manager's.

---

## 4. The design

### 4.1 Tie objectives to the period they belong to

Add `reviewCycleId String?` to `Goal`, indexed. Nullable, because a standing
operational goal need not belong to a cycle — but a goal that is going to be
*scored* must. Keep `dueQuarter` for now and backfill; drop it in a later
migration once nothing reads it.

This single relation is what makes the `Key result area` category computable.

### 4.2 An objective lifecycle that is agreed, not imposed

```
DRAFT ──submit──▶ AWAITING_APPROVAL ──approve──▶ AGREED ──▶ (scored at review)
                        │  ▲                        │
                   send_back │                   revise (re-approval)
                        ▼  │                        │
                    NEEDS_REVISION ────────────────┘
                        │
                     reject ──▶ REJECTED
```

Four things this must get right, all of them places their flow leaks:

- **`AGREED` is a one-way door for the target**, the way payroll `approve` is.
  After agreement the *target* is frozen; progress still moves. Editing an agreed
  target requires an explicit revision that records who changed what and when,
  and returns it to `AWAITING_APPROVAL`. Silent post-hoc target edits are the
  single most common way an appraisal becomes indefensible.
- **`send_back` carries a required reason.** A rejection with no reason is not
  feedback.
- **Scoring may only read `AGREED` objectives.** A `DRAFT` objective must not
  contribute to a score, and the API — not the UI — enforces that.
- **An employee with no agreed objectives in an active cycle is an exception**,
  surfaced the way payroll surfaces blockers. Silence here is how a cycle closes
  with half the company unscored.

### 4.3 The composite score, and why the weights are frozen

```
final = Σ (component_score × component_weight)

components (each optional per cycle, weights must total exactly 100):
  • Objectives / KRA achievement   ← from AGREED goals + key-result progress
  • Core competencies             ← CompetencyRating, category "Core competency"
  • Behavioural competencies      ← category "Behavioural competency"
  • Leadership                    ← category "Leadership", managers only
```

**Self-assessment is deliberately not a component.** Their formula gives it 20%
of the employee's own score (§1.1), which rewards self-confidence over delivery
and cannot be explained to the person who rated themselves honestly. Ours is
collected, shown side by side with the manager's rating so the gap is visible and
discussable, and weighted at zero. A company that insists can enable it as a
component — but it is off by default, and the settings screen states plainly what
turning it on does to the score.

Note the inversion against them: their score is objectives-only and throws the
competency ratings away; ours makes competencies first-class, which is the whole
reason `framework.ts` seeds a real framework rather than an empty screen.

Rules, all enforced server-side:

1. **Weights must sum to exactly 100 when saved.** Reject the write otherwise.
   No `Resolve Weights` button, because there is never an unbalanced state to
   resolve. This is the specific defect we are beating.
2. **Integer arithmetic**, in basis points internally, for the same reason money
   is in kobo: a score assembled from floats does not reproduce, and a score
   that does not reproduce cannot be defended.
3. **Snapshot the weights onto the cycle at activation** (`ReviewCycle
   .scoringSnapshot Json`). Changing the company's default weights afterwards
   must not retroactively rewrite a closed cycle's scores. Directly the payroll
   settings-snapshot pattern.
4. **A component with no data does not silently score zero.** It is excluded and
   the remaining weights are renormalised, *and the score records that it was* —
   because "rated 0 on leadership" and "not a manager, not rated" are different
   claims. This is the same rule as the dashboard's absent-vs-zero blocks.
5. **Multi-appraiser weights compose with these.** Where several managers appraise
   one person (being built now), their weights resolve *within* the manager
   component before it is weighted against the others.

### 4.4 Sign-off, and the record that the employee was told

Add to `Review`: `finalisedAt`, `finalisedById`, `acknowledgedAt`,
`employeeComment String?`, `disputedAt`.

The employee sees the final rating, and either acknowledges it or formally
disputes it. Both outcomes are recorded; neither is optional-by-omission. A
dispute opens a record, not an argument — HR gets a queue item.

Nobody has this. It is cheap, and it is the difference between a rating that
holds up and one that does not.

### 4.5 Probation confirmation

Add `kind` to `ReviewCycle` — `PERIODIC` (default) or `CONFIRMATION` — or a
dedicated confirmation review keyed to the employee's probation end.

It must not be performance-only. A confirmation outcome touches the employee
record (status probation → confirmed), payroll (a salary change on confirmation
is normal), and pension enrolment. Wire those, or the feature is a form that
changes nothing.

### 4.6 Enforce what `framework.ts` already says

Leadership is only rated for people who manage others. The reasoning is written
in the file; the code does not check it. Derive "manages others" from the team
and reporting structure being built now, exclude the component otherwise, and
renormalise per §4.3 rule 4.

### 4.7 Question sets that cannot change under people

Questions get a publish gate (`publishedAt` on `ReviewQuestion` or the cycle) and
optional department scoping (`departmentId String?`). Once a cycle is active and
questions are published, editing a question people have answered is refused —
offer a new question or a new cycle. Their `questions/status` and
`questions/publish` exist for this reason and we should match it.

### 4.8 The screens

Simple path — what a small company sees, and all it sees:

1. **Set goals** — three fields, a manager approves in one click.
2. **Rate** — one form, the four categories, plain language.
3. **Share** — the employee sees it and acknowledges.

Behind toggles (`OrgFeatures`, the mechanism that already exists, extended for
this): multi-appraiser mapping, weighted components, per-department questions,
peer/360 feedback, calibration, executive dashboard.

New surfaces needed, mapped to routes:

| Screen | Purpose |
|---|---|
| `/performance` | role-aware: my goals + my review, or my team's |
| `/performance/goals` | tree view, cascade company → team → individual |
| `/performance/approvals` | the objective approval queue (their `pending-objectives`) |
| `/performance/cycles/[id]` | run a cycle: participants, questions, progress, who is outstanding |
| `/performance/cycles/[id]/report` | cycle outcome, distribution, completion |
| `/performance/reviews/[id]` | the appraisal itself, projected by viewer role |
| `/performance/history/[employeeId]` | trend across cycles — the longitudinal gap |
| `/settings/performance` | framework, weights, scales, toggles |

### 4.9 Two things neither product has

- **A defined next step for a poor outcome.** A below-expectations rating with no
  attached plan is a number that changes nothing. A light performance
  improvement plan — objectives, a review date, an owner — closes the loop.
- **Evidence attached to a rating.** A rating with a linked goal, a delivered key
  result or a note is defensible; a bare number is an opinion. This is the
  cheapest single thing that makes §1 true.

---

## 5. Order of work

Because each step is useless without the one above it:

1. `Goal.reviewCycleId` + backfill. Nothing else can be computed first. *(§4.1)*
2. Objective approval lifecycle, with `AGREED` as a one-way door. *(§4.2)*
3. Composite scoring: weights validated to 100, integer, snapshotted at
   activation, absent ≠ zero. *(§4.3)*
4. Sign-off and acknowledgement. *(§4.4)*
5. Question publish gate + department scoping. *(§4.7)*
6. Longitudinal history and the cycle report. *(§3.2)*
7. Confirmation reviews, wired to the employee record and payroll. *(§4.5)*
8. Screens, simple path first, toggles after. *(§4.8)*
9. Batch approve and reminder summaries — the at-scale affordances. *(§3.2)*
10. PIP and evidence attachment. *(§4.9)*

Steps 1–4 are the defensibility core. Nothing after step 4 matters if a rating
cannot be explained.

## 6. Sequencing note — resolved

The blocker recorded here is lifted: `AppraiserAssignment` and `AppraiserRole`
are in the schema, so the multi-appraiser weights the composite had to be built
on top of exist.

**Steps 1–4 have landed in the backend** — `Goal.reviewCycleId`, the
`ObjectiveApproval` lifecycle, `ScoringWeight` + `ReviewCycle.scoringSnapshot`
with the composite in `modules/performance/scoring.ts`, and the four sign-off
columns on `Review`. Migration
`20260821221602_performance_defensibility_core`.

**Step 8 has landed for the simple path.** Three routes —
`/performance/approvals`, `/performance/cycles/[id]`,
`/performance/reviews/[id]` — plus the lifecycle actions on the KPI cascade and
the employee's answer on the appraisals tab. `HANDOVER.md`'s last section is the
detail; four things about it belong here because they change what §4.8 and §4.9
should be read to mean.

- **The route list in §4.8 is right and the reason for it needed sharpening.**
  Each of the three is a route rather than a tab because each is arrived *at*: a
  queue from a notification, one cycle by id, one appraisal by id. They are still
  one route per reader — `/performance/reviews/[id]` decides its projection from
  `review.mine`, the subject id and one permission, and says on screen which
  reading you are getting. That last line is worth keeping: it is the cheapest
  possible answer to the four-routes-over-one-record shape the incumbent has.

- **§4.2's last bullet — "an employee with no agreed objectives in an active
  cycle is an exception" — needed a second exception beside it, not a bigger
  one.** No appraiser and no agreed objective are two different silent failures
  with two different fixes, and the interface shows them as two named lists. The
  API already returned both; only one was being rendered.

- **The no-appraiser exception reaches the employee, and that is new.** §6 has it
  as a blocker on the cycle for HR. It is also on the person's own appraisals
  tab, read from `GET /cycles/:id/appraisers/:employeeId` — the endpoint whose
  openness to the subject was justified as "knowing who marks you is not
  privileged", which turns out to be exactly what makes this possible. It cannot
  be inferred from `reviews/mine` and the reason is written down in the store: a
  manager review is absent from `aboutMe` until it is finalised or published, so
  an absence there is the ordinary mid-cycle state.

- **One backend defect surfaced while building the acknowledge step and is
  fixed.** `myReviews.aboutMe` filtered manager reviews to published cycles,
  while `mayReadReview` had always opened a *finalised* one to its subject. So
  finalising told the employee their rating was final and the screen it pointed
  at listed nothing — the last step of the simple path was unreachable from the
  interface. The clause is finalised **or** published now, with assertions on both
  halves.

Still not started, and each for a stated reason in `HANDOVER.md`:
`/performance/cycles/[id]/report`, `/performance/history/[employeeId]`,
`/settings/performance` (the weights endpoint is wrapped and unrendered), the
question publish gate and department scoping (§4.7 — no API for either), and
batch approve (§3.2). Nothing on those screens says "calibration" or "matrix",
which is §4.9's actual test.

One deliberate deviation from §4.3 worth knowing about before building the
screens. Rule 5 refers to "the manager component", and the component list above
does not have one — it has objectives plus three competency categories. Both are
right, and the resolution is that the appraisers' overall mark is **returned but
not scored**, as `appraiserMark`, weighted across assigned appraisers by their
`weightBp` over the weight that has actually come in:

- Scoring it as a fifth component would count one judgement twice. The manager's
  overall rating *is* their summary of the competencies they just rated, and
  weighting the same fact twice is the specific defect §1.1 catalogues in the
  incumbent's formula, not a feature to copy.
- Competency ratings cannot disagree between appraisers by construction: the
  unique constraint on `(competencyId, employeeId, reviewCycleId)` means one
  assessment of record per competency per cycle, so a re-rate is a correction
  rather than a second opinion. `appraiserMark` is therefore the only figure
  several appraisers hold different views of, which makes it the only place their
  weights have anything to resolve.

If a company wants the manager's overall mark scored, it becomes a component with
a weight like any other — deliberately, visibly, and summing to 100 with the
rest.
