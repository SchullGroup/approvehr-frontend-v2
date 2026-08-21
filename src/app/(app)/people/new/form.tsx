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
import { ApiError } from "@/lib/api/client";
import { useCan } from "@/lib/permissions";
import {
  nextIdentity,
  useEmployeeStore,
  validateEmployee,
  type FieldError,
} from "@/lib/store/employees";
import {
  useEmployeeDirectory,
  useEmployeeMutations,
} from "@/lib/store/employees-api";
import { useWorkLocations } from "@/lib/store/attendance";
import { useDepartments } from "@/lib/store/departments";
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
 *
 * ## Where the record goes
 *
 * Connected, `POST /employees` — which needs `EDIT_RECORDS`, so the form is not
 * offered without it. Demo, the localStorage store, and the screen says so.
 *
 * This used to call the local store in **both** modes behind a 400ms
 * `setTimeout` dressed up as a save, so adding somebody while connected showed
 * a green "added" toast for a person the API had never heard of and whose record
 * page 404s in the next browser. That is the exact failure the two-mode design
 * exists to avoid: demo mode is legitimate, looking connected while not being
 * connected is not.
 *
 * ## Every picker's options come from the live source
 *
 * Departments and locations were hardcoded string lists, and the API takes ids.
 * A name posted to it is stripped by zod rather than refused, so the department
 * would appear to save and quietly not — so both now read the same dual-source
 * stores the rest of the app uses (`useDepartments`, `useWorkLocations`), whose
 * ids are real when connected and seed-derived when not.
 */

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
  /** An id from the live source, not a name. See the header. */
  departmentId: string;
  workLocationId: string;
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
  departmentId: "",
  workLocationId: "",
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
  /* The local store stays for demo mode only — `nextIdentity` and `create` mint
     and store a `p-NN` record, which is the honest answer with no API and the
     wrong one with one. */
  const local = useEmployeeStore();
  const mutations = useEmployeeMutations();
  const connected = mutations.connected;
  const canCreate = useCan("EDIT_RECORDS");
  /* Both modes, so the manager picker offers real colleagues either way. */
  const directory = useEmployeeDirectory({ pageSize: 200 });
  const departments = useDepartments();
  const locations = useWorkLocations();
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

  /* The names behind the two ids, for the local store and for nothing else.
     Looked up rather than kept in state so they cannot fall out of step with
     the id that was actually chosen. */
  const departmentName =
    departments.flat.find((d) => d.id === draft.departmentId)?.name ?? null;
  const locationName =
    locations.locations.find((l) => l.id === draft.workLocationId)?.name ?? null;

  /**
   * Which statuses and employment types may be *set*.
   *
   * Connected the answer is the database's enum: "Probation" is not in it, and
   * offering it would hand somebody a 422 for picking what the form showed them.
   * Offline the local set is the honest one, because localStorage holds whatever
   * it is given. Same rule, and same lists, as the record page.
   */
  const statuses = connected
    ? [
        { value: "onboarding", label: "Onboarding" },
        { value: "active", label: "Active" },
      ]
    : [
        { value: "onboarding", label: "Onboarding" },
        { value: "probation", label: "Probation" },
        { value: "active", label: "Active" },
      ];

  const types = connected
    ? [
        { value: "full_time", label: "Full time" },
        { value: "part_time", label: "Part time" },
        { value: "contract", label: "Contract" },
        { value: "intern", label: "Internship" },
        { value: "nysc", label: "NYSC" },
      ]
    : [
        { value: "full_time", label: "Full time" },
        { value: "contract", label: "Contract" },
        { value: "internship", label: "Internship" },
      ];

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

  async function submit(openAfter: boolean) {
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

    const name = `${draft.firstName.trim()} ${draft.lastName.trim()}`;
    const outstanding =
      wouldBlock.length > 0
        ? `${wouldBlock.length} field${wouldBlock.length > 1 ? "s" : ""} still needed before payroll.`
        : "Record is complete and payroll-ready.";

    setBusy(true);
    try {
      const id = connected
        ? await createOnApi()
        : createLocally();

      toast.push({
        title: `${name} added`,
        tone: "success",
        detail: outstanding,
      });
      router.push(openAfter ? `/people/${id}` : "/people");
    } catch (error) {
      /* The API answers with the field and the sentence — a NUBAN that is not
         ten digits, an RSA PIN in the wrong shape. Put both on the input rather
         than in a toast the person has to translate back to a field. */
      const fieldErrors =
        error instanceof ApiError
          ? error.fieldErrors.map((d) => ({
              field: d.field as keyof Employee,
              message: d.message,
            }))
          : [];

      if (fieldErrors.length > 0) {
        setErrors(fieldErrors);
        document.getElementById(String(fieldErrors[0].field))?.focus();
      } else {
        toast.push({
          title: `${name} was not added`,
          tone: "danger",
          detail:
            error instanceof ApiError
              ? error.message
              : "Something went wrong. Try again.",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  /** Returns the new record's id, which is a uuid the server chose. */
  async function createOnApi(): Promise<string> {
    const created = await mutations.create({
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      jobTitle: draft.jobTitle.trim(),
      startDate: draft.startDate,
      grossMonthly: gross,
      taxState: draft.taxState,
      status: draft.status,
      employmentType: draft.employmentType,
      ...(draft.email.trim() ? { email: draft.email.trim() } : {}),
      ...(draft.phone.trim() ? { phone: draft.phone.trim() } : {}),
      ...(draft.dateOfBirth ? { dateOfBirth: draft.dateOfBirth } : {}),
      ...(draft.departmentId ? { departmentId: draft.departmentId } : {}),
      ...(draft.workLocationId
        ? { workLocationId: draft.workLocationId }
        : {}),
      ...(draft.managerId ? { managerId: draft.managerId } : {}),
      ...(draft.bankName ? { bankName: draft.bankName } : {}),
      ...(draft.bankAccount.trim()
        ? { bankAccount: draft.bankAccount.trim() }
        : {}),
      ...(draft.pensionPin.trim()
        ? { pensionPin: draft.pensionPin.trim() }
        : {}),
      ...(draft.pensionProvider
        ? { pensionProvider: draft.pensionProvider }
        : {}),
      ...(draft.tin.trim() ? { tin: draft.tin.trim() } : {}),
      ...(draft.nhfNumber.trim() ? { nhfNumber: draft.nhfNumber.trim() } : {}),
    });
    return created.id;
  }

  /** Demo mode. A `p-NN` id in this browser, and the screen says so. */
  function createLocally(): string {
    const { id, employeeNo } = nextIdentity(local.all);
    const employee: Employee = {
      id,
      employeeNo,
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      email: draft.email.trim() || null,
      phone: draft.phone.trim() || null,
      dateOfBirth: draft.dateOfBirth || null,
      jobTitle: draft.jobTitle.trim(),
      /* The local store holds display names, so the id picked above is turned
         back into the name it belongs to. */
      department: departmentName ?? "Unassigned",
      managerId: draft.managerId || null,
      location: locationName ?? "Not set",
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
    local.create(employee);
    return employee.id;
  }

  /* `POST /employees` needs `EDIT_RECORDS`. A form that accepts forty fields
     and then answers 403 on Save has wasted somebody's afternoon, so it is not
     offered — and the sentence says who to ask rather than only refusing. */
  if (connected && !canCreate) {
    return (
      <Card>
        <CardBody className="flex flex-col gap-3">
          <p className="text-[0.875rem] font-medium text-ink">
            You cannot add an employee
          </p>
          <p className="text-[0.875rem] text-body">
            Creating a record changes what payroll will pay, so it needs the
            permission to edit records. Ask whoever manages access.
          </p>
          <div>
            <Button variant="secondary" size="sm" onClick={() => router.push("/people")}>
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back to directory
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="flex flex-col gap-5">
        {/* Which source this record will be written to, stated rather than
            implied — the same badge the directory and the record page carry. */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={connected ? "success" : "warning"} size="sm" dot>
            {connected
              ? "Saves to the API"
              : "Saves in this browser only — demo data"}
          </Badge>
          {!connected && (
            <span className="text-[0.75rem] text-muted">
              No API is answering, so this record will not reach a payroll run
              or another device.
            </span>
          )}
        </div>

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
            <Field
              label="Work location"
              {...(locations.error
                ? { help: `${locations.error.message} Locations are unavailable.` }
                : {})}
            >
              <Select
                value={draft.workLocationId}
                onChange={(e) => set("workLocationId", e.target.value)}
              >
                <option value="">Not set</option>
                {locations.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
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
            <Field
              label="Department"
              {...(departments.error
                ? {
                    help: `${departments.error.message} Departments are unavailable.`,
                  }
                : {})}
            >
              <Select
                value={draft.departmentId}
                onChange={(e) => set("departmentId", e.target.value)}
              >
                <option value="">Not assigned</option>
                {departments.flat.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
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
                {directory.employees.map((e) => (
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
                {types.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
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
                {statuses.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
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
            <Button
              variant="secondary"
              onClick={() => void submit(false)}
              disabled={busy}
            >
              Save and add another
            </Button>
            <Button variant="approve" onClick={() => void submit(true)} loading={busy}>
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
