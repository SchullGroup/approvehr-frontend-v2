# Functions and modules — ApproveHR API

_Repo:_ `approvehr-backend` · _Generated from_ `src/**/*.ts` (tests excluded)

_Snapshot:_ `origin/staging` at `af7d59a` (2026-10-27) · regenerate with `npm run docs`, never by hand

This platform has no pages. It is Express 5 + Prisma, arranged as one folder per module, each with the
same three files: `router.ts` (the HTTP surface), `schemas.ts` (what a request may contain) and
`service.ts` (what actually happens). Read `src/modules/departments/` first — it is the reference shape.

Constants and types are counted rather than listed. Endpoint paths below are the full mounted path, without the
`/api/v1` that the API puts in front of all of them except the `/admin` routes.

| Module                                                                              |   Files | Exported functions | Endpoints |
| ----------------------------------------------------------------------------------- | ------: | -----------------: | --------: |
| [`src/modules/admin`](#srcmodulesadmin)                                             |       6 |                 22 |        36 |
| [`src/modules/advances`](#srcmodulesadvances)                                       |       3 |                 15 |         9 |
| [`src/modules/ai`](#srcmodulesai)                                                   |      10 |                 20 |         9 |
| [`src/modules/ai2`](#srcmodulesai2)                                                 |       7 |                 21 |         4 |
| [`src/modules/announcements`](#srcmodulesannouncements)                             |       4 |                 17 |        10 |
| [`src/modules/approvals`](#srcmodulesapprovals)                                     |       5 |                 13 |        10 |
| [`src/modules/assets`](#srcmodulesassets)                                           |       3 |                 24 |        22 |
| [`src/modules/attendance`](#srcmodulesattendance)                                   |      22 |                 81 |        31 |
| [`src/modules/audit`](#srcmodulesaudit)                                             |       6 |                 14 |         5 |
| [`src/modules/auth`](#srcmodulesauth)                                               |       7 |                 44 |        21 |
| [`src/modules/benefits`](#srcmodulesbenefits)                                       |       3 |                  9 |         8 |
| [`src/modules/billing`](#srcmodulesbilling)                                         |       7 |                 29 |         4 |
| [`src/modules/careers`](#srcmodulescareers)                                         |      18 |                 99 |        43 |
| [`src/modules/company`](#srcmodulescompany)                                         |       3 |                  8 |         9 |
| [`src/modules/conduct`](#srcmodulesconduct)                                         |       3 |                 14 |        14 |
| [`src/modules/delivery-report`](#srcmodulesdelivery-report)                         |       3 |                  1 |         1 |
| [`src/modules/demo-requests`](#srcmodulesdemo-requests)                             |       3 |                  1 |         1 |
| [`src/modules/departments`](#srcmodulesdepartments)                                 |       3 |                  8 |         9 |
| [`src/modules/documents`](#srcmodulesdocuments)                                     |       3 |                 14 |        15 |
| [`src/modules/employees`](#srcmodulesemployees)                                     |       8 |                 46 |        21 |
| [`src/modules/engagement`](#srcmodulesengagement)                                   |       5 |                  4 |         1 |
| [`src/modules/exports`](#srcmodulesexports)                                         |       2 |                  4 |         4 |
| [`src/modules/grades`](#srcmodulesgrades)                                           |       3 |                 10 |         9 |
| [`src/modules/helpdesk`](#srcmoduleshelpdesk)                                       |       5 |                 33 |        18 |
| [`src/modules/imports`](#srcmodulesimports)                                         |      11 |                 34 |        21 |
| [`src/modules/insights`](#srcmodulesinsights)                                       |       6 |                  9 |         8 |
| [`src/modules/invites`](#srcmodulesinvites)                                         |       4 |                 12 |        11 |
| [`src/modules/job-roles`](#srcmodulesjob-roles)                                     |       3 |                  9 |         8 |
| [`src/modules/knowledge`](#srcmodulesknowledge)                                     |       5 |                 26 |        16 |
| [`src/modules/leave`](#srcmodulesleave)                                             |      12 |                 54 |        17 |
| [`src/modules/loans`](#srcmodulesloans)                                             |       3 |                 23 |        11 |
| [`src/modules/me`](#srcmodulesme)                                                   |      14 |                  3 |         4 |
| [`src/modules/notifications`](#srcmodulesnotifications)                             |       3 |                  7 |         5 |
| [`src/modules/offboarding`](#srcmodulesoffboarding)                                 |       4 |                 22 |        19 |
| [`src/modules/onboarding`](#srcmodulesonboarding)                                   |       4 |                 17 |        13 |
| [`src/modules/one-on-ones`](#srcmodulesone-on-ones)                                 |       3 |                 13 |        11 |
| [`src/modules/overtime`](#srcmodulesovertime)                                       |       3 |                 11 |         6 |
| [`src/modules/pay-components`](#srcmodulespay-components)                           |       3 |                 29 |        15 |
| [`src/modules/payments`](#srcmodulespayments)                                       |      22 |                 70 |        24 |
| [`src/modules/payroll`](#srcmodulespayroll)                                         |      19 |                 95 |        41 |
| [`src/modules/pension-top-up`](#srcmodulespension-top-up)                           |       4 |                  8 |         7 |
| [`src/modules/performance`](#srcmodulesperformance)                                 |      11 |                151 |        97 |
| [`src/modules/permissions`](#srcmodulespermissions)                                 |       3 |                 23 |        11 |
| [`src/modules/projects`](#srcmodulesprojects)                                       |      16 |                103 |        42 |
| [`src/modules/push`](#srcmodulespush)                                               |       3 |                  7 |         4 |
| [`src/modules/recruitment`](#srcmodulesrecruitment)                                 |      35 |                273 |       108 |
| [`src/modules/reimbursements`](#srcmodulesreimbursements)                           |       3 |                 21 |        15 |
| [`src/modules/reports`](#srcmodulesreports)                                         |       5 |                 13 |         9 |
| [`src/modules/screening`](#srcmodulesscreening)                                     |      28 |                109 |         — |
| [`src/modules/setup`](#srcmodulessetup)                                             |       4 |                  8 |         7 |
| [`src/modules/shifts`](#srcmodulesshifts)                                           |       3 |                 21 |        18 |
| [`src/modules/signatures`](#srcmodulessignatures)                                   |       4 |                 12 |         9 |
| [`src/modules/sms`](#srcmodulessms)                                                 |      20 |                 60 |        10 |
| [`src/modules/surveys`](#srcmodulessurveys)                                         |       3 |                 12 |        11 |
| [`src/modules/teams`](#srcmodulesteams)                                             |       3 |                  9 |         8 |
| [`src/modules/webhooks`](#srcmoduleswebhooks)                                       |       8 |                 35 |        10 |
| [`src/modules/wellness`](#srcmoduleswellness)                                       |      14 |                 63 |        30 |
| [`src/modules/work-trackers`](#srcmoduleswork-trackers)                             |      13 |                 46 |        19 |
| [Shared — everything outside `src/modules`](#shared--everything-outside-srcmodules) |      34 |                106 |         — |
| **Total**                                                                           | **475** |           **2065** |   **959** |

---

## `src/modules/admin`

| File                                | Exported functions                                                                                                                                                                       | Also              |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `src/modules/admin/auth-service.ts` | `login`, `validateSession`, `logout`, `bootstrapFirstAdmin`                                                                                                                              | 1 type            |
| `src/modules/admin/errors.ts`       | `escapeHtml`, `adminErrorHandler`                                                                                                                                                        | —                 |
| `src/modules/admin/middleware.ts`   | `requirePlatformAdmin`, `requireCsrf`                                                                                                                                                    | 1 const           |
| `src/modules/admin/registry.ts`     | `buildRegistry`                                                                                                                                                                          | 1 const · 4 types |
| `src/modules/admin/router.ts`       | —                                                                                                                                                                                        | 1 const           |
| `src/modules/admin/service.ts`      | `encodeKey`, `decodeKey`, `coerceValue`, `displayValue`, `buildWriteData`, `toUniqueWhere`, `searchableFields`, `list`, `get`, `create`, `update`, `archiveOrDelete`, `recordAdminAudit` | —                 |

**Endpoints — 36**

| Method | Path                                               |
| ------ | -------------------------------------------------- |
| `GET`  | `/admin/login`                                     |
| `POST` | `/admin/login`                                     |
| `POST` | `/admin/bootstrap`                                 |
| `POST` | `/admin/logout`                                    |
| `GET`  | `/admin/logout-form`                               |
| `GET`  | `/admin/`                                          |
| `GET`  | `/admin/tuya-devices`                              |
| `POST` | `/admin/tuya-devices/:tuyaId/assign`               |
| `POST` | `/admin/tuya-devices/:tuyaId/unassign`             |
| `GET`  | `/admin/payments`                                  |
| `GET`  | `/admin/payments/:id/wallet`                       |
| `POST` | `/admin/payments/:id/provider`                     |
| `POST` | `/admin/payments/:id/reserved-account`             |
| `POST` | `/admin/payments/:id/reserved-account/9japay`      |
| `GET`  | `/admin/early-pay`                                 |
| `POST` | `/admin/early-pay/:id`                             |
| `GET`  | `/admin/billing`                                   |
| `POST` | `/admin/billing/enforcement`                       |
| `POST` | `/admin/billing/start-trials`                      |
| `GET`  | `/admin/billing/:id`                               |
| `POST` | `/admin/billing/:id/extend-trial`                  |
| `POST` | `/admin/billing/:id/record-payment`                |
| `POST` | `/admin/billing/:id/grace`                         |
| `POST` | `/admin/billing/:id/cancel`                        |
| `POST` | `/admin/billing/:id/payments/:paymentId/apply`     |
| `POST` | `/admin/billing/:id/payments/:paymentId/reconcile` |
| `GET`  | `/admin/_lookup/:model`                            |
| `POST` | `/admin/User/:id/create-employee`                  |
| `POST` | `/admin/User/:id/resend-invite`                    |
| `POST` | `/admin/User/:id/invite-link`                      |
| `GET`  | `/admin/:model`                                    |
| `GET`  | `/admin/:model/new`                                |
| `POST` | `/admin/:model`                                    |
| `GET`  | `/admin/:model/:id`                                |
| `POST` | `/admin/:model/:id`                                |
| `POST` | `/admin/:model/:id/delete`                         |

---

## `src/modules/advances`

| File                              | Exported functions                                                                                                                                                                                                    | Also              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `src/modules/advances/router.ts`  | —                                                                                                                                                                                                                     | 1 const           |
| `src/modules/advances/schemas.ts` | —                                                                                                                                                                                                                     | 5 const · 2 types |
| `src/modules/advances/service.ts` | `platformAllows`, `policy`, `setPolicy`, `eligibility`, `list`, `get`, `request`, `approve`, `decline`, `cancel`, `markPaid`, `dueAdvancesFor`, `dueAdvancesForMany`, `assertPayslipsMatchAdvances`, `recordRecovery` | 4 const · 5 types |

**Endpoints — 9**

| Method  | Path                      |
| ------- | ------------------------- |
| `GET`   | `/advances/policy`        |
| `PATCH` | `/advances/policy`        |
| `GET`   | `/advances/me`            |
| `GET`   | `/advances/`              |
| `POST`  | `/advances/`              |
| `POST`  | `/advances/:id/approve`   |
| `POST`  | `/advances/:id/decline`   |
| `POST`  | `/advances/:id/cancel`    |
| `POST`  | `/advances/:id/mark-paid` |

---

## `src/modules/ai`

The assistant: ask, suggest, draft, and the confirm-before-write actions.

| File                          | Exported functions                                                                                          | Also              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------- |
| `src/modules/ai/actions.ts`   | `actionsFor`, `actionByName`, `assertMayAct`                                                                | 1 const · 4 types |
| `src/modules/ai/anthropic.ts` | `anthropic`                                                                                                 | 1 type            |
| `src/modules/ai/ask.ts`       | `ask`                                                                                                       | 1 type            |
| `src/modules/ai/gemini.ts`    | `gemini`                                                                                                    | 1 type            |
| `src/modules/ai/prompt.ts`    | `buildMessage`, `parseSuggestions`                                                                          | 1 const           |
| `src/modules/ai/provider.ts`  | `useAssistant`, `clearAssistant`, `assistant`, `assistantAvailable`, `suggest`                              | 1 const · 6 types |
| `src/modules/ai/reads.ts`     | `readsFor`, `runRead`                                                                                       | 1 const · 2 types |
| `src/modules/ai/router.ts`    | —                                                                                                           | 1 const           |
| `src/modules/ai/schemas.ts`   | —                                                                                                           | 6 const · 4 types |
| `src/modules/ai/service.ts`   | `suggestObjectives`, `suggestTaskSummary`, `suggestDevelopment`, `draftPeriodGoals`, `draftPeriodQuestions` | —                 |

**Endpoints — 9**

| Method | Path                         |
| ------ | ---------------------------- |
| `GET`  | `/ai/status`                 |
| `POST` | `/ai/ask`                    |
| `GET`  | `/ai/actions`                |
| `POST` | `/ai/actions/:name`          |
| `POST` | `/ai/suggest/objectives`     |
| `POST` | `/ai/suggest/task-summary`   |
| `POST` | `/ai/suggest/development`    |
| `POST` | `/ai/draft/period-goals`     |
| `POST` | `/ai/draft/period-questions` |

---

## `src/modules/ai2`

Read-only questions about the company's own records, answered by Gemini with every entity and field gated against the caller, and token use counted per organisation; mounted alongside `ai`.

| File                           | Exported functions                                                                                                      | Also              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `src/modules/ai2/answer.ts`    | `answer`, `answerStream`                                                                                                | 1 const · 4 types |
| `src/modules/ai2/catalogue.ts` | `opsFor`, `filterOps`, `aggregatable`, `sortable`, `groupable`, `entityByName`, `entitiesFor`, `fieldsFor`, `schemaFor` | 2 const · 5 types |
| `src/modules/ai2/gemini.ts`    | `geminiConfigured`, `converse`                                                                                          | 1 const · 7 types |
| `src/modules/ai2/query.ts`     | `runQuery`                                                                                                              | 1 const           |
| `src/modules/ai2/router.ts`    | —                                                                                                                       | 1 const           |
| `src/modules/ai2/trace.ts`     | `startTrace`                                                                                                            | 3 types           |
| `src/modules/ai2/usage.ts`     | `currentPeriod`, `currentDay`, `recordUsage`, `withUsageScope`, `reportUsage`, `usageSummary`                           | 2 types           |

**Endpoints — 4**

| Method | Path              |
| ------ | ----------------- |
| `GET`  | `/ai2/status`     |
| `GET`  | `/ai2/usage`      |
| `POST` | `/ai2/ask`        |
| `POST` | `/ai2/ask/stream` |

---

## `src/modules/announcements`

| File                                   | Exported functions                                                                                                                                                             | Also              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| `src/modules/announcements/reads.ts`   | `markRead`, `readersOf`, `todayNotices`                                                                                                                                        | 1 const · 3 types |
| `src/modules/announcements/router.ts`  | —                                                                                                                                                                              | 1 const           |
| `src/modules/announcements/schemas.ts` | —                                                                                                                                                                              | 4 const · 4 types |
| `src/modules/announcements/service.ts` | `startOfDay`, `namesFor`, `list`, `get`, `boardFor`, `visibleWhere`, `toBoardNotice`, `create`, `update`, `updateWithPrevious`, `publish`, `unpublish`, `remove`, `reachWhere` | 2 const · 8 types |

**Endpoints — 10**

| Method   | Path                           |
| -------- | ------------------------------ |
| `GET`    | `/announcements/board`         |
| `POST`   | `/announcements/:id/read`      |
| `GET`    | `/announcements/:id/readers`   |
| `GET`    | `/announcements/`              |
| `GET`    | `/announcements/:id`           |
| `POST`   | `/announcements/`              |
| `PATCH`  | `/announcements/:id`           |
| `POST`   | `/announcements/:id/publish`   |
| `POST`   | `/announcements/:id/unpublish` |
| `DELETE` | `/announcements/:id`           |

---

## `src/modules/approvals`

| File                                      | Exported functions                                                                                                                     | Also              |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `src/modules/approvals/holiday-access.ts` | `canDecideHoliday`, `holidayCardsVisibleTo`                                                                                            | 1 const           |
| `src/modules/approvals/mirror.ts`         | `mirrorApprovalDecision`                                                                                                               | —                 |
| `src/modules/approvals/router.ts`         | —                                                                                                                                      | 1 const           |
| `src/modules/approvals/schemas.ts`        | —                                                                                                                                      | 5 const · 4 types |
| `src/modules/approvals/service.ts`        | `serialize`, `list`, `sentByMe`, `summary`, `decide`, `reopen`, `setArchived`, `approveRoutine`, `approveRoutineSelected`, `reconcile` | 1 type            |

**Endpoints — 10**

| Method | Path                                  |
| ------ | ------------------------------------- |
| `GET`  | `/approvals/`                         |
| `GET`  | `/approvals/summary`                  |
| `GET`  | `/approvals/sent`                     |
| `POST` | `/approvals/:id/decide`               |
| `POST` | `/approvals/:id/archive`              |
| `POST` | `/approvals/:id/unarchive`            |
| `POST` | `/approvals/:id/reopen`               |
| `POST` | `/approvals/approve-routine`          |
| `POST` | `/approvals/approve-routine/selected` |
| `POST` | `/approvals/reconcile`                |

---

## `src/modules/assets`

| File                            | Exported functions                                                                                                                                                                                                                                                                                                                                       | Also                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `src/modules/assets/router.ts`  | —                                                                                                                                                                                                                                                                                                                                                        | 1 const             |
| `src/modules/assets/schemas.ts` | —                                                                                                                                                                                                                                                                                                                                                        | 14 const · 14 types |
| `src/modules/assets/service.ts` | `listCategories`, `getCategory`, `createCategory`, `updateCategory`, `list`, `get`, `create`, `update`, `archive`, `restore`, `assign`, `returnAsset`, `assetsHeldBy`, `acknowledge`, `holdings`, `listMaintenance`, `addMaintenance`, `updateMaintenance`, `summary`, `reportFault`, `listRepairs`, `getRepair`, `confirmRepairReturn`, `advanceRepair` | 8 types             |

**Endpoints — 22**

| Method   | Path                                  |
| -------- | ------------------------------------- |
| `GET`    | `/assets/categories`                  |
| `POST`   | `/assets/categories`                  |
| `PATCH`  | `/assets/categories/:id`              |
| `GET`    | `/assets/maintenance`                 |
| `PATCH`  | `/assets/maintenance/:id`             |
| `GET`    | `/assets/summary`                     |
| `GET`    | `/assets/employees/:id`               |
| `POST`   | `/assets/assignments/:id/acknowledge` |
| `GET`    | `/assets/`                            |
| `POST`   | `/assets/`                            |
| `GET`    | `/assets/repairs`                     |
| `GET`    | `/assets/repairs/:id`                 |
| `POST`   | `/assets/:id/repairs`                 |
| `POST`   | `/assets/repairs/:id/confirm-return`  |
| `PATCH`  | `/assets/repairs/:id`                 |
| `GET`    | `/assets/:id`                         |
| `PATCH`  | `/assets/:id`                         |
| `DELETE` | `/assets/:id`                         |
| `POST`   | `/assets/:id/restore`                 |
| `POST`   | `/assets/:id/assign`                  |
| `POST`   | `/assets/:id/return`                  |
| `POST`   | `/assets/:id/maintenance`             |

---

## `src/modules/attendance`

| File                                                | Exported functions                                                                                                                                                                                                                                         | Also                                                     |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `src/modules/attendance/after-hours.ts`             | `listAfterHours`, `dismissAfterHours`, `countAfterHours`                                                                                                                                                                                                   | 1 type                                                   |
| `src/modules/attendance/auto-checkout-scheduler.ts` | `sweepAutoCheckouts`, `startAutoCheckoutScheduler`, `stopAutoCheckoutScheduler`                                                                                                                                                                            | 1 type                                                   |
| `src/modules/attendance/closing-scheduler.ts`       | `sweepClosing`, `startClosingScheduler`, `stopClosingScheduler`                                                                                                                                                                                            | 1 type                                                   |
| `src/modules/attendance/closing.ts`                 | `closeEntryOnlyDays`                                                                                                                                                                                                                                       | —                                                        |
| `src/modules/attendance/corrections.ts`             | `requestCorrection`, `decideCorrection`, `myCorrections`                                                                                                                                                                                                   | —                                                        |
| `src/modules/attendance/day-status.ts`              | `minutesOf`, `isoWeekday`, `lateAfterMinutes`, `earlyBeforeMinutes`, `dayKind`, `resolveDayStatus`, `employedOn`, `employedWithin`, `wasEmployedOn`                                                                                                        | 1 const · 3 types                                        |
| `src/modules/attendance/devices.ts`                 | `requireDevice`, `listDevices`, `getDevice`, `createDevice`, `updateDevice`, `archiveDevice`, `restoreDevice`, `rotateSecret`, `listEnrolments`, `listUnmapped`, `mapEnrolment`, `unmapEnrolment`, `deviceBySerialForIngestion`, `dbForDevice`, `markSeen` | 5 types                                                  |
| `src/modules/attendance/geofence.ts`                | `distanceMetres`, `describeDistance`, `judgeFence`                                                                                                                                                                                                         | 1 const · 4 types                                        |
| `src/modules/attendance/ingest.ts`                  | —                                                                                                                                                                                                                                                          | 3 const                                                  |
| `src/modules/attendance/locations.ts`               | `list`, `update`, `restore`                                                                                                                                                                                                                                | 1 type                                                   |
| `src/modules/attendance/punches.ts`                 | `recordPunches`, `interpretDay`, `attributeBacklog`                                                                                                                                                                                                        | 2 const · 2 types                                        |
| `src/modules/attendance/router.ts`                  | —                                                                                                                                                                                                                                                          | 1 const                                                  |
| `src/modules/attendance/schemas.ts`                 | —                                                                                                                                                                                                                                                          | 20 const · 15 types                                      |
| `src/modules/attendance/service.ts`                 | `timeOf`, `timezoneOf`, `hasDirectReports`, `getPolicy`, `updatePolicy`, `roster`, `timesheet`, `history`, `clockIn`, `reopenClockOut`, `clockOut`, `autoCloseAbandoned`, `correct`, `createLocation`, `archiveLocation`, `listLocations`                  | `SelfServiceClockInOffError` (class) · 1 const · 3 types |
| `src/modules/attendance/summary.ts`                 | `monthSummary`                                                                                                                                                                                                                                             | 2 types                                                  |
| `src/modules/attendance/tuya/client.ts`             | `resetTuyaTokenCache`, `createTuyaClient`, `tuyaIsConfigured`, `tuyaClient`                                                                                                                                                                                | 1 const · 5 types                                        |
| `src/modules/attendance/tuya/constants.ts`          | —                                                                                                                                                                                                                                                          | 2 const                                                  |
| `src/modules/attendance/tuya/fake.ts`               | `setFakeTuyaDevices`, `setFakeTuyaRecords`, `resetFakeTuya`, `setTuyaClientForTests`, `setTuyaUnconfiguredForTests`, `tuyaForcedUnconfigured`, `tuyaOverride`                                                                                              | 1 const                                                  |
| `src/modules/attendance/tuya/records.ts`            | `toPunches`                                                                                                                                                                                                                                                | —                                                        |
| `src/modules/attendance/tuya/sync-scheduler.ts`     | `startTuyaSyncScheduler`, `stopTuyaSyncScheduler`                                                                                                                                                                                                          | —                                                        |
| `src/modules/attendance/tuya/sync.ts`               | `syncTuyaDevice`, `sweepTuya`                                                                                                                                                                                                                              | 1 type                                                   |
| `src/modules/attendance/working-day.ts`             | `closingInstant`, `isNonWorkingDay`                                                                                                                                                                                                                        | —                                                        |

**Endpoints — 31**

| Method   | Path                                           |
| -------- | ---------------------------------------------- |
| `POST`   | `/attendance/devices/punches`                  |
| `GET`    | `/attendance/locations`                        |
| `POST`   | `/attendance/locations`                        |
| `DELETE` | `/attendance/locations/:id`                    |
| `PATCH`  | `/attendance/locations/:id`                    |
| `POST`   | `/attendance/locations/:id/restore`            |
| `GET`    | `/attendance/policy`                           |
| `PATCH`  | `/attendance/policy`                           |
| `GET`    | `/attendance/roster`                           |
| `GET`    | `/attendance/summary`                          |
| `GET`    | `/attendance/timesheet`                        |
| `GET`    | `/attendance/history`                          |
| `GET`    | `/attendance/corrections/mine`                 |
| `POST`   | `/attendance/corrections`                      |
| `POST`   | `/attendance/clock-in`                         |
| `POST`   | `/attendance/clock-out`                        |
| `POST`   | `/attendance/clock-out/undo`                   |
| `PATCH`  | `/attendance/entries/:employeeId/:date`        |
| `GET`    | `/attendance/after-hours`                      |
| `POST`   | `/attendance/after-hours/:id/dismiss`          |
| `POST`   | `/attendance/after-hours/:id/count`            |
| `GET`    | `/attendance/devices`                          |
| `GET`    | `/attendance/devices/:id`                      |
| `POST`   | `/attendance/devices`                          |
| `PATCH`  | `/attendance/devices/:id`                      |
| `DELETE` | `/attendance/devices/:id`                      |
| `POST`   | `/attendance/devices/:id/restore`              |
| `POST`   | `/attendance/devices/:id/rotate-secret`        |
| `GET`    | `/attendance/devices/:id/enrolments`           |
| `POST`   | `/attendance/devices/:id/enrolments`           |
| `DELETE` | `/attendance/devices/:deviceId/enrolments/:id` |

---

## `src/modules/audit`

| File                            | Exported functions                                     | Also              |
| ------------------------------- | ------------------------------------------------------ | ----------------- |
| `src/modules/audit/diff.ts`     | `isSensitiveField`, `humanise`, `renderDiff`           | 3 types           |
| `src/modules/audit/labels.ts`   | `nounFor`, `labelsFor`, `labelKey`, `idsMatchingLabel` | 1 const · 1 type  |
| `src/modules/audit/read-log.ts` | `isReadAction`, `noteRead`                             | 2 const · 2 types |
| `src/modules/audit/router.ts`   | —                                                      | 1 const           |
| `src/modules/audit/schemas.ts`  | —                                                      | 5 const · 4 types |
| `src/modules/audit/service.ts`  | `list`, `get`, `timeline`, `actors`, `summary`         | 5 types           |

**Endpoints — 5**

| Method | Path                      |
| ------ | ------------------------- |
| `GET`  | `/audit/`                 |
| `GET`  | `/audit/actors`           |
| `GET`  | `/audit/summary`          |
| `GET`  | `/audit/entity/:type/:id` |
| `GET`  | `/audit/:id`              |

---

## `src/modules/auth`

| File                                 | Exported functions                                                                                                                                                                                                                                                                                                                                                           | Also                |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `src/modules/auth/delivery.ts`       | `useTransport`, `warnIfNoTransport`, `deliver`                                                                                                                                                                                                                                                                                                                               | 3 types             |
| `src/modules/auth/mail-transport.ts` | `compose`, `linkFor`                                                                                                                                                                                                                                                                                                                                                         | 1 const             |
| `src/modules/auth/router.ts`         | —                                                                                                                                                                                                                                                                                                                                                                            | 1 const             |
| `src/modules/auth/schemas.ts`        | —                                                                                                                                                                                                                                                                                                                                                                            | 11 const · 11 types |
| `src/modules/auth/service.ts`        | `hashPassword`, `signIn`, `completeTwoFactor`, `refresh`, `signOut`, `signOutEverywhere`, `changePassword`, `register`, `issueInvite`, `mintInviteLink`, `resetPasswordRequirements`, `inviteRequirements`, `requestEmailVerification`, `confirmEmail`, `forgotPassword`, `resetPassword`, `acceptInvite`, `dismissTour`, `twoFactorStatus`, `requestStepUp`, `verifyStepUp` | 8 types             |
| `src/modules/auth/tokens.ts`         | `signAccessToken`, `verifyAccessToken`, `createRefreshToken`, `hashRefreshToken`, `durationToMs`, `refreshTokenExpiry`, `createEmailToken`, `hashEmailToken`, `emailTokenExpiry`                                                                                                                                                                                             | 1 type              |
| `src/modules/auth/two-factor.ts`     | `enrol`, `unenrol`, `recoveryCodesLeft`, `issueCode`, `verifyCode`, `useRecoveryCode`, `hasStepUpGrant`, `stepUpRequired`, `signInChallengeRequired`                                                                                                                                                                                                                         | 2 const · 2 types   |

**Endpoints — 21**

| Method   | Path                         |
| -------- | ---------------------------- |
| `POST`   | `/auth/register`             |
| `POST`   | `/auth/sign-in`              |
| `POST`   | `/auth/two-factor`           |
| `POST`   | `/auth/refresh`              |
| `POST`   | `/auth/sign-out`             |
| `POST`   | `/auth/sign-out-everywhere`  |
| `POST`   | `/auth/change-password`      |
| `POST`   | `/auth/verify-email/request` |
| `POST`   | `/auth/verify-email/confirm` |
| `POST`   | `/auth/forgot-password`      |
| `GET`    | `/auth/reset-password`       |
| `POST`   | `/auth/reset-password`       |
| `GET`    | `/auth/accept-invite`        |
| `POST`   | `/auth/accept-invite`        |
| `GET`    | `/auth/me`                   |
| `POST`   | `/auth/tour/dismiss`         |
| `GET`    | `/auth/two-factor`           |
| `POST`   | `/auth/two-factor/enrol`     |
| `DELETE` | `/auth/two-factor`           |
| `POST`   | `/auth/step-up/request`      |
| `POST`   | `/auth/step-up/verify`       |

---

## `src/modules/benefits`

| File                              | Exported functions                                                                                                                                       | Also              |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `src/modules/benefits/router.ts`  | —                                                                                                                                                        | 1 const           |
| `src/modules/benefits/schemas.ts` | —                                                                                                                                                        | 5 const · 3 types |
| `src/modules/benefits/service.ts` | `listPlans`, `createPlan`, `updatePlan`, `listEnrolments`, `enrol`, `endEnrolment`, `benefitDeductionsFor`, `benefitDeductionsForMany`, `benefitCostFor` | 3 const · 5 types |

**Endpoints — 8**

| Method  | Path                             |
| ------- | -------------------------------- |
| `GET`   | `/benefits/notices`              |
| `GET`   | `/benefits/plans`                |
| `POST`  | `/benefits/plans`                |
| `PATCH` | `/benefits/plans/:id`            |
| `GET`   | `/benefits/enrolments`           |
| `POST`  | `/benefits/plans/:id/enrolments` |
| `POST`  | `/benefits/enrolments/:id/end`   |
| `GET`   | `/benefits/cost`                 |

---

## `src/modules/billing`

Plans, the company's subscription and checkout, and the paywall that refuses a module the company has not paid for; nothing is deleted when a company lapses.

| File                                 | Exported functions                                                                                                                                                                                                                                                                         | Also              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| `src/modules/billing/enforcement.ts` | `isEnforced`, `enforcementState`, `setEnforced`, `clearEnforcementCache`                                                                                                                                                                                                                   | —                 |
| `src/modules/billing/entitlement.ts` | `entitlementFor`, `invalidateEntitlement`, `clearEntitlementCache`                                                                                                                                                                                                                         | 1 type            |
| `src/modules/billing/gate.ts`        | `refusalFor`, `billingGate`                                                                                                                                                                                                                                                                | 2 types           |
| `src/modules/billing/modules.ts`     | `mountOf`, `moduleFor`                                                                                                                                                                                                                                                                     | 3 const           |
| `src/modules/billing/router.ts`      | —                                                                                                                                                                                                                                                                                          | 1 const           |
| `src/modules/billing/service.ts`     | `startTrial`, `extendTrial`, `trialCandidates`, `startTrialsInBulk`, `recordPayment`, `recordSubscriptionDeposit`, `applyUnappliedPayment`, `reconcileUnappliedPayment`, `checkout`, `currentCheckout`, `setGraceDays`, `cancel`, `summary`, `activePlans`, `adminOverview`, `adminDetail` | 2 const · 3 types |
| `src/modules/billing/status.ts`      | `deriveStatus`, `addMonths`                                                                                                                                                                                                                                                                | 1 const · 3 types |

**Endpoints — 4**

| Method | Path                |
| ------ | ------------------- |
| `GET`  | `/billing/`         |
| `GET`  | `/billing/plans`    |
| `POST` | `/billing/checkout` |
| `GET`  | `/billing/checkout` |

---

## `src/modules/careers`

| File                               | Exported functions                                                                                                                                                                                                                                                                         | Also                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `src/modules/careers/ack.ts`       | `pendingInlineAcknowledgements`, `flushInlineAcknowledgements`, `scheduleAcknowledgement`, `runAcknowledgement`, `sweepAcknowledgements`, `startAckScheduler`, `stopAckScheduler`, `startAckWorker`                                                                                        | 2 types                                                                         |
| `src/modules/careers/captcha.ts`   | `useCaptchaFetch`, `captchaEnabled`, `verifyCaptcha`                                                                                                                                                                                                                                       | `CaptchaRequiredError`, `CaptchaFailedError`, `CaptchaUnavailableError` (class) |
| `src/modules/careers/close.ts`     | `closeLivePostings`                                                                                                                                                                                                                                                                        | —                                                                               |
| `src/modules/careers/cv.ts`        | `cvFolder`, `cvKeyBelongsTo`, `verifyCvKey`, `openCv`                                                                                                                                                                                                                                      | `StorageUnavailableError` (class) · 2 types                                     |
| `src/modules/careers/digest.ts`    | `pendingInlineDigests`, `flushInlineDigests`, `scheduleDigest`, `runDigest`, `sweepDigests`, `startDigestScheduler`, `stopDigestScheduler`, `startDigestWorker`                                                                                                                            | 2 types                                                                         |
| `src/modules/careers/form.ts`      | `formCatalogue`, `parseChoices`, `publicQuestion`, `getForm`, `choicesJson`, `putForm`, `parseScreening`, `copyScreeningQuestions`, `loadApplyForm`, `countWords`, `checkApplication`                                                                                                      | 3 const · 9 types                                                               |
| `src/modules/careers/limits.ts`    | `limits`, `overrideLimits`, `refuseIfOver`, `spendRead`, `spendJunk`, `spendUpload`, `spendApply`                                                                                                                                                                                          | 2 types                                                                         |
| `src/modules/careers/normalise.ts` | `normaliseChannel`, `cleanFreeText`, `phoneKey`, `newReference`                                                                                                                                                                                                                            | 1 const                                                                         |
| `src/modules/careers/orphans.ts`   | `sweepOrphanCvs`, `startOrphanSweeper`, `stopOrphanSweeper`                                                                                                                                                                                                                                | 1 type                                                                          |
| `src/modules/careers/public.ts`    | `findOpenPosting`, `advertTakesFiles`, `assertAcceptingApplications`, `listPublished`, `getPublished`, `getLogo`, `listSitemap`, `pretendToApply`, `lookalikeId`, `prepareApplication`, `takeApplication`                                                                                  | 5 types                                                                         |
| `src/modules/careers/router.ts`    | —                                                                                                                                                                                                                                                                                          | 1 const                                                                         |
| `src/modules/careers/scan.ts`      | `useCvScanner`, `scanCv`                                                                                                                                                                                                                                                                   | 1 const · 3 types                                                               |
| `src/modules/careers/schemas.ts`   | —                                                                                                                                                                                                                                                                                          | 13 const · 9 types                                                              |
| `src/modules/careers/seo.ts`       | `schemaEmploymentType`, `buildSeo`                                                                                                                                                                                                                                                         | 1 type                                                                          |
| `src/modules/careers/service.ts`   | `isOpen`, `answerText`, `listPostings`, `getPosting`, `createPosting`, `updatePosting`, `publishPosting`, `closePosting`, `listApplications`, `getApplication`, `openApplicationCv`, `shareLinksFor`, `openApplicationAnswerFile`, `exportApplications`, `advance`, `decline`, `analytics` | 1 const · 2 types                                                               |
| `src/modules/careers/settings.ts`  | `loadSettings`, `brandName`, `defaultNoticeText`, `effectiveNotice`, `updateSettings`, `remindersView`, `organisationOf`, `logoUrlFor`, `ackBlockers`, `candidateEmailBlockers`, `getSettingsView`                                                                                         | 4 const · 3 types                                                               |
| `src/modules/careers/share.ts`     | `careersBaseUrl`, `buildShareLinks`                                                                                                                                                                                                                                                        | 1 type                                                                          |
| `src/modules/careers/storage.ts`   | `useCvStore`, `cvStoreWired`, `warnIfNoCvStore`, `warnCvUnavailable`, `cvSummary`                                                                                                                                                                                                          | 1 const · 3 types                                                               |

**Endpoints — 43**

| Method   | Path                                               |
| -------- | -------------------------------------------------- |
| `GET`    | `/careers/public/_sitemap`                         |
| `GET`    | `/careers/public/:orgSlug/_logo`                   |
| `GET`    | `/careers/public/:orgSlug`                         |
| `GET`    | `/careers/public/:orgSlug/:postingSlug`            |
| `POST`   | `/careers/public/:orgSlug/:postingSlug/apply`      |
| `POST`   | `/careers/public/:orgSlug/:postingSlug/upload-url` |
| `GET`    | `/careers/postings`                                |
| `POST`   | `/careers/postings`                                |
| `GET`    | `/careers/postings/:id`                            |
| `PATCH`  | `/careers/postings/:id`                            |
| `POST`   | `/careers/postings/:id/publish`                    |
| `POST`   | `/careers/postings/:id/close`                      |
| `GET`    | `/careers/postings/:id/criteria`                   |
| `PUT`    | `/careers/postings/:id/criteria`                   |
| `POST`   | `/careers/postings/:id/criteria/preview`           |
| `POST`   | `/careers/postings/:id/criteria/suggest`           |
| `GET`    | `/careers/postings/:id/screening`                  |
| `GET`    | `/careers/postings/:id/screening/runs`             |
| `GET`    | `/careers/postings/:id/screening/runs/:runId`      |
| `POST`   | `/careers/postings/:id/screening/rescore`          |
| `GET`    | `/careers/postings/:id/cutoff`                     |
| `POST`   | `/careers/postings/:id/cutoff/preview`             |
| `PUT`    | `/careers/postings/:id/cutoff`                     |
| `GET`    | `/careers/postings/:id/cutoff/confirm`             |
| `POST`   | `/careers/applications/:id/cutoff/keep`            |
| `DELETE` | `/careers/applications/:id/cutoff/keep`            |
| `GET`    | `/careers/applications/:id/assessments`            |
| `PUT`    | `/careers/applications/:id/assessments`            |
| `DELETE` | `/careers/applications/:id/assessments`            |
| `GET`    | `/careers/postings/:id/form`                       |
| `PUT`    | `/careers/postings/:id/form`                       |
| `POST`   | `/careers/postings/:id/form/screening-questions`   |
| `GET`    | `/careers/postings/:id/share-links`                |
| `GET`    | `/careers/postings/:id/applications.csv`           |
| `GET`    | `/careers/settings`                                |
| `PATCH`  | `/careers/settings`                                |
| `GET`    | `/careers/applications`                            |
| `GET`    | `/careers/applications/:id`                        |
| `GET`    | `/careers/applications/:id/cv`                     |
| `GET`    | `/careers/applications/:id/answers/:answerId/file` |
| `POST`   | `/careers/applications/:id/advance`                |
| `POST`   | `/careers/applications/:id/decline`                |
| `GET`    | `/careers/analytics`                               |

---

## `src/modules/company`

| File                             | Exported functions                                                                                                                     | Also              |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `src/modules/company/router.ts`  | —                                                                                                                                      | 1 const           |
| `src/modules/company/schemas.ts` | —                                                                                                                                      | 5 const · 4 types |
| `src/modules/company/service.ts` | `profile`, `updateProfile`, `listRoles`, `updateRole`, `listNotifications`, `updateNotification`, `listIntegrations`, `setIntegration` | —                 |

**Endpoints — 9**

| Method  | Path                         |
| ------- | ---------------------------- |
| `GET`   | `/company/profile`           |
| `PATCH` | `/company/profile`           |
| `GET`   | `/company/roles`             |
| `PATCH` | `/company/roles/:id`         |
| `GET`   | `/company/notifications`     |
| `PATCH` | `/company/notifications/:id` |
| `GET`   | `/company/integrations`      |
| `POST`  | `/company/integrations`      |
| `GET`   | `/company/tax-states`        |

---

## `src/modules/conduct`

| File                             | Exported functions                                                                                                                                                                                                                      | Also                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `src/modules/conduct/router.ts`  | —                                                                                                                                                                                                                                       | 1 const             |
| `src/modules/conduct/schemas.ts` | —                                                                                                                                                                                                                                       | 10 const · 10 types |
| `src/modules/conduct/service.ts` | `listPolicies`, `getPolicy`, `createPolicy`, `updatePolicy`, `publishPolicy`, `acknowledgePolicy`, `policyAcknowledgements`, `myPolicies`, `getAction`, `listActions`, `recordFor`, `createAction`, `updateAction`, `acknowledgeAction` | 6 types             |

**Endpoints — 14**

| Method  | Path                                     |
| ------- | ---------------------------------------- |
| `GET`   | `/conduct/policies`                      |
| `POST`  | `/conduct/policies`                      |
| `GET`   | `/conduct/me/policies`                   |
| `GET`   | `/conduct/policies/:id`                  |
| `PATCH` | `/conduct/policies/:id`                  |
| `POST`  | `/conduct/policies/:id/publish`          |
| `POST`  | `/conduct/policies/:id/acknowledge`      |
| `GET`   | `/conduct/policies/:id/acknowledgements` |
| `GET`   | `/conduct/actions`                       |
| `POST`  | `/conduct/actions`                       |
| `GET`   | `/conduct/actions/:id`                   |
| `PATCH` | `/conduct/actions/:id`                   |
| `GET`   | `/conduct/employees/:id/actions`         |
| `POST`  | `/conduct/actions/:id/acknowledge`       |

---

## `src/modules/delivery-report`

| File                                     | Exported functions | Also             |
| ---------------------------------------- | ------------------ | ---------------- |
| `src/modules/delivery-report/router.ts`  | —                  | 1 const          |
| `src/modules/delivery-report/schemas.ts` | —                  | 1 const · 1 type |
| `src/modules/delivery-report/service.ts` | `deliveryReport`   | —                |

**Endpoints — 1**

| Method | Path                |
| ------ | ------------------- |
| `GET`  | `/delivery-report/` |

---

## `src/modules/demo-requests`

| File                                   | Exported functions | Also             |
| -------------------------------------- | ------------------ | ---------------- |
| `src/modules/demo-requests/router.ts`  | —                  | 1 const          |
| `src/modules/demo-requests/schemas.ts` | —                  | 1 const · 1 type |
| `src/modules/demo-requests/service.ts` | `record`           | 1 type           |

**Endpoints — 1**

| Method | Path              |
| ------ | ----------------- |
| `POST` | `/demo-requests/` |

---

## `src/modules/departments`

**The reference module.** Copy this shape for a new one.

| File                                 | Exported functions                                                        | Also              |
| ------------------------------------ | ------------------------------------------------------------------------- | ----------------- |
| `src/modules/departments/router.ts`  | —                                                                         | 1 const           |
| `src/modules/departments/schemas.ts` | —                                                                         | 5 const · 3 types |
| `src/modules/departments/service.ts` | `tree`, `get`, `create`, `update`, `move`, `archive`, `restore`, `assign` | 1 type            |

**Endpoints — 9**

| Method   | Path                         |
| -------- | ---------------------------- |
| `GET`    | `/departments/`              |
| `GET`    | `/departments/:id`           |
| `POST`   | `/departments/`              |
| `PATCH`  | `/departments/:id`           |
| `POST`   | `/departments/:id/move`      |
| `DELETE` | `/departments/:id`           |
| `POST`   | `/departments/:id/restore`   |
| `POST`   | `/departments/:id/employees` |
| `POST`   | `/departments/unassign`      |

---

## `src/modules/documents`

| File                               | Exported functions                                                                                                                                                                                                                       | Also              |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `src/modules/documents/router.ts`  | —                                                                                                                                                                                                                                        | 1 const           |
| `src/modules/documents/schemas.ts` | —                                                                                                                                                                                                                                        | 9 const · 9 types |
| `src/modules/documents/service.ts` | `fileAccess`, `listForEmployee`, `addForEmployee`, `documentContent`, `archiveDocument`, `verifyDocument`, `listRequests`, `listMyRequests`, `getRequest`, `createRequest`, `remindRequest`, `fulfilRequest`, `waiveRequest`, `expiring` | 3 types           |

**Endpoints — 15**

| Method   | Path                                  |
| -------- | ------------------------------------- |
| `GET`    | `/documents/me/requests`              |
| `GET`    | `/documents/expiring`                 |
| `GET`    | `/documents/requests`                 |
| `POST`   | `/documents/requests`                 |
| `GET`    | `/documents/requests/:id`             |
| `POST`   | `/documents/requests/:id/remind`      |
| `POST`   | `/documents/requests/:id/fulfil`      |
| `POST`   | `/documents/requests/:id/waive`       |
| `GET`    | `/documents/employees/:id`            |
| `POST`   | `/documents/employees/:id/upload-url` |
| `GET`    | `/documents/:id/file`                 |
| `GET`    | `/documents/:id/content`              |
| `POST`   | `/documents/employees/:id`            |
| `POST`   | `/documents/:id/verify`               |
| `DELETE` | `/documents/:id`                      |

---

## `src/modules/employees`

The staff record, the reporting line and the directory.

| File                                                   | Exported functions                                                                                                                                                                                                                                                                                 | Also               |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `src/modules/employees/employment-change-scheduler.ts` | `sweepEmploymentChanges`, `startEmploymentChangeScheduler`, `stopEmploymentChangeScheduler`                                                                                                                                                                                                        | 1 type             |
| `src/modules/employees/employment-changes.ts`          | `listChanges`, `scheduledWithin`, `propose`, `decide`, `cancel`, `applyDue`, `recordDirectEdit`, `getChange`                                                                                                                                                                                       | 3 const · 2 types  |
| `src/modules/employees/probation-scheduler.ts`         | `sweepProbations`, `startProbationScheduler`, `stopProbationScheduler`                                                                                                                                                                                                                             | 1 type             |
| `src/modules/employees/probation.ts`                   | `probationEndFrom`, `defaultProbationEnd`, `dueSoon`, `needingADate`, `historyFor`, `decide`, `raiseDueConfirmations`                                                                                                                                                                              | —                  |
| `src/modules/employees/router.ts`                      | —                                                                                                                                                                                                                                                                                                  | 1 const            |
| `src/modules/employees/schemas.ts`                     | —                                                                                                                                                                                                                                                                                                  | 11 const · 8 types |
| `src/modules/employees/self-service.ts`                | `selfMayTouch`, `selfNeedsApproval`, `updateOwnRecord`, `describe`, `decideChange`, `pendingFor`                                                                                                                                                                                                   | 4 const · 4 types  |
| `src/modules/employees/service.ts`                     | `missingForPayroll`, `serialize`, `orgChart`, `serializeDirectory`, `serializeLookup`, `list`, `get`, `summary`, `employeeNumbers`, `organizationContext`, `prepareCreate`, `insertEmployee`, `insertActiveEmployees`, `create`, `update`, `archive`, `restore`, `bulkAssign`, `bulkPensionScheme` | 5 types            |

**Endpoints — 21**

| Method   | Path                                         |
| -------- | -------------------------------------------- |
| `GET`    | `/employees/`                                |
| `POST`   | `/employees/bulk-assign`                     |
| `POST`   | `/employees/bulk-pension-scheme`             |
| `GET`    | `/employees/org-chart`                       |
| `GET`    | `/employees/summary`                         |
| `PATCH`  | `/employees/me`                              |
| `GET`    | `/employees/me/changes`                      |
| `GET`    | `/employees/employment-changes`              |
| `GET`    | `/employees/:id`                             |
| `POST`   | `/employees/`                                |
| `PATCH`  | `/employees/:id`                             |
| `DELETE` | `/employees/:id`                             |
| `POST`   | `/employees/:id/restore`                     |
| `GET`    | `/employees/:id/history`                     |
| `GET`    | `/employees/probation/due`                   |
| `GET`    | `/employees/:id/employment-changes`          |
| `POST`   | `/employees/:id/probation-decision`          |
| `POST`   | `/employees/employment-changes`              |
| `GET`    | `/employees/employment-changes/:id`          |
| `POST`   | `/employees/employment-changes/:id/decision` |
| `POST`   | `/employees/employment-changes/:id/cancel`   |

---

## `src/modules/engagement`

| File                                 | Exported functions          | Also             |
| ------------------------------------ | --------------------------- | ---------------- |
| `src/modules/engagement/app-open.ts` | `recordAppOpen`             | —                |
| `src/modules/engagement/floor.ts`    | `aggregateFloor`            | —                |
| `src/modules/engagement/router.ts`   | —                           | 1 const          |
| `src/modules/engagement/schemas.ts`  | —                           | 1 const · 1 type |
| `src/modules/engagement/weekly.ts`   | `summarise`, `weeklyActive` | 2 types          |

**Endpoints — 1**

| Method | Path                        |
| ------ | --------------------------- |
| `GET`  | `/engagement/weekly-active` |

---

## `src/modules/exports`

| File                             | Exported functions                                     | Also             |
| -------------------------------- | ------------------------------------------------------ | ---------------- |
| `src/modules/exports/router.ts`  | —                                                      | 1 const          |
| `src/modules/exports/service.ts` | `assertWithinCap`, `staff`, `pay`, `attendanceSummary` | 1 const · 1 type |

**Endpoints — 4**

| Method | Path                                     |
| ------ | ---------------------------------------- |
| `GET`  | `/exports/staff.csv`                     |
| `GET`  | `/exports/payroll-runs/:id/payslips.csv` |
| `GET`  | `/exports/attendance.csv`                |
| `POST` | `/exports/company-report/printed`        |

---

## `src/modules/grades`

| File                            | Exported functions                                                                                                  | Also              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `src/modules/grades/router.ts`  | —                                                                                                                   | 1 const           |
| `src/modules/grades/schemas.ts` | —                                                                                                                   | 7 const · 5 types |
| `src/modules/grades/service.ts` | `bandPosition`, `list`, `get`, `employeesOn`, `position`, `create`, `update`, `archive`, `restore`, `applyIncrease` | 4 types           |

**Endpoints — 9**

| Method   | Path                           |
| -------- | ------------------------------ |
| `GET`    | `/grades/`                     |
| `GET`    | `/grades/position/:employeeId` |
| `GET`    | `/grades/:id`                  |
| `GET`    | `/grades/:id/employees`        |
| `POST`   | `/grades/`                     |
| `PATCH`  | `/grades/:id`                  |
| `DELETE` | `/grades/:id`                  |
| `POST`   | `/grades/:id/restore`          |
| `POST`   | `/grades/:id/apply-increase`   |

---

## `src/modules/helpdesk`

| File                                    | Exported functions                                                                                                                                                                                                                              | Also                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `src/modules/helpdesk/router.ts`        | —                                                                                                                                                                                                                                               | 1 const             |
| `src/modules/helpdesk/schemas.ts`       | —                                                                                                                                                                                                                                               | 15 const · 13 types |
| `src/modules/helpdesk/service.ts`       | `queue`, `raisedByMe`, `assignedToMe`, `get`, `listComments`, `create`, `update`, `assign`, `resolve`, `reopen`, `addComment`, `listCategories`, `createCategory`, `updateCategory`, `listSla`, `createSla`, `updateSla`, `analytics`, `median` | 4 types             |
| `src/modules/helpdesk/sla.ts`           | `policyFor`, `deadlinesFor`, `snapshotFrom`, `freeze`, `snapshotsFor`, `breached`                                                                                                                                                               | 2 const · 2 types   |
| `src/modules/helpdesk/working-hours.ts` | `calendarOf`, `describeCalendar`, `zoneOffsetMinutes`, `isWorkingDay`, `addWorkingMinutes`, `workingMinutesBetween`, `loadCalendar`, `deadlineWindow`                                                                                           | 2 types             |

**Endpoints — 18**

| Method  | Path                             |
| ------- | -------------------------------- |
| `GET`   | `/helpdesk/tickets`              |
| `GET`   | `/helpdesk/tickets/mine`         |
| `GET`   | `/helpdesk/tickets/assigned`     |
| `POST`  | `/helpdesk/tickets`              |
| `GET`   | `/helpdesk/tickets/:id`          |
| `PATCH` | `/helpdesk/tickets/:id`          |
| `POST`  | `/helpdesk/tickets/:id/assign`   |
| `POST`  | `/helpdesk/tickets/:id/resolve`  |
| `POST`  | `/helpdesk/tickets/:id/reopen`   |
| `GET`   | `/helpdesk/tickets/:id/comments` |
| `POST`  | `/helpdesk/tickets/:id/comments` |
| `GET`   | `/helpdesk/categories`           |
| `POST`  | `/helpdesk/categories`           |
| `PATCH` | `/helpdesk/categories/:id`       |
| `GET`   | `/helpdesk/sla`                  |
| `POST`  | `/helpdesk/sla`                  |
| `PATCH` | `/helpdesk/sla/:id`              |
| `GET`   | `/helpdesk/analytics`            |

---

## `src/modules/imports`

The bulk-upload framework: one machine, many column dictionaries. Two callers with different contracts — the spreadsheet upload and the legacy ETL.

| File                                 | Exported functions                                                                                                                                                          | Also               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `src/modules/imports/assessments.ts` | `checkAssessments`, `writeAssessments`, `mayImportAssessments`                                                                                                              | 4 const · 2 types  |
| `src/modules/imports/assets.ts`      | `checkAssets`                                                                                                                                                               | 5 const · 1 type   |
| `src/modules/imports/attendance.ts`  | `checkAttendance`                                                                                                                                                           | 5 const · 1 type   |
| `src/modules/imports/columns.ts`     | `normalizeKey`, `bad`, `dateOf`, `timeOf`, `parseTime`, `moneyOf`, `parseDate`, `parseMoneyKobo`, `orderColumns`, `buildDictionary`, `cellToString`, `viewOf`, `templateOf` | 2 const · 10 types |
| `src/modules/imports/departments.ts` | `checkDepartments`                                                                                                                                                          | 5 const · 1 type   |
| `src/modules/imports/employees.ts`   | `resolveTaxState`, `checkEmployees`                                                                                                                                         | 12 const · 1 type  |
| `src/modules/imports/entity.ts`      | `fingerprintOf`                                                                                                                                                             | 1 const · 11 types |
| `src/modules/imports/objectives.ts`  | `mayImportObjectives`, `parseQuarter`, `checkObjectives`                                                                                                                    | 5 const · 1 type   |
| `src/modules/imports/router.ts`      | —                                                                                                                                                                           | 1 const            |
| `src/modules/imports/schemas.ts`     | —                                                                                                                                                                           | 8 const · 5 types  |
| `src/modules/imports/service.ts`     | `register`, `validate`, `apply`, `list`, `rowsFor`, `get`, `validateEmployees`, `applyEmployees`, `employeeTemplate`                                                        | 2 const · 2 types  |

**Endpoints — 21**

| Method | Path                                        |
| ------ | ------------------------------------------- |
| `GET`  | `/imports/template/employees`               |
| `GET`  | `/imports/template/departments`             |
| `GET`  | `/imports/template/assets`                  |
| `GET`  | `/imports/template/attendance`              |
| `GET`  | `/imports/template/objectives`              |
| `GET`  | `/imports/template/assessment-scores`       |
| `GET`  | `/imports/`                                 |
| `GET`  | `/imports/:batchId/rows`                    |
| `GET`  | `/imports/:batchId`                         |
| `POST` | `/imports/employees/validate`               |
| `POST` | `/imports/employees/:batchId/apply`         |
| `POST` | `/imports/departments/validate`             |
| `POST` | `/imports/departments/:batchId/apply`       |
| `POST` | `/imports/assets/validate`                  |
| `POST` | `/imports/assets/:batchId/apply`            |
| `POST` | `/imports/attendance/validate`              |
| `POST` | `/imports/attendance/:batchId/apply`        |
| `POST` | `/imports/objectives/validate`              |
| `POST` | `/imports/objectives/:batchId/apply`        |
| `POST` | `/imports/assessment-scores/validate`       |
| `POST` | `/imports/assessment-scores/:batchId/apply` |

---

## `src/modules/insights`

| File                                     | Exported functions                                     | Also               |
| ---------------------------------------- | ------------------------------------------------------ | ------------------ |
| `src/modules/insights/company-report.ts` | `companyReport`, `companyHeadline`, `departmentPeople` | 1 const · 17 types |
| `src/modules/insights/layout.ts`         | `layoutFor`, `clearLayout`, `saveLayout`               | 1 type             |
| `src/modules/insights/router.ts`         | —                                                      | 2 const            |
| `src/modules/insights/schemas.ts`        | —                                                      | 4 const · 1 type   |
| `src/modules/insights/service.ts`        | `dashboard`, `reports`                                 | 3 types            |
| `src/modules/insights/workforce.ts`      | `workforce`                                            | 1 type             |

**Endpoints — 8**

| Method   | Path                                              |
| -------- | ------------------------------------------------- |
| `GET`    | `/insights/dashboard`                             |
| `GET`    | `/insights/dashboard/layout`                      |
| `PUT`    | `/insights/dashboard/layout`                      |
| `DELETE` | `/insights/dashboard/layout`                      |
| `GET`    | `/insights/company-report`                        |
| `GET`    | `/insights/company-report/headline`               |
| `GET`    | `/insights/company-report/departments/:id/people` |
| `GET`    | `/insights/reports`                               |

---

## `src/modules/invites`

| File                             | Exported functions                                                                                                                                       | Also              |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `src/modules/invites/on-join.ts` | `inviteOnJoin`                                                                                                                                           | 1 type            |
| `src/modules/invites/router.ts`  | —                                                                                                                                                        | 1 const           |
| `src/modules/invites/schemas.ts` | —                                                                                                                                                        | 7 const · 5 types |
| `src/modules/invites/service.ts` | `send`, `bulkSend`, `bulkSendByEmail`, `list`, `resend`, `inviteLink`, `revoke`, `unlinkedUsers`, `linkToEmployee`, `createEmployeeAndLink`, `accessFor` | 8 types           |

**Endpoints — 11**

| Method   | Path                        |
| -------- | --------------------------- |
| `POST`   | `/invites/`                 |
| `POST`   | `/invites/bulk`             |
| `POST`   | `/invites/by-email`         |
| `GET`    | `/invites/delivery`         |
| `GET`    | `/invites/`                 |
| `POST`   | `/invites/:userId/resend`   |
| `POST`   | `/invites/:userId/link`     |
| `DELETE` | `/invites/:userId`          |
| `GET`    | `/invites/unlinked`         |
| `PATCH`  | `/invites/:userId/employee` |
| `POST`   | `/invites/:userId/employee` |

---

## `src/modules/job-roles`

The catalogue of the company's job roles, with a target level per competency for each; nothing is compulsory, and a record keeps the title it was written with.

| File                               | Exported functions                                                                                      | Also              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------- |
| `src/modules/job-roles/router.ts`  | —                                                                                                       | 1 const           |
| `src/modules/job-roles/schemas.ts` | —                                                                                                       | 4 const · 2 types |
| `src/modules/job-roles/service.ts` | `requireRole`, `list`, `get`, `create`, `update`, `archive`, `restore`, `setCompetencies`, `expectedOf` | —                 |

**Endpoints — 8**

| Method  | Path                              |
| ------- | --------------------------------- |
| `GET`   | `/job-roles/`                     |
| `GET`   | `/job-roles/expected/:employeeId` |
| `GET`   | `/job-roles/:id`                  |
| `POST`  | `/job-roles/`                     |
| `PATCH` | `/job-roles/:id`                  |
| `PUT`   | `/job-roles/:id/competencies`     |
| `POST`  | `/job-roles/:id/archive`          |
| `POST`  | `/job-roles/:id/restore`          |

---

## `src/modules/knowledge`

| File                               | Exported functions                                                                                                                                                                                                                                                            | Also              |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `src/modules/knowledge/router.ts`  | —                                                                                                                                                                                                                                                                             | 1 const           |
| `src/modules/knowledge/schemas.ts` | —                                                                                                                                                                                                                                                                             | 8 const · 7 types |
| `src/modules/knowledge/search.ts`  | `terms`, `run`, `snippet`                                                                                                                                                                                                                                                     | 1 type            |
| `src/modules/knowledge/service.ts` | `slugify`, `categoryTree`, `createCategory`, `updateCategory`, `removeCategory`, `reorderCategories`, `listArticles`, `getArticle`, `createArticle`, `updateArticle`, `publishArticle`, `unpublishArticle`, `archiveArticle`, `searchArticles`, `recordFeedback`, `analytics` | 5 types           |
| `src/modules/knowledge/store.ts`   | `ready`, `vote`, `talliesFor`, `leastHelpful`, `voteCount`, `recordMiss`, `misses`                                                                                                                                                                                            | 1 const · 2 types |

**Endpoints — 16**

| Method   | Path                                  |
| -------- | ------------------------------------- |
| `GET`    | `/knowledge/categories`               |
| `POST`   | `/knowledge/categories`               |
| `POST`   | `/knowledge/categories/reorder`       |
| `PATCH`  | `/knowledge/categories/:id`           |
| `DELETE` | `/knowledge/categories/:id`           |
| `GET`    | `/knowledge/search`                   |
| `GET`    | `/knowledge/analytics`                |
| `GET`    | `/knowledge/articles`                 |
| `GET`    | `/knowledge/articles/:id`             |
| `POST`   | `/knowledge/articles`                 |
| `PATCH`  | `/knowledge/articles/:id`             |
| `DELETE` | `/knowledge/articles/:id`             |
| `POST`   | `/knowledge/articles/:id/publish`     |
| `POST`   | `/knowledge/articles/:id/unpublish`   |
| `POST`   | `/knowledge/articles/:id/helpful`     |
| `POST`   | `/knowledge/articles/:id/not-helpful` |

---

## `src/modules/leave`

| File                                              | Exported functions                                                                                                                                                                                                                         | Also               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| `src/modules/leave/balance.ts`                    | `appliesToGender`, `leaveYearOf`, `computeBalances`, `balancesFor`, `workingDaysBetween`, `calendarSpan`, `countLeaveDays`, `overlapping`, `clashesWith`                                                                                   | 2 const · 3 types  |
| `src/modules/leave/holiday-announcements.ts`      | `readGroundedReply`, `askGemini`, `acceptFinding`, `checkAnnouncements`, `recentAnnouncements`, `announcementSummary`, `applyAnnouncementsToQueue`, `confirmFromQueue`                                                                     | 3 const · 5 types  |
| `src/modules/leave/holiday-reminder-scheduler.ts` | `sweepHolidayReminders`, `startHolidayReminderScheduler`, `stopHolidayReminderScheduler`                                                                                                                                                   | 1 type             |
| `src/modules/leave/holiday-reminder.ts`           | `sendDueHolidayReminders`                                                                                                                                                                                                                  | 1 type             |
| `src/modules/leave/holiday-scheduler.ts`          | `sweepHolidays`, `startHolidayScheduler`, `stopHolidayScheduler`                                                                                                                                                                           | 1 type             |
| `src/modules/leave/holiday-suggestions.ts`        | `suggestUpcoming`, `remindUnconfirmed`, `decideSuggestion`, `reopenDecision`                                                                                                                                                               | 3 const            |
| `src/modules/leave/nigerian-holidays.ts`          | `easterSunday`, `lunarCalendarAvailable`, `nigerianHolidays`, `nigerianHolidaysBetween`                                                                                                                                                    | 1 const · 1 type   |
| `src/modules/leave/rollover-scheduler.ts`         | `sweepRollovers`, `startRolloverScheduler`, `stopRolloverScheduler`                                                                                                                                                                        | 1 type             |
| `src/modules/leave/rollover.ts`                   | `rollOverInto`                                                                                                                                                                                                                             | 1 type             |
| `src/modules/leave/router.ts`                     | —                                                                                                                                                                                                                                          | 1 const            |
| `src/modules/leave/schemas.ts`                    | —                                                                                                                                                                                                                                          | 10 const · 6 types |
| `src/modules/leave/service.ts`                    | `serialize`, `list`, `get`, `listTypes`, `createType`, `archiveType`, `restoreType`, `updateType`, `preview`, `create`, `assertStillOpen`, `decide`, `reopen`, `cancel`, `listHolidays`, `createHoliday`, `updateHoliday`, `deleteHoliday` | 1 const · 4 types  |

**Endpoints — 17**

| Method   | Path                         |
| -------- | ---------------------------- |
| `GET`    | `/leave/types`               |
| `POST`   | `/leave/types`               |
| `DELETE` | `/leave/types/:id`           |
| `POST`   | `/leave/types/:id/restore`   |
| `PATCH`  | `/leave/types/:id`           |
| `GET`    | `/leave/requests`            |
| `GET`    | `/leave/requests/preview`    |
| `GET`    | `/leave/requests/:id`        |
| `POST`   | `/leave/requests`            |
| `POST`   | `/leave/requests/:id/decide` |
| `POST`   | `/leave/requests/:id/reopen` |
| `POST`   | `/leave/requests/:id/cancel` |
| `GET`    | `/leave/balances/:id`        |
| `GET`    | `/leave/holidays`            |
| `POST`   | `/leave/holidays`            |
| `PATCH`  | `/leave/holidays/:id`        |
| `DELETE` | `/leave/holidays/:id`        |

---

## `src/modules/loans`

| File                           | Exported functions                                                                                                                                                                                                                                                                                                                                       | Also              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `src/modules/loans/router.ts`  | —                                                                                                                                                                                                                                                                                                                                                        | 1 const           |
| `src/modules/loans/schemas.ts` | —                                                                                                                                                                                                                                                                                                                                                        | 8 const · 7 types |
| `src/modules/loans/service.ts` | `monthStart`, `addMonths`, `buildSchedule`, `serialize`, `list`, `pending`, `get`, `mine`, `summary`, `apply`, `approve`, `reschedule`, `decline`, `applyRepayment`, `absorbExtraInstalment`, `payInstalment`, `waiveInstalment`, `dueRepaymentsFor`, `dueRepaymentsForMany`, `overridesFor`, `applyOverrides`, `payslipLoansFor`, `payslipLoansForMany` | 8 types           |

**Endpoints — 11**

| Method | Path                                    |
| ------ | --------------------------------------- |
| `GET`  | `/loans/me`                             |
| `GET`  | `/loans/pending`                        |
| `GET`  | `/loans/summary`                        |
| `GET`  | `/loans/`                               |
| `POST` | `/loans/`                               |
| `GET`  | `/loans/:id`                            |
| `POST` | `/loans/:id/approve`                    |
| `POST` | `/loans/:id/reschedule`                 |
| `POST` | `/loans/:id/decline`                    |
| `POST` | `/loans/:id/repayments/:sequence/pay`   |
| `POST` | `/loans/:id/repayments/:sequence/waive` |

---

## `src/modules/me`

| File                                       | Exported functions | Also               |
| ------------------------------------------ | ------------------ | ------------------ |
| `src/modules/me/context.ts`                | `makeContext`      | 1 type             |
| `src/modules/me/router.ts`                 | —                  | 1 const            |
| `src/modules/me/schemas.ts`                | —                  | 1 const · 1 type   |
| `src/modules/me/sections/advance.ts`       | —                  | 1 const            |
| `src/modules/me/sections/announcements.ts` | —                  | 1 const            |
| `src/modules/me/sections/clock-in.ts`      | —                  | 1 const            |
| `src/modules/me/sections/index.ts`         | —                  | 1 const            |
| `src/modules/me/sections/leave.ts`         | —                  | 1 const            |
| `src/modules/me/sections/one-on-one.ts`    | —                  | 1 const            |
| `src/modules/me/sections/pay.ts`           | —                  | 1 const            |
| `src/modules/me/sections/policies.ts`      | —                  | 1 const            |
| `src/modules/me/sections/tasks.ts`         | —                  | 1 const            |
| `src/modules/me/today.ts`                  | `buildToday`       | 1 const · 2 types  |
| `src/modules/me/types.ts`                  | `unavailable`      | 1 const · 13 types |

**Endpoints — 4**

| Method   | Path              |
| -------- | ----------------- |
| `GET`    | `/me/today`       |
| `POST`   | `/me/app-open`    |
| `POST`   | `/me/push-tokens` |
| `DELETE` | `/me/push-tokens` |

---

## `src/modules/notifications`

In-app messages. Nothing here sends email.

| File                                   | Exported functions                                                                 | Also             |
| -------------------------------------- | ---------------------------------------------------------------------------------- | ---------------- |
| `src/modules/notifications/router.ts`  | —                                                                                  | 1 const          |
| `src/modules/notifications/schemas.ts` | —                                                                                  | 1 const · 1 type |
| `src/modules/notifications/service.ts` | `list`, `unreadCount`, `markRead`, `markAllRead`, `remove`, `notify`, `notifyMany` | 3 types          |

**Endpoints — 5**

| Method   | Path                          |
| -------- | ----------------------------- |
| `GET`    | `/notifications/`             |
| `GET`    | `/notifications/unread-count` |
| `POST`   | `/notifications/read-all`     |
| `POST`   | `/notifications/:id/read`     |
| `DELETE` | `/notifications/:id`          |

---

## `src/modules/offboarding`

| File                                   | Exported functions                                                                                                                                                                                                                                                                                                               | Also                |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `src/modules/offboarding/router.ts`    | —                                                                                                                                                                                                                                                                                                                                | 1 const             |
| `src/modules/offboarding/schemas.ts`   | —                                                                                                                                                                                                                                                                                                                                | 12 const · 11 types |
| `src/modules/offboarding/service.ts`   | `list`, `get`, `create`, `managerApprove`, `hrApprove`, `decline`, `withdraw`, `updateTask`, `verifyTask`, `readiness`, `complete`, `exitExceptionsFor`, `openExitLoad`, `saveInterview`, `getInterview`, `listTemplates`, `createTemplate`, `updateTemplate`, `deactivateTemplate`, `reorderTemplates`, `adoptDefaultTemplates` | 1 const · 10 types  |
| `src/modules/offboarding/templates.ts` | `seedExitTemplates`                                                                                                                                                                                                                                                                                                              | 2 const · 1 type    |

**Endpoints — 19**

| Method   | Path                                    |
| -------- | --------------------------------------- |
| `GET`    | `/offboarding/templates`                |
| `POST`   | `/offboarding/templates/adopt-defaults` |
| `POST`   | `/offboarding/templates`                |
| `PATCH`  | `/offboarding/templates/:id`            |
| `DELETE` | `/offboarding/templates/:id`            |
| `POST`   | `/offboarding/templates/reorder`        |
| `PATCH`  | `/offboarding/tasks/:id`                |
| `POST`   | `/offboarding/tasks/:id/verify`         |
| `GET`    | `/offboarding/`                         |
| `POST`   | `/offboarding/`                         |
| `GET`    | `/offboarding/:id`                      |
| `GET`    | `/offboarding/:id/readiness`            |
| `POST`   | `/offboarding/:id/manager-approve`      |
| `POST`   | `/offboarding/:id/hr-approve`           |
| `POST`   | `/offboarding/:id/decline`              |
| `POST`   | `/offboarding/:id/withdraw`             |
| `POST`   | `/offboarding/:id/complete`             |
| `GET`    | `/offboarding/:id/interview`            |
| `POST`   | `/offboarding/:id/interview`            |

---

## `src/modules/onboarding`

| File                                  | Exported functions                                                                                                                                                                                                                                                                     | Also              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `src/modules/onboarding/router.ts`    | —                                                                                                                                                                                                                                                                                      | 1 const           |
| `src/modules/onboarding/schemas.ts`   | —                                                                                                                                                                                                                                                                                      | 7 const · 6 types |
| `src/modules/onboarding/service.ts`   | `list`, `get`, `createOnboardingProcess`, `closeOnboardingProcess`, `managerApprove`, `hrApprove`, `updateTask`, `readiness`, `complete`, `openOnboardingLoad`, `listTemplates`, `createTemplate`, `updateTemplate`, `deactivateTemplate`, `reorderTemplates`, `adoptDefaultTemplates` | 1 const · 8 types |
| `src/modules/onboarding/templates.ts` | `seedOnboardingTemplates`                                                                                                                                                                                                                                                              | 1 const · 1 type  |

**Endpoints — 13**

| Method   | Path                                   |
| -------- | -------------------------------------- |
| `GET`    | `/onboarding/templates`                |
| `POST`   | `/onboarding/templates/adopt-defaults` |
| `POST`   | `/onboarding/templates`                |
| `PATCH`  | `/onboarding/templates/:id`            |
| `DELETE` | `/onboarding/templates/:id`            |
| `POST`   | `/onboarding/templates/reorder`        |
| `PATCH`  | `/onboarding/tasks/:id`                |
| `GET`    | `/onboarding/`                         |
| `GET`    | `/onboarding/:id`                      |
| `GET`    | `/onboarding/:id/readiness`            |
| `POST`   | `/onboarding/:id/manager-approve`      |
| `POST`   | `/onboarding/:id/hr-approve`           |
| `POST`   | `/onboarding/:id/complete`             |

---

## `src/modules/one-on-ones`

| File                                 | Exported functions                                                                                                                                                        | Also              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `src/modules/one-on-ones/router.ts`  | —                                                                                                                                                                         | 1 const           |
| `src/modules/one-on-ones/schemas.ts` | —                                                                                                                                                                         | 6 const · 5 types |
| `src/modules/one-on-ones/service.ts` | `dueFrom`, `requireSeries`, `mine`, `start`, `updateSeries`, `meetings`, `schedule`, `updateMeeting`, `cancelMeeting`, `addItem`, `setItemDone`, `removeItem`, `coverage` | 2 const · 6 types |

**Endpoints — 11**

| Method   | Path                              |
| -------- | --------------------------------- |
| `GET`    | `/one-on-ones/`                   |
| `GET`    | `/one-on-ones/coverage`           |
| `POST`   | `/one-on-ones/`                   |
| `PATCH`  | `/one-on-ones/:id`                |
| `GET`    | `/one-on-ones/:id/meetings`       |
| `POST`   | `/one-on-ones/:id/meetings`       |
| `PATCH`  | `/one-on-ones/meetings/:id`       |
| `DELETE` | `/one-on-ones/meetings/:id`       |
| `POST`   | `/one-on-ones/meetings/:id/items` |
| `PATCH`  | `/one-on-ones/items/:id`          |
| `DELETE` | `/one-on-ones/items/:id`          |

---

## `src/modules/overtime`

| File                              | Exported functions                                                                                                                             | Also    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `src/modules/overtime/router.ts`  | —                                                                                                                                              | 1 const |
| `src/modules/overtime/schemas.ts` | —                                                                                                                                              | 4 const |
| `src/modules/overtime/service.ts` | `getPolicy`, `updatePolicy`, `rateFor`, `valueOvertime`, `detect`, `list`, `decide`, `overtimeFor`, `overtimeForMany`, `markPaid`, `pendingIn` | 3 types |

**Endpoints — 6**

| Method  | Path                   |
| ------- | ---------------------- |
| `GET`   | `/overtime/policy`     |
| `PATCH` | `/overtime/policy`     |
| `GET`   | `/overtime/`           |
| `GET`   | `/overtime/mine`       |
| `POST`  | `/overtime/detect`     |
| `POST`  | `/overtime/:id/decide` |

---

## `src/modules/pay-components`

| File                                    | Exported functions                                                                                                                                                                                                                                                                                                                                                                                                                                                | Also                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `src/modules/pay-components/router.ts`  | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 1 const             |
| `src/modules/pay-components/schemas.ts` | `scheduleFromInput`                                                                                                                                                                                                                                                                                                                                                                                                                                               | 13 const · 12 types |
| `src/modules/pay-components/service.ts` | `periodRange`, `scheduleOf`, `serializeSchedule`, `serializeComponent`, `specsFrom`, `isScheduled`, `judgeSchedules`, `scheduleStatusOf`, `resolveComponentsFor`, `resolveComponentsForMany`, `scheduledFor`, `list`, `get`, `create`, `previewSchedule`, `update`, `archive`, `assign`, `getAssignment`, `updateAssignment`, `removeAssignment`, `bulkAssign`, `assignToMany`, `peopleFor`, `setPeople`, `assignmentsFor`, `preview`, `seedDefaultPayComponents` | 1 const · 11 types  |

**Endpoints — 15**

| Method   | Path                                         |
| -------- | -------------------------------------------- |
| `GET`    | `/pay-components/`                           |
| `POST`   | `/pay-components/`                           |
| `POST`   | `/pay-components/schedule-preview`           |
| `GET`    | `/pay-components/employees/:employeeId`      |
| `POST`   | `/pay-components/employees/:employeeId`      |
| `POST`   | `/pay-components/employees/:employeeId/bulk` |
| `GET`    | `/pay-components/:id/people`                 |
| `PUT`    | `/pay-components/:id/people`                 |
| `POST`   | `/pay-components/:id/assign`                 |
| `GET`    | `/pay-components/preview/:employeeId`        |
| `PATCH`  | `/pay-components/assignments/:id`            |
| `DELETE` | `/pay-components/assignments/:id`            |
| `GET`    | `/pay-components/:id`                        |
| `PATCH`  | `/pay-components/:id`                        |
| `DELETE` | `/pay-components/:id`                        |

---

## `src/modules/payments`

The wallet, the ledger and the provider seam. With no provider registered, releasing refuses rather than faking success.

| File                                                 | Exported functions                                                                                                                                                                                                                                                                                | Also                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `src/modules/payments/banks.ts`                      | `bulkPaymentBankCode`, `bankByCbnCode`, `bankByCode`, `bankByShortName`, `bankByName`, `searchBanks`                                                                                                                                                                                              | 1 const · 1 type    |
| `src/modules/payments/call-log-pruner.ts`            | `startProviderCallPruner`, `stopProviderCallPruner`                                                                                                                                                                                                                                               | —                   |
| `src/modules/payments/call-log.ts`                   | `redactPayload`, `truncatePayload`, `providerCallRecorder`, `pruneProviderCalls`                                                                                                                                                                                                                  | 7 types             |
| `src/modules/payments/file.ts`                       | `nairaCell`, `buildBankFile`                                                                                                                                                                                                                                                                      | 1 const · 2 types   |
| `src/modules/payments/mark-paid.ts`                  | `markBatchPaid`                                                                                                                                                                                                                                                                                   | 1 type              |
| `src/modules/payments/monnify-webhook.ts`            | `monnifyWebhook`                                                                                                                                                                                                                                                                                  | 1 type              |
| `src/modules/payments/provider.ts`                   | `useProvider`, `clearProvidersForTests`, `providerFor`, `submitBatch`, `statusOf`                                                                                                                                                                                                                 | 1 const · 6 types   |
| `src/modules/payments/providers/config.ts`           | `ninejapayIsConfigured`, `ninejapayConfig`                                                                                                                                                                                                                                                        | 1 type              |
| `src/modules/payments/providers/fake-provider.ts`    | `fakeProvidersEnabled`, `fakeMonnifyClient`, `fakeNinejapayClient`, `fakePaymentAdapter`                                                                                                                                                                                                          | —                   |
| `src/modules/payments/providers/monnify-client.ts`   | `nairaString`, `monnifyClient`, `verifyMonnifySignature`                                                                                                                                                                                                                                          | 10 types            |
| `src/modules/payments/providers/monnify-config.ts`   | `monnifyIsConfigured`, `monnifyConfig`                                                                                                                                                                                                                                                            | 2 types             |
| `src/modules/payments/providers/monnify.ts`          | `monnify`                                                                                                                                                                                                                                                                                         | —                   |
| `src/modules/payments/providers/ninejapay-banks.ts`  | `toNineJaPayCode`                                                                                                                                                                                                                                                                                 | 2 types             |
| `src/modules/payments/providers/ninejapay-client.ts` | `ninejapayClient`, `verifyWebhookSignature`                                                                                                                                                                                                                                                       | 8 types             |
| `src/modules/payments/providers/ninejapay.ts`        | `ninejapay`                                                                                                                                                                                                                                                                                       | —                   |
| `src/modules/payments/reserved-accounts.ts`          | `provisionReservedAccount`, `provisionNinejapayAccount`, `openSubscriptionAccount`                                                                                                                                                                                                                | 2 types             |
| `src/modules/payments/router.ts`                     | —                                                                                                                                                                                                                                                                                                 | 1 const             |
| `src/modules/payments/schemas.ts`                    | `accountNumberProblem`                                                                                                                                                                                                                                                                            | 12 const · 11 types |
| `src/modules/payments/service.ts`                    | `maskAccount`, `paymentHistory`, `listAccounts`, `createAccount`, `updateAccount`, `archiveAccount`, `createBatch`, `listBatches`, `getBatch`, `checkBatch`, `approveBatch`, `submitBatchToProvider`, `applyTransferOutcome`, `cancelBatch`, `bankFile`, `listLedger`, `recordFunding`, `summary` | 4 types             |
| `src/modules/payments/wallet-account.ts`             | `walletOf`, `credit`, `debit`, `movements`, `reconcileWallet`                                                                                                                                                                                                                                     | 4 types             |
| `src/modules/payments/wallet.ts`                     | `walletBalance`, `affordability`, `fundingAccounts`, `fundingAccountToShow`, `collectionAccount`                                                                                                                                                                                                  | 4 types             |
| `src/modules/payments/webhook.ts`                    | `ninejapayWebhook`                                                                                                                                                                                                                                                                                | 1 type              |

**Endpoints — 24**

| Method   | Path                              |
| -------- | --------------------------------- |
| `POST`   | `/payments/webhooks/9japay`       |
| `POST`   | `/payments/webhooks/monnify`      |
| `GET`    | `/payments/wallet`                |
| `GET`    | `/payments/wallet/account`        |
| `GET`    | `/payments/banks`                 |
| `POST`   | `/payments/account-verification`  |
| `GET`    | `/payments/account`               |
| `GET`    | `/payments/accounts`              |
| `POST`   | `/payments/accounts`              |
| `PATCH`  | `/payments/accounts/:id`          |
| `DELETE` | `/payments/accounts/:id`          |
| `GET`    | `/payments/batches`               |
| `POST`   | `/payments/batches`               |
| `GET`    | `/payments/batches/:id`           |
| `POST`   | `/payments/batches/:id/check`     |
| `POST`   | `/payments/batches/:id/approve`   |
| `POST`   | `/payments/batches/:id/submit`    |
| `POST`   | `/payments/batches/:id/mark-paid` |
| `POST`   | `/payments/batches/:id/cancel`    |
| `GET`    | `/payments/batches/:id/file`      |
| `GET`    | `/payments/history`               |
| `GET`    | `/payments/ledger`                |
| `POST`   | `/payments/ledger/funding`        |
| `GET`    | `/payments/summary`               |

---

## `src/modules/payroll`

The statutory engine, the run lifecycle, exclusions, hand adjustments and the reconciliation gate.

| File                                          | Exported functions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Also                |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `src/modules/payroll/adjustments.ts`          | `noPayslipProblem`, `applyAdjustmentSheet`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 5 types             |
| `src/modules/payroll/allowance-schedule.ts`   | `isEveryMonth`, `normalised`, `monthIndex`, `monthStartOf`, `addMonths`, `payMonthOf`, `evaluate`, `nextDue`, `monthLabel`, `durationText`, `describe`, `statusText`, `scheduleProblems`                                                                                                                                                                                                                                                                                                                                                                                                      | 1 const · 8 types   |
| `src/modules/payroll/assemble.ts`             | `engineSettingsFrom`, `readPeriodFor`, `readsOf`, `assembleFor`, `assembleFrom`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 2 const · 5 types   |
| `src/modules/payroll/deductions.ts`           | `deductionSpec`, `overridesByEmployee`, `operatesDeduction`, `overrideNote`, `hasOverride`, `overriddenLabels`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2 const · 2 types   |
| `src/modules/payroll/earned.ts`               | `earnedToDate`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 1 const · 1 type    |
| `src/modules/payroll/engine.ts`               | `scheduleFor`, `operationFrom`, `annualPaye`, `annualPayeWorking`, `consolidatedRelief`, `rentRelief`, `personalRelief`, `computePayslip`, `totalsFor`, `validateSettings`, `statutoryNotices`                                                                                                                                                                                                                                                                                                                                                                                                | 5 const · 17 types  |
| `src/modules/payroll/payslip-email.ts`        | `sendPayslips`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 1 type              |
| `src/modules/payroll/payslip-pdf.ts`          | `payslipPdf`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 1 type              |
| `src/modules/payroll/public-calculator.ts`    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 1 const             |
| `src/modules/payroll/reconcile.ts`            | `checkPayslip`, `checkTotals`, `reconcile`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 1 type              |
| `src/modules/payroll/relief.ts`               | `reliefRegimeFor`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | —                   |
| `src/modules/payroll/router.ts`               | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 1 const             |
| `src/modules/payroll/scheduled-allowances.ts` | `scheduledAllowancesForRun`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 1 type              |
| `src/modules/payroll/schemas.ts`              | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 26 const · 17 types |
| `src/modules/payroll/service.ts`              | `prepare`, `submitForApproval`, `excludeFromRun`, `putBackOnRun`, `setTaxOverride`, `clearTaxOverride`, `setDeductionOverride`, `clearDeductionOverride`, `approve`, `detail`, `payslips`, `assertRegisterWithinCap`, `bankRegister`, `payslipsForEmployee`, `payslipById`, `list`, `cancel`, `preview`, `quotePure`, `quote`, `settings`, `updateSettings`, `setOvertimeOverride`, `clearOvertimeOverride`, `setDaysWorked`, `clearDaysWorked`, `runLoans`, `setLoanDeduction`, `clearLoanDeduction`, `setMonthlyPay`, `setBonus`, `linesFor`, `lineSummaryForRun`, `setLines`, `clearBonus` | 1 const · 10 types  |
| `src/modules/payroll/statutory.ts`            | `dueDateFor`, `schedulesFor`, `writeSchedules`, `schedulesForRun`, `markFiled`, `scheduleFile`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 4 const · 4 types   |
| `src/modules/payroll/switches.ts`             | `bonusesOperated`, `walletPayoutOperated`, `assertBonusesOperated`, `assertOvertimeOperated`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | —                   |
| `src/modules/payroll/top-up.ts`               | `computeWithTopUp`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 4 const · 3 types   |
| `src/modules/payroll/working.ts`              | `payeWorkingFor`, `pensionWorkingFor`, `nhfWorkingFor`, `rateSettingsFor`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 2 types             |

**Endpoints — 41**

| Method   | Path                                                      |
| -------- | --------------------------------------------------------- |
| `GET`    | `/payroll/settings`                                       |
| `PATCH`  | `/payroll/settings`                                       |
| `GET`    | `/payroll/runs`                                           |
| `GET`    | `/payroll/runs/:id`                                       |
| `GET`    | `/payroll/runs/:id/payslips`                              |
| `GET`    | `/payroll/employees/:id/payslips`                         |
| `GET`    | `/payroll/payslips/:id`                                   |
| `GET`    | `/payroll/runs/:id/bank-register`                         |
| `GET`    | `/payroll/runs/:id/schedules`                             |
| `GET`    | `/payroll/schedules/:id/file`                             |
| `POST`   | `/payroll/schedules/:id/filed`                            |
| `GET`    | `/payroll/payslips/:id/pdf`                               |
| `POST`   | `/payroll/runs`                                           |
| `POST`   | `/payroll/runs/:id/submit-for-approval`                   |
| `POST`   | `/payroll/runs/:id/approve`                               |
| `POST`   | `/payroll/runs/:id/exclusions`                            |
| `DELETE` | `/payroll/runs/:id/exclusions/:employeeId`                |
| `POST`   | `/payroll/runs/:id/tax-overrides`                         |
| `POST`   | `/payroll/runs/:id/overtime-overrides`                    |
| `POST`   | `/payroll/runs/:id/bonuses`                               |
| `DELETE` | `/payroll/runs/:id/bonuses/:employeeId`                   |
| `PATCH`  | `/payroll/runs/:id/monthly-pay`                           |
| `DELETE` | `/payroll/runs/:id/overtime-overrides/:employeeId`        |
| `POST`   | `/payroll/runs/:id/days-worked`                           |
| `GET`    | `/payroll/runs/:id/loans`                                 |
| `POST`   | `/payroll/runs/:id/loan-deductions`                       |
| `DELETE` | `/payroll/runs/:id/loan-deductions/:loanId`               |
| `DELETE` | `/payroll/runs/:id/days-worked/:employeeId`               |
| `POST`   | `/payroll/runs/:id/adjustments`                           |
| `DELETE` | `/payroll/runs/:id/tax-overrides/:employeeId`             |
| `POST`   | `/payroll/runs/:id/deduction-overrides`                   |
| `DELETE` | `/payroll/runs/:id/deduction-overrides/:employeeId/:kind` |
| `GET`    | `/payroll/runs/:id/lines/:employeeId`                     |
| `GET`    | `/payroll/runs/:id/lines-summary`                         |
| `GET`    | `/payroll/runs/:id/scheduled-allowances`                  |
| `PUT`    | `/payroll/runs/:id/lines`                                 |
| `POST`   | `/payroll/runs/:id/payslips/send`                         |
| `POST`   | `/payroll/runs/:id/cancel`                                |
| `GET`    | `/payroll/preview`                                        |
| `POST`   | `/payroll/quote`                                          |
| `POST`   | `/payroll-calculator/`                                    |

---

## `src/modules/pension-top-up`

| File                                    | Exported functions                                                                                                | Also              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------- |
| `src/modules/pension-top-up/copy.ts`    | —                                                                                                                 | 3 const · 1 type  |
| `src/modules/pension-top-up/router.ts`  | —                                                                                                                 | 1 const           |
| `src/modules/pension-top-up/schemas.ts` | —                                                                                                                 | 4 const · 2 types |
| `src/modules/pension-top-up/service.ts` | `topUpEnabled`, `settings`, `setEnabled`, `earliestOpenMonth`, `electionsFor`, `stateFor`, `elect`, `listCurrent` | 5 types           |

**Endpoints — 7**

| Method  | Path                                    |
| ------- | --------------------------------------- |
| `GET`   | `/pension-top-up/settings`              |
| `PATCH` | `/pension-top-up/settings`              |
| `GET`   | `/pension-top-up/me`                    |
| `PUT`   | `/pension-top-up/me`                    |
| `GET`   | `/pension-top-up/`                      |
| `GET`   | `/pension-top-up/employees/:employeeId` |
| `PUT`   | `/pension-top-up/employees/:employeeId` |

---

## `src/modules/performance`

Appraisal periods, objectives, competencies, scoring, sign-off and the nine-box.

| File                                      | Exported functions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Also                |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `src/modules/performance/fairness.ts`     | `wholeYears`, `groupOf`, `analyseFairness`, `analyseMoves`, `referenceDate`, `analyseManagers`, `weightsKey`, `earlierCycles`, `toFairnessPerson`, `cycleFairness`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 4 const · 3 types   |
| `src/modules/performance/framework.ts`    | `seedAppraisalFramework`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 3 const · 1 type    |
| `src/modules/performance/nine-box.ts`     | `nineBox`, `setPotential`, `clearPotential`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 10 const · 6 types  |
| `src/modules/performance/reminders.ts`    | `sweepReminders`, `reminderSchedulerRunning`, `startReminderScheduler`, `stopReminderScheduler`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 1 type              |
| `src/modules/performance/review-flags.ts` | `reviewFlags`, `reviewFlag`, `reviewNote`, `reviewBriefing`, `markStands`, `reopenFlag`, `publishBlocker`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 1 const · 6 types   |
| `src/modules/performance/router.ts`       | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 1 const             |
| `src/modules/performance/schemas.ts`      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 47 const · 43 types |
| `src/modules/performance/scoring.ts`      | `readRatingScale`, `saveRatingScale`, `ratingScale`, `componentOfSection`, `formatBp`, `assertWeightsWhole`, `readWeights`, `saveWeights`, `captureScoringSnapshot`, `levelsFromSnapshot`, `plannedWeightsFrom`, `weightsFromSnapshot`, `levelToBp`, `renormalise`, `bandFor`, `periodSubjectsWhere`, `scoreRegister`, `distributionOf`, `scoreHistory`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 13 const · 16 types |
| `src/modules/performance/service.ts`      | `isHr`, `ledTeamOf`, `leadsWorkOf`, `assertSeesEmployee`, `measureIsRead`, `keyResultPercent`, `keyResultMet`, `assertDirection`, `visibleGoals`, `assertSeesGoal`, `listGoals`, `myGoals`, `teamGoals`, `getGoal`, `mayRaiseForOthers`, `assertMayCreateGoal`, `createGoal`, `assignObjective`, `updateGoal`, `removeGoal`, `publishGoal`, `completeGoal`, `cancelGoal`, `submitObjective`, `agreeObjective`, `sendBackObjective`, `rejectObjective`, `reviseObjective`, `objectiveApprovalQueue`, `addKeyResult`, `updateKeyResult`, `recordProgress`, `confirmMeasure`, `unconfirmMeasure`, `weekStartOf`, `taskPeriodFor`, `submitTask`, `listTasks`, `gradeTask`, `taskCompletionRate`, `taskRatesForCycle`, `taskCoverageByDepartment`, `listTasksForGrading`, `listMyTasks`, `promotionReadiness`, `listSections`, `createSection`, `updateSection`, `deleteSection`, `listCompetencies`, `getCompetency`, `createCompetency`, `updateCompetency`, `archiveCompetency`, `rateCompetency`, `employeeCompetencies`, `competencyGaps`, `competencyHeatmap`, `listCycles`, `getCycle`, `addStandardQuestions`, `createCycle`, `updateCycle`, `removeCycle`, `activateCycle`, `closeCycle`, `cycleParticipants`, `remindCycle`, `listQuestions`, `addQuestion`, `addManagerQuestion`, `calibrateScore`, `clearCalibration`, `calibrationHistory`, `requestRevision`, `listRevisionRequests`, `copyQuestionsFrom`, `updateQuestion`, `removeQuestion`, `reorderQuestions`, `listReviews`, `getReview`, `myReviews`, `respond`, `evidenceContent`, `hrSignOffReview`, `submitReview`, `finaliseReview`, `acknowledgeReview`, `disputeReview`, `requestPeerReviews`, `appraiserMap`, `setAppraisers`, `autoAssignFromReportingLine`, `appraisersOf`, `ratingScaleFor`, `setRatingScale`, `scoringWeights`, `setScoringWeights`, `cycleScores`, `employeeScore`, `cycleReport`, `employeeScoreHistory` | 5 const · 17 types  |
| `src/modules/performance/task-rate.ts`    | `rateFromGradedTasks`, `gradedTasksForCycle`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | —                   |
| `src/modules/performance/work-record.ts`  | `periodBounds`, `getWorkRecord`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 3 types             |

**Endpoints — 97**

| Method   | Path                                                        |
| -------- | ----------------------------------------------------------- |
| `GET`    | `/performance/goals`                                        |
| `GET`    | `/performance/goals/mine`                                   |
| `GET`    | `/performance/goals/team`                                   |
| `GET`    | `/performance/goals/approvals`                              |
| `POST`   | `/performance/goals`                                        |
| `POST`   | `/performance/goals/:id/assign`                             |
| `GET`    | `/performance/goals/:id`                                    |
| `PATCH`  | `/performance/goals/:id`                                    |
| `DELETE` | `/performance/goals/:id`                                    |
| `POST`   | `/performance/goals/:id/publish`                            |
| `POST`   | `/performance/goals/:id/complete`                           |
| `POST`   | `/performance/goals/:id/cancel`                             |
| `POST`   | `/performance/goals/:id/submit`                             |
| `POST`   | `/performance/goals/:id/agree`                              |
| `POST`   | `/performance/goals/:id/send-back`                          |
| `POST`   | `/performance/goals/:id/reject`                             |
| `POST`   | `/performance/goals/:id/revise`                             |
| `POST`   | `/performance/goals/:id/key-results`                        |
| `PATCH`  | `/performance/key-results/:id`                              |
| `POST`   | `/performance/key-results/:id/progress`                     |
| `POST`   | `/performance/key-results/:id/confirm`                      |
| `DELETE` | `/performance/key-results/:id/confirm`                      |
| `GET`    | `/performance/goals/:id/tasks`                              |
| `GET`    | `/performance/tasks/for-grading`                            |
| `GET`    | `/performance/tasks/mine`                                   |
| `POST`   | `/performance/goals/:id/tasks`                              |
| `PATCH`  | `/performance/tasks/:id/grade`                              |
| `GET`    | `/performance/sections`                                     |
| `POST`   | `/performance/sections`                                     |
| `PATCH`  | `/performance/sections/:id`                                 |
| `DELETE` | `/performance/sections/:id`                                 |
| `GET`    | `/performance/competencies`                                 |
| `GET`    | `/performance/competencies/gaps`                            |
| `GET`    | `/performance/competencies/heatmap`                         |
| `POST`   | `/performance/competencies`                                 |
| `GET`    | `/performance/competencies/:id`                             |
| `PATCH`  | `/performance/competencies/:id`                             |
| `DELETE` | `/performance/competencies/:id`                             |
| `POST`   | `/performance/competencies/:id/rate`                        |
| `GET`    | `/performance/employees/:id/competencies`                   |
| `GET`    | `/performance/employees/:id/score-history`                  |
| `GET`    | `/performance/employees/:id/work-record`                    |
| `GET`    | `/performance/work-record/mine`                             |
| `GET`    | `/performance/cycles`                                       |
| `POST`   | `/performance/cycles`                                       |
| `GET`    | `/performance/cycles/:id`                                   |
| `PATCH`  | `/performance/cycles/:id`                                   |
| `DELETE` | `/performance/cycles/:id`                                   |
| `POST`   | `/performance/cycles/:id/activate`                          |
| `POST`   | `/performance/cycles/:id/close`                             |
| `GET`    | `/performance/cycles/:id/participants`                      |
| `POST`   | `/performance/cycles/:id/remind`                            |
| `POST`   | `/performance/cycles/:id/peer-reviews`                      |
| `GET`    | `/performance/cycles/:id/appraisers`                        |
| `POST`   | `/performance/cycles/:id/appraisers/auto`                   |
| `GET`    | `/performance/cycles/:id/appraisers/:employeeId`            |
| `PUT`    | `/performance/cycles/:id/appraisers/:employeeId`            |
| `GET`    | `/performance/scoring-weights`                              |
| `PUT`    | `/performance/scoring-weights`                              |
| `GET`    | `/performance/cycles/:id/scores`                            |
| `GET`    | `/performance/cycles/:id/report`                            |
| `GET`    | `/performance/cycles/:id/review-flags`                      |
| `GET`    | `/performance/cycles/:id/review-flags/:employeeId`          |
| `POST`   | `/performance/cycles/:id/review-flags/briefing`             |
| `POST`   | `/performance/cycles/:id/review-flags/:employeeId/note`     |
| `POST`   | `/performance/cycles/:id/review-flags/:employeeId/decision` |
| `DELETE` | `/performance/cycles/:id/review-flags/:employeeId/decision` |
| `GET`    | `/performance/cycles/:id/fairness`                          |
| `GET`    | `/performance/cycles/:id/nine-box`                          |
| `PUT`    | `/performance/cycles/:id/potential/:employeeId`             |
| `DELETE` | `/performance/cycles/:id/potential/:employeeId`             |
| `GET`    | `/performance/cycles/:id/scores/:employeeId`                |
| `GET`    | `/performance/cycles/:id/questions`                         |
| `POST`   | `/performance/cycles/:id/questions`                         |
| `POST`   | `/performance/cycles/:id/standard-questions`                |
| `POST`   | `/performance/cycles/:id/questions/mine`                    |
| `POST`   | `/performance/cycles/:id/questions/copy`                    |
| `PUT`    | `/performance/cycles/:id/calibrations/:employeeId`          |
| `DELETE` | `/performance/cycles/:id/calibrations/:employeeId`          |
| `GET`    | `/performance/cycles/:id/calibrations/:employeeId/history`  |
| `GET`    | `/performance/cycles/:id/revision-requests`                 |
| `POST`   | `/performance/cycles/:id/revision-requests`                 |
| `POST`   | `/performance/cycles/:id/questions/reorder`                 |
| `PATCH`  | `/performance/questions/:id`                                |
| `DELETE` | `/performance/questions/:id`                                |
| `GET`    | `/performance/reviews`                                      |
| `GET`    | `/performance/reviews/mine`                                 |
| `GET`    | `/performance/reviews/:id`                                  |
| `POST`   | `/performance/reviews/:id/respond`                          |
| `GET`    | `/performance/reviews/:id/questions/:questionId/attachment` |
| `POST`   | `/performance/reviews/:id/submit`                           |
| `POST`   | `/performance/reviews/:id/hr-sign-off`                      |
| `GET`    | `/performance/rating-scale`                                 |
| `PUT`    | `/performance/rating-scale`                                 |
| `POST`   | `/performance/reviews/:id/finalise`                         |
| `POST`   | `/performance/reviews/:id/acknowledge`                      |
| `POST`   | `/performance/reviews/:id/dispute`                          |

---

## `src/modules/permissions`

Roles, the permission catalogue and the grant guards.

| File                                 | Exported functions                                                                                                                                                                                                                                                                                                                                                                                  | Also              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `src/modules/permissions/router.ts`  | —                                                                                                                                                                                                                                                                                                                                                                                                   | 1 const           |
| `src/modules/permissions/schemas.ts` | —                                                                                                                                                                                                                                                                                                                                                                                                   | 5 const · 4 types |
| `src/modules/permissions/service.ts` | `resolveGrants`, `grantsImplying`, `roleHolds`, `permissionLabel`, `catalogue`, `derivedGrants`, `derivedRoles`, `headedDepartmentIds`, `headedBranchIds`, `seedSystemRoles`, `listRoles`, `getRole`, `members`, `effectivePermissions`, `requiresStrongPassword`, `userPermissions`, `assertCanGrant`, `transferOwnership`, `createRole`, `updateRole`, `deleteRole`, `addMembers`, `removeMember` | 3 const · 3 types |

**Endpoints — 11**

| Method   | Path                                     |
| -------- | ---------------------------------------- |
| `GET`    | `/permissions/catalogue`                 |
| `GET`    | `/permissions/roles`                     |
| `GET`    | `/permissions/roles/:id`                 |
| `POST`   | `/permissions/roles`                     |
| `PATCH`  | `/permissions/roles/:id`                 |
| `DELETE` | `/permissions/roles/:id`                 |
| `POST`   | `/permissions/roles/owner/transfer`      |
| `GET`    | `/permissions/roles/:id/members`         |
| `POST`   | `/permissions/roles/:id/members`         |
| `DELETE` | `/permissions/roles/:id/members/:userId` |
| `GET`    | `/permissions/users/:id/permissions`     |

---

## `src/modules/projects`

Projects, their members and workflow, sprints, issues and comments, behind the `projects` feature switch; a finished issue can file a weekly task for the performance module.

| File                                  | Exported functions                                                                                                                                                                                                                                                                                                                                                                                                            | Also                                                            |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `src/modules/projects/access.ts`      | `holdsRecords`, `canCreateProject`, `canSeeProject`, `canManageProject`, `visibleProjectsWhere`, `requireEmployee`, `assertNotPersonalKey`, `isPersonalProject`, `leadsPerson`, `teamOf`, `canSeePersonalIssue`, `mayEditDetails`, `assertPersonalEdit`, `assertPersonalOwner`, `requireProject`, `assertCanManage`, `requireIssue`, `requireIssueRead`, `whoCanSeeIssue`, `requireSprint`, `requireComment`, `projectsAreOn` | `ModuleOffError` (class) · 2 const · 7 types                    |
| `src/modules/projects/activity.ts`    | `activityRow`                                                                                                                                                                                                                                                                                                                                                                                                                 | 1 type                                                          |
| `src/modules/projects/attachments.ts` | `keyBelongsTo`, `verifyStored`, `alreadyAttachedOr`, `removeStored`, `storedKeys`, `taskAttachments`, `commentAttachments`, `mayAttachToTask`, `uploadUrl`, `recordAttachment`, `attachmentUrl`, `deleteAttachment`                                                                                                                                                                                                           | `AttachmentStorageUnavailableError` (class) · 1 const · 2 types |
| `src/modules/projects/bridge.ts`      | `weeklyTaskInfo`, `describeIssue`, `syncWeeklyTask`                                                                                                                                                                                                                                                                                                                                                                           | 2 const · 2 types                                               |
| `src/modules/projects/comments.ts`    | `listComments`, `addComment`, `editComment`, `deleteComment`                                                                                                                                                                                                                                                                                                                                                                  | —                                                               |
| `src/modules/projects/issues.ts`      | `readIssue`, `readIssues`, `listIssues`, `getIssue`, `readReducedIssue`, `createIssue`, `updateIssue`, `bridge`, `deleteIssue`                                                                                                                                                                                                                                                                                                | 1 const · 5 types                                               |
| `src/modules/projects/links.ts`       | `linkLabel`, `visibleIssues`, `visibleIssueKeys`, `listLinks`, `createLink`, `updateLinkNote`, `deleteLink`, `searchIssues`                                                                                                                                                                                                                                                                                                   | 4 types                                                         |
| `src/modules/projects/notices.ts`     | `issueHref`, `personalTaskHref`, `tellAssigned`, `tellMentioned`, `mentionedMembers`, `tellAddedAsWatcher`, `notifyWatchers`                                                                                                                                                                                                                                                                                                  | 1 const · 1 type                                                |
| `src/modules/projects/personal.ts`    | `ensurePersonalProject`, `listMine`, `readPersonalTask`, `createMine`, `moveIssue`                                                                                                                                                                                                                                                                                                                                            | 1 const · 2 types                                               |
| `src/modules/projects/projects.ts`    | `getProject`, `listProjects`, `createProject`, `updateProject`, `deleteProject`, `setMembers`, `setStatuses`                                                                                                                                                                                                                                                                                                                  | 3 const                                                         |
| `src/modules/projects/router.ts`      | —                                                                                                                                                                                                                                                                                                                                                                                                                             | 6 const                                                         |
| `src/modules/projects/schemas.ts`     | —                                                                                                                                                                                                                                                                                                                                                                                                                             | 30 const · 23 types                                             |
| `src/modules/projects/serializers.ts` | `serializeStatus`, `serializeProject`, `serializeSprint`, `serializeIssue`, `reduceIssue`, `linkedIssueIds`, `serializeActivity`, `serializeAttachment`, `serializeComment`                                                                                                                                                                                                                                                   | 1 const · 9 types                                               |
| `src/modules/projects/sprints.ts`     | `listSprints`, `getSprint`, `createSprint`, `updateSprint`, `deleteSprint`, `startSprint`, `completeSprint`                                                                                                                                                                                                                                                                                                                   | 1 const · 1 type                                                |
| `src/modules/projects/team.ts`        | `listTeamTasks`, `leadsATeam`, `giveTask`                                                                                                                                                                                                                                                                                                                                                                                     | 3 types                                                         |
| `src/modules/projects/watchers.ts`    | `watchState`, `mayChooseWatchers`, `watch`, `unwatch`, `addWatcher`, `removeWatcher`                                                                                                                                                                                                                                                                                                                                          | 1 const · 2 types                                               |

**Endpoints — 42**

| Method   | Path                                 |
| -------- | ------------------------------------ |
| `GET`    | `/projects/`                         |
| `GET`    | `/projects/mine/tasks`               |
| `POST`   | `/projects/mine/tasks`               |
| `GET`    | `/projects/team-tasks`               |
| `GET`    | `/projects/team-tasks/leads`         |
| `POST`   | `/projects/team-tasks`               |
| `POST`   | `/projects/`                         |
| `GET`    | `/projects/:id`                      |
| `PATCH`  | `/projects/:id`                      |
| `DELETE` | `/projects/:id`                      |
| `PUT`    | `/projects/:id/members`              |
| `PUT`    | `/projects/:id/statuses`             |
| `GET`    | `/projects/:id/sprints`              |
| `POST`   | `/projects/:id/sprints`              |
| `GET`    | `/projects/:id/issues`               |
| `POST`   | `/projects/:id/issues`               |
| `GET`    | `/sprints/:id`                       |
| `PATCH`  | `/sprints/:id`                       |
| `DELETE` | `/sprints/:id`                       |
| `POST`   | `/sprints/:id/start`                 |
| `POST`   | `/sprints/:id/complete`              |
| `GET`    | `/issues/search`                     |
| `GET`    | `/issues/:id`                        |
| `PATCH`  | `/issues/:id`                        |
| `DELETE` | `/issues/:id`                        |
| `POST`   | `/issues/:id/move`                   |
| `GET`    | `/issues/:id/comments`               |
| `POST`   | `/issues/:id/comments`               |
| `GET`    | `/issues/:id/links`                  |
| `POST`   | `/issues/:id/links`                  |
| `POST`   | `/issues/:id/watch`                  |
| `DELETE` | `/issues/:id/watch`                  |
| `POST`   | `/issues/:id/watchers`               |
| `DELETE` | `/issues/:id/watchers/:employeeId`   |
| `POST`   | `/issues/:id/attachments/upload-url` |
| `POST`   | `/issues/:id/attachments`            |
| `PATCH`  | `/comments/:id`                      |
| `DELETE` | `/comments/:id`                      |
| `PATCH`  | `/links/:id`                         |
| `DELETE` | `/links/:id`                         |
| `GET`    | `/attachments/:id/url`               |
| `DELETE` | `/attachments/:id`                   |

---

## `src/modules/push`

| File                         | Exported functions                                                               | Also             |
| ---------------------------- | -------------------------------------------------------------------------------- | ---------------- |
| `src/modules/push/native.ts` | `nativePushConfigured`, `registerDeviceToken`, `removeDeviceToken`, `pushNative` | 1 const · 1 type |
| `src/modules/push/router.ts` | —                                                                                | 1 const          |
| `src/modules/push/send.ts`   | `pushConfigured`, `publicKey`, `pushToUser`                                      | 2 types          |

**Endpoints — 4**

| Method | Path                  |
| ------ | --------------------- |
| `GET`  | `/push/key`           |
| `GET`  | `/push/subscriptions` |
| `POST` | `/push/subscriptions` |
| `POST` | `/push/unsubscribe`   |

---

## `src/modules/recruitment`

Requisitions, pipelines, interviews, scorecards and offers.

| File                                            | Exported functions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Also                |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `src/modules/recruitment/access.ts`             | `collaboratorRole`, `getAccess`, `changeSettings`, `grantAccess`, `changeRole`, `revokeAccess`, `resendInvitation`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 3 const · 6 types   |
| `src/modules/recruitment/board.ts`              | `columnPredicate`, `buildCards`, `getBoard`, `getBoardColumn`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 1 const · 2 types   |
| `src/modules/recruitment/bulk.ts`               | `startBulk`, `startHireEmployees`, `runBulkJob`, `holdInlineBulkJobs`, `flushInlineBulkJobs`, `scheduleBulkJob`, `sweepBulkJobs`, `startBulkScheduler`, `stopBulkScheduler`, `startBulkWorker`, `getBulkJob`, `listBulkJobs`, `getBulkResults`, `exportApplications`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 6 types             |
| `src/modules/recruitment/calendar-links.ts`     | `calendarLinks`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 1 const · 2 types   |
| `src/modules/recruitment/candidate-email.ts`    | `stageEntryKey`, `rejectionKey`, `declineAtDoorKey`, `interviewKey`, `offerKey`, `insertEmailRows`, `scheduleByKeys`, `chooseEmailTemplate`, `stageTemplate`, `missingNote`, `factsFor`, `previewValues`, `settingsBlock`, `noticeDelivery`, `wordingFor`, `runCandidateEmail`, `flushInlineCandidateEmails`, `pendingInlineCandidateEmails`, `scheduleCandidateEmails`, `sweepCandidateEmails`, `startCandidateEmailScheduler`, `stopCandidateEmailScheduler`, `startCandidateEmailWorker`, `serializeEmail`, `emailsFor`, `emailsForJobApplication`                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 3 const · 6 types   |
| `src/modules/recruitment/composite.ts`          | `scorecardBp`, `meanBp`, `toScore`, `summarise`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 5 types             |
| `src/modules/recruitment/core-hr.ts`            | `coreHrStatus`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 1 const · 1 type    |
| `src/modules/recruitment/email-fields.ts`       | `kindInfo`, `tokens`, `assertTemplateValid`, `cleanValue`, `merge`, `sampleValues`, `paragraphsOf`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 5 const · 5 types   |
| `src/modules/recruitment/email-templates.ts`    | `listEmailTemplates`, `requireEmailTemplate`, `createEmailTemplate`, `updateEmailTemplate`, `archiveEmailTemplate`, `restoreEmailTemplate`, `defaultWording`, `renderCandidateEmail`, `previewEmail`, `fieldsUsedIn`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 3 types             |
| `src/modules/recruitment/filters.ts`            | `asBoolean`, `filterFromQuery`, `candidateWhere`, `applicationWhere`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 1 type              |
| `src/modules/recruitment/hires-export.ts`       | `exportHires`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 2 types             |
| `src/modules/recruitment/hires.ts`              | `acceptMode`, `insertHire`, `canCreate`, `serializeHire`, `hireWhere`, `listHires`, `requireHire`, `getHire`, `summary`, `loadRunCache`, `employeeRefusal`, `attemptEmployees`, `assertCoreHr`, `createEmployeeForHire`, `linkEmployeeToHire`, `didNotJoin`, `hireIdsMatching`, `auditEmployeesCreated`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 1 const · 10 types  |
| `src/modules/recruitment/history.ts`            | `recordEvent`, `recordEvents`, `historyFor`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 3 types             |
| `src/modules/recruitment/ics.ts`                | `cleanBlock`, `cleanLine`, `escapeText`, `foldLine`, `safeHttpsUrl`, `zoneShortName`, `offsetMillisAt`, `transitionsBetween`, `vtimezoneLines`, `buildIcs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 1 const · 2 types   |
| `src/modules/recruitment/interview-calendar.ts` | `assembleFacts`, `loadInterviewFacts`, `withInterview`, `describe`, `linksFor`, `buildCopy`, `icsContentType`, `valuesFor`, `noticeLine`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 5 types             |
| `src/modules/recruitment/interview-notices.ts`  | `noticeKey`, `templatesFor`, `planNotices`, `applyPlan`, `finishNotices`, `notAsked`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 9 types             |
| `src/modules/recruitment/interview-time.ts`     | `formatWhen`, `formatDay`, `formatClock`, `zoneShortName`, `zoneLabel`, `formatDuration`, `zoneOf`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | —                   |
| `src/modules/recruitment/interview-views.ts`    | `staffCalendar`, `staffCalendarFile`, `panelistCalendar`, `interviewNotices`, `interviewReminders`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 4 types             |
| `src/modules/recruitment/job-audience.ts`       | `whoCanSee`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | —                   |
| `src/modules/recruitment/offer-pdf.ts`          | `companyAddress`, `offerLetterPdf`, `noteLines`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 2 const · 1 type    |
| `src/modules/recruitment/panel-data.ts`         | `keyOf`, `sameParticipant`, `namesOfPeople`, `namesOf`, `assertPanelAccounts`, `panelistsFor`, `panelistsOfInterviews`, `scoreOf`, `compositesFor`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 1 const · 3 types   |
| `src/modules/recruitment/panels.ts`             | `getStagePanel`, `setStagePanel`, `myAccess`, `listMyApplications`, `getMyApplication`, `openMyCv`, `listMyInterviews`, `submitMyScorecard`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 4 types             |
| `src/modules/recruitment/reasons.ts`            | `ensureStarterReasons`, `listReasons`, `createReason`, `updateReason`, `chooseReason`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 2 types             |
| `src/modules/recruitment/reminder-slots.ts`     | `isSlot`, `isNudge`, `isCandidateSlot`, `slotTimes`, `slotEnabled`, `reminderKey`, `planSlots`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 8 const · 5 types   |
| `src/modules/recruitment/reminder-sweep.ts`     | `planMissingReminders`, `startReminderPlanner`, `stopReminderPlanner`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | —                   |
| `src/modules/recruitment/reminders.ts`          | `settingsOf`, `reminderRequests`, `remindersFor`, `settleReminders`, `reviveCandidateReminders`, `toldFor`, `reminderGate`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 1 const · 1 type    |
| `src/modules/recruitment/retention.ts`          | `addMonths`, `graceEnds`, `scheduledDeletion`, `loadRetention`, `retentionNote`, `retentionFor`, `reportFor`, `purgeOrganization`, `runRetention`, `startRetentionScheduler`, `stopRetentionScheduler`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 4 types             |
| `src/modules/recruitment/router.ts`             | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 1 const             |
| `src/modules/recruitment/schemas.ts`            | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 62 const · 44 types |
| `src/modules/recruitment/sender.ts`             | `nameTokens`, `matchesRegisteredName`, `senderIdentity`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 1 type              |
| `src/modules/recruitment/service.ts`            | `requireRequisition`, `requireApplication`, `requireStage`, `listRequisitions`, `getRequisition`, `createRequisition`, `updateRequisition`, `submitRequisitionForApproval`, `approveRequisition`, `holdRequisition`, `reopenRequisition`, `fillRequisitionManually`, `cancelRequisition`, `assertRequisitionUsable`, `listStages`, `createStage`, `updateStage`, `deleteStage`, `reorderStages`, `applyTemplateToRequisition`, `listApplicationsForRequisition`, `getApplication`, `moveApplication`, `assertScorecardGate`, `stageOf`, `rejectApplication`, `withdrawApplication`, `listCandidates`, `getCandidate`, `openCandidateCv`, `updateCandidate`, `listInterviews`, `scheduleInterview`, `getInterview`, `rescheduleInterview`, `cancelInterview`, `notifyInterview`, `completeInterview`, `markInterviewNoShow`, `submitScorecard`, `createOffer`, `updateOffer`, `submitOffer`, `approveOffer`, `sendOffer`, `acceptOffer`, `declineOffer`, `withdrawOffer`, `redoOffer`, `getOffer`, `listOffers`, `analytics` | 1 const · 9 types   |
| `src/modules/recruitment/stage-types.ts`        | `isTerminalType`, `inferStageType`, `pipelineIssues`, `assertNoNewIssues`, `stageTypeLabel`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 1 const · 2 types   |
| `src/modules/recruitment/tags.ts`               | `listTags`, `createTag`, `requireTag`, `updateTag`, `deleteTag`, `tagsFor`, `setCandidateTags`, `addToTalentPool`, `removeFromTalentPool`, `listTalentPool`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 2 types             |
| `src/modules/recruitment/templates.ts`          | `ensureStarterTemplate`, `listTemplates`, `getTemplate`, `createTemplate`, `updateTemplate`, `duplicateTemplate`, `archiveTemplate`, `restoreTemplate`, `resolveTemplate`, `copyStages`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 2 const · 2 types   |
| `src/modules/recruitment/visibility.ts`         | `candidatesVisible`, `candidatesHidden`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | —                   |

**Endpoints — 108**

| Method   | Path                                                    |
| -------- | ------------------------------------------------------- |
| `GET`    | `/recruitment/requisitions`                             |
| `POST`   | `/recruitment/requisitions`                             |
| `GET`    | `/recruitment/requisitions/:id`                         |
| `PATCH`  | `/recruitment/requisitions/:id`                         |
| `POST`   | `/recruitment/requisitions/:id/submit`                  |
| `POST`   | `/recruitment/requisitions/:id/approve`                 |
| `POST`   | `/recruitment/requisitions/:id/hold`                    |
| `POST`   | `/recruitment/requisitions/:id/reopen`                  |
| `POST`   | `/recruitment/requisitions/:id/fill`                    |
| `POST`   | `/recruitment/requisitions/:id/cancel`                  |
| `GET`    | `/recruitment/requisitions/:id/stages`                  |
| `POST`   | `/recruitment/requisitions/:id/stages`                  |
| `PATCH`  | `/recruitment/requisitions/:id/stages/:stageId`         |
| `DELETE` | `/recruitment/requisitions/:id/stages/:stageId`         |
| `POST`   | `/recruitment/requisitions/:id/stages/reorder`          |
| `GET`    | `/recruitment/requisitions/:id/applications`            |
| `GET`    | `/recruitment/applications/:id`                         |
| `POST`   | `/recruitment/applications/:id/move`                    |
| `POST`   | `/recruitment/applications/:id/reject`                  |
| `POST`   | `/recruitment/applications/:id/withdraw`                |
| `GET`    | `/recruitment/candidates`                               |
| `GET`    | `/recruitment/candidates/:id`                           |
| `GET`    | `/recruitment/candidates/:id/cv`                        |
| `PATCH`  | `/recruitment/candidates/:id`                           |
| `GET`    | `/recruitment/interviews`                               |
| `GET`    | `/recruitment/interviews/:id`                           |
| `POST`   | `/recruitment/applications/:id/interviews`              |
| `PATCH`  | `/recruitment/interviews/:id`                           |
| `POST`   | `/recruitment/interviews/:id/cancel`                    |
| `POST`   | `/recruitment/interviews/:id/notify`                    |
| `GET`    | `/recruitment/interviews/:id/notices`                   |
| `GET`    | `/recruitment/interviews/:id/reminders`                 |
| `GET`    | `/recruitment/interviews/:id/calendar`                  |
| `GET`    | `/recruitment/interviews/:id/calendar.ics`              |
| `POST`   | `/recruitment/interviews/:id/complete`                  |
| `POST`   | `/recruitment/interviews/:id/no-show`                   |
| `POST`   | `/recruitment/interviews/:id/scorecards`                |
| `GET`    | `/recruitment/offers`                                   |
| `GET`    | `/recruitment/offers/:id`                               |
| `GET`    | `/recruitment/offers/:id/letter.pdf`                    |
| `POST`   | `/recruitment/applications/:id/offers`                  |
| `PATCH`  | `/recruitment/offers/:id`                               |
| `POST`   | `/recruitment/offers/:id/submit`                        |
| `POST`   | `/recruitment/offers/:id/approve`                       |
| `POST`   | `/recruitment/offers/:id/send`                          |
| `POST`   | `/recruitment/offers/:id/accept`                        |
| `POST`   | `/recruitment/offers/:id/decline`                       |
| `POST`   | `/recruitment/offers/:id/withdraw`                      |
| `POST`   | `/recruitment/offers/:id/redo`                          |
| `GET`    | `/recruitment/hires`                                    |
| `GET`    | `/recruitment/hires/summary`                            |
| `POST`   | `/recruitment/hires/employees`                          |
| `POST`   | `/recruitment/hires/export.csv`                         |
| `GET`    | `/recruitment/hires/:id`                                |
| `POST`   | `/recruitment/hires/:id/employee`                       |
| `POST`   | `/recruitment/hires/:id/link-employee`                  |
| `POST`   | `/recruitment/hires/:id/did-not-join`                   |
| `GET`    | `/recruitment/stage-types`                              |
| `GET`    | `/recruitment/pipeline-templates`                       |
| `POST`   | `/recruitment/pipeline-templates`                       |
| `GET`    | `/recruitment/pipeline-templates/:id`                   |
| `PATCH`  | `/recruitment/pipeline-templates/:id`                   |
| `POST`   | `/recruitment/pipeline-templates/:id/duplicate`         |
| `POST`   | `/recruitment/pipeline-templates/:id/archive`           |
| `POST`   | `/recruitment/pipeline-templates/:id/restore`           |
| `POST`   | `/recruitment/requisitions/:id/stages/apply-template`   |
| `GET`    | `/recruitment/rejection-reasons`                        |
| `POST`   | `/recruitment/rejection-reasons`                        |
| `PATCH`  | `/recruitment/rejection-reasons/:id`                    |
| `GET`    | `/recruitment/tags`                                     |
| `POST`   | `/recruitment/tags`                                     |
| `PATCH`  | `/recruitment/tags/:id`                                 |
| `DELETE` | `/recruitment/tags/:id`                                 |
| `PUT`    | `/recruitment/candidates/:id/tags`                      |
| `POST`   | `/recruitment/candidates/:id/talent-pool`               |
| `DELETE` | `/recruitment/candidates/:id/talent-pool`               |
| `GET`    | `/recruitment/talent-pool`                              |
| `GET`    | `/recruitment/requisitions/:id/board`                   |
| `GET`    | `/recruitment/requisitions/:id/board/columns/:key`      |
| `POST`   | `/recruitment/bulk`                                     |
| `GET`    | `/recruitment/bulk`                                     |
| `GET`    | `/recruitment/bulk/:id`                                 |
| `GET`    | `/recruitment/bulk/:id/results`                         |
| `POST`   | `/recruitment/requisitions/:id/applications/export.csv` |
| `GET`    | `/recruitment/email-templates`                          |
| `POST`   | `/recruitment/email-templates`                          |
| `POST`   | `/recruitment/email-templates/preview`                  |
| `PATCH`  | `/recruitment/email-templates/:id`                      |
| `POST`   | `/recruitment/email-templates/:id/archive`              |
| `POST`   | `/recruitment/email-templates/:id/restore`              |
| `GET`    | `/recruitment/requisitions/:id/stages/:stageId/panel`   |
| `PUT`    | `/recruitment/requisitions/:id/stages/:stageId/panel`   |
| `GET`    | `/recruitment/retention`                                |
| `GET`    | `/recruitment/requisitions/:id/access`                  |
| `PATCH`  | `/recruitment/requisitions/:id/access`                  |
| `POST`   | `/recruitment/requisitions/:id/access`                  |
| `PATCH`  | `/recruitment/requisitions/:id/access/:accessId`        |
| `DELETE` | `/recruitment/requisitions/:id/access/:accessId`        |
| `POST`   | `/recruitment/requisitions/:id/access/:accessId/resend` |
| `GET`    | `/recruitment/my/access`                                |
| `GET`    | `/recruitment/my/applications`                          |
| `GET`    | `/recruitment/my/applications/:id`                      |
| `GET`    | `/recruitment/my/applications/:id/cv`                   |
| `GET`    | `/recruitment/my/interviews`                            |
| `GET`    | `/recruitment/my/interviews/:id/calendar`               |
| `GET`    | `/recruitment/my/interviews/:id/calendar.ics`           |
| `POST`   | `/recruitment/my/interviews/:id/scorecard`              |
| `GET`    | `/recruitment/analytics`                                |

---

## `src/modules/reimbursements`

| File                                    | Exported functions                                                                                                                                                                                                                                                                                    | Also               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `src/modules/reimbursements/router.ts`  | —                                                                                                                                                                                                                                                                                                     | 1 const            |
| `src/modules/reimbursements/schemas.ts` | —                                                                                                                                                                                                                                                                                                     | 10 const · 9 types |
| `src/modules/reimbursements/service.ts` | `serialize`, `listTypes`, `createType`, `getType`, `updateType`, `archiveType`, `list`, `get`, `mine`, `pending`, `summary`, `create`, `update`, `approve`, `decline`, `markPaid`, `decideForApproval`, `payableClaimsFor`, `payableClaimsForMany`, `markClaimsPaid`, `seedDefaultReimbursementTypes` | 3 types            |

**Endpoints — 15**

| Method   | Path                                 |
| -------- | ------------------------------------ |
| `POST`   | `/reimbursements/receipt-upload-url` |
| `GET`    | `/reimbursements/types`              |
| `POST`   | `/reimbursements/types`              |
| `PATCH`  | `/reimbursements/types/:id`          |
| `DELETE` | `/reimbursements/types/:id`          |
| `GET`    | `/reimbursements/me`                 |
| `GET`    | `/reimbursements/pending`            |
| `GET`    | `/reimbursements/summary`            |
| `GET`    | `/reimbursements/`                   |
| `POST`   | `/reimbursements/`                   |
| `GET`    | `/reimbursements/:id`                |
| `PATCH`  | `/reimbursements/:id`                |
| `POST`   | `/reimbursements/:id/approve`        |
| `POST`   | `/reimbursements/:id/decline`        |
| `POST`   | `/reimbursements/:id/mark-paid`      |

---

## `src/modules/reports`

| File                               | Exported functions                                                             | Also              |
| ---------------------------------- | ------------------------------------------------------------------------------ | ----------------- |
| `src/modules/reports/catalogue.ts` | `datasetById`, `columnByKey`                                                   | 1 const · 6 types |
| `src/modules/reports/router.ts`    | —                                                                              | 1 const           |
| `src/modules/reports/run.ts`       | `totalOf`, `groupLabel`, `run`                                                 | 1 const · 4 types |
| `src/modules/reports/schemas.ts`   | —                                                                              | 3 const · 3 types |
| `src/modules/reports/service.ts`   | `catalogueFor`, `list`, `get`, `save`, `update`, `remove`, `runSaved`, `toCsv` | 1 type            |

**Endpoints — 9**

| Method   | Path                   |
| -------- | ---------------------- |
| `GET`    | `/reports/catalogue`   |
| `POST`   | `/reports/run`         |
| `GET`    | `/reports/`            |
| `POST`   | `/reports/`            |
| `GET`    | `/reports/:id`         |
| `GET`    | `/reports/:id/run`     |
| `GET`    | `/reports/:id/run.csv` |
| `PATCH`  | `/reports/:id`         |
| `DELETE` | `/reports/:id`         |

---

## `src/modules/screening`

Scores an advert's applicants against its criteria from the words in their CVs, applies the pass mark and assessment results, and runs re-scoring.

| File                                        | Exported functions                                                                                                                                                                                   | Also                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `src/modules/screening/assessments.ts`      | `testKeyOf`, `percentOf`, `setAssessment`, `setByHand`, `clearByHand`, `assessmentsForApplication`, `assessmentsOf`, `testsOf`                                                                       | 3 const · 5 types                          |
| `src/modules/screening/confirm.ts`          | `confirmWhere`, `confirmCount`, `confirmIds`, `confirmList`, `reasonText`, `keepInRunning`, `restoreToList`                                                                                          | 4 const · 2 types                          |
| `src/modules/screening/criteria.ts`         | `normaliseCriteria`, `configuredGroups`, `hashCriteria`, `readStored`, `currentCriteria`, `criteriaAt`, `formQuestionsOf`, `screeningPostings`, `educationCatalogue`, `criteriaView`, `saveCriteria` | 2 const · 4 types                          |
| `src/modules/screening/cutoff-flags.ts`     | `evaluateCutoff`, `loadCutoff`, `recomputeFlags`, `idsAfter`, `recomputeAll`                                                                                                                         | 1 const · 3 types                          |
| `src/modules/screening/cutoff.ts`           | `draftOf`, `liveCount`, `cutoffView`, `previewCutoff`, `saveCutoff`                                                                                                                                  | 1 const · 4 types                          |
| `src/modules/screening/cv-text.ts`          | `scheduleExtraction`, `ensureExtractions`, `runExtraction`, `forgetCv`, `forgetCvForKeys`, `sweepExtractions`, `startExtractionScheduler`, `stopExtractionScheduler`                                 | 1 const · 4 types                          |
| `src/modules/screening/engine/education.ts` | `detectEducation`                                                                                                                                                                                    | 2 types                                    |
| `src/modules/screening/engine/match.ts`     | `compileTerms`, `findAll`, `snippet`                                                                                                                                                                 | 2 types                                    |
| `src/modules/screening/engine/places.ts`    | `firstKnownPlace`                                                                                                                                                                                    | 2 const                                    |
| `src/modules/screening/engine/score.ts`     | `compile`, `reasonLine`, `score`                                                                                                                                                                     | 2 types                                    |
| `src/modules/screening/engine/types.ts`     | `rankOf`, `emptyCriteria`, `isConfigured`                                                                                                                                                            | 6 const · 13 types                         |
| `src/modules/screening/engine/years.ts`     | `employmentSpans`, `coveredMonths`, `statedYears`, `estimateYears`                                                                                                                                   | 2 types                                    |
| `src/modules/screening/extract/core.ts`     | `detectKind`, `extractFromBuffer`                                                                                                                                                                    | —                                          |
| `src/modules/screening/extract/docx.ts`     | `listEntries`, `wordXmlToText`, `readDocx`                                                                                                                                                           | —                                          |
| `src/modules/screening/extract/pdf.ts`      | `warmPdfReader`, `readPdf`                                                                                                                                                                           | —                                          |
| `src/modules/screening/extract/runner.ts`   | `limitsFromEnv`, `childEnvironment`, `readablePaths`, `childArguments`, `extractInSandbox`                                                                                                           | 1 type                                     |
| `src/modules/screening/extract/sandbox.ts`  | `lockDown`                                                                                                                                                                                           | —                                          |
| `src/modules/screening/extract/text.ts`     | `normaliseText`, `clip`                                                                                                                                                                              | —                                          |
| `src/modules/screening/extract/types.ts`    | —                                                                                                                                                                                                    | `ExtractError` (class) · 2 const · 6 types |
| `src/modules/screening/list.ts`             | `sortFieldOf`, `isScoreSort`, `scoreWhere`, `scoreCursor`, `scoreAfter`                                                                                                                              | 2 const · 2 types                          |
| `src/modules/screening/pipeline.ts`         | `cardScreening`, `pipelineScreening`, `narrowScreening`                                                                                                                                              | 1 const · 3 types                          |
| `src/modules/screening/preview.ts`          | `previewCriteria`                                                                                                                                                                                    | 1 const                                    |
| `src/modules/screening/queue.ts`            | `workQueue`                                                                                                                                                                                          | 1 type                                     |
| `src/modules/screening/runs.ts`             | `scheduleRun`, `serializeRun`, `listRuns`, `getRun`, `startRescore`, `runScoringRun`, `checkEngineVersionsNextSweep`, `sweepScoring`, `startScoringScheduler`, `stopScoringScheduler`                | 1 const · 4 types                          |
| `src/modules/screening/scoring.ts`          | `criteriaInfo`, `decide`, `answerFacts`, `applyOutcomes`, `breakdownOf`, `scoreOne`, `afterScore`, `settleScreeningHooks`, `onApplication`                                                           | 2 const · 7 types                          |
| `src/modules/screening/suggest.ts`          | `suggestFromText`, `suggestForPosting`                                                                                                                                                               | 2 types                                    |
| `src/modules/screening/views.ts`            | `whyNoScore`, `screeningDetail`, `screeningHeadline`, `screeningOverview`                                                                                                                            | 3 types                                    |

_No exports of their own, so not listed:_ `src/modules/screening/extract/child.ts`.

---

## `src/modules/setup`

The first-run wizard, the feature switches and the readiness checklist.

| File                             | Exported functions                                                             | Also              |
| -------------------------------- | ------------------------------------------------------------------------------ | ----------------- |
| `src/modules/setup/checklist.ts` | `checklist`                                                                    | 1 type            |
| `src/modules/setup/router.ts`    | —                                                                              | 1 const           |
| `src/modules/setup/schemas.ts`   | —                                                                              | 5 const · 4 types |
| `src/modules/setup/service.ts`   | `features`, `status`, `wizard`, `update`, `answer`, `complete`, `seedDefaults` | 1 const · 5 types |

**Endpoints — 7**

| Method  | Path                     |
| ------- | ------------------------ |
| `GET`   | `/setup/status`          |
| `GET`   | `/setup/checklist`       |
| `GET`   | `/setup/features`        |
| `PATCH` | `/setup/features`        |
| `GET`   | `/setup/wizard`          |
| `POST`  | `/setup/wizard/answer`   |
| `POST`  | `/setup/wizard/complete` |

---

## `src/modules/shifts`

| File                            | Exported functions                                                                                                                                                                                                                                                                                                                     | Also                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `src/modules/shifts/router.ts`  | —                                                                                                                                                                                                                                                                                                                                      | 1 const             |
| `src/modules/shifts/schemas.ts` | —                                                                                                                                                                                                                                                                                                                                      | 12 const · 12 types |
| `src/modules/shifts/service.ts` | `listShifts`, `createShift`, `updateShift`, `archiveShift`, `listPatterns`, `createPattern`, `updatePattern`, `rota`, `myRota`, `createAssignment`, `removeAssignment`, `bulkAssign`, `requestSwap`, `listSwaps`, `acceptSwap`, `approveSwap`, `declineSwap`, `cancelSwap`, `workingDaysFor`, `rosteredDatesFor`, `workingDaysForMany` | 1 const · 4 types   |

**Endpoints — 18**

| Method   | Path                        |
| -------- | --------------------------- |
| `GET`    | `/shifts/patterns`          |
| `POST`   | `/shifts/patterns`          |
| `PATCH`  | `/shifts/patterns/:id`      |
| `GET`    | `/shifts/rota`              |
| `GET`    | `/shifts/me/rota`           |
| `POST`   | `/shifts/assignments/bulk`  |
| `POST`   | `/shifts/assignments`       |
| `DELETE` | `/shifts/assignments/:id`   |
| `GET`    | `/shifts/swaps`             |
| `POST`   | `/shifts/swaps`             |
| `POST`   | `/shifts/swaps/:id/accept`  |
| `POST`   | `/shifts/swaps/:id/approve` |
| `POST`   | `/shifts/swaps/:id/decline` |
| `POST`   | `/shifts/swaps/:id/cancel`  |
| `GET`    | `/shifts/`                  |
| `POST`   | `/shifts/`                  |
| `PATCH`  | `/shifts/:id`               |
| `DELETE` | `/shifts/:id`               |

---

## `src/modules/signatures`

| File                                    | Exported functions                                                                                                   | Also              |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `src/modules/signatures/certificate.ts` | `certificatePdf`                                                                                                     | 1 type            |
| `src/modules/signatures/router.ts`      | —                                                                                                                    | 1 const           |
| `src/modules/signatures/schemas.ts`     | —                                                                                                                    | 4 const · 3 types |
| `src/modules/signatures/service.ts`     | `sha256Of`, `nameMatches`, `get`, `list`, `mine`, `send`, `document`, `sign`, `decline`, `cancel`, `certificateData` | 4 const · 2 types |

**Endpoints — 9**

| Method | Path                              |
| ------ | --------------------------------- |
| `GET`  | `/signatures/mine`                |
| `GET`  | `/signatures/`                    |
| `POST` | `/signatures/`                    |
| `GET`  | `/signatures/:id`                 |
| `GET`  | `/signatures/:id/document`        |
| `POST` | `/signatures/:id/sign`            |
| `POST` | `/signatures/:id/decline`         |
| `POST` | `/signatures/:id/cancel`          |
| `GET`  | `/signatures/:id/certificate.pdf` |

---

## `src/modules/sms`

| File                                          | Exported functions                                                                                                                      | Also                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `src/modules/sms/boot.ts`                     | `wireSms`                                                                                                                               | 2 types                                   |
| `src/modules/sms/consent.ts`                  | `consentText`, `subscriptionFor`, `optIn`, `optOut`, `maskedNumberOf`                                                                   | 1 const · 3 types                         |
| `src/modules/sms/content.ts`                  | `digestIsEmpty`, `toSmsSafe`, `segmentsFor`, `smsOrganisationName`, `buildDigestBody`, `buildConfirmationBody`, `assertSafeSmsBody`     | `UnsafeSmsContentError` (class) · 3 types |
| `src/modules/sms/digest.ts`                   | `collectDigestSummary`, `digestKey`, `planWeeklyDigests`                                                                                | 1 type                                    |
| `src/modules/sms/inbound.ts`                  | `useInboundAdapter`, `inboundAdapterFor`, `clearInboundAdaptersForTests`, `genericInbound`, `applyInbound`                              | 3 types                                   |
| `src/modules/sms/keywords.ts`                 | `normalizeKeyword`, `isStopKeyword`                                                                                                     | —                                         |
| `src/modules/sms/optout-link.ts`              | `signOptOutToken`, `verifyOptOutToken`, `optOutUrl`, `optOutFooter`                                                                     | 1 type                                    |
| `src/modules/sms/outbox.ts`                   | `drainOutbox`, `enqueueConfirmation`                                                                                                    | 3 const · 2 types                         |
| `src/modules/sms/phone.ts`                    | `normalizeNigerianMobile`, `maskPhone`                                                                                                  | —                                         |
| `src/modules/sms/providers/termii-config.ts`  | `termiiIsConfigured`, `termiiConfig`                                                                                                    | 2 types                                   |
| `src/modules/sms/providers/termii-webhook.ts` | `termiiInbound`                                                                                                                         | —                                         |
| `src/modules/sms/providers/termii.ts`         | `termii`                                                                                                                                | 1 type                                    |
| `src/modules/sms/public-router.ts`            | `webhookLimiter`                                                                                                                        | 2 const                                   |
| `src/modules/sms/router.ts`                   | —                                                                                                                                       | 1 const                                   |
| `src/modules/sms/schedule.ts`                 | `isoWeekKey`, `inSendWindow`, `digestWeek`                                                                                              | 4 const · 1 type                          |
| `src/modules/sms/scheduler.ts`                | `sweepSms`, `startSmsScheduler`, `stopSmsScheduler`                                                                                     | 1 type                                    |
| `src/modules/sms/schemas.ts`                  | —                                                                                                                                       | 3 const · 3 types                         |
| `src/modules/sms/service.ts`                  | `myState`, `optInSelf`, `optOutSelf`, `recordConsentFor`, `optOutFor`, `listSubscriptions`, `status`                                    | 4 types                                   |
| `src/modules/sms/suppression.ts`              | `isSuppressed`, `suppress`, `clearSuppression`, `applyStop`                                                                             | 1 type                                    |
| `src/modules/sms/transport.ts`                | `useSmsTransport`, `currentSmsTransport`, `smsCanSend`, `warnIfNoSmsTransport`, `sendSms`, `resetSmsTransportForTests`, `warnThrottled` | 1 const · 3 types                         |

**Endpoints — 10**

| Method | Path                             |
| ------ | -------------------------------- |
| `POST` | `/sms/webhooks/:provider`        |
| `GET`  | `/sms/o/:token`                  |
| `POST` | `/sms/o/:token`                  |
| `GET`  | `/sms/me`                        |
| `POST` | `/sms/me/opt-in`                 |
| `POST` | `/sms/me/opt-out`                |
| `GET`  | `/sms/status`                    |
| `GET`  | `/sms/subscriptions`             |
| `POST` | `/sms/subscriptions/:id/consent` |
| `POST` | `/sms/subscriptions/:id/opt-out` |

---

## `src/modules/surveys`

Staff surveys: on an anonymous survey a response never records who wrote it, and results are withheld below a minimum number of responses.

| File                             | Exported functions                                                                                                                      | Also              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `src/modules/surveys/router.ts`  | —                                                                                                                                       | 1 const           |
| `src/modules/surveys/schemas.ts` | —                                                                                                                                       | 7 const · 3 types |
| `src/modules/surveys/service.ts` | `requireSurvey`, `list`, `get`, `createSurvey`, `updateSurvey`, `setQuestions`, `invite`, `open`, `close`, `respond`, `results`, `mine` | 1 type            |

**Endpoints — 11**

| Method  | Path                       |
| ------- | -------------------------- |
| `GET`   | `/surveys/mine`            |
| `GET`   | `/surveys/`                |
| `GET`   | `/surveys/:id`             |
| `POST`  | `/surveys/`                |
| `PATCH` | `/surveys/:id`             |
| `PUT`   | `/surveys/:id/questions`   |
| `POST`  | `/surveys/:id/invitations` |
| `POST`  | `/surveys/:id/open`        |
| `POST`  | `/surveys/:id/close`       |
| `POST`  | `/surveys/:id/responses`   |
| `GET`   | `/surveys/:id/results`     |

---

## `src/modules/teams`

| File                           | Exported functions                                                                                        | Also              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- | ----------------- |
| `src/modules/teams/router.ts`  | —                                                                                                         | 1 const           |
| `src/modules/teams/schemas.ts` | —                                                                                                         | 5 const · 5 types |
| `src/modules/teams/service.ts` | `list`, `get`, `teamsOfEmployee`, `create`, `update`, `addMembers`, `removeMembers`, `archive`, `restore` | 1 type            |

**Endpoints — 8**

| Method   | Path                        |
| -------- | --------------------------- |
| `GET`    | `/teams/`                   |
| `GET`    | `/teams/:id`                |
| `POST`   | `/teams/`                   |
| `PATCH`  | `/teams/:id`                |
| `DELETE` | `/teams/:id`                |
| `POST`   | `/teams/:id/restore`        |
| `POST`   | `/teams/:id/members`        |
| `POST`   | `/teams/:id/members/remove` |

---

## `src/modules/webhooks`

| File                                | Exported functions                                                                                                      | Also              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `src/modules/webhooks/events.ts`    | `isWebhookEvent`, `definitionOf`, `unwiredAmong`                                                                        | 4 const · 3 types |
| `src/modules/webhooks/queue.ts`     | `queueMode`, `drain`, `enqueue`, `startWebhookWorker`, `deliveryStatus`                                                 | 1 type            |
| `src/modules/webhooks/router.ts`    | —                                                                                                                       | 1 const           |
| `src/modules/webhooks/runner.ts`    | `runDelivery`, `nextRetryAt`, `sweep`, `schedulerRunning`, `startWebhookScheduler`, `stopWebhookScheduler`              | 3 const · 2 types |
| `src/modules/webhooks/schemas.ts`   | —                                                                                                                       | 5 const · 5 types |
| `src/modules/webhooks/service.ts`   | `list`, `get`, `deliveries`, `create`, `update`, `rotateSecret`, `remove`, `sendTest`, `retry`, `catalogue`, `dispatch` | 5 types           |
| `src/modules/webhooks/signature.ts` | `generateSecret`, `timestampNow`, `signedStringFor`, `digestFor`, `sign`, `verify`, `maskSecret`                        | 7 const · 1 type  |
| `src/modules/webhooks/transport.ts` | `post`, `assertPostable`, `redact`                                                                                      | 1 const · 2 types |

**Endpoints — 10**

| Method   | Path                             |
| -------- | -------------------------------- |
| `GET`    | `/webhooks/events`               |
| `POST`   | `/webhooks/deliveries/:id/retry` |
| `GET`    | `/webhooks/`                     |
| `POST`   | `/webhooks/`                     |
| `GET`    | `/webhooks/:id`                  |
| `PATCH`  | `/webhooks/:id`                  |
| `DELETE` | `/webhooks/:id`                  |
| `POST`   | `/webhooks/:id/test`             |
| `GET`    | `/webhooks/:id/deliveries`       |
| `POST`   | `/webhooks/:id/rotate-secret`    |

---

## `src/modules/wellness`

| File                                     | Exported functions                                                                                                                                                                              | Also                                     |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `src/modules/wellness/access.ts`         | `actorOf`, `requireEmployee`, `canSeeEmployerResults`, `wellnessIsOn`, `requireWellnessOn`                                                                                                      | `ModuleOffError` (class) · 1 type        |
| `src/modules/wellness/boards.ts`         | `participantBoard`, `employerResults`                                                                                                                                                           | —                                        |
| `src/modules/wellness/challenges.ts`     | `statusOf`, `serializeChallenge`, `requireChallenge`, `createChallenge`, `patchChallenge`, `cancelChallenge`, `listChallenges`, `myTeams`, `challengeDetail`, `joinChallenge`, `leaveChallenge` | 2 const · 1 type                         |
| `src/modules/wellness/consent.ts`        | `joinStatement`, `hasConsent`, `requireConsent`, `requireTracking`, `myConsents`, `grantConsent`, `withdrawConsent`                                                                             | `ConsentRequiredError` (class) · 1 const |
| `src/modules/wellness/dates.ts`          | `todayOf`, `addDays`, `dayLabel`, `daysBetween`, `laterOf`, `earlierOf`                                                                                                                         | 1 const                                  |
| `src/modules/wellness/device.ts`         | `ingestDeviceDays`, `deviceDays`, `eraseDeviceDays`                                                                                                                                             | 1 type                                   |
| `src/modules/wellness/logs.ts`           | `effectiveDailyValues`, `addEntry`, `deleteEntry`, `eraseAll`, `listEntries`, `summary`, `dailyRowsFor`                                                                                         | 3 const · 2 types                        |
| `src/modules/wellness/privacy.ts`        | `effectiveFloor`, `privacyFloorOf`, `aboveFloor`, `withheldNote`, `contributionNote`                                                                                                            | 3 const · 2 types                        |
| `src/modules/wellness/recognition.ts`    | `giveRecognition`, `feed`, `mineList`, `removeRecognition`                                                                                                                                      | 1 const                                  |
| `src/modules/wellness/reminder-sweep.ts` | `dueAt`, `messageFor`, `isAtWork`, `sweepWellnessReminders`, `startWellnessReminderScheduler`, `stopWellnessReminderScheduler`                                                                  | 1 const · 5 types                        |
| `src/modules/wellness/reminders.ts`      | `organisationReminders`, `myReminders`, `setOrganisationPolicy`, `setMyPolicy`, `clearMyPolicy`                                                                                                 | 1 type                                   |
| `src/modules/wellness/router.ts`         | —                                                                                                                                                                                               | 1 const                                  |
| `src/modules/wellness/schemas.ts`        | —                                                                                                                                                                                               | 20 const · 8 types                       |
| `src/modules/wellness/settings.ts`       | `readSettings`, `updateSettings`                                                                                                                                                                | —                                        |

**Endpoints — 30**

| Method   | Path                                      |
| -------- | ----------------------------------------- |
| `POST`   | `/wellness/me/consents/:purpose/withdraw` |
| `DELETE` | `/wellness/me/logs`                       |
| `DELETE` | `/wellness/me/logs/:id`                   |
| `DELETE` | `/wellness/me/device-days`                |
| `POST`   | `/wellness/challenges/:id/leave`          |
| `GET`    | `/wellness/settings`                      |
| `PATCH`  | `/wellness/settings`                      |
| `PUT`    | `/wellness/reminders/policy`              |
| `GET`    | `/wellness/me/reminders`                  |
| `PUT`    | `/wellness/me/reminders`                  |
| `DELETE` | `/wellness/me/reminders`                  |
| `GET`    | `/wellness/me/consents`                   |
| `PUT`    | `/wellness/me/consents/:purpose`          |
| `GET`    | `/wellness/me/logs`                       |
| `GET`    | `/wellness/me/summary`                    |
| `POST`   | `/wellness/me/logs`                       |
| `PUT`    | `/wellness/me/device-days`                |
| `GET`    | `/wellness/me/device-days`                |
| `GET`    | `/wellness/challenges`                    |
| `POST`   | `/wellness/challenges`                    |
| `GET`    | `/wellness/challenges/:id`                |
| `PATCH`  | `/wellness/challenges/:id`                |
| `POST`   | `/wellness/challenges/:id/cancel`         |
| `POST`   | `/wellness/challenges/:id/join`           |
| `GET`    | `/wellness/challenges/:id/board`          |
| `GET`    | `/wellness/challenges/:id/results`        |
| `GET`    | `/wellness/recognitions`                  |
| `GET`    | `/wellness/recognitions/mine`             |
| `POST`   | `/wellness/recognitions`                  |
| `DELETE` | `/wellness/recognitions/:id`              |

---

## `src/modules/work-trackers`

Connections to Jira, Asana, ClickUp, Monday.com and Trello that pull in each person's tickets as evidence and file a finished ticket as an ungraded weekly task for a person to grade.

| File                                             | Exported functions                                                                                                                                                                                                                                                                                                                             | Also                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `src/modules/work-trackers/providers/asana.ts`   | `asanaToProviderTask`                                                                                                                                                                                                                                                                                                                          | 1 const                                                |
| `src/modules/work-trackers/providers/clickup.ts` | `clickupToProviderTask`                                                                                                                                                                                                                                                                                                                        | 1 const                                                |
| `src/modules/work-trackers/providers/http.ts`    | `callJson`, `callToken`, `form`, `json`, `fromMillis`, `fromDay`, `fromIso`                                                                                                                                                                                                                                                                    | 1 const                                                |
| `src/modules/work-trackers/providers/index.ts`   | `providerBySlug`, `adapterFor`                                                                                                                                                                                                                                                                                                                 | 1 const                                                |
| `src/modules/work-trackers/providers/jira.ts`    | `toProviderTask`                                                                                                                                                                                                                                                                                                                               | 1 const                                                |
| `src/modules/work-trackers/providers/monday.ts`  | `mondayToProviderTask`                                                                                                                                                                                                                                                                                                                         | 1 const                                                |
| `src/modules/work-trackers/providers/trello.ts`  | `createdFromId`, `trelloToProviderTask`                                                                                                                                                                                                                                                                                                        | 1 const                                                |
| `src/modules/work-trackers/providers/types.ts`   | —                                                                                                                                                                                                                                                                                                                                              | `ProviderAuthError`, `ProviderError` (class) · 6 types |
| `src/modules/work-trackers/router.ts`            | —                                                                                                                                                                                                                                                                                                                                              | 1 const                                                |
| `src/modules/work-trackers/scheduler.ts`         | `sweepWorkTrackers`, `startWorkTrackerScheduler`, `stopWorkTrackerScheduler`                                                                                                                                                                                                                                                                   | —                                                      |
| `src/modules/work-trackers/schemas.ts`           | —                                                                                                                                                                                                                                                                                                                                              | 16 const · 5 types                                     |
| `src/modules/work-trackers/service.ts`           | `listProviders`, `startConnect`, `completeConnect`, `completeTokenConnect`, `listConnections`, `getConnection`, `updateConnection`, `listRemoteProjects`, `disconnect`, `triggerSync`, `listRuns`, `listIdentities`, `updateIdentity`, `listRules`, `createRule`, `deleteRule`, `workEvidence`, `evidenceRange`, `linkTask`, `confirmImported` | 1 const                                                |
| `src/modules/work-trackers/sync.ts`              | `requireSecret`, `sealTokens`, `contextFor`, `ownObjectiveFor`, `describeTask`, `inOpenWeek`, `linkEvidence`, `syncConnection`                                                                                                                                                                                                                 | 1 const · 1 type                                       |

**Endpoints — 19**

| Method   | Path                                                    |
| -------- | ------------------------------------------------------- |
| `GET`    | `/work-trackers/oauth/callback`                         |
| `POST`   | `/work-trackers/oauth/token`                            |
| `GET`    | `/work-trackers/evidence/:employeeId`                   |
| `POST`   | `/work-trackers/tasks/:id/link`                         |
| `POST`   | `/work-trackers/evidence/confirm`                       |
| `GET`    | `/work-trackers/providers`                              |
| `POST`   | `/work-trackers/providers/:provider/connect`            |
| `GET`    | `/work-trackers/connections`                            |
| `GET`    | `/work-trackers/connections/:id`                        |
| `PATCH`  | `/work-trackers/connections/:id`                        |
| `GET`    | `/work-trackers/connections/:id/projects`               |
| `DELETE` | `/work-trackers/connections/:id`                        |
| `POST`   | `/work-trackers/connections/:id/sync`                   |
| `GET`    | `/work-trackers/connections/:id/runs`                   |
| `GET`    | `/work-trackers/connections/:id/identities`             |
| `PATCH`  | `/work-trackers/connections/:id/identities/:identityId` |
| `GET`    | `/work-trackers/connections/:id/rules`                  |
| `POST`   | `/work-trackers/connections/:id/rules`                  |
| `DELETE` | `/work-trackers/connections/:id/rules/:ruleId`          |

---

## Shared — everything outside `src/modules`

Database and tenancy, middleware, config, helpers, scripts and the server entry point.

| File                                | Exported functions                                                                                                                                                           | Also                                                                                                                                                                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app.ts`                        | `createApp`                                                                                                                                                                  | —                                                                                                                                                                                                                          |
| `src/config/env.ts`                 | `webUrlEnvironmentProblem`, `servesCustomers`                                                                                                                                | 2 const · 1 type                                                                                                                                                                                                           |
| `src/db/client.ts`                  | `disconnect`, `ping`                                                                                                                                                         | 1 const · 1 type                                                                                                                                                                                                           |
| `src/db/job-access.ts`              | `hiddenJobsFor`, `canSeeJob`                                                                                                                                                 | 1 const · 2 types                                                                                                                                                                                                          |
| `src/db/tenant.ts`                  | `forOrganization`                                                                                                                                                            | 2 const · 1 type                                                                                                                                                                                                           |
| `src/lib/app-url.ts`                | `webUrlIsPerTenant`, `appBaseUrl`, `appUrl`, `subdomainSlug`                                                                                                                 | —                                                                                                                                                                                                                          |
| `src/lib/async.ts`                  | `handler`                                                                                                                                                                    | —                                                                                                                                                                                                                          |
| `src/lib/audit.ts`                  | `record`, `auditor`, `diffOf`                                                                                                                                                | 1 const · 1 type                                                                                                                                                                                                           |
| `src/lib/batch.ts`                  | `chunked`, `limiter`                                                                                                                                                         | —                                                                                                                                                                                                                          |
| `src/lib/client-ip.ts`              | `clientIp`, `clientIpKey`                                                                                                                                                    | 2 const                                                                                                                                                                                                                    |
| `src/lib/crypto.ts`                 | `sealString`, `openString`, `signState`, `verifyState`                                                                                                                       | —                                                                                                                                                                                                                          |
| `src/lib/csv.ts`                    | `csvCell`, `csvNaira`, `csvSheet`, `safeExportFilename`                                                                                                                      | —                                                                                                                                                                                                                          |
| `src/lib/cursor.ts`                 | `encodeCursor`, `decodeCursor`, `afterCursor`, `afterCursorOn`                                                                                                               | 1 const · 1 type                                                                                                                                                                                                           |
| `src/lib/errors.ts`                 | `isAppError`                                                                                                                                                                 | `AppError`, `BadRequestError`, `ValidationFailedError`, `UnauthorizedError`, `ForbiddenError`, `PaymentRequiredError`, `NotFoundError`, `ConflictError`, `UnprocessableError`, `RateLimitedError`, `InternalError` (class) |
| `src/lib/expo-push.ts`              | `sendExpoPush`                                                                                                                                                               | 2 types                                                                                                                                                                                                                    |
| `src/lib/failure-cause.ts`          | `failureCause`                                                                                                                                                               | —                                                                                                                                                                                                                          |
| `src/lib/http.ts`                   | `ok`, `created`, `noContent`, `page`, `paging`, `orderBy`, `toIsoDate`, `withinRange`, `pathParam`, `compact`                                                                | 4 const · 3 types                                                                                                                                                                                                          |
| `src/lib/logger.ts`                 | —                                                                                                                                                                            | 1 const                                                                                                                                                                                                                    |
| `src/lib/mail-template.ts`          | `reachableFromAnInbox`, `renderEmail`                                                                                                                                        | 3 types                                                                                                                                                                                                                    |
| `src/lib/mail.ts`                   | `senderAddress`, `cleanDisplayName`, `senderFor`, `canCarryReplyTo`, `mailIsConfigured`, `sendEmail`                                                                         | 3 types                                                                                                                                                                                                                    |
| `src/lib/money.ts`                  | `toKobo`, `grossKoboOrNull`, `toNaira`, `rateOf`, `formatNaira`                                                                                                              | —                                                                                                                                                                                                                          |
| `src/lib/pdf.ts`                    | `money`, `widthOf`, `wrap`, `renderPdf`                                                                                                                                      | `Page` (class) · 2 const · 2 types                                                                                                                                                                                         |
| `src/lib/rate-limit.ts`             | `memoryStore`, `redisStore`, `useCounterStore`, `counterStore`                                                                                                               | 3 types                                                                                                                                                                                                                    |
| `src/lib/rich-text.ts`              | `decodeEntities`, `safeHref`, `sanitizeRichText`, `plainToRichText`, `richTextToPlain`                                                                                       | 1 const                                                                                                                                                                                                                    |
| `src/lib/storage.ts`                | `decodeInlineFile`, `storageConfigured`, `keyFor`, `presignWrite`, `presignRead`, `objectExists`, `headObject`, `readObject`, `listObjects`, `removeObject`, `uploadRefusal` | `ObjectTooLargeError` (class) · 4 const · 5 types                                                                                                                                                                          |
| `src/lib/timezone.ts`               | `zonedDay`, `todayIn`, `zonedInstant`, `hhmmIn`, `isValidTimezone`, `resolveTimezone`                                                                                        | 1 const                                                                                                                                                                                                                    |
| `src/lib/web-push.ts`               | `encryptPayload`, `vapidHeader`, `generateVapidKeys`, `postPush`, `audienceOf`                                                                                               | 1 const · 3 types                                                                                                                                                                                                          |
| `src/middleware/auth.ts`            | `authenticate`, `requireAuth`, `requireDb`, `requireOpenDb`, `requirePermissions`, `requireAnyPermission`, `holds`, `requirePermissionOrSelf`                                | 1 type                                                                                                                                                                                                                     |
| `src/middleware/error.ts`           | `notFoundHandler`, `errorHandler`                                                                                                                                            | —                                                                                                                                                                                                                          |
| `src/middleware/request-context.ts` | `requestId`                                                                                                                                                                  | 1 const                                                                                                                                                                                                                    |
| `src/middleware/step-up.ts`         | `requireStepUp`                                                                                                                                                              | —                                                                                                                                                                                                                          |
| `src/middleware/validate.ts`        | `validate`                                                                                                                                                                   | —                                                                                                                                                                                                                          |

_No exports of their own, so not listed:_ `src/jobs/worker.ts`, `src/server.ts`.
