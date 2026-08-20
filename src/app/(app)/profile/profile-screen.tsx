"use client";

import { useState } from "react";
import {
  CalendarClock,
  Landmark,
  LogOut,
  Phone,
  Receipt,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  DescriptionList,
  EmptyState,
  Field,
  Input,
  Money,
  ProgressMeter,
  Spinner,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { useSession } from "@/lib/store/session";
import { useLeaveBalances } from "@/lib/store/leave-balances";
import { useFeatures } from "@/lib/store/features";
import { MyLoans } from "@/app/(app)/payroll/loans";
import { useEmployeeStore } from "@/lib/store/employees";
import { fullName, missingForPayroll } from "@/lib/types";
import { self } from "@/lib/api/self";

/**
 * The employee's own screen.
 *
 * ## Why this exists
 *
 * Until now there was no route an ordinary member of staff could call theirs.
 * Every screen in the product was built for somebody administering other
 * people, which meant a company could not roll ApproveHR out past its HR team —
 * and the incumbent has had `/profile` since the beginning.
 *
 * ## What belongs here, and what does not
 *
 * The dividing line is **who owns the fact**, not who can type it.
 *
 * - Things the *person* owns — phone number, next of kin, bank account — are
 *   editable here. They are the authority on their own phone number, and making
 *   them email HR to change it is how the directory rots.
 * - Things the *company* owns — job title, salary, start date, department — are
 *   shown and not editable. Not because staff cannot be trusted, but because
 *   changing them is an employment decision with a paper trail somewhere else.
 *   Showing them read-only is still valuable: most people cannot tell you their
 *   own employee number, and every payroll query starts with it.
 *
 * Bank details are editable and are treated as the sensitive case they are —
 * see `BankPanel` below.
 */
export function ProfileScreen() {
  const { isLoading, isSignedIn, employee, employeeId, mode, signOut } =
    useSession();
  /* A staff loan card only belongs here for a company that lends to staff —
     the same flag that decides whether Loans is in the nav at all. */
  const { loans: loansEnabled } = useFeatures();

  if (isLoading) {
    return (
      <PageBody className="flex items-center justify-center py-24">
        <Spinner />
        <span className="sr-only">Loading your profile</span>
      </PageBody>
    );
  }

  /* The gate in front of the app means this is close to unreachable, but a
     signed-out render of a screen about "you" must not invent a you. */
  if (!isSignedIn || !employee || !employeeId) {
    return (
      <>
        <PageHeader title="My profile" />
        <PageBody>
          <EmptyState
            icon={<UserRound aria-hidden="true" />}
            title="No employee record"
            description="This account is not linked to anyone on the payroll."
            action={<ButtonLink href="/dashboard">Go to home</ButtonLink>}
          />
        </PageBody>
      </>
    );
  }

  const name = fullName(employee);
  const missing = missingForPayroll(employee);

  return (
    <>
      <PageHeader title="My profile" description="Your details, pay and time off." />

      <PageBody className="flex flex-col gap-6">
        {/* Identity */}
        <Card>
          <CardBody className="flex flex-wrap items-center gap-4">
            <Avatar name={name} src={employee.avatarUrl} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-[1.0625rem] font-semibold text-ink">{name}</p>
              <p className="text-[0.875rem] text-body">
                {employee.jobTitle} · {employee.department}
              </p>
              <p className="mt-1 text-[0.875rem] text-muted">
                Staff number {employee.employeeNo} · {employee.location}
              </p>
            </div>
            {mode === "offline" && (
              <Badge tone="warning" size="sm">
                Demo · this browser only
              </Badge>
            )}
          </CardBody>
        </Card>

        {/* The one thing on this page that might need doing. Shown only when
            it does, and as a list of fields plus a button — not a paragraph
            explaining what proration is. */}
        {missing.length > 0 && (
          <Card>
            <CardBody className="flex flex-wrap items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[0.9375rem] font-semibold text-ink">
                  {missing.length} {missing.length === 1 ? "detail" : "details"}{" "}
                  missing
                </p>
                <p className="mt-1 text-[0.875rem] text-body">
                  {missing.join(", ")}. Payroll needs these to pay you.
                </p>
              </div>
              <ProgressMeter
                value={Math.round(
                  ((5 - Math.min(5, missing.length)) / 5) * 100,
                )}
                label="Record complete"
                className="w-40"
              />
            </CardBody>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <ContactPanel employeeId={employeeId} />
          <BankPanel employeeId={employeeId} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <PayCard grossMonthly={employee.grossMonthly} />
          <TimeOffCard employeeId={employeeId} />
          <SecurityCard onSignOut={signOut} apiMode={mode === "api"} />
        </div>

        {/* Composed, not reimplemented: `MyLoans` is exported from the loans
            module so there is one component that knows what a loan looks like
            to the person repaying it. */}
        {loansEnabled && <MyLoans />}

        {/* Employment facts. Read-only: the company owns these. */}
        <Card>
          <CardHeader
            title="Employment"
            level={3}
            description="Ask your people team to change any of these."
          />
          <CardBody>
            <DescriptionList
              items={[
                { term: "Job title", value: employee.jobTitle },
                { term: "Department", value: employee.department },
                { term: "Employment type", value: employee.employmentType },
                { term: "Started", value: employee.startDate },
                { term: "Work location", value: employee.location },
                { term: "Tax state", value: employee.taxState },
                { term: "Pension PIN", value: employee.pensionPin ?? "Not on file" },
                { term: "Pension provider", value: employee.pensionProvider ?? "Not on file" },
              ]}
            />
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Phone and next of kin. Editable, because the person is the authority on them.
 */
function ContactPanel({ employeeId }: { employeeId: string }) {
  const { directory, update } = useEmployeeStore();
  const toast = useToast();
  const me = directory.find((e) => e.id === employeeId);

  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(me?.phone ?? "");
  const [kinName, setKinName] = useState(me?.nextOfKin?.name ?? "");
  const [kinRelationship, setKinRelationship] = useState(
    me?.nextOfKin?.relationship ?? "",
  );
  const [kinPhone, setKinPhone] = useState(me?.nextOfKin?.phone ?? "");

  if (!me) return null;

  function save() {
    update(employeeId, {
      phone: phone.trim() || null,
      nextOfKin:
        kinName.trim() || kinPhone.trim()
          ? {
              name: kinName.trim(),
              relationship: kinRelationship.trim(),
              phone: kinPhone.trim(),
            }
          : null,
    });
    setEditing(false);
    toast.push({ title: "Saved", tone: "success" });
  }

  return (
    <Card>
      <CardHeader
        title="How to reach you"
        level={3}
        action={
          editing ? undefined : (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )
        }
      />
      <CardBody className="flex flex-col gap-4">
        {editing ? (
          <>
            <Field label="Phone">
              <Input
                value={phone}
                inputMode="tel"
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
            <Field
              label="Next of kin"
              help="Who we call if something happens at work."
            >
              <Input
                value={kinName}
                placeholder="Full name"
                onChange={(e) => setKinName(e.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Relationship">
                <Input
                  value={kinRelationship}
                  placeholder="Spouse, parent, sibling"
                  onChange={(e) => setKinRelationship(e.target.value)}
                />
              </Field>
              <Field label="Their phone">
                <Input
                  value={kinPhone}
                  inputMode="tel"
                  onChange={(e) => setKinPhone(e.target.value)}
                />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button variant="accent" size="sm" onClick={save}>
                Save
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <DescriptionList
            items={[
              { term: "Work email", value: me.email ?? "Not on file" },
              { term: "Phone", value: me.phone ?? "Not on file" },
              {
                term: "Next of kin",
                value: me.nextOfKin
                  ? `${me.nextOfKin.name}${me.nextOfKin.relationship ? ` (${me.nextOfKin.relationship})` : ""} · ${me.nextOfKin.phone}`
                  : "Not on file",
              },
            ]}
          />
        )}
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Bank details.
 *
 * Separated from the rest of the contact fields on purpose. An employee quietly
 * changing their account shortly before a run is the classic payroll diversion,
 * and `/settings/notifications` treats "bank details changed" as a fraud control
 * that argues against being switched off.
 *
 * So this panel does two things the others do not: it confirms before saving,
 * and it says plainly that the change is notified. Not as a warning to frighten
 * an honest employee — most people changing their account are just changing
 * banks — but because somebody being told is the only thing standing in front of
 * the fraud, and a person who knows that is not surprised later.
 */
function BankPanel({ employeeId }: { employeeId: string }) {
  const { directory, update } = useEmployeeStore();
  const toast = useToast();
  const me = directory.find((e) => e.id === employeeId);

  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [bankName, setBankName] = useState(me?.bankName ?? "");
  const [bankAccount, setBankAccount] = useState(me?.bankAccount ?? "");

  if (!me) return null;

  const changed =
    bankName.trim() !== (me.bankName ?? "") ||
    bankAccount.trim() !== (me.bankAccount ?? "");

  /* Nigerian NUBAN account numbers are ten digits. Checking the shape here
     saves a failed payment file rather than a form error. */
  const accountLooksRight = /^\d{10}$/.test(bankAccount.trim());

  function commit() {
    update(employeeId, {
      bankName: bankName.trim() || null,
      bankAccount: bankAccount.trim() || null,
    });
    setConfirming(false);
    setEditing(false);
    toast.push({
      title: "Bank details updated",
      tone: "success",
      detail: "Your people team has been notified.",
    });
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Where you get paid"
          level={3}
          action={
            editing ? undefined : (
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                Change
              </Button>
            )
          }
        />
        <CardBody className="flex flex-col gap-4">
          {editing ? (
            <>
              <Field label="Bank">
                <Input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />
              </Field>
              <Field
                label="Account number"
                error={
                  bankAccount.trim() && !accountLooksRight
                    ? "Nigerian account numbers are ten digits."
                    : undefined
                }
              >
                <Input
                  value={bankAccount}
                  inputMode="numeric"
                  maxLength={10}
                  onChange={(e) =>
                    setBankAccount(e.target.value.replace(/\D/g, ""))
                  }
                />
              </Field>
              <p className="text-[0.875rem] text-muted">
                Your people team is told when this changes.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="accent"
                  size="sm"
                  disabled={!changed || !accountLooksRight}
                  onClick={() => setConfirming(true)}
                >
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBankName(me.bankName ?? "");
                    setBankAccount(me.bankAccount ?? "");
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <span
                aria-hidden="true"
                className="flex size-9 items-center justify-center rounded-md bg-sunken text-faint [&>svg]:size-[18px]"
              >
                <Landmark aria-hidden="true" />
              </span>
              <DescriptionList
                items={[
                  { term: "Bank", value: me.bankName ?? "Not on file" },
                  {
                    term: "Account",
                    /* Last four only. There is no reason for a full account
                       number to sit on screen in an open-plan office. */
                    value: me.bankAccount
                      ? `•••• ${me.bankAccount.slice(-4)}`
                      : "Not on file",
                  },
                ]}
              />
            </>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={commit}
        title="Change where you get paid?"
        confirmLabel="Change it"
        tone="primary"
        body={`Future payments go to ${bankName || "this bank"}, account ending ${bankAccount.slice(-4)}. Your people team is notified.`}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function PayCard({ grossMonthly }: { grossMonthly: number }) {
  return (
    <Card>
      <CardHeader title="Your pay" level={3} />
      <CardBody className="flex flex-col gap-3">
        <div>
          <p className="text-[0.875rem] text-muted">Gross each month</p>
          <p className="text-[1.25rem] font-semibold text-ink">
            <Money amount={grossMonthly} />
          </p>
        </div>
        <ButtonLink href="/payroll/payslips" variant="secondary" size="sm">
          <Receipt aria-hidden="true" className="size-4" />
          My payslips
        </ButtonLink>
      </CardBody>
    </Card>
  );
}

function TimeOffCard({ employeeId }: { employeeId: string }) {
  const balances = useLeaveBalances();
  const mine = balances.forEmployee(employeeId);
  const annual = mine.find((b) => b.type === "Annual") ?? mine[0];
  /* `remaining` is not a stored field. Pending days are held back as well as
     taken ones, because a request already in somebody's inbox is spent as far
     as the person booking is concerned. */
  const remaining = annual
    ? annual.entitled - annual.taken - annual.pending
    : 0;

  return (
    <Card>
      <CardHeader title="Time off" level={3} />
      <CardBody className="flex flex-col gap-3">
        {annual ? (
          <div>
            <p className="text-[0.875rem] text-muted">{annual.type} days left</p>
            <p className="text-[1.25rem] font-semibold text-ink">
              {remaining}
              <span className="ml-1 text-[0.875rem] font-normal text-muted">
                of {annual.entitled}
              </span>
            </p>
            {annual.pending > 0 && (
              <p className="mt-1 text-[0.875rem] text-muted">
                {annual.pending} waiting for approval
              </p>
            )}
          </div>
        ) : (
          <p className="text-[0.875rem] text-muted">No balance on record yet.</p>
        )}
        <ButtonLink href="/people/leave" variant="secondary" size="sm">
          <CalendarClock aria-hidden="true" className="size-4" />
          Book time off
        </ButtonLink>
      </CardBody>
    </Card>
  );
}

/**
 * Password and sessions.
 *
 * "Sign out everywhere" is here rather than buried in Settings because the
 * person who needs it is the person who thinks somebody else is in their
 * account, and they will look for it on their own page.
 *
 * The password form is inline rather than a link to `/settings/password`. That
 * route does not exist, and a nav or a button pointing at a page that is not
 * there is the specific thing this project keeps catching itself doing — the
 * footer's four legal links 404'd for weeks. Two fields in a card is also
 * simply less work for the person than a page change.
 */
function SecurityCard({
  onSignOut,
  apiMode,
}: {
  onSignOut: () => Promise<void>;
  apiMode: boolean;
}) {
  const toast = useToast();
  const [changing, setChanging] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState<"password" | "sessions" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changePassword() {
    setBusy("password");
    setError(null);
    try {
      await self.changePassword(current, next);
      toast.push({ title: "Password changed", tone: "success" });
      setCurrent("");
      setNext("");
      setChanging(false);
    } catch {
      setError("That current password is not right.");
    } finally {
      setBusy(null);
    }
  }

  async function signOutEverywhere() {
    setBusy("sessions");
    try {
      await self.signOutEverywhere();
      toast.push({ title: "Signed out on every device", tone: "success" });
      await onSignOut();
    } catch {
      toast.push({ title: "Could not sign you out", tone: "danger" });
    } finally {
      setBusy(null);
    }
  }

  /* Nothing here works without a server. The demo has no password to change
     and no sessions to end, and offering either would be a lie. */
  if (!apiMode) {
    return (
      <Card>
        <CardHeader title="Security" level={3} />
        <CardBody>
          <p className="text-[0.875rem] text-muted">
            Sign in with a password to change it or to end other sessions.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Security" level={3} />
      <CardBody className="flex flex-col gap-3">
        {changing ? (
          <>
            <Field label="Current password" error={error ?? undefined}>
              <Input
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </Field>
            <Field label="New password" help="At least 12 characters.">
              <Input
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Button
                variant="accent"
                size="sm"
                disabled={!current || next.length < 12 || busy !== null}
                onClick={() => void changePassword()}
              >
                {busy === "password" ? "Changing…" : "Change password"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setChanging(false);
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setChanging(true)}
            >
              <ShieldCheck aria-hidden="true" className="size-4" />
              Change password
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              onClick={() => void signOutEverywhere()}
            >
              <LogOut aria-hidden="true" className="size-4" />
              {busy === "sessions" ? "Signing out…" : "Sign out everywhere"}
            </Button>
            <p className="text-[0.875rem] text-muted">
              <Phone aria-hidden="true" className="mr-1 inline size-3.5" />
              Lost your phone? Sign out everywhere, then change your password.
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}
