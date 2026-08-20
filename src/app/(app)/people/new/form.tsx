"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ShieldAlert, UserRoundPlus } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Money,
  Select,
  useToast,
} from "@/components/ui";
import {
  nextIdentity,
  useEmployeeStore,
  validateEmployee,
  type FieldError,
} from "@/lib/store/employees";
import { calculatePayslip } from "@/lib/payroll/engine";
import { usePayrollSettings } from "@/lib/payroll/use-settings";
import {
  fullName,
  missingForPayroll,
  type Employee,
  type EmploymentStatus,
  type EmploymentType,
} from "@/lib/types";

/*
 * Adding a starter.
 *
 * Only what HR genuinely knows on day one is required. Bank account, pension
 * PIN and TIN are collected here if available but never blocked on — in
 * practice the record is created before the person has handed those over, and
 * refusing to save until they do just pushes the record into a spreadsheet
 * until it is "ready".
 *
 * Instead the form shows, live, exactly what will block payroll if left blank.
 * The record gets created either way and the existing blocker machinery on the
 * record page, the onboarding checklist and the payroll run picks it up.
 */

const DEPARTMENTS = [
  "Engineering",
  "Finance",
  "Product",
  "Operations",
  "People",
  "Sales",
];
const LOCATIONS = [
  "Lagos, NG",
  "Abuja, NG",
  "Abeokuta, NG",
  "Port Harcourt, NG",
  "Remote, NG",
];
const TAX_STATES = ["Lagos", "Abuja", "Ogun", "Rivers", "Kano"];
const BANKS = [
  "GTBank",
  "Zenith Bank",
  "Access Bank",
  "UBA",
  "First Bank",
  "Stanbic IBTC",
  "Kuda",
];
const PFAS = [
  "Stanbic IBTC Pensions",
  "ARM Pensions",
  "Leadway Pensure",
  "Premium Pensions",
];

type Draft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  jobTitle: string;
  department: string;
  location: string;
  managerId: string;
  employmentType: EmploymentType;
  status: EmploymentStatus;
  startDate: string;
  grossMonthly: string;
  taxState: string;
  bankName: string;
  bankAccount: string;
  pensionPin: string;
  pensionProvider: string;
  tin: string;
  nhfNumber: string;
};

const BLANK: Draft = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  dateOfBirth: "",
  jobTitle: "",
  department: "Engineering",
  location: "Lagos, NG",
  managerId: "",
  employmentType: "full_time",
  status: "onboarding",
  startDate: "",
  grossMonthly: "",
  taxState: "Lagos",
  bankName: "",
  bankAccount: "",
  pensionPin: "",
  pensionProvider: "",
  tin: "",
  nhfNumber: "",
};

export function NewEmployeeForm() {
  const router = useRouter();
  const toast = useToast();
  const { directory, all, create } = useEmployeeStore();
  const { settings } = usePayrollSettings();

  const [draft, setDraft] = useState<Draft>(BLANK);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((x) => x.filter((e) => e.field !== (key as keyof Employee)));
  };

  const errorFor = (k: keyof Employee) =>
    errors.find((e) => e.field === k)?.message;

  const gross = Number(draft.grossMonthly.replace(/[^\d.]/g, "")) || 0;

  /* Preview the first payslip as the salary is typed, so the person entering
     it sees net pay rather than only the headline figure. */
  const preview = useMemo(
    () => (gross > 0 ? calculatePayslip("preview", gross, undefined, settings) : null),
    [gross, settings],
  );

  /* What would block payroll if this were saved right now. */
  const wouldBlock = missingForPayroll({
    bankAccount: draft.bankAccount || null,
    pensionPin: draft.pensionPin || null,
    tin: draft.tin || null,
  } as Employee);

  function submit(openAfter: boolean) {
    const required: FieldError[] = [];
    if (!draft.firstName.trim())
      required.push({ field: "firstName", message: "First name is required." });
    if (!draft.lastName.trim())
      required.push({ field: "lastName", message: "Last name is required." });
    if (!draft.jobTitle.trim())
      required.push({ field: "jobTitle", message: "Job title is required." });
    if (!draft.startDate)
      required.push({ field: "startDate", message: "Start date is required." });
    if (gross <= 0)
      required.push({
        field: "grossMonthly",
        message: "Enter their gross monthly salary.",
      });

    /* Optional fields are only format-checked when actually filled in. */
    const optional = validateEmployee({
      ...(draft.email ? { email: draft.email } : {}),
      ...(draft.phone ? { phone: draft.phone } : {}),
      ...(draft.tin ? { tin: draft.tin } : {}),
      ...(draft.pensionPin ? { pensionPin: draft.pensionPin } : {}),
      ...(draft.dateOfBirth ? { dateOfBirth: draft.dateOfBirth } : {}),
    });

    const found = [...required, ...optional];
    if (found.length > 0) {
      setErrors(found);
      document.getElementById(String(found[0].field))?.focus();
      return;
    }

    const { id, employeeNo } = nextIdentity(all);
    const employee: Employee = {
      id,
      employeeNo,
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      email: draft.email.trim() || null,
      phone: draft.phone.trim() || null,
      dateOfBirth: draft.dateOfBirth || null,
      jobTitle: draft.jobTitle.trim(),
      department: draft.department,
      managerId: draft.managerId || null,
      location: draft.location,
      employmentType: draft.employmentType,
      startDate: draft.startDate,
      status: draft.status,
      grossMonthly: gross,
      bankName: draft.bankName || null,
      bankAccount: draft.bankAccount.trim() || null,
      pensionPin: draft.pensionPin.trim() || null,
      pensionProvider: draft.pensionProvider || null,
      taxState: draft.taxState,
      tin: draft.tin.trim() || null,
      nhfNumber: draft.nhfNumber.trim() || null,
      nextOfKin: null,
    };

    setBusy(true);
    setTimeout(() => {
      create(employee);
      setBusy(false);
      toast.push({
        title: `${fullName(employee)} added`,
        tone: "success",
        detail:
          wouldBlock.length > 0
            ? `${wouldBlock.length} field${wouldBlock.length > 1 ? "s" : ""} still needed before payroll.`
            : "Record is complete and payroll-ready.",
      });
      router.push(openAfter ? `/people/${employee.id}` : "/people");
    }, 400);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader title="Who they are" />
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <Field label="First name" required error={errorFor("firstName")}>
              <Input
                id="firstName"
                value={draft.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                autoFocus
              />
            </Field>
            <Field label="Last name" required error={errorFor("lastName")}>
              <Input
                id="lastName"
                value={draft.lastName}
                onChange={(e) => set("lastName", e.target.value)}
              />
            </Field>
            <Field
              label="Work email"
              error={errorFor("email")}
              help="Payslips and approvals go here."
            >
              <Input
                id="email"
                type="email"
                value={draft.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="name@schulltech.com"
              />
            </Field>
            <Field label="Phone" error={errorFor("phone")}>
              <Input
                id="phone"
                type="tel"
                value={draft.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+234 803 000 0000"
              />
            </Field>
            <Field label="Date of birth" error={errorFor("dateOfBirth")}>
              <Input
                id="dateOfBirth"
                type="date"
                value={draft.dateOfBirth}
                onChange={(e) => set("dateOfBirth", e.target.value)}
              />
            </Field>
            <Field label="Location">
              <Select
                value={draft.location}
                onChange={(e) => set("location", e.target.value)}
              >
                {LOCATIONS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="What they do" />
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <Field label="Job title" required error={errorFor("jobTitle")}>
              <Input
                id="jobTitle"
                value={draft.jobTitle}
                onChange={(e) => set("jobTitle", e.target.value)}
                placeholder="Software Engineer"
              />
            </Field>
            <Field label="Department">
              <Select
                value={draft.department}
                onChange={(e) => set("department", e.target.value)}
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reports to">
              <Select
                value={draft.managerId}
                onChange={(e) => set("managerId", e.target.value)}
              >
                <option value="">No manager</option>
                {directory.map((e) => (
                  <option key={e.id} value={e.id}>
                    {fullName(e)} — {e.jobTitle}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Employment type"
              help="Contract staff are taxed under withholding tax, not PAYE."
            >
              <Select
                value={draft.employmentType}
                onChange={(e) =>
                  set("employmentType", e.target.value as EmploymentType)
                }
              >
                <option value="full_time">Full time</option>
                <option value="contract">Contract</option>
                <option value="internship">Internship</option>
              </Select>
            </Field>
            <Field label="Start date" required error={errorFor("startDate")}>
              <Input
                id="startDate"
                type="date"
                value={draft.startDate}
                onChange={(e) => set("startDate", e.target.value)}
              />
            </Field>
            <Field label="Status">
              <Select
                value={draft.status}
                onChange={(e) =>
                  set("status", e.target.value as EmploymentStatus)
                }
              >
                <option value="onboarding">Onboarding</option>
                <option value="probation">Probation</option>
                <option value="active">Active</option>
              </Select>
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="How they are paid"
            description="Salary is required. The statutory identifiers can follow once they hand them over."
          />
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Gross monthly"
              required
              error={errorFor("grossMonthly")}
              help="Before PAYE, pension and NHF."
            >
              <Input
                id="grossMonthly"
                inputMode="numeric"
                value={draft.grossMonthly}
                onChange={(e) => set("grossMonthly", e.target.value)}
                placeholder="₦850,000"
              />
            </Field>
            <Field
              label="Tax state"
              help="Sets which state IRS receives their PAYE."
            >
              <Select
                value={draft.taxState}
                onChange={(e) => set("taxState", e.target.value)}
              >
                {TAX_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Bank">
              <Select
                value={draft.bankName}
                onChange={(e) => set("bankName", e.target.value)}
              >
                <option value="">Select later</option>
                {BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Account number">
              <Input
                value={draft.bankAccount}
                onChange={(e) => set("bankAccount", e.target.value)}
                placeholder="0123456789"
              />
            </Field>
            <Field
              label="Pension PIN"
              error={errorFor("pensionPin")}
              help="PEN followed by 9 to 12 digits."
            >
              <Input
                id="pensionPin"
                value={draft.pensionPin}
                onChange={(e) => set("pensionPin", e.target.value)}
                placeholder="PEN100000000"
              />
            </Field>
            <Field label="Pension provider">
              <Select
                value={draft.pensionProvider}
                onChange={(e) => set("pensionProvider", e.target.value)}
              >
                <option value="">Select later</option>
                {PFAS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="TIN" error={errorFor("tin")} help="Ten digits.">
              <Input
                id="tin"
                value={draft.tin}
                onChange={(e) => set("tin", e.target.value)}
                placeholder="1234567890"
              />
            </Field>
            <Field label="NHF number">
              <Input
                value={draft.nhfNumber}
                onChange={(e) => set("nhfNumber", e.target.value)}
              />
            </Field>
          </CardBody>
        </Card>

        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-line bg-surface px-1 py-3">
          <Button variant="ghost" onClick={() => router.push("/people")}>
            <ArrowLeft aria-hidden="true" className="size-4" />
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => submit(false)} disabled={busy}>
              Save and add another
            </Button>
            <Button variant="approve" onClick={() => submit(true)} loading={busy}>
              {!busy && <Check aria-hidden="true" className="size-4" />}
              Add employee
            </Button>
          </div>
        </div>
      </div>

      {/* Live consequences */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
        <Card>
          <CardHeader title="Payroll readiness" />
          <CardBody className="flex flex-col gap-3">
            {wouldBlock.length === 0 ? (
              <Callout tone="success" title="Payroll ready">
                Everything payroll needs is present. This person will be picked
                up by the next run.
              </Callout>
            ) : (
              <Callout
                tone="warning"
                icon={<ShieldAlert aria-hidden="true" />}
                title={`${wouldBlock.length} still needed`}
              >
                {wouldBlock.join(", ")}. You can save now — the record will show
                these as outstanding and the payroll run will block on them
                until they are added.
              </Callout>
            )}

            <ul className="flex flex-col gap-2">
              {[
                ["Bank account", Boolean(draft.bankAccount)],
                ["Pension PIN", Boolean(draft.pensionPin)],
                ["TIN", Boolean(draft.tin)],
              ].map(([label, done]) => (
                <li
                  key={String(label)}
                  className="flex items-center gap-2.5 text-[0.875rem]"
                >
                  <span
                    className={
                      done
                        ? "flex size-4 items-center justify-center rounded-full bg-success text-ink"
                        : "flex size-4 items-center justify-center rounded-full border border-line-strong"
                    }
                  >
                    {done ? (
                      <Check aria-hidden="true" className="size-2.5" strokeWidth={3} />
                    ) : null}
                  </span>
                  <span className={done ? "text-body" : "text-muted"}>
                    {String(label)}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        {preview && (
          <Card>
            <CardHeader
              title="First payslip"
              description="Calculated on your company settings."
            />
            <CardBody className="flex flex-col gap-2.5">
              <Row label="Gross" value={preview.grossMonthly} strong />
              <div className="h-px bg-line" />
              <Row label="Pension" value={-preview.pensionEmployee} />
              <Row label="NHF" value={-preview.nhf} />
              <Row label="PAYE" value={-preview.payeMonthly} />
              <div className="h-px bg-line" />
              <Row label="Net monthly" value={preview.netPay} strong />
              <p className="mt-1 rounded-md bg-canvas p-2.5 text-[0.75rem] leading-relaxed text-muted">
                Employer pension of{" "}
                <Money amount={Math.round(preview.pensionEmployer)} /> is paid
                on top and is not deducted.
              </p>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardBody className="flex items-start gap-3">
            <UserRoundPlus
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-faint"
            />
            <p className="text-[0.75rem] leading-relaxed text-muted">
              Saving with a status of{" "}
              <Badge tone="info" size="sm">
                Onboarding
              </Badge>{" "}
              adds them to the onboarding checklist automatically.
            </p>
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className={
          strong
            ? "text-[0.875rem] font-medium text-ink"
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
