# Pages — ApproveHR frontend v2

_Repo:_ `approvehr-frontend-v2` · _Framework:_ Next.js 16, App Router · _Generated from_ `src/app/**/page.tsx`

**113 pages** in total. Route groups in brackets — `(app)`, `(marketing)` — are folders that organise the
code and **do not appear in the URL**. A segment in square brackets is a parameter.

| Group | Pages | What it is |
|---|---:|---|
| `(app)` | 95 | **The signed-in product.** Everything behind sign-in. Shares the `AppShell` chrome and the left-hand sidebar; every item is filtered by permission and by feature switch. |
| `(marketing)` | 10 | **The public site.** Served from the same Next app, own chrome and footer. No authentication. |
| `(auth)` | 5 | **Sign-in and account recovery.** Reachable signed-out. The gate renders in place rather than redirecting, so a deep link survives sign-in. |
| `(setup)` | 1 | **First-run wizard.** Seven questions that decide which modules a new company sees. |
| `(root)` | 2 | **Outside every group.** Files that sit directly under `src/app`. |


---

## (app) — The signed-in product

Everything behind sign-in. Shares the `AppShell` chrome and the left-hand sidebar; every item is filtered by permission and by feature switch.


### Approvals inbox  
`/approvals` — 1 page

| Route | Title | What it is | File |
|---|---|---|---|
| `/approvals` | My approvals | Everything waiting on a decision from you, across every module. | `src/app/(app)/approvals/page.tsx` |

### AI assistant  
`/assistant` — 1 page

| Route | Title | What it is | File |
|---|---|---|---|
| `/assistant` | Assistant | Ask about your own records, and confirm any change it offers to make. Nothing is written until you press confirm. | `src/app/(app)/assistant/page.tsx` |

### Dashboard  
`/dashboard` — 1 page

| Route | Title | What it is | File |
|---|---|---|---|
| `/dashboard` | Home | — | `src/app/(app)/dashboard/page.tsx` |

### Documents  
`/documents` — 1 page

| Route | Title | What it is | File |
|---|---|---|---|
| `/documents` | My documents | What the company holds about you, and what it is asking you for. | `src/app/(app)/documents/page.tsx` |

### Equipment  
`/equipment` — 1 page

| Route | Title | What it is | File |
|---|---|---|---|
| `/equipment` | My equipment | The laptop, phone and SIM the company has issued you, and how to report a fault on any of them. | `src/app/(app)/equipment/page.tsx` |

### Employee support  
`/help` — 3 pages

| Route | Title | What it is | File |
|---|---|---|---|
| `/help` | Help desk | Ask HR a question and see what came back. Whoever handles requests sees the whole queue, soonest promise first. | `src/app/(app)/help/page.tsx` |
| `/help/kb` | Help articles | Search the help centre, or browse it by section. Published articles only. | `src/app/(app)/help/kb/page.tsx` |
| `/help/kb/[slug]` | Help article | One answer, and two buttons to say whether it was any use. | `src/app/(app)/help/kb/[slug]/page.tsx` |

### Recruitment  
`/hiring` — 8 pages

| Route | Title | What it is | File |
|---|---|---|---|
| `/hiring` | Hiring | Every advertised role and everybody waiting on a decision. | `src/app/(app)/hiring/page.tsx` |
| `/hiring/candidates/[id]` | — | One applicant, their application and their pipeline record. | `src/app/(app)/hiring/candidates/[id]/page.tsx` |
| `/hiring/interviews` | Interviews | Everything scheduled, and every scorecard still owed. | `src/app/(app)/hiring/interviews/page.tsx` |
| `/hiring/offers` | Offer approvals | Offers waiting on a decision before they reach a candidate. | `src/app/(app)/hiring/offers/page.tsx` |
| `/hiring/postings` | Job adverts | Every job advert on your careers page: what is live, what is still a draft, and the link to share. | `src/app/(app)/hiring/postings/page.tsx` |
| `/hiring/postings/applications` | Applications | Everyone who applied through your careers page, with screening in and turning down on the row. | `src/app/(app)/hiring/postings/applications/page.tsx` |
| `/hiring/requisitions/[id]` | — | — | `src/app/(app)/hiring/requisitions/[id]/page.tsx` |
| `/hiring/requisitions/new` | New requisition | Open a new role in five steps. | `src/app/(app)/hiring/requisitions/new/page.tsx` |

### Notifications  
`/notifications` — 1 page

| Route | Title | What it is | File |
|---|---|---|---|
| `/notifications` | Notifications | Approvals waiting on you, payroll and filing reminders, and everything else the product has told you about. | `src/app/(app)/notifications/page.tsx` |

### Payroll  
`/payroll` — 13 pages

| Route | Title | What it is | File |
|---|---|---|---|
| `/payroll` | Payroll | Runs, approvals and what each one owes in statutory filings. | `src/app/(app)/payroll/page.tsx` |
| `/payroll/advances` | Pay early | Draw pay you have already earned before payday, and decide the ones other people have asked for. | `src/app/(app)/payroll/advances/page.tsx` |
| `/payroll/expenses` | Expenses | Claims, approvals, and what you still owe staff. | `src/app/(app)/payroll/expenses/page.tsx` |
| `/payroll/loans` | Staff loans | Who has borrowed what, how much is left, and what comes out of this month's payroll. Approve or decline from the row. | `src/app/(app)/payroll/loans/page.tsx` |
| `/payroll/loans/[id]` | Staff loan | One loan, its repayment schedule, and what is left to recover from payroll. | `src/app/(app)/payroll/loans/[id]/page.tsx` |
| `/payroll/pay-setup` | Pay setup | Allowances, deductions and salary grades in one place, with what each one does to tax, pension and take-home pay. | `src/app/(app)/payroll/pay-setup/page.tsx` |
| `/payroll/payments` | Wallet | What the company holds, where money goes in, and every payment that has been prepared. | `src/app/(app)/payroll/payments/page.tsx` |
| `/payroll/payments/[id]` | Payment batch | Who is being paid, how much, from which account, and the payment file to take to your bank. | `src/app/(app)/payroll/payments/[id]/page.tsx` |
| `/payroll/payments/history` | Payment history | Every payment to every person, by month, and whether the money actually moved. | `src/app/(app)/payroll/payments/history/page.tsx` |
| `/payroll/payslips` | Payslips | Every payslip for the period, and whether it reached the person. | `src/app/(app)/payroll/payslips/page.tsx` |
| `/payroll/payslips/[id]` | Payslip | One month, itemised, with what was taken and what it was for. | `src/app/(app)/payroll/payslips/[id]/page.tsx` |
| `/payroll/runs/new` | Run payroll | Calculate a month's pay, fix what it flags, then approve it. Nothing is paid until you approve. | `src/app/(app)/payroll/runs/new/page.tsx` |
| `/payroll/statutory` | Statutory filings | What August owes, to whom, and by when. | `src/app/(app)/payroll/statutory/page.tsx` |

### People  
`/people` — 24 pages

| Route | Title | What it is | File |
|---|---|---|---|
| `/people` | Employees | Everyone on the payroll, and the state of their record. | `src/app/(app)/people/page.tsx` |
| `/people/[id]` | — | — | `src/app/(app)/people/[id]/page.tsx` |
| `/people/assets` | Equipment | Every laptop, phone and SIM card the company owns: who has each one, what state it is in, and what has to come back when somebody leaves. | `src/app/(app)/people/assets/page.tsx` |
| `/people/assets/import` | Import your equipment register | Bring your laptops, phones and access cards in from a spreadsheet: match your own column names, say which kinds a leaver has to hand back, and see every problem row before anything is saved. | `src/app/(app)/people/assets/import/page.tsx` |
| `/people/attendance` | Attendance | Who is in, who is late, who is on leave, and the days-present figure payroll prorates against. | `src/app/(app)/people/attendance/page.tsx` |
| `/people/attendance/history` | Attendance history | A month at a glance, and for any day: who was in, who was late, who was on approved leave and who was not accounted for. | `src/app/(app)/people/attendance/history/page.tsx` |
| `/people/attendance/import` | Import attendance | Bring a month of clock-ins in from your biometric terminal's own export: match your own column names, see every problem row before anything is saved, and be told which days are corrections rather than additions. | `src/app/(app)/people/attendance/import/page.tsx` |
| `/people/departments` | Departments and teams | Your org structure: departments, the teams inside them, who leads each one and what it costs. | `src/app/(app)/people/departments/page.tsx` |
| `/people/departments/[id]` | Department | Everyone in one department or sub-department, what it costs a month, and the units inside it. | `src/app/(app)/people/departments/[id]/page.tsx` |
| `/people/documents` | Documents | What you hold on each person's file, what is still outstanding, and what is about to run out of date. | `src/app/(app)/people/documents/page.tsx` |
| `/people/import` | Import your staff list | Bring your people in from a spreadsheet: match your own column names, see every problem row before anything is saved, and confirm exactly how many will be added and updated. | `src/app/(app)/people/import/page.tsx` |
| `/people/incomplete` | Incomplete records | Every employee missing a bank account, pension PIN or TIN, one click from the exact field. | `src/app/(app)/people/incomplete/page.tsx` |
| `/people/leave` | Leave | Requests, balances and who is away when. | `src/app/(app)/people/leave/page.tsx` |
| `/people/new` | Add employee | Create a record for a new starter, in two required steps. | `src/app/(app)/people/new/page.tsx` |
| `/people/offboarding` | Exit management | Everyone on their way out, how far through their leaving checklist they are, and what is still outstanding before their record can be closed. | `src/app/(app)/people/offboarding/page.tsx` |
| `/people/offboarding/[id]` | Exit | One exit: the checklist, who owns each item, who confirmed it, and whether the record can be closed. | `src/app/(app)/people/offboarding/[id]/page.tsx` |
| `/people/offboarding/checklist` | Exit checklist | The list everyone leaving works through. Seven lines to start with, and you only come here if yours are different. | `src/app/(app)/people/offboarding/checklist/page.tsx` |
| `/people/onboarding` | Onboarding | New starters and what is still outstanding for each. | `src/app/(app)/people/onboarding/page.tsx` |
| `/people/one-on-ones` | One-to-ones | Standing one-to-ones between a manager and their reports — private to the two people in them, with a coverage report that carries no content. | `src/app/(app)/people/one-on-ones/page.tsx` |
| `/people/one-on-ones/[id]` | One-to-one | One standing one-to-one: the meetings, the shared notes and what each of you agreed to do. | `src/app/(app)/people/one-on-ones/[id]/page.tsx` |
| `/people/org-chart` | Org chart | The company by department, with who leads each one and who reports to whom — and a way to rearrange it. | `src/app/(app)/people/org-chart/page.tsx` |
| `/people/overtime` | Overtime | Extra hours worked out from the clock, what they come to, and what is still waiting for approval. | `src/app/(app)/people/overtime/page.tsx` |
| `/people/shifts` | Shifts | Who works when: nights, earlies and weekend cover, and the cover requests waiting on an answer. | `src/app/(app)/people/shifts/page.tsx` |
| `/people/signatures` | Signatures | Documents waiting on your signature, and documents sent for signature — each identified by the fingerprint of its exact bytes. | `src/app/(app)/people/signatures/page.tsx` |

### Performance  
`/performance` — 14 pages

| Route | Title | What it is | File |
|---|---|---|---|
| `/performance` | Performance | What is waiting on you, and how the running appraisal period is going. | `src/app/(app)/performance/page.tsx` |
| `/performance/appraisers` | Who appraises whom | The appraiser mapping for this cycle, and each one's weight. | `src/app/(app)/performance/appraisers/page.tsx` |
| `/performance/approvals` | Objectives to agree | Objectives waiting for you to agree them, with the target each person will be judged against. | `src/app/(app)/performance/approvals/page.tsx` |
| `/performance/history/[employeeId]` | Appraisal history | One person's mark period by period: the trend, what each mark was made of, and the periods with no mark at all. | `src/app/(app)/performance/history/[employeeId]/page.tsx` |
| `/performance/how-it-works` | How appraisals work | What a period is, what a mark is made of, and what happens when one is given. | `src/app/(app)/performance/how-it-works/page.tsx` |
| `/performance/kpis` | KPIs | What people are aiming at, and how far along it is — yours, your team's, or the company's. | `src/app/(app)/performance/kpis/page.tsx` |
| `/performance/periods` | Appraisal periods | Every appraisal period, open ones first, and what each one needs next. | `src/app/(app)/performance/periods/page.tsx` |
| `/performance/periods/[id]` | Appraisal period | Run one appraisal period: what it still needs, who is outstanding, who has nobody appraising them, and where every mark stands. | `src/app/(app)/performance/periods/[id]/page.tsx` |
| `/performance/periods/[id]/nine-box` | Nine-box | Performance against potential for one appraisal period, with everybody the grid cannot place named rather than assumed. | `src/app/(app)/performance/periods/[id]/nine-box/page.tsx` |
| `/performance/periods/[id]/report` | Period report | How an appraisal period came out: the spread of marks, what came in, and who finishes unscored or unfinalised, by name. | `src/app/(app)/performance/periods/[id]/report/page.tsx` |
| `/performance/periods/new` | Draft a period | Describe an appraisal period in a sentence or two and edit the goals and questions that come back. Nothing is created until the last screen. | `src/app/(app)/performance/periods/new/page.tsx` |
| `/performance/review-tasks` | Weekly tasks | Log what you did toward your objectives, and grade what your team did. | `src/app/(app)/performance/review-tasks/page.tsx` |
| `/performance/reviews/[id]` | Appraisal | One appraisal: the mark, what it is made of, who judged it, and the employee's answer to it. | `src/app/(app)/performance/reviews/[id]/page.tsx` |
| `/performance/skills` | Competency ratings | Where people stand against the levels the company set. | `src/app/(app)/performance/skills/page.tsx` |

### Profile  
`/profile` — 1 page

| Route | Title | What it is | File |
|---|---|---|---|
| `/profile` | My profile | Your details, your pay, your time off. | `src/app/(app)/profile/page.tsx` |

### Reports  
`/reports` — 2 pages

| Route | Title | What it is | File |
|---|---|---|---|
| `/reports` | Reports | Headcount, payroll cost and operational load. | `src/app/(app)/reports/page.tsx` |
| `/reports/builder` | Build a report | Choose a dataset, the columns you want, a filter and a grouping — with every total saying how many rows it covers and how many it does not. | `src/app/(app)/reports/builder/page.tsx` |

### Settings  
`/settings` — 24 pages

| Route | Title | What it is | File |
|---|---|---|---|
| `/settings` | Settings | Set the company up in one place: profile, offices, employee fields, leave, pay and access. | `src/app/(app)/settings/page.tsx` |
| `/settings/ai` | Assistant settings | Whether the assistant is switched on, which model answers, what is sent to it, and everywhere it appears. | `src/app/(app)/settings/ai/page.tsx` |
| `/settings/announcements` | Noticeboard | Write, publish and take down the notices your company shows everybody on their dashboard. | `src/app/(app)/settings/announcements/page.tsx` |
| `/settings/appearance` | Appearance | Choose light or dark, or match your device. | `src/app/(app)/settings/appearance/page.tsx` |
| `/settings/attendance` | Working hours | The shift everybody's clock-in is measured against, the grace before it counts as late, and which weekdays are working days. | `src/app/(app)/settings/attendance/page.tsx` |
| `/settings/audit` | Audit log | Who did what, when, and what it changed. | `src/app/(app)/settings/audit/page.tsx` |
| `/settings/bank-accounts` | Bank accounts | The accounts salaries are paid out of. Exactly one is the salary account, and changing it is recorded. | `src/app/(app)/settings/bank-accounts/page.tsx` |
| `/settings/company` | Company profile | Legal entities, RC numbers, registered addresses and tax states. | `src/app/(app)/settings/company/page.tsx` |
| `/settings/devices` | Biometric terminals | The clock-in terminals registered to this company, and which person each one's enrolment numbers mean. | `src/app/(app)/settings/devices/page.tsx` |
| `/settings/features` | Turn on more features | Every capability in the product, one line each, with a switch. | `src/app/(app)/settings/features/page.tsx` |
| `/settings/helpdesk` | Help desk | Ticket categories and the reply-and-resolution promises behind them. | `src/app/(app)/settings/helpdesk/page.tsx` |
| `/settings/integrations` | Integrations | Accounting, attendance devices, single sign-on and payment execution. | `src/app/(app)/settings/integrations/page.tsx` |
| `/settings/knowledge` | Help articles | The knowledge base editor: reads, helpfulness, and the questions no article answers yet. | `src/app/(app)/settings/knowledge/page.tsx` |
| `/settings/leave` | Leave policies | Entitlements, accrual, carry-over and the notice each type requires. | `src/app/(app)/settings/leave/page.tsx` |
| `/settings/locations` | Work locations | The offices, branches and sites people clock in at, and the geofence around each one. | `src/app/(app)/settings/locations/page.tsx` |
| `/settings/notifications` | Notifications | What triggers an email, and who receives approval reminders. | `src/app/(app)/settings/notifications/page.tsx` |
| `/settings/overtime` | Overtime policy | Whether overtime is paid, the grace before it counts, the daily cap, and the weekday, weekend and public holiday rates. | `src/app/(app)/settings/overtime/page.tsx` |
| `/settings/payroll` | Payroll settings | Working month, salary structure, statutory rates and the checks that stop payroll. | `src/app/(app)/settings/payroll/page.tsx` |
| `/settings/performance` | Appraisal scoring | How much each part of an appraisal counts towards somebody's mark, and what each mark is called. The weights must make 100% exactly, and both are frozen onto an appraisal period when it starts. | `src/app/(app)/settings/performance/page.tsx` |
| `/settings/policies` | Handbook | Your company policies, the version in force, and who has accepted each one. | `src/app/(app)/settings/policies/page.tsx` |
| `/settings/roles` | Roles and permissions | Who can see salaries, approve payroll, or export employee data. | `src/app/(app)/settings/roles/page.tsx` |
| `/settings/security` | Sign-in security | Two-factor sign-in, the actions that need a code, and your recovery codes. | `src/app/(app)/settings/security/page.tsx` |
| `/settings/webhooks` | Webhooks | Send signed JSON to your own server when payroll, leave or people change. | `src/app/(app)/settings/webhooks/page.tsx` |
| `/settings/webhooks/[id]` | Endpoint · Webhooks | Send a test event, and read every delivery attempt with the reason it failed. | `src/app/(app)/settings/webhooks/[id]/page.tsx` |

---

## (marketing) — The public site

Served from the same Next app, own chrome and footer. No authentication.

| Route | Title | What it is | File |
|---|---|---|---|
| `/` | HR payroll intelligence for Nigerian companies | Your HR intelligence partner: employee records, payroll, recruitment, leave and approvals in one system that checks its own arithmetic, tracks Nigerian statutory law automatically, and drafts the busywork so your team reviews instead of starting from nothing. | `src/app/(marketing)/page.tsx` |
| `/careers/[org]` | Open roles | Every job this company is hiring for, and how to apply. | `src/app/(marketing)/careers/[org]/page.tsx` |
| `/careers/[org]/[role]` | Job | — | `src/app/(marketing)/careers/[org]/[role]/page.tsx` |
| `/demo` | Book a demo | See the value of ApproveHR in ten minutes. No setup, no slides, just a focused look at what it can do for your organisation. | `src/app/(marketing)/demo/page.tsx` |
| `/dpa` | — | — | `src/app/(marketing)/dpa/page.tsx` |
| `/pricing` | Pricing | Per employee, per month, in naira. The rate falls as your headcount rises. See exactly what your company would pay. | `src/app/(marketing)/pricing/page.tsx` |
| `/privacy` | — | — | `src/app/(marketing)/privacy/page.tsx` |
| `/product/[module]` | Product | — | `src/app/(marketing)/product/[module]/page.tsx` |
| `/security` | — | — | `src/app/(marketing)/security/page.tsx` |
| `/terms` | — | — | `src/app/(marketing)/terms/page.tsx` |

---

## (auth) — Sign-in and account recovery

Reachable signed-out. The gate renders in place rather than redirecting, so a deep link survives sign-in.

| Route | Title | What it is | File |
|---|---|---|---|
| `/accept-invite` | Set your password | Accept your ApproveHR invitation and set a password. | `src/app/(auth)/accept-invite/page.tsx` |
| `/forgot-password` | Reset your password | Get a link to set a new ApproveHR password. | `src/app/(auth)/forgot-password/page.tsx` |
| `/register` | Create your account | Open an ApproveHR account for your company. Company name, your name, work email, password. | `src/app/(auth)/register/page.tsx` |
| `/reset-password` | Choose a new password | Set a new ApproveHR password using the link sent to your email. | `src/app/(auth)/reset-password/page.tsx` |
| `/verify-email` | Confirm your email | Confirm the email address on your ApproveHR account. | `src/app/(auth)/verify-email/page.tsx` |

---

## (setup) — First-run wizard

Seven questions that decide which modules a new company sees.

| Route | Title | What it is | File |
|---|---|---|---|
| `/setup` | Set up your company | Seven questions, so you only see the parts of the product you use and | `src/app/(setup)/setup/page.tsx` |

---

## (root) — Outside every group

Files that sit directly under `src/app`.

| Route | Title | What it is | File |
|---|---|---|---|
| `/design-system` | Design system | The ApproveHR design language: tokens, typography and every component, in one place. | `src/app/design-system/page.tsx` |
| `/offline` | No connection | — | `src/app/offline/page.tsx` |
