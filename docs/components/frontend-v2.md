# Components and functions — ApproveHR frontend v2

_Repo:_ `approvehr-frontend-v2` · _Generated from_ `src/**/*.{ts,tsx}` (tests and type declarations excluded)

Every exported symbol, grouped by what it is for. **Components** render; **hooks** start with `use` and
hold state or data; **functions** are plain callables. Constants and types are counted rather than listed —
there are too many to be useful as a list, and they are always in the file named beside the count.

| Group | Files | Components | Hooks | Functions |
|---|---:|---:|---:|---:|
| [Design system — `src/components/ui`](#design-system-src-components-ui) | 26 | 66 | 5 | 4 |
| [App chrome — `src/components/portal`](#app-chrome-src-components-portal) | 30 | 32 | 1 | 4 |
| [Marketing components — `src/components/marketing`](#marketing-components-src-components-marketing) | 11 | 30 | 0 | 0 |
| [Module components — `src/components/*`](#module-components-src-components) | 22 | 33 | 0 | 7 |
| [API wrappers — `src/lib/api`](#api-wrappers-src-lib-api) | 48 | 0 | 0 | 161 |
| [Data hooks — `src/lib/store`](#data-hooks-src-lib-store) | 66 | 0 | 257 | 64 |
| [Seed data — `src/lib/mock`](#seed-data-src-lib-mock) | 9 | 0 | 0 | 19 |
| [Domain helpers — `src/lib/*`](#domain-helpers-src-lib) | 53 | 0 | 11 | 172 |
| [Standalone hooks — `src/hooks`](#standalone-hooks-src-hooks) | 2 | 0 | 2 | 1 |
| [Screens — `/dashboard`](#screens-dashboard) | 10 | 9 | 0 | 4 |
| [Screens — `/people`](#screens-people) | 104 | 105 | 0 | 15 |
| [Screens — `/payroll`](#screens-payroll) | 55 | 61 | 0 | 7 |
| [Screens — `/performance`](#screens-performance) | 49 | 59 | 0 | 4 |
| [Screens — `/hiring`](#screens-hiring) | 25 | 27 | 0 | 5 |
| [Screens — `/help`](#screens-help) | 9 | 10 | 0 | 0 |
| [Screens — `/reports`](#screens-reports) | 4 | 4 | 0 | 0 |
| [Screens — `/settings`](#screens-settings) | 79 | 81 | 0 | 3 |
| [Screens — `/approvals`](#screens-approvals) | 2 | 2 | 0 | 0 |
| [Screens — `/assistant`](#screens-assistant) | 2 | 2 | 0 | 0 |
| [Screens — the rest of the signed-in app](#screens-the-rest-of-the-signed-in-app) | 11 | 10 | 0 | 1 |
| [Screens — public site, auth and setup](#screens-public-site-auth-and-setup) | 41 | 46 | 0 | 6 |
| [Everything else](#everything-else) | 1 | 0 | 0 | 1 |
| **Total** | **659** | **577** | **276** | **478** |

---

## Design system — `src/components/ui`

The signed-in app's component library. Import from the barrel `@/components/ui`; check `index.ts` for the exported surface before assuming a prop exists.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/components/ui/badge.tsx` | `Badge`, `Tag`, `TierBadge` | — | — | 2 types |
| `src/components/ui/button.tsx` | `ButtonLink`, `IconButton` | — | — | 1 const · 5 types |
| `src/components/ui/card.tsx` | `Card`, `CardHeader`, `CardBody`, `CardFooter`, `LinkCard`, `Stat`, `Callout` | — | — | — |
| `src/components/ui/chart.tsx` | `AreaChart`, `BarChart`, `ColumnChart`, `StackedBar`, `DonutChart`, `Sparkline`, `FunnelChart` | — | `missingCount` | 1 const · 2 types |
| `src/components/ui/choice.tsx` | `RadioCard` | — | — | 3 const · 3 types |
| `src/components/ui/disclosure.tsx` | `Disclosure` | — | — | — |
| `src/components/ui/drag-into.tsx` | `DragGhost` | `useDragInto` | `scrollParent` | 1 type |
| `src/components/ui/feedback.tsx` | `EmptyState`, `Skeleton`, `SkeletonText`, `Spinner`, `ThinkingState` | — | — | — |
| `src/components/ui/field.tsx` | `Field`, `FieldSet` | `useFieldContext`, `useFieldControl` | — | 1 type |
| `src/components/ui/file-field.tsx` | `FileField` | — | — | — |
| `src/components/ui/filter-bar.tsx` | `FilterBar` | — | — | 1 type |
| `src/components/ui/input.tsx` | — | — | — | 3 const · 2 types |
| `src/components/ui/misc.tsx` | `Avatar`, `Timeline`, `FileDrop`, `DescriptionList`, `CheckList` | — | — | 2 types |
| `src/components/ui/modal.tsx` | `Modal`, `Drawer`, `DrawerSection`, `ConfirmDialog` | — | — | 2 types |
| `src/components/ui/money-format.ts` | — | — | `formatMoney` | 1 const · 1 type |
| `src/components/ui/money-privacy-toggle.tsx` | `MoneyPrivacyToggle` | — | — | — |
| `src/components/ui/money.tsx` | `Money`, `MoneyHidden` | — | — | — |
| `src/components/ui/pagination.tsx` | `Pagination` | — | — | — |
| `src/components/ui/picker.tsx` | `Picker` | — | — | 2 types |
| `src/components/ui/progress.tsx` | `ProgressMeter`, `ScoreRing`, `FactorBars` | — | — | — |
| `src/components/ui/sortable.tsx` | `SortableHandle`, `Sortable` | — | — | 2 types |
| `src/components/ui/stepper.tsx` | `StepIndicator`, `StepperModal`, `StepHeader` | `useStepper` | — | 2 types |
| `src/components/ui/table.tsx` | `TableWrap`, `THead`, `TH`, `SortableTH`, `TBody`, `TR`, `TD`, `TDPrimary` | — | `rowClick` | — |
| `src/components/ui/tabs.tsx` | `Tabs`, `LinkTabs`, `SegmentedControl`, `Accordion` | — | — | 1 type |
| `src/components/ui/toast.tsx` | `ToastProvider` | `useToast` | — | — |

---

## App chrome — `src/components/portal`

The shell every signed-in screen sits inside: sidebar, page header, sign-in gate, the shared failure and export controls.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/components/portal/ask-panel.tsx` | `AskPanel` | — | — | — |
| `src/components/portal/assistant-chat.tsx` | `AssistantChat` | — | — | — |
| `src/components/portal/assistant-orb.tsx` | `AssistantOrb` | — | — | — |
| `src/components/portal/auth-gate.tsx` | `AuthGate` | — | — | — |
| `src/components/portal/auth-shell.tsx` | `AuthShell` | — | — | — |
| `src/components/portal/auth-visual.tsx` | `AuthVisual` | — | — | — |
| `src/components/portal/bulk-invite.tsx` | `BulkInviteButton` | — | — | — |
| `src/components/portal/command-palette.tsx` | `CommandPalette` | — | — | — |
| `src/components/portal/decline-dialog.tsx` | `DeclineDialog` | — | — | — |
| `src/components/portal/delivery-note.tsx` | `DeliveryNote` | — | — | — |
| `src/components/portal/error-reporting.tsx` | `ErrorReporting` | — | — | — |
| `src/components/portal/export-button.tsx` | `ExportButton` | — | — | — |
| `src/components/portal/feature-off-line.tsx` | `FeatureOffLine` | — | — | — |
| `src/components/portal/install-prompt.tsx` | `InstallPrompt` | — | — | — |
| `src/components/portal/invite-link.tsx` | `InviteLinkButton` | — | — | — |
| `src/components/portal/load-failure.tsx` | `LoadFailure` | — | `failureMessage` | 1 type |
| `src/components/portal/my-clock-card.tsx` | `MyClockCard` | — | — | — |
| `src/components/portal/nav.tsx` | — | — | `visibleNav` | 2 const · 5 types |
| `src/components/portal/notice-line.tsx` | `NoticeLine` | — | — | 1 const |
| `src/components/portal/password-field.tsx` | `PasswordField` | — | — | — |
| `src/components/portal/role-badge.tsx` | `RoleBadge`, `SessionRoleBadge` | — | — | — |
| `src/components/portal/service-worker.tsx` | `ServiceWorker` | — | — | — |
| `src/components/portal/setup-gate.tsx` | `SetupGate` | — | — | — |
| `src/components/portal/shell.tsx` | `AppShell`, `PageHeader`, `PageBody`, `ComingSoon` | — | — | — |
| `src/components/portal/step-up.tsx` | — | `useStepUp` | — | — |
| `src/components/portal/theme-effect.tsx` | `ThemeEffect` | — | — | — |
| `src/components/portal/two-factor-step.tsx` | `TwoFactorStep` | — | — | — |
| `src/components/portal/verification-banner.tsx` | `VerificationBanner` | — | — | — |
| `src/components/portal/tour/guided-tour.tsx` | `GuidedTour` | — | `openTour` | — |
| `src/components/portal/tour/spotlight.tsx` | `Spotlight` | — | `findTarget` | — |

---

## Marketing components — `src/components/marketing`

A deliberately separate visual language for the public site. Do not cross-import between this and the design system above.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/components/marketing/chrome.tsx` | `AnnouncementBar`, `MarketingNav`, `MarketingFooter` | — | — | — |
| `src/components/marketing/legal.tsx` | `LegalDocument` | — | — | — |
| `src/components/marketing/mockups.tsx` | `Bar`, `Dot`, `PayrollMockup`, `PipelineMockup`, `PayrollCardMockup`, `LeaveMockup`, `RecordMockup`, `ReviewMockup`, `DeskMockup`, `StatutoryMockup` | — | — | — |
| `src/components/marketing/module-mockups.tsx` | — | — | — | 1 const |
| `src/components/marketing/motion.tsx` | `Reveal`, `Marquee`, `CountUp` | — | — | — |
| `src/components/marketing/payroll-figures.tsx` | `PayrollTotalFigure`, `PayrollRowFigures` | — | — | — |
| `src/components/marketing/pill.tsx` | `Pill`, `PillButton`, `LearnMore` | — | — | — |
| `src/components/marketing/platform-overview.tsx` | `PlatformOverview` | — | — | — |
| `src/components/marketing/sections.tsx` | `SectionHeading`, `ModuleCard`, `ModuleGrid`, `ProofRow` | — | — | — |
| `src/components/marketing/social-proof.tsx` | `ClientLogos`, `Testimonials` | — | — | 1 const |
| `src/components/marketing/status-page.tsx` | `StatusPage` | — | — | — |

---

## Module components — `src/components/*`

Shared pieces owned by one module but used from more than one screen.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/components/brand/logo.tsx` | `LogoMark`, `Logo` | — | — | — |
| `src/components/people/bulk-assign-bar.tsx` | `BulkAssignBar` | — | — | — |
| `src/components/people/editable-section.tsx` | `EditableSection` | — | — | 2 types |
| `src/components/people/missing-details-dialog.tsx` | `MissingDetailsDialog` | — | — | — |
| `src/components/performance/language-check.tsx` | `LanguageCheck` | — | — | — |
| `src/components/performance/suggestions.tsx` | `SuggestButton`, `SuggestionPanel` | — | — | — |
| `src/components/payroll/exclude-dialog.tsx` | `ExcludeFromPayrollDialog` | — | — | — |
| `src/components/payroll/payslip-document.tsx` | `PayslipDocument` | — | `carriedForwardKobo`, `reliefLine`, `overtimeWorking`, `notOperated` | 3 types |
| `src/components/payroll/quote-workings.tsx` | `QuoteWorkings` | — | — | — |
| `src/components/payroll/record-paid-dialog.tsx` | `RecordPaidDialog` | — | — | — |
| `src/components/payroll/run-panels.tsx` | `SourceBadge`, `RunStatusBadge`, `ExceptionList`, `ExcludedList`, `DiscrepancyPanel`, `TotalsPanel`, `TotalRow`, `ApprovalConsequences` | — | — | — |
| `src/components/payroll/tax-bands.tsx` | `TaxBands` | — | — | — |
| `src/components/payments/account-verification.tsx` | `AccountVerificationHint` | — | — | — |
| `src/components/imports/check-report.tsx` | `CheckReport` | — | — | — |
| `src/components/imports/import-flow.tsx` | `ImportFlow` | — | — | — |
| `src/components/imports/import-result.tsx` | `ImportOutcome` | — | `confirmLabel` | — |
| `src/components/imports/match-columns.tsx` | `MatchColumns` | — | — | — |
| `src/components/hiring/candidate-panel.tsx` | `CandidatePanel` | — | — | — |
| `src/components/hiring/pipeline-board.tsx` | `PipelineBoard`, `StageStrip` | — | — | — |
| `src/components/hiring/screening-dialogs.tsx` | `ScreenInDialog`, `DeclineDialog` | — | — | — |
| `src/components/hiring/source-badge.tsx` | `SourceBadge` | — | — | — |
| `src/components/hiring/stage-pill.tsx` | `StagePill` | — | `stageLabel`, `stageTone` | — |

---

## API wrappers — `src/lib/api`

One typed wrapper per endpoint, plus the kobo-to-naira boundary and the shared error classifier. Nothing here renders.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/lib/api/account.ts` | — | — | `passwordRules`, `passwordAccepted` | 2 const · 9 types |
| `src/lib/api/advances.ts` | — | — | — | 2 const · 5 types |
| `src/lib/api/ai.ts` | — | — | `assistantStatus`, `suggestObjectives`, `suggestTaskSummary`, `suggestDevelopment`, `draftPeriodGoals`, `draftPeriodQuestions`, `ask`, `chat`, `assistantActions`, `runAssistantAction` | 2 const · 13 types |
| `src/lib/api/announcements.ts` | — | — | `audienceLabel` | 3 const · 8 types |
| `src/lib/api/approvals.ts` | — | — | `naira`, `deadlineLabel`, `isPastDeadline`, `isDecidableHere`, `realScreenFor` | 1 const · 4 types |
| `src/lib/api/assets.ts` | — | — | `naira`, `kobo` | 1 const · 26 types |
| `src/lib/api/attendance.ts` | — | — | `geofenceRefusal` | 5 const · 31 types |
| `src/lib/api/audit.ts` | — | — | `isQueryableEntityType`, `isUuid` | 2 const · 12 types |
| `src/lib/api/benefits.ts` | — | — | — | 1 const · 6 types |
| `src/lib/api/careers.ts` | — | — | `naira`, `kobo`, `careersPath`, `careersUrl` | 3 const · 23 types |
| `src/lib/api/client.ts` | — | — | `onAuthChange`, `buildUrl`, `request`, `requestPaged`, `ping` | `ApiError`, `SessionExpiredError` (class) · 2 const · 3 types |
| `src/lib/api/conduct.ts` | — | — | — | 1 const · 23 types |
| `src/lib/api/documents.ts` | — | — | — | 3 const · 12 types |
| `src/lib/api/download.ts` | — | — | `filenameFrom`, `fetchFile`, `fetchBinary`, `downloadBlob` | 2 types |
| `src/lib/api/endpoints.ts` | — | — | `toNaira`, `toKobo`, `employeeQuery`, `toEmployee` | 7 const · 20 types |
| `src/lib/api/exports.ts` | — | — | `staffCsv`, `payslipsCsv`, `attendanceCsv`, `offerLetter`, `payslipPdf` | — |
| `src/lib/api/failure.ts` | — | — | `asApiError`, `kindOf`, `serverSentence`, `retryCouldHelp` | 1 type |
| `src/lib/api/grades.ts` | — | — | `naira`, `kobo` | 1 const · 15 types |
| `src/lib/api/helpdesk.ts` | — | — | `formatWorkingMinutes`, `responseTargetLine`, `ticketClock` | 2 const · 19 types |
| `src/lib/api/hiring.ts` | — | — | `toRoleRow`, `toNumbers`, `queueBars`, `toScreeningRow`, `toAdvanceBody`, `toAdvertBody`, `toApplicantRecord`, `toApplicantRecordFromRow`, `mergeApplicantHistory`, `offerBand` | 2 const · 8 types |
| `src/lib/api/imports.ts` | — | — | — | 1 const · 19 types |
| `src/lib/api/insights.ts` | — | — | `naira`, `employmentTypeLabel` | 2 const · 4 types |
| `src/lib/api/invites.ts` | — | — | — | 1 const · 8 types |
| `src/lib/api/knowledge.ts` | — | — | — | 1 const · 20 types |
| `src/lib/api/leave.ts` | — | — | `daysLabel` | 4 const · 15 types |
| `src/lib/api/loans.ts` | — | — | `naira`, `kobo` | 1 const · 12 types |
| `src/lib/api/notifications.ts` | — | — | — | 1 const · 3 types |
| `src/lib/api/offboarding.ts` | — | — | `formatKobo`, `ownerLabel` | 7 const · 19 types |
| `src/lib/api/onboarding.ts` | — | — | `ownerLabel` | 1 const · 12 types |
| `src/lib/api/one-on-ones.ts` | — | — | — | 4 const · 9 types |
| `src/lib/api/overtime.ts` | — | — | `naira`, `hoursLabel`, `spokenHours`, `monthLabel`, `dayLabel`, `periodOf`, `periodRange`, `recentPeriods`, `multiplierWords` | 3 const · 3 types |
| `src/lib/api/pay-components.ts` | — | — | `naira`, `kobo`, `ratePercent`, `rateFraction` | 1 const · 26 types |
| `src/lib/api/payments.ts` | — | — | `availableFigure`, `paymentOutcome`, `naira`, `kobo`, `koboFromDecimalString`, `nairaCell` | 2 const · 36 types |
| `src/lib/api/payroll.ts` | — | — | `koboFromDecimal`, `naira`, `formatKobo`, `periodKey`, `periodLabel`, `longDate`, `wasDeducted`, `overtimeOn`, `sheetProblems`, `headcountLabel`, `paidPeopleLabel`, `payslipCountLabel`, `excludedNote`, `shortNoticeFor`, `fixFor` | 4 const · 54 types |
| `src/lib/api/performance.ts` | — | — | `groupExceptionsByCode`, `potentialReasonProblem`, `ratingWords`, `ratingWordsFrom`, `parseMeasure`, `formatMeasure`, `dayLabel`, `dayOf`, `quarterLabel`, `currentQuarter`, `weightLabel`, `scoreLabel`, `changeLabel`, `scoringWeightProblem`, `evenWeights`, `weightProblem`, `periodInPlay` | 12 const · 96 types |
| `src/lib/api/permissions.ts` | — | — | — | 1 const · 16 types |
| `src/lib/api/push.ts` | — | — | `applicationServerKey`, `toBase64Url` | 1 const · 2 types |
| `src/lib/api/recruitment.ts` | — | — | `naira`, `kobo` | 4 const · 44 types |
| `src/lib/api/reimbursements.ts` | — | — | `policyBreach`, `naira`, `kobo` | 1 const · 12 types |
| `src/lib/api/reports.ts` | — | — | `totalNote` | 1 const · 9 types |
| `src/lib/api/self.ts` | — | — | — | 1 const |
| `src/lib/api/setup.ts` | — | — | — | 8 const · 18 types |
| `src/lib/api/shifts.ts` | — | — | `parseDay`, `toIsoDay`, `addDays`, `daysBetween`, `eachDay`, `weekStart`, `dayAbbrev`, `dayName`, `dayOfMonth`, `shortDay`, `spokenDay`, `isWeekend`, `crossesMidnight`, `hoursLabel`, `timesLabel` | 1 const · 25 types |
| `src/lib/api/signatures.ts` | — | — | `fingerprintHalves` | 7 const · 2 types |
| `src/lib/api/statutory.ts` | — | — | `dueIn` | 2 const · 2 types |
| `src/lib/api/teams.ts` | — | — | `membershipEffect` | 1 const · 8 types |
| `src/lib/api/uploads.ts` | — | — | `presign`, `putToStorage`, `upload`, `readAsAttachment`, `documentFile`, `saveDocument` | `UploadRefused` (class) · 1 const · 5 types |
| `src/lib/api/webhooks.ts` | — | — | `naira`, `koboFields`, `hostOf`, `pathOf`, `retryWindowLabel`, `asJson` | 1 const · 22 types |

---

## Data hooks — `src/lib/store`

How a screen asks for data. Each hook picks its own source — the API when one answers, local storage in demo mode — so screens do not care which. Every `useX()` returns a new object each render; never put one in a dependency array.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/lib/store/account-verification.ts` | — | `useAccountVerification` | — | 1 type |
| `src/lib/store/advances.ts` | — | `useMyAdvance`, `useAdvances`, `useAdvancePolicy`, `useAdvanceMutations` | — | 1 type |
| `src/lib/store/ai-chat.ts` | — | `useAssistantChat`, `useAssistantActions` | — | 4 types |
| `src/lib/store/ai.ts` | — | `useAssistantAvailable`, `useObjectiveSuggestions`, `useTaskSummarySuggestion`, `useDevelopmentSuggestions`, `usePeriodGoalDraft`, `usePeriodQuestionDraft`, `useAsk` | — | 1 const · 1 type |
| `src/lib/store/announcements.ts` | — | `useAnnouncements`, `useAnnouncementMutations` | — | 3 types |
| `src/lib/store/approvals-api.ts` | — | `useApprovalQueue`, `useSentApprovals` | — | 6 types |
| `src/lib/store/approvals.ts` | — | `useApprovalStore` | — | 2 types |
| `src/lib/store/assets.ts` | — | `useEquipmentKinds`, `useEquipment`, `useEquipmentItem`, `useRepairs`, `useEquipmentSummary`, `useMyEquipment`, `useRepairRequests`, `useRepairActions` | `dayLabel`, `today`, `daysSince` | 3 const · 15 types |
| `src/lib/store/attendance-devices.ts` | — | `useAttendanceDevices`, `useDeviceEnrolments`, `useDeviceMutations` | — | 4 types |
| `src/lib/store/attendance-history.ts` | — | `useAttendanceMonth` | — | 1 type |
| `src/lib/store/attendance.ts` | — | `useAttendanceStore`, `useAttendanceRoster`, `useAttendanceHistory`, `useMyCorrections`, `useCorrectionActions`, `useAttendancePolicy`, `useAttendanceTimesheet`, `useAttendanceMutations`, `useRotaContext` | `nowTime` | 2 const · 8 types |
| `src/lib/store/audit.ts` | — | `useAuditTrail`, `useAuditEvent`, `useRecordTimeline`, `useAuditFilterOptions` | — | 2 types |
| `src/lib/store/benefits.ts` | — | `useBenefitPlans`, `useBenefitEnrolments`, `useBenefitNotices`, `useBenefitCost`, `useBenefitMutations` | — | 1 type |
| `src/lib/store/careers.ts` | — | `usePostings`, `useApplications`, `useCareersAnalytics`, `usePostingIndex` | — | 2 types |
| `src/lib/store/company.ts` | — | `useLiveCompanyProfile`, `useCompanySettings`, `useOrgTaxState`, `useCompanyLogo` | `validateProfile` | 2 const · 11 types |
| `src/lib/store/conduct.ts` | — | `usePolicies`, `usePolicyText`, `useAcknowledgements`, `useMyPolicies`, `useConductRecord` | `dayLabel`, `acceptanceLabel`, `actionStatus`, `lapseLabel` | 4 const |
| `src/lib/store/dashboard-layout.ts` | — | `useDashboardLayout` | — | 1 type |
| `src/lib/store/demo-structure.ts` | — | `useDemoStructure` | `demoStructureId`, `refuse`, `isUnassigned`, `demoDepartmentName`, `structurePeople`, `sameName`, `demoTree`, `demoDepartmentDetail`, `demoTeamList`, `demoTeamDetail`, `pendingAlignment` | 3 const · 5 types |
| `src/lib/store/departments.ts` | — | `useDepartments`, `useDepartment` | — | 3 types |
| `src/lib/store/documents.ts` | — | `useDocumentRegister`, `useExpiringDocuments`, `useEmployeeFile`, `useMyDocuments` | `firstNameOf`, `dueLabel`, `complianceSentence`, `chaseMessage` | — |
| `src/lib/store/employee-draft.ts` | — | `useEmployeeDraft` | `savedAgo` | 1 const · 3 types |
| `src/lib/store/employees-api.ts` | — | `useEmployeeDirectory`, `useDirectorySummary`, `useEmployee`, `useEmployeeMutations` | — | 4 types |
| `src/lib/store/employees.ts` | — | `useEmployeeStore` | `applyOverrides`, `nextIdentity`, `validateEmployee` | 1 type |
| `src/lib/store/features.ts` | — | `useFeatures`, `useFeatureSettings`, `useDemoDeductions`, `useWizard` | — | 3 const · 1 type |
| `src/lib/store/grades.ts` | — | `useGrades`, `useGradeEmployees`, `useBandPosition`, `useGradeIncrease`, `useGradeTotals` | — | 2 types |
| `src/lib/store/helpdesk.ts` | — | `useTickets`, `useTicket`, `useRaiseTicket`, `useHelpdeskPulse` | — | 5 types |
| `src/lib/store/hiring.ts` | — | `useHiringOverview`, `useRoleQueue`, `useAdvertCreation`, `useApplicantRecord`, `useScreeningBacklog`, `useOfferBands` | `pipelineSnapshot` | 7 types |
| `src/lib/store/holidays.ts` | — | `usePublicHolidays`, `useDemoHolidayCounts`, `useHolidayMutations` | `refreshHolidayYear` | 3 types |
| `src/lib/store/imports.ts` | — | `useImport`, `useImportHistory`, `useEmployeeImport` | `planParts` | 8 types |
| `src/lib/store/insights.ts` | — | `useDashboard`, `useReports` | — | — |
| `src/lib/store/invites.ts` | — | `useInvites`, `useUnlinkedAccounts` | — | 2 types |
| `src/lib/store/knowledge.ts` | — | `useKbCategories`, `useKbArticles`, `useKbArticle`, `useKbSearch`, `useKbAnalytics` | — | — |
| `src/lib/store/leave-api.ts` | — | `useLeaveRequests`, `useLeaveRequestDetail`, `useLeaveTypes`, `useLeaveBalancesFor`, `useLeaveMutations`, `useEmployeeLeaveBalances` | — | 7 types |
| `src/lib/store/leave-balances.ts` | — | `useLeaveBalances` | — | — |
| `src/lib/store/leave.ts` | — | `useLeaveStore` | `workingDaysBetween`, `daysBetween`, `validateLeave` | 3 types |
| `src/lib/store/loans.ts` | — | `useLoans`, `useLoan`, `useLoanSummary`, `useLoanActions` | `finishesLabel` | 2 const · 4 types |
| `src/lib/store/money-privacy.ts` | — | `useMoneyHidden`, `useMoneyPrivacy` | — | — |
| `src/lib/store/my-record.ts` | — | `useMyPendingChanges`, `useMyRecordMutations` | — | 1 const · 2 types |
| `src/lib/store/notifications.ts` | — | `useUnreadCount`, `useNotifications` | `pushDemoNotification` | 2 types |
| `src/lib/store/offboarding.ts` | — | `useExits`, `useExit`, `useMyExit`, `useStartExit`, `useExitTemplates` | `resetOffboardingDemo` | 1 type |
| `src/lib/store/onboarding.ts` | — | `useOnboardingChecklist` | `dueOn` | 1 const · 3 types |
| `src/lib/store/one-on-ones.ts` | — | `useMyOneOnOnes`, `useOneOnOneMeetings`, `useOneOnOneCoverage`, `useWhoICanStartWith`, `useAmIInAOneOnOne`, `useOneOnOneMutations` | — | 1 type |
| `src/lib/store/overtime.ts` | — | `useOvertimePolicy`, `useOvertime`, `useMyOvertime` | `currentPeriod` | 5 types |
| `src/lib/store/pay-components.ts` | — | `usePayComponents`, `usePayComponentDetail`, `useAssignManyToComponent`, `useEmployeePayComponents`, `usePayPreview`, `usePayComponentTotals` | `demoNetEffectKobo` | 4 types |
| `src/lib/store/payments.ts` | — | `usePaymentsSummary`, `useWallet`, `usePaymentBatches`, `usePaymentBatch`, `useLedger`, `usePaymentHistory`, `usePaidPeople`, `useBankAccounts`, `usePaymentActions`, `usePayableRuns` | — | 3 const · 10 types |
| `src/lib/store/payroll-deductions.ts` | — | `useDeductionSwitches` | — | 1 const · 1 type |
| `src/lib/store/payroll-settings.ts` | — | — | `publishPayrollSettings`, `refreshPayrollSettings` | 2 const · 1 type |
| `src/lib/store/payroll.ts` | — | `usePayrollRuns`, `usePayrollRun`, `useRunPayslips`, `useMyPayslips`, `usePayrollActions`, `usePayslipRecord` | `deliveryOf`, `orderExceptions`, `countBySeverity` | 1 const · 5 types |
| `src/lib/store/payslip-quote.ts` | — | `usePayslipQuote` | `quoteSettingsFrom` | 1 type |
| `src/lib/store/performance.ts` | — | `useKpis`, `useKpiMutations`, `useObjectiveApprovals`, `useObjectiveMutations`, `useAppraisals`, `useReviewsIWrote`, `useReview`, `useSubjectSelfReview`, `useReviewMutations`, `useSignOff`, `useSections`, `useFramework`, `useFrameworkActions`, `useSkills`, `useGaps`, `useHeatmap`, `useCycleQuestions`, `useCycleMutations`, `useRating`, `useTasksForGrading`, `useMyTasks`, `useGoalTasks`, `useTaskActions`, `useAppraiserMap`, `useAppraiserMutations`, `useCycleRegister`, `useMyAppraisers`, `useEmployeeScore`, `useRatingScale`, `useScoringWeights`, `useCycleReport`, `useNineBox`, `useScoreHistory` | `mayBeSubmitted`, `measureDirection`, `toCascade`, `outstandingIn` | 6 const · 7 types |
| `src/lib/store/permissions.ts` | — | `useRoles`, `useRoleMembers`, `useAssignableAccounts`, `useRolePreview`, `useDemoRoles` | — | 2 types |
| `src/lib/store/persisted.ts` | — | — | `createPersistedState`, `patched` | 1 type |
| `src/lib/store/push.ts` | — | `usePush` | — | 1 type |
| `src/lib/store/recruitment.ts` | — | `useRequisitions`, `useRequisitionDetail`, `useRequisitionMutations`, `useStages`, `useStageMutations`, `useApplicationsForRequisition`, `useApplicationDetail`, `useApplicationMutations`, `useCandidateMutations`, `useCandidates`, `useInterviews`, `useInterviewDetail`, `useInterviewMutations`, `useOffers`, `useOfferMutations`, `useRecruitmentAnalytics`, `useRealPipelineApplication` | — | 9 types |
| `src/lib/store/reimbursements.ts` | — | `useExpenseTypes`, `useExpenseClaims`, `useExpenseSummary` | `today`, `daysSince` | 8 types |
| `src/lib/store/reports-builder.ts` | — | `useReportCatalogue`, `useSavedReports`, `useReportRun`, `useReportMutations` | — | 1 type |
| `src/lib/store/session.ts` | — | `useSession`, `useApiReachable` | `markSignedIn`, `signInOptions` | 4 types |
| `src/lib/store/setup-checklist.ts` | — | `useSetupChecklist` | — | 2 types |
| `src/lib/store/setup-guide.ts` | — | `useSetupGuideState` | `guideStateNow`, `markGuideOffered`, `dismissGuide`, `reopenGuide` | — |
| `src/lib/store/shifts.ts` | — | `useShiftCatalogue`, `useRota`, `useMyRota`, `useSwaps`, `useShiftMutations` | `swapAsk`, `previewPattern`, `previewShift` | 2 const · 6 types |
| `src/lib/store/signatures.ts` | — | `useMySignatures`, `useSignatures`, `useHaveIAnySignatures`, `useSignatureMutations` | — | 1 type |
| `src/lib/store/statutory.ts` | — | `useStatutorySchedules` | — | 1 type |
| `src/lib/store/teams.ts` | — | `useTeams`, `useTeam`, `useTeamMutations` | — | 3 types |
| `src/lib/store/theme.ts` | — | `useThemeChoice` | `applyTheme` | 1 type |
| `src/lib/store/webhooks.ts` | — | `useWebhookCatalogue`, `useWebhooks`, `useWebhook`, `useDeliveryLog`, `useWebhookActions` | — | 3 types |
| `src/lib/store/work-locations.ts` | — | `useWorkLocationList`, `useDemoWorkLocations`, `useWorkLocations`, `useWorkLocationMutations` | — | 4 types |

---

## Seed data — `src/lib/mock`

The day-one dataset for demo mode. Gated out of a production build entirely.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/lib/mock/announcements.ts` | — | — | — | 1 const |
| `src/lib/mock/attendance.ts` | — | — | `locationById`, `recentWorkingDays` | 3 const · 4 types |
| `src/lib/mock/demo-payslips.ts` | — | — | `payslipFiguresFor` | 2 const · 1 type |
| `src/lib/mock/hiring.ts` | — | — | `requisitionById`, `candidateById`, `pipelineCards`, `cardById`, `stageCounts`, `daysInStage` | 5 const |
| `src/lib/mock/payroll.ts` | — | — | `runPeopleFrom`, `distributionFor` | 4 const · 3 types |
| `src/lib/mock/people.ts` | — | — | `employeeById`, `directReports`, `entitlementsFor`, `documentsFor` | 4 const · 3 types |
| `src/lib/mock/roles.ts` | — | — | `seedRolesFor` | 1 const · 1 type |
| `src/lib/mock/sales-script-qa.ts` | — | — | `findScriptedAnswer` | 1 const · 1 type |
| `src/lib/mock/workflows.ts` | — | — | `approvalRequester`, `leaveEmployee` | 11 const · 11 types |

---

## Domain helpers — `src/lib/*`

Pure logic with no React in it: payroll settings, the import framework, CSV and XLSX, the review-language checker, permissions.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/lib/cn.ts` | — | — | `cn` | — |
| `src/lib/csv.ts` | — | — | `detectDelimiter`, `parseCsvRecords`, `parseCsv`, `fileFromRecords`, `csvCell`, `toCsv`, `downloadCsv` | 2 types |
| `src/lib/demo.ts` | — | — | `sourceNote` | — |
| `src/lib/error-reporting.ts` | — | — | `redact`, `buildReport`, `startErrorReporting` | 1 type |
| `src/lib/geolocation.ts` | — | — | `readPosition` | `PositionError` (class) · 2 types |
| `src/lib/logo-file.ts` | — | — | `sanitiseSvg`, `prepareLogo` | `LogoError` (class) · 3 const · 1 type |
| `src/lib/nav-history.ts` | — | `useCanGoBack` | `resetNavHistoryForTests` | — |
| `src/lib/pending-email-verification.ts` | — | — | `stashPendingVerification`, `takePendingVerification` | 1 type |
| `src/lib/permission-keys.ts` | — | — | — | 2 const · 4 types |
| `src/lib/permissions.ts` | — | `usePermissions`, `useCan`, `useIsManager` | `hasPermission`, `hasAnyPermission`, `requiresStrongPassword`, `toPermissionSet`, `can`, `Can` | 2 const · 2 types |
| `src/lib/report-error.ts` | — | — | `registerErrorReporter`, `errorReportingConfigured`, `reportError` | 2 types |
| `src/lib/revalidate.ts` | — | `useRevalidation` | `subscribeToRevalidation`, `revalidationCount` | 1 const |
| `src/lib/roles.ts` | — | `useSessionRoles` | `roleTier`, `rankRoles` | 3 types |
| `src/lib/sales-script.ts` | — | — | `salesScriptNote`, `salesScriptAssistantName`, `scriptedFallback` | — |
| `src/lib/shared-resource.ts` | — | — | `clearSharedResources`, `createSharedResource` | 1 type |
| `src/lib/theme-init-script.ts` | — | — | — | 1 const |
| `src/lib/today.ts` | — | — | `todayDate`, `daysSince`, `shortDate` | 1 const |
| `src/lib/types.ts` | — | — | `missingForPayroll`, `payrollGapsFor`, `payrollFieldsForDisplay`, `fullName`, `stageIndex`, `nextStage` | 3 const · 15 types |
| `src/lib/use-action.ts` | — | `useAction` | `actionMessage`, `retryIsSafe` | 1 type |
| `src/lib/use-debounced.ts` | — | `useDebounced` | — | — |
| `src/lib/use-list-query.ts` | — | `useListQuery` | — | 3 types |
| `src/lib/use-row-selection.ts` | — | `useRowSelection` | — | 1 type |
| `src/lib/xlsx.ts` | — | — | `escapeXml`, `columnName`, `columnIndex`, `writeXlsx`, `downloadXlsx`, `unescapeXml`, `serialToDate`, `readXlsx`, `isXlsxName` | 3 types |
| `src/lib/marketing/careers.ts` | — | — | `formatNaira`, `payRange`, `workTypeLabel`, `readableDate`, `listRoles`, `getRole`, `apply` | 2 const · 7 types |
| `src/lib/marketing/demo.ts` | — | — | `submitDemoRequest` | 1 const · 3 types |
| `src/lib/marketing/legal.ts` | — | — | — | 3 const · 3 types |
| `src/lib/marketing/links.ts` | — | — | `newTabIfApp`, `liveProductCta`, `appNavLinks`, `internalNavLinks` | 2 const · 1 type |
| `src/lib/marketing/modules.ts` | — | — | `moduleById` | 3 const · 3 types |
| `src/lib/marketing/pricing.ts` | — | — | `tierFor`, `quote`, `cumulativeIncludes` | 2 const · 3 types |
| `src/lib/reference/banks.ts` | — | — | `bankCodeFor`, `banksIncluding` | 1 const · 2 types |
| `src/lib/reference/lists.ts` | — | — | `canonicalTaxState`, `isOtherPensionProvider`, `withBlank`, `taxStateOptions`, `pensionProviderOptions` | 4 const · 1 type |
| `src/lib/grades/band.ts` | — | — | `bandPositionOf`, `bandStanding`, `bandLabel`, `bandBadge`, `markerPercent`, `bandFromNaira` | 3 types |
| `src/lib/performance/question-bank.ts` | — | — | — | 1 const |
| `src/lib/performance/review-language.ts` | — | — | `reviewLanguageFindings`, `findingsAcross`, `findingsHeadline` | 2 const · 2 types |
| `src/lib/payroll/adjustment-sheet.ts` | — | — | `sheetColumnsFor`, `sheetRow`, `buildSheet`, `parseSheet`, `summarise` | 5 const · 9 types |
| `src/lib/payroll/settings.ts` | — | — | `validateSettings` | 2 const · 3 types |
| `src/lib/payroll/use-settings.ts` | — | `usePayrollSettings` | — | 3 types |
| `src/lib/loans/schedule.ts` | — | — | `monthStart`, `addMonths`, `monthLabel`, `shortMonthLabel`, `isBeforeMonth`, `buildSchedule`, `priceLoan` | 3 types |
| `src/lib/imports/attendance.ts` | — | — | — | 4 const · 1 type |
| `src/lib/imports/check.ts` | — | — | `checkMappedRows` | 1 type |
| `src/lib/imports/departments.ts` | — | — | — | 4 const · 1 type |
| `src/lib/imports/employees.ts` | — | — | `resolveTaxState` | 8 const · 3 types |
| `src/lib/imports/equipment.ts` | — | — | — | 3 const · 3 types |
| `src/lib/imports/mapping.ts` | — | — | `guessMapping`, `mappingProblems`, `isMappingReady`, `ignoredHeadings`, `reverseHeadings`, `mapRow`, `mapRows`, `fieldOptions`, `noteFor`, `exampleFor` | 2 types |
| `src/lib/imports/spec.ts` | — | — | `normalizeKey`, `parseImportDate`, `parseImportTime`, `parseImportMoneyKobo`, `orderColumns`, `buildDictionary` | 7 types |
| `src/lib/imports/surface.ts` | — | — | — | 2 types |
| `src/lib/imports/template-file.ts` | — | — | `columnsFromDictionary`, `columnsFromApi`, `exampleRow`, `buildTemplateFiles` | 1 const · 2 types |
| `src/lib/overtime/derive.ts` | — | — | `clockMinutes`, `hourlyRateKobo`, `rateFor`, `amountKoboFor`, `isAtCap`, `kindFor`, `deriveOvertime` | 2 const · 6 types |
| `src/lib/workflows/attendance.ts` | — | — | `isHoliday`, `isWorkingDay`, `employedOn`, `firstRecordedDate`, `onLeave`, `rosterFor`, `timesheet`, `prorationFor` | 1 const · 3 types |
| `src/lib/workflows/leave.ts` | — | — | `leaveBalancesFor`, `remainingDays`, `balanceForRequest`, `clashesWith` | 1 type |
| `src/lib/workflows/queue.ts` | — | — | `buildApprovalQueue`, `decidedItems`, `toQueueItem`, `queueItemFromApproval` | 2 types |
| `src/lib/audit/language.ts` | — | — | `humanise`, `actionLabel`, `prettyField`, `shortLabel`, `describe`, `formatFieldValue`, `readableDate`, `fullStamp`, `dayKey`, `dayHeading`, `timeLabel` | 3 types |
| `src/lib/pay/flags.ts` | — | — | `taxableChip`, `pensionChip`, `preTaxChip`, `applyModeChip`, `flagChips`, `basisOf`, `amountLine`, `assignmentLine`, `money`, `signedMoney`, `percent`, `taxableSwitch`, `pensionSwitch`, `preTaxSwitch`, `applyModeSwitch` | 1 const · 3 types |

---

## Standalone hooks — `src/hooks`

Generic hooks not tied to one data source.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/hooks/use-focus-trap.ts` | — | `useFocusTrap` | `__scrollLockDepth` | — |
| `src/hooks/use-is-client.ts` | — | `useIsClient` | — | — |

---

## Screens — `/dashboard`

Screen components for the dashboard module, including its dialogs and panels.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/app/(app)/dashboard/announcements-panel.tsx` | `AnnouncementsPanel` | — | — | — |
| `src/app/(app)/dashboard/appraisals-card.tsx` | `AppraisalsCard` | — | — | — |
| `src/app/(app)/dashboard/catalogue.ts` | — | — | `widgetById`, `availableWidgets`, `defaultLayout`, `resolveLayout` | 4 const · 5 types |
| `src/app/(app)/dashboard/customize-drawer.tsx` | `CustomizeDrawer`, `CustomizeButton` | — | — | — |
| `src/app/(app)/dashboard/dashboard-screen.tsx` | `DashboardScreen` | — | — | — |
| `src/app/(app)/dashboard/header.tsx` | `DashboardHeader` | — | — | — |
| `src/app/(app)/dashboard/page.tsx` | `DashboardPage` | — | — | 1 const |
| `src/app/(app)/dashboard/quick-actions.tsx` | `QuickActions` | — | — | — |
| `src/app/(app)/dashboard/setup-guide.tsx` | `SetupGuide` | — | — | — |
| `src/app/(app)/dashboard/widgets.tsx` | — | — | — | 1 const · 1 type |

---

## Screens — `/people`

Screen components for the people module, including its dialogs and panels.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/app/(app)/people/directory.tsx` | `Directory` | — | — | — |
| `src/app/(app)/people/page.tsx` | `PeoplePage` | — | — | 1 const |
| `src/app/(app)/people/one-on-ones/one-on-ones-screen.tsx` | `OneOnOnesScreen` | — | — | — |
| `src/app/(app)/people/one-on-ones/page.tsx` | `OneOnOnesPage` | — | — | 1 const |
| `src/app/(app)/people/one-on-ones/[id]/one-on-one-screen.tsx` | `OneOnOneScreen` | — | — | — |
| `src/app/(app)/people/one-on-ones/[id]/page.tsx` | `OneOnOnePage` | — | — | 1 const |
| `src/app/(app)/people/offboarding/offboarding-screen.tsx` | `OffboardingScreen` | — | — | — |
| `src/app/(app)/people/offboarding/page.tsx` | `OffboardingPage` | — | — | 1 const |
| `src/app/(app)/people/offboarding/resign.tsx` | `Resign` | — | — | — |
| `src/app/(app)/people/offboarding/start-exit.tsx` | `StartExitDialog` | — | — | — |
| `src/app/(app)/people/offboarding/status-tone.ts` | — | — | `statusTone` | — |
| `src/app/(app)/people/offboarding/[id]/checklist.tsx` | `Checklist` | — | — | — |
| `src/app/(app)/people/offboarding/[id]/exit-detail-screen.tsx` | `ExitDetailScreen` | — | — | — |
| `src/app/(app)/people/offboarding/[id]/interview-panel.tsx` | `InterviewPanel` | — | — | — |
| `src/app/(app)/people/offboarding/[id]/page.tsx` | `ExitPage` | — | — | 1 const |
| `src/app/(app)/people/offboarding/checklist/checklist-settings.tsx` | `ChecklistSettingsScreen` | — | — | — |
| `src/app/(app)/people/offboarding/checklist/page.tsx` | `ExitChecklistPage` | — | — | 1 const |
| `src/app/(app)/people/incomplete/incomplete-records-screen.tsx` | `IncompleteRecordsScreen` | — | — | — |
| `src/app/(app)/people/incomplete/page.tsx` | `IncompleteRecordsPage` | — | — | 1 const |
| `src/app/(app)/people/[id]/conduct.tsx` | `ConductPanel` | — | — | — |
| `src/app/(app)/people/[id]/invite-to-sign-in.tsx` | `InviteToSignIn`, `InviteToSignInButton` | — | — | — |
| `src/app/(app)/people/[id]/link-existing-account.tsx` | `LinkExistingAccountButton` | — | — | — |
| `src/app/(app)/people/[id]/page.tsx` | `EmployeePage` | — | `generateStaticParams`, `generateMetadata` | — |
| `src/app/(app)/people/[id]/record-page.tsx` | `EmployeeRecordPage` | — | — | — |
| `src/app/(app)/people/[id]/record.tsx` | `EmployeeRecord` | — | `enumKey` | 1 const |
| `src/app/(app)/people/import/employee-import.tsx` | `EmployeeImport` | — | — | — |
| `src/app/(app)/people/import/page.tsx` | `ImportPage` | — | — | 1 const |
| `src/app/(app)/people/import/surface.ts` | — | — | — | 1 const |
| `src/app/(app)/people/new/form.tsx` | `NewEmployeeForm` | — | — | — |
| `src/app/(app)/people/new/page.tsx` | `NewEmployeePage` | — | — | 1 const |
| `src/app/(app)/people/documents/dialogs.tsx` | `AskForDocumentModal`, `AttachDocumentModal`, `AddDocumentModal`, `RemindModal`, `WaiveModal` | — | — | — |
| `src/app/(app)/people/documents/document-rows.tsx` | `DueChip`, `StatusChip`, `RequestRow`, `DocumentRow` | — | `readableDate` | — |
| `src/app/(app)/people/documents/documents-screen.tsx` | `DocumentsScreen` | — | — | — |
| `src/app/(app)/people/documents/employee-file.tsx` | `EmployeeFileDrawer` | — | — | — |
| `src/app/(app)/people/documents/my-documents.tsx` | `MyDocuments` | — | — | — |
| `src/app/(app)/people/documents/page.tsx` | `DocumentsPage` | — | — | 1 const |
| `src/app/(app)/people/attendance/attendance-screen.tsx` | `AttendanceScreen` | — | — | — |
| `src/app/(app)/people/attendance/day-timer.tsx` | `DayTimer` | — | — | — |
| `src/app/(app)/people/attendance/invite-staff-dialog.tsx` | `InviteStaffDialog` | — | — | 2 types |
| `src/app/(app)/people/attendance/my-attendance-history.tsx` | `MyAttendanceHistoryPanel` | — | — | — |
| `src/app/(app)/people/attendance/page.tsx` | `AttendancePage` | — | — | 1 const |
| `src/app/(app)/people/attendance/import/attendance-import.tsx` | `AttendanceImport` | — | — | — |
| `src/app/(app)/people/attendance/import/page.tsx` | `AttendanceImportPage` | — | — | 1 const |
| `src/app/(app)/people/attendance/import/surface.ts` | — | — | — | 1 const |
| `src/app/(app)/people/attendance/history/day-holiday.tsx` | `DayHoliday` | — | — | — |
| `src/app/(app)/people/attendance/history/history-screen.tsx` | `HistoryScreen` | — | — | — |
| `src/app/(app)/people/attendance/history/month-calendar.tsx` | `MonthCalendar`, `CalendarLegend` | — | `monthLabel`, `shiftMonth` | — |
| `src/app/(app)/people/attendance/history/page.tsx` | `AttendanceHistoryPage` | — | — | 1 const |
| `src/app/(app)/people/leave/book-leave.tsx` | `BookLeaveDialog` | — | — | — |
| `src/app/(app)/people/leave/holiday-calendar.tsx` | `HolidayCalendarCard` | — | — | — |
| `src/app/(app)/people/leave/leave-screen.tsx` | `LeaveScreen` | — | — | — |
| `src/app/(app)/people/leave/page.tsx` | `LeavePage` | — | — | 1 const |
| `src/app/(app)/people/org-chart/chart.tsx` | `OrgChartScreen` | — | — | — |
| `src/app/(app)/people/org-chart/model.ts` | — | — | `flattenPeople`, `buildModel`, `pruneNode`, `depthLabel`, `subtreeIds` | 3 types |
| `src/app/(app)/people/org-chart/page.tsx` | `Page` | — | — | 1 const |
| `src/app/(app)/people/shifts/assign-pattern.tsx` | `AssignPatternModal`, `CycleStrip` | — | — | — |
| `src/app/(app)/people/shifts/my-rota.tsx` | `MyRota` | — | — | — |
| `src/app/(app)/people/shifts/page.tsx` | `ShiftsPage` | — | — | 1 const |
| `src/app/(app)/people/shifts/palette.ts` | — | — | `shiftColours`, `colourFor` | 1 const · 1 type |
| `src/app/(app)/people/shifts/request-swap.tsx` | `RequestSwapModal` | — | — | — |
| `src/app/(app)/people/shifts/rota-grid.tsx` | `RotaGrid`, `ShiftLegend` | — | — | — |
| `src/app/(app)/people/shifts/shift-catalogue.tsx` | `ShiftCatalogue` | — | — | — |
| `src/app/(app)/people/shifts/shifts-screen.tsx` | `ShiftsScreen` | — | — | — |
| `src/app/(app)/people/shifts/swaps.tsx` | `SwapPanel`, `DeclineSwapModal` | — | — | — |
| `src/app/(app)/people/shifts/tabs.ts` | — | — | `isShiftTab` | 1 const · 1 type |
| `src/app/(app)/people/signatures/page.tsx` | `SignaturesPage` | — | — | 1 const |
| `src/app/(app)/people/signatures/send-dialog.tsx` | `SendDialog` | — | — | — |
| `src/app/(app)/people/signatures/signatures-screen.tsx` | `SignaturesScreen` | — | — | — |
| `src/app/(app)/people/onboarding/onboarding-screen.tsx` | `OnboardingScreen` | — | — | — |
| `src/app/(app)/people/onboarding/page.tsx` | `OnboardingPage` | — | — | 1 const |
| `src/app/(app)/people/assets/equipment-screen.tsx` | `EquipmentScreen` | — | — | — |
| `src/app/(app)/people/assets/fault-queue.tsx` | `FaultQueuePanel` | — | — | — |
| `src/app/(app)/people/assets/hand-over-dialog.tsx` | `HandOverDialog` | — | — | — |
| `src/app/(app)/people/assets/item-form.tsx` | `ItemForm` | — | — | — |
| `src/app/(app)/people/assets/item-panel.tsx` | `ItemPanel` | — | — | 1 const |
| `src/app/(app)/people/assets/kinds-panel.tsx` | `KindsPanel`, `AddKindDialog` | — | — | — |
| `src/app/(app)/people/assets/my-equipment.tsx` | `MyAssets` | — | — | — |
| `src/app/(app)/people/assets/page.tsx` | `EquipmentPage` | — | — | 1 const |
| `src/app/(app)/people/assets/register-table.tsx` | `RegisterTable` | — | — | — |
| `src/app/(app)/people/assets/repair-dialog.tsx` | `RepairDialog` | — | — | — |
| `src/app/(app)/people/assets/repairs-panel.tsx` | `RepairsPanel` | — | — | 1 type |
| `src/app/(app)/people/assets/report-fault.tsx` | `ReportFaultButton`, `RepairStatusLine` | — | — | — |
| `src/app/(app)/people/assets/take-back-dialog.tsx` | `TakeBackDialog` | — | — | — |
| `src/app/(app)/people/assets/team-equipment.tsx` | `TeamEquipment` | — | — | — |
| `src/app/(app)/people/assets/import/equipment-import.tsx` | `EquipmentImport` | — | — | — |
| `src/app/(app)/people/assets/import/page.tsx` | `EquipmentImportPage` | — | — | 1 const |
| `src/app/(app)/people/assets/import/surface.ts` | — | — | — | 1 const |
| `src/app/(app)/people/overtime/decline-overtime.tsx` | `DeclineOvertimeModal` | — | — | — |
| `src/app/(app)/people/overtime/my-overtime.tsx` | `MyOvertime` | — | — | — |
| `src/app/(app)/people/overtime/overtime-screen.tsx` | `OvertimeScreen` | — | — | — |
| `src/app/(app)/people/overtime/page.tsx` | `OvertimePage` | — | — | 1 const |
| `src/app/(app)/people/overtime/tone.ts` | — | — | — | 2 const |
| `src/app/(app)/people/departments/assign-head-dialog.tsx` | `AssignHeadDialog` | — | — | — |
| `src/app/(app)/people/departments/assign-people-dialog.tsx` | `AssignPeopleDialog` | — | — | 1 type |
| `src/app/(app)/people/departments/departments-screen.tsx` | `DepartmentsScreen` | — | — | — |
| `src/app/(app)/people/departments/page.tsx` | `DepartmentsPage` | — | — | 1 const |
| `src/app/(app)/people/departments/teams-panel.tsx` | `TeamsPanel` | — | — | — |
| `src/app/(app)/people/departments/[id]/detail-screen.tsx` | `DepartmentDetailScreen` | — | — | — |
| `src/app/(app)/people/departments/[id]/page.tsx` | `DepartmentPage` | — | — | 1 const |

---

## Screens — `/payroll`

Screen components for the payroll module, including its dialogs and panels.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/app/(app)/payroll/page.tsx` | `PayrollPage` | — | — | 1 const |
| `src/app/(app)/payroll/payroll-screen.tsx` | `PayrollScreen` | — | — | — |
| `src/app/(app)/payroll/expenses/approval-queue.tsx` | `ApprovalQueue`, `ReceiptCell` | — | — | — |
| `src/app/(app)/payroll/expenses/claim-form.tsx` | `ClaimForm` | — | `parseAmount` | — |
| `src/app/(app)/payroll/expenses/claims-register.tsx` | `StatusBadge`, `ClaimsRegister` | — | — | — |
| `src/app/(app)/payroll/expenses/expense-types.tsx` | `ExpenseTypes` | — | — | — |
| `src/app/(app)/payroll/expenses/expenses-screen.tsx` | `ExpensesScreen` | — | — | — |
| `src/app/(app)/payroll/expenses/my-expenses.tsx` | `MyExpenses` | — | — | — |
| `src/app/(app)/payroll/expenses/page.tsx` | `ExpensesPage` | — | — | 1 const |
| `src/app/(app)/payroll/payslips/index-table.tsx` | `PayslipRoute` | — | — | — |
| `src/app/(app)/payroll/payslips/my-payslip-index.tsx` | `MyPayslipIndex` | — | — | — |
| `src/app/(app)/payroll/payslips/page.tsx` | `PayslipsPage` | — | — | 1 const |
| `src/app/(app)/payroll/payslips/send-panel.tsx` | `SendPayslips` | — | — | — |
| `src/app/(app)/payroll/payslips/[id]/page.tsx` | `PayslipPage` | — | `generateStaticParams` | 1 const |
| `src/app/(app)/payroll/payslips/[id]/view.tsx` | `PayslipView` | — | — | — |
| `src/app/(app)/payroll/runs/new/inline-edit.tsx` | `InlineMoney`, `InlineHours` | — | — | — |
| `src/app/(app)/payroll/runs/new/lines-dialog.tsx` | `LinesDialog` | — | — | — |
| `src/app/(app)/payroll/runs/new/page.tsx` | `NewPayrollRunPage` | — | — | 1 const |
| `src/app/(app)/payroll/runs/new/pay-panel.tsx` | `PayPanel`, `WalletStrip`, `FundingAccounts`, `WalletFigures` | — | — | 1 const |
| `src/app/(app)/payroll/runs/new/sheet-panel.tsx` | `SheetPanel` | — | — | — |
| `src/app/(app)/payroll/runs/new/wizard.tsx` | `PayrollRunWizard` | — | — | 2 types |
| `src/app/(app)/payroll/pay-setup/assign-to-many-dialog.tsx` | `AssignComponentToManyDialog` | — | — | — |
| `src/app/(app)/payroll/pay-setup/band-position.tsx` | `BandPosition`, `BandMeter` | — | — | 1 type |
| `src/app/(app)/payroll/pay-setup/benefits-panel.tsx` | `BenefitsPanel` | — | — | — |
| `src/app/(app)/payroll/pay-setup/components-panel.tsx` | `ComponentsPanel` | — | — | — |
| `src/app/(app)/payroll/pay-setup/extras-panel.tsx` | `ExtrasPanel` | — | — | — |
| `src/app/(app)/payroll/pay-setup/grades-panel.tsx` | `GradesPanel` | — | — | — |
| `src/app/(app)/payroll/pay-setup/page.tsx` | `PaySetupPage` | — | — | 1 const |
| `src/app/(app)/payroll/pay-setup/pay-components-panel.tsx` | `PayComponentsPanel` | — | — | — |
| `src/app/(app)/payroll/pay-setup/pay-setup-screen.tsx` | `PaySetupScreen` | — | — | — |
| `src/app/(app)/payroll/pay-setup/tabs.ts` | — | — | `isPaySetupTab` | 1 const · 1 type |
| `src/app/(app)/payroll/loans/apply-loan.tsx` | `ApplyLoanModal` | — | — | — |
| `src/app/(app)/payroll/loans/decisions.tsx` | `DeclineLoanModal`, `CounterOfferModal`, `PayInstalmentModal`, `WaiveInstalmentModal` | — | — | — |
| `src/app/(app)/payroll/loans/loans-screen.tsx` | `LoansScreen` | — | — | — |
| `src/app/(app)/payroll/loans/my-loans.tsx` | `MyLoans` | — | — | — |
| `src/app/(app)/payroll/loans/page.tsx` | `LoansPage` | — | — | 1 const |
| `src/app/(app)/payroll/loans/[id]/loan-detail-screen.tsx` | `LoanDetailScreen` | — | — | — |
| `src/app/(app)/payroll/loans/[id]/page.tsx` | `LoanPage` | — | — | 1 const |
| `src/app/(app)/payroll/statutory/page.tsx` | `StatutoryPage` | — | — | 1 const |
| `src/app/(app)/payroll/statutory/schedules-table.tsx` | `SchedulesTable` | — | — | — |
| `src/app/(app)/payroll/statutory/statutory-screen.tsx` | `StatutoryScreen` | — | — | — |
| `src/app/(app)/payroll/advances/advances-screen.tsx` | `AdvancesScreen` | — | — | — |
| `src/app/(app)/payroll/advances/page.tsx` | `AdvancesPage` | — | — | 1 const |
| `src/app/(app)/payroll/payments/format.ts` | — | — | `longDate`, `longDateTime`, `monthLabel`, `people` | — |
| `src/app/(app)/payroll/payments/ledger-panel.tsx` | `LedgerPanel` | — | — | — |
| `src/app/(app)/payroll/payments/page.tsx` | `PaymentsPage` | — | — | 1 const |
| `src/app/(app)/payroll/payments/payments-screen.tsx` | `PaymentsScreen` | — | — | — |
| `src/app/(app)/payroll/payments/[id]/batch-detail-screen.tsx` | `BatchDetailScreen` | — | — | — |
| `src/app/(app)/payroll/payments/[id]/check-panel.tsx` | `CheckPanel` | — | — | — |
| `src/app/(app)/payroll/payments/[id]/page.tsx` | `PaymentBatchPage` | — | — | 1 const |
| `src/app/(app)/payroll/payments/[id]/release-panel.tsx` | `ReleasePanel` | — | — | — |
| `src/app/(app)/payroll/payments/history/history-screen.tsx` | `PaymentHistoryScreen` | — | — | — |
| `src/app/(app)/payroll/payments/history/page.tsx` | `PaymentHistoryPage` | — | — | 1 const |

---

## Screens — `/performance`

Screen components for the performance module, including its dialogs and panels.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/app/(app)/performance/appraiser-map.tsx` | `AppraiserMapTab`, `AppraisersDialog` | — | — | — |
| `src/app/(app)/performance/approval-dialogs.tsx` | `ApprovalReasonDialog` | — | — | 1 type |
| `src/app/(app)/performance/goal-dialogs.tsx` | `NewKpiDialog`, `AssignKpiDialog`, `AddMeasureDialog`, `StopKpiDialog` | — | — | — |
| `src/app/(app)/performance/how-it-works.tsx` | `HowItWorksBody`, `FrameworkDisclosure` | — | — | — |
| `src/app/(app)/performance/kpis.tsx` | `KpisTab` | — | — | — |
| `src/app/(app)/performance/manager-question.tsx` | `ManagerQuestionButton` | — | — | — |
| `src/app/(app)/performance/my-tasks.tsx` | `MyTasksPanel` | — | — | — |
| `src/app/(app)/performance/now.tsx` | `WhatNeedsYouTab` | — | — | — |
| `src/app/(app)/performance/page.tsx` | `PerformancePage` | — | — | 1 const |
| `src/app/(app)/performance/performance-screen.tsx` | `PerformanceScreen` | — | — | — |
| `src/app/(app)/performance/period-dialogs.tsx` | `QuestionsDialog` | — | — | — |
| `src/app/(app)/performance/period-status.tsx` | `PeriodStatus` | — | — | — |
| `src/app/(app)/performance/periods.tsx` | `PeriodsTab` | — | — | — |
| `src/app/(app)/performance/rating-dialog.tsx` | `RecordLevelDialog` | — | — | — |
| `src/app/(app)/performance/review-form.tsx` | `ReviewFormModal` | — | — | — |
| `src/app/(app)/performance/review-parts.tsx` | `AttachedEvidence`, `PeriodFraming`, `AppraiserStrip`, `AnswerField`, `ReadAnswer` | — | `ratingOptionsFrom`, `draftFrom`, `filled`, `periodWords` | 1 type |
| `src/app/(app)/performance/review-tasks.tsx` | `ReviewTasksTab` | — | — | — |
| `src/app/(app)/performance/skills.tsx` | `SkillsTab` | — | — | — |
| `src/app/(app)/performance/start-period.tsx` | `StartPeriodDialog`, `StartPeriodButton` | — | — | — |
| `src/app/(app)/performance/task-log.tsx` | `TaskLogPanel` | — | — | — |
| `src/app/(app)/performance/history/[employeeId]/history-screen.tsx` | `ScoreHistoryScreen` | — | — | — |
| `src/app/(app)/performance/history/[employeeId]/page.tsx` | `ScoreHistoryPage` | — | — | 1 const |
| `src/app/(app)/performance/kpis/kpis-screen.tsx` | `KpisScreen` | — | — | — |
| `src/app/(app)/performance/kpis/page.tsx` | `PerformanceKpisPage` | — | — | 1 const |
| `src/app/(app)/performance/reviews/[id]/page.tsx` | `ReviewPage` | — | — | 1 const |
| `src/app/(app)/performance/reviews/[id]/review-screen.tsx` | `ReviewScreen` | — | — | — |
| `src/app/(app)/performance/reviews/[id]/sign-off-dialog.tsx` | `SignOffDialog` | — | — | 1 type |
| `src/app/(app)/performance/approvals/approvals-screen.tsx` | `ApprovalsScreen` | — | — | — |
| `src/app/(app)/performance/approvals/page.tsx` | `PerformanceApprovalsPage` | — | — | 1 const |
| `src/app/(app)/performance/review-tasks/page.tsx` | `PerformanceReviewTasksPage` | — | — | 1 const |
| `src/app/(app)/performance/review-tasks/review-tasks-screen.tsx` | `ReviewTasksScreen` | — | — | — |
| `src/app/(app)/performance/periods/page.tsx` | `PerformancePeriodsPage` | — | — | 1 const |
| `src/app/(app)/performance/periods/periods-list-screen.tsx` | `PeriodsListScreen` | — | — | — |
| `src/app/(app)/performance/periods/[id]/ask-peers.tsx` | `AskPeersDialog`, `AskPeersButton` | — | — | — |
| `src/app/(app)/performance/periods/[id]/page.tsx` | `PeriodPage` | — | — | 1 const |
| `src/app/(app)/performance/periods/[id]/period-screen.tsx` | `PeriodScreen` | — | — | — |
| `src/app/(app)/performance/periods/[id]/nine-box/nine-box-screen.tsx` | `NineBoxScreen` | — | — | — |
| `src/app/(app)/performance/periods/[id]/nine-box/page.tsx` | `NineBoxPage` | — | — | 1 const |
| `src/app/(app)/performance/periods/[id]/report/page.tsx` | `PeriodReportPage` | — | — | 1 const |
| `src/app/(app)/performance/periods/[id]/report/report-screen.tsx` | `PeriodReportScreen` | — | — | — |
| `src/app/(app)/performance/periods/new/draft-wizard.tsx` | `DraftPeriodWizard` | — | — | — |
| `src/app/(app)/performance/periods/new/page.tsx` | `DraftPeriodPage` | — | — | 1 const |
| `src/app/(app)/performance/how-it-works/page.tsx` | `HowAppraisalsWorkPage` | — | — | 1 const |
| `src/app/(app)/performance/how-it-works/screen.tsx` | `HowAppraisalsWorkScreen` | — | — | — |
| `src/app/(app)/performance/appraisers/appraisers-screen.tsx` | `AppraisersScreen` | — | — | — |
| `src/app/(app)/performance/appraisers/page.tsx` | `PerformanceAppraisersPage` | — | — | 1 const |
| `src/app/(app)/performance/skills/page.tsx` | `PerformanceSkillsPage` | — | — | 1 const |
| `src/app/(app)/performance/skills/skills-screen.tsx` | `SkillsScreen` | — | — | — |

---

## Screens — `/hiring`

Screen components for the hiring module, including its dialogs and panels.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/app/(app)/hiring/hiring-screen.tsx` | `HiringScreen` | — | — | — |
| `src/app/(app)/hiring/layout.tsx` | `HiringLayout` | — | — | — |
| `src/app/(app)/hiring/page.tsx` | `HiringPage` | — | — | 1 const |
| `src/app/(app)/hiring/recruitment-coming-soon.tsx` | `RecruitmentComingSoon` | — | — | — |
| `src/app/(app)/hiring/postings/page.tsx` | `PostingsPage` | — | — | 1 const |
| `src/app/(app)/hiring/postings/posting-editor.tsx` | `PostingEditor` | — | — | — |
| `src/app/(app)/hiring/postings/postings-screen.tsx` | `PostingsScreen` | — | — | — |
| `src/app/(app)/hiring/postings/applications/applications-screen.tsx` | `ApplicationsScreen` | — | — | — |
| `src/app/(app)/hiring/postings/applications/page.tsx` | `ApplicationsPage` | — | — | 1 const |
| `src/app/(app)/hiring/offers/approvals.tsx` | `OfferApprovals` | — | — | — |
| `src/app/(app)/hiring/offers/page.tsx` | `OffersPage` | — | — | 1 const |
| `src/app/(app)/hiring/offers/real-approvals.tsx` | `RealApprovals` | — | — | — |
| `src/app/(app)/hiring/requisitions/[id]/page.tsx` | `RequisitionPage` | — | `generateStaticParams`, `generateMetadata` | — |
| `src/app/(app)/hiring/requisitions/[id]/real-workspace.tsx` | `RealRequisitionWorkspace` | — | — | — |
| `src/app/(app)/hiring/requisitions/[id]/requisition-screen.tsx` | `RequisitionScreen` | — | — | — |
| `src/app/(app)/hiring/requisitions/[id]/screening.tsx` | `RequisitionScreening`, `UnknownRequisition` | — | — | — |
| `src/app/(app)/hiring/requisitions/[id]/workspace.tsx` | `RequisitionWorkspace` | — | — | — |
| `src/app/(app)/hiring/requisitions/new/page.tsx` | `NewRequisitionPage` | — | — | 1 const |
| `src/app/(app)/hiring/requisitions/new/wizard.tsx` | `RequisitionWizard` | — | — | — |
| `src/app/(app)/hiring/interviews/interviews-screen.tsx` | `InterviewsScreen` | — | — | — |
| `src/app/(app)/hiring/interviews/page.tsx` | `InterviewsPage` | — | — | 1 const |
| `src/app/(app)/hiring/interviews/real-diary.tsx` | `RealDiary` | — | — | — |
| `src/app/(app)/hiring/candidates/[id]/candidate-screen.tsx` | `CandidateScreen` | — | — | — |
| `src/app/(app)/hiring/candidates/[id]/page.tsx` | `CandidatePage` | — | `generateStaticParams`, `generateMetadata` | — |
| `src/app/(app)/hiring/candidates/[id]/real-pipeline.tsx` | `RealRole`, `RealPipeline` | — | `realOutcomeBadge` | — |

---

## Screens — `/help`

Screen components for the help module, including its dialogs and panels.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/app/(app)/help/help-screen.tsx` | `HelpScreen` | — | — | — |
| `src/app/(app)/help/page.tsx` | `HelpPage` | — | — | 1 const |
| `src/app/(app)/help/ticket-labels.tsx` | `TicketClockBadge`, `InternalBadge` | — | — | 3 const |
| `src/app/(app)/help/ticket-thread.tsx` | `TicketThread` | — | — | — |
| `src/app/(app)/help/kb/kb-screen.tsx` | `KbScreen` | — | — | — |
| `src/app/(app)/help/kb/kb-search.tsx` | `KbSearch` | — | — | — |
| `src/app/(app)/help/kb/page.tsx` | `KbPage` | — | — | 1 const |
| `src/app/(app)/help/kb/[slug]/article-screen.tsx` | `ArticleScreen` | — | — | — |
| `src/app/(app)/help/kb/[slug]/page.tsx` | `KbArticlePage` | — | — | 1 const |

---

## Screens — `/reports`

Screen components for the reports module, including its dialogs and panels.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/app/(app)/reports/page.tsx` | `ReportsPage` | — | — | 1 const |
| `src/app/(app)/reports/reports-screen.tsx` | `ReportsScreen` | — | — | — |
| `src/app/(app)/reports/builder/builder-screen.tsx` | `ReportBuilderScreen` | — | — | — |
| `src/app/(app)/reports/builder/page.tsx` | `ReportBuilderPage` | — | — | 1 const |

---

## Screens — `/settings`

Screen components for the settings module, including its dialogs and panels.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/app/(app)/settings/checklist.ts` | — | — | `checklistRows`, `checklistProgress` | 2 types |
| `src/app/(app)/settings/page.tsx` | `SettingsPage` | — | — | 1 const |
| `src/app/(app)/settings/settings-screen.tsx` | `SettingsScreen` | — | — | — |
| `src/app/(app)/settings/bank-accounts/account-form.tsx` | `AccountForm` | — | — | — |
| `src/app/(app)/settings/bank-accounts/bank-accounts-screen.tsx` | `BankAccountsScreen` | — | — | — |
| `src/app/(app)/settings/bank-accounts/page.tsx` | `BankAccountsPage` | — | — | 1 const |
| `src/app/(app)/settings/locations/location-form.tsx` | `LocationForm` | — | — | 1 type |
| `src/app/(app)/settings/locations/locations-screen.tsx` | `LocationsScreen` | — | — | — |
| `src/app/(app)/settings/locations/page.tsx` | `WorkLocationsPage` | — | — | 1 const |
| `src/app/(app)/settings/appearance/appearance-screen.tsx` | `AppearanceScreen` | — | — | — |
| `src/app/(app)/settings/appearance/page.tsx` | `AppearanceSettingsPage` | — | — | 1 const |
| `src/app/(app)/settings/helpdesk/helpdesk-screen.tsx` | `HelpdeskSettingsScreen` | — | — | — |
| `src/app/(app)/settings/helpdesk/page.tsx` | `HelpdeskSettingsPage` | — | — | 1 const |
| `src/app/(app)/settings/ai/ai-screen.tsx` | `AiScreen` | — | — | — |
| `src/app/(app)/settings/ai/page.tsx` | `AiSettingsPage` | — | — | 1 const |
| `src/app/(app)/settings/integrations/list.tsx` | `IntegrationsList` | — | — | — |
| `src/app/(app)/settings/integrations/page.tsx` | `IntegrationsPage` | — | — | 1 const |
| `src/app/(app)/settings/security/page.tsx` | `SecuritySettingsPage` | — | — | 1 const |
| `src/app/(app)/settings/security/security-screen.tsx` | `SecurityScreen` | — | — | — |
| `src/app/(app)/settings/attendance/form.tsx` | `AttendancePolicyForm` | — | — | — |
| `src/app/(app)/settings/attendance/page.tsx` | `AttendancePolicyPage` | — | — | 1 const |
| `src/app/(app)/settings/performance/page.tsx` | `PerformanceSettingsPage` | — | — | 1 const |
| `src/app/(app)/settings/performance/scale-form.tsx` | `RatingScaleForm` | — | `scaleProblem` | — |
| `src/app/(app)/settings/performance/weights-form.tsx` | `ScoringWeightsForm` | — | — | — |
| `src/app/(app)/settings/devices/device-form.tsx` | `DeviceForm` | — | — | 1 type |
| `src/app/(app)/settings/devices/devices-screen.tsx` | `DevicesScreen` | — | — | — |
| `src/app/(app)/settings/devices/enrolments-drawer.tsx` | `EnrolmentsDrawer` | — | — | — |
| `src/app/(app)/settings/devices/page.tsx` | `AttendanceDevicesPage` | — | — | 1 const |
| `src/app/(app)/settings/devices/secret-panel.tsx` | `SecretPanel` | — | — | — |
| `src/app/(app)/settings/webhooks/add-webhook.tsx` | `AddWebhookModal`, `EventPicker` | — | — | — |
| `src/app/(app)/settings/webhooks/code.tsx` | `CopyButton`, `CodeBlock`, `CodeInline`, `PayloadBlock` | — | — | — |
| `src/app/(app)/settings/webhooks/page.tsx` | `WebhooksPage` | — | — | 1 const |
| `src/app/(app)/settings/webhooks/signature-doc.tsx` | `SignatureDoc` | — | — | — |
| `src/app/(app)/settings/webhooks/webhooks-screen.tsx` | `WebhooksScreen` | — | — | — |
| `src/app/(app)/settings/webhooks/[id]/detail-screen.tsx` | `WebhookDetailScreen` | — | — | — |
| `src/app/(app)/settings/webhooks/[id]/log.tsx` | `DeliveryLog` | — | — | 1 type |
| `src/app/(app)/settings/webhooks/[id]/page.tsx` | `WebhookPage` | — | — | 1 const |
| `src/app/(app)/settings/webhooks/[id]/test-panel.tsx` | `TestPanel` | — | — | — |
| `src/app/(app)/settings/payroll/form.tsx` | `PayrollSettingsForm` | — | — | — |
| `src/app/(app)/settings/payroll/page.tsx` | `PayrollSettingsPage` | — | — | 1 const |
| `src/app/(app)/settings/roles/add-people.tsx` | `AddPeopleDialog` | — | — | — |
| `src/app/(app)/settings/roles/create-role.tsx` | `CreateRoleDialog` | — | — | — |
| `src/app/(app)/settings/roles/page.tsx` | `RolesPage` | — | — | 1 const |
| `src/app/(app)/settings/roles/permission-matrix.tsx` | `PermissionMatrix` | — | — | — |
| `src/app/(app)/settings/roles/role-editor.tsx` | `RoleEditor` | — | — | — |
| `src/app/(app)/settings/roles/roles-screen.tsx` | `RolesScreen` | — | — | — |
| `src/app/(app)/settings/roles/send-invite.tsx` | `SendInviteDialog` | — | — | — |
| `src/app/(app)/settings/roles/unlinked-accounts.tsx` | `UnlinkedAccountsPanel` | — | — | — |
| `src/app/(app)/settings/leave/form.tsx` | `LeavePolicyForm` | — | — | — |
| `src/app/(app)/settings/leave/holiday-form.tsx` | `HolidayForm` | — | — | — |
| `src/app/(app)/settings/leave/holidays-panel.tsx` | `HolidaysPanel` | — | — | — |
| `src/app/(app)/settings/leave/page.tsx` | `LeavePolicyPage` | — | — | 1 const |
| `src/app/(app)/settings/knowledge/article-form.tsx` | `ArticleForm` | — | — | — |
| `src/app/(app)/settings/knowledge/knowledge-screen.tsx` | `KnowledgeScreen` | — | — | — |
| `src/app/(app)/settings/knowledge/page.tsx` | `KnowledgeSettingsPage` | — | — | 1 const |
| `src/app/(app)/settings/knowledge/sections-panel.tsx` | `SectionsPanel` | — | — | — |
| `src/app/(app)/settings/company/form.tsx` | `CompanyProfileForm` | — | — | — |
| `src/app/(app)/settings/company/logo-card.tsx` | `CompanyLogoCard` | — | — | — |
| `src/app/(app)/settings/company/page.tsx` | `CompanyProfilePage` | — | — | 1 const |
| `src/app/(app)/settings/notifications/page.tsx` | `NotificationsPage` | — | — | 1 const |
| `src/app/(app)/settings/notifications/push-panel.tsx` | `PushPanel` | — | — | — |
| `src/app/(app)/settings/notifications/settings.tsx` | `NotificationSettings` | — | — | — |
| `src/app/(app)/settings/policies/my-policies.tsx` | `MyPolicies` | — | — | — |
| `src/app/(app)/settings/policies/page.tsx` | `PoliciesPage` | — | — | 1 const |
| `src/app/(app)/settings/policies/policies-screen.tsx` | `PoliciesScreen` | — | — | — |
| `src/app/(app)/settings/policies/policy-drawer.tsx` | `PolicyDrawer` | — | — | — |
| `src/app/(app)/settings/features/features-screen.tsx` | `FeaturesScreen` | — | — | — |
| `src/app/(app)/settings/features/page.tsx` | `FeaturesPage` | — | — | 1 const |
| `src/app/(app)/settings/overtime/form.tsx` | `OvertimePolicyForm` | — | — | — |
| `src/app/(app)/settings/overtime/page.tsx` | `OvertimePolicyPage` | — | — | 1 const |
| `src/app/(app)/settings/audit/audit-screen.tsx` | `AuditScreen` | — | — | — |
| `src/app/(app)/settings/audit/entry.tsx` | `TrailEntry`, `Changes` | — | — | — |
| `src/app/(app)/settings/audit/page.tsx` | `AuditPage` | — | — | 1 const |
| `src/app/(app)/settings/audit/record-history.tsx` | `RecordHistory` | — | — | 1 type |
| `src/app/(app)/settings/announcements/announcement-form.tsx` | `AnnouncementForm` | — | — | 1 type |
| `src/app/(app)/settings/announcements/announcements-screen.tsx` | `AnnouncementsScreen` | — | — | — |
| `src/app/(app)/settings/announcements/page.tsx` | `AnnouncementsSettingsPage` | — | — | 1 const |

---

## Screens — `/approvals`

Screen components for the approvals module, including its dialogs and panels.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/app/(app)/approvals/inbox.tsx` | `ApprovalInbox` | — | — | 1 const |
| `src/app/(app)/approvals/page.tsx` | `ApprovalsPage` | — | — | 1 const |

---

## Screens — `/assistant`

Screen components for the assistant module, including its dialogs and panels.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/app/(app)/assistant/assistant-screen.tsx` | `AssistantScreen` | — | — | — |
| `src/app/(app)/assistant/page.tsx` | `AssistantPage` | — | — | 1 const |

---

## Screens — the rest of the signed-in app

Everything else under `src/app/(app)`.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/app/(app)/error.tsx` | `AppError` | — | — | — |
| `src/app/(app)/layout.tsx` | `AppLayout` | — | — | — |
| `src/app/(app)/loading.tsx` | `AppLoading` | — | — | — |
| `src/app/(app)/profile/my-details.tsx` | `MyDetails` | — | — | — |
| `src/app/(app)/profile/page.tsx` | `ProfilePage` | — | — | 1 const |
| `src/app/(app)/profile/profile-screen.tsx` | `ProfileScreen` | — | — | — |
| `src/app/(app)/profile/tabs.ts` | — | — | `isProfileTab` | 1 const · 1 type |
| `src/app/(app)/equipment/page.tsx` | `MyEquipmentPage` | — | — | 1 const |
| `src/app/(app)/documents/page.tsx` | `MyDocumentsPage` | — | — | 1 const |
| `src/app/(app)/notifications/inbox.tsx` | `NotificationsInbox` | — | — | — |
| `src/app/(app)/notifications/page.tsx` | `NotificationsPage` | — | — | 1 const |

---

## Screens — public site, auth and setup

`src/app/(marketing)`, `src/app/(auth)`, `src/app/(setup)` and the root files.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/app/error.tsx` | `Error` | — | — | — |
| `src/app/global-error.tsx` | `GlobalError` | — | — | — |
| `src/app/layout.tsx` | `RootLayout` | — | — | 2 const |
| `src/app/manifest.ts` | — | — | `manifest` | — |
| `src/app/not-found.tsx` | `NotFound` | — | — | 1 const |
| `src/app/robots.ts` | — | — | `robots` | — |
| `src/app/sitemap.ts` | — | — | `sitemap` | — |
| `src/app/offline/page.tsx` | `OfflinePage` | — | — | 1 const |
| `src/app/(auth)/layout.tsx` | `AuthLayout` | — | — | — |
| `src/app/(auth)/register/page.tsx` | `RegisterPage` | — | — | 1 const |
| `src/app/(auth)/register/register-screen.tsx` | `RegisterScreen` | — | — | — |
| `src/app/(auth)/accept-invite/accept-invite-screen.tsx` | `AcceptInviteScreen` | — | — | — |
| `src/app/(auth)/accept-invite/page.tsx` | `AcceptInvitePage` | — | — | 1 const |
| `src/app/(auth)/forgot-password/forgot-password-screen.tsx` | `ForgotPasswordScreen` | — | — | — |
| `src/app/(auth)/forgot-password/page.tsx` | `ForgotPasswordPage` | — | — | 1 const |
| `src/app/(auth)/verify-email/page.tsx` | `VerifyEmailPage` | — | — | 1 const |
| `src/app/(auth)/verify-email/verify-email-screen.tsx` | `VerifyEmailScreen` | — | — | — |
| `src/app/(auth)/reset-password/page.tsx` | `ResetPasswordPage` | — | — | 1 const |
| `src/app/(auth)/reset-password/reset-password-screen.tsx` | `ResetPasswordScreen` | — | — | — |
| `src/app/(setup)/layout.tsx` | `SetupLayout` | — | — | — |
| `src/app/(setup)/setup/page.tsx` | `SetupPage` | — | — | 1 const |
| `src/app/(setup)/setup/verification-nudge.tsx` | `VerificationNudge` | — | — | — |
| `src/app/(setup)/setup/wizard.tsx` | `SetupWizard` | — | — | — |
| `src/app/(marketing)/layout.tsx` | `MarketingLayout` | — | — | — |
| `src/app/(marketing)/page.tsx` | `HomePage` | — | — | 1 const |
| `src/app/(marketing)/security/page.tsx` | `Page` | — | — | 1 const |
| `src/app/(marketing)/dpa/page.tsx` | `Page` | — | — | 1 const |
| `src/app/(marketing)/careers/[org]/page.tsx` | `CareersListingPage` | — | — | 2 const |
| `src/app/(marketing)/careers/[org]/[role]/apply-form.tsx` | `ApplyForm` | — | — | — |
| `src/app/(marketing)/careers/[org]/[role]/page.tsx` | `RolePage` | — | `generateMetadata` | 1 const |
| `src/app/(marketing)/demo/form.tsx` | `DemoForm` | — | — | — |
| `src/app/(marketing)/demo/page.tsx` | `DemoPage` | — | — | 1 const |
| `src/app/(marketing)/terms/page.tsx` | `Page` | — | — | 1 const |
| `src/app/(marketing)/product/[module]/page.tsx` | `ModulePage` | — | `generateStaticParams`, `generateMetadata` | — |
| `src/app/(marketing)/privacy/page.tsx` | `Page` | — | — | 1 const |
| `src/app/(marketing)/pricing/calculator.tsx` | `PricingCalculator` | — | — | — |
| `src/app/(marketing)/pricing/page.tsx` | `PricingPage` | — | — | 1 const |
| `src/app/design-system/layout.tsx` | `DesignSystemLayout` | — | — | — |
| `src/app/design-system/page.tsx` | `DesignSystemPage` | — | — | 1 const |
| `src/app/design-system/sections.tsx` | `ButtonsDemo`, `FormsDemo`, `TableDemo`, `ChartsDemo`, `StatsDemo`, `SparklineDemo`, `FeedbackDemo`, `NavigationDemo`, `PeopleDemo`, `CardsDemo` | — | — | — |
| `src/app/design-system/tokens.ts` | — | — | — | 7 const · 1 type |

---

## Everything else

Files outside `src/app`, `src/lib`, `src/components` and `src/hooks`.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/proxy.ts` | — | — | `proxy` | 1 const |
