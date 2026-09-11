# Components and functions — ApproveHR platform frontend

_Repo:_ `approvehr-platform-frontend` · _Generated from_ `src/**/*.{ts,tsx}` (tests excluded)

Every exported symbol, grouped by what it is for. **Components** render; **hooks** start with `use`;
**functions** are plain callables. Constants and types are counted rather than listed.

| Group | Files | Components | Hooks | Functions |
|---|---:|---:|---:|---:|
| [Layout and chrome — `src/components/layout`](#layout-and-chrome-src-components-layout) | 7 | 6 | 0 | 0 |
| [Shared UI — `src/components/ui`](#shared-ui-src-components-ui) | 36 | 80 | 0 | 0 |
| [Access control — `src/components/auth`](#access-control-src-components-auth) | 1 | 1 | 0 | 0 |
| [Other shared components — `src/components/*`](#other-shared-components-src-components) | 356 | 366 | 0 | 8 |
| [Stores — `src/stores`](#stores-src-stores) | 2 | 0 | 2 | 0 |
| [Services — `src/services`](#services-src-services) | 73 | 0 | 0 | 6 |
| [Hooks — `src/hooks`](#hooks-src-hooks) | 65 | 0 | 924 | 1 |
| [Contexts — `src/contexts`](#contexts-src-contexts) | 3 | 5 | 0 | 0 |
| [Helpers — `src/lib`, `src/utils`, `src/constants`, `src/data`](#helpers-src-lib-src-utils-src-constants-src-data) | 49 | 0 | 7 | 185 |
| [Types — `src/types`](#types-src-types) | 16 | 0 | 0 | 0 |
| [Screens — `src/pages/employees`](#screens-src-pages-employees) | 30 | 29 | 0 | 0 |
| [Screens — `src/pages/departments`](#screens-src-pages-departments) | 9 | 8 | 0 | 0 |
| [Screens — `src/pages/attendance`](#screens-src-pages-attendance) | 9 | 11 | 0 | 0 |
| [Screens — `src/pages/leave`](#screens-src-pages-leave) | 21 | 21 | 0 | 0 |
| [Screens — `src/pages/payroll`](#screens-src-pages-payroll) | 16 | 16 | 0 | 0 |
| [Screens — `src/pages/performance`](#screens-src-pages-performance) | 27 | 25 | 0 | 0 |
| [Screens — `src/pages/recruitment`](#screens-src-pages-recruitment) | 8 | 7 | 0 | 0 |
| [Screens — `src/pages/assets`](#screens-src-pages-assets) | 1 | 1 | 0 | 0 |
| [Screens — `src/pages/companies`](#screens-src-pages-companies) | 4 | 4 | 0 | 0 |
| [Screens — `src/pages/settings`](#screens-src-pages-settings) | 12 | 14 | 0 | 0 |
| [Screens — `src/pages/auth`](#screens-src-pages-auth) | 7 | 7 | 0 | 0 |
| [Screens — `src/pages/onboarding`](#screens-src-pages-onboarding) | 3 | 3 | 0 | 0 |
| [Screens — `src/pages/exit`](#screens-src-pages-exit) | 13 | 12 | 0 | 8 |
| [Screens — `src/pages/helpdesk`](#screens-src-pages-helpdesk) | 11 | 11 | 0 | 0 |
| [Screens — `src/pages/knowledge-base`](#screens-src-pages-knowledge-base) | 4 | 3 | 0 | 0 |
| [Screens — `src/pages/integrations`](#screens-src-pages-integrations) | 3 | 3 | 0 | 0 |
| [Screens — the rest of `src/pages`](#screens-the-rest-of-src-pages) | 8 | 8 | 0 | 0 |
| [Everything else](#everything-else) | 6 | 1 | 0 | 0 |
| **Total** | **800** | **642** | **933** | **208** |

---

## Layout and chrome — `src/components/layout`

The shell: app layout, auth layout, onboarding layout, sidebar and header.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/components/layout/ActionLayout.tsx` | `ActionLayout` | — | — | — |
| `src/components/layout/AppLayout.tsx` | `AppLayout` | — | — | — |
| `src/components/layout/AuthLayout.tsx` | `AuthLayout` | — | — | — |
| `src/components/layout/OnboardingLayout.tsx` | `OnboardingLayout` | — | — | — |
| `src/components/layout/Header/Header.tsx` | `Header` | — | — | — |
| `src/components/layout/Sidebar/Sidebar.tsx` | `Sidebar` | — | — | — |
| `src/components/layout/Sidebar/sections.tsx` | — | — | — | 1 const · 2 types |

---

## Shared UI — `src/components/ui`

The reusable primitives this app is built from.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/components/ui/ActionCard.tsx` | `ActionCard` | — | — | — |
| `src/components/ui/Alert.tsx` | — | — | — | 1 type |
| `src/components/ui/Avatar.tsx` | — | — | — | 3 types |
| `src/components/ui/Badge.tsx` | — | — | — | 1 type |
| `src/components/ui/Button.tsx` | — | — | — | 1 type |
| `src/components/ui/Card.tsx` | — | — | — | 5 types |
| `src/components/ui/Carousel.tsx` | `Carousel` | — | — | — |
| `src/components/ui/Collapsible.tsx` | `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` | — | — | — |
| `src/components/ui/ConfirmModal.tsx` | `ConfirmModal` | — | — | 1 type |
| `src/components/ui/DateInput.tsx` | `DateInput` | — | — | — |
| `src/components/ui/Drawer.tsx` | `Drawer` | — | — | — |
| `src/components/ui/Dropdown.tsx` | `Dropdown` | — | — | — |
| `src/components/ui/DropdownMenu.tsx` | — | — | — | 4 types |
| `src/components/ui/FloatingDateInput.tsx` | `FloatingDateInput` | — | — | — |
| `src/components/ui/FloatingInput.tsx` | `FloatingInput` | — | — | — |
| `src/components/ui/FloatingSelect.tsx` | `FloatingSelect` | — | — | — |
| `src/components/ui/FloatingTextArea.tsx` | `FloatingTextArea` | — | — | — |
| `src/components/ui/GlobalLoader.tsx` | `GlobalLoader` | — | — | — |
| `src/components/ui/Icons.tsx` | `DashboardIcon`, `BellIcon`, `InfoTriangle`, `Folder`, `InfoCircle`, `Settings`, `Tour`, `UserGroup`, `UserSingle`, `VerifiedCheck`, `SquareCheckComplete`, `PerformanceIcon`, `AttendanceIcon`, `RecruitementIcon`, `PeopleIcon`, `NotesIcon`, `LeaveIcon`, `FolderIcon`, `FolderZipIcon`, `RecieptIcon`, `HelpDeskIcon`, `ActivityIcon`, `ProjectsIcon`, `SettingsIcon`, `DoubleAltArrowRightBoldIcon`, `BankIcon`, `InvoiceIcon`, `BlankIcon`, `InfoOctagon`, `ImportIcon`, `ExportIcon`, `PdfIcon`, `CalendarIcon`, `ExcelIcon`, `LocationIcon`, `ClockInIcon`, `ClockOutIcon`, `ArrowDownIcon`, `LogoIcon`, `SearchResultIcon`, `DeptIcon`, `NairaText`, `CloudUploadIcon`, `GreenCheckIcon`, `ButtonPlusIcon`, `SearchIcon`, `BoldMinusCircle`, `BoldPlusCircle` | — | — | — |
| `src/components/ui/Input.tsx` | `Input` | — | — | — |
| `src/components/ui/Label.tsx` | `Label` | — | — | — |
| `src/components/ui/Modal.tsx` | `Modal` | — | — | 1 type |
| `src/components/ui/MultiSelect.tsx` | `MultiSelect` | — | — | — |
| `src/components/ui/PageLoader.tsx` | `PageLoader` | — | — | — |
| `src/components/ui/Pagination.tsx` | `Pagination` | — | — | — |
| `src/components/ui/Progress.tsx` | `Progress` | — | — | 1 type |
| `src/components/ui/PromptModal.tsx` | `PromptModal` | — | — | 1 type |
| `src/components/ui/Select.tsx` | — | — | — | 1 const |
| `src/components/ui/StarRating.tsx` | `StarRating` | — | — | — |
| `src/components/ui/Stepper.tsx` | `Stepper` | — | — | 2 types |
| `src/components/ui/SvgIcon.tsx` | `SvgIcon` | — | — | — |
| `src/components/ui/Switch.tsx` | `Switch` | — | — | 1 type |
| `src/components/ui/Table.tsx` | `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` | — | — | 1 const · 6 types |
| `src/components/ui/Tabs.tsx` | — | — | — | 4 types |
| `src/components/ui/Textarea.tsx` | — | — | — | 1 type |
| `src/components/ui/TouchButton.tsx` | — | — | — | 1 type |

---

## Access control — `src/components/auth`

Route guards and permission gates.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/components/auth/ProtectedRoute.tsx` | `ProtectedRoute` | — | — | — |

---

## Other shared components — `src/components/*`

Everything else under `src/components`, grouped by the folder it lives in.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/components/APITest.tsx` | `APITest` | — | — | — |
| `src/components/TestUnifiedHooks.tsx` | `TestUnifiedHooks` | — | — | — |
| `src/components/TestUnifiedHooksSimple.tsx` | `TestUnifiedHooksSimple` | — | — | — |
| `src/components/shared/Advert.tsx` | `Advert` | — | — | — |
| `src/components/shared/AttendanceLeaveTrends.tsx` | `AttendanceLeaveTrends` | — | — | — |
| `src/components/shared/ConfirmationModal.tsx` | `ConfirmationModal` | — | — | — |
| `src/components/shared/DeleteConfirmationModal.tsx` | `DeleteConfirmationModal` | — | — | — |
| `src/components/shared/DetailField.tsx` | `DetailField` | — | — | — |
| `src/components/shared/DocumentViewer.tsx` | `DocumentViewer` | — | — | — |
| `src/components/shared/ExportModal.tsx` | — | — | — | 1 const · 1 type |
| `src/components/shared/FileUpload.tsx` | `FileUpload` | — | — | — |
| `src/components/shared/FileUploadButton.tsx` | `FileUploadButton` | — | — | — |
| `src/components/shared/MultiDocumentUploader.tsx` | `MultiDocumentUploader` | — | — | — |
| `src/components/shared/Pagination.tsx` | `Pagination` | — | — | — |
| `src/components/shared/PhoneInput.tsx` | `PhoneInput` | — | — | — |
| `src/components/shared/PromotionalPanel.tsx` | `PromotionalPanel` | — | — | — |
| `src/components/shared/ReportCard.tsx` | `ReportCard` | — | — | — |
| `src/components/shared/SimpleFileUpload.tsx` | `SimpleFileUpload` | — | — | — |
| `src/components/shared/StatusModal.tsx` | `StatusModal` | — | — | — |
| `src/components/shared/SuccessModal.tsx` | `SuccessModal` | — | — | — |
| `src/components/exit/AssetReturnModal.tsx` | `AssetReturnModal` | — | — | — |
| `src/components/exit/AssetReturnTemplateModal.tsx` | `AssetReturnTemplateModal` | — | — | — |
| `src/components/exit/ChecklistItemModal.tsx` | `ChecklistItemModal` | — | — | — |
| `src/components/exit/ChecklistTemplateManagement.tsx` | `ChecklistTemplateManagement` | — | — | — |
| `src/components/exit/ChecklistTemplateModal.tsx` | `ChecklistTemplateModal` | — | — | — |
| `src/components/exit/ClearanceModals.tsx` | `ClearanceModals` | — | — | 1 type |
| `src/components/exit/ClearanceTemplateModal.tsx` | `ClearanceTemplateModal` | — | — | — |
| `src/components/exit/DeleteInterviewDialog.tsx` | `DeleteInterviewDialog` | — | — | — |
| `src/components/exit/EditInterviewModal.tsx` | `EditInterviewModal` | — | — | — |
| `src/components/exit/ExportOffboardingReportModal.tsx` | `ExportOffboardingReportModal` | — | — | — |
| `src/components/exit/HandoverTaskModal.tsx` | `HandoverTaskModal` | — | — | — |
| `src/components/exit/HandoverTemplateModal.tsx` | `HandoverTemplateModal` | — | — | — |
| `src/components/exit/MarkCompletedModal.tsx` | `MarkCompletedModal` | — | — | — |
| `src/components/exit/MarkInterviewCompletedDialog.tsx` | `MarkInterviewCompletedDialog` | — | — | — |
| `src/components/exit/ScheduleInterviewModal.tsx` | `ScheduleInterviewModal` | — | — | — |
| `src/components/exit/StartAssetReturnTaskModal.tsx` | `StartAssetReturnTaskModal` | — | — | — |
| `src/components/exit/StartClearanceTaskModal.tsx` | `StartClearanceTaskModal` | — | — | — |
| `src/components/exit/StartHandoverTaskModal.tsx` | `StartHandoverTaskModal` | — | — | — |
| `src/components/exit/TaskStatusButton.tsx` | `TaskStatusButton` | — | — | 1 type |
| `src/components/exit/TemplateItemModal.tsx` | `TemplateItemModal` | — | — | — |
| `src/components/exit/ViewAssetReturnModal.tsx` | `ViewAssetReturnModal` | — | — | — |
| `src/components/exit/ViewChecklistItemModal.tsx` | `ViewChecklistItemModal` | — | — | — |
| `src/components/exit/ViewClearanceModal.tsx` | `ViewClearanceModal` | — | — | — |
| `src/components/exit/ViewHandoverTaskModal.tsx` | `ViewHandoverTaskModal` | — | — | — |
| `src/components/exit/ViewInterviewDetailsModal.tsx` | `ViewInterviewDetailsModal` | — | — | — |
| `src/components/helpdesk/HelpdeskNavigation.tsx` | `HelpdeskNavigation` | — | — | — |
| `src/components/helpdesk/TicketPriorityBadge.tsx` | `TicketPriorityBadge` | — | — | — |
| `src/components/helpdesk/TicketStatusBadge.tsx` | `TicketStatusBadge` | — | — | — |
| `src/components/error-boundary/ErrorBoundary.tsx` | `ErrorBoundary` | — | — | — |
| `src/components/error-boundary/ErrorBoundaryTest.tsx` | `ErrorBoundaryTest`, `ErrorBoundaryTestWithBoundary` | — | — | — |
| `src/components/integrations/IntegrationDashboard.tsx` | `IntegrationDashboard` | — | — | — |
| `src/components/integrations/IntegrationProviderForm.tsx` | `IntegrationProviderForm` | — | — | — |
| `src/components/integrations/IntegrationProviderList.tsx` | `IntegrationProviderList` | — | — | — |
| `src/components/attendance/ClockInOut.tsx` | `ClockInOut` | — | — | — |
| `src/components/performance/PerformanceDashboardCard.tsx` | `PerformanceDashboardCard` | — | — | — |
| `src/components/performance/PerformanceDashboardDeck.tsx` | `PerformanceDashboardDeck` | — | — | — |
| `src/components/performance/TeamObjectiveCard.tsx` | `TeamObjectiveCard` | — | — | — |
| `src/components/performance/modals/AddTaskModal.tsx` | `AddTaskModal` | — | — | 1 type |
| `src/components/performance/modals/CreateCompanyGoalModal.tsx` | `CreateCompanyGoalModal` | — | — | — |
| `src/components/performance/modals/CreateCompetencyModal.tsx` | `CreateCompetencyModal` | — | — | — |
| `src/components/performance/modals/CreateReviewCycleModal.tsx` | `CreateReviewCycleModal` | — | — | — |
| `src/components/performance/modals/CreateTeamObjective.tsx` | `CreateTeamObjective` | — | — | — |
| `src/components/performance/modals/EditObjectiveModal.tsx` | `EditObjectiveModal` | — | — | — |
| `src/components/performance/modals/ManageQuestionsModal.tsx` | `ManageQuestionsModal` | — | — | — |
| `src/components/performance/modals/ManagerQuestionsModal.tsx` | `ManagerQuestionsModal` | — | — | — |
| `src/components/performance/modals/PastReviewCycleModal.tsx` | `PastReviewCycleModal` | — | — | — |
| `src/components/performance/modals/QuestionStatusModal.tsx` | `QuestionStatusModal` | — | — | — |
| `src/components/performance/modals/ViewSelfAppraisalQuestionsModal.tsx` | `ViewSelfAppraisalQuestionsModal` | — | — | — |
| `src/components/dashboard/ActivityList.tsx` | `ActivityList` | — | — | 1 type |
| `src/components/dashboard/AdvancedDashboardCard.tsx` | `AdvancedDashboardCard` | — | — | 1 type |
| `src/components/dashboard/AttendanceOverview.tsx` | `AttendanceOverview` | — | — | — |
| `src/components/dashboard/DashboardActionCard.tsx` | `DashboardActionCard` | — | — | — |
| `src/components/dashboard/DashboardCard.tsx` | `DashboardCard`, `DashboardGrid` | — | — | 1 type |
| `src/components/dashboard/DashboardStats.tsx` | `DashboardStats` | — | — | 1 type |
| `src/components/dashboard/QuickActions.tsx` | `QuickActions`, `CompactQuickActions` | — | — | 2 types |
| `src/components/dashboard/RecentActivity.tsx` | `RecentActivity` | — | — | 2 types |
| `src/components/dashboard/types.ts` | — | — | — | 8 types |
| `src/components/dashboard/DashboardGrid/DashboardGrid.tsx` | `DashboardGrid` | — | — | 1 type |
| `src/components/dashboard/RealTimeActivityFeed/RealTimeActivityFeed.tsx` | `RealTimeActivityFeed` | — | — | 1 type |
| `src/components/dashboard/AdvancedDashboardStats/AdvancedDashboardStats.tsx` | `AdvancedDashboardStats` | — | — | 2 types |
| `src/components/payroll/AllowanceTypeForm.tsx` | `AllowanceTypeForm` | — | — | — |
| `src/components/payroll/DeductionTypeForm.tsx` | `DeductionTypeForm`, `PAYETaxForm` | — | — | — |
| `src/components/payroll/ExpandableSummary.tsx` | `ExandableSummary` | — | — | 2 types |
| `src/components/payroll/PaymentSchedule.tsx` | `PaymentScheduleComponent` | — | — | 1 type |
| `src/components/payroll/PayrollDashboard.tsx` | `PayrollDashboard` | — | — | — |
| `src/components/payroll/PayrollItemManager.tsx` | `PayrollItemManager` | — | — | — |
| `src/components/payroll/PayrollRunWizard.tsx` | `PayrollRunWizard` | — | — | — |
| `src/components/payroll/PayrollTypesTable.tsx` | `PayrollTypesTable` | — | — | — |
| `src/components/payroll/SalaryBreakdownPopover.tsx` | `SalaryBreakdownPopover` | — | — | — |
| `src/components/payroll/SalaryStructureDetail.tsx` | `SalaryStructureDetail` | — | — | — |
| `src/components/payroll/SalarySummary.tsx` | `SalarySummary` | — | — | 1 type |
| `src/components/payroll/SearchAndFilter.tsx` | `SearchAndFilters` | — | — | — |
| `src/components/payroll/TabNavigation.tsx` | `TabNavigation` | — | — | — |
| `src/components/payroll/TaxBracketsPopover.tsx` | `TaxBracketsPopover` | — | — | — |
| `src/components/payroll/TaxConfiguration.tsx` | `TaxConfiguration` | — | — | — |
| `src/components/payroll/TransactionDetailModal.tsx` | `TransactionDetailModal` | — | — | — |
| `src/components/payroll/modals/AddPayrollItemModal.tsx` | `AddPayrollItemModal` | — | — | — |
| `src/components/payroll/modals/EditPayrollItem.tsx` | `EditPayrollItemModal` | — | — | 1 type |
| `src/components/payroll/LoanManager/LoanDetail.tsx` | `LoanDetail` | — | — | — |
| `src/components/payroll/LoanManager/LoanForm.tsx` | `LoanForm` | — | — | — |
| `src/components/payroll/LoanManager/LoanList.tsx` | — | — | — | 1 const · 1 type |
| `src/components/payroll/LoanManager/LoanManager.tsx` | `LoanManager` | — | — | — |
| `src/components/payroll/LoanManager/LoanSummaryCard.tsx` | `LoanSummaryCard` | — | — | — |
| `src/components/payroll/LoanManager/modals/LoanRejectionModal.tsx` | `LoanRejectionModal` | — | — | — |
| `src/components/payroll/ReimbursementManager/ReimbursementDetail.tsx` | `ReimbursementDetail` | — | — | — |
| `src/components/payroll/ReimbursementManager/ReimbursementForm.tsx` | `ReimbursementForm` | — | — | — |
| `src/components/payroll/ReimbursementManager/ReimbursementList.tsx` | — | — | — | 1 const · 1 type |
| `src/components/payroll/ReimbursementManager/ReimbursementManager.tsx` | `ReimbursementManager` | — | — | — |
| `src/components/payroll/ReimbursementManager/ReimbursementSummaryCard.tsx` | `ReimbursementSummaryCard` | — | — | — |
| `src/components/payroll/forms/PayrollInformation.tsx` | `PayrollInformation` | — | — | — |
| `src/components/payroll/forms/PayrollReview.tsx` | `PayrollReview` | — | — | — |
| `src/components/payroll/DeductionManager/AllDeductionsTab.tsx` | `AllDeductionsTab` | — | — | — |
| `src/components/payroll/DeductionManager/DeductionDashboard.tsx` | `DeductionDashboard` | — | — | — |
| `src/components/payroll/DeductionManager/DeductionDetailsModal.tsx` | `DeductionDetailsModal` | — | — | — |
| `src/components/payroll/DeductionManager/DeductionManager.tsx` | `DeductionManager` | — | — | — |
| `src/components/payroll/DeductionManager/DeductionTypeForm.tsx` | `DeductionTypeForm` | — | — | — |
| `src/components/payroll/DeductionManager/DeductionTypeList.tsx` | `DeductionTypeList` | — | — | — |
| `src/components/payroll/DeductionManager/EmployeeDeductionForm.tsx` | `EmployeeDeductionForm` | — | — | — |
| `src/components/payroll/DeductionManager/EmployeeDeductionList.tsx` | `EmployeeDeductionList` | — | — | — |
| `src/components/payroll/DeductionManager/EmployeeRecordsModal.tsx` | `EmployeeRecordsModal` | — | — | — |
| `src/components/payroll/DeductionManager/MarkAsRemittedModal.tsx` | `MarkAsRemittedModal` | — | — | — |
| `src/components/payroll/AllowanceManager/AllowanceManager.tsx` | `AllowanceManager` | — | — | — |
| `src/components/payroll/AllowanceManager/AllowanceTypeList.tsx` | — | — | — | 1 const · 1 type |
| `src/components/payroll/AllowanceManager/BatchEmployeeAllowanceForm.tsx` | `BatchEmployeeAllowanceForm` | — | — | — |
| `src/components/payroll/AllowanceManager/EmployeeAllowanceForm.tsx` | `EmployeeAllowanceForm` | — | — | — |
| `src/components/payroll/AllowanceManager/EmployeeAllowanceList.tsx` | — | — | — | 1 const · 1 type |
| `src/components/common/CountryCurrencySelector.tsx` | `CountryCurrencySelector` | — | — | 1 type |
| `src/components/common/CountryCurrencySelectorWithSearch.tsx` | `CountryCurrencySelectorWithSearch` | — | — | 1 type |
| `src/components/common/CountrySelector.tsx` | `CountrySelector` | — | — | 1 type |
| `src/components/common/CountrySelectorWithSearch.tsx` | `CountrySelectorWithSearch` | — | — | 1 type |
| `src/components/common/CurrencySelector.tsx` | `CurrencySelector` | — | — | 1 type |
| `src/components/common/CurrencySelectorWithSearch.tsx` | `CurrencySelectorWithSearch` | — | — | 1 type |
| `src/components/common/FormCheckbox.tsx` | `FormCheckbox` | — | — | — |
| `src/components/common/FormInput.tsx` | `FormInput` | — | — | — |
| `src/components/common/FormRadio.tsx` | `FormRadio` | — | — | — |
| `src/components/common/FormSelect.tsx` | `FormSelect` | — | — | — |
| `src/components/forms/EmployeeMultiSelect.tsx` | `EmployeeMultiSelect` | — | — | — |
| `src/components/forms/EmployeeSearchSelect.tsx` | `EmployeeSearchSelect` | — | — | — |
| `src/components/forms/EmployeeSelect.tsx` | `EmployeeSelect` | — | — | — |
| `src/components/forms/FormLayout.tsx` | `FormLayout`, `FormField`, `FormSection`, `FormActions` | — | — | 2 types |
| `src/components/data/DataTable.tsx` | `DataTable` | — | — | 2 types |
| `src/components/leave/ApprovalWorkflowConfiguration.tsx` | `ApprovalWorkflowConfiguration` | — | — | — |
| `src/components/leave/AttendanceLeaveChart.tsx` | `AttendanceLeaveChartComponent` | — | — | — |
| `src/components/leave/BulkActionHandlers.tsx` | `BulkActionHandlers` | — | — | — |
| `src/components/leave/CompanyTable.tsx` | `CompanyTable` | — | — | — |
| `src/components/leave/DataTable.tsx` | `DataTable` | — | — | 1 type |
| `src/components/leave/DateRangePicker.tsx` | `DateRangePicker` | — | — | — |
| `src/components/leave/EmployeeSelector.tsx` | `EmployeeSelector` | — | — | — |
| `src/components/leave/EmployeeTable.tsx` | `EmployeeTable` | — | — | — |
| `src/components/leave/EmptyState.tsx` | `EmptyState`, `EmptyStateVariants`, `TableEmptyState`, `IllustrationEmptyState` | — | — | — |
| `src/components/leave/ExportFunctionality.tsx` | `ExportFunctionality` | — | — | — |
| `src/components/leave/HolidayManagementForm.tsx` | `HolidayManagementForm` | — | — | 1 type |
| `src/components/leave/HolidayTypeForm.tsx` | `HolidayTypeForm` | — | — | — |
| `src/components/leave/LeaveAllocationForm.tsx` | `LeaveAllocationForm` | — | — | — |
| `src/components/leave/LeaveBalanceCalculator.tsx` | `LeaveBalanceCalculator` | — | — | — |
| `src/components/leave/LeaveBalanceCard.tsx` | `LeaveBalanceCard` | — | — | — |
| `src/components/leave/LeaveBalanceOverview.tsx` | `LeaveBalanceOverview` | — | — | — |
| `src/components/leave/LeaveCalendar.tsx` | `LeaveCalendar` | — | — | — |
| `src/components/leave/LeaveRequestForm.tsx` | `LeaveRequestForm` | — | — | — |
| `src/components/leave/LeaveRequestsTable.tsx` | `LeaveRequestsTable` | — | — | — |
| `src/components/leave/LeaveSettingsForm.tsx` | `LeaveSettingsForm` | — | — | — |
| `src/components/leave/LeaveTypeConfigurationForm.tsx` | `LeaveTypeConfigurationForm` | — | — | — |
| `src/components/leave/LoadingSpinner.tsx` | `LoadingSpinner`, `InlineLoadingSpinner`, `PageLoading`, `SkeletonLoader` | — | — | — |
| `src/components/leave/Modal.tsx` | `Modal` | — | — | — |
| `src/components/leave/NotificationContext.ts` | — | — | — | 1 const |
| `src/components/leave/NotificationSystem.tsx` | `NotificationProvider` | — | — | — |
| `src/components/leave/QuickActionButtons.tsx` | `QuickActionButtons` | — | — | — |
| `src/components/leave/RecentLeaveRequestsTable.tsx` | `RecentLeaveRequestsTable` | — | — | — |
| `src/components/leave/StatisticsCard.tsx` | `StatisticsCard` | — | — | — |
| `src/components/leave/StatusBadge.tsx` | `StatusBadge` | — | — | 1 type |
| `src/components/leave/TeamLeaveCalendar.tsx` | `TeamLeaveCalendar` | — | — | 1 type |
| `src/components/leave/UpcomingHolidaysList.tsx` | `UpcomingHolidaysList` | — | — | — |
| `src/components/leave/modals/AddNewLeaveType.tsx` | `AddNewLeaveType` | — | — | — |
| `src/components/leave/modals/EditLeaveBalance.tsx` | `EditLeaveBalance` | — | — | — |
| `src/components/leave/modals/ExportLeaveBalanceModal.tsx` | `ExportLeaveBalancesModal` | — | — | — |
| `src/components/leave/modals/ExportLeaveRequestsModal.tsx` | `ExportLeaveRequestsModal` | — | — | — |
| `src/components/knowledge-base/ArchivedArticles.tsx` | `ArchivedArticles` | — | — | — |
| `src/components/knowledge-base/ArticleCard.tsx` | `ArticleCard` | — | — | — |
| `src/components/knowledge-base/ArticleForm.tsx` | `ArticleForm` | — | — | — |
| `src/components/knowledge-base/ArticleFormPage.tsx` | `ArticleFormPage` | — | — | — |
| `src/components/knowledge-base/ArticleSearch.tsx` | `ArticleSearch` | — | — | — |
| `src/components/knowledge-base/ArticleViewer.tsx` | `ArticleViewer` | — | — | — |
| `src/components/knowledge-base/ArticlesByCategory.tsx` | `ArticlesByCategory` | — | — | — |
| `src/components/knowledge-base/AttachmentList.tsx` | `AttachmentList` | — | — | — |
| `src/components/knowledge-base/AttachmentManager.tsx` | `AttachmentManager` | — | — | — |
| `src/components/knowledge-base/AttachmentUpload.tsx` | `AttachmentUpload` | — | — | — |
| `src/components/knowledge-base/BookmarksList.tsx` | `BookmarksList` | — | — | — |
| `src/components/knowledge-base/DraftsList.tsx` | `DraftsList` | — | — | — |
| `src/components/knowledge-base/FeaturedArticles.tsx` | `FeaturedArticles` | — | — | — |
| `src/components/knowledge-base/FeedbackSummary.tsx` | `FeedbackSummary` | — | — | — |
| `src/components/knowledge-base/KnowledgeBaseDashboard.tsx` | `KnowledgeBaseDashboard` | — | — | — |
| `src/components/knowledge-base/KnowledgeBaseNavigation.tsx` | `KnowledgeBaseNavigation` | — | — | — |
| `src/components/knowledge-base/MostViewedArticles.tsx` | `MostViewedArticles` | — | — | — |
| `src/components/knowledge-base/RecentArticles.tsx` | `RecentArticles` | — | — | — |
| `src/components/assets/AssetAssignmentDetails.tsx` | `AssetAssignmentDetails` | — | — | — |
| `src/components/assets/AssetAssignmentForm.tsx` | `AssetAssignmentForm` | — | — | — |
| `src/components/assets/AssetAssignmentHistory.tsx` | `AssetAssignmentHistory` | — | — | — |
| `src/components/assets/AssetAssignmentList.tsx` | `AssetAssignmentList` | — | — | — |
| `src/components/assets/AssetDetails.tsx` | `AssetDetails` | — | — | — |
| `src/components/assets/AssetForm.tsx` | `AssetForm` | — | — | 1 type |
| `src/components/assets/AssetList.tsx` | `AssetList` | — | — | — |
| `src/components/assets/AssetMaintenanceForm.tsx` | `AssetMaintenanceForm` | — | — | — |
| `src/components/assets/AssetMaintenanceHistory.tsx` | `AssetMaintenanceHistory` | — | — | — |
| `src/components/assets/AssignmentForm.tsx` | `AssignmentForm` | — | — | 1 type |
| `src/components/assets/CategoryForm.tsx` | `CategoryForm` | — | — | — |
| `src/components/assets/CategoryList.tsx` | `CategoryList` | — | — | — |
| `src/components/assets/MaintenanceDetails.tsx` | `MaintenanceDetails` | — | — | — |
| `src/components/assets/MaintenanceForm.tsx` | `MaintenanceForm` | — | — | 1 type |
| `src/components/assets/MaintenanceList.tsx` | `MaintenanceList` | — | — | — |
| `src/components/assets/SpecializedAssignmentView.tsx` | `SpecializedAssignmentView` | — | — | — |
| `src/components/assets/SpecializedMaintenanceViews.tsx` | `SpecializedMaintenanceViews` | — | — | — |
| `src/components/employees/AboutTab.tsx` | `AboutTab` | — | — | — |
| `src/components/employees/ActionForm.tsx` | `ActionForm` | — | — | — |
| `src/components/employees/AddNoteForm.tsx` | `AddNoteForm` | — | — | — |
| `src/components/employees/ApprovalActionMenu.tsx` | `ApprovalActionMenu` | — | — | — |
| `src/components/employees/ApprovalButtons.tsx` | `ApprovalButtons`, `QuickApproval` | — | — | — |
| `src/components/employees/AssignSummaryCard.tsx` | `AssignSummaryCard`, `RotatingShiftSummary` | — | — | — |
| `src/components/employees/AttendanceTab.tsx` | `AttendanceTab` | — | — | — |
| `src/components/employees/BulkActionMenu.tsx` | `BulkActionMenu` | — | — | — |
| `src/components/employees/BulkDocumentUpdateExample.tsx` | `BulkDocumentUpdateExample` | — | — | — |
| `src/components/employees/ChartToolbar.tsx` | `ChartToolbar` | — | — | — |
| `src/components/employees/CollapsibleSection.tsx` | `CollapsibleSection` | — | — | — |
| `src/components/employees/DepartmentCompositionChart.tsx` | `Tooltip`, `CustomTooltipContent`, `DepartmentCompositionChart` | — | — | — |
| `src/components/employees/DepartmentFilter.tsx` | `DepartmentFilter`, `QuickDepartmentFilters` | — | — | — |
| `src/components/employees/DisciplinaryManagement.tsx` | `DisciplinaryManagement` | — | — | — |
| `src/components/employees/DocumentManagement.tsx` | `DocumentManagement` | — | — | — |
| `src/components/employees/DocumentRequestManagement.tsx` | `DocumentRequestManagement` | — | — | — |
| `src/components/employees/DocumentUploadModal.tsx` | `DocumentUploadModal` | — | — | — |
| `src/components/employees/EmployeeCard.tsx` | `EmployeeCard` | — | — | — |
| `src/components/employees/EmployeeDirectory.integration.tsx` | `EmployeeDirectoryIntegration` | — | — | — |
| `src/components/employees/EmployeeDirectory.tsx` | `EmployeeDirectory` | — | — | — |
| `src/components/employees/EmployeeDocumentUploadExample.tsx` | `EmployeeDocumentUploadExample` | — | — | — |
| `src/components/employees/EmployeeDropdown.tsx` | `EmployeeDropdown` | — | — | 2 types |
| `src/components/employees/EmployeeForm.tsx` | `EmployeeForm` | — | — | 1 type |
| `src/components/employees/EmployeeListItem.tsx` | `EmployeeListItem` | — | — | — |
| `src/components/employees/EmployeeListSkeleton.tsx` | `EmployeeListSkeleton`, `EmployeeCardSkeleton` | — | — | — |
| `src/components/employees/EmployeeMiniTable.tsx` | `EmployeeMiniTable` | — | — | — |
| `src/components/employees/EmployeeShiftManagement.tsx` | `EmployeeShiftManagement` | — | — | — |
| `src/components/employees/EmployeeSummary.tsx` | `EmployeeExportButton` | — | — | — |
| `src/components/employees/EmployeeSummaryCard.tsx` | `EmployeeSummaryCard`, `EmployeeMetrics` | — | — | — |
| `src/components/employees/EnhancedEmployeeForm.tsx` | `EnhancedEmployeeForm` | — | — | 1 type |
| `src/components/employees/LeaveAttendanceTrends.tsx` | `LeaveAttendanceTrendsChart` | — | — | — |
| `src/components/employees/LeaveTab.tsx` | `LeaveTab` | — | — | — |
| `src/components/employees/ModernOrgChart.tsx` | `ModernOrgChart` | — | — | 1 type |
| `src/components/employees/NodeCard.tsx` | `NodeCard` | — | — | — |
| `src/components/employees/OrganizationalChart.tsx` | `OrganizationalChart` | — | — | — |
| `src/components/employees/PhotoUploader.tsx` | `PhotoUploader` | — | — | — |
| `src/components/employees/PolicyDetailModal.tsx` | `PolicyDetailModal` | — | — | — |
| `src/components/employees/PolicyManagement.tsx` | `PolicyManagement` | — | — | — |
| `src/components/employees/PolicySearchBar.tsx` | `PolicySearchBar` | — | — | — |
| `src/components/employees/PolicyTypeManagement.tsx` | `PolicyTypeManagement` | — | — | — |
| `src/components/employees/ProfileHeader.tsx` | `ProfileHeader` | — | — | — |
| `src/components/employees/ProfileSidebarTabs.tsx` | `ProfileSidebarTabs` | — | — | 1 type |
| `src/components/employees/RequestFilterBar.tsx` | `RequestFilterBar` | — | — | — |
| `src/components/employees/RequestTable.tsx` | `RequestTable` | — | — | — |
| `src/components/employees/RotatingShiftAssignment.tsx` | `RotatingShiftAssignment` | — | — | — |
| `src/components/employees/RotatingShiftCalendar.tsx` | `RotatingShiftCalendar` | — | — | — |
| `src/components/employees/RotatingShiftRequestManagement.tsx` | `RotatingShiftRequestManagement` | — | — | — |
| `src/components/employees/RotatingWorkTypeAssignment.tsx` | `RotatingWorkTypeAssignment` | — | — | — |
| `src/components/employees/RotationSummaryCard.tsx` | `RotationSummaryCard`, `RotatingWorkTypeSummary` | — | — | — |
| `src/components/employees/S3DocumentUpload.tsx` | `S3DocumentUpload` | — | — | 2 types |
| `src/components/employees/SearchBar.tsx` | `SearchBar` | — | — | — |
| `src/components/employees/ShiftAssignForm.tsx` | `ShiftAssignForm` | — | — | — |
| `src/components/employees/ShiftRequestForm.tsx` | `ShiftRequestForm` | — | — | — |
| `src/components/employees/ShiftRequestManagement.tsx` | `ShiftRequestManagement` | — | — | — |
| `src/components/employees/ShiftStatusBadge.tsx` | `ShiftStatusBadge`, `ShiftRequestStatusBadge`, `ShiftAssignmentStatusBadge`, `ShiftCompletionStatusBadge` | — | — | — |
| `src/components/employees/ShiftTemplateSelector.tsx` | `ShiftTemplateSelector` | — | — | — |
| `src/components/employees/TabContentArea.tsx` | `TabContentArea` | — | — | — |
| `src/components/employees/ViewEmployeeModal.tsx` | `ViewEmployeeModal` | — | — | 1 type |
| `src/components/employees/WorkStructureSummary.tsx` | `WorkforceStructurePDF`, `ExportWorkforceStructure` | — | — | — |
| `src/components/employees/WorkTypeAssignForm.tsx` | `WorkTypeAssignForm` | — | — | — |
| `src/components/employees/WorkTypeManagement.tsx` | `WorkTypeManagement` | — | — | — |
| `src/components/employees/WorkTypeRequestForm.tsx` | `WorkTypeRequestForm` | — | — | — |
| `src/components/employees/WorkTypeRequestManagement.tsx` | `WorkTypeRequestManagement` | — | — | — |
| `src/components/employees/WorkTypeStatusBadge.tsx` | `WorkTypeStatusBadge`, `WorkTypeRequestStatusBadge`, `WorkTypeAssignmentStatusBadge`, `WorkTypeCompletionStatusBadge`, `OfficeWorkTypeBadge`, `RemoteWorkTypeBadge`, `HybridWorkTypeBadge`, `FieldWorkTypeBadge`, `TravelWorkTypeBadge` | — | — | — |
| `src/components/employees/modals/AddEmployeeModal.tsx` | `AddEmployeeModal` | — | — | — |
| `src/components/employees/modals/ApproveDocumentRequestModal.tsx` | `ApproveDocumentRequestModal` | — | — | — |
| `src/components/employees/modals/CreateDisciplinaryActionModal.tsx` | `CreateDisciplinaryActionModal` | — | — | — |
| `src/components/employees/modals/CreateDocumentRequestModal.tsx` | `CreateDocumentRequestModal` | — | — | — |
| `src/components/employees/modals/CreateEmployeeShiftModal.tsx` | `CreateEmployeeShiftModal` | — | — | — |
| `src/components/employees/modals/CreatePolicyModal.tsx` | `CreatePolicyModal` | — | — | — |
| `src/components/employees/modals/CreatePolicyTypeModal.tsx` | `CreatePolicyTypeModal` | — | — | — |
| `src/components/employees/modals/CreateRotatingShiftAssignmentModal.tsx` | `CreateRotatingShiftAssignmentModal` | — | — | — |
| `src/components/employees/modals/CreateRotatingWorkTypeAssignmentModal.tsx` | `CreateRotatingWorkTypeAssignmentModal` | — | — | — |
| `src/components/employees/modals/CreateShiftRequestModal.tsx` | `CreateShiftRequestModal` | — | — | — |
| `src/components/employees/modals/CreateWorkTypeRequestModal.tsx` | `CreateWorkTypeRequestModal` | — | — | — |
| `src/components/employees/modals/DeleteConfirmationModal.tsx` | `DeleteConfirmationModal` | — | — | — |
| `src/components/employees/modals/EditDisciplinaryActionModal.tsx` | `EditDisciplinaryActionModal` | — | — | — |
| `src/components/employees/modals/EditDocumentRequestModal.tsx` | `EditDocumentRequestModal` | — | — | — |
| `src/components/employees/modals/EditEmployeeShiftModal.tsx` | `EditEmployeeShiftModal` | — | — | — |
| `src/components/employees/modals/EditPolicyModal.tsx` | `EditPolicyModal` | — | — | — |
| `src/components/employees/modals/EditPolicyTypeModal.tsx` | `EditPolicyTypeModal` | — | — | — |
| `src/components/employees/modals/EditRotatingShiftAssignmentModal.tsx` | `EditRotatingShiftAssignmentModal` | — | — | — |
| `src/components/employees/modals/EditRotatingWorkTypeAssignmentModal.tsx` | `EditRotatingWorkTypeAssignmentModal` | — | — | — |
| `src/components/employees/modals/EditShiftRequestModal.tsx` | `EditShiftRequestModal` | — | — | — |
| `src/components/employees/modals/EditWorkTypeRequestModal.tsx` | `EditWorkTypeRequestModal` | — | — | — |
| `src/components/employees/modals/EmployeeQuickViewModal.tsx` | `EmployeeQuickViewModal` | — | — | — |
| `src/components/employees/modals/ExportEmployeesModal.tsx` | `ExportEmployeesModal` | — | — | — |
| `src/components/employees/modals/ImportEmployeesModal.tsx` | `ImportEmployeesModal` | — | — | — |
| `src/components/employees/modals/RejectDocumentRequestModal.tsx` | `RejectDocumentRequestModal` | — | — | — |
| `src/components/employees/modals/RejectShiftRequestModal.tsx` | `RejectShiftRequestModal` | — | — | — |
| `src/components/employees/modals/SendEmailModal.tsx` | `SendEmailModal` | — | — | 1 type |
| `src/components/employees/modals/UploadDocumentModal.tsx` | `UploadDocumentModal` | — | — | — |
| `src/components/employees/modals/UploadPhotoModal.tsx` | `UploadPhotoModal` | — | — | — |
| `src/components/employees/modals/ViewDisciplinaryActionModal.tsx` | `ViewDisciplinaryActionModal` | — | — | — |
| `src/components/employees/modals/ViewDocumentRequestModal.tsx` | `ViewDocumentRequestModal` | — | — | — |
| `src/components/employees/modals/ViewEmployeeShiftModal.tsx` | `ViewEmployeeShiftModal` | — | — | — |
| `src/components/employees/modals/ViewPolicyModal.tsx` | `ViewPolicyModal` | — | — | — |
| `src/components/employees/modals/ViewRotatingShiftAssignmentModal.tsx` | `ViewRotatingShiftAssignmentModal` | — | — | — |
| `src/components/employees/modals/ViewRotatingWorkTypeAssignmentModal.tsx` | `ViewRotatingWorkTypeAssignmentModal` | — | — | — |
| `src/components/employees/modals/ViewShiftRequestModal.tsx` | `ViewShiftRequestModal` | — | — | — |
| `src/components/employees/modals/ViewWorkTypeModal.tsx` | `ViewWorkTypeModal` | — | — | — |
| `src/components/employees/modals/ViewWorkTypeRequestModal.tsx` | `ViewWorkTypeRequestModal` | — | — | — |
| `src/components/employees/cards/EmployeeStatsCard.tsx` | `EmployeeStatsCard` | — | — | 1 type |
| `src/components/employees/forms/DocumentUploadDropdown.tsx` | `DocumentUploadDropdown` | — | — | — |
| `src/components/employees/forms/EmergencyContactDropdown.tsx` | `EmergencyContactDropdown` | — | — | — |
| `src/components/employees/forms/EmployeeCompensation.tsx` | `EmployeeCompensation` | — | — | — |
| `src/components/employees/forms/EmploymentDetails.tsx` | `EmploymentDetails` | — | — | — |
| `src/components/employees/forms/IdentityEducation.tsx` | `Identity` | — | — | — |
| `src/components/employees/forms/PersonaInformation.tsx` | `PersonalInformation` | — | — | — |
| `src/components/employees/forms/Review.tsx` | `Review` | — | — | — |
| `src/components/employees/forms/SystemAccess.tsx` | `SystemAccess` | — | — | — |
| `src/components/employees/forms/schema.ts` | — | — | — | 3 const · 1 type |
| `src/components/employees/tabs/AllowancesTab.tsx` | `AllowancesTab` | — | — | — |
| `src/components/employees/tabs/AssetsTab.tsx` | `AssetsTab` | — | — | — |
| `src/components/employees/tabs/BonusTab.tsx` | `BonusTab` | — | — | — |
| `src/components/employees/tabs/DocumentsTab.tsx` | `DocumentsTab` | — | — | — |
| `src/components/employees/tabs/PenaltyTab.tsx` | `PenaltyTab` | — | — | — |
| `src/components/employees/tabs/PerformanceTab.tsx` | `PerformanceTab` | — | — | — |
| `src/components/employees/tabs/ResignationTab.tsx` | `ResignationTab` | — | — | — |
| `src/components/employees/tabs/WorkTypeShiftTab.tsx` | `WorkTypeShiftTab` | — | — | — |
| `src/components/employees/employee-test/EmployeeCard/EmployeeCard.test.utils.ts` | — | — | `getStatusBadgeVariant`, `getEmploymentTypeLabel`, `formatDate`, `getInitials`, `createTestEmployee`, `setupTest` | 2 const |
| `src/components/employees/employee-test/EmployeeDirectory/EmployeeDirectory.test.utils.ts` | — | — | `renderWithProviders`, `filterEmployees` | 2 const |
| `src/components/departments/DepartmentDetails.tsx` | `DepartmentDetails` | — | — | — |
| `src/components/departments/DepartmentForm.tsx` | `DepartmentForm` | — | — | — |
| `src/components/departments/DepartmentList.tsx` | `DepartmentList` | — | — | — |
| `src/components/departments/DepartmentStats.tsx` | `DepartmentStats` | — | — | — |
| `src/components/departments/DepartmentTreeView.tsx` | `DepartmentTreeView` | — | — | — |
| `src/components/departments/modals/AssignDepartment.tsx` | `AssignDepartmentModal` | — | — | — |
| `src/components/departments/modals/NewEditDepartment.tsx` | `NewEditDepartment` | — | — | — |
| `src/components/departments/modals/ReassignDepartment.tsx` | `ReAssignDepartmentModal` | — | — | — |
| `src/components/departments/modals/ReassignManager.tsx` | `ReassignManagerModal` | — | — | — |
| `src/components/debug/UserRoleIndicator.tsx` | `UserRoleIndicator` | — | — | — |

---

## Stores — `src/stores`

Client state. Auth, permissions and per-module state.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/stores/auth.store.ts` | — | `useAuthStore` | — | — |
| `src/stores/payroll.store.ts` | — | `usePayrollStore` | — | — |

---

## Services — `src/services`

The HTTP layer: one module per API area.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/services/api/auth.ts` | — | — | — | 1 const · 7 types |
| `src/services/api/client.ts` | — | — | `apiClient` | 1 const |
| `src/services/api/companySettingsService.ts` | — | — | — | 1 const · 5 types |
| `src/services/api/config.ts` | — | — | — | 3 const |
| `src/services/api/health.service.ts` | — | — | — | 1 const · 2 types |
| `src/services/api/loans.ts` | — | — | — | 1 const |
| `src/services/api/payroll.ts` | — | — | — | 1 const · 19 types |
| `src/services/api/reimbursements.ts` | — | — | — | 1 const · 2 types |
| `src/services/api/s3.service.ts` | — | — | `uploadToS3`, `uploadMultipleToS3`, `validateFile`, `uploadImageToS3`, `uploadFile` | 3 types |
| `src/services/api/wallet.service.ts` | — | — | — | 1 const |
| `src/services/api/settings/general-settings.service.ts` | — | — | — | 1 const · 2 types |
| `src/services/api/settings/offboarding-settings.service.ts` | — | — | — | 1 const · 2 types |
| `src/services/api/settings/working-hours.service.ts` | — | — | — | 1 const · 3 types |
| `src/services/api/exit/exit.service.ts` | — | — | — | 1 const |
| `src/services/api/helpdesk/index.ts` | — | — | — | 1 const · 6 types |
| `src/services/api/permission-groups/permission-group.service.ts` | — | — | — | 1 const · 9 types |
| `src/services/api/files/file.service.ts` | — | — | — | 1 const · 4 types |
| `src/services/api/integrations/advanced-search.service.ts` | — | — | — | 1 const · 7 types |
| `src/services/api/integrations/bulk-operations.service.ts` | — | — | — | 1 const · 6 types |
| `src/services/api/integrations/employee-integration.service.ts` | — | — | — | 1 const · 6 types |
| `src/services/api/integrations/integration-provider.service.ts` | — | — | — | 1 const · 5 types |
| `src/services/api/integrations/webhook.service.ts` | — | — | — | 1 const · 5 types |
| `src/services/api/attendance/attendance.service.ts` | — | — | — | 1 const · 9 types |
| `src/services/api/performance/performance.service.ts` | — | — | — | 1 const · 30 types |
| `src/services/api/dashboard/dashboard.service.ts` | — | — | — | `DashboardService` (class) · 1 const · 5 types |
| `src/services/api/currency/exchange-rates.service.ts` | — | — | — | 1 const |
| `src/services/api/payroll/payroll.service.ts` | — | — | — | 1 const · 23 types |
| `src/services/api/payroll/salary-category.service.ts` | — | — | — | 1 const · 7 types |
| `src/services/api/leave/approval-workflow.service.ts` | — | — | — | 1 const · 5 types |
| `src/services/api/leave/holiday.service.ts` | — | — | — | 1 const · 4 types |
| `src/services/api/leave/holidayType.service.ts` | — | — | — | 1 const · 4 types |
| `src/services/api/leave/leave-department.service.ts` | — | — | — | 1 const · 4 types |
| `src/services/api/leave/leave.service.ts` | — | — | — | 1 const · 10 types |
| `src/services/api/leave/leaveBalance.service.ts` | — | — | — | 1 const · 2 types |
| `src/services/api/leave/leaveSettings.service.ts` | — | — | — | 1 const · 2 types |
| `src/services/api/leave/leaveType.service.ts` | — | — | — | 1 const · 3 types |
| `src/services/api/recruitment/recruitment.service.ts` | — | — | — | 1 const · 10 types |
| `src/services/api/onboarding/onboarding.service.ts` | — | — | — | 1 const |
| `src/services/api/company/company.service.ts` | — | — | — | 1 const · 3 types |
| `src/services/api/assets/asset.service.ts` | — | — | — | 1 const · 8 types |
| `src/services/api/assets/assignment.service.ts` | — | — | — | 1 const · 5 types |
| `src/services/api/assets/category.service.ts` | — | — | — | 1 const · 2 types |
| `src/services/api/assets/maintenance.service.ts` | — | — | — | 1 const · 4 types |
| `src/services/api/employees/contact-info.service.ts` | — | — | — | 1 const · 4 types |
| `src/services/api/employees/department.service.ts` | — | — | — | 1 const · 3 types |
| `src/services/api/employees/disciplinary-action.service.ts` | — | — | — | 1 const · 4 types |
| `src/services/api/employees/disciplinary.service.ts` | — | — | — | 1 const · 4 types |
| `src/services/api/employees/document-request.service.ts` | — | — | — | 1 const · 4 types |
| `src/services/api/employees/employee-leave.service.ts` | — | — | — | 1 const |
| `src/services/api/employees/employee-shift-schedule.service.ts` | — | — | — | 1 const · 6 types |
| `src/services/api/employees/employee-shift.service.ts` | — | — | — | 1 const · 8 types |
| `src/services/api/employees/employee-type.service.ts` | — | — | — | 1 const · 4 types |
| `src/services/api/employees/employee.service.backup.ts` | — | — | — | 1 const · 8 types |
| `src/services/api/employees/employee.service.ts` | — | — | — | 1 const · 7 types |
| `src/services/api/employees/employeeDocument.service.ts` | — | — | — | 1 const · 2 types |
| `src/services/api/employees/penalty.service.ts` | — | — | — | 1 const · 5 types |
| `src/services/api/employees/policy-type.service.ts` | — | — | — | 1 const · 3 types |
| `src/services/api/employees/policy.service.ts` | — | — | — | 1 const · 5 types |
| `src/services/api/employees/rotating-shift.service.ts` | — | — | — | 1 const · 4 types |
| `src/services/api/employees/rotating-work-type.service.ts` | — | — | — | 1 const · 4 types |
| `src/services/api/employees/shift-request.service.ts` | — | — | — | 1 const · 4 types |
| `src/services/api/employees/stats.service.ts` | — | — | — | 1 const · 7 types |
| `src/services/api/employees/work-location.service.ts` | — | — | — | `WorkLocationService` (class) · 1 const |
| `src/services/api/employees/work-type-request.service.ts` | — | — | — | 1 const · 4 types |
| `src/services/api/employees/work-type.service.ts` | — | — | — | 1 const · 4 types |
| `src/services/api/departments/department.service.ts` | — | — | — | 1 const |

---

## Hooks — `src/hooks`

Data hooks and behaviour hooks used across screens.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/hooks/disciplinary-actions-hooks-clean.ts` | — | `useUnifiedDisciplinaryActions`, `useUnifiedCreateDisciplinaryAction`, `useUnifiedUpdateDisciplinaryAction`, `useUnifiedDeleteDisciplinaryAction`, `useUnifiedResolveDisciplinaryAction`, `useUnifiedArchiveDisciplinaryAction`, `useUnifiedDisciplinaryActionStats`, `useUnifiedExportDisciplinaryActions` | — | — |
| `src/hooks/disciplinary-actions-hooks.ts` | — | `useUnifiedDisciplinaryActions`, `useUnifiedCreateDisciplinaryAction`, `useUnifiedUpdateDisciplinaryAction`, `useUnifiedDeleteDisciplinaryAction`, `useUnifiedResolveDisciplinaryAction`, `useUnifiedArchiveDisciplinaryAction`, `useUnifiedDisciplinaryActionStats`, `useUnifiedExportDisciplinaryActions` | — | — |
| `src/hooks/disciplinary-test.ts` | — | `useUnifiedDisciplinaryActions`, `useUnifiedCreateDisciplinaryAction`, `useUnifiedUpdateDisciplinaryAction`, `useUnifiedDeleteDisciplinaryAction`, `useUnifiedResolveDisciplinaryAction`, `useUnifiedArchiveDisciplinaryAction`, `useUnifiedDisciplinaryActionStats`, `useUnifiedExportDisciplinaryActions` | — | — |
| `src/hooks/useAppNotifications.ts` | — | `useAppNotifications`, `useMarkNotificationAsRead`, `useMarkAllNotificationsAsRead` | — | — |
| `src/hooks/useAttendance.ts` | — | `useAttendanceList`, `useAttendanceDetails`, `useDeleteAttendance`, `useClockInState`, `useClockIn`, `useClockOut`, `useAttendanceStats`, `useValidateAttendance`, `useRequestRevalidation`, `useApproveOvertime`, `useBulkDeleteAttendance`, `useAttendanceActivities`, `useLateEarlyList`, `useValidationConditions`, `useWorkLocations`, `useAttendanceSummary`, `useAdminAttendanceReport`, `useEmployeeMonthlyStats`, `useHrMetrics`, `useMonthlyMetrics`, `useDepartmentMetrics`, `useAttendanceMetrics`, `useQuarterlyMetrics`, `useRequestCorrection`, `useListCorrectionRequests`, `useExportListCorrectionRequests`, `useRespondToCorrection`, `useDepartmentsList`, `useExportDepartmentMetrics`, `useExportAttendanceMetrics`, `useExportQuarterlyMetrics`, `useExportHrMetrics`, `useExportEmployeeMonthlyStats`, `useExportAdminAttendanceReport` | — | 1 const · 42 types |
| `src/hooks/useAuditLogs.ts` | — | `useAuditLogs`, `useAuditLog`, `useActionTypes`, `useAuditLogEmployees`, `useModuleTypes`, `useComplianceLevels`, `useExportAuditLogs`, `useAuditLogStatistics` | — | 1 type |
| `src/hooks/useAuth.ts` | — | `useLogin`, `useRegister`, `useLogout`, `useProfile`, `useSwitchCompany`, `useCheckCompany`, `useRefreshToken` | — | — |
| `src/hooks/useAuthContext.ts` | — | `useAuthContext` | — | — |
| `src/hooks/useBulkDocumentUpdate.ts` | — | `useBulkDocumentUpdate` | — | — |
| `src/hooks/useCarousel.ts` | — | — | `useCarousel` | — |
| `src/hooks/useCompany.ts` | — | `useCompanies`, `useMyCompanies`, `useCompany`, `useCompanyStats`, `useCreateCompany`, `useUpdateCompany`, `useDeleteCompany`, `useActivateCompany`, `useDeactivateCompany`, `useCompanySettings`, `useUpdateCompanySettings` | — | 1 const |
| `src/hooks/useCompanySettings.ts` | — | `useCompanySettings`, `useWorkTypes`, `useExportWorkTypes`, `useCreateWorkType`, `useUpdateWorkType`, `useDeleteWorkType`, `useWorkLocations`, `useExportWorkLocations`, `useActiveWorkLocations`, `useCreateWorkLocation`, `useUpdateWorkLocation`, `useDeleteWorkLocation`, `useGetCompany`, `useActivateCompany`, `useDeactivateCompany`, `useWorkHours`, `useCreateWorkHours`, `useUpdateWorkHours`, `useDeleteWorkHours`, `useCurrencies`, `useCreateCurrency`, `useUpdateCurrency`, `useDeleteCurrency`, `useSetDefaultWorkHours`, `useSetDefaultCurrency` | — | 16 types |
| `src/hooks/useCountryCurrency.ts` | — | `useCountryCurrency` | — | 2 types |
| `src/hooks/useCurrency.ts` | — | `useCurrency`, `useGlobalCurrency`, `useCurrencyConversion`, `useCurrencyFormatting`, `useEmployeeCurrency` | — | — |
| `src/hooks/useCurrencyExchange.ts` | — | `useLiveRates`, `useSupportedCurrencies`, `useCurrencyConversion`, `useConvertFromUSD`, `useConvertToUSD`, `useHistoricalRates`, `useTimeframeRates`, `useExchangeRate`, `useUSDRates`, `useLiveCurrencyConversion`, `useRefreshExchangeRates` | — | 1 const |
| `src/hooks/useDebounce.tsx` | — | `useDebounce` | — | — |
| `src/hooks/useDeleteMutation.ts` | — | `useDeleteMutation` | — | — |
| `src/hooks/useDepartments.ts` | — | `useDepartments`, `useDepartment`, `useCreateDepartment`, `useUpdateDepartment`, `useDeleteDepartment`, `useDepartmentTree`, `useOrganizationalChart`, `useMoveDepartment`, `useDepartmentEmployees`, `useDepartmentStats`, `useDepartmentsTree`, `useDepartmentsList`, `useActivateDepartment`, `useDeactivateDepartment`, `useBulkAssignDepartment` | — | — |
| `src/hooks/useDummyAssets.ts` | — | `useDummyAssets` | — | — |
| `src/hooks/useDummyAttendance.ts` | — | `useDummyAttendanceRecords`, `useDummyAttendanceRecord`, `useDummyAttendanceStats`, `useDummyAttendanceSummaries`, `useDummyAttendanceSummary`, `useDummyTodayAttendance`, `useDummyClockIn`, `useDummyClockOut` | — | — |
| `src/hooks/useDummyEmployees.ts` | — | `useDummyEmployees`, `useDummyEmployee`, `useDummyEmployeeStats`, `useDummyEmployeeDocuments`, `useDummyAddEmployeeDocument`, `useDummyEmployeeNotes`, `useDummyAddEmployeeNote`, `useDummyOrganizationalChart`, `useDummyDepartments` | — | — |
| `src/hooks/useDummyHelpdesk.ts` | — | `useDummyTickets`, `useDummyTicket`, `useDummyTicketStats`, `useDummyTicketCategories`, `useDummyTicketComments`, `useDummyCreateTicket`, `useDummyAddComment` | — | — |
| `src/hooks/useDummyKnowledgeBase.ts` | — | `useDummyKnowledgeBase`, `useDummyKnowledgeBaseArticle` | — | — |
| `src/hooks/useDummyLeave.ts` | — | `useDummyLeaveTypes`, `useDummyLeaveType`, `useDummyLeaveRequests`, `useDummyLeaveRequest`, `useDummyLeaveBalances`, `useDummyLeaveBalance`, `useDummyLeaveStats`, `useDummyLeaveCalendar`, `useDummyCreateLeaveRequest` | — | — |
| `src/hooks/useDummyPayrollData.ts` | — | `useDummyPayrollData`, `useIsDevelopmentMode`, `useDevelopmentModeIndicator` | — | — |
| `src/hooks/useDummyPerformance.ts` | — | `useDummyGoals`, `useDummyGoal`, `useDummyKeyResults`, `useDummyPerformanceReviews`, `useDummyPerformanceReview`, `useDummyReviewFeedbacks`, `useDummyCompetencies`, `useDummyEmployeeCompetencies`, `useDummyCreateGoal`, `useDummyUpdateGoal`, `useDummyDeleteGoal`, `useDummyDeletePerformanceReview` | — | 1 type |
| `src/hooks/useEmployeeManagement.ts` | — | `useEmployees`, `useEmployee`, `useCreateEmployee`, `useUpdateEmployee`, `useDeleteEmployee`, `useShiftRequests`, `useCreateShiftRequest`, `useApproveShiftRequest`, `useRejectShiftRequest`, `useDocumentRequests`, `useCreateDocumentRequest`, `useUploadDocument`, `useWorkTypeRequests`, `useCreateWorkTypeRequest`, `useApproveWorkTypeRequest`, `useRejectWorkTypeRequest`, `useCancelWorkTypeRequest`, `useRotatingShifts`, `useCreateRotatingShift`, `useRotatingWorkTypes`, `useCreateRotatingWorkType`, `useDisciplinaryActions`, `useCreateDisciplinaryAction`, `usePolicies`, `useEmployeeStats`, `useShiftRequestStats`, `useDocumentRequestStats`, `useBulkEmployeeActions`, `useExportEmployees`, `useExportShiftRequests`, `useEmployeeManagement`, `useRequestManagement`, `useAssignmentManagement`, `useComplianceManagement` | — | — |
| `src/hooks/useEmployeeStats.ts` | — | `useEmployeeStatsOverview`, `useDepartmentBreakdown`, `useEmploymentTypeBreakdown`, `useHiringTrends`, `useTenureAnalysis`, `useLeaveIntegration`, `usePerformanceMetrics`, `useDashboardData`, `useOptimisticEmployees` | — | — |
| `src/hooks/useEmployees.ts` | — | `useEmployees`, `useEmployee`, `useCreateEmployee`, `useUpdateEmployee`, `useDeleteEmployee`, `useEmployeeStats`, `useEmployeeDocuments`, `useAddEmployeeDocument`, `useEmployeeNotes`, `useAddEmployeeNote`, `useImportEmployees`, `useExportEmployees`, `useEmployeeStatus`, `useBulkEmployeeActions`, `useEmployeePhoto`, `useEmployeeLeaveBalance`, `useBulkImportEmployees`, `useEmployeeBulkOperation`, `useAdvancedEmployeeSearch` | — | — |
| `src/hooks/useGeneralSettings.ts` | — | `useGeneralSettings`, `useUpdateGeneralSettings`, `useCurrentCurrency`, `useUpdateCurrency` | — | 1 const |
| `src/hooks/useHelpdesk.ts` | — | `useTicketCategories`, `useTicketCategory`, `useCreateTicketCategory`, `useUpdateTicketCategory`, `useDeleteTicketCategory`, `useTickets`, `useTicket`, `useCreateTicket`, `useUpdateTicket`, `useDeleteTicket`, `useAssignTicket`, `useUpdateTicketStatus`, `useOverdueTickets`, `useMyTickets`, `useTicketStats`, `useComments`, `useTicketComments`, `useComment`, `useCreateComment`, `useUpdateComment`, `useDeleteComment`, `useTicketAttachments`, `useDeleteAttachment`, `useUpdateAttachment`, `useAttachment`, `useKnowledgeBaseArticles`, `useKnowledgeBaseArticle`, `useCreateKnowledgeBaseArticle`, `useUpdateKnowledgeBaseArticle`, `useDeleteKnowledgeBaseArticle`, `usePublishKnowledgeBaseArticle`, `useFeaturedArticles`, `useArticlesByCategory`, `useSearchKnowledgeBaseArticles`, `useMostViewedArticles`, `useRecentArticles`, `useKnowledgeBaseAnalytics`, `useBookmarkArticle`, `useUnbookmarkArticle`, `useMyBookmarks`, `useArchiveArticle`, `useArchivedArticles`, `useSLAPolicies`, `useSLAPolicy`, `useCreateSLAPolicy`, `useUpdateSLAPolicy`, `usePatchSLAPolicy`, `useDeleteSLAPolicy`, `useAttachments`, `useCreateAttachment`, `useKnowledgeBaseAttachments` | — | — |
| `src/hooks/useLeave.ts` | — | `useLeave`, `useLeaveTypes`, `useLeaveType`, `useCreateLeaveType`, `useUpdateLeaveType`, `useDeleteLeaveType`, `useLeaveRequests`, `useLeaveRequest`, `useCreateLeaveRequest`, `useUpdateLeaveRequest`, `useApproveLeaveRequest`, `useRejectLeaveRequest`, `useCancelLeaveRequest`, `useLeaveBalances`, `useLeaveBalanceDashboard`, `useLeaveBalance`, `useLeaveCalendar`, `useLeaveStats`, `useRecalculateLeaveBalance`, `useAdjustLeaveBalance`, `useUpdateLeaveBalance`, `useDeleteLeaveBalance`, `useLeaveDashboard`, `useLeaveDashboardKeyMetrics`, `useLeavePendingApprovals`, `useTeamLeaveCalendar`, `useLeaveDashboardTrends`, `useLeaveDashboardAlerts`, `useLeaveBalanceReport`, `useExportLeaveUtilization`, `useExportLeaveBalances`, `useAttendanceLeaveData` | — | — |
| `src/hooks/useLocalStorage.ts` | — | `useLocalStorage` | — | — |
| `src/hooks/useNotification.ts` | — | `useNotification` | — | — |
| `src/hooks/useOnboarding.ts` | — | `useOnboardingChecklist`, `useOnboardingProcesses`, `useCreateOnboardingProcess`, `useOnboardingProcessDetails`, `useUpdateOnboardingProgress`, `useCompleteOnboardingProcess`, `useVerifyDocument`, `useRejectDocument`, `useCompleteTask`, `useCancelTask`, `useOnboardingStatistics` | — | — |
| `src/hooks/usePayroll.ts` | — | `useSalaryStructures`, `useSalaryStructure`, `useCreateSalaryStructure`, `useUpdateSalaryStructure`, `useDeleteSalaryStructure`, `useSalaryCategories`, `useSalaryCategory`, `useCreateSalaryCategory`, `useUpdateSalaryCategory`, `useDeleteSalaryCategory`, `usePayrollDashboard`, `useUnifiedPayrollRuns`, `usePayrollRun`, `useCreatePayrollRun`, `useProcessPayrollRun`, `useApprovePayrollRun`, `usePublishPayrollRun`, `useCollectPayrollData`, `useCalculatePayroll`, `useSubmitForApproval`, `useMarkPayrollPaid`, `useCancelPayrollRun`, `useDeletePayrollRun`, `useRecalculatePayrollRun`, `usePayrollSummary`, `useReviewSummary`, `useCollectedPayrollData`, `useSimplifiedCollectPayrollData`, `useSimplifiedSubmitForApproval`, `useSimplifiedApprovePayrollRun`, `useSimplifiedMarkPayrollPaid`, `usePayrollItems`, `usePayrollRunItems`, `useUpdatePayrollItem`, `useCreatePayrollItem`, `useTaxConfigurations`, `useTaxConfiguration`, `useCalculateTax`, `useEmployeePayslips`, `useGeneratePayslip`, `useDownloadPayslip`, `useGenerateSinglePayslip`, `usePayslipDetails`, `usePayrollRunPayslips`, `useGeneratePayrollRunPayslips`, `useEditPayrollRunItem`, `useIsPayrollLoading`, `usePayrollStatistics` | — | 1 const |
| `src/hooks/usePenalties.ts` | — | `usePenaltyAccounts`, `usePenaltyAccount`, `useEmployeePenalties`, `usePenaltyStats`, `useCreatePenaltyAccount`, `useUpdatePenaltyAccount`, `useDeletePenaltyAccount`, `useExportPenalties`, `usePenaltyManagement` | — | — |
| `src/hooks/usePerformance.ts` | — | `useGoals`, `useGoal`, `useCreateGoal`, `useUpdateGoal`, `useDeleteGoal`, `usePublishGoal`, `useArchiveGoal`, `useUnarchiveGoal`, `useUpdateGoalProgress`, `useMyGoals`, `useCompleteGoal`, `useCancelGoal`, `useTeamGoals`, `useGoalSummary`, `useOverdueGoals`, `useObjectives`, `useObjective`, `useCreateObjective`, `useUpdateObjective`, `useDeleteObjective`, `useApproveObjective`, `useRejectObjective`, `useSendBackObjective`, `useSubmitObjectiveForReview`, `useRevertObjective`, `useObjectiveGroup`, `useMyObjectives`, `useObjectiveApprovalQueue`, `useTaskSubmissions`, `useTaskSubmission`, `useCreateTaskSubmission`, `useSubmitTasks`, `useReviewTasks`, `useMyTaskHistory`, `useCurrentTaskSubmissionDraft`, `useSubmissionPeriods`, `useSubmissionPeriod`, `useCreateSubmissionPeriod`, `useUpdateSubmissionPeriod`, `useDeleteSubmissionPeriod`, `useTasks`, `useTask`, `useCreateTask`, `useUpdateTask`, `useDeleteTask`, `useReviewCycles`, `useReviewCycle`, `useCreateReviewCycle`, `useActivateReviewCycle`, `useCompleteReviewCycle`, `useDeleteReviewCycle`, `useReviewCycleReminderSummary`, `useSendReviewCycleReminders`, `useReviewCycleQuestions`, `useCreateReviewCycleQuestion`, `useUpdateReviewCycleQuestion`, `useDeleteReviewCycleQuestion`, `useNotifyManagers`, `useGetQuestionStatus`, `useReviewCycleDepartmentQuestions`, `useManagerReviewQuestions`, `usePublishQuestions`, `usePerformanceReviews`, `usePerformanceReview`, `useReviewAppraisalQuestions`, `useManagerView`, `useHrView`, `useCreatePerformanceReview`, `useUpdatePerformanceReview`, `useDeletePerformanceReview`, `useSubmitSelfAppraisal`, `useSubmitManagerAppraisal`, `useApproveReview`, `useMyReviews`, `useReviewsToConduct`, `useBatchApproveReviews`, `useGenerateAiJudgement`, `useUpdateReviewRatings`, `useCompleteReview`, `usePeriodicReviews`, `useConfirmationReviews`, `usePromotionReviews`, `useReviewSummary`, `useMyPerformanceSummary`, `useKeyResults`, `useKeyResult`, `useCreateKeyResult`, `useUpdateKeyResult`, `useDeleteKeyResult`, `useUpdateKeyResultProgress`, `usePerformanceDashboard`, `useEmployeeTrends`, `useTeamPerformanceComparison`, `useGoalCompletionRates`, `useCompetencyHeatmap`, `useAppraisalHistory`, `useAppraisalHistoryTrends`, `useAppraisalHistoryComparison`, `useEmployeeAppraisalHistory`, `useCompetencies`, `useCompetencyCategories`, `useCoreCompetencies`, `useCompetency`, `useCreateCompetency`, `useUpdateCompetency`, `useDeleteCompetency`, `useEmployeeCompetencies`, `useEmployeeCompetency`, `useCreateEmployeeCompetency`, `useUpdateEmployeeCompetency`, `useDeleteEmployeeCompetency`, `useAssessEmployeeCompetency`, `useSetCompetencyTarget`, `useMyCompetencies`, `useDevelopmentTargets`, `useCompetencyGaps`, `useCompetencySummary`, `useReviewFeedbacks`, `useReviewFeedback`, `useCreateReviewFeedback`, `useUpdateReviewFeedback`, `useDeleteReviewFeedback`, `useBatchSendFeedbackRequests`, `useFeedbackRequests`, `useCreateFeedbackRequest`, `useMyFeedbackRequests`, `useSentFeedbackRequests`, `usePendingFeedbackRequests`, `useSendFeedbackReminder`, `useUpdateReviewCycle`, `useReviewCycleReport`, `useReviewCycleParticipants`, `useEmployeePerformanceTrends` | — | — |
| `src/hooks/useRecruitment.ts` | — | `useJobPostings`, `useJobPosting`, `useCreateJobPosting`, `useUpdateJobPosting`, `usePublishJobPosting`, `useCloseJobPosting`, `useCandidates`, `useCandidate`, `useCreateCandidate`, `useUpdateCandidate`, `useBlacklistCandidate`, `useUnblacklistCandidate`, `useApplications`, `useApplication`, `useCreateApplication`, `useUpdateApplication`, `useChangeApplicationStatus`, `useInterviews`, `useInterview`, `useCreateInterview`, `useUpdateInterview`, `useCompleteInterview`, `useCancelInterview`, `useRecruitmentStats`, `useUpcomingInterviews` | — | — |
| `src/hooks/useSessionTimeout.ts` | — | `useSessionTimeout` | — | — |
| `src/hooks/useShiftManagement.ts` | — | `useEmployeeShifts`, `useEmployeeShift`, `useCreateEmployeeShift`, `useUpdateEmployeeShift`, `useDeleteEmployeeShift`, `useShiftDays`, `useShiftDay`, `useCreateShiftDay`, `useUpdateShiftDay`, `useDeleteShiftDay`, `useShiftSchedules`, `useShiftSchedule`, `useCreateShiftSchedule`, `useUpdateShiftSchedule`, `useDeleteShiftSchedule`, `useCurrentSchedule`, `useEmployeeShiftSchedules`, `useEmployeeTypes`, `useEmployeeType`, `useCreateEmployeeType`, `useUpdateEmployeeType`, `useDeleteEmployeeType`, `useRotatingShiftAssignments`, `useRotatingShiftAssignment`, `useCreateRotatingShiftAssignment`, `useUpdateRotatingShiftAssignment`, `useDeleteRotatingShiftAssignment`, `useEmployeeRotatingShiftAssignments`, `useWorkTypes`, `useWorkType`, `useCreateWorkType`, `useUpdateWorkType`, `useDeleteWorkType`, `useEmployeeShiftStats`, `useShiftScheduleStats`, `useEmployeeTypeStats`, `useWorkTypeStats`, `useRotatingShiftStats`, `useRotatingShiftAssignmentStats` | — | — |
| `src/hooks/useTaskActions.tsx` | — | `useTaskActions` | — | — |
| `src/hooks/useUnifiedDepartments.ts` | — | `useUnifiedDepartments`, `useUnifiedDepartment`, `useUnifiedCreateDepartment`, `useUnifiedUpdateDepartment`, `useUnifiedDeleteDepartment`, `useUnifiedOrganizationalChart`, `useUnifiedDepartmentEmployees`, `useUnifiedDepartmentStats`, `useUnifiedMoveDepartment`, `useUnifiedActivateDepartment`, `useUnifiedDeactivateDepartment` | — | — |
| `src/hooks/useUnifiedEmployeeLeave.ts` | — | `useUnifiedEmployeeLeaveSummary`, `useUnifiedDepartmentLeaveOverview`, `useUnifiedLeaveCalendarEnhanced`, `useUnifiedEmployeeLeaveAnalytics`, `useUnifiedExportEmployeeLeaveData`, `useUnifiedRefreshLeaveData`, `useUnifiedEmployeeLeaveDashboard`, `useUnifiedLeaveUpdates`, `useUnifiedLeaveApprovalWorkflow`, `useUnifiedLeaveBalanceManagement`, `useUnifiedLeavePatternAnalysis` | — | — |
| `src/hooks/useUnifiedEmployees.ts` | — | `useBackendHealth`, `useSearchEmployees`, `useEmployee`, `useCreateEmployee`, `useUpdateEmployee`, `useDeleteEmployee`, `useHardDeleteEmployee`, `useEmployeeStatus`, `useEmployeePersonalInfo`, `useEmployeeWorkInfo`, `useEmployeeBankDetails`, `useEmployeeEmergencyContact`, `useUpdateEmployeeWorkInformation`, `useEmployeeDocuments`, `useAddEmployeeDocument`, `useDeleteEmployeeDocument`, `useEmployeeNotes`, `useAddEmployeeNote`, `useBulkUpdateEmployees`, `useBulkDeleteEmployees`, `useImportEmployees`, `useExportEmployees`, `useEmployeeStats`, `useEmployeeLeaveBalances`, `useEmployeeAttendanceSummary`, `useEmployeePerformanceReviews`, `useUnifiedEmployees`, `useCurrentEmployeeProfile`, `useDepartmentEmployees`, `useUnifiedEmployee`, `useUnifiedEmployeeProfile`, `useUnifiedCreateEmployee`, `useUnifiedUpdateEmployee`, `useUnifiedUpdatePersonalInfo`, `useUnifiedUpdateWorkInfo`, `useUnifiedUpdateBankDetails`, `useUnifiedUpdateEmergencyContact`, `useUnifiedDeleteEmployee`, `useUnifiedHardDeleteEmployee`, `useUnifiedImportEmployees`, `useUnifiedExportEmployees`, `useUnifiedAddEmployeeNote`, `useUnifiedEmployeeStatus`, `useUnifiedEmployeeDocuments`, `useUnifiedEmployeeNotes`, `useUnifiedEmployeeStats`, `useUnifiedAddEmployeeDocument`, `useUnifiedDeleteEmployeeDocument`, `useUnifiedUploadPhoto`, `useUnifiedOrganizationalChart`, `useUnifiedDocumentRequests`, `useUnifiedCreateDocumentRequest`, `useUnifiedUpdateDocumentRequest`, `useUnifiedDeleteDocumentRequest`, `useUnifiedApproveDocumentRequest`, `useUnifiedRejectDocumentRequest`, `useUnifiedDocumentRequest`, `useUnifiedUploadDocument`, `useUnifiedBulkUpdateDocuments`, `useUnifiedPolicies`, `useUnifiedCreatePolicy`, `useUnifiedUpdatePolicy`, `useUnifiedDeletePolicy`, `useUnifiedPolicy`, `useUnifiedPolicyTypes`, `useUnifiedActivePolicyTypes`, `useUnifiedCreatePolicyType`, `useUnifiedUpdatePolicyType`, `useUnifiedDeletePolicyType`, `useUnifiedPolicyType`, `useUnifiedDepartments`, `useUnifiedDepartment`, `useUnifiedDepartmentEmployees`, `useUnifiedDepartmentStats`, `useUnifiedActivateDepartment`, `useUnifiedDeactivateDepartment` | — | — |
| `src/hooks/useUnifiedLeave.ts` | — | `useUnifiedLeaveTypes`, `useUnifiedLeaveType`, `useUnifiedCreateLeaveType`, `useUnifiedUpdateLeaveType`, `useUnifiedDeleteLeaveType`, `useUnifiedLeaveRequests`, `useUnifiedLeaveRequest`, `useUnifiedCreateLeaveRequest`, `useUnifiedUpdateLeaveRequest`, `useUnifiedApproveLeaveRequest`, `useUnifiedRejectLeaveRequest`, `useUnifiedCancelLeaveRequest`, `useUnifiedLeaveBalances`, `useUnifiedLeaveBalance`, `useUnifiedLeaveCalendar`, `useUnifiedLeaveStats`, `useUnifiedHolidays`, `useUnifiedHoliday`, `useUnifiedCreateHoliday`, `useUnifiedUpdateHoliday`, `useUnifiedDeleteHoliday`, `useUnifiedUpcomingHolidays`, `useUnifiedHolidaysByYear`, `useUnifiedCompanyLeaves`, `useUnifiedCompanyLeave`, `useUnifiedCreateCompanyLeave`, `useUnifiedUpdateCompanyLeave`, `useUnifiedDeleteCompanyLeave`, `useUnifiedAvailableLeaves`, `useUnifiedAvailableLeave`, `useUnifiedCreateAvailableLeave`, `useUnifiedUpdateAvailableLeave`, `useUnifiedDeleteAvailableLeave`, `useUnifiedLeaveAllocationRequests`, `useUnifiedLeaveAllocationRequest`, `useUnifiedCreateLeaveAllocationRequest`, `useUnifiedApproveLeaveAllocationRequest`, `useUnifiedRejectLeaveAllocationRequest`, `useUnifiedRestrictLeaves`, `useUnifiedRestrictLeave`, `useUnifiedCreateRestrictLeave`, `useUnifiedUpdateRestrictLeave`, `useUnifiedDeleteRestrictLeave`, `useUnifiedActiveRestrictLeaves`, `useUnifiedLeaveRequestComments`, `useUnifiedCreateLeaveRequestComment`, `useUnifiedLeaveAllocationRequestComments`, `useUnifiedCreateLeaveAllocationRequestComment`, `useUnifiedFileUpload`, `useUnifiedCalculateRequestedDays`, `useUnifiedRecalculateLeaveBalance`, `useUnifiedAdjustLeaveBalance` | — | 2 types |
| `src/hooks/useUnifiedOffboarding.ts` | — | `useUnifiedOffboardingProcesses`, `useUnifiedOffboardingProcess`, `useUnifiedUpdateOffboardingProcess`, `useUnifiedUpdateOffboardingProcessPut`, `useUnifiedDeleteOffboardingProcess`, `useUnifiedManagerApproveOffboardingProcess`, `useUnifiedRejectOffboardingProcess`, `useUnifiedHrApproveOffboardingProcess`, `useUnifiedOffboardingDashboard`, `useUnifiedOffboardingStats`, `useUnifiedExitDashboard`, `useUnifiedOffboardingRiskAnalysis`, `useExportOffboardingReport`, `useGetAssetReturns`, `useStartAssetReturnTask`, `useDeleteAssetReturn`, `useGetHandoverTasks`, `useGetHandoverTaskDetails`, `useStartHandoverTask`, `useDeleteHandoverTask`, `useCompleteHandoverTask`, `useMarkHandoverTask`, `useVerifyHandoverTask`, `useRejectHandoverTask`, `useGetClearances`, `useGetClearance`, `useMarkClearanceCompleted`, `useStartClearanceTask`, `useCompleteClearanceTask`, `useRejectClearance`, `useVerifyClearance`, `useGetChecklistItems`, `useGetChecklistItem`, `useMarkChecklistItem`, `useDeleteChecklistItem`, `useVerifyChecklistItem`, `useOverrideChecklistItem`, `useUpdateChecklistItem`, `useGetExitInterviews` | — | 1 type |
| `src/hooks/useUnifiedPayroll.ts` | — | `useUnifiedDataMode` | — | — |
| `src/hooks/useUnifiedRotatingWorkType.ts` | — | `useUnifiedRotatingWorkTypeAssignments`, `useUnifiedRotatingWorkTypeAssignment`, `useUnifiedCreateRotatingWorkTypeAssignment`, `useUnifiedUpdateRotatingWorkTypeAssignment`, `useUnifiedPatchRotatingWorkTypeAssignment`, `useUnifiedDeleteRotatingWorkTypeAssignment`, `useUnifiedEmployeeRotatingWorkTypeAssignments`, `useUnifiedRotatingWorkTypeAssignmentStats`, `useUnifiedExportRotatingWorkTypeAssignments` | — | — |
| `src/hooks/useWallet.ts` | — | `useWallets`, `useWallet`, `useWalletTransactions`, `useRefreshWallet`, `useAvailableBanks` | — | 1 const |
| `src/hooks/work-locations/useWorkLocations.ts` | — | `useWorkLocations`, `useWorkLocationsDropdown`, `useWorkLocation` | — | — |
| `src/hooks/integrations/useAdvancedSearch.ts` | — | `useAdvancedSearch`, `useEmployeeAnalytics`, `useComplexQuery`, `useExportData`, `useSearchSuggestions`, `useFilterOptions`, `useSaveSearch`, `useSavedSearches`, `useDeleteSavedSearch`, `useSearchPerformance`, `useSearchHistory`, `useSearchFilters`, `useSearchStats`, `useDebouncedSearch` | — | — |
| `src/hooks/integrations/useBulkOperations.ts` | — | `useBulkCreateEmployees`, `useBulkUpdateEmployees`, `useExportEmployees`, `useBulkOperationStatus`, `useValidateBulkData`, `useImportEmployees`, `useExportTemplate`, `useBulkOperationsStats`, `useBulkActionProgress`, `useBulkValidation` | — | — |
| `src/hooks/integrations/useEmployeeIntegrations.ts` | — | `useEmployeeIntegrations`, `useEmployeeIntegration`, `useEmployeeIntegrationsByEmployee`, `useEmployeeIntegrationsByProvider`, `useCreateEmployeeIntegration`, `useUpdateEmployeeIntegration`, `useDeleteEmployeeIntegration`, `useSyncStatus`, `useTriggerSync`, `useResolveConflict`, `useIntegrationStats`, `useIntegrationHealth` | — | — |
| `src/hooks/integrations/useIntegrationProviders.ts` | — | `useIntegrationProviders`, `useIntegrationProvider`, `useCreateIntegrationProvider`, `useUpdateIntegrationProvider`, `useDeleteIntegrationProvider`, `useTestIntegrationConnection`, `useIntegrationProviderHealth`, `useIntegrationProviderTypes`, `useIntegrationProviderStats` | — | — |
| `src/hooks/integrations/useWebhooks.ts` | — | `useWebhookEvents`, `useWebhookEvent`, `useRetryWebhookEvent`, `useWebhookConfig`, `useUpdateWebhookConfig`, `useWebhookStats`, `useValidateWebhookSignature`, `useTestWebhookEndpoint`, `useWebhookEventTypes`, `useDeleteWebhookEvent`, `usePurgeFailedWebhooks`, `useWebhookHealth` | — | — |
| `src/hooks/dashboard/useDashboard.ts` | — | `useDashboardMetrics`, `useDashboardStats` | — | — |
| `src/hooks/dashboard/useDummyDashboardData.ts` | — | `useDummyDashboardData`, `useDummyMetrics`, `useDummyActivities`, `useDummyDepartmentStats` | — | 3 types |
| `src/hooks/organization/useOrganizationData.ts` | — | `useOrganizationData`, `useDepartments`, `useManagers`, `useWorkLocations`, `useEmployeeShifts`, `useWorkTypes`, `useEmploymentTypes` | — | 2 types |
| `src/hooks/knowledge-base/useKnowledgeBase.ts` | — | `useKnowledgeBaseArticles`, `useKnowledgeBaseArticle`, `useCreateKnowledgeBaseArticle`, `useUpdateKnowledgeBaseArticle`, `useDeleteKnowledgeBaseArticle`, `usePublishKnowledgeBaseArticle`, `useKnowledgeBaseAttachments`, `useKnowledgeBaseAttachment`, `useCreateKnowledgeBaseAttachment`, `useUpdateKnowledgeBaseAttachment`, `usePatchKnowledgeBaseAttachment`, `useDeleteKnowledgeBaseAttachment`, `useKnowledgeBaseAnalytics`, `useFeaturedArticles`, `useArticlesByCategory`, `useSearchKnowledgeBaseArticles`, `useMostViewedArticles`, `useRecentArticles`, `useMyBookmarks`, `useIsArticleBookmarked`, `useBookmarkArticle`, `useUnbookmarkArticle`, `useArchivedArticles`, `useArchiveArticle`, `useDraftArticles`, `useFeedbackSummary`, `usePatchKnowledgeBaseArticle`, `useRecordArticleView`, `useRecordArticleFeedback` | — | — |
| `src/hooks/employees/useEmployeeDashboardStats.ts` | — | `useEmployeeDashboardStats` | — | — |

---

## Contexts — `src/contexts`

React context providers.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/contexts/AuthContext.tsx` | `AuthProvider`, `AuthContext` | — | — | — |
| `src/contexts/CurrencyContext.tsx` | `CurrencyProvider` | — | — | — |
| `src/contexts/NotificationContext.tsx` | `NotificationProvider`, `NotificationContext` | — | — | — |

---

## Helpers — `src/lib`, `src/utils`, `src/constants`, `src/data`

Pure logic, formatters, constants and static data.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/utils/chunkedUpload.ts` | — | — | `uploadFileWithChunks`, `createLargeFileConfig`, `createRegularFileConfig` | `ChunkedUploader` (class) · 4 types |
| `src/utils/cn.ts` | — | — | `cn` | — |
| `src/utils/country-currency.ts` | — | — | `getCountryOptions`, `getCurrencyOptions`, `getDefaultCurrencyForCountry`, `getCountryByName`, `getCountryByCode`, `isValidCurrencyForCountry`, `getSuggestedCurrenciesForCountry`, `normalizeCountryInput`, `normalizeCurrencyInput`, `validateCountryCurrency`, `formatCountryCurrencyDisplay`, `getAllCountryCurrencies`, `getCountriesByCurrency`, `requiresSpecialHandling` | 1 type |
| `src/utils/currency.ts` | — | — | `formatCurrency`, `getCurrencySymbol`, `convertFromUSD`, `convertToUSD`, `formatCurrencyFromUSD`, `getCurrencyConfig`, `isSupportedCurrency`, `getSupportedCurrencies`, `formatCurrencyForDisplay`, `formatCurrencyCompact`, `formatCurrencyCompactWithIcon` | — |
| `src/utils/errorHandling.ts` | — | — | `getFieldErrors`, `getGeneralError`, `getBulkErrors`, `handleApiError`, `extractFieldErrors`, `getErrorMessage`, `isValidationError`, `formatFieldName`, `getAllErrorMessages` | 3 types |
| `src/utils/exportToCsv.ts` | — | — | — | 1 const · 2 types |
| `src/utils/formatCurrency.ts` | — | — | `formatCurrency`, `getCurrencySymbol`, `isCurrencySupported`, `formatWithGlobalCurrency`, `formatCurrencyAbbreviated` | — |
| `src/utils/formatters.ts` | — | — | `formatCurrency`, `formatDate`, `formatDateTime`, `formatPercentage`, `formatNumber`, `formatFileSize`, `truncateText`, `formatPhoneNumber`, `getFileNameFromUrl`, `formatCurrencyShort`, `sanitizeInput`, `formatNotificationTime` | — |
| `src/utils/formatting.ts` | — | — | `formatCurrency`, `formatDate`, `formatDateTime`, `formatNumber`, `formatFileSize`, `formatPhoneNumber`, `formatPercentage`, `formatDuration`, `truncateText`, `capitalizeWords`, `formatSSN`, `formatEmployeeId` | — |
| `src/utils/getRouteHeader.ts` | — | — | `getRouteHeader` | 1 const · 1 type |
| `src/utils/getTitleFromPath.ts` | — | — | `getTitleFromPath` | — |
| `src/utils/integration-optimization.ts` | — | `useDebouncedIntegration`, `useCachedIntegrationData` | `debounce`, `withPerformanceMonitoring`, `monitorIntegrationPerformance` | `IntegrationCache`, `IntegrationPerformanceMonitor`, `IntegrationBatchProcessor`, `IntegrationMemoryManager` (class) · 4 const |
| `src/utils/leaveValidation.ts` | — | — | `datesOverlap`, `calculateDaysDifference`, `checkOverlappingDates`, `checkDuplicateLeaveType`, `checkMaxAnnualDays`, `checkLeaveBalance`, `validateLeaveRequest` | 1 type |
| `src/utils/loanCurrency.ts` | — | `useLoanCurrency` | `getEmployeeLoanCurrency`, `formatLoanAmount` | — |
| `src/utils/objectDiff.ts` | — | — | `getChangedFields`, `cleanObject`, `createUpdatePayload`, `hasChanges`, `getChangeCount`, `getChangedFieldNames` | — |
| `src/utils/payrollBatchProcessor.ts` | — | — | `processItemsInBatches`, `calculateBatchTotals`, `calculateDepartmentTotals`, `optimizeTaxCalculations`, `processSalaryStructures`, `calculatePayrollRunStatistics`, `processLargeDataset`, `createDebouncedBatchProcessor` | 2 types |
| `src/utils/payrollCalculations.ts` | — | — | `calculateGrossSalary`, `calculateTotalDeductions`, `calculateProgressiveTax`, `calculateFlatTax`, `calculateTax`, `calculateTaxableAllowances`, `calculateNonTaxableAllowances`, `calculatePercentageDeductions`, `calculateFixedDeductions`, `calculatePayroll`, `validateSalaryComponents`, `formatCurrency`, `calculateOvertimePay`, `calculateRegularPay`, `memoize` | 2 const · 7 types |
| `src/utils/payrollErrorHandling.ts` | — | — | `handlePayrollError`, `extractFieldErrors`, `isValidationError`, `isPermissionError`, `isCalculationError`, `getErrorMessage`, `createPayrollError`, `createValidationError`, `createPermissionError`, `createCalculationError`, `createNetworkError`, `checkExistingPayrollRun`, `getDuplicatePayrollRunMessage` | 1 const · 2 types |
| `src/utils/queryParams.ts` | — | — | `buildQueryString` | — |
| `src/utils/reimbursementCurrency.ts` | — | — | `formatReimbursementCurrency`, `formatReimbursementSummaryCurrency` | — |
| `src/utils/responsive.ts` | — | `useBreakpoint`, `useMediaQuery` | `responsiveValue`, `responsiveClass`, `isTouchDevice`, `isMobileDevice`, `isTabletDevice`, `isDesktopDevice` | 5 const · 3 types |
| `src/utils/time.ts` | — | — | `calculateDurationInHours` | — |
| `src/utils/payroll/calculations.ts` | — | — | `createExampleBreakdown`, `convertAllowanceBreakdown`, `convertDeductionBreakdown`, `calculateTotal`, `formatCalculationMethod`, `validatePayrollCalculations`, `calculateDeductionAmount`, `calculateAllowanceAmount`, `getCalculationDescription` | 2 types |
| `src/utils/permissions/attendance.permissions.ts` | — | — | — | 1 const |
| `src/utils/permissions/base.permissions.ts` | — | — | — | 1 const |
| `src/utils/permissions/employee.permissions.ts` | — | — | — | 1 const |
| `src/utils/permissions/exit.permissions.ts` | — | — | — | 1 const |
| `src/utils/permissions/inventory.permissions.ts` | — | — | — | 1 const |
| `src/utils/permissions/leave.permissions.ts` | — | — | — | 1 const |
| `src/utils/permissions/newPermissionUtils.ts` | — | `userRoles` | `hasRoutePermission`, `canAccess`, `getUserRole`, `isAdmin`, `isManagerOrAbove`, `isEmployee`, `hasPermission` | 1 type |
| `src/utils/permissions/onboarding.permissions.ts` | — | — | — | 1 const |
| `src/utils/permissions/payroll.permissions.ts` | — | — | — | 1 const |
| `src/utils/permissions/performance.permissions.ts` | — | — | — | 1 const |
| `src/utils/permissions/permissions.template.ts` | — | — | — | 1 const |
| `src/utils/permissions/projects.permissions.ts` | — | — | — | 1 const |
| `src/utils/permissions/recruitment.permissions.ts` | — | — | — | 1 const |
| `src/utils/permissions/rewards.permissions.ts` | — | — | — | 1 const |
| `src/utils/permissions/routes.config.ts` | — | — | `flattenRoutes` | 2 const · 1 type |
| `src/utils/permissions/settings.permissions.ts` | — | — | — | 1 const |
| `src/utils/permissions/support.permissions.ts` | — | — | — | 1 const |
| `src/utils/validation/registrationSchema.ts` | — | — | — | 1 const · 1 type |
| `src/lib/utils.ts` | — | — | `cn`, `getCountryList`, `getCountryCode`, `getCountryName`, `normalizeCountry`, `getCountryCodeFromInput`, `generateEmployeeId`, `transformEmployeePayload`, `handleExport`, `convertAndDownloadImportTemplate`, `formatTenure`, `bulkUpdateDocuments`, `processDocumentUploads`, `getLeaveStatusClass`, `generateColorFromString`, `getTrendColor` | — |
| `src/data/dummyData.ts` | — | — | `generateDummyEmployees`, `generateDummyAttendance`, `generateDummyLeaves`, `generateDummyPayroll`, `generateDummyCandidates`, `generateDummyPerformanceReviews`, `generateDummyActivities`, `generateDashboardData`, `getEmployeesByDepartment`, `getRecentActivities`, `getPendingLeaves`, `getUpcomingLeaves`, `getDepartmentStats` | 1 const · 7 types |
| `src/data/mockPayrollData.ts` | — | — | — | 4 const |
| `src/constants/countries.ts` | — | — | `getCountryByName`, `getCountryByCode`, `getAllCountryNames`, `getAllCountryCodes`, `getCountriesByCurrency`, `getDefaultCurrencyForCountry` | 1 const · 1 type |
| `src/constants/currency.ts` | — | — | — | 2 const · 1 type |
| `src/constants/employees.ts` | — | `userRoleOptions` | — | 16 const |
| `src/constants/index.ts` | — | — | — | 2 const |

---

## Types — `src/types`

Shared type declarations.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/types/allowance.ts` | — | — | — | 12 types |
| `src/types/api.ts` | — | — | — | 143 types |
| `src/types/auth.ts` | — | — | — | 8 types |
| `src/types/currency.ts` | — | — | — | 11 types |
| `src/types/deduction.ts` | — | — | — | 1 const · 15 types |
| `src/types/deductionBatch.ts` | — | — | — | 8 types |
| `src/types/employee-leave.types.ts` | — | — | — | 16 types |
| `src/types/employee.ts` | — | — | — | 22 types |
| `src/types/exit.ts` | — | — | — | 72 types |
| `src/types/leave.ts` | — | — | — | 47 types |
| `src/types/loan.ts` | — | — | — | 10 types |
| `src/types/onboarding.ts` | — | — | — | 22 types |
| `src/types/performance.ts` | — | — | — | 47 types |
| `src/types/reimbursement.ts` | — | — | — | 13 types |
| `src/types/wallet.ts` | — | — | — | 9 types |
| `src/types/dashboard/index.ts` | — | — | — | 1 const · 43 types |

---

## Screens — `src/pages/employees`

Screens and screen-local pieces for the employees area.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/pages/employees/AddBulkEmployee.tsx` | `AddBulkEmployee` | — | — | — |
| `src/pages/employees/AddEmployee.tsx` | `AddEmployee` | — | — | — |
| `src/pages/employees/Departments.tsx` | `Departments` | — | — | — |
| `src/pages/employees/DisciplinaryActionsPage.tsx` | `DisciplinaryActionsPage` | — | — | — |
| `src/pages/employees/DocumentRequestsPage.tsx` | `DocumentRequestsPage` | — | — | — |
| `src/pages/employees/EditEmployee.tsx` | `EditEmployee` | — | — | — |
| `src/pages/employees/EditEmployeeProfile.tsx` | `EditEmployeeProfile` | — | — | — |
| `src/pages/employees/EmployeeList.tsx` | `EmployeeList` | — | — | — |
| `src/pages/employees/EmployeeOverview.tsx` | `EmployeeOverview` | — | — | — |
| `src/pages/employees/EmployeeShiftManagementPage.tsx` | `EmployeeShiftManagementPage` | — | — | — |
| `src/pages/employees/EmployeeShiftSchedulePage.tsx` | `EmployeeShiftSchedulePage` | — | — | — |
| `src/pages/employees/EmployeeTypeManagementPage.tsx` | `EmployeeTypeManagementPage` | — | — | — |
| `src/pages/employees/NewAddEmployee.tsx` | `NewAddEmployee` | — | — | — |
| `src/pages/employees/NewEditEmployee.tsx` | `NewEditEmployee` | — | — | — |
| `src/pages/employees/NewEmployeeDetail.tsx` | `NewEmployeeDetail` | — | — | — |
| `src/pages/employees/NewEmployeeList.tsx` | `NewEmployeeList` | — | — | — |
| `src/pages/employees/NewEmployeeManagementDashboard.tsx` | `EmployeeManagementDashboard` | — | — | — |
| `src/pages/employees/NewEmployeeProfile.tsx` | `NewEmployeeProfile` | — | — | — |
| `src/pages/employees/OrgChart.tsx` | `OrgChart` | — | — | — |
| `src/pages/employees/PoliciesPage.tsx` | `PoliciesPage` | — | — | — |
| `src/pages/employees/PolicyTypesPage.tsx` | `PolicyTypesPage` | — | — | — |
| `src/pages/employees/Profile.tsx` | `Profile` | — | — | — |
| `src/pages/employees/RotatingShiftAssignmentPage.tsx` | `RotatingShiftAssignmentPage` | — | — | — |
| `src/pages/employees/RotatingShiftRequestsPage.tsx` | `RotatingShiftRequestsPage` | — | — | — |
| `src/pages/employees/RotatingWorkTypeAssignmentPage.tsx` | `RotatingWorkTypeAssignmentPage` | — | — | — |
| `src/pages/employees/ShiftRequestsPage.tsx` | `ShiftRequestsPage` | — | — | — |
| `src/pages/employees/WorkTypeDefinitionsPage.tsx` | `WorkTypeDefinitionsPage` | — | — | — |
| `src/pages/employees/WorkTypeManagementPage.tsx` | `WorkTypeManagementPage` | — | — | — |
| `src/pages/employees/WorkTypeRequestsPage.tsx` | `WorkTypeRequestsPage` | — | — | — |

---

## Screens — `src/pages/departments`

Screens and screen-local pieces for the departments area.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/pages/departments/AddDepartmentPage.tsx` | `AddDepartmentPage` | — | — | — |
| `src/pages/departments/DepartmentDetailPage.tsx` | `DepartmentDetailPage` | — | — | — |
| `src/pages/departments/DepartmentsPage.tsx` | `DepartmentsPage` | — | — | — |
| `src/pages/departments/EditDepartmentPage.tsx` | `EditDepartmentPage` | — | — | — |
| `src/pages/departments/NewAddDepartment.tsx` | `NewAddDepartment` | — | — | — |
| `src/pages/departments/NewDepartmentDetailPage.tsx` | `NewDepartmentDetailPage` | — | — | — |
| `src/pages/departments/NewDepartmentList.tsx` | `NewDepartmentList` | — | — | — |
| `src/pages/departments/OrganizationalChartPage.tsx` | `OrganizationalChartPage` | — | — | — |

---

## Screens — `src/pages/attendance`

Screens and screen-local pieces for the attendance area.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/pages/attendance/AttendanceDetail.tsx` | `AttendanceDetail` | — | — | — |
| `src/pages/attendance/AttendanceReports.tsx` | `AttendanceReports` | — | — | — |
| `src/pages/attendance/AttendanceSelfService.tsx` | `Attendance` | — | — | — |
| `src/pages/attendance/ClockInOutModal.tsx` | `ClockInOutModal` | — | — | — |
| `src/pages/attendance/DailyAttendanceLogs.tsx` | `DailyAttendanceLogs` | — | — | — |
| `src/pages/attendance/RequestCorrections.tsx` | `RequestCorrections` | — | — | — |
| `src/pages/attendance/components/AtendanceCard.tsx` | `AtendanceCard`, `AtendanceCard2`, `AtendanceCard3`, `AttendanceActionCard` | — | — | 3 types |
| `src/pages/attendance/components/AttendanceChart.tsx` | `AttendanceTrendsChart` | — | — | — |

---

## Screens — `src/pages/leave`

Screens and screen-local pieces for the leave area.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/pages/leave/ApprovalWorkflowsPage.tsx` | `ApprovalWorkflowsPage` | — | — | — |
| `src/pages/leave/AssignedLeavesPage.tsx` | `AssignedLeavesPage` | — | — | — |
| `src/pages/leave/Dashboard.tsx` | `DashboardPage` | — | — | — |
| `src/pages/leave/EmployeeBalancesPage.tsx` | `EmployeeBalancesPage` | — | — | — |
| `src/pages/leave/EmployeeLeaveBalances.tsx` | `EmployeeLeaveBalances` | — | — | — |
| `src/pages/leave/HolidayTypesPage.tsx` | `HolidayTypesPage` | — | — | — |
| `src/pages/leave/HolidaysPage.tsx` | `HolidaysPage` | — | — | — |
| `src/pages/leave/LeaveAllocationPage.tsx` | `LeaveAllocationPage` | — | — | — |
| `src/pages/leave/LeaveAllocationRequestPage.tsx` | `LeaveAllocationRequestPage` | — | — | — |
| `src/pages/leave/LeaveBalancesPage.tsx` | `LeaveBalancesPage` | — | — | — |
| `src/pages/leave/LeaveDashboardPage.tsx` | `LeaveDashboardPage` | — | — | — |
| `src/pages/leave/LeaveDetail.tsx` | `LeaveDetail` | — | — | — |
| `src/pages/leave/LeaveList.tsx` | `LeaveList` | — | — | — |
| `src/pages/leave/LeaveManagement.tsx` | `LeaveManagement` | — | — | — |
| `src/pages/leave/LeaveRequestList.tsx` | `LeaveRequestList` | — | — | — |
| `src/pages/leave/LeaveRequestsPage.tsx` | `LeaveRequestsPage` | — | — | — |
| `src/pages/leave/LeaveSettingsPage.tsx` | `LeaveSettingsPage` | — | — | — |
| `src/pages/leave/LeaveTypesPage.tsx` | `LeaveTypesPage` | — | — | — |
| `src/pages/leave/MyLeaveRequestPage.tsx` | `MyLeaveRequestPage` | — | — | — |
| `src/pages/leave/SubmitLeaveRequestPage.tsx` | `SubmitLeaveRequestPage` | — | — | — |
| `src/pages/leave/ViewAllApprovalsPage.tsx` | `ViewAllApprovalsPage` | — | — | — |

---

## Screens — `src/pages/payroll`

Screens and screen-local pieces for the payroll area.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/pages/payroll/Allowances.tsx` | `AllowancesPage` | — | — | — |
| `src/pages/payroll/CreatePayrollCycle.tsx` | `CreatePayrollRun` | — | — | 1 type |
| `src/pages/payroll/Deductions.tsx` | `DeductionsPage` | — | — | — |
| `src/pages/payroll/Loans.tsx` | `LoansPage` | — | — | — |
| `src/pages/payroll/PayrollCycle.tsx` | `PayrollCycle` | — | — | — |
| `src/pages/payroll/PayrollDashboard.tsx` | `PayrollDashboardPage` | — | — | — |
| `src/pages/payroll/PayrollRunDetail.tsx` | `PayrollRunDetail` | — | — | — |
| `src/pages/payroll/PayrollRuns.tsx` | `PayrollRuns` | — | — | — |
| `src/pages/payroll/Reimbursements.tsx` | `ReimbursementsPage` | — | — | — |
| `src/pages/payroll/SalaryCategoryFormPage.tsx` | `SalaryCategoryFormPage` | — | — | — |
| `src/pages/payroll/SalaryStructureFormPage.tsx` | `SalaryStructureFormPage` | — | — | — |
| `src/pages/payroll/SalaryStructures.tsx` | `SalaryStructures` | — | — | — |
| `src/pages/payroll/TaxSettings.tsx` | `TaxSettings` | — | — | — |
| `src/pages/payroll/WalletPage.tsx` | `WalletPage` | — | — | — |
| `src/pages/payroll/placeholders/PayrollReports.tsx` | `PayrollReports` | — | — | — |
| `src/pages/payroll/placeholders/TaxSettings.tsx` | `TaxSettings` | — | — | — |

---

## Screens — `src/pages/performance`

Screens and screen-local pieces for the performance area.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/pages/performance/ApproveObjectives.tsx` | `ApproveObjectives` | — | — | — |
| `src/pages/performance/CompanyGoals.tsx` | `CompanyGoals` | — | — | — |
| `src/pages/performance/Competencies.tsx` | `Competencies` | — | — | — |
| `src/pages/performance/CompleteAppraisal.tsx` | `CompleteAppraisal` | — | — | — |
| `src/pages/performance/ConfigureScoringWeights.tsx` | `ConfigureScoringWeights` | — | — | — |
| `src/pages/performance/ExecutiveDashboard.tsx` | `ExecutiveDashboard` | — | — | — |
| `src/pages/performance/GoalsList.tsx` | `GoalsList` | — | — | — |
| `src/pages/performance/HrViewAppraisal.tsx` | `HrViewAppraisal` | — | — | — |
| `src/pages/performance/ManageObjectives.tsx` | `ManageObjectives` | — | — | — |
| `src/pages/performance/ManagerDashboard.tsx` | `ManagerDashboard` | — | — | — |
| `src/pages/performance/MyObjectiveHistory.tsx` | `MyObjectiveHistory` | — | — | — |
| `src/pages/performance/MyObjectives.tsx` | `MyObjectives` | — | — | — |
| `src/pages/performance/PendingTasks.tsx` | `PendingTasks` | — | — | — |
| `src/pages/performance/PerformanceDashboard.tsx` | `PerformanceDashboard` | — | — | — |
| `src/pages/performance/ReviewCycleParticipants.tsx` | `ReviewCycleParticipants` | — | — | — |
| `src/pages/performance/ReviewCycleReport.tsx` | `ReviewCycleReport` | — | — | — |
| `src/pages/performance/ReviewCycles.tsx` | `ReviewCycles` | — | — | — |
| `src/pages/performance/ReviewObjective.tsx` | `ReviewObjective` | — | — | — |
| `src/pages/performance/ReviewsList.tsx` | `ReviewsList` | — | — | — |
| `src/pages/performance/SelfAppraisal.tsx` | `SelfAppraisal` | — | — | — |
| `src/pages/performance/SendReminders.tsx` | `SendReminders` | — | — | — |
| `src/pages/performance/SubmitTask.tsx` | `SubmitTask` | — | — | — |
| `src/pages/performance/TeamAppraisals.tsx` | `TeamAppraisals` | — | — | — |
| `src/pages/performance/TeamMemberPerformance.tsx` | `TeamMemberPerformance` | — | — | — |
| `src/pages/performance/ViewObjective.tsx` | `ViewObjective` | — | — | — |

---

## Screens — `src/pages/recruitment`

Screens and screen-local pieces for the recruitment area.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/pages/recruitment/Applications.tsx` | `Applications` | — | — | — |
| `src/pages/recruitment/Candidates.tsx` | `Candidates` | — | — | — |
| `src/pages/recruitment/Dashboard.tsx` | `RecruitmentDashboard` | — | — | — |
| `src/pages/recruitment/Interviews.tsx` | `Interviews` | — | — | — |
| `src/pages/recruitment/JobPostingDetail.tsx` | `JobPostingDetail` | — | — | — |
| `src/pages/recruitment/JobPostings.tsx` | `JobPostings` | — | — | — |
| `src/pages/recruitment/TestComponent.tsx` | `TestComponent` | — | — | — |

---

## Screens — `src/pages/assets`

Screens and screen-local pieces for the assets area.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/pages/assets/Assets.tsx` | `Assets` | — | — | — |

---

## Screens — `src/pages/companies`

Screens and screen-local pieces for the companies area.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/pages/companies/AddCompany.tsx` | `AddCompany` | — | — | — |
| `src/pages/companies/CompanyDetail.tsx` | `CompanyDetail` | — | — | — |
| `src/pages/companies/CompanyList.tsx` | `CompanyList` | — | — | — |
| `src/pages/companies/EditCompany.tsx` | `EditCompany` | — | — | — |

---

## Screens — `src/pages/settings`

Screens and screen-local pieces for the settings area.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/pages/settings/ExitSettingsTab.tsx` | `ExitSettingsTab` | — | — | — |
| `src/pages/settings/GeneralSettings.tsx` | `GeneralSettingsPage` | — | — | — |
| `src/pages/settings/SettingsHubPage.tsx` | `SettingsHubPage` | — | — | — |
| `src/pages/settings/SettingsPage.tsx` | `SettingsPage` | — | — | — |
| `src/pages/settings/SystemSettings.tsx` | `SystemSettings` | — | — | — |
| `src/pages/settings/permissions/CreateRolePage.tsx` | `CreateRolePage` | — | — | — |
| `src/pages/settings/permissions/EditRolePage.tsx` | `EditRolePage` | — | — | — |
| `src/pages/settings/permissions/RoleAndPermissionsPage.tsx` | `RoleAndPermissionsPage` | — | — | — |
| `src/pages/settings/permissions/RolePermissionsPage.tsx` | `RolePermissionsPage` | — | — | — |
| `src/pages/settings/components/WorkLocationComponent.tsx` | `WorkLocationComponent` | — | — | — |
| `src/pages/settings/components/WorkSettingsForm.tsx` | `WorkSettingsForm`, `WorkTypeForm`, `WorkLocationForm` | — | — | 2 types |
| `src/pages/settings/components/WorkTypeComponent.tsx` | `WorkTypeComponent` | — | — | — |

---

## Screens — `src/pages/auth`

Screens and screen-local pieces for the auth area.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/pages/auth/ChangePassword.tsx` | `ChangePassword` | — | — | — |
| `src/pages/auth/ForgotPassword.tsx` | `ForgotPassword` | — | — | — |
| `src/pages/auth/Login.tsx` | `Login` | — | — | — |
| `src/pages/auth/Register.tsx` | `Register` | — | — | — |
| `src/pages/auth/ResetPassword.tsx` | `ResetPassword` | — | — | — |
| `src/pages/auth/ResetPasswordOtp.tsx` | `ResetPasswordOtp` | — | — | — |
| `src/pages/auth/VerifyEmail.tsx` | `VerifyEmail` | — | — | — |

---

## Screens — `src/pages/onboarding`

Screens and screen-local pieces for the onboarding area.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/pages/onboarding/AdminAccount.tsx` | `AdminAccountSetup` | — | — | — |
| `src/pages/onboarding/CompanySetup.tsx` | `CompanySetup` | — | — | — |
| `src/pages/onboarding/SetupChecklist.tsx` | `SetupChecklist` | — | — | — |

---

## Screens — `src/pages/exit`

Screens and screen-local pieces for the exit area.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/pages/exit/ClearanceChecklist.tsx` | `ClearanceChecklist` | — | — | — |
| `src/pages/exit/ClearanceDetailsTab.tsx` | `ClearanceDetailsTab` | — | — | 1 type |
| `src/pages/exit/Dashboard.tsx` | `ExitManagementDashboard` | — | — | — |
| `src/pages/exit/EmploymentDetailsTab.tsx` | `EmploymentDetailsTab` | — | — | — |
| `src/pages/exit/ExitInterviews.tsx` | `ExitInterviews` | — | — | — |
| `src/pages/exit/ExitReports.tsx` | `ExitReports` | — | — | — |
| `src/pages/exit/InterviewDetailsTab.tsx` | `InterviewDetailsTab` | — | — | — |
| `src/pages/exit/ResignationDetailsTab.tsx` | `ResignationDetailsTab` | — | — | — |
| `src/pages/exit/ResignationRequestDetail.tsx` | `ResignationRequestDetail` | — | — | — |
| `src/pages/exit/ResignationRequests.tsx` | `ResignationRequests` | — | — | — |
| `src/pages/exit/StatusPill.tsx` | `StatusPill` | — | — | — |
| `src/pages/exit/SubmitResignationPage.tsx` | `SubmitResignationPage` | — | — | — |
| `src/pages/exit/resignation-utils.ts` | — | — | `mapApiStatusToComponentStatus`, `formatStatusLabel`, `getApprovalStatusDisplay`, `getInterviewStatusDisplay`, `getClearanceStatusDisplay`, `transformProcessToRequest`, `formatDate`, `getInitials` | 1 const · 3 types |

---

## Screens — `src/pages/helpdesk`

Screens and screen-local pieces for the helpdesk area.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/pages/helpdesk/Analytics.tsx` | `Analytics` | — | — | — |
| `src/pages/helpdesk/Categories.tsx` | `Categories` | — | — | — |
| `src/pages/helpdesk/Comments.tsx` | `Comments` | — | — | — |
| `src/pages/helpdesk/CreateTicket.tsx` | `CreateTicket` | — | — | — |
| `src/pages/helpdesk/FileAttachments.tsx` | `FileAttachments` | — | — | — |
| `src/pages/helpdesk/MyTickets.tsx` | `MyTickets` | — | — | — |
| `src/pages/helpdesk/SLAPolicies.tsx` | `SLAPolicies` | — | — | — |
| `src/pages/helpdesk/TestHelpdesk.tsx` | `TestHelpdesk` | — | — | — |
| `src/pages/helpdesk/TestHelpdeskAPI.tsx` | `TestHelpdeskAPI` | — | — | — |
| `src/pages/helpdesk/TicketDetail.tsx` | `TicketDetail` | — | — | — |
| `src/pages/helpdesk/TicketList.tsx` | `TicketList` | — | — | — |

---

## Screens — `src/pages/knowledge-base`

Screens and screen-local pieces for the knowledge base area.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/pages/knowledge-base/Analytics.tsx` | `Analytics` | — | — | — |
| `src/pages/knowledge-base/AttachmentTest.tsx` | `AttachmentTestPage` | — | — | — |
| `src/pages/knowledge-base/KnowledgeBase.tsx` | `KnowledgeBase` | — | — | — |

---

## Screens — `src/pages/integrations`

Screens and screen-local pieces for the integrations area.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/pages/integrations/EmployeeIntegrations.tsx` | `EmployeeIntegrations` | — | — | — |
| `src/pages/integrations/Integrations.tsx` | `Integrations` | — | — | — |
| `src/pages/integrations/Webhooks.tsx` | `Webhooks` | — | — | — |

---

## Screens — the rest of `src/pages`

Everything else under `src/pages`.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/pages/AppNotifications.tsx` | `AppNotifications` | — | — | — |
| `src/pages/CurrencyExchangeTest.tsx` | `CurrencyExchangeTest` | — | — | — |
| `src/pages/Dashboard.tsx` | `Dashboard` | — | — | — |
| `src/pages/NotFound.tsx` | `NotFound` | — | — | — |
| `src/pages/PermissionDebug.tsx` | `PermissionDebug` | — | — | — |
| `src/pages/Unauthorized.tsx` | `Unauthorized` | — | — | — |
| `src/pages/audit/AuditLogs.tsx` | `AuditLogs` | — | — | — |
| `src/pages/audit/components/AuditLogList.tsx` | `AuditLogList` | — | — | — |

---

## Everything else

Entry points and files outside the folders above.

| File | Components | Hooks | Functions | Also |
|---|---|---|---|---|
| `src/App.tsx` | `App` | — | — | — |
| `src/test-api-integration.ts` | — | — | — | 1 const |
