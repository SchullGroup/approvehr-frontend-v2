"use client";

import { sourceNote } from "@/lib/demo";
import { Fragment, useMemo, useState } from "react";
import { AlarmClock, Clock, TriangleAlert } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardFooter,
  CardHeader,
  EmptyState,
  Money,
  SegmentedControl,
  Select,
  Spinner,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  KIND_LABEL,
  STATUS_LABEL,
  dayLabel,
  hoursLabel,
  monthLabel,
  naira,
  recentPeriods,
  spokenHours,
} from "@/lib/api/overtime";
import type { OvertimePolicy, OvertimeStatus } from "@/lib/overtime/derive";
import { usePermissions } from "@/lib/permissions";
import { currentPeriod, useOvertime, type OvertimeRow } from "@/lib/store/overtime";
import { TODAY } from "@/lib/today";
import { DeclineOvertimeModal } from "./decline-overtime";
import { MyOvertime } from "./my-overtime";
import { KIND_TONE, STATUS_TONE } from "./tone";

/**
 * Overtime.
 *
 * ## There is no "submit a claim" button, and that is the whole design
 *
 * Every row here came from a clock-out later than a shift end. The primary
 * action is **Work out this month's overtime**, which reads attendance and
 * writes what it finds — because a figure somebody types is a figure somebody
 * can round up, and the clock is already recorded. Anybody looking for the claim
 * form should find the answer in the button instead of in a paragraph.
 *
 * ## One route, two readers
 *
 * `VIEW_SALARIES` sees everybody's and can act on it. Anybody else sees their
 * own, on the same URL, because a link a colleague sends should open for them
 * too. That is the parity rule about one route per concept, rendered by role.
 *
 * ## The two things people get wrong about overtime
 *
 * Both are said in words where they occur rather than in a legend:
 *
 * 1. **Waiting is not paid.** The pending total sits above the table, company
 *    wide, because the moment to notice it is before the payroll run rather
 *    than in the run's exception list.
 * 2. **A capped day is a question, not a short payment.** Six hours is what the
 *    policy allows in one day; twenty is somebody who went home without
 *    clocking out. The row says so and offers the timesheet.
 */
export function OvertimeScreen() {
  const { permissions, loading } = usePermissions();

  if (loading) {
    return (
      <>
        <PageHeader title="Overtime" />
        <PageBody>
          <span className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading
          </span>
        </PageBody>
      </>
    );
  }

  return permissions.has("VIEW_SALARIES") ? <AllOvertime /> : <OwnOvertime />;
}

/* -------------------------------------------------------------------------- */

/** What a staff member sees on this URL. Their own hours, and nothing else. */
function OwnOvertime() {
  return (
    <>
      <PageHeader
        title="Overtime"
      />
      <PageBody>
        <MyOvertime
          fallback={
            <Card>
              <EmptyState
                icon={<AlarmClock aria-hidden="true" />}
                title="No overtime on this sign-in"
                description="This account has no staff record, so there are no clock-outs to work overtime out from."
              />
            </Card>
          }
        />
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

const FILTERS: { value: OvertimeStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Waiting" },
  { value: "APPROVED", label: "Approved" },
  { value: "DECLINED", label: "Declined" },
  { value: "PAID", label: "On a payslip" },
];

function AllOvertime() {
  const { permissions } = usePermissions();
  const toast = useToast();

  const [period, setPeriod] = useState(currentPeriod);
  const [status, setStatus] = useState<OvertimeStatus | "ALL">("ALL");
  const [working, setWorking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [declining, setDeclining] = useState<OvertimeRow | null>(null);

  const overtime = useOvertime({ period, status });
  const { policy, awaitingApproval, shown } = overtime;

  const canWorkOut = permissions.has("RUN_PAYROLL");
  const canDecide = permissions.has("APPROVE_LEAVE_ALL");

  const periods = useMemo(() => recentPeriods(TODAY, 12), []);
  const thisMonth = currentPeriod();

  /** Every failure shows the API's own words — they name who and what. */
  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      toast.push({ title: done, tone: "success" });
      return true;
    } catch (caught) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
      });
      return false;
    }
  };

  const workOutNow = async () => {
    setWorking(true);
    try {
      const result = await overtime.workOut(period);
      if (result.found === 0) {
        toast.push({
          tone: "info",
          title: `No overtime in ${monthLabel(period)}`,
          detail: `Nobody clocked out more than ${policy.graceMinutes} minutes past their shift.`,
        });
      } else {
        toast.push({
          tone: "success",
          title: `${result.written} ${result.written === 1 ? "day" : "days"} worked out`,
          detail:
            result.skippedPaid > 0
              ? `${result.skippedPaid} already on a payslip, left alone.`
              : undefined,
        });
      }
    } catch (caught) {
      toast.push({
        title: "Could not work it out",
        tone: "danger",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setWorking(false);
    }
  };

  const workOutButton = (
    <Button
      variant="accent"
      size="sm"
      loading={working}
      onClick={() => void workOutNow()}
    >
      <Clock aria-hidden="true" className="size-4" />
      {period === thisMonth
        ? "Work out this month's overtime"
        : `Work out ${monthLabel(period)}`}
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Overtime"
        meta={
          sourceNote(overtime.connected) && (
            <Badge tone="warning" size="sm" dot>
              {sourceNote(overtime.connected)}
            </Badge>
          )
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-44">
              <Select
                aria-label="Month"
                value={period}
                onChange={(e) => {
                  const next = e.target.value;
                  setPeriod(next);
                }}
              >
                {periods.map((option) => (
                  <option key={option} value={option}>
                    {monthLabel(option)}
                  </option>
                ))}
              </Select>
            </div>
            {canWorkOut && workOutButton}
          </div>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {overtime.error && (
          <Callout tone="danger" title="Could not read overtime">
            {overtime.error.message}
          </Callout>
        )}

        {overtime.policyKnown && !policy.enabled && (
          <Card>
            <EmptyState
              icon={<AlarmClock aria-hidden="true" />}
              title="Overtime is switched off"
              description="Nothing is worked out from the clock, and nothing reaches payroll."
              action={
                <ButtonLink variant="accent" href="/settings/overtime">
                  Turn on overtime
                </ButtonLink>
              }
            />
          </Card>
        )}

        {awaitingApproval.count > 0 && (
          <div className="rounded-lg border border-warning-line bg-warning-soft p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-body-sm font-semibold text-ink">
                  <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
                  Waiting for approval
                </p>
                <p className="mt-2">
                  <Money
                    amount={naira(awaitingApproval.amountKobo)}
                    decimals
                    size="lg"
                  />
                </p>
                <p className="mt-1 text-body-sm text-body">
                  {hoursLabel(awaitingApproval.minutes)} across{" "}
                  {awaitingApproval.count === 1
                    ? "one day"
                    : `${awaitingApproval.count} days`}
                  , this month and any other. Unapproved overtime is not paid —
                  the payroll run raises it as a warning.
                </p>
              </div>
              {status !== "PENDING" && (
                <Button size="sm" onClick={() => setStatus("PENDING")}>
                  Show what is waiting
                </Button>
              )}
            </div>
          </div>
        )}

        <Card>
          <CardHeader
            title={monthLabel(period)}
            description={
              overtime.loading ? (
                "Reading the month…"
              ) : shown.count === 0 ? (
                "Nothing worked out yet."
              ) : (
                <>
                  {shown.count} {shown.count === 1 ? "day" : "days"} ·{" "}
                  {hoursLabel(shown.minutes)} ·{" "}
                  <Money amount={naira(shown.amountKobo)} decimals />
                </>
              )
            }
            action={
              <SegmentedControl
                label="Show"
                options={FILTERS}
                value={status}
                onChange={setStatus}
              />
            }
          />

          {overtime.rows.length === 0 ? (
            <EmptyState
              icon={<Clock aria-hidden="true" />}
              title={
                status === "ALL"
                  ? `Nothing worked out for ${monthLabel(period)}`
                  : `No ${(FILTERS.find((f) => f.value === status)?.label ?? "").toLowerCase()} overtime in ${monthLabel(period)}`
              }
              description={
                status !== "ALL"
                  ? undefined
                  : canWorkOut
                    ? "Overtime comes from the clock. Work the month out to see what the clock-outs add up to."
                    : "Somebody who runs payroll works the month out from attendance."
              }
              action={
                status !== "ALL" ? (
                  <Button size="sm" onClick={() => setStatus("ALL")}>
                    Show every status
                  </Button>
                ) : canWorkOut ? (
                  workOutButton
                ) : undefined
              }
            />
          ) : (
            <TableWrap
              className="rounded-none border-0 border-t"
              caption={`Overtime in ${monthLabel(period)}`}
            >
              <THead>
                <TH>Who</TH>
                <TH>Day</TH>
                <TH align="right">Hours</TH>
                <TH>Kind</TH>
                <TH align="right">Comes to</TH>
                <TH>Status</TH>
                <TH>
                  <span className="sr-only-focusable">Decision</span>
                </TH>
              </THead>
              <TBody>
                {overtime.rows.map((row) => (
                  <Fragment key={row.id}>
                    <OvertimeTableRow
                      row={row}
                      policy={policy}
                      own={row.employeeId === overtime.ownEmployeeId}
                      canDecide={canDecide}
                      busy={busy === row.id}
                      onApprove={async () => {
                        setBusy(row.id);
                        await run(() => overtime.approve(row.id), "Approved");
                        setBusy(null);
                      }}
                      onDecline={() => setDeclining(row)}
                    />
                  </Fragment>
                ))}
              </TBody>
            </TableWrap>
          )}

          <CardFooter>
            <div className="min-w-0">
              <p className="text-body-sm text-muted">
                Approving does not pay anybody. The next payroll run picks up
                approved hours.
              </p>
              {/* The API caps a page at 100 rows. Saying so beats a total that
                  quietly disagrees with the rows above it. */}
              {overtime.total > overtime.rows.length && (
                <p className="mt-1 text-body-sm text-muted">
                  The first {overtime.rows.length} of {overtime.total} days are
                  shown, and the figures above cover those.
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <ButtonLink size="sm" href="/settings/overtime">
                Rates and grace
              </ButtonLink>
              <ButtonLink size="sm" href="/payroll">
                Monthly payroll
              </ButtonLink>
            </div>
          </CardFooter>
        </Card>
      </PageBody>

      {declining && (
        <DeclineOvertimeModal
          key={declining.id}
          row={declining}
          onClose={() => setDeclining(null)}
          onDecline={async (reason) => {
            const target = declining;
            setBusy(target.id);
            const ok = await run(
              () => overtime.decline(target.id, reason),
              "Turned down. They can see why.",
            );
            setBusy(null);
            if (ok) setDeclining(null);
          }}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

function OvertimeTableRow({
  row,
  policy,
  own,
  canDecide,
  busy,
  onApprove,
  onDecline,
}: {
  row: OvertimeRow;
  policy: OvertimePolicy;
  own: boolean;
  canDecide: boolean;
  busy: boolean;
  onApprove: () => void;
  onDecline: () => void;
}) {
  /* The uncapped figure is only known where the derivation ran locally. Where it
     is, it is the useful half of the sentence — twenty hours reads as a
     forgotten clock-out in a way "capped" alone does not. */
  const cappedLine =
    row.rawMinutes !== null && row.rawMinutes > row.minutes
      ? `The clock said ${hoursLabel(row.rawMinutes)}. Capped at ${spokenHours(policy.dailyCapMinutes)}. Check whether they forgot to clock out.`
      : `Capped at ${spokenHours(policy.dailyCapMinutes)}. Check whether they forgot to clock out.`;

  const hasNote = row.atCap || row.declinedReason !== null;

  return (
    <>
      <TR className={hasNote ? "[&>*]:pb-1.5" : undefined}>
        <TDPrimary
          title={row.name}
          subtitle={row.employeeNo ?? undefined}
        />
        <TD className="tabular whitespace-nowrap">{dayLabel(row.onDate)}</TD>
        <TD align="right" className="tabular whitespace-nowrap font-medium text-ink">
          {hoursLabel(row.minutes)}
        </TD>
        <TD>
          <Badge tone={KIND_TONE[row.kind]} size="sm">
            {KIND_LABEL[row.kind]} {row.rate}&times;
          </Badge>
        </TD>
        <TD align="right" className="whitespace-nowrap">
          <Money amount={naira(row.amountKobo)} decimals />
        </TD>
        <TD>
          <Badge tone={STATUS_TONE[row.status]} size="sm" dot>
            {STATUS_LABEL[row.status]}
          </Badge>
        </TD>
        <TD>
          <div className="flex justify-end gap-1.5 whitespace-nowrap">
            {row.status === "PAID" ? (
              <span className="text-body-sm text-muted">
                A payroll run took it
              </span>
            ) : own ? (
              /* The API refuses this and so does the interface. A button that
                 answers "you cannot approve your own overtime" was a design
                 failure one click earlier. */
              <span className="text-body-sm text-muted">
                Yours — somebody else approves it
              </span>
            ) : !canDecide ? null : (
              <>
                {row.status !== "APPROVED" && (
                  <Button
                    variant="approve"
                    size="sm"
                    loading={busy}
                    onClick={onApprove}
                  >
                    Approve
                  </Button>
                )}
                {row.status !== "DECLINED" && (
                  <Button size="sm" disabled={busy} onClick={onDecline}>
                    Decline
                  </Button>
                )}
              </>
            )}
          </div>
        </TD>
      </TR>

      {hasNote && (
        <TR>
          <TD colSpan={7} className="pt-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {row.atCap && (
                <>
                  <span className="flex items-center gap-2 text-body-sm text-body">
                    <TriangleAlert
                      aria-hidden="true"
                      className="size-4 shrink-0 text-warning-text"
                    />
                    {cappedLine}
                  </span>
                  <ButtonLink size="sm" href="/people/attendance">
                    Fix record
                  </ButtonLink>
                </>
              )}
              {row.declinedReason && (
                <span className="text-body-sm text-body">
                  Turned down &mdash; {row.declinedReason}
                </span>
              )}
            </div>
          </TD>
        </TR>
      )}
    </>
  );
}
