"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
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
import { calculatePayslip } from "@/lib/payroll/engine";
import { usePayrollSettings } from "@/lib/payroll/use-settings";
import {
  fullName,
  missingForPayroll,
  type Employee,
  type EmploymentStatus,
} from "@/lib/types";
import type { EmployeeDocument, LeaveBalance } from "@/lib/mock/people";
import type { LeaveRequest } from "@/lib/mock/workflows";
import { shortDate } from "@/lib/today";
import { useEmployeeStore } from "@/lib/store/employees";
import { EditableSection } from "@/components/people/editable-section";

const STATUS: Record<EmploymentStatus, { tone: BadgeTone; label: string }> = {
  active: { tone: "success", label: "Active" },
  onboarding: { tone: "info", label: "Onboarding" },
  probation: { tone: "warning", label: "Probation" },
  on_leave: { tone: "info", label: "On leave" },
  offboarding: { tone: "warning", label: "Offboarding" },
  inactive: { tone: "neutral", label: "Inactive" },
};

const TYPE_LABEL = {
  full_time: "Full time",
  contract: "Contract",
  internship: "Internship",
};

/**
 * The employee record.
 *
 * Identity sits in a fixed rail so it stays visible while the detail scrolls —
 * you should never lose track of whose record you are editing. Everything the
 * payroll run blocks on is surfaced at the top rather than buried in a tab,
 * because this page is where those blockers get resolved.
 */
export function EmployeeRecord({
  employee: seed,
  manager,
  reports,
  balances,
  leaveRequests,
  documents,
}: {
  employee: Employee;
  manager: Employee | null;
  reports: Employee[];
  balances: LeaveBalance[];
  /** This employee's own requests, newest first. Live, not seed. */
  leaveRequests: LeaveRequest[];
  documents: EmployeeDocument[];
}) {
  const [tab, setTab] = useState("personal");
  const { settings } = usePayrollSettings();
  const { get } = useEmployeeStore();

  /* Read through the store so an edit made here immediately changes the
     completeness meter, the payroll blockers and the compensation split —
     the whole reason for editing in the first place. */
  const employee = get(seed.id) ?? seed;

  const name = fullName(employee);
  const missing = missingForPayroll(employee);
  const slip = calculatePayslip(
    employee.id,
    employee.grossMonthly,
    undefined,
    settings,
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
            <Badge tone={STATUS[employee.status].tone} dot>
              {STATUS[employee.status].label}
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
            <Button variant="secondary" size="sm" block>
              Generate letter
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
            {missing.join(", ")}. The August run is blocked for this employee
            until {missing.length > 1 ? "these are" : "this is"} added.
          </Callout>
        )}

        {employee.status === "offboarding" && employee.endDate && (
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
            { id: "documents", label: "Documents", count: documents.length },
          ]}
        />

        {tab === "personal" && (
          <div className="flex flex-col gap-5">
            <EditableSection
              title="Personal details"
              employee={employee}
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
                {
                  key: "location",
                  label: "Location",
                  type: "select",
                  options: [
                    "Lagos, NG",
                    "Abuja, NG",
                    "Abeokuta, NG",
                    "Port Harcourt, NG",
                    "Remote, NG",
                  ].map((l) => ({ value: l, label: l })),
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
              fields={[
                { key: "jobTitle", label: "Job title", required: true },
                {
                  key: "department",
                  label: "Department",
                  type: "select",
                  options: [
                    "Engineering",
                    "Finance",
                    "Product",
                    "Operations",
                    "People",
                    "Sales",
                  ].map((d) => ({ value: d, label: d })),
                },
                {
                  key: "employmentType",
                  label: "Employment type",
                  type: "select",
                  help: "Contract staff are taxed under withholding tax, not PAYE.",
                  options: Object.entries(TYPE_LABEL).map(([value, label]) => ({
                    value,
                    label,
                  })),
                },
                { key: "startDate", label: "Start date", type: "date" },
                {
                  key: "status",
                  label: "Status",
                  type: "select",
                  options: Object.entries(STATUS).map(([value, v]) => ({
                    value,
                    label: v.label,
                  })),
                },
                {
                  key: "grossMonthly",
                  label: "Gross monthly",
                  type: "number",
                  required: true,
                  help: "Changing this changes their next payslip.",
                  format: (v) => <Money amount={Number(v)} />,
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
          </div>
        )}

        {tab === "pay" && (
          <div className="flex flex-col gap-5">
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
                <Line label="Gross monthly" value={slip.grossMonthly} strong />
                <div className="h-px bg-line" />
                <Line label="Basic" value={slip.basic} muted />
                <Line label="Housing" value={slip.housing} muted />
                <Line label="Transport" value={slip.transport} muted />
                <div className="h-px bg-line" />
                <Line label="Pension (employee)" value={-slip.pensionEmployee} />
                <Line label="NHF" value={-slip.nhf} />
                <Line label="PAYE" value={-slip.payeMonthly} />
                <div className="h-px bg-line" />
                <Line label="Net monthly" value={slip.netPay} strong />
                <p className="mt-1 rounded-md bg-canvas p-2.5 text-[0.75rem] leading-relaxed text-muted">
                  Employer pension of{" "}
                  <Money amount={Math.round(slip.pensionEmployer)} /> is paid on
                  top and is not deducted.
                </p>
              </CardBody>
            </Card>

            <EditableSection
              title="Payment and statutory"
              description="What payroll needs to pay and remit. Missing values block the run."
              employee={employee}
              fields={[
                {
                  key: "bankName",
                  label: "Bank",
                  type: "select",
                  options: [
                    "",
                    "GTBank",
                    "Zenith Bank",
                    "Access Bank",
                    "UBA",
                    "First Bank",
                    "Stanbic IBTC",
                    "Kuda",
                  ].map((b) => ({ value: b, label: b || "Select a bank" })),
                },
                {
                  key: "bankAccount",
                  label: "Account",
                  emptyLabel: "No bank account — payroll blocked",
                  help: "Payroll cannot pay without this.",
                },
                {
                  key: "pensionPin",
                  label: "Pension PIN",
                  emptyLabel: "No pension PIN — payroll blocked",
                  help: "PEN followed by 9 to 12 digits.",
                },
                {
                  key: "pensionProvider",
                  label: "Pension provider",
                  type: "select",
                  options: [
                    "",
                    "Stanbic IBTC Pensions",
                    "ARM Pensions",
                    "Leadway Pensure",
                    "Premium Pensions",
                  ].map((p) => ({ value: p, label: p || "Select a PFA" })),
                },
                {
                  key: "taxState",
                  label: "Tax state",
                  type: "select",
                  help: "Sets which state IRS receives their PAYE.",
                  options: ["Lagos", "Abuja", "Ogun", "Rivers", "Kano"].map(
                    (s) => ({ value: s, label: s }),
                  ),
                },
                {
                  key: "tin",
                  label: "TIN",
                  emptyLabel: "No TIN — payroll blocked",
                  help: "Ten digits.",
                },
                { key: "nhfNumber", label: "NHF number" },
              ]}
            />
          </div>
        )}

        {tab === "leave" && (
          <div className="flex flex-col gap-5">
          <Card>
            <CardHeader
              title="Leave balances"
              description="Taken and pending are counted from their actual requests, so a decision made in the approvals inbox shows here immediately."
            />
            <TableWrap className="rounded-none border-0">
              <THead>
                <TH>Type</TH>
                <TH align="right">Entitled</TH>
                <TH align="right">Taken</TH>
                <TH align="right">Pending</TH>
                <TH align="right">Remaining</TH>
              </THead>
              <TBody>
                {balances.map((b) => {
                  const remaining = b.entitled - b.taken - b.pending;
                  return (
                    <TR key={b.type}>
                      <TDPrimary title={b.type} />
                      <TD align="right" className="tabular">{b.entitled}</TD>
                      <TD align="right" className="tabular text-muted">{b.taken}</TD>
                      <TD align="right" className="tabular text-muted">
                        {b.pending || "—"}
                      </TD>
                      <TD
                        align="right"
                        className={cn(
                          "tabular font-medium",
                          remaining <= 2 ? "text-warning-text" : "text-ink",
                        )}
                      >
                        {remaining}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </TableWrap>
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
                          title={r.type}
                          subtitle={r.reason ?? r.decisionNote}
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

        {tab === "documents" && (
          <Card>
            <CardHeader
              title="Documents"
              action={
                <Button variant="secondary" size="sm">
                  Upload
                </Button>
              }
            />
            <CardBody className="flex flex-col gap-2.5">
              {documents.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-3 rounded-md border border-line p-3"
                >
                  <FileText aria-hidden="true" className="size-4 shrink-0 text-faint" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.875rem] font-medium text-ink">
                      {d.name}
                    </p>
                    <p className="text-[0.75rem] text-muted">
                      {d.category} · uploaded {d.uploadedAt}
                    </p>
                  </div>
                  <Badge tone={d.verified ? "success" : "warning"} size="sm" dot>
                    {d.verified ? "Verified" : "Unverified"}
                  </Badge>
                  <Button variant="ghost" size="sm">
                    Open
                  </Button>
                </div>
              ))}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */


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
        <Money amount={Math.round(value)} />
      </span>
    </div>
  );
}
