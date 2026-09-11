# Functions and modules — ApproveHR API

_Repo:_ `approvehr-backend` · _Generated from_ `src/**/*.ts` (tests excluded)

This platform has no pages. It is Express 5 + Prisma, arranged as one folder per module, each with the
same three files: `router.ts` (the HTTP surface), `schemas.ts` (what a request may contain) and
`service.ts` (what actually happens). Read `src/modules/departments/` first — it is the reference shape.

Constants and types are counted rather than listed. Endpoint paths below are the full mounted path.

| Module | Files | Exported functions | Endpoints |
|---|---:|---:|---:|
| [`src/modules/admin`](#src-modules-admin) | 6 | 21 | 18 |
| [`src/modules/advances`](#src-modules-advances) | 3 | 12 | 9 |
| [`src/modules/ai`](#src-modules-ai) | 11 | 21 | 10 |
| [`src/modules/announcements`](#src-modules-announcements) | 3 | 8 | 8 |
| [`src/modules/approvals`](#src-modules-approvals) | 3 | 9 | 7 |
| [`src/modules/assets`](#src-modules-assets) | 3 | 24 | 22 |
| [`src/modules/attendance`](#src-modules-attendance) | 11 | 50 | 27 |
| [`src/modules/audit`](#src-modules-audit) | 6 | 14 | 5 |
| [`src/modules/auth`](#src-modules-auth) | 7 | 44 | 21 |
| [`src/modules/benefits`](#src-modules-benefits) | 3 | 8 | 8 |
| [`src/modules/careers`](#src-modules-careers) | 5 | 19 | 15 |
| [`src/modules/company`](#src-modules-company) | 3 | 8 | 9 |
| [`src/modules/conduct`](#src-modules-conduct) | 3 | 14 | 14 |
| [`src/modules/demo-requests`](#src-modules-demo-requests) | 3 | 1 | 1 |
| [`src/modules/departments`](#src-modules-departments) | 3 | 8 | 9 |
| [`src/modules/documents`](#src-modules-documents) | 3 | 14 | 15 |
| [`src/modules/employees`](#src-modules-employees) | 4 | 18 | 12 |
| [`src/modules/exports`](#src-modules-exports) | 2 | 4 | 3 |
| [`src/modules/grades`](#src-modules-grades) | 3 | 10 | 9 |
| [`src/modules/helpdesk`](#src-modules-helpdesk) | 5 | 33 | 18 |
| [`src/modules/imports`](#src-modules-imports) | 9 | 28 | 3 |
| [`src/modules/insights`](#src-modules-insights) | 5 | 6 | 5 |
| [`src/modules/invites`](#src-modules-invites) | 4 | 13 | 11 |
| [`src/modules/knowledge`](#src-modules-knowledge) | 5 | 26 | 16 |
| [`src/modules/leave`](#src-modules-leave) | 6 | 29 | 17 |
| [`src/modules/loans`](#src-modules-loans) | 3 | 16 | 10 |
| [`src/modules/notifications`](#src-modules-notifications) | 3 | 7 | 5 |
| [`src/modules/offboarding`](#src-modules-offboarding) | 4 | 22 | 19 |
| [`src/modules/onboarding`](#src-modules-onboarding) | 4 | 17 | 13 |
| [`src/modules/one-on-ones`](#src-modules-one-on-ones) | 3 | 13 | 11 |
| [`src/modules/overtime`](#src-modules-overtime) | 3 | 10 | 6 |
| [`src/modules/pay-components`](#src-modules-pay-components) | 3 | 19 | 12 |
| [`src/modules/payments`](#src-modules-payments) | 20 | 62 | 24 |
| [`src/modules/payroll`](#src-modules-payroll) | 15 | 69 | 32 |
| [`src/modules/performance`](#src-modules-performance) | 7 | 111 | 85 |
| [`src/modules/permissions`](#src-modules-permissions) | 3 | 20 | 11 |
| [`src/modules/push`](#src-modules-push) | 2 | 3 | 4 |
| [`src/modules/recruitment`](#src-modules-recruitment) | 4 | 47 | 44 |
| [`src/modules/reimbursements`](#src-modules-reimbursements) | 3 | 20 | 15 |
| [`src/modules/reports`](#src-modules-reports) | 5 | 13 | 9 |
| [`src/modules/setup`](#src-modules-setup) | 4 | 8 | 7 |
| [`src/modules/shifts`](#src-modules-shifts) | 3 | 21 | 18 |
| [`src/modules/signatures`](#src-modules-signatures) | 4 | 12 | 9 |
| [`src/modules/teams`](#src-modules-teams) | 3 | 9 | 8 |
| [`src/modules/webhooks`](#src-modules-webhooks) | 8 | 35 | 10 |
| [Shared — everything outside `src/modules`](#shared-everything-outside-src-modules) | 23 | 62 | — |
| **Total** | **246** | **1038** | **644** |

---

## `src/modules/admin`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/admin/auth-service.ts` | `login`, `validateSession`, `logout`, `bootstrapFirstAdmin` | 1 type |
| `src/modules/admin/errors.ts` | `escapeHtml`, `adminErrorHandler` | — |
| `src/modules/admin/middleware.ts` | `requirePlatformAdmin`, `requireCsrf` | 1 const |
| `src/modules/admin/registry.ts` | `buildRegistry` | 1 const · 4 types |
| `src/modules/admin/router.ts` | — | 1 const |
| `src/modules/admin/service.ts` | `encodeKey`, `decodeKey`, `coerceValue`, `buildWriteData`, `toUniqueWhere`, `searchableFields`, `list`, `get`, `create`, `update`, `archiveOrDelete`, `recordAdminAudit` | — |

**Endpoints — 18**

| Method | Path |
|---|---|
| `GET` | `/admin/login` |
| `POST` | `/admin/login` |
| `POST` | `/admin/bootstrap` |
| `POST` | `/admin/logout` |
| `GET` | `/admin/logout-form` |
| `GET` | `/admin/` |
| `GET` | `/admin/payments` |
| `GET` | `/admin/payments/:id/wallet` |
| `POST` | `/admin/payments/:id/provider` |
| `POST` | `/admin/payments/:id/reserved-account` |
| `POST` | `/admin/payments/:id/reserved-account/9japay` |
| `GET` | `/admin/_lookup/:model` |
| `GET` | `/admin/:model` |
| `GET` | `/admin/:model/new` |
| `POST` | `/admin/:model` |
| `GET` | `/admin/:model/:id` |
| `POST` | `/admin/:model/:id` |
| `POST` | `/admin/:model/:id/delete` |

---

## `src/modules/advances`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/advances/router.ts` | — | 1 const |
| `src/modules/advances/schemas.ts` | — | 5 const · 2 types |
| `src/modules/advances/service.ts` | `policy`, `setPolicy`, `eligibility`, `list`, `get`, `request`, `approve`, `decline`, `cancel`, `markPaid`, `dueAdvancesFor`, `recordRecovery` | 2 const · 5 types |

**Endpoints — 9**

| Method | Path |
|---|---|
| `GET` | `/advances/policy` |
| `PATCH` | `/advances/policy` |
| `GET` | `/advances/me` |
| `GET` | `/advances/` |
| `POST` | `/advances/` |
| `POST` | `/advances/:id/approve` |
| `POST` | `/advances/:id/decline` |
| `POST` | `/advances/:id/cancel` |
| `POST` | `/advances/:id/mark-paid` |

---

## `src/modules/ai`

The assistant: ask, suggest, chat, and the confirm-before-write actions.

| File | Exported functions | Also |
|---|---|---|
| `src/modules/ai/actions.ts` | `actionsFor`, `actionByName`, `assertMayAct` | 1 const · 4 types |
| `src/modules/ai/agent.ts` | `chat` | 2 types |
| `src/modules/ai/anthropic.ts` | `anthropic` | 1 type |
| `src/modules/ai/ask.ts` | `ask` | 1 type |
| `src/modules/ai/gemini.ts` | `gemini` | 1 type |
| `src/modules/ai/prompt.ts` | `buildMessage`, `parseSuggestions` | 1 const |
| `src/modules/ai/provider.ts` | `clearAssistant`, `assistant`, `assistantAvailable`, `suggest`, `useAssistant` | 1 const · 6 types |
| `src/modules/ai/reads.ts` | `readsFor`, `runRead` | 1 const · 2 types |
| `src/modules/ai/router.ts` | — | 1 const |
| `src/modules/ai/schemas.ts` | — | 7 const · 5 types |
| `src/modules/ai/service.ts` | `suggestObjectives`, `suggestTaskSummary`, `suggestDevelopment`, `draftPeriodGoals`, `draftPeriodQuestions` | — |

**Endpoints — 10**

| Method | Path |
|---|---|
| `GET` | `/ai/status` |
| `POST` | `/ai/ask` |
| `POST` | `/ai/chat` |
| `GET` | `/ai/actions` |
| `POST` | `/ai/actions/:name` |
| `POST` | `/ai/suggest/objectives` |
| `POST` | `/ai/suggest/task-summary` |
| `POST` | `/ai/suggest/development` |
| `POST` | `/ai/draft/period-goals` |
| `POST` | `/ai/draft/period-questions` |

---

## `src/modules/announcements`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/announcements/router.ts` | — | 1 const |
| `src/modules/announcements/schemas.ts` | — | 3 const · 3 types |
| `src/modules/announcements/service.ts` | `list`, `get`, `boardFor`, `create`, `update`, `publish`, `unpublish`, `remove` | 1 const · 5 types |

**Endpoints — 8**

| Method | Path |
|---|---|
| `GET` | `/announcements/board` |
| `GET` | `/announcements/` |
| `GET` | `/announcements/:id` |
| `POST` | `/announcements/` |
| `PATCH` | `/announcements/:id` |
| `POST` | `/announcements/:id/publish` |
| `POST` | `/announcements/:id/unpublish` |
| `DELETE` | `/announcements/:id` |

---

## `src/modules/approvals`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/approvals/router.ts` | — | 1 const |
| `src/modules/approvals/schemas.ts` | — | 2 const · 2 types |
| `src/modules/approvals/service.ts` | `serialize`, `mirrorApprovalDecision`, `list`, `sentByMe`, `summary`, `decide`, `reopen`, `approveRoutine`, `reconcile` | 1 type |

**Endpoints — 7**

| Method | Path |
|---|---|
| `GET` | `/approvals/` |
| `GET` | `/approvals/summary` |
| `GET` | `/approvals/sent` |
| `POST` | `/approvals/:id/decide` |
| `POST` | `/approvals/:id/reopen` |
| `POST` | `/approvals/approve-routine` |
| `POST` | `/approvals/reconcile` |

---

## `src/modules/assets`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/assets/router.ts` | — | 1 const |
| `src/modules/assets/schemas.ts` | — | 14 const · 14 types |
| `src/modules/assets/service.ts` | `listCategories`, `getCategory`, `createCategory`, `updateCategory`, `list`, `get`, `create`, `update`, `archive`, `restore`, `assign`, `returnAsset`, `assetsHeldBy`, `acknowledge`, `holdings`, `listMaintenance`, `addMaintenance`, `updateMaintenance`, `summary`, `reportFault`, `listRepairs`, `getRepair`, `confirmRepairReturn`, `advanceRepair` | 8 types |

**Endpoints — 22**

| Method | Path |
|---|---|
| `GET` | `/assets/categories` |
| `POST` | `/assets/categories` |
| `PATCH` | `/assets/categories/:id` |
| `GET` | `/assets/maintenance` |
| `PATCH` | `/assets/maintenance/:id` |
| `GET` | `/assets/summary` |
| `GET` | `/assets/employees/:id` |
| `POST` | `/assets/assignments/:id/acknowledge` |
| `GET` | `/assets/` |
| `POST` | `/assets/` |
| `GET` | `/assets/repairs` |
| `GET` | `/assets/repairs/:id` |
| `POST` | `/assets/:id/repairs` |
| `POST` | `/assets/repairs/:id/confirm-return` |
| `PATCH` | `/assets/repairs/:id` |
| `GET` | `/assets/:id` |
| `PATCH` | `/assets/:id` |
| `DELETE` | `/assets/:id` |
| `POST` | `/assets/:id/restore` |
| `POST` | `/assets/:id/assign` |
| `POST` | `/assets/:id/return` |
| `POST` | `/assets/:id/maintenance` |

---

## `src/modules/attendance`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/attendance/corrections.ts` | `requestCorrection`, `decideCorrection`, `myCorrections` | — |
| `src/modules/attendance/day-status.ts` | `minutesOf`, `isoWeekday`, `lateAfterMinutes`, `earlyBeforeMinutes`, `dayKind`, `resolveDayStatus`, `employedOn`, `employedWithin`, `wasEmployedOn` | 1 const · 3 types |
| `src/modules/attendance/devices.ts` | `requireDevice`, `listDevices`, `getDevice`, `createDevice`, `updateDevice`, `archiveDevice`, `restoreDevice`, `rotateSecret`, `listEnrolments`, `mapEnrolment`, `unmapEnrolment`, `deviceBySerialForIngestion`, `dbForDevice`, `markSeen` | 4 types |
| `src/modules/attendance/geofence.ts` | `distanceMetres`, `describeDistance`, `judgeFence` | 1 const · 4 types |
| `src/modules/attendance/ingest.ts` | — | 3 const |
| `src/modules/attendance/locations.ts` | `list`, `update`, `restore` | 1 type |
| `src/modules/attendance/punches.ts` | `recordPunches`, `interpretDay`, `attributeBacklog` | 2 types |
| `src/modules/attendance/router.ts` | — | 1 const |
| `src/modules/attendance/schemas.ts` | — | 17 const · 14 types |
| `src/modules/attendance/service.ts` | `timeOf`, `hasDirectReports`, `getPolicy`, `updatePolicy`, `roster`, `timesheet`, `history`, `clockIn`, `reopenClockOut`, `clockOut`, `correct`, `createLocation`, `archiveLocation`, `listLocations` | 1 const · 3 types |
| `src/modules/attendance/summary.ts` | `monthSummary` | 2 types |

**Endpoints — 27**

| Method | Path |
|---|---|
| `GET` | `/attendance/locations` |
| `POST` | `/attendance/locations` |
| `DELETE` | `/attendance/locations/:id` |
| `PATCH` | `/attendance/locations/:id` |
| `POST` | `/attendance/locations/:id/restore` |
| `GET` | `/attendance/policy` |
| `PATCH` | `/attendance/policy` |
| `GET` | `/attendance/roster` |
| `GET` | `/attendance/summary` |
| `GET` | `/attendance/timesheet` |
| `GET` | `/attendance/history` |
| `GET` | `/attendance/corrections/mine` |
| `POST` | `/attendance/corrections` |
| `POST` | `/attendance/clock-in` |
| `POST` | `/attendance/clock-out` |
| `POST` | `/attendance/clock-out/undo` |
| `PATCH` | `/attendance/entries/:employeeId/:date` |
| `GET` | `/attendance/devices` |
| `GET` | `/attendance/devices/:id` |
| `POST` | `/attendance/devices` |
| `PATCH` | `/attendance/devices/:id` |
| `DELETE` | `/attendance/devices/:id` |
| `POST` | `/attendance/devices/:id/restore` |
| `POST` | `/attendance/devices/:id/rotate-secret` |
| `GET` | `/attendance/devices/:id/enrolments` |
| `POST` | `/attendance/devices/:id/enrolments` |
| `DELETE` | `/attendance/devices/:deviceId/enrolments/:id` |

---

## `src/modules/audit`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/audit/diff.ts` | `isSensitiveField`, `humanise`, `renderDiff` | 3 types |
| `src/modules/audit/labels.ts` | `nounFor`, `labelsFor`, `labelKey`, `idsMatchingLabel` | 1 const · 1 type |
| `src/modules/audit/read-log.ts` | `isReadAction`, `noteRead` | 2 const · 2 types |
| `src/modules/audit/router.ts` | — | 1 const |
| `src/modules/audit/schemas.ts` | — | 5 const · 4 types |
| `src/modules/audit/service.ts` | `list`, `get`, `timeline`, `actors`, `summary` | 5 types |

**Endpoints — 5**

| Method | Path |
|---|---|
| `GET` | `/audit/` |
| `GET` | `/audit/actors` |
| `GET` | `/audit/summary` |
| `GET` | `/audit/entity/:type/:id` |
| `GET` | `/audit/:id` |

---

## `src/modules/auth`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/auth/delivery.ts` | `warnIfNoTransport`, `deliver`, `useTransport` | 3 types |
| `src/modules/auth/mail-transport.ts` | `compose`, `linkFor` | 1 const |
| `src/modules/auth/router.ts` | — | 1 const |
| `src/modules/auth/schemas.ts` | — | 11 const · 11 types |
| `src/modules/auth/service.ts` | `hashPassword`, `signIn`, `completeTwoFactor`, `refresh`, `signOut`, `signOutEverywhere`, `changePassword`, `register`, `issueInvite`, `mintInviteLink`, `resetPasswordRequirements`, `inviteRequirements`, `requestEmailVerification`, `confirmEmail`, `forgotPassword`, `resetPassword`, `acceptInvite`, `dismissTour`, `twoFactorStatus`, `requestStepUp`, `verifyStepUp` | 8 types |
| `src/modules/auth/tokens.ts` | `signAccessToken`, `verifyAccessToken`, `createRefreshToken`, `hashRefreshToken`, `durationToMs`, `refreshTokenExpiry`, `createEmailToken`, `hashEmailToken`, `emailTokenExpiry` | 1 type |
| `src/modules/auth/two-factor.ts` | `enrol`, `unenrol`, `recoveryCodesLeft`, `issueCode`, `verifyCode`, `hasStepUpGrant`, `stepUpRequired`, `signInChallengeRequired`, `useRecoveryCode` | 2 const · 2 types |

**Endpoints — 21**

| Method | Path |
|---|---|
| `POST` | `/auth/register` |
| `POST` | `/auth/sign-in` |
| `POST` | `/auth/two-factor` |
| `POST` | `/auth/refresh` |
| `POST` | `/auth/sign-out` |
| `POST` | `/auth/sign-out-everywhere` |
| `POST` | `/auth/change-password` |
| `POST` | `/auth/verify-email/request` |
| `POST` | `/auth/verify-email/confirm` |
| `POST` | `/auth/forgot-password` |
| `GET` | `/auth/reset-password` |
| `POST` | `/auth/reset-password` |
| `GET` | `/auth/accept-invite` |
| `POST` | `/auth/accept-invite` |
| `GET` | `/auth/me` |
| `POST` | `/auth/tour/dismiss` |
| `GET` | `/auth/two-factor` |
| `POST` | `/auth/two-factor/enrol` |
| `DELETE` | `/auth/two-factor` |
| `POST` | `/auth/step-up/request` |
| `POST` | `/auth/step-up/verify` |

---

## `src/modules/benefits`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/benefits/router.ts` | — | 1 const |
| `src/modules/benefits/schemas.ts` | — | 5 const · 3 types |
| `src/modules/benefits/service.ts` | `listPlans`, `createPlan`, `updatePlan`, `listEnrolments`, `enrol`, `endEnrolment`, `benefitDeductionsFor`, `benefitCostFor` | 3 const · 5 types |

**Endpoints — 8**

| Method | Path |
|---|---|
| `GET` | `/benefits/notices` |
| `GET` | `/benefits/plans` |
| `POST` | `/benefits/plans` |
| `PATCH` | `/benefits/plans/:id` |
| `GET` | `/benefits/enrolments` |
| `POST` | `/benefits/plans/:id/enrolments` |
| `POST` | `/benefits/enrolments/:id/end` |
| `GET` | `/benefits/cost` |

---

## `src/modules/careers`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/careers/public.ts` | `organizationForPosting`, `listPublished`, `getPublished`, `apply` | 2 types |
| `src/modules/careers/router.ts` | — | 1 const |
| `src/modules/careers/schemas.ts` | — | 11 const · 8 types |
| `src/modules/careers/service.ts` | `isOpen`, `listPostings`, `getPosting`, `createPosting`, `updatePosting`, `publishPosting`, `closePosting`, `listApplications`, `getApplication`, `advance`, `decline`, `analytics` | 2 types |
| `src/modules/careers/storage.ts` | `cvStoreWired`, `cvAccess`, `useCvStore` | 3 types |

**Endpoints — 15**

| Method | Path |
|---|---|
| `GET` | `/:orgSlug` |
| `GET` | `/:orgSlug/:postingSlug` |
| `POST` | `/:orgSlug/:postingSlug/apply` |
| `POST` | `/:orgSlug/:postingSlug/upload-url` |
| `GET` | `/careers/postings` |
| `POST` | `/careers/postings` |
| `GET` | `/careers/postings/:id` |
| `PATCH` | `/careers/postings/:id` |
| `POST` | `/careers/postings/:id/publish` |
| `POST` | `/careers/postings/:id/close` |
| `GET` | `/careers/applications` |
| `GET` | `/careers/applications/:id` |
| `POST` | `/careers/applications/:id/advance` |
| `POST` | `/careers/applications/:id/decline` |
| `GET` | `/careers/analytics` |

---

## `src/modules/company`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/company/router.ts` | — | 1 const |
| `src/modules/company/schemas.ts` | — | 5 const · 4 types |
| `src/modules/company/service.ts` | `profile`, `updateProfile`, `listRoles`, `updateRole`, `listNotifications`, `updateNotification`, `listIntegrations`, `setIntegration` | — |

**Endpoints — 9**

| Method | Path |
|---|---|
| `GET` | `/company/profile` |
| `PATCH` | `/company/profile` |
| `GET` | `/company/roles` |
| `PATCH` | `/company/roles/:id` |
| `GET` | `/company/notifications` |
| `PATCH` | `/company/notifications/:id` |
| `GET` | `/company/integrations` |
| `POST` | `/company/integrations` |
| `GET` | `/company/tax-states` |

---

## `src/modules/conduct`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/conduct/router.ts` | — | 1 const |
| `src/modules/conduct/schemas.ts` | — | 10 const · 10 types |
| `src/modules/conduct/service.ts` | `listPolicies`, `getPolicy`, `createPolicy`, `updatePolicy`, `publishPolicy`, `acknowledgePolicy`, `policyAcknowledgements`, `myPolicies`, `getAction`, `listActions`, `recordFor`, `createAction`, `updateAction`, `acknowledgeAction` | 6 types |

**Endpoints — 14**

| Method | Path |
|---|---|
| `GET` | `/conduct/policies` |
| `POST` | `/conduct/policies` |
| `GET` | `/conduct/me/policies` |
| `GET` | `/conduct/policies/:id` |
| `PATCH` | `/conduct/policies/:id` |
| `POST` | `/conduct/policies/:id/publish` |
| `POST` | `/conduct/policies/:id/acknowledge` |
| `GET` | `/conduct/policies/:id/acknowledgements` |
| `GET` | `/conduct/actions` |
| `POST` | `/conduct/actions` |
| `GET` | `/conduct/actions/:id` |
| `PATCH` | `/conduct/actions/:id` |
| `GET` | `/conduct/employees/:id/actions` |
| `POST` | `/conduct/actions/:id/acknowledge` |

---

## `src/modules/demo-requests`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/demo-requests/router.ts` | — | 1 const |
| `src/modules/demo-requests/schemas.ts` | — | 1 const · 1 type |
| `src/modules/demo-requests/service.ts` | `record` | 1 type |

**Endpoints — 1**

| Method | Path |
|---|---|
| `POST` | `/demo-requests/` |

---

## `src/modules/departments`

**The reference module.** Copy this shape for a new one.

| File | Exported functions | Also |
|---|---|---|
| `src/modules/departments/router.ts` | — | 1 const |
| `src/modules/departments/schemas.ts` | — | 5 const · 3 types |
| `src/modules/departments/service.ts` | `tree`, `get`, `create`, `update`, `move`, `archive`, `restore`, `assign` | 1 type |

**Endpoints — 9**

| Method | Path |
|---|---|
| `GET` | `/departments/` |
| `GET` | `/departments/:id` |
| `POST` | `/departments/` |
| `PATCH` | `/departments/:id` |
| `POST` | `/departments/:id/move` |
| `DELETE` | `/departments/:id` |
| `POST` | `/departments/:id/restore` |
| `POST` | `/departments/:id/employees` |
| `POST` | `/departments/unassign` |

---

## `src/modules/documents`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/documents/router.ts` | — | 1 const |
| `src/modules/documents/schemas.ts` | — | 9 const · 9 types |
| `src/modules/documents/service.ts` | `fileAccess`, `listForEmployee`, `addForEmployee`, `documentContent`, `archiveDocument`, `verifyDocument`, `listRequests`, `listMyRequests`, `getRequest`, `createRequest`, `remindRequest`, `fulfilRequest`, `waiveRequest`, `expiring` | 3 types |

**Endpoints — 15**

| Method | Path |
|---|---|
| `GET` | `/documents/me/requests` |
| `GET` | `/documents/expiring` |
| `GET` | `/documents/requests` |
| `POST` | `/documents/requests` |
| `GET` | `/documents/requests/:id` |
| `POST` | `/documents/requests/:id/remind` |
| `POST` | `/documents/requests/:id/fulfil` |
| `POST` | `/documents/requests/:id/waive` |
| `GET` | `/documents/employees/:id` |
| `POST` | `/documents/employees/:id/upload-url` |
| `GET` | `/documents/:id/file` |
| `GET` | `/documents/:id/content` |
| `POST` | `/documents/employees/:id` |
| `POST` | `/documents/:id/verify` |
| `DELETE` | `/documents/:id` |

---

## `src/modules/employees`

The staff record, the reporting line and the directory.

| File | Exported functions | Also |
|---|---|---|
| `src/modules/employees/router.ts` | — | 1 const |
| `src/modules/employees/schemas.ts` | — | 6 const · 4 types |
| `src/modules/employees/self-service.ts` | `selfMayTouch`, `selfNeedsApproval`, `updateOwnRecord`, `describe`, `decideChange`, `pendingFor` | 3 const · 4 types |
| `src/modules/employees/service.ts` | `missingForPayroll`, `serialize`, `orgChart`, `serializeDirectory`, `list`, `get`, `summary`, `create`, `update`, `archive`, `restore`, `bulkAssign` | 3 types |

**Endpoints — 12**

| Method | Path |
|---|---|
| `GET` | `/employees/` |
| `POST` | `/employees/bulk-assign` |
| `GET` | `/employees/org-chart` |
| `GET` | `/employees/summary` |
| `PATCH` | `/employees/me` |
| `GET` | `/employees/me/changes` |
| `GET` | `/employees/:id` |
| `POST` | `/employees/` |
| `PATCH` | `/employees/:id` |
| `DELETE` | `/employees/:id` |
| `POST` | `/employees/:id/restore` |
| `GET` | `/employees/:id/history` |

---

## `src/modules/exports`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/exports/router.ts` | — | 1 const |
| `src/modules/exports/service.ts` | `assertWithinCap`, `staff`, `pay`, `attendanceSummary` | 1 const · 1 type |

**Endpoints — 3**

| Method | Path |
|---|---|
| `GET` | `/exports/staff.csv` |
| `GET` | `/exports/payroll-runs/:id/payslips.csv` |
| `GET` | `/exports/attendance.csv` |

---

## `src/modules/grades`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/grades/router.ts` | — | 1 const |
| `src/modules/grades/schemas.ts` | — | 7 const · 5 types |
| `src/modules/grades/service.ts` | `bandPosition`, `list`, `get`, `employeesOn`, `position`, `create`, `update`, `archive`, `restore`, `applyIncrease` | 4 types |

**Endpoints — 9**

| Method | Path |
|---|---|
| `GET` | `/grades/` |
| `GET` | `/grades/position/:employeeId` |
| `GET` | `/grades/:id` |
| `GET` | `/grades/:id/employees` |
| `POST` | `/grades/` |
| `PATCH` | `/grades/:id` |
| `DELETE` | `/grades/:id` |
| `POST` | `/grades/:id/restore` |
| `POST` | `/grades/:id/apply-increase` |

---

## `src/modules/helpdesk`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/helpdesk/router.ts` | — | 1 const |
| `src/modules/helpdesk/schemas.ts` | — | 15 const · 13 types |
| `src/modules/helpdesk/service.ts` | `queue`, `raisedByMe`, `assignedToMe`, `get`, `listComments`, `create`, `update`, `assign`, `resolve`, `reopen`, `addComment`, `listCategories`, `createCategory`, `updateCategory`, `listSla`, `createSla`, `updateSla`, `analytics`, `median` | 4 types |
| `src/modules/helpdesk/sla.ts` | `policyFor`, `deadlinesFor`, `snapshotFrom`, `freeze`, `snapshotsFor`, `breached` | 2 const · 2 types |
| `src/modules/helpdesk/working-hours.ts` | `calendarOf`, `describeCalendar`, `zoneOffsetMinutes`, `isWorkingDay`, `addWorkingMinutes`, `workingMinutesBetween`, `loadCalendar`, `deadlineWindow` | 2 types |

**Endpoints — 18**

| Method | Path |
|---|---|
| `GET` | `/helpdesk/tickets` |
| `GET` | `/helpdesk/tickets/mine` |
| `GET` | `/helpdesk/tickets/assigned` |
| `POST` | `/helpdesk/tickets` |
| `GET` | `/helpdesk/tickets/:id` |
| `PATCH` | `/helpdesk/tickets/:id` |
| `POST` | `/helpdesk/tickets/:id/assign` |
| `POST` | `/helpdesk/tickets/:id/resolve` |
| `POST` | `/helpdesk/tickets/:id/reopen` |
| `GET` | `/helpdesk/tickets/:id/comments` |
| `POST` | `/helpdesk/tickets/:id/comments` |
| `GET` | `/helpdesk/categories` |
| `POST` | `/helpdesk/categories` |
| `PATCH` | `/helpdesk/categories/:id` |
| `GET` | `/helpdesk/sla` |
| `POST` | `/helpdesk/sla` |
| `PATCH` | `/helpdesk/sla/:id` |
| `GET` | `/helpdesk/analytics` |

---

## `src/modules/imports`

The bulk-upload framework: one machine, many column dictionaries. Two callers with different contracts — the spreadsheet upload and the legacy ETL.

| File | Exported functions | Also |
|---|---|---|
| `src/modules/imports/assets.ts` | `checkAssets` | 5 const · 1 type |
| `src/modules/imports/attendance.ts` | `checkAttendance` | 5 const · 1 type |
| `src/modules/imports/columns.ts` | `normalizeKey`, `bad`, `dateOf`, `timeOf`, `parseTime`, `moneyOf`, `parseDate`, `parseMoneyKobo`, `orderColumns`, `buildDictionary`, `cellToString`, `viewOf`, `templateOf` | 2 const · 10 types |
| `src/modules/imports/departments.ts` | `checkDepartments` | 5 const · 1 type |
| `src/modules/imports/employees.ts` | `resolveTaxState`, `checkEmployees` | 11 const · 1 type |
| `src/modules/imports/entity.ts` | `fingerprintOf` | 1 const · 10 types |
| `src/modules/imports/router.ts` | — | 1 const |
| `src/modules/imports/schemas.ts` | — | 8 const · 5 types |
| `src/modules/imports/service.ts` | `register`, `validate`, `apply`, `list`, `rowsFor`, `get`, `validateEmployees`, `applyEmployees`, `employeeTemplate` | 2 const · 2 types |

**Endpoints — 3**

| Method | Path |
|---|---|
| `GET` | `/imports/` |
| `GET` | `/imports/:batchId/rows` |
| `GET` | `/imports/:batchId` |

---

## `src/modules/insights`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/insights/layout.ts` | `layoutFor`, `clearLayout`, `saveLayout` | 1 type |
| `src/modules/insights/router.ts` | — | 1 const |
| `src/modules/insights/schemas.ts` | — | 2 const · 1 type |
| `src/modules/insights/service.ts` | `dashboard`, `reports` | 3 types |
| `src/modules/insights/workforce.ts` | `workforce` | 1 type |

**Endpoints — 5**

| Method | Path |
|---|---|
| `GET` | `/insights/dashboard` |
| `GET` | `/insights/dashboard/layout` |
| `PUT` | `/insights/dashboard/layout` |
| `DELETE` | `/insights/dashboard/layout` |
| `GET` | `/insights/reports` |

---

## `src/modules/invites`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/invites/on-join.ts` | `inviteOnJoin` | 1 type |
| `src/modules/invites/router.ts` | — | 1 const |
| `src/modules/invites/schemas.ts` | `userIdParam` | 6 const · 5 types |
| `src/modules/invites/service.ts` | `send`, `bulkSend`, `bulkSendByEmail`, `list`, `resend`, `inviteLink`, `revoke`, `unlinkedUsers`, `linkToEmployee`, `createEmployeeAndLink`, `accessFor` | 7 types |

**Endpoints — 11**

| Method | Path |
|---|---|
| `POST` | `/invites/` |
| `POST` | `/invites/bulk` |
| `POST` | `/invites/by-email` |
| `GET` | `/invites/delivery` |
| `GET` | `/invites/` |
| `POST` | `/invites/:userId/resend` |
| `POST` | `/invites/:userId/link` |
| `DELETE` | `/invites/:userId` |
| `GET` | `/invites/unlinked` |
| `PATCH` | `/invites/:userId/employee` |
| `POST` | `/invites/:userId/employee` |

---

## `src/modules/knowledge`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/knowledge/router.ts` | — | 1 const |
| `src/modules/knowledge/schemas.ts` | — | 8 const · 7 types |
| `src/modules/knowledge/search.ts` | `terms`, `run`, `snippet` | 1 type |
| `src/modules/knowledge/service.ts` | `slugify`, `categoryTree`, `createCategory`, `updateCategory`, `removeCategory`, `reorderCategories`, `listArticles`, `getArticle`, `createArticle`, `updateArticle`, `publishArticle`, `unpublishArticle`, `archiveArticle`, `searchArticles`, `recordFeedback`, `analytics` | 5 types |
| `src/modules/knowledge/store.ts` | `ready`, `vote`, `talliesFor`, `leastHelpful`, `voteCount`, `recordMiss`, `misses` | 1 const · 2 types |

**Endpoints — 16**

| Method | Path |
|---|---|
| `GET` | `/knowledge/categories` |
| `POST` | `/knowledge/categories` |
| `POST` | `/knowledge/categories/reorder` |
| `PATCH` | `/knowledge/categories/:id` |
| `DELETE` | `/knowledge/categories/:id` |
| `GET` | `/knowledge/search` |
| `GET` | `/knowledge/analytics` |
| `GET` | `/knowledge/articles` |
| `GET` | `/knowledge/articles/:id` |
| `POST` | `/knowledge/articles` |
| `PATCH` | `/knowledge/articles/:id` |
| `DELETE` | `/knowledge/articles/:id` |
| `POST` | `/knowledge/articles/:id/publish` |
| `POST` | `/knowledge/articles/:id/unpublish` |
| `POST` | `/knowledge/articles/:id/helpful` |
| `POST` | `/knowledge/articles/:id/not-helpful` |

---

## `src/modules/leave`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/leave/balance.ts` | `leaveYearOf`, `computeBalances`, `balancesFor`, `workingDaysBetween`, `calendarSpan`, `countLeaveDays`, `overlapping`, `clashesWith` | 3 types |
| `src/modules/leave/rollover-scheduler.ts` | `sweepRollovers`, `startRolloverScheduler`, `stopRolloverScheduler` | 1 type |
| `src/modules/leave/rollover.ts` | `rollOverInto` | 1 type |
| `src/modules/leave/router.ts` | — | 1 const |
| `src/modules/leave/schemas.ts` | — | 10 const · 6 types |
| `src/modules/leave/service.ts` | `serialize`, `list`, `get`, `listTypes`, `createType`, `archiveType`, `restoreType`, `updateType`, `preview`, `create`, `decide`, `reopen`, `cancel`, `listHolidays`, `createHoliday`, `updateHoliday`, `deleteHoliday` | 1 const · 2 types |

**Endpoints — 17**

| Method | Path |
|---|---|
| `GET` | `/leave/types` |
| `POST` | `/leave/types` |
| `DELETE` | `/leave/types/:id` |
| `POST` | `/leave/types/:id/restore` |
| `PATCH` | `/leave/types/:id` |
| `GET` | `/leave/requests` |
| `GET` | `/leave/requests/preview` |
| `GET` | `/leave/requests/:id` |
| `POST` | `/leave/requests` |
| `POST` | `/leave/requests/:id/decide` |
| `POST` | `/leave/requests/:id/reopen` |
| `POST` | `/leave/requests/:id/cancel` |
| `GET` | `/leave/balances/:id` |
| `GET` | `/leave/holidays` |
| `POST` | `/leave/holidays` |
| `PATCH` | `/leave/holidays/:id` |
| `DELETE` | `/leave/holidays/:id` |

---

## `src/modules/loans`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/loans/router.ts` | — | 1 const |
| `src/modules/loans/schemas.ts` | — | 7 const · 6 types |
| `src/modules/loans/service.ts` | `monthStart`, `addMonths`, `buildSchedule`, `serialize`, `list`, `pending`, `get`, `mine`, `summary`, `apply`, `approve`, `decline`, `applyRepayment`, `payInstalment`, `waiveInstalment`, `dueRepaymentsFor` | 7 types |

**Endpoints — 10**

| Method | Path |
|---|---|
| `GET` | `/loans/me` |
| `GET` | `/loans/pending` |
| `GET` | `/loans/summary` |
| `GET` | `/loans/` |
| `POST` | `/loans/` |
| `GET` | `/loans/:id` |
| `POST` | `/loans/:id/approve` |
| `POST` | `/loans/:id/decline` |
| `POST` | `/loans/:id/repayments/:sequence/pay` |
| `POST` | `/loans/:id/repayments/:sequence/waive` |

---

## `src/modules/notifications`

In-app messages. Nothing here sends email.

| File | Exported functions | Also |
|---|---|---|
| `src/modules/notifications/router.ts` | — | 1 const |
| `src/modules/notifications/schemas.ts` | — | 1 const · 1 type |
| `src/modules/notifications/service.ts` | `list`, `unreadCount`, `markRead`, `markAllRead`, `remove`, `notify`, `notifyMany` | 3 types |

**Endpoints — 5**

| Method | Path |
|---|---|
| `GET` | `/notifications/` |
| `GET` | `/notifications/unread-count` |
| `POST` | `/notifications/read-all` |
| `POST` | `/notifications/:id/read` |
| `DELETE` | `/notifications/:id` |

---

## `src/modules/offboarding`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/offboarding/router.ts` | — | 1 const |
| `src/modules/offboarding/schemas.ts` | — | 12 const · 11 types |
| `src/modules/offboarding/service.ts` | `list`, `get`, `create`, `managerApprove`, `hrApprove`, `decline`, `withdraw`, `updateTask`, `verifyTask`, `readiness`, `complete`, `exitExceptionsFor`, `openExitLoad`, `saveInterview`, `getInterview`, `listTemplates`, `createTemplate`, `updateTemplate`, `deactivateTemplate`, `reorderTemplates`, `adoptDefaultTemplates` | 1 const · 10 types |
| `src/modules/offboarding/templates.ts` | `seedExitTemplates` | 2 const · 1 type |

**Endpoints — 19**

| Method | Path |
|---|---|
| `GET` | `/offboarding/templates` |
| `POST` | `/offboarding/templates/adopt-defaults` |
| `POST` | `/offboarding/templates` |
| `PATCH` | `/offboarding/templates/:id` |
| `DELETE` | `/offboarding/templates/:id` |
| `POST` | `/offboarding/templates/reorder` |
| `PATCH` | `/offboarding/tasks/:id` |
| `POST` | `/offboarding/tasks/:id/verify` |
| `GET` | `/offboarding/` |
| `POST` | `/offboarding/` |
| `GET` | `/offboarding/:id` |
| `GET` | `/offboarding/:id/readiness` |
| `POST` | `/offboarding/:id/manager-approve` |
| `POST` | `/offboarding/:id/hr-approve` |
| `POST` | `/offboarding/:id/decline` |
| `POST` | `/offboarding/:id/withdraw` |
| `POST` | `/offboarding/:id/complete` |
| `GET` | `/offboarding/:id/interview` |
| `POST` | `/offboarding/:id/interview` |

---

## `src/modules/onboarding`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/onboarding/router.ts` | — | 1 const |
| `src/modules/onboarding/schemas.ts` | — | 7 const · 6 types |
| `src/modules/onboarding/service.ts` | `list`, `get`, `createOnboardingProcess`, `closeOnboardingProcess`, `managerApprove`, `hrApprove`, `updateTask`, `readiness`, `complete`, `openOnboardingLoad`, `listTemplates`, `createTemplate`, `updateTemplate`, `deactivateTemplate`, `reorderTemplates`, `adoptDefaultTemplates` | 1 const · 8 types |
| `src/modules/onboarding/templates.ts` | `seedOnboardingTemplates` | 1 const · 1 type |

**Endpoints — 13**

| Method | Path |
|---|---|
| `GET` | `/onboarding/templates` |
| `POST` | `/onboarding/templates/adopt-defaults` |
| `POST` | `/onboarding/templates` |
| `PATCH` | `/onboarding/templates/:id` |
| `DELETE` | `/onboarding/templates/:id` |
| `POST` | `/onboarding/templates/reorder` |
| `PATCH` | `/onboarding/tasks/:id` |
| `GET` | `/onboarding/` |
| `GET` | `/onboarding/:id` |
| `GET` | `/onboarding/:id/readiness` |
| `POST` | `/onboarding/:id/manager-approve` |
| `POST` | `/onboarding/:id/hr-approve` |
| `POST` | `/onboarding/:id/complete` |

---

## `src/modules/one-on-ones`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/one-on-ones/router.ts` | — | 1 const |
| `src/modules/one-on-ones/schemas.ts` | — | 6 const · 5 types |
| `src/modules/one-on-ones/service.ts` | `dueFrom`, `requireSeries`, `mine`, `start`, `updateSeries`, `meetings`, `schedule`, `updateMeeting`, `cancelMeeting`, `addItem`, `setItemDone`, `removeItem`, `coverage` | 2 const · 6 types |

**Endpoints — 11**

| Method | Path |
|---|---|
| `GET` | `/one-on-ones/` |
| `GET` | `/one-on-ones/coverage` |
| `POST` | `/one-on-ones/` |
| `PATCH` | `/one-on-ones/:id` |
| `GET` | `/one-on-ones/:id/meetings` |
| `POST` | `/one-on-ones/:id/meetings` |
| `PATCH` | `/one-on-ones/meetings/:id` |
| `DELETE` | `/one-on-ones/meetings/:id` |
| `POST` | `/one-on-ones/meetings/:id/items` |
| `PATCH` | `/one-on-ones/items/:id` |
| `DELETE` | `/one-on-ones/items/:id` |

---

## `src/modules/overtime`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/overtime/router.ts` | — | 1 const |
| `src/modules/overtime/schemas.ts` | — | 4 const |
| `src/modules/overtime/service.ts` | `getPolicy`, `updatePolicy`, `rateFor`, `valueOvertime`, `detect`, `list`, `decide`, `overtimeFor`, `markPaid`, `pendingIn` | 2 types |

**Endpoints — 6**

| Method | Path |
|---|---|
| `GET` | `/overtime/policy` |
| `PATCH` | `/overtime/policy` |
| `GET` | `/overtime/` |
| `GET` | `/overtime/mine` |
| `POST` | `/overtime/detect` |
| `POST` | `/overtime/:id/decide` |

---

## `src/modules/pay-components`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/pay-components/router.ts` | — | 1 const |
| `src/modules/pay-components/schemas.ts` | — | 10 const · 9 types |
| `src/modules/pay-components/service.ts` | `periodRange`, `serializeComponent`, `specsFrom`, `resolveComponentsFor`, `resolveComponentsForMany`, `list`, `get`, `create`, `update`, `archive`, `assign`, `getAssignment`, `updateAssignment`, `removeAssignment`, `bulkAssign`, `assignToMany`, `assignmentsFor`, `preview`, `seedDefaultPayComponents` | 1 const · 6 types |

**Endpoints — 12**

| Method | Path |
|---|---|
| `GET` | `/pay-components/` |
| `POST` | `/pay-components/` |
| `GET` | `/pay-components/employees/:employeeId` |
| `POST` | `/pay-components/employees/:employeeId` |
| `POST` | `/pay-components/employees/:employeeId/bulk` |
| `POST` | `/pay-components/:id/assign` |
| `GET` | `/pay-components/preview/:employeeId` |
| `PATCH` | `/pay-components/assignments/:id` |
| `DELETE` | `/pay-components/assignments/:id` |
| `GET` | `/pay-components/:id` |
| `PATCH` | `/pay-components/:id` |
| `DELETE` | `/pay-components/:id` |

---

## `src/modules/payments`

The wallet, the ledger and the provider seam. With no provider registered, releasing refuses rather than faking success.

| File | Exported functions | Also |
|---|---|---|
| `src/modules/payments/banks.ts` | `bankByCbnCode`, `bankByCode`, `bankByShortName`, `bankByName`, `searchBanks` | 1 const · 1 type |
| `src/modules/payments/call-log-pruner.ts` | `startProviderCallPruner`, `stopProviderCallPruner` | — |
| `src/modules/payments/call-log.ts` | `redactPayload`, `truncatePayload`, `providerCallRecorder`, `pruneProviderCalls` | 7 types |
| `src/modules/payments/file.ts` | `nairaCell`, `buildBankFile` | 1 const · 2 types |
| `src/modules/payments/mark-paid.ts` | `markBatchPaid` | 1 type |
| `src/modules/payments/monnify-webhook.ts` | `monnifyWebhook` | 1 type |
| `src/modules/payments/provider.ts` | `clearProvidersForTests`, `providerFor`, `submitBatch`, `statusOf`, `useProvider` | 1 const · 6 types |
| `src/modules/payments/providers/config.ts` | `ninejapayIsConfigured`, `ninejapayConfig` | 1 type |
| `src/modules/payments/providers/monnify-client.ts` | `nairaString`, `monnifyClient`, `verifyMonnifySignature` | 10 types |
| `src/modules/payments/providers/monnify-config.ts` | `monnifyIsConfigured`, `monnifyConfig` | 2 types |
| `src/modules/payments/providers/monnify.ts` | `monnify` | — |
| `src/modules/payments/providers/ninejapay-client.ts` | `ninejapayClient`, `verifyWebhookSignature` | 8 types |
| `src/modules/payments/providers/ninejapay.ts` | `ninejapay` | — |
| `src/modules/payments/reserved-accounts.ts` | `provisionReservedAccount`, `provisionNinejapayAccount` | 2 types |
| `src/modules/payments/router.ts` | — | 1 const |
| `src/modules/payments/schemas.ts` | `accountNumberProblem` | 11 const · 11 types |
| `src/modules/payments/service.ts` | `maskAccount`, `paymentHistory`, `listAccounts`, `createAccount`, `updateAccount`, `archiveAccount`, `createBatch`, `listBatches`, `getBatch`, `checkBatch`, `approveBatch`, `submitBatchToProvider`, `applyTransferOutcome`, `cancelBatch`, `bankFile`, `listLedger`, `recordFunding`, `summary` | 4 types |
| `src/modules/payments/wallet-account.ts` | `walletOf`, `credit`, `debit`, `movements`, `reconcileWallet` | 3 types |
| `src/modules/payments/wallet.ts` | `walletBalance`, `affordability`, `fundingAccounts`, `collectionAccount` | 4 types |
| `src/modules/payments/webhook.ts` | `ninejapayWebhook` | 1 type |

**Endpoints — 24**

| Method | Path |
|---|---|
| `POST` | `/webhooks/9japay` |
| `POST` | `/webhooks/monnify` |
| `GET` | `/payments/wallet` |
| `GET` | `/payments/wallet/account` |
| `GET` | `/payments/banks` |
| `POST` | `/payments/account-verification` |
| `GET` | `/payments/account` |
| `GET` | `/payments/accounts` |
| `POST` | `/payments/accounts` |
| `PATCH` | `/payments/accounts/:id` |
| `DELETE` | `/payments/accounts/:id` |
| `GET` | `/payments/batches` |
| `POST` | `/payments/batches` |
| `GET` | `/payments/batches/:id` |
| `POST` | `/payments/batches/:id/check` |
| `POST` | `/payments/batches/:id/approve` |
| `POST` | `/payments/batches/:id/submit` |
| `POST` | `/payments/batches/:id/mark-paid` |
| `POST` | `/payments/batches/:id/cancel` |
| `GET` | `/payments/batches/:id/file` |
| `GET` | `/payments/history` |
| `GET` | `/payments/ledger` |
| `POST` | `/payments/ledger/funding` |
| `GET` | `/payments/summary` |

---

## `src/modules/payroll`

The statutory engine, the run lifecycle, exclusions, hand adjustments and the reconciliation gate.

| File | Exported functions | Also |
|---|---|---|
| `src/modules/payroll/adjustments.ts` | `noPayslipProblem`, `applyAdjustmentSheet` | 5 types |
| `src/modules/payroll/assemble.ts` | `engineSettingsFrom`, `organizationUsesAttendance`, `unpaidDaysFor`, `assembleFor` | 1 type |
| `src/modules/payroll/deductions.ts` | `deductionSpec`, `overridesByEmployee`, `operatesDeduction`, `overrideNote`, `hasOverride`, `overriddenLabels` | 2 const · 2 types |
| `src/modules/payroll/earned.ts` | `earnedToDate` | 1 const · 1 type |
| `src/modules/payroll/engine.ts` | `scheduleFor`, `operationFrom`, `annualPaye`, `annualPayeWorking`, `consolidatedRelief`, `rentRelief`, `personalRelief`, `computePayslip`, `totalsFor`, `validateSettings`, `statutoryNotices` | 5 const · 17 types |
| `src/modules/payroll/payslip-email.ts` | `sendPayslips` | 1 type |
| `src/modules/payroll/payslip-pdf.ts` | `payslipPdf` | 1 type |
| `src/modules/payroll/reconcile.ts` | `checkPayslip`, `checkTotals`, `reconcile` | 1 type |
| `src/modules/payroll/relief.ts` | `reliefRegimeFor` | — |
| `src/modules/payroll/router.ts` | — | 1 const |
| `src/modules/payroll/schemas.ts` | — | 22 const · 14 types |
| `src/modules/payroll/service.ts` | `prepare`, `excludeFromRun`, `putBackOnRun`, `setTaxOverride`, `clearTaxOverride`, `setDeductionOverride`, `clearDeductionOverride`, `approve`, `detail`, `payslips`, `payslipsForEmployee`, `payslipById`, `list`, `cancel`, `preview`, `quote`, `settings`, `updateSettings`, `setOvertimeOverride`, `clearOvertimeOverride`, `setMonthlyPay`, `setBonus`, `linesFor`, `lineSummaryForRun`, `setLines`, `clearBonus` | 8 types |
| `src/modules/payroll/statutory.ts` | `dueDateFor`, `schedulesFor`, `writeSchedules`, `schedulesForRun`, `markFiled`, `scheduleFile` | 4 const · 4 types |
| `src/modules/payroll/switches.ts` | `bonusesOperated`, `assertBonusesOperated`, `assertOvertimeOperated` | — |
| `src/modules/payroll/working.ts` | `payeWorkingFor`, `pensionWorkingFor`, `nhfWorkingFor`, `rateSettingsFor` | 2 types |

**Endpoints — 32**

| Method | Path |
|---|---|
| `GET` | `/payroll/settings` |
| `PATCH` | `/payroll/settings` |
| `GET` | `/payroll/runs` |
| `GET` | `/payroll/runs/:id` |
| `GET` | `/payroll/runs/:id/payslips` |
| `GET` | `/payroll/employees/:id/payslips` |
| `GET` | `/payroll/payslips/:id` |
| `GET` | `/payroll/runs/:id/schedules` |
| `GET` | `/payroll/schedules/:id/file` |
| `POST` | `/payroll/schedules/:id/filed` |
| `GET` | `/payroll/payslips/:id/pdf` |
| `POST` | `/payroll/runs` |
| `POST` | `/payroll/runs/:id/approve` |
| `POST` | `/payroll/runs/:id/exclusions` |
| `DELETE` | `/payroll/runs/:id/exclusions/:employeeId` |
| `POST` | `/payroll/runs/:id/tax-overrides` |
| `POST` | `/payroll/runs/:id/overtime-overrides` |
| `POST` | `/payroll/runs/:id/bonuses` |
| `DELETE` | `/payroll/runs/:id/bonuses/:employeeId` |
| `PATCH` | `/payroll/runs/:id/monthly-pay` |
| `DELETE` | `/payroll/runs/:id/overtime-overrides/:employeeId` |
| `POST` | `/payroll/runs/:id/adjustments` |
| `DELETE` | `/payroll/runs/:id/tax-overrides/:employeeId` |
| `POST` | `/payroll/runs/:id/deduction-overrides` |
| `DELETE` | `/payroll/runs/:id/deduction-overrides/:employeeId/:kind` |
| `GET` | `/payroll/runs/:id/lines/:employeeId` |
| `GET` | `/payroll/runs/:id/lines-summary` |
| `PUT` | `/payroll/runs/:id/lines` |
| `POST` | `/payroll/runs/:id/payslips/send` |
| `POST` | `/payroll/runs/:id/cancel` |
| `GET` | `/payroll/preview` |
| `POST` | `/payroll/quote` |

---

## `src/modules/performance`

Appraisal periods, objectives, competencies, scoring, sign-off and the nine-box.

| File | Exported functions | Also |
|---|---|---|
| `src/modules/performance/framework.ts` | `seedAppraisalFramework` | 2 const · 1 type |
| `src/modules/performance/nine-box.ts` | `nineBox`, `setPotential`, `clearPotential` | 10 const · 6 types |
| `src/modules/performance/reminders.ts` | `sweepReminders`, `reminderSchedulerRunning`, `startReminderScheduler`, `stopReminderScheduler` | 1 type |
| `src/modules/performance/router.ts` | — | 1 const |
| `src/modules/performance/schemas.ts` | — | 42 const · 41 types |
| `src/modules/performance/scoring.ts` | `readRatingScale`, `saveRatingScale`, `ratingScale`, `formatBp`, `assertWeightsWhole`, `readWeights`, `saveWeights`, `captureScoringSnapshot`, `levelsFromSnapshot`, `weightsFromSnapshot`, `levelToBp`, `renormalise`, `bandFor`, `scoreRegister`, `distributionOf`, `scoreHistory` | 13 const · 14 types |
| `src/modules/performance/service.ts` | `assertSeesEmployee`, `keyResultPercent`, `keyResultMet`, `assertSeesGoal`, `listGoals`, `myGoals`, `teamGoals`, `getGoal`, `createGoal`, `assignObjective`, `updateGoal`, `removeGoal`, `publishGoal`, `completeGoal`, `cancelGoal`, `submitObjective`, `agreeObjective`, `sendBackObjective`, `rejectObjective`, `reviseObjective`, `objectiveApprovalQueue`, `addKeyResult`, `updateKeyResult`, `recordProgress`, `submitTask`, `listTasks`, `gradeTask`, `taskCompletionRate`, `listTasksForGrading`, `listMyTasks`, `listSections`, `createSection`, `updateSection`, `deleteSection`, `listCompetencies`, `getCompetency`, `createCompetency`, `updateCompetency`, `archiveCompetency`, `rateCompetency`, `employeeCompetencies`, `competencyGaps`, `competencyHeatmap`, `listCycles`, `getCycle`, `addStandardQuestions`, `createCycle`, `updateCycle`, `removeCycle`, `activateCycle`, `closeCycle`, `cycleParticipants`, `remindCycle`, `listQuestions`, `addQuestion`, `addManagerQuestion`, `calibrateScore`, `clearCalibration`, `requestRevision`, `listRevisionRequests`, `copyQuestionsFrom`, `updateQuestion`, `removeQuestion`, `reorderQuestions`, `listReviews`, `getReview`, `myReviews`, `respond`, `evidenceContent`, `hrSignOffReview`, `submitReview`, `finaliseReview`, `acknowledgeReview`, `disputeReview`, `requestPeerReviews`, `appraiserMap`, `setAppraisers`, `autoAssignFromReportingLine`, `appraisersOf`, `ratingScaleFor`, `setRatingScale`, `scoringWeights`, `setScoringWeights`, `cycleScores`, `employeeScore`, `cycleReport`, `employeeScoreHistory` | 5 const · 11 types |

**Endpoints — 85**

| Method | Path |
|---|---|
| `GET` | `/performance/goals` |
| `GET` | `/performance/goals/mine` |
| `GET` | `/performance/goals/team` |
| `GET` | `/performance/goals/approvals` |
| `POST` | `/performance/goals` |
| `POST` | `/performance/goals/:id/assign` |
| `GET` | `/performance/goals/:id` |
| `PATCH` | `/performance/goals/:id` |
| `DELETE` | `/performance/goals/:id` |
| `POST` | `/performance/goals/:id/publish` |
| `POST` | `/performance/goals/:id/complete` |
| `POST` | `/performance/goals/:id/cancel` |
| `POST` | `/performance/goals/:id/submit` |
| `POST` | `/performance/goals/:id/agree` |
| `POST` | `/performance/goals/:id/send-back` |
| `POST` | `/performance/goals/:id/reject` |
| `POST` | `/performance/goals/:id/revise` |
| `POST` | `/performance/goals/:id/key-results` |
| `PATCH` | `/performance/key-results/:id` |
| `POST` | `/performance/key-results/:id/progress` |
| `GET` | `/performance/goals/:id/tasks` |
| `GET` | `/performance/tasks/for-grading` |
| `GET` | `/performance/tasks/mine` |
| `POST` | `/performance/goals/:id/tasks` |
| `PATCH` | `/performance/tasks/:id/grade` |
| `GET` | `/performance/sections` |
| `POST` | `/performance/sections` |
| `PATCH` | `/performance/sections/:id` |
| `DELETE` | `/performance/sections/:id` |
| `GET` | `/performance/competencies` |
| `GET` | `/performance/competencies/gaps` |
| `GET` | `/performance/competencies/heatmap` |
| `POST` | `/performance/competencies` |
| `GET` | `/performance/competencies/:id` |
| `PATCH` | `/performance/competencies/:id` |
| `DELETE` | `/performance/competencies/:id` |
| `POST` | `/performance/competencies/:id/rate` |
| `GET` | `/performance/employees/:id/competencies` |
| `GET` | `/performance/employees/:id/score-history` |
| `GET` | `/performance/cycles` |
| `POST` | `/performance/cycles` |
| `GET` | `/performance/cycles/:id` |
| `PATCH` | `/performance/cycles/:id` |
| `DELETE` | `/performance/cycles/:id` |
| `POST` | `/performance/cycles/:id/activate` |
| `POST` | `/performance/cycles/:id/close` |
| `GET` | `/performance/cycles/:id/participants` |
| `POST` | `/performance/cycles/:id/remind` |
| `POST` | `/performance/cycles/:id/peer-reviews` |
| `GET` | `/performance/cycles/:id/appraisers` |
| `POST` | `/performance/cycles/:id/appraisers/auto` |
| `GET` | `/performance/cycles/:id/appraisers/:employeeId` |
| `PUT` | `/performance/cycles/:id/appraisers/:employeeId` |
| `GET` | `/performance/scoring-weights` |
| `PUT` | `/performance/scoring-weights` |
| `GET` | `/performance/cycles/:id/scores` |
| `GET` | `/performance/cycles/:id/report` |
| `GET` | `/performance/cycles/:id/nine-box` |
| `PUT` | `/performance/cycles/:id/potential/:employeeId` |
| `DELETE` | `/performance/cycles/:id/potential/:employeeId` |
| `GET` | `/performance/cycles/:id/scores/:employeeId` |
| `GET` | `/performance/cycles/:id/questions` |
| `POST` | `/performance/cycles/:id/questions` |
| `POST` | `/performance/cycles/:id/standard-questions` |
| `POST` | `/performance/cycles/:id/questions/mine` |
| `POST` | `/performance/cycles/:id/questions/copy` |
| `PUT` | `/performance/cycles/:id/calibrations/:employeeId` |
| `DELETE` | `/performance/cycles/:id/calibrations/:employeeId` |
| `GET` | `/performance/cycles/:id/revision-requests` |
| `POST` | `/performance/cycles/:id/revision-requests` |
| `POST` | `/performance/cycles/:id/questions/reorder` |
| `PATCH` | `/performance/questions/:id` |
| `DELETE` | `/performance/questions/:id` |
| `GET` | `/performance/reviews` |
| `GET` | `/performance/reviews/mine` |
| `GET` | `/performance/reviews/:id` |
| `POST` | `/performance/reviews/:id/respond` |
| `GET` | `/performance/reviews/:id/questions/:questionId/attachment` |
| `POST` | `/performance/reviews/:id/submit` |
| `POST` | `/performance/reviews/:id/hr-sign-off` |
| `GET` | `/performance/rating-scale` |
| `PUT` | `/performance/rating-scale` |
| `POST` | `/performance/reviews/:id/finalise` |
| `POST` | `/performance/reviews/:id/acknowledge` |
| `POST` | `/performance/reviews/:id/dispute` |

---

## `src/modules/permissions`

Roles, the permission catalogue and the grant guards.

| File | Exported functions | Also |
|---|---|---|
| `src/modules/permissions/router.ts` | — | 1 const |
| `src/modules/permissions/schemas.ts` | — | 5 const · 4 types |
| `src/modules/permissions/service.ts` | `resolveGrants`, `permissionLabel`, `catalogue`, `derivedGrants`, `headedDepartmentIds`, `headedBranchIds`, `seedSystemRoles`, `listRoles`, `getRole`, `members`, `effectivePermissions`, `requiresStrongPassword`, `assertCanGrant`, `transferOwnership`, `createRole`, `updateRole`, `deleteRole`, `addMembers`, `removeMember`, `userPermissions` | 1 const · 3 types |

**Endpoints — 11**

| Method | Path |
|---|---|
| `GET` | `/permissions/catalogue` |
| `GET` | `/permissions/roles` |
| `GET` | `/permissions/roles/:id` |
| `POST` | `/permissions/roles` |
| `PATCH` | `/permissions/roles/:id` |
| `DELETE` | `/permissions/roles/:id` |
| `POST` | `/permissions/roles/owner/transfer` |
| `GET` | `/permissions/roles/:id/members` |
| `POST` | `/permissions/roles/:id/members` |
| `DELETE` | `/permissions/roles/:id/members/:userId` |
| `GET` | `/permissions/users/:id/permissions` |

---

## `src/modules/push`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/push/router.ts` | — | 1 const |
| `src/modules/push/send.ts` | `pushConfigured`, `publicKey`, `pushToUser` | 1 type |

**Endpoints — 4**

| Method | Path |
|---|---|
| `GET` | `/push/key` |
| `GET` | `/push/subscriptions` |
| `POST` | `/push/subscriptions` |
| `POST` | `/push/unsubscribe` |

---

## `src/modules/recruitment`

Requisitions, pipelines, interviews, scorecards and offers.

| File | Exported functions | Also |
|---|---|---|
| `src/modules/recruitment/offer-pdf.ts` | `companyAddress`, `offerLetterPdf`, `noteLines` | 2 const · 1 type |
| `src/modules/recruitment/router.ts` | — | 1 const |
| `src/modules/recruitment/schemas.ts` | — | 23 const · 23 types |
| `src/modules/recruitment/service.ts` | `listRequisitions`, `getRequisition`, `createRequisition`, `updateRequisition`, `submitRequisitionForApproval`, `approveRequisition`, `holdRequisition`, `reopenRequisition`, `fillRequisitionManually`, `cancelRequisition`, `assertRequisitionUsable`, `listStages`, `createStage`, `updateStage`, `deleteStage`, `reorderStages`, `listApplicationsForRequisition`, `getApplication`, `moveApplication`, `rejectApplication`, `withdrawApplication`, `listCandidates`, `getCandidate`, `updateCandidate`, `listInterviews`, `scheduleInterview`, `getInterview`, `rescheduleInterview`, `cancelInterview`, `completeInterview`, `markInterviewNoShow`, `submitScorecard`, `createOffer`, `updateOffer`, `submitOffer`, `approveOffer`, `sendOffer`, `acceptOffer`, `declineOffer`, `withdrawOffer`, `redoOffer`, `getOffer`, `listOffers`, `analytics` | 7 types |

**Endpoints — 44**

| Method | Path |
|---|---|
| `GET` | `/recruitment/requisitions` |
| `POST` | `/recruitment/requisitions` |
| `GET` | `/recruitment/requisitions/:id` |
| `PATCH` | `/recruitment/requisitions/:id` |
| `POST` | `/recruitment/requisitions/:id/submit` |
| `POST` | `/recruitment/requisitions/:id/approve` |
| `POST` | `/recruitment/requisitions/:id/hold` |
| `POST` | `/recruitment/requisitions/:id/reopen` |
| `POST` | `/recruitment/requisitions/:id/fill` |
| `POST` | `/recruitment/requisitions/:id/cancel` |
| `GET` | `/recruitment/requisitions/:id/stages` |
| `POST` | `/recruitment/requisitions/:id/stages` |
| `PATCH` | `/recruitment/requisitions/:id/stages/:stageId` |
| `DELETE` | `/recruitment/requisitions/:id/stages/:stageId` |
| `POST` | `/recruitment/requisitions/:id/stages/reorder` |
| `GET` | `/recruitment/requisitions/:id/applications` |
| `GET` | `/recruitment/applications/:id` |
| `POST` | `/recruitment/applications/:id/move` |
| `POST` | `/recruitment/applications/:id/reject` |
| `POST` | `/recruitment/applications/:id/withdraw` |
| `GET` | `/recruitment/candidates` |
| `GET` | `/recruitment/candidates/:id` |
| `PATCH` | `/recruitment/candidates/:id` |
| `GET` | `/recruitment/interviews` |
| `GET` | `/recruitment/interviews/:id` |
| `POST` | `/recruitment/applications/:id/interviews` |
| `PATCH` | `/recruitment/interviews/:id` |
| `POST` | `/recruitment/interviews/:id/cancel` |
| `POST` | `/recruitment/interviews/:id/complete` |
| `POST` | `/recruitment/interviews/:id/no-show` |
| `POST` | `/recruitment/interviews/:id/scorecards` |
| `GET` | `/recruitment/offers` |
| `GET` | `/recruitment/offers/:id` |
| `GET` | `/recruitment/offers/:id/letter.pdf` |
| `POST` | `/recruitment/applications/:id/offers` |
| `PATCH` | `/recruitment/offers/:id` |
| `POST` | `/recruitment/offers/:id/submit` |
| `POST` | `/recruitment/offers/:id/approve` |
| `POST` | `/recruitment/offers/:id/send` |
| `POST` | `/recruitment/offers/:id/accept` |
| `POST` | `/recruitment/offers/:id/decline` |
| `POST` | `/recruitment/offers/:id/withdraw` |
| `POST` | `/recruitment/offers/:id/redo` |
| `GET` | `/recruitment/analytics` |

---

## `src/modules/reimbursements`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/reimbursements/router.ts` | — | 1 const |
| `src/modules/reimbursements/schemas.ts` | — | 10 const · 9 types |
| `src/modules/reimbursements/service.ts` | `serialize`, `listTypes`, `createType`, `getType`, `updateType`, `archiveType`, `list`, `get`, `mine`, `pending`, `summary`, `create`, `update`, `approve`, `decline`, `markPaid`, `decideForApproval`, `payableClaimsFor`, `markClaimsPaid`, `seedDefaultReimbursementTypes` | 3 types |

**Endpoints — 15**

| Method | Path |
|---|---|
| `POST` | `/reimbursements/receipt-upload-url` |
| `GET` | `/reimbursements/types` |
| `POST` | `/reimbursements/types` |
| `PATCH` | `/reimbursements/types/:id` |
| `DELETE` | `/reimbursements/types/:id` |
| `GET` | `/reimbursements/me` |
| `GET` | `/reimbursements/pending` |
| `GET` | `/reimbursements/summary` |
| `GET` | `/reimbursements/` |
| `POST` | `/reimbursements/` |
| `GET` | `/reimbursements/:id` |
| `PATCH` | `/reimbursements/:id` |
| `POST` | `/reimbursements/:id/approve` |
| `POST` | `/reimbursements/:id/decline` |
| `POST` | `/reimbursements/:id/mark-paid` |

---

## `src/modules/reports`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/reports/catalogue.ts` | `datasetById`, `columnByKey` | 1 const · 6 types |
| `src/modules/reports/router.ts` | — | 1 const |
| `src/modules/reports/run.ts` | `totalOf`, `groupLabel`, `run` | 1 const · 4 types |
| `src/modules/reports/schemas.ts` | — | 3 const · 3 types |
| `src/modules/reports/service.ts` | `catalogueFor`, `list`, `get`, `save`, `update`, `remove`, `runSaved`, `toCsv` | 1 type |

**Endpoints — 9**

| Method | Path |
|---|---|
| `GET` | `/reports/catalogue` |
| `POST` | `/reports/run` |
| `GET` | `/reports/` |
| `POST` | `/reports/` |
| `GET` | `/reports/:id` |
| `GET` | `/reports/:id/run` |
| `GET` | `/reports/:id/run.csv` |
| `PATCH` | `/reports/:id` |
| `DELETE` | `/reports/:id` |

---

## `src/modules/setup`

The first-run wizard, the feature switches and the readiness checklist.

| File | Exported functions | Also |
|---|---|---|
| `src/modules/setup/checklist.ts` | `checklist` | 1 type |
| `src/modules/setup/router.ts` | — | 1 const |
| `src/modules/setup/schemas.ts` | — | 5 const · 4 types |
| `src/modules/setup/service.ts` | `features`, `status`, `wizard`, `update`, `answer`, `complete`, `seedDefaults` | 1 const · 5 types |

**Endpoints — 7**

| Method | Path |
|---|---|
| `GET` | `/setup/status` |
| `GET` | `/setup/checklist` |
| `GET` | `/setup/features` |
| `PATCH` | `/setup/features` |
| `GET` | `/setup/wizard` |
| `POST` | `/setup/wizard/answer` |
| `POST` | `/setup/wizard/complete` |

---

## `src/modules/shifts`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/shifts/router.ts` | — | 1 const |
| `src/modules/shifts/schemas.ts` | — | 12 const · 12 types |
| `src/modules/shifts/service.ts` | `listShifts`, `createShift`, `updateShift`, `archiveShift`, `listPatterns`, `createPattern`, `updatePattern`, `rota`, `myRota`, `createAssignment`, `removeAssignment`, `bulkAssign`, `requestSwap`, `listSwaps`, `acceptSwap`, `approveSwap`, `declineSwap`, `cancelSwap`, `workingDaysFor`, `rosteredDatesFor`, `workingDaysForMany` | 1 const · 4 types |

**Endpoints — 18**

| Method | Path |
|---|---|
| `GET` | `/shifts/patterns` |
| `POST` | `/shifts/patterns` |
| `PATCH` | `/shifts/patterns/:id` |
| `GET` | `/shifts/rota` |
| `GET` | `/shifts/me/rota` |
| `POST` | `/shifts/assignments/bulk` |
| `POST` | `/shifts/assignments` |
| `DELETE` | `/shifts/assignments/:id` |
| `GET` | `/shifts/swaps` |
| `POST` | `/shifts/swaps` |
| `POST` | `/shifts/swaps/:id/accept` |
| `POST` | `/shifts/swaps/:id/approve` |
| `POST` | `/shifts/swaps/:id/decline` |
| `POST` | `/shifts/swaps/:id/cancel` |
| `GET` | `/shifts/` |
| `POST` | `/shifts/` |
| `PATCH` | `/shifts/:id` |
| `DELETE` | `/shifts/:id` |

---

## `src/modules/signatures`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/signatures/certificate.ts` | `certificatePdf` | 1 type |
| `src/modules/signatures/router.ts` | — | 1 const |
| `src/modules/signatures/schemas.ts` | — | 4 const · 3 types |
| `src/modules/signatures/service.ts` | `sha256Of`, `nameMatches`, `get`, `list`, `mine`, `send`, `document`, `sign`, `decline`, `cancel`, `certificateData` | 4 const · 2 types |

**Endpoints — 9**

| Method | Path |
|---|---|
| `GET` | `/signatures/mine` |
| `GET` | `/signatures/` |
| `POST` | `/signatures/` |
| `GET` | `/signatures/:id` |
| `GET` | `/signatures/:id/document` |
| `POST` | `/signatures/:id/sign` |
| `POST` | `/signatures/:id/decline` |
| `POST` | `/signatures/:id/cancel` |
| `GET` | `/signatures/:id/certificate.pdf` |

---

## `src/modules/teams`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/teams/router.ts` | — | 1 const |
| `src/modules/teams/schemas.ts` | — | 5 const · 5 types |
| `src/modules/teams/service.ts` | `list`, `get`, `teamsOfEmployee`, `create`, `update`, `addMembers`, `removeMembers`, `archive`, `restore` | 1 type |

**Endpoints — 8**

| Method | Path |
|---|---|
| `GET` | `/teams/` |
| `GET` | `/teams/:id` |
| `POST` | `/teams/` |
| `PATCH` | `/teams/:id` |
| `DELETE` | `/teams/:id` |
| `POST` | `/teams/:id/restore` |
| `POST` | `/teams/:id/members` |
| `POST` | `/teams/:id/members/remove` |

---

## `src/modules/webhooks`

| File | Exported functions | Also |
|---|---|---|
| `src/modules/webhooks/events.ts` | `isWebhookEvent`, `definitionOf`, `unwiredAmong` | 4 const · 3 types |
| `src/modules/webhooks/queue.ts` | `queueMode`, `drain`, `enqueue`, `startWebhookWorker`, `deliveryStatus` | 1 type |
| `src/modules/webhooks/router.ts` | — | 1 const |
| `src/modules/webhooks/runner.ts` | `runDelivery`, `nextRetryAt`, `sweep`, `schedulerRunning`, `startWebhookScheduler`, `stopWebhookScheduler` | 3 const · 2 types |
| `src/modules/webhooks/schemas.ts` | — | 5 const · 5 types |
| `src/modules/webhooks/service.ts` | `list`, `get`, `deliveries`, `create`, `update`, `rotateSecret`, `remove`, `sendTest`, `retry`, `catalogue`, `dispatch` | 5 types |
| `src/modules/webhooks/signature.ts` | `generateSecret`, `timestampNow`, `signedStringFor`, `digestFor`, `sign`, `verify`, `maskSecret` | 7 const · 1 type |
| `src/modules/webhooks/transport.ts` | `post`, `assertPostable`, `redact` | 1 const · 2 types |

**Endpoints — 10**

| Method | Path |
|---|---|
| `GET` | `/webhooks/events` |
| `POST` | `/webhooks/deliveries/:id/retry` |
| `GET` | `/webhooks/` |
| `POST` | `/webhooks/` |
| `GET` | `/webhooks/:id` |
| `PATCH` | `/webhooks/:id` |
| `DELETE` | `/webhooks/:id` |
| `POST` | `/webhooks/:id/test` |
| `GET` | `/webhooks/:id/deliveries` |
| `POST` | `/webhooks/:id/rotate-secret` |

---

## Shared — everything outside `src/modules`

Database and tenancy, middleware, config, helpers, scripts and the server entry point.

| File | Exported functions | Also |
|---|---|---|
| `src/app.ts` | `createApp` | — |
| `src/config/env.ts` | — | 1 const · 1 type |
| `src/db/client.ts` | `disconnect`, `ping` | 1 const · 1 type |
| `src/db/tenant.ts` | `forOrganization` | 2 const · 1 type |
| `src/lib/async.ts` | `handler` | — |
| `src/lib/audit.ts` | `record`, `auditor`, `diffOf` | 1 const · 1 type |
| `src/lib/csv.ts` | `csvCell`, `csvNaira`, `csvSheet`, `safeExportFilename` | — |
| `src/lib/errors.ts` | `isAppError` | `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `UnprocessableError`, `RateLimitedError`, `InternalError` (class) |
| `src/lib/http.ts` | `ok`, `created`, `noContent`, `page`, `paging`, `orderBy`, `toIsoDate`, `withinRange`, `pathParam`, `compact` | 4 const · 3 types |
| `src/lib/logger.ts` | — | 1 const |
| `src/lib/mail-template.ts` | `reachableFromAnInbox`, `renderEmail` | 3 types |
| `src/lib/mail.ts` | `mailIsConfigured`, `sendEmail` | 2 types |
| `src/lib/money.ts` | `toKobo`, `grossKoboOrNull`, `toNaira`, `rateOf`, `formatNaira`, `allocate` | — |
| `src/lib/pdf.ts` | `money`, `widthOf`, `wrap`, `renderPdf` | `Page` (class) · 2 const · 2 types |
| `src/lib/storage.ts` | `decodeInlineFile`, `storageConfigured`, `keyFor`, `presignWrite`, `presignRead`, `objectExists`, `removeObject`, `uploadRefusal` | 4 const · 2 types |
| `src/lib/web-push.ts` | `encryptPayload`, `vapidHeader`, `generateVapidKeys`, `postPush`, `audienceOf` | 1 const · 3 types |
| `src/middleware/auth.ts` | `authenticate`, `requireAuth`, `requireDb`, `requirePermissions`, `requireAnyPermission`, `holds`, `requirePermissionOrSelf` | 1 type |
| `src/middleware/error.ts` | `notFoundHandler`, `errorHandler` | — |
| `src/middleware/request-context.ts` | `requestId` | 1 const |
| `src/middleware/step-up.ts` | `requireStepUp` | — |
| `src/middleware/validate.ts` | `validate` | — |
