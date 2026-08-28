"use client";

import { useEffect, useState } from "react";
import {
  Banknote,
  CalendarClock,
  Landmark,
  Laptop,
  LogOut,
  Phone,
  Receipt,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { passwordAccepted } from "@/lib/api/account";
import { PasswordField } from "@/components/portal/password-field";
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
  EmptyState,
  Money,
  ProgressMeter,
  Skeleton,
  Spinner,
  Tabs,
  useToast,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { SessionRoleBadge } from "@/components/portal/role-badge";
import { permissionsApi, type Catalogue } from "@/lib/api/permissions";
import { requiresStrongPassword, usePermissions } from "@/lib/permissions";
import { useSession } from "@/lib/store/session";
import { useEmployee } from "@/lib/store/employees-api";
import { useEmployeeLeaveBalances } from "@/lib/store/leave-api";
import { useFeatures } from "@/lib/store/features";
import { MyLoans } from "@/app/(app)/payroll/loans";
import { MyRota } from "@/app/(app)/people/shifts";
import { MyAssets } from "@/app/(app)/people/assets";
import { Resign } from "@/app/(app)/people/offboarding";
import {
  fullName,
  payrollGapsFor,
  type Employee,
  type PayrollGap,
} from "@/lib/types";
import { self } from "@/lib/api/self";
import { PROFILE_TABS, isProfileTab, type ProfileTab } from "./tabs";
import { MyDetails } from "./my-details";

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
 *
 * ## Tabs, not one scroll — `PARITY.md` Rule 5
 *
 * This screen used to be nine unconditional siblings in one column: identity, a
 * payroll warning, contact, bank, pay, time off, security, rota, loans,
 * equipment, resignation and employment facts, each answering a different
 * question, with a **destructive resignation form sitting inline** between the
 * kit somebody holds and a read-only table. Rule 5 says a screen answers one
 * question and the rest goes behind a reveal.
 *
 * Four questions, so four tabs rather than eight disclosures — a reveal per
 * section is the same nine-item scroll with nine clicks added, and `pay-setup`
 * is the model here: large panels, one at a time. The ids and their order live
 * in `./tabs.ts`, which the server page also reads.
 *
 * **The tabs carry no counts.** `Tabs` takes one, and every count worth showing
 * here — how many assets, how many loan instalments left — belongs to a store
 * this screen does not read. Absent is not zero, and a confident `0` beside
 * "Things I hold" would be a claim rather than a blank.
 *
 * ## Three things stay outside the tabs, and one is the point of the rule
 *
 * 1. **Identity.** It is the subject of the page, not an answer on it.
 * 2. **The missing-details card.** Rule 5's named failure mode: a reveal must
 *    never hide something that stops a payroll. This is the one thing on the
 *    page that costs the reader money, so it renders above the tabs, always,
 *    and — because tabs now put the fix a click away — it carries a button to
 *    the tab that fixes it rather than leaving somebody to hunt.
 * 3. **An exit already in progress.** `Resign` renders that state as a live card
 *    with a last day and an unfinished checklist on it. It is not outside the
 *    tabs, because it shares one `useMyExit()` with the door that starts an exit
 *    and two instances of that hook would fire two requests and drift — but it
 *    is on `details`, which is the **default** tab, so it is on screen before
 *    anybody clicks anything. Do not reorder the tabs without moving it.
 *
 * Resignation itself is behind a deliberate step now, twice over: a closed
 * `Disclosure` at the foot of `details`, then the modal that was always there.
 */
export function ProfileScreen({ initialTab }: { initialTab: ProfileTab }) {
  const { isLoading, isSignedIn, employeeId, mode, signOut } = useSession();
  /**
   * The record itself, not `useSession().employee`.
   *
   * That field is documented as "for a name and a job title" — connected, it
   * resolves the session's `employeeId` (a real database id) against the demo
   * seed array, whose ids never match, so it was silently `undefined` for
   * every connected user and this whole screen rendered "No employee record"
   * for people who plainly have one. `useEmployee` is the same dual-mode,
   * properly-fetched hook `/people/[id]` already uses.
   */
  const record = useEmployee(employeeId ?? "");
  const employee = record.employee;
  /* A staff loan card only belongs here for a company that lends to staff, and
     a rota only for a company that runs one — the same flags that decide
     whether Loans and Shifts are in the nav at all. */
  const { loans: loansEnabled, shifts: shiftsEnabled } = useFeatures();
  const [tab, setTab] = useState<ProfileTab>(initialTab);

  const change = (next: string) => {
    if (!isProfileTab(next)) return;
    setTab(next);
    /* Shareable without a navigation. `replaceState` keeps the back button
       pointing at wherever the reader came from rather than at the tab they
       looked at three seconds ago. */
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  };

  if (isLoading || record.loading) {
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
  /* Split by what payroll actually does, not just "is it filled in" — a
     missing bank account stops your pay; a missing pension PIN or TIN does
     not. See `payrollGapsFor`. */
  const gaps = payrollGapsFor(employee);
  const blockingGaps = gaps.filter((g) => g.blocking);
  const advisoryGaps = gaps.filter((g) => !g.blocking);
  const gapSentence = [
    blockingGaps.length > 0
      ? `${blockingGaps.map((g) => g.label).join(", ")} — you cannot be paid until ${
          blockingGaps.length > 1 ? "these are" : "this is"
        } added.`
      : null,
    advisoryGaps.length > 0
      ? `${advisoryGaps.map((g) => g.label).join(", ")} recommended, but will not stop your pay.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <PageHeader title="My profile" />

      <PageBody className="flex flex-col gap-6">
        {/* Identity */}
        <Card>
          <CardBody className="flex flex-wrap items-center gap-4">
            <Avatar name={name} src={employee.avatarUrl} size="lg" />
            {/* `basis-48` so the demo badge wraps onto its own line at 375px
                rather than crushing this column. `flex-1` alone has a basis of
                0, so it loses every fight with a badge that cannot wrap and the
                name ends up one word per line. */}
            <div className="min-w-0 flex-1 basis-48">
              <p className="text-body-lg font-semibold text-ink">{name}</p>
              <p className="text-body-sm text-body">
                {employee.jobTitle} · {employee.department}
              </p>
              <p className="mt-1 text-body-sm text-muted">
                Staff number {employee.employeeNo} · {employee.location}
              </p>
              {/* Job title and role are different facts and both belong here.
                  "Talent Acquisition Lead" is what they do; "HR manager" is what
                  the software lets them do, and it is the second one that
                  explains why this screen looks the way it does. */}
              <SessionRoleBadge size="md" className="mt-2.5" />
            </div>
            {DEMO_ENABLED && mode === "offline" && (
              <Badge tone="warning" size="sm">
                Demo · this browser only
              </Badge>
            )}
          </CardBody>
        </Card>

        {/* The one thing on this page that might need doing. Shown only when
            it does, and as a list of fields plus a button — not a paragraph
            explaining what proration is.

            Outside the tabs on purpose: Rule 5 refuses to put anything that
            stops a payroll behind a click. */}
        {gaps.length > 0 && (
          <MissingDetails
            gaps={gaps}
            gapSentence={gapSentence}
            /* Bank account is the only one of the three the person can fix
               themselves; the other two are the company's to enter. So the
               button appears only when it would go somewhere useful. */
            onFixBank={
              employee.bankAccount ? undefined : () => change("pay")
            }
          />
        )}

        <Tabs items={TAB_ITEMS} value={tab} onChange={change}>
          {tab === "details" && (
            <div className="flex flex-col gap-6">
              {/* `MyDetails` replaced `ContactPanel`, which wrote through
                  `useEmployeeStore().update` — the HR path, needing
                  `EDIT_RECORDS`. An employee holds none, so pressing save there
                  answered 403 while the screen said "Saved". This one calls
                  `PATCH /employees/me`, which is the route that exists for it. */}
              <MyDetails me={employee} only="immediate" />
              <div className="grid gap-6 lg:grid-cols-2">
                <EmploymentCard employee={employee} />
                <SecurityCard onSignOut={signOut} apiMode={mode === "api"} />
              </div>

              {/* The employee's own door out, and the last thing on the tab for
                  the obvious reason.

                  `Resign` renders nothing when the sign-in has no staff record,
                  so it needs no guard here; it puts the door behind a closed
                  reveal and an exit already under way in front of one. */}
              <Resign />
            </div>
          )}

          {tab === "pay" && (
            <div className="flex flex-col gap-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <PayCard grossMonthly={employee.grossMonthly} />
              </div>
              {/* Same replacement as the Details tab, and this is the half that
                  matters: `BankPanel` wrote an account number straight to the
                  record. Now it is proposed, and payroll agrees before the
                  salary goes anywhere new. */}
              <MyDetails
                me={employee}
                only="approval"
                title="What your pay is worked out from"
                description="You can change any of these. Payroll checks them before they take effect, because your salary is paid on them."
              />
              {/* Composed, not reimplemented: `MyLoans` is exported from its own
                  module so there is one component that knows what a loan looks
                  like to the person repaying it. */}
              {loansEnabled && <MyLoans />}
            </div>
          )}

          {tab === "time-off" && (
            <div
              className={cn(
                "grid gap-6",
                shiftsEnabled ? "lg:grid-cols-3" : "lg:grid-cols-2",
              )}
            >
              <TimeOffCard employeeId={employeeId} />
              {/* Same principle as `MyLoans`: one component knows what a rota
                  looks like to the person working it. It is wider than the
                  balance because it carries the only thing on this tab that
                  might need an answer today — a colleague asking to be covered
                  on Thursday. */}
              {shiftsEnabled && <MyRota className="lg:col-span-2" />}
            </div>
          )}

          {/* No feature flag: every company hands somebody a laptop or a phone,
              and the person holding it is the one who has to hand it back.
              `GET /assets/employees/:id` needs no permission for your own id,
              so this renders for everybody. */}
          {tab === "equipment" && <MyAssets />}
        </Tabs>
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

const TAB_META: Record<ProfileTab, { label: string; icon: React.ReactNode }> = {
  details: { label: "Details", icon: <UserRound aria-hidden="true" /> },
  pay: { label: "Pay", icon: <Banknote aria-hidden="true" /> },
  "time-off": { label: "Time off", icon: <CalendarClock aria-hidden="true" /> },
  equipment: { label: "Things I hold", icon: <Laptop aria-hidden="true" /> },
};

const TAB_ITEMS = PROFILE_TABS.map((id) => ({ id, ...TAB_META[id] }));

/* -------------------------------------------------------------------------- */

/**
 * What payroll is still waiting on, above the tabs and never inside one.
 *
 * `onFixBank` is absent rather than a no-op when the missing fields are the
 * company's to enter — a Pension PIN and a TIN are not things the person
 * reading this can type, and a button that lands them on a panel with nothing
 * to do on it is worse than no button. The Employment card on `details` already
 * says to ask the people team.
 */
function MissingDetails({
  gaps,
  gapSentence,
  onFixBank,
}: {
  gaps: PayrollGap[];
  gapSentence: string;
  onFixBank?: (() => void) | undefined;
}) {
  return (
    <Card>
      <CardBody className="flex flex-wrap items-center gap-4">
        {/* Same basis, and it matters more here: this row now carries a
            button as well as the meter, and both refuse to shrink. */}
        <div className="min-w-0 flex-1 basis-48">
          <p className="text-body font-semibold text-ink">
            {gaps.length} {gaps.length === 1 ? "detail" : "details"}{" "}
            missing
          </p>
          <p className="mt-1 text-body-sm text-body">{gapSentence}</p>
        </div>
        {onFixBank && (
          <Button size="sm" variant="accent" onClick={onFixBank}>
            <Landmark aria-hidden="true" className="size-4" />
            Add your bank account
          </Button>
        )}
        <ProgressMeter
          value={Math.round(((5 - Math.min(5, gaps.length)) / 5) * 100)}
          label="Record complete"
          className="w-40"
        />
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

/** Employment facts. Read-only: the company owns these. */
function EmploymentCard({ employee }: { employee: Employee }) {
  return (
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
            {
              term: "Pension provider",
              value: employee.pensionProvider ?? "Not on file",
            },
          ]}
        />
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */


/* -------------------------------------------------------------------------- */


/* -------------------------------------------------------------------------- */

function PayCard({ grossMonthly }: { grossMonthly: number | null }) {
  return (
    <Card>
      <CardHeader title="Your pay" level={3} />
      <CardBody className="flex flex-col gap-3">
        <div>
          <p className="text-body-sm text-muted">Gross each month</p>
          <p className="text-[1.25rem] font-semibold text-ink">
            <Money amount={grossMonthly} />
          </p>
        </div>
        {/* `self-start` because the card is half the row now that Pay is its
            own tab, and a flex column stretches its children — a secondary
            link 480px wide reads as a banner rather than a button. */}
        <ButtonLink
          href="/payroll/payslips"
          variant="secondary"
          size="sm"
          className="self-start"
        >
          <Receipt aria-hidden="true" className="size-4" />
          My payslips
        </ButtonLink>
      </CardBody>
    </Card>
  );
}

/**
 * Through `useEmployeeLeaveBalances` — the same dual-mode hook `/people/leave`
 * and `book-leave.tsx` read — rather than the localStorage-only
 * `useLeaveBalances`. That one has no connected branch at all, so a signed-in
 * employee on a real company used to see a balance computed from this
 * browser's demo requests instead of their actual entitlement.
 */
function TimeOffCard({ employeeId }: { employeeId: string }) {
  const { balances, loading } = useEmployeeLeaveBalances(employeeId);
  const annual = balances.find((b) => b.leaveType === "Annual") ?? balances[0];

  return (
    <Card>
      <CardHeader title="Time off" level={3} />
      <CardBody className="flex flex-col gap-3">
        {loading ? (
          <Skeleton className="h-14 w-full" />
        ) : annual ? (
          <div>
            <p className="text-body-sm text-muted">{annual.leaveType} days left</p>
            <p className="text-[1.25rem] font-semibold text-ink">
              {annual.remaining}
              <span className="ml-1 text-body-sm font-normal text-muted">
                of {annual.entitled}
              </span>
            </p>
            {annual.pending > 0 && (
              <p className="mt-1 text-body-sm text-muted">
                {annual.pending} waiting for approval
              </p>
            )}
          </div>
        ) : (
          <p className="text-body-sm text-muted">No balance on record yet.</p>
        )}
        <ButtonLink
          href="/people/leave"
          variant="secondary"
          size="sm"
          className="self-start"
        >
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
 *
 * It is on `details` rather than a fifth tab because somebody looking for their
 * password looks under the tab about themselves, and one more tab to hold three
 * buttons is the nav sprawl Rule 2 is about, one level down.
 */
function SecurityCard({
  onSignOut,
  apiMode,
}: {
  onSignOut: () => Promise<void>;
  apiMode: boolean;
}) {
  const toast = useToast();
  const { permissions } = usePermissions();
  const [changing, setChanging] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState<"password" | "sessions" | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  /* Static copy, fetched once — same call `role-editor.tsx` already makes for
     the same `sensitive` flag. `permissions` itself is re-read from the
     database on every mount of `usePermissions`, not trusted from the access
     token, which is what makes checking it here honest rather than a stale
     claim from up to fifteen minutes ago. */
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  useEffect(() => {
    if (!apiMode) return;
    let cancelled = false;
    const controller = new AbortController();
    void permissionsApi
      .catalogue(controller.signal)
      .then((result) => {
        if (!cancelled) setCatalogue(result);
      })
      .catch(() => {
        /* Falls back to the lenient policy — see `requiresStrongPassword`'s
           own note on a null catalogue. */
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [apiMode]);
  const strict = requiresStrongPassword(permissions, catalogue);

  async function changePassword() {
    setBusy("password");
    setError(null);
    try {
      await self.changePassword(current, next);
      toast.push({
        title: "Password changed",
        tone: "success",
        detail: "You've been signed out everywhere, including here.",
      });
      setCurrent("");
      setNext("");
      setChanging(false);
      /* `changePassword` on the backend revokes every session on success,
         including this one, via the same `signOutEverywhere` the button below
         calls. Signing out locally keeps this screen honest about that —
         otherwise the token in memory stays syntactically valid for up to
         fifteen minutes while every request behind it is already refused. */
      await onSignOut();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "unknown", "Something went wrong. Try again."),
      );
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
          <p className="text-body-sm text-muted">
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
            {/* `currentPassword`/`newPassword` are the API's field names
                (`changePasswordSchema`); a wrong-current-password or
                already-your-password refusal carries no field at all, so it
                needs the banner rather than being lost under a field nobody
                is looking at. */}
            {error && error.fieldErrors.length === 0 && (
              <Callout tone="danger" title="That did not work">
                {error.message}
              </Callout>
            )}
            <PasswordField
              label="Current password"
              autoComplete="current-password"
              showRules={false}
              value={current}
              onChange={setCurrent}
              error={error?.messageFor("currentPassword")}
            />
            <PasswordField
              label="New password"
              autoComplete="new-password"
              value={next}
              onChange={setNext}
              error={error?.messageFor("newPassword")}
              onEnter={() => void changePassword()}
              strict={strict}
            />
            <div className="flex gap-2">
              <Button
                variant="accent"
                size="sm"
                disabled={!current || !passwordAccepted(next, strict) || busy !== null}
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
            <p className="text-body-sm text-muted">
              <Phone aria-hidden="true" className="mr-1 inline size-3.5" />
              Lost your phone? Sign out everywhere, then change your password.
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}
