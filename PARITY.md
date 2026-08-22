# Parity with the existing system — what is missing, and how to add it

The live system at `tester.approvehr.io` is the thing we have to beat, and the
bar is not "looks better". It is **"a customer can move onto this and lose
nothing"**. This document is the gap between the two, and the order to close it.

Audited from source, not from the running site: the old React frontend at the
repo root (`../src`), its 27 API service modules (`../src/services/api`), the
`../MDs/` design notes, and the Postman collection. Nobody logged in — the
credentials shared in chat are not usable by an agent, and the source is a more
complete record anyway because it includes endpoints the UI never shipped.

## The headline

| | Existing system | Ours today |
|---|---|---|
| App routes | ~120 (plus ~10 test routes still shipped) | 30 |
| Backend modules | 27 service files | 8 |
| Prisma / ORM models | n/a (Django) | 42 |
| Payroll: statutory maths | present, unverified by us | **verified, 50 assertions against statute** |
| Payroll: allowances, deductions, loans, reimbursements | **yes** | no |
| Employee lifecycle: offboarding | **yes, deep** | no |
| Assets register | **yes** | no |
| Self-service (employee's own profile) | **yes** | no |
| Multi-company | **yes** | schema only, no UI |

Read that table in both directions. We are ahead on the one thing that is
hardest to retrofit — payroll arithmetic that is actually right — and behind on
almost everything that surrounds it. Feature count is where we lose today.

**But route count is also the old system's disease.** ~120 routes exist because
every module grew a separate page per audience: `/performance/executive`,
`/performance/manager`, `/performance/my-objectives`, `/performance/team-appraisals`,
`/performance/reviews/:id/hr-view` are five routes rendering one concept to five
readers. A business owner with 30 staff has to learn a filing system before they
can pay anybody. Closing the gap by cloning the structure would inherit the
problem. The plan below closes it at **one route per concept, rendered by role**.

---

## What is missing, by weight

### Tier 1 — payroll is not complete without these

Everything here is money. A customer cannot migrate until all five exist,
because without them our payroll produces a *different number* than theirs.

| Gap | What the old system has | Why it blocks migration |
|---|---|---|
| **Allowances & deductions as data** | `allowance_type` / `deduction_type` CRUD, per-employee assignment, batch assign, active/inactive toggle, priority ordering, dashboards | Our payroll splits salary into basic/housing/transport and stops. Real companies add car allowance, leave allowance, 13th month, union dues, cooperative deductions, salary advances. Today we cannot represent them, so our net pay is wrong for almost every real customer. |
| **Loans** | full lifecycle: create → approve → activate → repayment schedule → payment history → completion certificate; `getPendingApprovals`, `getMonthlySummary` | Staff loans repaid by salary deduction are near-universal in Nigerian SMEs. Missing this means manual deduction entry every month, which is the exact drudgery we are selling against. |
| **Reimbursements** | types CRUD, claim with document upload, approve/reject, mark as paid, summary | Expense claims land in payroll or in a separate payment. Either way they are money owed to an employee and there is nowhere to put them. |
| **Salary structures & grades** | `salary_structure` and `salary_category` CRUD | We store a gross figure per employee. No bands, no grades, so no "everyone on Grade 4 gets a 10% rise", and the hiring module's band-position indicator has nothing real behind it. |
| **Payment execution** | wallet, balance, transactions, `getAvailableBanks` | We generate a payment file and stop. The old system moves money. This is the single biggest "our product feels deficient" moment in a demo. |

Also in this tier, smaller but sharp:

- **Bulk employee import** (`employees/import`, `bulk-upload`, `bulk-update`,
  `bulk-delete`). There are 500-, 1000- and 10,000-row Nigerian employee CSVs
  sitting in the repo root. Onboarding a company means importing a spreadsheet.
  We have a one-at-a-time form.
- **Deduction remittances** (`getDeductionRemittances`, downloadable employee
  records). We generate statutory *schedules*; they track the remittance as a
  record with evidence.
- **Tax configuration with effective dates** (`tax_configuration`,
  `tax_bracket` CRUD). Our `PAYE_BANDS` is a hardcoded constant and
  `HANDOVER.md` argues it should stay one because bands are statute, not company
  policy. **That reasoning is half right and needs revising**: bands are not
  company policy, but they *are* versioned — the Nigeria Tax Act 2025 changed
  them effective January 2026. A run for a prior period must compute on the
  bands in force then. Bands should become data with an `effectiveFrom`, owned
  by us and shipped as a migration, not editable by the customer.

### Tier 2 — the employee lifecycle does not close

| Gap | Detail |
|---|---|
| **Offboarding / exit** | The deepest module in the old system — ~90 service methods. Resignation notice, manager approval, HR approval, clearance checklist with templates and per-item verification, handover tasks, asset return with damage marking, exit interview, risk analysis, offboarding report. We have onboarding checklists and nothing on the way out. An employment record that cannot be closed properly is a legal exposure, not just a missing feature. |
| **Assets register** | Asset CRUD, categories, assignment to employees, maintenance records. Laptops and phones are the things a leaver actually has to hand back — this is why it is Tier 2 and not Tier 3, it is load-bearing for exit. |
| **Employee documents** | Document store per employee, plus a **document request** flow (`/employees/documents/requests`) — HR asks the employee for their degree certificate, the employee uploads it. We have an `EmployeeDocument` model and no UI. |
| **Disciplinary actions** | `employees/disciplinary-actions`. Warning letters and their history. |
| **Policies** | `employees/policies` + `policy-types`. Publish a handbook section, record who acknowledged it. |
| **Shifts & work types** | `employee-shifts`, `rotating-shifts`, `work-types`, `rotating-work-types`, `work-type-definitions`, plus employee-raised shift-change requests. Our attendance assumes one working pattern. Any company with a factory, a clinic, or a security roster is unservable today. |
| **Self-service profile** | `/profile`, `/profile/edit`. **The employee's own door into the product.** We have no route an ordinary staff member can call theirs. |
| **Notification inbox** | `/notifications`. We built the settings page that configures notifications and never built the place they arrive. |
| **Audit trail UI** | `/audit`. We record `AuditEvent` rows properly and have no screen that shows them. |
| **Multi-company** | `/companies/*`. Our schema has `Organization` and `LegalEntity`; there is no UI to hold more than one. Accountants and group structures need this. |
| **Auth completeness** | register, verify email, forgot/reset password (incl. OTP), and a **setup wizard** (`/setup-wizard`, `/company-setup`, `/administrator-setup`). Our `auth` module has `/sign-in`, `/refresh`, `/sign-out`, `/sign-out-everywhere`, `/change-password` and `/me` — solid as far as it goes, but **nobody can create an account or recover a password.** |
| **Role & permission CRUD** | `/settings/role-permissions` with create, edit, and a permission picker; `permission-groups` service with members. Ours is a read-only matrix. |

### Tier 3 — depth that starts mattering above ~100 staff

Real, but nobody churns over it in month one.

- **Performance**: the old module is enormous (~150 service methods) —
  competencies with heatmaps and gap analysis, scoring weights, objective
  approval chains with send-back, review cycles with participants, questions,
  reminders and reports, self-appraisal, manager appraisal, team comparison,
  appraisal history and trends, even an AI judgement generator. Ours is
  read-only goals and a review cycle.
- **Helpdesk**: categories, SLA policies, comments, attachments, analytics,
  "my tickets". Ours is a read-only queue.
- **Knowledge base**: categories, attachments, analytics, settings. Ours is a
  static article list.
- **Recruitment**: analytics, applications as a distinct entity from candidates,
  and **public job postings** — the careers page candidates actually apply
  through. We have the internal ATS and no front door.
- **Integrations**: webhooks, per-employee integrations, providers. Ours is a
  register-interest page (deliberately, and that stays honest until there is a
  credential store).
- **Attendance depth**: logs, reports, correction requests as a queue.
- **Employee record depth**: bank details as a guarded sub-resource, work
  information, tags, bonus points, advanced search.

### What the live system actually shows

The audit above was read from source. On 20 August 2026 the account owner signed
in to `tester.approvehr.io` and left the session open, so the figures below are
that environment's own output, read (not entered) through the browser.

**The caveat first, because it matters:** this is a *tester* environment. Some of
the data is obviously seeded — two runs of ₦83.50, a payment reference of
`TRF/2024/11/001` repeated identically on all ten runs and dated 2024 for 2026
periods. Garbage in a test database is not a product defect.

What is a product defect is displaying arithmetic that cannot be true, without
complaint:

| Run | Gross | Deductions | Net | Gross − Deductions |
|---|---|---|---|---|
| December 2026 | ₦4,066,833.58 | ₦177,916.70 | ₦3,888,916.88 | ✓ reconciles |
| November 2026 | ₦4,500,166.91 | ₦266,875.03 | ₦4,233,291.88 | ✓ reconciles |
| **October 2026** | **₦1,833,500.33** | **₦88,958.37** | **₦3,218,741.96** | **₦1,744,541.96 — net exceeds gross by ₦1.47m** |
| September 2026 | ₦833,500.33 | ₦88,958.37 | ₦744,541.96 | ✓ reconciles |
| **June 2026** | **₦833,500.33** | **₦88,958.37** | **₦700,211.96** | **₦744,541.96 — out by ₦44,330** |

Two of ten runs do not reconcile, and one of them pays out more than it costs.
No input data can make a net figure legitimately exceed its own gross; that is a
computation or a display bug, and a payroll product should refuse to render it.

Three more, independent of the seeded data:

- **Deductions run at 4–11% of gross.** In Nigeria the employee pension
  contribution alone is 8% of pensionable pay, NHF is another 2.5% of basic, and
  PAYE on these salary levels is 12–17% of gross. Total statutory deductions
  cannot come to less than roughly a quarter of gross. December shows 4.4%.
- **The dashboard reports PAYE of ₦1.8m against total payroll of ₦3.2m** — an
  effective rate of 56%. The top *marginal* PAYE band is 24%, so no salary at
  any level can produce an effective rate above it. The figure is impossible
  rather than merely high.
- **Runs show 0 employees while carrying millions in gross** — October and June
  both do.

And in passing: the payroll dashboard is headed "Showing data in NGN (converted
from NGN)", a zero change renders as a red `−0.00%` chip, and another renders as
`+ +0%`.

**Why this reframes the roadmap.** The parity gap is real and Tier 1 still has to
be built. But the thing we are behind on is feature *coverage*, and the thing
they are behind on is whether the numbers are right — which is the harder problem
and the one customers get audited on. Our engine carries 65 assertions with
hand-worked expected values and a reconciliation property test; theirs ships a
run where net exceeds gross. Two consequences for how we build:

1. **Ship the invariant checks with the arithmetic, not after it.** A run whose
   net does not equal gross less deductions must refuse to save, not render.
   Phase 1 adds allowances and deductions to the engine, which multiplies the
   ways a total can fail to reconcile — the property test goes in at the same
   time as the feature.
2. **The migration pitch is "your numbers get fixed", not "ours has more
   screens."** That is a stronger sale and it is the one we can actually prove.

### What we have that they do not

Worth stating so the roadmap does not accidentally trade it away:

- Payroll maths verified against the Personal Income Tax Act, Pension Reform Act
  and NHF Act, in integer kobo, with 50 assertions and hand-worked expected
  values. This is the pitch.
- One cross-module **approval inbox** ranked by deadline. The old system makes
  you visit `/leave/approvals/all`, `/performance/pending-objectives`,
  `/payroll/loans`, and `/exit/resignation-requests` separately.
- Exception detection before a run, rather than a failed run.
- Contrast and type-scale verified in CI, not eyeballed.
- A public marketing site that does not invent proof.

---

## The structure for adding it

Six rules first, because they are what stop us rebuilding the old system's
usability problem. The user's brief was explicit: **non-technical people, not
HR professionals, who nonetheless want to run their own payroll.** Every item
below is judged against that person.

### Rule 1 — one route per concept, rendered by role

Not `/performance/manager` and `/performance/my-objectives` and
`/performance/executive`. One `/performance`, which shows you your own goals if
you are staff, your team's if you manage, and the company's if you are an owner.
The role check lives in the page, the nav is filtered by permission, and the URL
you share with a colleague works for them too.

This is already half-built: `resolveActiveHref` and the data-driven groups in
`components/portal/nav.tsx` mean adding permission filtering is a prop, not a
refactor. It is also why the **role views** work already queued must land before
Tier 2 — everything in Tier 2 has three audiences.

### Rule 2 — progressive disclosure driven by a setup answer

The setup wizard asks five questions, and the answers switch nav sections on:

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
biggest usability advantage over the old system and it costs one settings
table.**

### Rule 3 — do the thing, do not configure the thing

Every Tier 1 item ships with Nigerian SME defaults already populated: standard
allowance types, standard deduction types, the current PAYE bands, 8%/10%
pension, 2.5% NHF. Configuration exists; nobody has to touch it to run their
first payroll. The old system makes you build a salary structure before you can
pay anyone. Ours should let you pay someone on day one and refine later.

### Rule 4 — plain language and a button, never an explanation

Already underway and it applies to every screen added below. The test: a
sentence that explains *why* the product is doing something is a sentence that
should have been a button doing it. "An absence with no approved leave behind it
prorates against 22 working days" becomes **"Unpaid day — 1 day will be
deducted"** with **Approve leave** and **Fix record** beside it.

### Rule 5 — a screen answers one question; the rest is behind a reveal

Rules 2 and 3 are one argument at two scales — do not show a five-person
business 120 routes, and do the thing rather than configure the thing. This is
that argument *inside* a single screen: **progressively disclose. Do not show
the user everything at once.**

- **A screen answers one question.** Anything answering a *different* question
  goes behind a reveal, a tab or a link. `/people/leave` answers "whose leave do
  I decide"; a year of public holidays answers "when is Eid", so it is a
  disclosure, not a section stacked under the table.
- **Default closed** for anything long, periodic or reference-shaped: a year of
  holidays, an audit trail, a whole framework, a settings sub-form, a worked
  example, a policy handbook.
- **Default open** for anything that needs action now: a blocker, an exception,
  a validation failure in the form you are about to save, an approval waiting on
  the person reading. Conditional-on-a-real-problem *is* default-open — a
  callout that only renders when `count > 0` already obeys this rule.
- **The failure mode, named so it can be refused.** Progressive disclosure must
  never hide something that stops a payroll or costs somebody money. Where a
  section holds both reference material and a live warning, **the warning
  renders outside the reveal and the reference goes inside it.** On the leave
  screen the "3 dates are not gazetted yet" callout sits above the closed
  calendar: payroll proration and overtime already charge those days while the
  timesheet does not, and a click is not a place to keep that. The test — if
  somebody who never opens it can still be surprised by money or a deadline, it
  is open.
- **A collapsed section says what is inside it and how much.** "Public holidays
  2026 · 13 dates · 3 awaiting proclamation" beats "Public holidays". A count is
  the whole value of a closed section; without one the reader has to open it to
  learn whether it mattered, which is the cost the reveal existed to save. And
  absent is not zero: no count until the count is known, never a confident "0".
- **One primitive.** `Disclosure` in `components/ui/disclosure.tsx` —
  `aria-expanded` / `aria-controls`, a named region, `keepMounted` when closing
  must not discard typed input, `region={false}` for form-field groups.
  `Accordion` in `tabs.tsx` is single-open and shaped for a FAQ; it is not this
  one with a flag. Six screens had already hand-rolled `aria-expanded` before
  this existed. Do not make it seven.

### Rule 6 — anywhere you can add several, there is a template to download

Rules 2, 3 and 5 are about not drowning one person in one screen. This is the
other shape of the same problem: a form that is fine for the second thing and
insulting by the fortieth. **A Nigerian SME does not arrive with nothing.** It
arrives with a spreadsheet — of staff, of laptops, of branches, of opening leave
balances — and the first hour it spends in this product is either an import or it
is typing. `people/assets/item-form.tsx` already says the quiet part in its own
header: "the alternative is an owner with thirty laptops abandoning the form on
the first one." So: **anywhere a person can add several of something, there is a
bulk upload.**

- **A template they download, never a paste box.** A textarea asking for
  comma-separated values makes the customer guess our schema, and the first
  sentence they ever hear the product say is a complaint about their guess. The
  template *is* the schema, in the format they already hold it in — CSV **and**
  .xlsx, both, because offering one and refusing the other is a trap of our own
  making, and Excel is what the file on their disk is.

- **Generated from the same declaration the importer validates against.** Never
  kept by hand beside it. A hand-kept template drifts inside one release —
  somebody adds a required column to the checker and not to the sheet — and then
  **every customer's first import fails on a file we gave them**, which is the
  worst first minute this product can have. `lib/imports/template-file.ts`
  contains no column name and no entity: it reads the dictionary.
  `scripts/verify-template.ts` gates the loop rather than an expected list —
  build the file, read it back the way the upload does, assert every value lands
  on the field the dictionary names. Add a column and it is covered without
  editing the script. Where the dictionary exists twice because the first two
  steps must work with no database, the drift is **gated, not described**: that
  script parses the API's copy as text, the same trick `verify-payroll.ts` uses
  for the tax schedules.

- **Required columns lead, so the sheet is not bloated.** `buildDictionary`
  orders every dictionary required, then recommended, then the rest — and it is
  the only way to make one, so the template writer, the matching dropdowns, the
  checker and the API's own response cannot be handed an order that has not been
  through it. Derived, not written down: a dictionary that grows a required
  column gets it in the right place without anybody remembering to move it. The
  declaration keeps its readable grouping by subject; the emitted order is
  computed. Five unmissable columns scattered across thirty-three reads as
  bloat, and the customer deletes the wrong ones.

- **The same four steps, always: download and fill in → match the columns → fix
  what is flagged → confirm.** Somebody who has imported employees must not have
  to learn a second flow to import equipment. That is what makes
  `components/imports/*` parameterised and `app/(app)/people/import/page.tsx`
  six lines: **an importer costs a dictionary, a surface, and a validate/apply
  pair.** A fifth step, or these four in another order, is a second product to
  learn for no gain.

- **Never a success without the count of what did not land.** A success modal
  only on a clean import. A partial result is not a success wearing a smaller
  number — it names the rows, and the confirm button says what it will not do
  *before* it does it: "Add 47 people, leave 3 out". `skippedRows` is **every**
  row that did not land, including a duplicate somebody chose to skip, because a
  row left out on purpose is still a person not in the directory. "Imported 47"
  beside a silent 3 is the same wrong claim as a payslip reading ₦0 because no
  attendance row existed.

- **Missing-but-required is fixable in place. Missing-but-recommended is flagged
  and acknowledged, never blocking.** Three kinds of unfinished business, and
  they end differently: a cell that cannot be read does not import and is
  corrected in the table without leaving the screen; a row that looks like
  somebody already on file **waits for a human answer**, because only the
  customer knows whether that is a duplicate or a cousin; a recommended field
  nobody filled in *imports*, and the person is named on a list somebody ticks —
  refusing the record does not produce the bank account. The acknowledgement
  resets on every re-check, because a new check is a new list. And a correction
  typed after a check refuses to apply until it is re-checked: confirming
  against a stale snapshot imports the unmended row while the screen shows it
  mended.

- **The importer is never the only consumer of its validation, and they are
  tested together.** This is a rule because of an incident, not a principle.
  Relaxing `employee_no` from required to generated was right for a shop owner
  whose spreadsheet has no such column — and it silently broke the legacy ETL,
  which reuses `checkRows` rather than writing a second validator, and whose
  idempotency key **is** `(organizationId, employeeNo)`. A generated `AHR-0001`
  exists in no legacy database, so a second migration run cannot match it and
  the person lands as a directory row with no payslips, no leave and no history
  behind it. Four assertions in `tests/etl.test.ts` were the only thing that
  caught it; `tests/imports.test.ts` went green. Two consequences that hold for
  every entity added after this: strictness is a **function argument, never a
  request field** — `CheckOptions.requireEmployeeNo` — because a client must not
  choose how strict its own import is; and relaxing a rule in
  `src/modules/imports/` is not a local change. Run both suites, and if only the
  sibling's assertions move, ask which caller the rule was really for before
  editing the expectation.

Employees is the only entity built on this. Every other list a customer can add
several of is a dictionary and a surface away, and the ones worth doing first are
ranked by how many rows a thirty-person Lagos company has on the day it signs
up — not by how easy the screen looks.

## Where the build actually got to

Updated 20 August 2026, after Phases 0 and 1 shipped.

| Phase | State | Evidence |
|---|---|---|
| **0 — the doors** | **done** | register / verify / reset password; roles editor with a privilege-escalation guard and a last-owner guard; notification inbox; setup wizard writing the feature flags; self-service profile |
| **1 — payroll completeness** | **done** | pay components with taxable/pensionable flags, salary grades, loans with generated schedules, expenses, bulk import with a mapping preview — and the run that assembles them |
| **2 — closing the lifecycle** | in progress | offboarding, equipment, documents, policies, shifts, audit trail |
| **3 — money movement** | schema done, modules pending | bank accounts, batches, instructions, append-only ledger, provider seam |
| **4 — depth** | schema done, modules pending | performance, help desk, knowledge base, public careers page, webhooks |

Counts, so the next revision of this document can be checked against something:
**86 data models, 16 backend modules, 347 backend tests, 52 frontend routes.**

### The two findings that changed the plan

**Our own engine had the bug we were selling against.** Additions were folded
into gross before the salary split, so a ₦100,000 bonus raised the employee's
pension deduction by ₦4,800 and their NHF by ₦1,500. Pension is charged on
monthly emoluments and NHF on basic salary; a bonus is neither. The existing
assertion only checked that gross and PAYE went up, so it passed. Fixed, and the
assertion count went from 50 to 89 — every expected value hand-worked against a
separate implementation written purely to check the first one.

**The tax bands needed to become data, but not editable data.** This document
originally said bands should be customer-owned configuration. They should not:
a company cannot choose its own tax brackets. What they need is an *effective
date*, because the Nigeria Tax Act 2025 changed them. They are now dated
schedules shipped by us — and the 2025 figures are deliberately absent, because
nobody has put the gazette in front of the code and a guessed band produces a
confident wrong number that gets filed. Every 2026 period comes back flagged so
a run cannot be approved without somebody being told.

### Phasing

Each phase is shippable and demonstrable on its own. Ordering is by how much it
hurts to be without it, not by how easy it is.

**Phase 0 — the doors (prerequisite for everything)**
- Role views and permission-filtered nav; `/profile` self-service; notification
  inbox; register / verify / reset password; setup wizard writing the Rule 2
  feature flags.
- Backend: `permissions` module, `notifications` module, extend `auth`.
- Why first: every screen after this needs to know who is looking at it, and
  nobody can create an account today.

**Phase 1 — payroll completeness (Tier 1)**
- Schema: `AllowanceType`, `DeductionType`, `EmployeeAllowance`,
  `EmployeeDeduction`, `SalaryGrade`, `SalaryBand`, `LoanRepayment`,
  `Reimbursement`, `ReimbursementType`, `TaxBand` with `effectiveFrom`,
  `RemittanceRecord`. `Loan` already exists and gains the schedule.
- Engine: allowances and deductions enter the calculation in the right order —
  and the 50 assertions grow to cover it. Non-negotiable.
- Screens: one **Pay setup** page (grades, allowances, deductions in three tabs,
  not three routes), loans, reimbursements, bulk import with a mapping preview.
- Why here: this is where "our product feels deficient" actually bites, because
  it produces a wrong number rather than a missing page.

**Phase 2 — closing the lifecycle (Tier 2)**
- Offboarding as one guided flow, not six routes: resign → approve → clearance →
  handover → assets back → interview → done, rendered as a checklist with a
  progress bar. Templates configurable, one sensible default shipped.
- Assets register (needed by the above), employee documents + requests,
  disciplinary actions, policies with acknowledgement, shifts.
- Audit trail screen over the `AuditEvent` rows we already write.

**Phase 3 — money movement**
- Wallet, bank list, payment execution against an approved run. Held until here
  deliberately: it needs a credential store, real bank integration, and a
  security review, and it is the one place where shipping something half-real
  would be indefensible.

**Phase 4 — depth (Tier 3)**
- Performance beyond goals, helpdesk SLA and categories, KB depth, recruitment
  analytics and the public careers page, integrations with webhooks,
  multi-company UI.
- Built only for customers who ask, and behind Rule 2 flags.

**Continuous**
- Every phase: `npm run check` clean, contrast and type-scale verified, browser
  proof of propagation across screens, and the ETL from the Django database
  extended to cover whatever the phase added — because parity is worth nothing
  if existing customers cannot bring their data across.

## The one thing to decide before Phase 1

`web/` still has **zero tracked files in any git repo**. Everything in this
document describes work on a codebase that exists only on one disk. That needs
resolving before more is added to it.
