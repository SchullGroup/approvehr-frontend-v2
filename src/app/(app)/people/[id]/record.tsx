"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Eye,
  EyeOff,
  FileText,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  Money,
  ProgressMeter,
  Skeleton,
  Tabs,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  type BadgeTone,
} from "@/components/ui";
import { EmployeeFileDrawer } from "@/app/(app)/people/documents";
import { PayComponentsPanel } from "@/app/(app)/payroll/pay-setup/pay-components-panel";
import { RecordHistory } from "@/app/(app)/settings/audit/record-history";
import { naira } from "@/lib/api/pay-components";
import type { LeaveBalanceRow, LeaveRow } from "@/lib/api/leave";
import { calculatePayslip } from "@/lib/payroll/engine";
import { usePayrollSettings } from "@/lib/payroll/use-settings";
import { useCan } from "@/lib/permissions";
import { useDepartments } from "@/lib/store/departments";
import type { EmployeePatch } from "@/lib/store/employees-api";
import { usePayPreview } from "@/lib/store/pay-components";
import { useSession } from "@/lib/store/session";
import { fullName, type Employee } from "@/lib/types";
import { shortDate } from "@/lib/today";
import { EditableSection } from "@/components/people/editable-section";
import { ConductPanel } from "./conduct";

/**
 * Employment status, as a chip.
 *
 * Keyed by string rather than by `EmploymentStatus`, and read through
 * `statusOf`, because the two sources do not offer the same set. The frontend
 * union has six; the database enum has five, and two of them — `SUSPENDED` and
 * `EXITED` — are not in the union at all. A `Record<EmploymentStatus, …>` lookup
 * on a connected record therefore returns `undefined` and the page crashes on
 * `.tone`. TypeScript cannot see it: `toEmployee` casts the lower-cased string
 * into the union on the way in.
 */
const STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  active: { tone: "success", label: "Active" },
  onboarding: { tone: "info", label: "Onboarding" },
  probation: { tone: "warning", label: "Probation" },
  on_leave: { tone: "info", label: "On leave" },
  offboarding: { tone: "warning", label: "Offboarding" },
  suspended: { tone: "danger", label: "Suspended" },
  inactive: { tone: "neutral", label: "Inactive" },
  exited: { tone: "neutral", label: "Left the company" },
};

/** Anything unrecognised still reads as a sentence rather than as a key. */
function statusOf(status: string): { tone: BadgeTone; label: string } {
  return (
    STATUS[status.toLowerCase()] ?? {
      tone: "neutral",
      label: status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
    }
  );
}

/**
 * Which statuses and employment types may be *set*.
 *
 * Connected, the answer is the database's enum — offering "Probation" would
 * send a value `PATCH /employees/:id` refuses, and the person would get a 422
 * for picking something the interface offered them. Offline the local set is
 * the honest one, because localStorage will hold whatever it is given.
 */
const API_STATUSES = [
  { value: "active", label: "Active" },
  { value: "onboarding", label: "Onboarding" },
  { value: "on_leave", label: "On leave" },
  { value: "suspended", label: "Suspended" },
  { value: "exited", label: "Left the company" },
];

const LOCAL_STATUSES = [
  { value: "active", label: "Active" },
  { value: "onboarding", label: "Onboarding" },
  { value: "probation", label: "Probation" },
  { value: "on_leave", label: "On leave" },
  { value: "offboarding", label: "Offboarding" },
  { value: "inactive", label: "Inactive" },
];

const API_TYPES = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Internship" },
  { value: "nysc", label: "NYSC" },
];

const LOCAL_TYPES = [
  { value: "full_time", label: "Full time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
];

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  [...API_TYPES, ...LOCAL_TYPES].map((t) => [t.value, t.label]),
);

/**
 * The two enums arrive in different cases and only one is normalised.
 *
 * `toEmployee` lower-cases `status` on the way in and leaves `employmentType`
 * alone, so a connected record carries `active` beside `FULL_TIME`. Found on
 * screen: the type read as "FULL_TIME" and the picker preselected the wrong
 * option because none of its values matched. Everything on this page goes
 * through here rather than trusting either case.
 */
const enumKey = (value: string) => value.toLowerCase();

const BANKS = [
  "",
  "GTBank",
  "Zenith Bank",
  "Access Bank",
  "UBA",
  "First Bank",
  "Stanbic IBTC",
  "Kuda",
];

const PFAS = [
  "",
  "Stanbic IBTC Pensions",
  "ARM Pensions",
  "Leadway Pensure",
  "Premium Pensions",
];

const TAX_STATES = ["Lagos", "Abuja", "Ogun", "Rivers", "Kano"];

/**
 * The employee record.
 *
 * Identity sits in a fixed rail so it stays visible while the detail scrolls —
 * you should never lose track of whose record you are editing. Everything the
 * payroll run blocks on is surfaced at the top rather than buried in a tab,
 * because this page is where those blockers get resolved.
 *
 * Nothing here fetches. The page above it owns the read and passes both the
 * record and the mode down, so this component renders the same way whether the
 * data came from Postgres or from this browser.
 */
export function EmployeeRecord({
  employee,
  missing,
  connected,
  manager,
  managerName,
  reports,
  balances,
  leaveRequests,
  leaveLoading = false,
  onSave,
}: {
  employee: Employee;
  /** Fields payroll cannot file without. The API's own answer when connected. */
  missing: string[];
  connected: boolean;
  manager: Employee | null;
  /** The manager's name even when their record is outside the page's slice. */
  managerName: string | null;
  reports: Employee[];
  /** Every leave type, with the API's own remaining figure when connected. */
  balances: LeaveBalanceRow[];
  /** This employee's own requests. Live in both modes. */
  leaveRequests: LeaveRow[];
  /** The leave reads are their own requests and can still be in flight. */
  leaveLoading?: boolean;
  onSave: (patch: EmployeePatch) => Promise<unknown>;
}) {
  const [tab, setTab] = useState("personal");
  const [fileOpen, setFileOpen] = useState(false);
  const departments = useDepartments();
  const { employeeId: me } = useSession();
  const canSeeSalaries = useCan("VIEW_SALARIES");

  const name = fullName(employee);
  const status = statusOf(employee.status);

  /**
   * Who may unmask a bank account, a pension PIN, a TIN or an NHF number.
   *
   * `VIEW_SALARIES`, or the record being your own — deliberately the same rule
   * `GET /employees/:id` enforces, because a reveal that the API would refuse
   * has no business being offered. In connected mode that makes it a second
   * lock on a door already locked: nobody without one of the two can load this
   * page at all. It earns its place in the other two cases — demo mode with a
   * role previewed under `/settings/roles`, and whenever the detail endpoint's
   * own rule is loosened.
   *
   * The masking itself is the part that works for everybody, and it is the
   * point: `SENSITIVE_EMPLOYEE_FIELDS` in `approvehr-api/src/lib/audit.ts`
   * records that an account number *changed* and never what it changed to, so
   * the audit log never becomes a second copy of the data. Printing all ten
   * digits permanently on a monitor in an open-plan office undoes that at the
   * one place it matters.
   */
  const canReveal = canSeeSalaries || (me !== null && me === employee.id);

  /* The department picker sends an id, and the id it should show as selected is
     the one whose name matches the record — `Employee` carries the name only.
     Works in both modes: offline `flat` is derived from the seed. */
  const currentDepartment = departments.flat.find(
    (d) => d.name === employee.department,
  );

  /* Completeness counts the fields payroll and compliance actually need —
     not every field on the form, which would always read "incomplete". */
  const tracked = [
    employee.email,
    employee.phone,
    employee.bankAccount,
    employee.pensionPin,
    employee.tin,
    employee.nhfNumber,
    employee.dateOfBirth,
    employee.nextOfKin,
  ];
  const complete = tracked.filter(Boolean).length;
  const completeness = Math.round((complete / tracked.length) * 100);

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
      {/* Identity rail */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
        <Card>
          <CardBody className="flex flex-col items-center gap-3 text-center">
            <Avatar name={name} size="lg" tone="accent" />
            <div>
              <p className="text-h4 text-ink">{name}</p>
              <p className="mt-0.5 text-[0.875rem] text-muted">
                {employee.jobTitle}
              </p>
            </div>
            <Badge tone={status.tone} dot>
              {status.label}
            </Badge>
          </CardBody>

          <CardBody className="border-t border-line">
            <ul className="flex flex-col gap-2.5">
              <Contact icon={<Mail aria-hidden="true" />} value={employee.email} missing="No email address" />
              <Contact icon={<Phone aria-hidden="true" />} value={employee.phone} missing="No phone number" />
              <Contact icon={<MapPin aria-hidden="true" />} value={employee.location} />
              <Contact
                icon={<CalendarDays aria-hidden="true" />}
                value={`Started ${employee.startDate}`}
              />
            </ul>
          </CardBody>

          <CardBody className="border-t border-line">
            <ProgressMeter
              value={completeness}
              label="Record complete"
              showValue
              tone={completeness === 100 ? "success" : completeness >= 70 ? "accent" : "warning"}
            />
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex flex-col gap-2">
            <ButtonLink
              href={`/payroll/payslips/${employee.id}`}
              variant="secondary"
              size="sm"
              block
            >
              <FileText aria-hidden="true" className="size-3.5" />
              View latest payslip
            </ButtonLink>
            <Button
              variant="secondary"
              size="sm"
              block
              onClick={() => setFileOpen(true)}
            >
              Their documents
            </Button>
          </CardBody>
        </Card>
      </aside>

      {/* Detail */}
      <div className="flex min-w-0 flex-col gap-5">
        {missing.length > 0 && (
          <Callout
            tone="danger"
            icon={<ShieldAlert aria-hidden="true" />}
            title={`${missing.length} field${missing.length > 1 ? "s" : ""} missing before payroll can run`}
          >
            {missing.join(", ")}. They will be left out of the next run until{" "}
            {missing.length > 1 ? "these are" : "this is"} added.
          </Callout>
        )}

        {employee.endDate && (
          <Callout tone="warning" title="Leaving the company">
            Last day is {employee.endDate}. Check final settlement, outstanding
            loan balance and unused leave before the final run.
          </Callout>
        )}

        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: "personal", label: "Personal" },
            { id: "employment", label: "Employment" },
            { id: "pay", label: "Pay & statutory" },
            { id: "leave", label: "Leave" },
            { id: "conduct", label: "Conduct" },
          ]}
        />

        {tab === "personal" && (
          <div className="flex flex-col gap-5">
            <EditableSection
              title="Personal details"
              employee={employee}
              onSave={onSave}
              fields={[
                { key: "firstName", label: "First name", required: true },
                { key: "lastName", label: "Last name", required: true },
                {
                  key: "email",
                  label: "Work email",
                  type: "email",
                  emptyLabel: "No email address",
                  help: "Payslips and approvals are sent here.",
                },
                { key: "phone", label: "Phone", type: "tel" },
                { key: "dateOfBirth", label: "Date of birth", type: "date" },
                {
                  key: "gender",
                  label: "Gender",
                  type: "select",
                  options: [
                    { value: "", label: "Prefer not to say" },
                    { value: "female", label: "Female" },
                    { value: "male", label: "Male" },
                    { value: "other", label: "Other" },
                  ],
                },
              ]}
            />

            <Card>
              <CardHeader title="Next of kin" />
              <CardBody>
                {employee.nextOfKin ? (
                  <DescriptionList
                    columns={2}
                    items={[
                      { term: "Name", value: employee.nextOfKin.name },
                      { term: "Relationship", value: employee.nextOfKin.relationship },
                      { term: "Phone", value: employee.nextOfKin.phone },
                    ]}
                  />
                ) : (
                  <p className="text-[0.875rem] text-muted">
                    No next of kin recorded. This is requested during onboarding
                    and is needed for insurance claims.
                  </p>
                )}
              </CardBody>
            </Card>
          </div>
        )}

        {tab === "employment" && (
          <div className="flex flex-col gap-5">
            <EditableSection
              title="Role"
              employee={employee}
              onSave={onSave}
              fields={[
                { key: "jobTitle", label: "Job title", required: true },
                {
                  key: "departmentId",
                  label: "Department",
                  type: "select",
                  value: currentDepartment?.id ?? "",
                  format: () => employee.department,
                  options: [
                    { value: "", label: "Not assigned" },
                    ...departments.flat.map((d) => ({
                      value: d.id,
                      label: d.name,
                    })),
                  ],
                },
                {
                  key: "employmentType",
                  label: "Employment type",
                  type: "select",
                  help: "Contract staff are taxed under withholding tax, not PAYE.",
                  value: enumKey(employee.employmentType),
                  format: (v) => TYPE_LABELS[enumKey(String(v))] ?? String(v),
                  options: connected ? API_TYPES : LOCAL_TYPES,
                },
                { key: "startDate", label: "Start date", type: "date" },
                {
                  key: "status",
                  label: "Status",
                  type: "select",
                  value: enumKey(employee.status),
                  format: (v) => statusOf(String(v)).label,
                  options: connected ? API_STATUSES : LOCAL_STATUSES,
                },
                {
                  key: "grossMonthly",
                  label: "Gross monthly",
                  type: "number",
                  required: true,
                  help: "Changing this changes their next payslip.",
                  /* Two decimals, never abbreviated: this is a figure somebody
                     reconciles against a bank statement. */
                  format: (v) => <Money amount={Number(v)} decimals />,
                },
              ]}
            />

            <Card>
              <CardHeader title="Reporting line" />
              <CardBody className="flex flex-col gap-4">
                <div>
                  <p className="mb-2 text-[0.75rem] font-semibold tracking-wide text-muted">
                    Reports to
                  </p>
                  {manager ? (
                    <PersonLink employee={manager} />
                  ) : managerName ? (
                    <p className="text-[0.875rem] text-body">{managerName}</p>
                  ) : (
                    <p className="text-[0.875rem] text-muted">
                      No manager — reports to the board.
                    </p>
                  )}
                </div>

                <div className="border-t border-line pt-4">
                  <p className="mb-2 flex items-center gap-1.5 text-[0.75rem] font-semibold tracking-wide text-muted">
                    <Users aria-hidden="true" className="size-3.5" />
                    Direct reports ({reports.length})
                  </p>
                  {reports.length === 0 ? (
                    <p className="text-[0.875rem] text-muted">None.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {reports.map((r) => (
                        <PersonLink key={r.id} employee={r} />
                      ))}
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>

            {/* Renders nothing at all without VIEW_AUDIT — by design. */}
            <RecordHistory
              entityType="employees"
              entityId={employee.id}
              title="Changes to this record"
            />
          </div>
        )}

        {tab === "pay" && (
          <div className="flex flex-col gap-5">
            <Compensation employee={employee} connected={connected} />

            {/* What they get on top of salary belongs on their record, not on a
                separate setup screen. The panel owns its own loading, errors
                and demo-mode caveats. */}
            <PayComponentsPanel employeeId={employee.id} />

            <EditableSection
              title="Payment and statutory"
              description="What payroll needs to pay and remit. Missing values block the run."
              employee={employee}
              onSave={onSave}
              fields={[
                {
                  key: "bankName",
                  label: "Bank",
                  type: "select",
                  options: BANKS.map((b) => ({
                    value: b,
                    label: b || "Select a bank",
                  })),
                },
                {
                  key: "bankAccount",
                  label: "Account",
                  emptyLabel: "No bank account — payroll blocked",
                  help: "Ten digits. Payroll cannot pay without this.",
                  format: (v) => <Guarded value={String(v)} canReveal={canReveal} />,
                },
                {
                  key: "pensionPin",
                  label: "Pension PIN",
                  emptyLabel: "No pension PIN — payroll blocked",
                  help: "PEN followed by 9 to 12 digits.",
                  format: (v) => <Guarded value={String(v)} canReveal={canReveal} />,
                },
                {
                  key: "pensionProvider",
                  label: "Pension provider",
                  type: "select",
                  options: PFAS.map((p) => ({
                    value: p,
                    label: p || "Select a PFA",
                  })),
                },
                {
                  key: "taxState",
                  label: "Tax state",
                  type: "select",
                  help: "Sets which state IRS receives their PAYE.",
                  options: TAX_STATES.map((s) => ({ value: s, label: s })),
                },
                {
                  key: "tin",
                  label: "TIN",
                  emptyLabel: "No TIN — payroll blocked",
                  help: "Ten digits.",
                  format: (v) => <Guarded value={String(v)} canReveal={canReveal} />,
                },
                {
                  key: "nhfNumber",
                  label: "NHF number",
                  format: (v) => <Guarded value={String(v)} canReveal={canReveal} />,
                },
              ]}
            />
          </div>
        )}

        {tab === "leave" && (
          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader
                title="Leave balances"
                description={
                  connected
                    ? "Entitlement, taken and pending as the leave module computes them — the same figures a booking is checked against."
                    : "Taken and pending are counted from their actual requests, so a decision made in the approvals inbox shows here immediately."
                }
              />
              {leaveLoading && balances.length === 0 ? (
                <CardBody className="flex flex-col gap-2">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-full" />
                  <span className="sr-only">Loading their leave balances</span>
                </CardBody>
              ) : balances.length === 0 ? (
                <CardBody>
                  <p className="text-[0.875rem] text-muted">
                    No leave types are set up yet, so there is nothing to
                    measure against.
                  </p>
                </CardBody>
              ) : (
                <TableWrap className="rounded-none border-0">
                  <THead>
                    <TH>Type</TH>
                    <TH align="right">Entitled</TH>
                    <TH align="right">Taken</TH>
                    <TH align="right">Pending</TH>
                    <TH align="right">Remaining</TH>
                  </THead>
                  <TBody>
                    {balances.map((b) => (
                      <TR key={`${b.leaveType}-${b.year}`}>
                        <TDPrimary
                          title={b.leaveType}
                          {...(b.carriedIn > 0
                            ? {
                                subtitle: `includes ${b.carriedIn} carried in`,
                              }
                            : {})}
                        />
                        <TD align="right" className="tabular">
                          {b.entitled}
                        </TD>
                        <TD align="right" className="tabular text-muted">
                          {b.taken}
                        </TD>
                        <TD align="right" className="tabular text-muted">
                          {b.pending || "—"}
                        </TD>
                        {/* The source's own figure, never re-derived here.
                            Pending is held back on purpose — a day already
                            asked for is not a day still available. */}
                        <TD
                          align="right"
                          className={cn(
                            "tabular font-medium",
                            b.remaining <= 2 ? "text-warning-text" : "text-ink",
                          )}
                        >
                          {b.remaining}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </TableWrap>
              )}
            </Card>

            <Card>
              <CardHeader
                title="Requests"
                description="Every request they have raised, and what happened to it."
                level={3}
              />
              {leaveRequests.length === 0 ? (
                <CardBody>
                  <p className="text-[0.875rem] text-muted">
                    No leave requested yet.
                  </p>
                </CardBody>
              ) : (
                <TableWrap className="rounded-none border-0">
                  <THead>
                    <TH>Type</TH>
                    <TH>Dates</TH>
                    <TH align="right">Days</TH>
                    <TH>Status</TH>
                    <TH>Decided</TH>
                  </THead>
                  <TBody>
                    {[...leaveRequests]
                      .sort((a, b) => b.from.localeCompare(a.from))
                      .map((r) => (
                        <TR key={r.id}>
                          <TDPrimary
                            title={r.leaveType}
                            {...(r.reason ?? r.decisionNote
                              ? { subtitle: r.reason ?? r.decisionNote ?? "" }
                              : {})}
                          />
                          <TD className="tabular whitespace-nowrap">
                            {r.from} → {r.to}
                          </TD>
                          <TD align="right" className="tabular">
                            {r.days}
                          </TD>
                          <TD>
                            <Badge
                              tone={
                                r.status === "approved"
                                  ? "success"
                                  : r.status === "pending"
                                    ? "warning"
                                    : r.status === "declined"
                                      ? "danger"
                                      : "neutral"
                              }
                              size="sm"
                              dot
                            >
                              {r.status[0].toUpperCase() + r.status.slice(1)}
                            </Badge>
                          </TD>
                          <TD className="text-muted">
                            {r.decidedAt ? shortDate(r.decidedAt) : "—"}
                          </TD>
                        </TR>
                      ))}
                  </TBody>
                </TableWrap>
              )}
            </Card>
          </div>
        )}

        {/* Behind a tab on purpose rather than further down the employment
            page. Every read of `GET /conduct/employees/:id/actions` writes an
            audit event before it answers, so opening this has to be something
            somebody chose to do — a panel that loaded with the record would
            fill the trail that answers "who has been looking at this person's
            warnings" with reads nobody made. */}
        {tab === "conduct" && <ConductPanel employeeId={employee.id} />}
      </div>

      {/* The same file, and the same upload and request flow, as the documents
          register — rather than a second list that drifts from it. */}
      <EmployeeFileDrawer
        employeeId={fileOpen ? employee.id : null}
        onClose={() => setFileOpen(false)}
        onChanged={() => {}}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Where the salary goes, and what comes off it.
 *
 * Connected, every figure is the server's — the same engine the payroll run
 * uses, read from `GET /pay-components/preview/:employeeId`. That matters more
 * than saving a request: the allowances panel directly below this card gets its
 * take-home figure from that endpoint, and two nets on one screen that disagree
 * because one was computed in the browser is exactly the defect this product is
 * sold against.
 *
 * Offline it falls back to the frontend engine, which is the only arithmetic
 * available with no server, and says so.
 */
function Compensation({
  employee,
  connected,
}: {
  employee: Employee;
  connected: boolean;
}) {
  const preview = usePayPreview(employee.id);
  const { settings } = usePayrollSettings();

  const live = preview.data?.payslip ?? null;
  const local = calculatePayslip(
    employee.id,
    employee.grossMonthly,
    undefined,
    settings,
  );

  const figures = live
    ? {
        gross: naira(live.grossKobo),
        basic: naira(live.basicKobo),
        housing: naira(live.housingKobo),
        transport: naira(live.transportKobo),
        pensionEmployee: naira(live.pensionEmployeeKobo),
        nhf: naira(live.nhfKobo),
        paye: naira(live.payeKobo),
        net: naira(live.netKobo),
        pensionEmployer: naira(live.pensionEmployerKobo),
      }
    : {
        gross: local.grossMonthly,
        basic: local.basic,
        housing: local.housing,
        transport: local.transport,
        pensionEmployee: local.pensionEmployee,
        nhf: local.nhf,
        paye: local.payeMonthly,
        net: local.netPay,
        pensionEmployer: local.pensionEmployer,
      };

  return (
    <Card>
      <CardHeader
        title="Compensation"
        description="Split according to your company salary structure."
        action={
          <ButtonLink href="/settings/payroll" variant="ghost" size="sm">
            Structure settings
          </ButtonLink>
        }
      />
      <CardBody className="flex flex-col gap-3">
        {connected && preview.loading && !live ? (
          <>
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-2/3" />
            <span className="sr-only">Working out this month’s figures</span>
          </>
        ) : (
          <>
            {connected && preview.error && (
              <p className="text-[0.875rem] text-danger-text">
                {preview.error.message} The figures below were worked out in this
                browser instead.
              </p>
            )}
            <Line label="Gross monthly" value={figures.gross} strong />
            <div className="h-px bg-line" />
            <Line label="Basic" value={figures.basic} muted />
            <Line label="Housing" value={figures.housing} muted />
            <Line label="Transport" value={figures.transport} muted />
            <div className="h-px bg-line" />
            <Line label="Pension (employee)" value={-figures.pensionEmployee} />
            <Line label="NHF" value={-figures.nhf} />
            <Line label="PAYE" value={-figures.paye} />
            <div className="h-px bg-line" />
            <Line label="Net monthly" value={figures.net} strong />
            <p className="mt-1 rounded-md bg-canvas p-2.5 text-[0.75rem] leading-relaxed text-muted">
              Employer pension of{" "}
              <Money amount={figures.pensionEmployer} decimals /> is paid on top
              and is not deducted.
              {live ? "" : " Worked out in this browser — start the API for the figures a real run would use."}
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * A bank account, a pension PIN, a TIN, an NHF number.
 *
 * Masked until somebody asks for it. The API redacts exactly these four fields
 * by name in the audit trail — `SENSITIVE_EMPLOYEE_FIELDS` in
 * `approvehr-api/src/lib/audit.ts` records that an account number *changed* and
 * never what it changed to, so the log does not become a second copy of the
 * data. A record page that prints them permanently on a monitor in an open
 * office undoes that at the one place it matters.
 *
 * The last four digits are enough to confirm you have the right account. The
 * rest is one click away for whoever has to read it out to a bank.
 *
 * Without the permission there is no button, rather than a disabled one or a
 * sentence explaining the refusal — the same choice `RecordHistory` makes for
 * the audit panel. A control that cannot work is worse present than absent, and
 * the masked value still answers the question somebody usually has, which is
 * "is this the right account".
 */
function Guarded({
  value,
  canReveal,
}: {
  value: string;
  /** `VIEW_SALARIES`, or their own record. See `canReveal` above. */
  canReveal: boolean;
}) {
  const [shown, setShown] = useState(false);
  const masked =
    value.length > 4 ? `•••• ${value.slice(-4)}` : "•".repeat(value.length);
  const revealed = shown && canReveal;

  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular">{revealed ? value : masked}</span>
      {!revealed && (
        <span className="sr-only">
          — hidden. Only the last four characters are shown.
        </span>
      )}
      {canReveal && (
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          className="inline-flex items-center gap-1 rounded-xs text-[0.75rem] font-medium text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
        >
          {shown ? (
            <EyeOff aria-hidden="true" className="size-3" />
          ) : (
            <Eye aria-hidden="true" className="size-3" />
          )}
          {shown ? "Hide" : "Show"}
        </button>
      )}
    </span>
  );
}

function Contact({
  icon,
  value,
  missing,
}: {
  icon: React.ReactNode;
  value: string | null;
  missing?: string;
}) {
  return (
    <li className="flex items-center gap-2.5">
      <span className="shrink-0 text-faint [&>svg]:size-3.5">{icon}</span>
      <span
        className={cn(
          "min-w-0 truncate text-[0.875rem]",
          value ? "text-body" : "text-danger-text",
        )}
      >
        {value ?? missing}
      </span>
    </li>
  );
}

function PersonLink({ employee }: { employee: Employee }) {
  return (
    <Link
      href={`/people/${employee.id}`}
      className="flex items-center gap-2.5 rounded-md border border-line p-2.5 transition-colors hover:bg-canvas"
    >
      <Avatar name={fullName(employee)} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.875rem] font-medium text-ink">
          {fullName(employee)}
        </span>
        <span className="block truncate text-[0.75rem] text-muted">
          {employee.jobTitle}
        </span>
      </span>
    </Link>
  );
}

function Line({
  label,
  value,
  strong = false,
  muted = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className={
          strong
            ? "text-[0.875rem] font-medium text-ink"
            : muted
              ? "text-[0.75rem] text-faint"
              : "text-[0.875rem] text-body"
        }
      >
        {label}
      </span>
      <span
        className={
          strong
            ? "tabular text-[0.9375rem] font-semibold text-ink"
            : "tabular text-[0.875rem] text-body"
        }
      >
        <Money amount={value} decimals />
      </span>
    </div>
  );
}
