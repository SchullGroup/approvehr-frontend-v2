"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  Eye,
  EyeOff,
  FileText,
  IdCard,
  Landmark,
  Mail,
  MapPin,
  Phone,
  PiggyBank,
  ShieldAlert,
  TrendingUp,
  UserMinus,
  UserRound,
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
import { StartExitDialog } from "@/app/(app)/people/offboarding";
import { PayComponentsPanel } from "@/app/(app)/payroll/pay-setup/pay-components-panel";
import { RecordHistory } from "@/app/(app)/settings/audit/record-history";
import { StartPeriodButton } from "@/app/(app)/performance";
import { naira } from "@/lib/api/pay-components";
import { koboFromDecimal, wasDeducted } from "@/lib/api/payroll";
import { payslipFiguresFor } from "@/lib/mock/demo-payslips";
import { banksIncluding } from "@/lib/reference/banks";
import {
  canonicalTaxState,
  pensionProviderOptions,
  taxStateOptions,
} from "@/lib/reference/lists";
import type { LeaveBalanceRow, LeaveRow } from "@/lib/api/leave";
import { useCan } from "@/lib/permissions";
import { InviteToSignInButton } from "./invite-to-sign-in";
import { LinkExistingAccountButton } from "./link-existing-account";
import { useDepartments } from "@/lib/store/departments";
import { useWorkLocations } from "@/lib/store/work-locations";
import { useGrades } from "@/lib/store/grades";
import { BandPosition } from "@/app/(app)/payroll/pay-setup/band-position";
import type { EmployeePatch } from "@/lib/store/employees-api";
import { usePayPreview } from "@/lib/store/pay-components";
import { useSession } from "@/lib/store/session";
import { fullName, payrollGapsFor, type Employee } from "@/lib/types";
import { shortDate } from "@/lib/today";
import { EditableSection } from "@/components/people/editable-section";
import { NIGERIAN_STATES } from "@/lib/reference/lists";
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
/*
 * Onboarding is parked and therefore not offered here either.
 *
 * The tab is out of the nav and the create form no longer asks, so the only
 * remaining way into that state would be this dropdown — putting somebody
 * somewhere with no screen to see them on. `EmploymentStatus` still carries the
 * value and the API still accepts it, so an existing ONBOARDING record renders
 * its badge correctly (`STATUS_TONE` above is keyed by string for exactly this)
 * and can be moved to Active from here. It just cannot be moved *into* any more.
 *
 * The rest stay, and deliberately: `on_leave` is what the leave module produces,
 * `exited` is what an offboarding writes, and `suspended` is a disciplinary
 * outcome. Those are set by their own flows and read here; removing them would
 * hide states the product still creates.
 */
const API_STATUSES = [
  { value: "active", label: "Active" },
  // { value: "onboarding", label: "Onboarding" },
  { value: "on_leave", label: "On leave" },
  { value: "suspended", label: "Suspended" },
  { value: "exited", label: "Left the company" },
];

const LOCAL_STATUSES = [
  { value: "active", label: "Active" },
  // { value: "onboarding", label: "Onboarding" },
  // { value: "probation", label: "Probation" },
  { value: "on_leave", label: "On leave" },
  { value: "offboarding", label: "Offboarding" },
  // { value: "inactive", label: "Inactive" },
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

/** Exported for `profile/profile-screen.tsx`'s read-only Employment card — the
 * same enum, the same mis-cased value arriving from the same `Employee` type,
 * so it needs the same lookup rather than a second copy of it. */
export const TYPE_LABELS: Record<string, string> = Object.fromEntries(
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
export const enumKey = (value: string) => value.toLowerCase();

/*
 * All three used to be declared here, and all three were wrong in the same way
 * the wizard's copies were before `lib/reference/` existed.
 *
 * `BANKS` offered seven institutions with no codes, so anybody banking anywhere
 * else could not be recorded and the Bank Code column of every payment file
 * shipped empty. `PFAS` offered four of the eighteen licensed administrators.
 * `TAX_STATES` offered five of the thirty-seven and called the capital "Abuja",
 * where `/settings/company` called the same place "FCT" — PAYE is remitted to a
 * state revenue service, so a company filed under one and staff taxed under the
 * other never joined up.
 *
 * One source each now, shared with `/people/new`. The bank list is 255
 * institutions with their real NIBSS/CBN codes; read the header of
 * `lib/reference/banks.ts` for why those codes are fetched rather than typed.
 *
 * All three are read through an accessor that takes the record's **current**
 * value, because a shared list is longer than the old one and still not a
 * superset of it. The seed's "Stanbic IBTC Pensions" is not in
 * `PENSION_PROVIDERS`, which calls the same company "Stanbic IBTC Pension
 * Managers" — so before this the select showed "Not known yet" over a PFA that
 * was on file. Same rule for the bank, and `canonicalTaxState` for the state.
 */

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
  connected,
  manager,
  managerName,
  reports,
  companyDirectory,
  balances,
  leaveRequests,
  leaveLoading = false,
  onSave,
}: {
  employee: Employee;
  connected: boolean;
  manager: Employee | null;
  /** The manager's name even when their record is outside the page's slice. */
  managerName: string | null;
  reports: Employee[];
  /**
   * Who the "reports to" picker offers.
   *
   * The same slice `record-page.tsx` already reads to resolve `manager` and
   * `reports` — the first 200 employees, connected. No fetch of its own: a
   * second read of the same list would be one more thing for this page and
   * that one to disagree about.
   */
  companyDirectory: Employee[];
  /** Every leave type, with the API's own remaining figure when connected. */
  balances: LeaveBalanceRow[];
  /** This employee's own requests. Live in both modes. */
  leaveRequests: LeaveRow[];
  /** The leave reads are their own requests and can still be in flight. */
  leaveLoading?: boolean;
  onSave: (patch: EmployeePatch) => Promise<unknown>;
}) {
  /**
   * The tab, and a field to open editing on, both from the URL.
   *
   * So a payroll exception's "Add account number" can land on Pay & statutory
   * with the account field already focused, instead of on Personal with nothing
   * in edit mode. Read as initial state rather than in an effect: the right tab
   * has to be the first paint, not a correction after it.
   *
   * The tab is validated against the ids below — an unknown `?tab=` falls back
   * to Personal rather than rendering a blank body.
   */
  const params = useSearchParams();
  const wanted = params.get("tab");
  const [tab, setTab] = useState(
    wanted && TAB_IDS.includes(wanted) ? wanted : "personal",
  );
  /* Only honoured on the tab that owns the field, so a stale link cannot open an
     editor on a section the field does not belong to. */
  const urlFocusField = params.get("field") ?? undefined;
  /**
   * A same-page jump — clicking "Pension PIN" in the sidebar's own checklist
   * switches `tab` via plain state, which never touches the URL `tab` was
   * seeded from. Reading the URL alone would leave a click on that list doing
   * nothing after the first paint, so a manual jump overrides it.
   */
  const [manualFocusField, setManualFocusField] = useState<string | undefined>(
    undefined,
  );
  const focusField = manualFocusField ?? urlFocusField;
  const jumpTo = (nextTab: string, field: string) => {
    setTab(nextTab);
    setManualFocusField(field);
  };
  const [fileOpen, setFileOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const departments = useDepartments();
  const locations = useWorkLocations();
  const grades = useGrades({ pageSize: 100 });
  const { employeeId: me } = useSession();
  const canSeeSalaries = useCan("VIEW_SALARIES");
  /* The same permission `POST /offboarding` demands to record somebody else's
     exit — `isHr` in `approvehr-api/src/modules/offboarding/service.ts`. Without
     it there is no button rather than a disabled one, the choice `Guarded` and
     `RecordHistory` already make on this page: a control that cannot work is
     worse present than absent. */
  const canEditRecords = useCan("EDIT_RECORDS");
  const canRecordExit = canEditRecords;
  /* Issuing a login is its own permission, deliberately split from editing a
     record — see the header of `modules/invites/router.ts`. */
  const canInvite = useCan("INVITE_STAFF");
  /* Repointing an *existing* sign-in is tighter still — see the header of
     `linkToEmployee` on the API. Never fold this into `canInvite`: showing
     the button to someone who can only send fresh invitations would offer a
     control the API is going to 403. */
  const canLinkAccount = useCan("MANAGE_ROLES");

  const name = fullName(employee);
  const status = statusOf(employee.status);
  /*
   * Somebody already gone has no exit to start, and the API agrees: `create`
   * refuses an archived record with "has already left — their record is
   * archived". `exited` is the union's own word for the same state and the one
   * the status chip above renders, so the button goes rather than offering an
   * act that comes back refused.
   *
   * `offboarding` is deliberately *not* excluded. That status is exactly the
   * case this action exists for — a badge saying somebody is on their way out
   * with no way to record it was the gap. If an exit is already open the API
   * refuses by name and the dialog shows the refusal, which also tells the
   * reader the checklist they are looking for already exists.
   */
  const hasLeft = enumKey(employee.status) === "exited";

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

  /**
   * Whether the person reading this record is the person it is about.
   *
   * Almost every sentence on this page was written for somebody in HR looking
   * at a colleague, which is the common case and the wrong one to write for
   * *exclusively*: an employee opens their own record and is told, in the third
   * person, that their missing TIN blocks a payroll run they have never heard
   * of and cannot do anything about. Not an error, but it reads as one — and
   * "this app shouldn't feel buggy" is the whole complaint.
   *
   * So this switches wording rather than hiding facts. Somebody is entitled to
   * see that their bank account is missing; what they are not served by is
   * being handed a payroll operator's framing of it. Where an action genuinely
   * belongs to somebody else, the rule is the one `my-documents.tsx` already
   * follows: **name who can**, rather than offering a control that gets refused.
   */
  const isSelf = me !== null && me === employee.id;

  /* The department picker sends an id, and the id it should show as selected is
     the one whose name matches the record — `Employee` carries the name only.
     Works in both modes: offline `flat` is derived from the seed. */
  const currentDepartment = departments.flat.find(
    (d) => d.name === employee.department,
  );

  /* Same reasoning as `currentDepartment`, one field down: `Employee` carries
     the work location's name (`location`), not its id, so the picker below has
     to resolve the id itself before it can preselect anything. */
  const currentLocation = locations.locations.find(
    (l) => l.name === employee.location,
  );

  /* The grade select needs the row it is showing, for its mid-point — the
     same lookup `BandPosition` does internally for the meter, done here too
     because the "set pay to the mid-point" action needs the figure before
     any fetch that component makes. */
  const currentGrade = grades.rows.find((g) => g.id === employee.salaryGradeId);

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

  /* What the run actually does versus what is merely unfilled — see
     `payrollGapsFor`. Only a missing bank account can appear in `payrollBlocking`
     today; kept as a filter rather than a single check so a future BLOCKER
     needs no new branch here. */
  const payrollGaps = payrollGapsFor(employee);
  const payrollBlocking = payrollGaps.filter((g) => g.blocking);
  const payrollAdvisory = payrollGaps.filter((g) => !g.blocking);
  const firstBlocking = payrollBlocking[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
      {/* Identity rail */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
        <Card>
          <CardBody className="flex flex-col items-center gap-3 text-center">
            <Avatar name={name} size="lg" tone="accent" />
            <div>
              <p className="text-h4 text-ink">{name}</p>
              <p className="mt-0.5 text-body-sm text-muted">
                {employee.jobTitle}
              </p>
            </div>
            <Badge tone={status.tone} dot>
              {status.label}
            </Badge>
          </CardBody>

          <CardBody className="border-t border-line">
            <ul className="flex flex-col gap-2.5">
              <Contact
                icon={<Mail aria-hidden="true" />}
                value={employee.email}
                missing="No email address"
              />
              <Contact
                icon={<Phone aria-hidden="true" />}
                value={employee.phone}
                missing="No phone number"
              />
              <Contact
                icon={<MapPin aria-hidden="true" />}
                value={employee.location}
              />
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
              tone={
                completeness === 100
                  ? "success"
                  : completeness >= 70
                    ? "accent"
                    : "warning"
              }
            />
          </CardBody>

          {/* A small checklist, not the page's main focus. These never hold
              back a payslip — `payrollGapsFor` says so in `consequence` — so a
              red callout at the top of the record was claiming the same
              urgency for a missing TIN as a missing bank account, which is
              exactly the bug this split fixes. They still need a place that
              is not nowhere; a sidebar item is that place. */}
          {payrollAdvisory.length > 0 && (
            <CardBody className="border-t border-line">
              <p className="mb-2 text-meta font-medium text-muted">
                {isSelf
                  ? "Missing from your record"
                  : "Worth adding, not pay-blocking"}
              </p>
              <ul className="flex flex-col gap-1.5">
                {payrollAdvisory.map((g) => (
                  <li key={g.field} className="flex items-start gap-2">
                    <AlertTriangle
                      aria-hidden="true"
                      className="mt-0.5 size-3.5 shrink-0 text-warning-text"
                    />
                    {/* A click, not just a reason on hover: this used to be
                        read-only, so fixing it meant landing on the record and
                        hunting for the field by hand. Every one of these lives
                        on Pay & statutory, so the tab is fixed rather than
                        looked up. `title` still carries `consequence` — the
                        reason it does not block still exists, one hover away
                        instead of in a paragraph nobody asked to read. */}
                    <button
                      type="button"
                      onClick={() => jumpTo("pay", g.field)}
                      className="text-meta leading-relaxed text-body underline decoration-dotted underline-offset-2 hover:text-accent-text hover:decoration-solid"
                      title={g.consequence}
                    >
                      {g.label}
                    </button>
                  </li>
                ))}
              </ul>
            </CardBody>
          )}
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
            {/* The HR register's own file, opened on this person specifically —
                gated the same as "Record their exit" below: the backend only
                lets `EDIT_RECORDS` verify or remove a document (self-checking
                would defeat the point of review), so an employee viewing their
                own record here would otherwise see live-looking buttons that
                can never succeed. Seeing their own file is `/documents`.

                The label still switches on `isSelf`, because somebody who does
                hold the permission can open this on their own record, and
                "Their documents" about yourself reads as a bug. */}
            {canEditRecords && (
              <Button
                variant="secondary"
                size="sm"
                block
                onClick={() => setFileOpen(true)}
              >
                {isSelf ? "My documents" : "Their documents"}
              </Button>
            )}
            {/* Their appraisals, from their record. The trend across periods was
                only reachable from a period's own register before this, which
                meant the one screen that answers "has this person improved" was
                unreachable from the screen where somebody asks it. */}
            <ButtonLink
              href={`/performance/history/${employee.id}`}
              variant="secondary"
              size="sm"
              block
            >
              <TrendingUp aria-hidden="true" className="size-3.5" />
              {isSelf ? "My appraisal history" : "Their appraisal history"}
            </ButtonLink>
            {/* The third door on one dialog. Starting a period covers the whole
                company rather than this person — the dialog says so — and it is
                here because looking at somebody's record is one of the moments
                the thought arrives. Secondary, like its neighbours. */}
            <StartPeriodButton block />
            {/* The fourth and last way a company brings somebody's email in:
                the directory and attendance screens invite in a batch, the
                importer does one per row that carries a role, the new-role
                dialog invites by address alone — and this is "this person,
                now", which is the shape the question takes on a record. Hidden
                once they already have one, since the API refuses a second. */}
            {canInvite && employee.canLogin && !hasLeft && (
              <InviteToSignInButton
                employeeId={employee.id}
                name={name}
                email={employee.email ?? null}
              />
            )}
            {/* The other way to close the same gap: somebody who already
                signs in — most often whoever registered the company — with
                no personnel file pointing back at them. */}
            {canLinkAccount && employee.canLogin && !hasLeft && (
              <LinkExistingAccountButton
                employeeId={employee.id}
                employeeName={name}
              />
            )}
            {/* Secondary, like its neighbours. Recording an exit is
                consequential rather than the thing you came here to do, and a
                blue primary button on every employee record would read as the
                page's suggestion. */}
            {canRecordExit && !hasLeft && (
              <Button
                variant="secondary"
                size="sm"
                block
                onClick={() => setExitOpen(true)}
              >
                <UserMinus aria-hidden="true" className="size-3.5" />
                Record their exit
              </Button>
            )}
          </CardBody>
        </Card>
      </aside>

      {/* Detail */}
      <div className="flex min-w-0 flex-col gap-5">
        {/* Split by what the engine actually does, not just "is it filled in":
            a missing bank account blocks approval, a missing pension PIN (when
            the company operates one) only leaves the remittance schedule
            incomplete, and a missing TIN does nothing to the run at all. Three
            fields in one red callout claiming the same fate for all of them was
            the bug — see `payrollGapsFor`. */}
        {firstBlocking && (
          <Callout
            tone="danger"
            icon={<ShieldAlert aria-hidden="true" />}
            title={`${payrollBlocking.length} field${payrollBlocking.length > 1 ? "s" : ""} missing before payroll can run`}
          >
            {payrollBlocking.map((g) => g.label).join(", ")}.{" "}
            {firstBlocking.consequence}
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => jumpTo("pay", firstBlocking.field)}
            >
              Fix it now
            </Button>
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
              /* Name, email and phone stay above the groups — they are what
                 somebody opening a record is nearly always after, and putting
                 them behind a click to be consistent would be consistency at
                 the reader's expense. The other nine are reference: correct on
                 most records, and looked at when something specific is wanted. */
              groups={[
                {
                  id: "identity",
                  title: "Identity and address",
                  icon: <UserRound aria-hidden="true" className="size-4" />,
                },
                {
                  id: "origin",
                  title: "Origin",
                  icon: <MapPin aria-hidden="true" className="size-4" />,
                  hint: "Asked for by some statutory returns.",
                },
              ]}
              employee={employee}
              onSave={onSave}
              fields={[
                { key: "firstName", label: "First name", required: true },
                { key: "lastName", label: "Last name", required: true },
                {
                  key: "middleName",
                  label: "Middle name",
                  optional: true,
                  emptyLabel: "Not recorded",
                },
                {
                  key: "email",
                  label: "Work email",
                  type: "email",
                  emptyLabel: "No email address",
                  help: "Payslips and approvals are sent here.",
                },
                { key: "phone", label: "Phone", type: "tel" },
                {
                  key: "dateOfBirth",
                  label: "Date of birth",
                  type: "date",
                  group: "identity",
                },
                {
                  key: "gender",
                  group: "identity",
                  label: "Gender",
                  optional: true,
                  type: "select",
                  options: [
                    { value: "", label: "Prefer not to say" },
                    { value: "female", label: "Female" },
                    { value: "male", label: "Male" },
                    { value: "other", label: "Other" },
                  ],
                },
                {
                  key: "addressLine",
                  group: "identity",
                  label: "Home address",
                  optional: true,
                  emptyLabel: "No address recorded",
                  help: "Where they live. Not the office they work at.",
                },
                {
                  key: "nin",
                  group: "identity",
                  label: "NIN",
                  optional: true,
                  digits: 11,
                  emptyLabel: "No NIN recorded",
                  help: "National Identification Number, 11 digits.",
                },
                {
                  key: "stateOfOrigin",
                  group: "origin",
                  label: "State of origin",
                  optional: true,
                  type: "select",
                  emptyLabel: "Not recorded",
                  /* Not the tax state. Origin is where somebody is from; the
                     tax state on Pay & statutory is which revenue service
                     their PAYE goes to, and they are frequently different. */
                  help: "Where they are from — not where their PAYE is filed.",
                  options: [
                    { value: "", label: "Not recorded" },
                    ...NIGERIAN_STATES.map((state) => ({
                      value: state,
                      label: state,
                    })),
                  ],
                },
                {
                  key: "lgaOfOrigin",
                  group: "origin",
                  label: "Local government area",
                  optional: true,
                  emptyLabel: "Not recorded",
                  help: "Free text — there are 774, and we will not refuse a real one.",
                },
                {
                  key: "religion",
                  group: "origin",
                  label: "Religion",
                  optional: true,
                  emptyLabel: "Not recorded",
                  help: "Recorded because holidays and dietary arrangements depend on it.",
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
                      {
                        term: "Relationship",
                        value: employee.nextOfKin.relationship,
                      },
                      { term: "Phone", value: employee.nextOfKin.phone },
                    ]}
                  />
                ) : (
                  <p className="text-body-sm text-muted">
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
              /* Arrive editing when a payroll exception sent us here naming
                 the field — `missing_pay` names `grossMonthly`, which lives
                 here rather than on `pay`. Gated on the tab so a stale
                 `?field=` cannot open this editor from another tab. */
              {...(tab === "employment" && focusField
                ? { openOnField: focusField }
                : {})}
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
                /*
                 * A range, not a figure. Picking a grade never sets or moves
                 * `grossMonthly` below — the two are independent, so two
                 * people on the same grade can be paid differently, which is
                 * the whole point of a band rather than a fixed number.
                 *
                 * Connected only, for the same reason `workLocationId` below
                 * is: `useGrades()` is read-only offline, and demo mode
                 * already *derives* a grade from `grossMonthly` (nearest
                 * mid-point — see `lib/store/grades.ts`) rather than storing
                 * one. Offering a picker that saves onto a field the demo
                 * band meter would then ignore is worse than not offering it.
                 */
                ...(connected
                  ? [
                      {
                        key: "salaryGradeId" as const,
                        label: "Salary grade",
                        type: "select" as const,
                        placeholder: "Not on a grade",
                        value: employee.salaryGradeId ?? "",
                        format: () =>
                          currentGrade
                            ? `${currentGrade.code} ${currentGrade.name}`
                            : "Not on a grade",
                        options: [
                          { value: "", label: "Not on a grade" },
                          ...grades.rows.map((g) => ({
                            value: g.id,
                            label: `${g.code} ${g.name}`,
                          })),
                        ],
                      },
                    ]
                  : []),
                {
                  key: "grossMonthly",
                  label: "Gross monthly",
                  optional: true,
                  type: "number",
                  help: "Changing this changes their next payslip. Clear it if pay is no longer agreed — payroll will name them until it is set again.",
                  /* Two decimals, never abbreviated: this is a figure somebody
                     reconciles against a bank statement. Absent, never zero:
                     `Money` renders "Not set yet" rather than ₦0.00. */
                  format: (v) => (
                    <Money amount={v === null ? null : Number(v)} decimals />
                  ),
                },
                /*
                 * Settable at creation (`/people/new`'s Picker) and, until now,
                 * only ever read back here as plain text in the identity rail.
                 * Same picker, same reason it beats a `<select>`: a company
                 * with a dozen branches is a list worth filtering rather than
                 * scrolling.
                 *
                 * Connected only. `useEmployeeMutations().update` still drops
                 * `workLocationId` in demo mode — `Employee.location` there is
                 * a display name with no id behind it, the same gap
                 * `departmentId` had before `demoDepartmentName` closed it,
                 * and closing this one is a separate fix. Offering the picker
                 * offline would save silently onto nothing, so it stays
                 * read-only text in the identity rail there instead.
                 */
                ...(connected
                  ? [
                      {
                        key: "workLocationId" as const,
                        label: "Work location",
                        type: "picker" as const,
                        placeholder: "Not set",
                        value: currentLocation?.id ?? "",
                        format: () => employee.location,
                        options: [
                          { value: "", label: "Not set" },
                          ...locations.locations.map((l) => ({
                            value: l.id,
                            label: l.name,
                            ...(l.addressLine ? { hint: l.addressLine } : {}),
                          })),
                        ],
                      },
                    ]
                  : []),
              ]}
            />

            {employee.salaryGradeId && (
              <Card>
                <CardHeader
                  level={4}
                  title="Where this sits in the band"
                  description="The grade is a range, not a figure — this person's own pay stays whatever is set above, anywhere in it or outside it."
                />
                <CardBody>
                  <BandPosition
                    key={employee.salaryGradeId}
                    employeeId={employee.id}
                    action={
                      employee.grossMonthly === null && currentGrade ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            void onSave({
                              grossMonthly: naira(currentGrade.midGrossKobo),
                            })
                          }
                        >
                          Set pay to the mid-point,{" "}
                          <Money
                            amount={naira(currentGrade.midGrossKobo)}
                            decimals
                          />
                        </Button>
                      ) : undefined
                    }
                  />
                </CardBody>
              </Card>
            )}

            <EditableSection
              title="Reporting line"
              employee={employee}
              onSave={onSave}
              fields={[
                {
                  key: "managerId",
                  label: "Reports to",
                  type: "picker",
                  placeholder: "No manager — reports to the board",
                  value: employee.managerId ?? "",
                  emptyLabel: "No manager — reports to the board.",
                  /* The one person at the top of a company has no manager,
                     which is the ordinary state of a head of the org chart,
                     not a gap the way an unset bank account is. */
                  emptyIsNormal: true,
                  format: () =>
                    manager ? (
                      <PersonLink employee={manager} />
                    ) : (
                      (managerName ?? "—")
                    ),
                  options: [
                    { value: "", label: "No manager — reports to the board" },
                    /* Belt and braces: the picker's options come from the first
                       200 employees, connected. A company past that size could
                       have a manager sitting outside the slice, and without
                       this the picker would render as though nobody were
                       chosen for a field that plainly has somebody. */
                    ...(employee.managerId &&
                    !companyDirectory.some((e) => e.id === employee.managerId)
                      ? [
                          {
                            value: employee.managerId,
                            label: manager
                              ? fullName(manager)
                              : (managerName ?? "Current manager"),
                          },
                        ]
                      : []),
                    ...companyDirectory
                      .filter((e) => e.id !== employee.id)
                      .map((e) => ({
                        value: e.id,
                        label: fullName(e),
                        hint: e.jobTitle,
                      })),
                  ],
                },
              ]}
            />

            <Card>
              <CardHeader title="Direct reports" />
              <CardBody>
                <p className="mb-2 flex items-center gap-1.5 text-meta font-semibold tracking-wide text-muted">
                  <Users aria-hidden="true" className="size-3.5" />
                  {reports.length === 0 ? "None" : `${reports.length} in total`}
                </p>
                {reports.length === 0 ? (
                  <p className="text-body-sm text-muted">
                    Nobody reports to them yet.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {reports.map((r) => (
                      <PersonLink key={r.id} employee={r} />
                    ))}
                  </div>
                )}
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

            <EditableSection
              /* Arrive editing when a payroll exception sent us here naming the
                 field. Gated on the tab so a stale `?field=` cannot open this
                 editor from another tab. */
              {...(tab === "pay" && focusField
                ? { openOnField: focusField }
                : {})}
              title="Payment and statutory"
              description={
                isSelf
                  ? "Where your salary is paid, and the numbers the company files against."
                  : "Missing values block the run."
              }
              /* Eight fields, most of which are fine on any given record — the
                 reader is looking for the one that is not. Each closed line
                 names what is missing, so a record is six lines to scan rather
                 than eight fields to read. Bank first: it is the only one of
                 the three that stops a payslip outright. */
              groups={[
                {
                  id: "bank",
                  title: "Where the salary is paid",
                  icon: <Landmark aria-hidden="true" className="size-4" />,
                },
                {
                  id: "pension",
                  title: "Pension",
                  icon: <PiggyBank aria-hidden="true" className="size-4" />,
                },
                {
                  id: "tax",
                  title: "Tax and statutory numbers",
                  icon: <IdCard aria-hidden="true" className="size-4" />,
                },
              ]}
              employee={employee}
              onSave={onSave}
              fields={[
                /*
                 * A Picker rather than a `<select>`, for the same reason the
                 * wizard uses one: 255 options is a wheel to scroll, and the
                 * Picker turns on its filter past eight. The code is the hint
                 * because that is what a bank's own portal asks for, and
                 * somebody checking this against a statement needs both.
                 */
                {
                  key: "bankName",
                  group: "bank",
                  label: "Bank",
                  type: "picker",
                  placeholder: "Not known yet",
                  options: [
                    { value: "", label: "Not known yet" },
                    ...banksIncluding(employee.bankName).map((b) => ({
                      value: b.label,
                      label: b.label,
                      /* No code means this name is not in the NIBSS register, and
                         that is worth saying rather than leaving blank: it is the
                         column a payment file cannot fill. */
                      /* "No code on file" stays — a bank we do not have a
                         code for is a real gap somebody may need to close. The
                         code itself goes: it is not stored on the employee. */
                      ...(b.code === null ? { hint: "No code on file" } : {}),
                    })),
                  ],
                },
                {
                  key: "bankAccount",
                  group: "bank",
                  label: "Account",
                  emptyLabel: isSelf
                    ? "Not on file — your salary has nowhere to go"
                    : "No bank account — payroll blocked",
                  help: "Ten digits. Payroll cannot pay without this.",
                  digits: 10,
                  format: (v) => (
                    <Guarded value={String(v)} canReveal={canReveal} />
                  ),
                },
                {
                  key: "pensionPin",
                  group: "pension",
                  label: "Pension PIN",
                  emptyLabel: isSelf
                    ? "Not on file — your pension cannot be paid in"
                    : "No pension PIN — payroll blocked",
                  help: "PEN followed by 9 to 12 digits.",
                  format: (v) => (
                    <Guarded value={String(v)} canReveal={canReveal} />
                  ),
                },
                {
                  key: "pensionProvider",
                  group: "pension",
                  label: "Pension provider",
                  type: "select",
                  /* A starting point a company edits, not the PenCom register
                     — see `PENSION_PROVIDERS`'s own doc comment. "Other
                     (specify)" is what actually lets them: a newly licensed
                     PFA, or a merger this list has not caught up with, is no
                     longer stuck without a way onto the record. */
                  allowOther: true,
                  options: [
                    { value: "", label: "Not known yet" },
                    ...pensionProviderOptions(employee.pensionProvider).map(
                      (p) => ({ value: p, label: p }),
                    ),
                  ],
                },
                /*
                 * `canonicalTaxState` on the way in, so a record holding the old
                 * "Abuja" is preselected as "FCT" — the same place, under the
                 * name the FCT-IRS files under. Without it the select matches no
                 * option, shows blank, and the next save writes whichever state
                 * happens to be first in the list.
                 *
                 * No blank option, deliberately: `updateEmployeeSchema` refuses
                 * an empty `taxState`, and offering a choice the API answers 422
                 * to is a control that cannot work. Their state is inherited from
                 * the company at creation and can be changed here, not cleared.
                 */
                {
                  key: "taxState",
                  group: "tax",
                  label: "Tax state",
                  type: "select",
                  help: "Sets which state IRS receives their PAYE.",
                  value: employee.taxState
                    ? canonicalTaxState(employee.taxState)
                    : "",
                  options: taxStateOptions(employee.taxState).map((s) => ({
                    value: s,
                    label: s,
                  })),
                },
                {
                  key: "tin",
                  group: "tax",
                  label: "TIN",
                  emptyLabel: isSelf
                    ? "Not on file — your tax cannot be filed against you"
                    : "No TIN — payroll blocked",
                  help: "Ten digits.",
                  digits: 10,
                  format: (v) => (
                    <Guarded value={String(v)} canReveal={canReveal} />
                  ),
                },
                {
                  key: "nhfNumber",
                  group: "tax",
                  label: "NHF number",
                  format: (v) => (
                    <Guarded value={String(v)} canReveal={canReveal} />
                  ),
                },
                /**
                 * Declared rent, and the only place the record can answer the
                 * payroll run's `rent_relief_unclaimed` warning.
                 *
                 * `type: "money"` so the field reads and writes **kobo** while
                 * showing naira — `annualRentKobo` is the one money field on
                 * `Employee` that is already in kobo, and `EditableSection`
                 * would otherwise write the naira figure straight into it and
                 * under-declare by a factor of a hundred.
                 *
                 * `emptyLabel` is not styled as a blocker, because it is not
                 * one: payroll runs perfectly well without it. It costs the
                 * *employee* money rather than stopping the company paying
                 * them, which is a different sentence.
                 */
                {
                  key: "annualRentKobo",
                  group: "tax",
                  label: "Yearly rent declared",
                  type: "money",
                  emptyLabel: "Nothing declared — no personal relief",
                  help: "Since January 2026 there is no general tax-free allowance. Relief is 20% of the rent they declare, capped at ₦500,000 a year, so declaring nothing means they get no personal relief and pay more tax.",
                },
              ]}
            />

            {/* What they get on top of salary belongs on their record, not on a
                separate setup screen. The panel owns its own loading, errors
                and demo-mode caveats. */}
            <PayComponentsPanel employeeId={employee.id} />
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
                  <p className="text-body-sm text-muted">
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
                level={3}
              />
              {leaveRequests.length === 0 ? (
                <CardBody>
                  <p className="text-body-sm text-muted">
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
                            {...((r.reason ?? r.decisionNote)
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

      {/* The same dialog `/people/offboarding` opens, with the person already
          named — nobody should have to pick out of two hundred the one whose
          record they are standing on. It navigates to the new checklist itself,
          so there is nothing to reload here. */}
      {exitOpen && (
        <StartExitDialog
          employeeId={employee.id}
          employeeName={name}
          onClose={() => setExitOpen(false)}
          onStarted={() => setExitOpen(false)}
        />
      )}
    </div>
  );
}

/** The record's tabs. One list, so URL validation and the tab strip agree. */
const TAB_IDS = ["personal", "employment", "pay", "leave", "conduct"];

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
 * ## Offline it shows the demo's illustrative figures, or nothing
 *
 * It used to fall back to a copy of the payroll engine that lived in the
 * browser, which had been left on the 2011 PAYE bands after the Nigeria Tax Act
 * 2025 went into the API. That copy is deleted.
 *
 * With no API there is no authoritative arithmetic, so demo mode reads the same
 * fixed figures the demo payroll run reads — generated by the API's own engine
 * for the demo directory's salaries, labelled illustrative here and there. A
 * salary edited in demo mode has no row, and then the card shows no figures
 * rather than a guess: this card and the demo payslip for the same person must
 * never disagree, and the only way to guarantee that is one source.
 */
function Compensation({
  employee,
  connected,
}: {
  employee: Employee;
  connected: boolean;
}) {
  const preview = usePayPreview(employee.id);
  const { employeeId: me } = useSession();
  /* Reading your own pay and being able to change what the company deducts are
     different acts, and this card used to offer the second to anybody who could
     do the first. `MANAGE_PAY_STRUCTURE` is what `PATCH /payroll/settings`
     demands — see `settings/payroll/form.tsx` — so without it the link goes
     rather than landing somebody on a form that is read-only for them. */
  const canManagePay = useCan("MANAGE_PAY_STRUCTURE");
  const isSelf = me !== null && me === employee.id;

  const live = preview.data?.payslip ?? null;
  /**
   * A deduction this employer does not operate is ABSENT, not ₦0.00 — see
   * `wasDeducted`'s own comment. Read off `live` specifically, not the merged
   * `figures` below: the illustrative demo fixture has no not-operated
   * concept at all (`wasDeducted(undefined, …)` already reads that as
   * "shown", which is the right default for it).
   */
  const payeShown = wasDeducted(live?.operates, "paye");
  const pensionShown = wasDeducted(live?.operates, "pension");
  const nhfShown = wasDeducted(live?.operates, "nhf");
  /* Only offline, and only for a salary the fixture actually covers. */
  const illustrative =
    connected || employee.grossMonthly === null
      ? null
      : payslipFiguresFor(koboFromDecimal(employee.grossMonthly));

  const source = live ?? illustrative;
  const figures = source
    ? {
        gross: naira(source.grossKobo),
        basic: naira(source.basicKobo),
        housing: naira(source.housingKobo),
        transport: naira(source.transportKobo),
        pensionEmployee: naira(source.pensionEmployeeKobo),
        nhf: naira(source.nhfKobo),
        paye: naira(source.payeKobo),
        net: naira(source.netKobo),
        pensionEmployer: naira(source.pensionEmployerKobo),
      }
    : null;

  return (
    <Card>
      <CardHeader
        title="Compensation"
        description="Split according to your company salary structure."
        action={
          canManagePay ? (
            <ButtonLink href="/settings/payroll" variant="ghost" size="sm">
              Structure settings
            </ButtonLink>
          ) : undefined
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
        ) : figures === null ? (
          <p className="text-body-sm leading-relaxed text-muted">
            {/* The API's own sentence, verbatim — except to the one reader it
                was not written for. It says "{name} has no monthly pay set …
                Set their pay first", which on your own record names you in the
                third person and then asks you to do a thing only payroll can
                do. Same failure as an error with no way out of it: the fix is
                not a button here, because there is no button this reader could
                be given. It is naming who to ask. */}
            {connected && preview.error
              ? isSelf
                ? "Your monthly pay has not been set yet, so this month’s " +
                  "figures cannot be worked out. Payroll sets it — ask them, " +
                  "or raise it on the help desk."
                : preview.error.message
              : "PAYE, pension and NHF are worked out by the payroll engine on " +
                "the API, and this salary is not one the demo holds illustrative " +
                "figures for. Start the API to see what this person is paid."}
          </p>
        ) : (
          <>
            <Line label="Gross monthly" value={figures.gross} strong />
            <div className="h-px bg-line" />
            <Line label="Basic" value={figures.basic} muted />
            <Line label="Housing" value={figures.housing} muted />
            <Line label="Transport" value={figures.transport} muted />
            <div className="h-px bg-line" />
            {pensionShown && (
              <Line label="Pension (employee)" value={-figures.pensionEmployee} />
            )}
            {nhfShown && <Line label="NHF" value={-figures.nhf} />}
            {payeShown && <Line label="PAYE" value={-figures.paye} />}
            {live && (!payeShown || !pensionShown || !nhfShown) && (
              <p className="text-meta leading-relaxed text-muted">
                Not deducted:{" "}
                {[
                  !pensionShown && "pension",
                  !nhfShown && "NHF",
                  !payeShown && "PAYE",
                ]
                  .filter(Boolean)
                  .join(", ")}
                . This employer does not operate{" "}
                {[!pensionShown, !nhfShown, !payeShown].filter(Boolean).length === 1
                  ? "it"
                  : "them"}
                .
              </p>
            )}
            <div className="h-px bg-line" />
            <Line label="Net monthly" value={figures.net} strong />
            {pensionShown && (
              <p className="mt-1 rounded-md bg-canvas p-2.5 text-meta leading-relaxed text-muted">
                Employer pension of{" "}
                <Money amount={figures.pensionEmployer} decimals /> is paid on
                top and is not deducted.
                {live
                  ? ""
                  : " Illustrative figures, generated by the payroll engine on the API for the demo salaries. A real run computes them live."}
              </p>
            )}
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
          className="inline-flex items-center gap-1 rounded-xs text-meta font-medium text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
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
          "min-w-0 truncate text-body-sm",
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
        <span className="block truncate text-body-sm font-medium text-ink">
          {fullName(employee)}
        </span>
        <span className="block truncate text-meta text-muted">
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
      {/*
       * `muted` used to mean smaller *and* fainter: 12px in `text-faint` while
       * its siblings were 14px in `text-body`. The rows it styles are Basic,
       * Housing and Transport — the salary split itself, which is the part
       * somebody checks a payslip against and the part a pension is computed
       * from. The most consequential numbers on the card were the hardest to
       * read on it.
       *
       * Now `muted` changes only the colour, one step, and the size never moves.
       * Hierarchy on a figure should come from weight and colour; shrinking a
       * number to say "this one is subordinate" makes it subordinate and
       * illegible, and the second was never intended.
       */}
      <span
        className={
          strong
            ? "text-body-sm font-medium text-ink"
            : muted
              ? "text-body-sm text-muted"
              : "text-body-sm text-body"
        }
      >
        {label}
      </span>
      <span
        className={
          strong
            ? "tabular text-body font-semibold"
            : "tabular text-body-sm text-body"
        }
      >
        <Money amount={value} decimals />
      </span>
    </div>
  );
}
