# Company setup — the previous system's flow

The predecessor being replaced: `approvehr-platform-frontend` (Vite/React)
and `approvehr-v2-backend` (Django). Kept here, alongside
[`company-setup-flow.md`](./company-setup-flow.md), purely as a reference —
nothing in this document describes code in this repo, and nothing here
should be treated as current. See that file's own intro for the
company-vs-employee "onboarding" naming collision; it applies to the legacy
system too, more so — see §4 below.

## 1. Company profile (`/company-setup`)

`pages/onboarding/CompanySetup.tsx`. Collects `company_name`,
`company_address`, `company_cac` (CAC registration number), `company_tin`,
`industry_type`, and a **subdomain** — checked live against
`authService.checkCompany({ subdomain })` as it's typed, with
available/taken/invalid states. This is genuine subdomain-based
multi-tenancy (`company.approvehr.io`), which the current system does not
have — `approvehr-backend` scopes tenants purely by `organizationId` in a
Prisma client extension, no subdomain anywhere.

Form state persists to `sessionStorage` (`"companyData"`) rather than
being sent anywhere yet, so a reload mid-flow doesn't lose it. Submit →
`navigate("/administrator-setup")`.

## 2. Administrator account (`/administrator-setup`) — two separate creates

`pages/onboarding/AdminAccount.tsx`. This is the messiest step:

1. `POST /auth/register` with the admin's own details **plus**
   `company_name`, `company_subdomain`, `company_address` bundled into the
   same payload — registration itself creates a bare `Company` row
   server-side (the response carries `userResponse.current_company`).
2. A **second, separate** call — `companyService.createCompany(...)` —
   fleshes out a fuller profile (email, phone, city, state, country, postal
   code) against the same not-yet-complete company.
3. If step 2 fails, there's no retry: it falls back to whatever bare
   registration already created, shows a warning toast, and redirects to
   **`/companies/add`** — a generic company-management page, not a
   tailored setup step. A mid-setup failure silently downgrades someone
   into the general admin UI instead of the flow they were in.

Completion offers two buttons — "Go to setup wizard" or "Skip to
dashboard" — both real choices.

## 3. The checklist (`/setup-wizard`) — links, not questions

`pages/onboarding/SetupChecklist.tsx`. Not a sequence of questions answered
in place — a status checklist where each item **links out** to a real page:

| Item | Links to | "Completed" means |
|---|---|---|
| Company Profile | `/companies/{id}` | `name`, `email`, `address` all present |
| Organizational Structure | `/departments/add` | ≥1 active department |
| Initial Employee Upload | `/employees/add` | ≥2 active employees |

All three computed server-side by one custom action —
`GET /onboarding/processes/onboarding_checklist/` — bolted onto
`OnboardingProcessViewSet` in `apps/onboarding/views.py`.

A fourth item, **"Payroll & Statutory"**, exists in the frontend source as a
commented-out array entry (`// not part of the checklist yet`). Even the
legacy system never finished wiring payroll setup into this flow.

"Skip to dashboard" is on every screen in this flow, same principle as the
current wizard's "Skip setup" — nothing here is a hard gate either.

## 4. `apps/onboarding` is a new-hire onboarding app wearing a second hat

Worth knowing before touching either: `apps/onboarding` is not a
company-setup module that happens to also do new-hire onboarding — it's the
reverse. The real, deep model is `OnboardingProcess` (hiring manager, HR
coordinator, due dates) plus `ChecklistTemplate`, `ChecklistItem`,
`Document`, `Task` — all built around bringing on a new **employee**. The
company-setup checklist above is one read-only action riding on top of
that app, not a first-class model of its own. The naming collision the
current system's doc warns about is worse here: one Django app *is* both
things, not two similarly-named files.

## A bug worth knowing, if this is ever touched again

The "Organizational Structure" check's description says "minimum 1
department **with reporting lines**", but the actual condition is:

```python
organizational_structure = (
    department_count >= 1 and departments_with_managers >= 0
)
```

`departments_with_managers >= 0` is always true — a count cannot be
negative. So a department with no manager still passes; the description
overclaims what's actually checked. Never fixed as far as this document's
research went.

## Email verification: a real transport existed here

Unlike the current system (`approvehr-backend/src/modules/auth/delivery.ts`,
which has **no** mail transport by design, and says so loudly), the legacy
backend built real send capability: `apps/core/email_services/` includes an
`EmailService`, a `SwitchableEmailService`, and `apps/core/email_backends/
resend_backend.py` — a [Resend](https://resend.com) integration. The local
`.env` in this checked-out copy points `EMAIL_BACKEND` at Django's console
backend (prints instead of sending, dev-only), so this document cannot
confirm what production actually used — but the capability existed, which
the current system's "Email verification — a nudge, not a gate" section
(see the sibling document) does not have yet.

## One more thing: this flow may already have been retired

All three routes (`/register`, `/company-setup`, `/administrator-setup`)
are gated behind `import.meta.env.VITE_SHOW_LOGIN_SUBDOMAIN_FIELD ===
"true"` in `App.tsx`. When that flag is off, none of them render — they
**external-redirect** to the separate marketing site's own `/register`.
Depending on how that env var was actually set in production, self-serve
company creation inside this app may have already been abandoned in favour
of the marketing site before this codebase was retired for the rebuild.

---

# Comparing the two

| | Legacy (`approvehr-platform-frontend` + `approvehr-v2-backend`) | Current (this repo + `approvehr-backend`) |
|---|---|---|
| **Steps** | 3 pages: company profile → admin account → checklist | 1 page: register (5 fields) → wizard |
| **Structure of the last step** | Status checklist, links out to other pages, no in-place answers | 8 in-place questions, one per screen, answered without leaving |
| **Company creation** | Two separate API calls (register bundles a bare company, then a second `createCompany` fleshes it out); failure mid-way silently redirects to a generic "add company" page | One `POST /auth/register`, one transaction; `/setup/wizard/complete` is idempotent by construction, no failure-path redirect needed |
| **Multi-tenancy** | Subdomain-based (`company.approvehr.io`), checked live for availability | `organizationId`-scoped only, no subdomain concept |
| **What decides "done"** | Real state elsewhere (profile fields filled, departments/employees created) — nothing to skip past, only to go and do | Explicit wizard questions with defaults; every one skippable, "Skip setup" finishes instantly at the safe defaults |
| **Legal/statutory framing** | None found — the checklist checks presence of data, not compliance consequences | PAYE and pension questions render the API's own legal-consequence sentence before the click (Personal Income Tax Act, Pension Reform Act 2014's 15-employee threshold) |
| **Payroll/statutory setup** | Planned (a commented-out 4th checklist item) but never shipped | Two of the eight wizard questions directly configure the payroll engine; defaults seed automatically on completion |
| **Seeding on completion** | None found | Nigerian statutory leave types + default payroll settings, seeded automatically |
| **Email verification** | A real transport existed (Resend integration) — verification could plausibly gate access, though this document can't confirm production enforcement | No transport exists by design; verification is a dismissible nudge only, documented as such |
| **Progressive disclosure** | None — same 3-page flow regardless of company size | The wizard's headcount answer alone turns departments/grades off for companies under 10 people |
| **Live status** | Possibly already retired — gated behind an env flag that, off, redirects to an external marketing site instead | Live; register → dashboard → `SetupGate` → wizard is the active path |

## The one-line version

The legacy flow **collects data and checks it exists elsewhere**; the
current flow **asks a fixed set of questions and configures the product
from the answers, including the two that carry real legal weight**. The
legacy system built more infrastructure it never finished connecting
(Resend, the payroll checklist item); the current system shipped a smaller
surface but closed the loop on what it did ship — every question actually
changes something, and the two that matter most (PAYE, pension) can't be
answered wrong without being told the consequence first.
