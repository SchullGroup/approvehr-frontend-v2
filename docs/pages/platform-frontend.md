# Pages — ApproveHR platform frontend

_Repo:_ `approvehr-platform-frontend` · _Framework:_ React 19 + React Router (Vite) · _Generated from_ `src/App.tsx`

**152 routes**, resolved through their nesting so each row is the full URL a browser sees.
A segment beginning with `:` is a parameter; `*` is the catch-all. Layout and guard wrappers
(`AppLayout`, `ProtectedRoute`, `AuthLayout`, `OnboardingLayout`) are stripped, so the component named
is the screen itself. A row reading `→ /somewhere` is a redirect rather than a page.

| Section | Routes |
|---|---:|
| Authentication and account | 8 |
| Setup and onboarding | 2 |
| Assets | 1 |
| Attendance | 4 |
| Audit | 1 |
| Company management | 4 |
| Dashboard | 1 |
| Departments | 5 |
| Employees | 18 |
| Exit management | 7 |
| Help desk | 9 |
| Integrations | 3 |
| Knowledge base | 5 |
| Leave | 15 |
| My profile | 2 |
| Notifications | 1 |
| Payroll | 16 |
| People | 1 |
| Performance | 24 |
| Recruitment | 7 |
| Settings | 7 |
| Setup wizard | 1 |
| Test assets | 1 |
| Test currency exchange | 1 |
| Test error boundary | 1 |
| Test helpdesk | 1 |
| Test helpdesk api | 1 |
| Test unified hooks | 1 |
| Test unified hooks simple | 1 |
| Development and debug | 1 |
| Root, redirects and catch-all | 2 |

---

## Authentication and account

| Route | Screen | File |
|---|---|---|
| `/change-password` | `ChangePassword` | `src/pages/auth/ChangePassword.tsx` |
| `/forgot-password` | `ForgotPassword` | `src/pages/auth/ForgotPassword.tsx` |
| `/login` | → /dashboard | — |
| `/register` | → /dashboard | — |
| `/reset-password` | `ResetPassword` | `src/pages/auth/ResetPassword.tsx` |
| `/reset-password-otp` | `ResetPasswordOtp` | `src/pages/auth/ResetPasswordOtp.tsx` |
| `/unauthorized` | `Unauthorized` | `src/pages/Unauthorized.tsx` |
| `/verify-email` | `VerifyEmail` | `src/pages/auth/VerifyEmail.tsx` |

---

## Setup and onboarding

| Route | Screen | File |
|---|---|---|
| `/administrator-setup` | `AdminAccountSetup` | `src/pages/onboarding/AdminAccount.tsx` |
| `/company-setup` | `CompanySetup` | `src/pages/onboarding/CompanySetup.tsx` |

---

## Assets

| Route | Screen | File |
|---|---|---|
| `/assets` | `Assets` | `src/pages/assets/Assets.tsx` |

---

## Attendance

| Route | Screen | File |
|---|---|---|
| `/attendance` | `Attendance` | `src/pages/attendance/AttendanceSelfService.tsx` |
| `/attendance/logs` | `DailyAttendanceLogs` | `src/pages/attendance/DailyAttendanceLogs.tsx` |
| `/attendance/reports` | `AttendanceReports` | `src/pages/attendance/AttendanceReports.tsx` |
| `/attendance/request-corrections` | `RequestCorrections` | `src/pages/attendance/RequestCorrections.tsx` |

---

## Audit

| Route | Screen | File |
|---|---|---|
| `/audit` | `AuditLogs` | `src/pages/audit/AuditLogs.tsx` |

---

## Company management

| Route | Screen | File |
|---|---|---|
| `/companies` | `CompanyList` | `src/pages/companies/CompanyList.tsx` |
| `/companies/:id` | `CompanyDetail` | `src/pages/companies/CompanyDetail.tsx` |
| `/companies/:id/edit` | `EditCompany` | `src/pages/companies/EditCompany.tsx` |
| `/companies/add` | `AddCompany` | `src/pages/companies/AddCompany.tsx` |

---

## Dashboard

| Route | Screen | File |
|---|---|---|
| `/dashboard` | `Dashboard` | `src/pages/Dashboard.tsx` |

---

## Departments

| Route | Screen | File |
|---|---|---|
| `/departments` | `DepartmentsPage` | — |
| `/departments/:id` | `NewDepartmentDetailPage` | `src/pages/departments/NewDepartmentDetailPage.tsx` |
| `/departments/:id/edit` | `EditDepartmentPage` | — |
| `/departments/add` | `NewAddDepartment` | `src/pages/departments/NewAddDepartment.tsx` |
| `/departments/organizational-chart` | `OrganizationalChartPage` | `src/pages/departments/OrganizationalChartPage.tsx` |

---

## Employees

| Route | Screen | File |
|---|---|---|
| `/employees` | `EmployeeOverview` | `src/pages/employees/EmployeeOverview.tsx` |
| `/employees/:id` | `EmployeeDetail` | — |
| `/employees/:id/edit` | `EditEmployee` | — |
| `/employees/add` | `AddEmployee` | — |
| `/employees/bulk-upload` | `AddBulkEmployee` | `src/pages/employees/AddBulkEmployee.tsx` |
| `/employees/disciplinary-actions` | `DisciplinaryActionsPage` | `src/pages/employees/DisciplinaryActionsPage.tsx` |
| `/employees/documents/requests` | `DocumentRequestsPage` | `src/pages/employees/DocumentRequestsPage.tsx` |
| `/employees/employee-shifts` | `EmployeeShiftManagementPage` | `src/pages/employees/EmployeeShiftManagementPage.tsx` |
| `/employees/list` | `EmployeeList` | — |
| `/employees/org-chart` | `OrgChart` | `src/pages/employees/OrgChart.tsx` |
| `/employees/overview` | `EmployeeOverview` | `src/pages/employees/EmployeeOverview.tsx` |
| `/employees/policies` | `PoliciesPage` | `src/pages/employees/PoliciesPage.tsx` |
| `/employees/policy-types` | `PolicyTypesPage` | `src/pages/employees/PolicyTypesPage.tsx` |
| `/employees/rotating-shifts` | `RotatingShiftAssignmentPage` | `src/pages/employees/RotatingShiftAssignmentPage.tsx` |
| `/employees/rotating-work-types` | `RotatingWorkTypeAssignmentPage` | `src/pages/employees/RotatingWorkTypeAssignmentPage.tsx` |
| `/employees/shifts/requests` | `ShiftRequestsPage` | `src/pages/employees/ShiftRequestsPage.tsx` |
| `/employees/work-type-definitions` | `WorkTypeDefinitionsPage` | `src/pages/employees/WorkTypeDefinitionsPage.tsx` |
| `/employees/work-types` | `WorkTypeManagementPage` | `src/pages/employees/WorkTypeManagementPage.tsx` |

---

## Exit management

| Route | Screen | File |
|---|---|---|
| `/exit-management` | `ExitManagementDashboard` | `src/pages/exit/Dashboard.tsx` |
| `/exit/clearance-checklist` | `ClearanceChecklist` | — |
| `/exit/interviews` | `ExitInterviews` | `src/pages/exit/ExitInterviews.tsx` |
| `/exit/reports` | `ExitReports` | `src/pages/exit/ExitReports.tsx` |
| `/exit/resignation-requests` | `ResignationRequests` | `src/pages/exit/ResignationRequests.tsx` |
| `/exit/resignation-requests/:id` | `ResignationRequestDetail` | `src/pages/exit/ResignationRequestDetail.tsx` |
| `/exit/submit-resignation` | `SubmitResignationPage` | `src/pages/exit/SubmitResignationPage.tsx` |

---

## Help desk

| Route | Screen | File |
|---|---|---|
| `/helpdesk` | `TicketList` | — |
| `/helpdesk/analytics` | `Analytics` | — |
| `/helpdesk/attachments` | `FileAttachments` | — |
| `/helpdesk/categories` | `Categories` | — |
| `/helpdesk/comments` | `Comments` | — |
| `/helpdesk/create` | `CreateTicket` | — |
| `/helpdesk/my-tickets` | `MyTickets` | — |
| `/helpdesk/sla-policies` | `SLAPolicies` | — |
| `/helpdesk/tickets/:id` | `TicketDetail` | — |

---

## Integrations

| Route | Screen | File |
|---|---|---|
| `/integrations` | `Integrations` | `src/pages/integrations/Integrations.tsx` |
| `/integrations/employee-integrations` | `EmployeeIntegrations` | `src/pages/integrations/EmployeeIntegrations.tsx` |
| `/integrations/webhooks` | `Webhooks` | `src/pages/integrations/Webhooks.tsx` |

---

## Knowledge base

| Route | Screen | File |
|---|---|---|
| `/knowledge-base` | `KnowledgeBase` | — |
| `/knowledge-base/analytics` | `KnowledgeBaseAnalytics` | — |
| `/knowledge-base/attachments` | `KnowledgeBase` | — |
| `/knowledge-base/categories` | `KnowledgeBase` | — |
| `/knowledge-base/settings` | `KnowledgeBase` | — |

---

## Leave

| Route | Screen | File |
|---|---|---|
| `/leave/:id` | `LeaveDetail` | `src/pages/leave/LeaveDetail.tsx` |
| `/leave/allocation-request` | `LeaveAllocationPage` | `src/pages/leave/LeaveAllocationPage.tsx` |
| `/leave/approval-workflows` | `LeaveDashboardPage` | `src/pages/leave/LeaveDashboardPage.tsx` |
| `/leave/approvals/all` | `ViewAllApprovalsPage` | `src/pages/leave/ViewAllApprovalsPage.tsx` |
| `/leave/assign` | `AssignedLeavesPage` | `src/pages/leave/AssignedLeavesPage.tsx` |
| `/leave/balances` | `LeaveBalancesPage` | `src/pages/leave/LeaveBalancesPage.tsx` |
| `/leave/dashboard` | `LeaveManagement` | `src/pages/leave/LeaveManagement.tsx` |
| `/leave/employee-balances/:id` | `EmployeeLeaveBalances` | `src/pages/leave/EmployeeLeaveBalances.tsx` |
| `/leave/holiday-types` | `HolidayTypesPage` | `src/pages/leave/HolidayTypesPage.tsx` |
| `/leave/holidays` | `HolidaysPage` | `src/pages/leave/HolidaysPage.tsx` |
| `/leave/leave-request` | `LeaveRequestsPage` | `src/pages/leave/LeaveRequestsPage.tsx` |
| `/leave/my-leave-requests` | `MyLeaveRequestPage` | `src/pages/leave/MyLeaveRequestPage.tsx` |
| `/leave/settings` | `LeaveSettingsPage` | `src/pages/leave/LeaveSettingsPage.tsx` |
| `/leave/submit-leave-request` | `SubmitLeaveRequestPage` | `src/pages/leave/SubmitLeaveRequestPage.tsx` |
| `/leave/types` | `LeaveTypesPage` | `src/pages/leave/LeaveTypesPage.tsx` |

---

## My profile

| Route | Screen | File |
|---|---|---|
| `/profile` | `NewEmployeeProfile` | `src/pages/employees/NewEmployeeProfile.tsx` |
| `/profile/edit` | `EditEmployeeProfile` | `src/pages/employees/EditEmployeeProfile.tsx` |

---

## Notifications

| Route | Screen | File |
|---|---|---|
| `/notifications` | `AppNotifications` | `src/pages/AppNotifications.tsx` |

---

## Payroll

| Route | Screen | File |
|---|---|---|
| `/payroll` | `PayrollDashboardPage` | `src/pages/payroll/PayrollDashboard.tsx` |
| `/payroll/allowances` | `AllowancesPage` | `src/pages/payroll/Allowances.tsx` |
| `/payroll/deductions` | `DeductionsPage` | `src/pages/payroll/Deductions.tsx` |
| `/payroll/loans` | `LoansPage` | `src/pages/payroll/Loans.tsx` |
| `/payroll/payroll-runs` | `PayrollRuns` | `src/pages/payroll/PayrollRuns.tsx` |
| `/payroll/payroll-runs/:id` | `PayrollRunDetail` | — |
| `/payroll/payroll-runs/new` | `PayrollRuns` | `src/pages/payroll/PayrollRuns.tsx` |
| `/payroll/reimbursements` | `ReimbursementsPage` | `src/pages/payroll/Reimbursements.tsx` |
| `/payroll/reports` | `PayrollReports` | `src/pages/payroll/placeholders/PayrollReports.tsx` |
| `/payroll/salary-category/:id/edit` | `SalaryCategoryFormPage` | `src/pages/payroll/SalaryCategoryFormPage.tsx` |
| `/payroll/salary-category/create` | `SalaryCategoryFormPage` | `src/pages/payroll/SalaryCategoryFormPage.tsx` |
| `/payroll/salary-structures` | `SalaryStructures` | `src/pages/payroll/SalaryStructures.tsx` |
| `/payroll/salary-structures/:id/edit` | `SalaryStructureFormPage` | `src/pages/payroll/SalaryStructureFormPage.tsx` |
| `/payroll/salary-structures/create` | `SalaryStructureFormPage` | `src/pages/payroll/SalaryStructureFormPage.tsx` |
| `/payroll/tax-settings` | `TaxSettings` | `src/pages/payroll/TaxSettings.tsx` |
| `/payroll/wallet` | `WalletPage` | `src/pages/payroll/WalletPage.tsx` |

---

## People

| Route | Screen | File |
|---|---|---|
| `/people` | `EmployeeOverview` | `src/pages/employees/EmployeeOverview.tsx` |

---

## Performance

| Route | Screen | File |
|---|---|---|
| `/performance` | `PerformanceDashboard` | `src/pages/performance/index.ts` |
| `/performance/competencies` | `Competencies` | `src/pages/performance/index.ts` |
| `/performance/configure-scoring-weights` | `ConfigureScoringWeights` | `src/pages/performance/ConfigureScoringWeights.tsx` |
| `/performance/executive` | `ExecutiveDashboard` | `src/pages/performance/ExecutiveDashboard.tsx` |
| `/performance/goals` | `CompanyGoals` | `src/pages/performance/CompanyGoals.tsx` |
| `/performance/goals/create` | `CompanyGoals` | `src/pages/performance/CompanyGoals.tsx` |
| `/performance/manage-objectives` | `ManageObjectives` | `src/pages/performance/ManageObjectives.tsx` |
| `/performance/manage-objectives/:id` | `TeamMemberPerformance` | `src/pages/performance/TeamMemberPerformance.tsx` |
| `/performance/manager` | `ManagerDashboard` | `src/pages/performance/ManagerDashboard.tsx` |
| `/performance/my-objectives` | `MyObjectives` | `src/pages/performance/index.ts` |
| `/performance/my-objectives/:id/history` | `MyObjectiveHistory` | `src/pages/performance/index.ts` |
| `/performance/pending-objectives` | `ApproveObjectives` | `src/pages/performance/ApproveObjectives.tsx` |
| `/performance/pending-objectives/:id` | `ReviewObjective` | `src/pages/performance/ReviewObjective.tsx` |
| `/performance/review-cycle` | `ReviewCycles` | `src/pages/performance/ReviewCycles.tsx` |
| `/performance/review-cycle/:id/participants` | `ReviewCycleParticipants` | `src/pages/performance/ReviewCycleParticipants.tsx` |
| `/performance/review-cycle/:id/report` | `ReviewCycleReport` | `src/pages/performance/ReviewCycleReport.tsx` |
| `/performance/review-cycle/reminders` | `SendReminders` | `src/pages/performance/SendReminders.tsx` |
| `/performance/review-pending-tasks` | `PendingTasks` | `src/pages/performance/PendingTasks.tsx` |
| `/performance/reviews` | `ReviewsList` | `src/pages/performance/index.ts` |
| `/performance/reviews/:id/hr-view` | `HrViewAppraisal` | `src/pages/performance/HrViewAppraisal.tsx` |
| `/performance/self-appraisal` | `SelfAppraisal` | `src/pages/performance/SelfAppraisal.tsx` |
| `/performance/submit-task` | `SubmitTask` | `src/pages/performance/SubmitTask.tsx` |
| `/performance/team-appraisals` | `TeamAppraisals` | `src/pages/performance/TeamAppraisals.tsx` |
| `/performance/team-appraisals/:id` | `CompleteAppraisal` | `src/pages/performance/CompleteAppraisal.tsx` |

---

## Recruitment

| Route | Screen | File |
|---|---|---|
| `/recruitment` | `RecruitmentDashboard` | `src/pages/recruitment/index.ts` |
| `/recruitment/analytics` | `RecruitmentDashboard` | `src/pages/recruitment/index.ts` |
| `/recruitment/applications` | `Applications` | `src/pages/recruitment/index.ts` |
| `/recruitment/candidates` | `Candidates` | `src/pages/recruitment/index.ts` |
| `/recruitment/interviews` | `Interviews` | `src/pages/recruitment/index.ts` |
| `/recruitment/job-postings` | `JobPostings` | `src/pages/recruitment/index.ts` |
| `/recruitment/job-postings/:id` | `JobPostingDetail` | `src/pages/recruitment/index.ts` |

---

## Settings

| Route | Screen | File |
|---|---|---|
| `/settings` | `SettingsHubPage` | `src/pages/settings/SettingsHubPage.tsx` |
| `/settings/general` | `GeneralSettingsPage` | `src/pages/settings/GeneralSettings.tsx` |
| `/settings/role-permissions` | `RoleAndPermissionsPage` | `src/pages/settings/permissions/RoleAndPermissionsPage.tsx` |
| `/settings/role-permissions/:id/edit` | `EditRolePage` | `src/pages/settings/permissions/EditRolePage.tsx` |
| `/settings/role-permissions/create` | `CreateRolePage` | `src/pages/settings/permissions/CreateRolePage.tsx` |
| `/settings/role-permissions/create/permissions` | `RolePermissionsPage` | `src/pages/settings/permissions/RolePermissionsPage.tsx` |
| `/settings/system` | `SystemSettings` | `src/pages/settings/SystemSettings.tsx` |

---

## Setup wizard

| Route | Screen | File |
|---|---|---|
| `/setup-wizard` | `SetupChecklist` | `src/pages/onboarding/SetupChecklist.tsx` |

---

## Test assets

| Route | Screen | File |
|---|---|---|
| `/test-assets` | `Assets` | `src/pages/assets/Assets.tsx` |

---

## Test currency exchange

| Route | Screen | File |
|---|---|---|
| `/test-currency-exchange` | `CurrencyExchangeTest` | `src/pages/CurrencyExchangeTest.tsx` |

---

## Test error boundary

| Route | Screen | File |
|---|---|---|
| `/test-error-boundary` | `ErrorBoundaryTestWithBoundary` | `src/components/error-boundary/index.ts` |

---

## Test helpdesk

| Route | Screen | File |
|---|---|---|
| `/test-helpdesk` | `TestHelpdesk` | — |

---

## Test helpdesk api

| Route | Screen | File |
|---|---|---|
| `/test-helpdesk-api` | `TestHelpdeskAPI` | — |

---

## Test unified hooks

| Route | Screen | File |
|---|---|---|
| `/test-unified-hooks` | `TestUnifiedHooks` | `src/components/TestUnifiedHooks.tsx` |

---

## Test unified hooks simple

| Route | Screen | File |
|---|---|---|
| `/test-unified-hooks-simple` | `TestUnifiedHooksSimple` | `src/components/TestUnifiedHooksSimple.tsx` |

---

## Development and debug

| Route | Screen | File |
|---|---|---|
| `/permission-debug` | `PermissionDebug` | `src/pages/PermissionDebug.tsx` |

---

## Root, redirects and catch-all

| Route | Screen | File |
|---|---|---|
| `/` | → redirect | — |
| `/*` | `NotFound` | `src/pages/NotFound.tsx` |
