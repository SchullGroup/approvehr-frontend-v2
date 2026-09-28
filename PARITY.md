# Parity with the incumbent — what is missing, and how to close it

The bar has never been "looks better". It is **"a customer can move onto this and
lose nothing"**. This document is the gap between us and the incumbent, and the
order to close it.

---

# Revision note — 13 September 2026

**This document had gone badly stale, and a contributor reading it would have
been misled about the size of their own product.** The version before this one
was written on 20 August 2026 and recorded 16 backend modules, 86 models and 52
frontend routes, with Phases 2 through 4 listed as pending. Between then and now,
offboarding, assets, documents, policies, shifts, the audit trail, the wallet and
payment execution, performance depth, the help desk, the knowledge base, the
public careers page, webhooks and the recruitment backend all shipped. Read
against today's tree, **most of the feature-count deficit this document was
written to address is gone.**

Two things changed in this revision:

1. **The benchmark moved from the old Django system to SeamlessHR's own
   published module list.** The original audit was read from the source of the
   legacy system we were replacing. That was the right comparison when the job
   was migrating a customer off it. The job now is winning against the market
   leader, so the comparison is the market leader's own support site —
   `support.seamlesshr.com`, read module by module, with two modules fetched in
   full.
2. **The tier lists are gone, because they closed.** Tiers 1, 2 and 3 described
   what was missing in August. Nearly all of it now exists. Keeping the list
   would have meant a document whose largest section described solved problems.
   What replaced it is a module-by-module table against the new benchmark and
   five remaining gaps.

What was **kept deliberately**: the six rules below, because they are the
product's design philosophy and `HANDOVER.md` cites them by number; and the
August audit of the incumbent's live figures, because that evidence does not go
stale and it is the whole of the positioning argument.

---

## The headline

Counted from source on 13 September 2026, so the next revision can be checked
against something:

| | Then (20 Aug) | Now |
|---|---|---|
| Backend modules | 16 | **45** |
| Prisma models | 86 | **140** |
| Migrations | — | **92** |
| Backend test files | — | **155** |
| Frontend routes (signed-in product) | 52 | **95** |
| Frontend routes (all groups) | — | **114** |
| Frontend verification gates | — | **18** |

Against SeamlessHR's own published module list: **21 of roughly 26 modules are
answered outright, two are partial, and three are genuinely missing** — one of
which we should decline to build. The detail is the table below.

**Route count is still the incumbent's disease, and must not become ours.** Their
~120 routes exist because every module grew a page per audience —
`/performance/executive`, `/performance/manager`, `/performance/my-objectives`
are three routes rendering one concept to three readers. We are at 126 and every
one of them has to keep earning its place.

**A second measure of the same disease, found later and worth more than the
route count.** SeamlessHR's own public support site carries **164 help articles
for the performance module alone** — 72 for the administrator, 27 for the
employee, 13 for the supervisor, 31 general guides, 21 videos — plus an **80-entry
FAQ**. The settings interface has a "Frequently Used" tab so administrators can
bookmark the settings they need, which is a feature only a settings screen
nobody can navigate ever grows. Documentation volume is a proxy for how much a
product has to be explained, and 164 articles for one module is the number to
hold this product against. **Each gap closed below lands behind
an `OrgFeatures` flag or it erodes Rule 2.**

---

## Module by module, against SeamlessHR

Their module list, read from their support site. Ours, verified by grep against
the schema and the service layer rather than from memory — the word "promotion"
appears five times in this codebase and every one is a comment, which is exactly
how an assumed gap turns out to be real, or an assumed feature turns out not to
exist.

| SeamlessHR module | Us | What answers it |
|---|---|---|
| HRMS / HRIS core | **Have** | `employees`, `departments`, `teams`; directory, record, org chart |
| Seamless Payroll | **Have** | `payroll`, `pay-components`, `payments` — and verified against statute, which theirs is not |
| Leave | **Have** | `leave`; entitlement, accrual, rollover, gazetted holidays |
| Time and Attendance / SeamlessTime | **Have** | `attendance`, `shifts`, `overtime`, device enrolment |
| Exit Management | **Have** | `offboarding`; `ExitProcess`, `ExitTask`, `ExitInterview` |
| Recruitment Management | **Have** | `recruitment` + `careers`; requisition → offer → employee, public job board |
| SeamlessPerformance | **Have** | `performance`; cycles, competencies, nine-box, calibration, weighted scoring |
| Competency | **Have** | `Competency`, `CompetencyRating`; skills matrix and gap view |
| Loan | **Have** | `loans`; schedules that deduct through the run |
| Financial Products | **Have** | `advances` (earned wage access), `benefits` |
| Asset Management | **Have** | `assets`; categories, assignment, maintenance, repair requests |
| Disciplinary | **Have** | `conduct`; `DisciplinaryAction` |
| Announcement | **Have** | `announcements` |
| Approval Workflow / Request Manager | **Have** | `approvals` — as *one* cross-module inbox, where theirs is four queues |
| Reports & Analytics | **Have** | `reports`, `insights`, saved reports, report builder |
| System Control / roles | **Have** | `permissions`; escalation and last-owner guards |
| Audit Trail | **Have** | `audit`; `AuditEvent` |
| Company Settings | **Have** | `company`, `setup`; the wizard writes the feature flags |
| Requisition | **Have** | `Requisition`, with approval and band |
| Change Management | **Have** | `EmployeeChangeRequest`; staff-raised changes routed for approval |
| Employee Self Service | **Have** | `/profile`, change requests, payslips, leave, tickets |
| Onboarding **and confirmation** | **Partial** | `onboarding` exists; `EmploymentStatus.ONBOARDING` is a label with no probation clock behind it |
| Job Management | **Partial** | `SalaryGrade` carries bands; no job description or role catalogue — zero hits for either |
| Promotion | **Missing** | Nine-box and grade neighbours inform it; nothing records or executes it |
| Redeployment | **Missing** | A department is editable on the record; no transfer request, approval or history |
| Survey | **Missing** | One incidental mention, in an offboarding checklist comment |
| Learning Management | **Missing** | No module, no model |
| SeamlessProcure | **Declined** | See "What we will not build" |

---

## The five gaps that remain

Ranked by what it costs a thirty-person Lagos company to be without it, not by
how visible the gap is on a feature grid. Sizing is deliberately coarse.

### 1. Probation and confirmation — ~1 week

The cheapest real gap, and the only one with a live defect attached.
`EmploymentStatus.ONBOARDING` is a label nothing ever moves off, and
`modules/imports/employees.ts` maps a spreadsheet's "probation" onto it — so
imported probationers are indistinguishable from staff nobody got round to
activating, **and nothing tells anybody a probation is ending.** A confirmation
everyone forgot is a legal problem six months later, not an admin one.

1. `probationEndsAt` and `confirmedAt` on `Employee`, defaulted from a company
   setting at create and at offer acceptance.
2. Surface it where every other deadline in this product already lives — the
   approvals inbox — at 30 and 7 days out, as a decision carrying **Confirm**,
   **Extend** and **Do not confirm**.
3. Write the decision to the audit trail with its decider, and generate the
   letter from the existing document templates.
4. Feed the performance score bands in: `modules/performance/scoring.ts` already
   says in a comment that those bands decide confirmation, and nothing acts on it.

### 2. Promotion and redeployment — ~2 weeks

Every input exists and no act does. Nine-box placement, grade neighbours ("one
grade up" is already a computed question in `grades/service.ts`), salary bands,
department and team membership. A promotion today is somebody editing two fields
on a record page, with nothing remembering why.

**These are one feature, not their two modules**: both are *a proposed change to
an employment record that needs approving and remembering*.

1. One `EmploymentChange` model — kind (promotion, transfer, grade, pay),
   effective date, from/to snapshot, requester, approver, reason.
2. Route it through `approvals` like everything else.
3. **Effective-dated, never immediate.** A promotion effective 1 October must not
   move October's payroll when the run is prepared on 28 September. This is the
   one place this feature can silently move money, and it is the assertion to
   write first.
4. Render the history on the record page. That history *is* the feature — it
   answers "why is she on Grade 5" years later.
5. The transfer half reuses `alignMemberDepartments`, so the cost-centre rule is
   already written.

### 3. Job descriptions and a role catalogue — ~1 week

`jobTitle` is free text on the employee and free text again on the requisition.
Grades carry the money; nothing carries the job. Low urgency, high leverage: a
role catalogue is the join between recruitment, grades and competencies that all
three currently do without, and it is what makes a per-role competency set
actually assignable.

1. `JobRole`: title, family, default grade, description, competency set.
2. Employee and requisition titles reference it, free text kept as fallback so no
   existing record breaks.
3. Reuse it in the offer letter, which today restates a title typed twice.
4. Bulk import from day one — Rule 6 applies, a company arrives with a
   spreadsheet of roles.

### 4. Surveys — ~2 weeks

Worth building mostly because **two things already shipped are surveys wearing
other names**: the exit interview, and the review questions in performance. A
generic instrument lets the exit interview become configurable instead of
hardcoded, which is a request that will arrive anyway.

1. `Survey`, `SurveyQuestion`, `SurveyResponse`, with anonymity a property of the
   survey and **enforced at read time, not by convention** — an "anonymous"
   survey whose responses can be joined back to a person is worse than no survey.
2. Suppress results below a threshold, so a three-person team cannot be
   de-anonymised by subtraction.
3. Re-point the exit interview at it rather than keeping two question engines.
4. Behind an `OrgFeatures` flag, off by default.

### 5. Learning management — ~4–6 weeks for the real thing

The largest gap by build size, and **the one to be slowest about.** A real LMS is
content hosting, video, progress tracking and assessment: a second product, in a
category where free and specialised tools already win. What a Nigerian SME
actually needs is narrower and sits closer to what we already hold — *proof that
required training happened*.

**Recommended: build the compliance half, not the LMS.**

1. `TrainingRecord` against an employee — what, provider, date, expiry,
   certificate file. That alone answers the audit question, and it reuses the
   document store.
2. Expiry feeds the approvals inbox exactly as a probation does. A lapsed
   forklift certificate is a deadline, and deadlines have a home here.
3. Link a required training set to the `JobRole` above, so "who is overdue" is a
   query rather than a spreadsheet.
4. Course content and delivery only if customers ask, and integrating an existing
   LMS is likelier the right answer than building one.

---

## What we will not build

**SeamlessProcure** — vendor portals, purchase requisitions, quotations,
invoicing, inventory, budget management. It is a procurement product sold
alongside an HR one. Copying it would cost more than the five gaps above combined
and take the roadmap somewhere the payroll-correctness pitch cannot follow.

The same judgement in miniature applies to several HRMS odds and ends on their
support site: company QR codes, home-page slider images, product champion
certification. These are the accretions of a system sold to large enterprises and
shaped by their requests. Copying the list wholesale is how you arrive at ~120
routes, which is the disease, not the benchmark.

---

## What we have that they do not

Stated so the roadmap does not accidentally trade it away.

- **Payroll maths verified against statute** — Personal Income Tax Act, Pension
  Reform Act, NHF Act and now the Nigeria Tax Act 2025 — in integer kobo, with
  hand-worked expected values and a reconciliation gate that refuses to render
  arithmetic that cannot be true. This is the pitch.
- **One cross-module approval inbox**, ranked by deadline. Theirs makes you visit
  four queues and ships an "Approval Request Manager" as a *module* rather than a
  property of the product.
- **Exception detection before a run**, rather than a failed run afterwards.
- **Progressive disclosure**: a five-person business sees six nav items. This is
  the single biggest usability advantage over a system whose route count is its
  own disease.
- **One statutory engine, reachable from anywhere** — including, since September,
  a public PAYE calculator on the marketing site that calls the real engine over
  the network rather than a copy of it.
- **Contrast, type scale, store-write safety, demo-data leakage and eighteen
  other invariants verified in CI**, not eyeballed.

---

## What the live system actually shows

Kept from the August revision, because this evidence does not go stale.

On 20 August 2026 the account owner signed in to `tester.approvehr.io` — the
incumbent's own environment — and left the session open. The figures below are
that environment's output, read rather than entered.

**The caveat first:** this is a *tester* environment and some data is obviously
seeded. Garbage in a test database is not a product defect. What is a product
defect is displaying arithmetic that cannot be true, without complaint:

| Run | Gross | Deductions | Net | Gross − Deductions |
|---|---|---|---|---|
| December 2026 | ₦4,066,833.58 | ₦177,916.70 | ₦3,888,916.88 | ✓ reconciles |
| November 2026 | ₦4,500,166.91 | ₦266,875.03 | ₦4,233,291.88 | ✓ reconciles |
| **October 2026** | **₦1,833,500.33** | **₦88,958.37** | **₦3,218,741.96** | **net exceeds gross by ₦1.47m** |
| September 2026 | ₦833,500.33 | ₦88,958.37 | ₦744,541.96 | ✓ reconciles |
| **June 2026** | **₦833,500.33** | **₦88,958.37** | **₦700,211.96** | **out by ₦44,330** |

Two of ten runs do not reconcile, and one pays out more than it costs. No input
data can make a net figure legitimately exceed its own gross.

Three more, independent of the seeded data:

- **Deductions run at 4–11% of gross.** Employee pension alone is 8% of
  pensionable pay, NHF another 2.5% of basic, and PAYE at these salary levels
  12–17%. Total statutory deductions cannot come to less than roughly a quarter.
  December shows 4.4%.
- **The dashboard reports PAYE of ₦1.8m against total payroll of ₦3.2m** — a 56%
  effective rate, against a top *marginal* band of 24% at the time. Impossible
  rather than merely high.
- **Runs show 0 employees while carrying millions in gross.**

**Why this frames the roadmap.** We are behind on feature *coverage* — much less
so than in August — and they are behind on whether the numbers are right, which
is the harder problem and the one customers get audited on. The migration pitch
is **"your numbers get fixed"**, not "ours has more screens."

---

## The structure for adding it

Six rules, unchanged, because they are what stop us rebuilding the incumbent's
usability problem — and because `HANDOVER.md` cites them by number. The brief
they are judged against: **non-technical people, not HR professionals, who
nonetheless want to run their own payroll.**

### Rule 1 — one route per concept, rendered by role

Not `/performance/manager` and `/performance/my-objectives` and
`/performance/executive`. One `/performance`, which shows you your own goals if
you are staff, your team's if you manage, and the company's if you are an owner.
The role check lives in the page, the nav is filtered by permission, and the URL
you share with a colleague works for them too.

### Rule 2 — progressive disclosure driven by a setup answer

The setup wizard's questions switch nav sections on:

| Question | Turns on |
|---|---|
| How many people do you pay? | under 10 → hide departments, org chart, grades entirely |
| Does anyone work shifts or nights? | shifts, rotating work types, roster |
| Do you give staff loans or salary advances? | loans, repayment schedules |
| Do staff claim expenses back? | reimbursements |
| Do you run formal appraisals? | performance beyond simple goals |

A five-person business then sees six nav items instead of thirty. Nothing is
deleted — Settings has a "turn on more features" page — but the default is the
smallest product that pays people correctly. **This single decision is our
biggest usability advantage over the incumbent and it costs one settings table.**

### Rule 3 — do the thing, do not configure the thing

Everything ships with Nigerian SME defaults already populated: standard allowance
types, standard deduction types, the current PAYE bands, 8%/10% pension, 2.5%
NHF. Configuration exists; nobody has to touch it to run their first payroll. The
incumbent makes you build a salary structure before you can pay anyone. Ours lets
you pay someone on day one and refine later.

### Rule 4 — plain language and a button, never an explanation

The test: a sentence that explains *why* the product is doing something is a
sentence that should have been a button doing it. "An absence with no approved
leave behind it prorates against 22 working days" becomes **"Unpaid day — 1 day
will be deducted"** with **Approve leave** and **Fix record** beside it.

### Rule 5 — a screen answers one question; the rest is behind a reveal

Rules 2 and 3 are one argument at two scales. This is that argument *inside* a
single screen.

- **A screen answers one question.** Anything answering a *different* question
  goes behind a reveal, a tab or a link.
- **Default closed** for anything long, periodic or reference-shaped: a year of
  holidays, an audit trail, a whole framework, a settings sub-form, a policy
  handbook.
- **Default open** for anything that needs action now: a blocker, an exception, a
  validation failure in the form you are about to save, an approval waiting on
  the person reading.
- **The failure mode, named so it can be refused.** Progressive disclosure must
  never hide something that stops a payroll or costs somebody money. Where a
  section holds both reference material and a live warning, **the warning renders
  outside the reveal and the reference goes inside it.** The test — if somebody
  who never opens it can still be surprised by money or a deadline, it is open.
- **A collapsed section says what is inside it and how much.** "Public holidays
  2026 · 13 dates · 3 awaiting proclamation" beats "Public holidays". And absent
  is not zero: no count until the count is known, never a confident "0".
- **One primitive.** `Disclosure` in `components/ui/disclosure.tsx`. `Accordion`
  in `tabs.tsx` is single-open and shaped for a FAQ; it is not this one with a
  flag.

### Rule 6 — anywhere you can add several, there is a template to download

**A Nigerian SME does not arrive with nothing.** It arrives with a spreadsheet —
of staff, of laptops, of branches, of opening leave balances — and the first hour
it spends in this product is either an import or it is typing.

- **A template they download, never a paste box.** CSV **and** .xlsx, both,
  because offering one and refusing the other is a trap of our own making.
- **Generated from the same declaration the importer validates against.** A
  hand-kept template drifts inside one release and then **every customer's first
  import fails on a file we gave them**. `lib/imports/template-file.ts` contains
  no column name and no entity: it reads the dictionary, and
  `scripts/verify-template.ts` gates the loop rather than an expected list.
- **Required columns lead, so the sheet is not bloated.** `buildDictionary`
  orders every dictionary required, then recommended, then the rest — derived,
  not written down.
- **The same four steps, always:** download and fill in → match the columns → fix
  what is flagged → confirm. An importer costs a dictionary, a surface, and a
  validate/apply pair.
- **Never a success without the count of what did not land.** The confirm button
  says what it will not do *before* it does it: "Add 47 people, leave 3 out".
- **Missing-but-required is fixable in place. Missing-but-recommended is flagged
  and acknowledged, never blocking.** A cell that cannot be read does not import;
  a row that looks like somebody already on file **waits for a human answer**; a
  recommended field nobody filled in *imports*, and the person is named on a list
  somebody ticks — refusing the record does not produce the bank account.
- **The importer is never the only consumer of its validation, and they are
  tested together.** This is a rule because of an incident: relaxing
  `employee_no` from required to generated was right for the spreadsheet importer
  and silently broke the legacy ETL, whose idempotency key **is**
  `(organizationId, employeeNo)`. Strictness is a **function argument, never a
  request field**, and relaxing a rule in `src/modules/imports/` means running
  both suites.

---

## Where the build actually got to

| Phase | State | Evidence |
|---|---|---|
| **0 — the doors** | **done** | register / verify / reset; roles editor with escalation and last-owner guards; notification inbox; setup wizard; self-service profile |
| **1 — payroll completeness** | **done** | pay components, salary grades, loans, expenses, advances, benefits, bulk import, and the run that assembles them |
| **2 — closing the lifecycle** | **done** | offboarding, assets, documents, policies, shifts, conduct, audit trail |
| **3 — money movement** | **done** | wallet, bank accounts, batches, instructions, append-only ledger, provider seam that refuses rather than faking |
| **4 — depth** | **done** | performance depth, help desk with SLAs, knowledge base, public careers page, webhooks, recruitment backend |
| **5 — the five gaps above** | **four of five built** | probation/confirmation, promotion/redeployment, job roles and surveys all shipped with tests — see HANDOVER's four entries dated 2026-09-13. **Training records is the one left**, deliberately: §5 argues for the compliance half rather than an LMS, and it now has a better place to hang than it did, because `JobRole` exists and "a required training set per role" is the query §5.3 asks for. |

Two things the four gaps added that the rest of the product should now use, and
mostly does not yet:

- **`EmploymentChange` is the one employment history.** Probation decisions,
  promotions, transfers, regrades and pay changes all land in it, including
  edits made straight on a record. Anything else that changes a job, a
  department or a salary belongs there too rather than in a table of its own.
- **`JobRole` is the join recruitment, grades and competencies were doing
  without.** `GET /job-roles/expected/:employeeId` returns the core competency
  set plus the role's, which is what §3 was for — and `modules/performance`
  still builds its question set the old way. Wiring that is the payoff.

The two findings from the August revision that changed the plan, kept because
both are still load-bearing:

**Our own engine had the bug we were selling against.** Additions were folded
into gross before the salary split, so a ₦100,000 bonus raised the employee's
pension deduction and their NHF. Pension is charged on monthly emoluments and NHF
on basic salary; a bonus is neither. The existing assertion only checked that
gross and PAYE went *up*, so it passed for months. **An assertion that does not
name the figure it protects protects nothing.**

**Tax bands became data, but not editable data.** A company cannot choose its own
tax brackets. What they need is an *effective date*, because the Nigeria Tax Act
2025 changed them. They are dated schedules shipped by us, with citations, and a
period whose schedule is unconfirmed comes back flagged rather than refused.
