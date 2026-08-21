"use client";

import { useState } from "react";
import { Banknote, CalendarClock, CreditCard, DoorOpen, Laptop } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  DescriptionList,
  EmptyState,
  Field,
  Modal,
  ProgressMeter,
  Skeleton,
  Textarea,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  formatKobo,
  type ApiExitFinalPay,
  type ApiExitTask,
} from "@/lib/api/offboarding";
import { useCan } from "@/lib/permissions";
import { useEquipment } from "@/lib/store/assets";
import { useExit } from "@/lib/store/offboarding";
import { useSession } from "@/lib/store/session";
import { shortDate } from "@/lib/today";
import { statusTone } from "../status-tone";
import { Checklist } from "./checklist";
import { InterviewPanel } from "./interview-panel";

/**
 * One exit: a progress bar, the next action, and a checklist.
 *
 * The incumbent spreads this across four routes — resignation requests,
 * clearance checklist, handover, exit interviews — and a business owner has to
 * know which of the four holds the thing they are looking for. Here there is one
 * page, and the question it answers on arrival is "what has to happen next".
 *
 * ## The order of the page is the order of the work
 *
 * Next action, then the checklist, then the facts, then the interview. Not
 * facts-first: nobody opens this page to re-read a last working day they already
 * know. They open it because somebody is waiting on them.
 *
 * ## Closing refuses out loud
 *
 * "Close this exit" is disabled while anything mandatory is open, and the line
 * under it names what. The API refuses the same thing for the same reasons and
 * with the same list — `GET /readiness` and `POST /complete` run one
 * calculation, so the button and the refusal cannot disagree.
 */
export function ExitDetailScreen({ id }: { id: string }) {
  const exitState = useExit(id);
  const { exit, readiness } = exitState;
  const { employeeId, displayName } = useSession();
  const toast = useToast();

  const isHr = useCan("EDIT_RECORDS");
  const canApproveAsManager = useCan("APPROVE_LEAVE_ALL");

  const [closing, setClosing] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [busy, setBusy] = useState(false);

  /* Returning a laptop is the equipment register's operation, not this module's
     — two modules writing the same rows is how a register grows two truths. The
     button lives here because this is where somebody is standing when the laptop
     lands on the desk. `enabled: false` because nothing on this screen needs the
     register's list, only its one write. */
  const equipment = useEquipment({}, false);

  if (exitState.loading) {
    return (
      <>
        <PageHeader title="Exit" breadcrumb={[{ href: "/people/offboarding", label: "Exit management" }]} />
        <PageBody className="flex flex-col gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </PageBody>
      </>
    );
  }

  /* A hidden exit answers 404 rather than 403, deliberately — a 403 would
     confirm that somebody's exit exists. So this says one thing for both
     cases and does not speculate about which. */
  if (!exit || !readiness) {
    return (
      <>
        <PageHeader title="Exit" breadcrumb={[{ href: "/people/offboarding", label: "Exit management" }]} />
        <PageBody>
          <Card>
            <EmptyState
              icon={<DoorOpen aria-hidden="true" />}
              title="We could not find that exit"
              action={
                <ButtonLink href="/people/offboarding">Back to exit management</ButtonLink>
              }
            />
          </Card>
        </PageBody>
      </>
    );
  }

  const firstName = exit.employee.name.split(" ")[0] ?? exit.employee.name;
  const closed =
    exit.status === "COMPLETED" ||
    exit.status === "DECLINED" ||
    exit.status === "CANCELLED";

  /* Who may tick a line off: HR anything, and otherwise your own, your report's,
     or one assigned to you. The same rule the API applies — written here so the
     interface never offers a control that would be refused. */
  const canTick = (task: ApiExitTask): boolean => {
    if (isHr) return true;
    if (!employeeId) return false;
    return (
      task.assigneeId === employeeId ||
      exit.employee.id === employeeId ||
      exit.manager?.id === employeeId
    );
  };

  /**
   * A hint, not the control.
   *
   * The API stamps the *account* that ticked a line and returns only its name,
   * so a name is all there is to compare. It is used to grey the second
   * checkbox rather than to enforce anything — the server refuses the same
   * combination whatever this says.
   */
  const completedByMe = (task: ApiExitTask): boolean =>
    task.completedByName !== null &&
    displayName !== null &&
    task.completedByName === displayName;

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.push({ title: success, tone: "success" });
      return true;
    } catch (error) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const held = readiness.assetsStillHeld.filter((asset) => asset.returnRequired);

  /* Their own notice, theirs to take back. HR may cancel anybody's; the API
     enforces both and this only decides which button to offer. */
  const mine = employeeId !== null && exit.employee.id === employeeId;
  const canWithdraw = !closed && (mine || isHr);

  return (
    <>
      <PageHeader
        title={exit.employee.name}
        breadcrumb={[{ href: "/people/offboarding", label: "Exit management" }]}
        description={`${exit.kindLabel} · last day ${shortDate(exit.lastWorkingDay)} · ${
          exit.employee.jobTitle
        }`}
        meta={
          <>
            <Badge tone={statusTone(exit.status)} size="sm">
              {exit.statusLabel}
            </Badge>
            {exitState.source === "demo" && (
              <Badge tone="warning" size="sm">
                Demo · this browser only
              </Badge>
            )}
          </>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {exit.status === "DECLINED" && (
          <Callout tone="danger" title="Not going ahead">
            {exit.declinedReason ?? "No reason recorded."}
          </Callout>
        )}

        {exit.status === "CANCELLED" && (
          <Callout tone="info" title={`${firstName} is staying`}>
            {exit.declinedReason ?? "The exit was cancelled."} Nothing was
            archived and nothing was closed — they are still on the payroll. If
            they change their mind again, start a new one.
          </Callout>
        )}

        {exit.status === "COMPLETED" && (
          <Callout tone="success" title="Closed">
            {firstName}&rsquo;s record is archived, not deleted. Past payslips still
            work. Their sign-in has been switched off.
          </Callout>
        )}

        {/* Next action. The reason somebody opened this page. */}
        <Card>
          <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <ProgressMeter
              className="sm:max-w-xs"
              value={readiness.progress.percent}
              label={`${readiness.progress.done} of ${readiness.progress.total} done`}
              tone={readiness.canComplete ? "success" : "accent"}
            />

            <div className="flex flex-col items-start gap-2 sm:items-end">
              <div className="flex flex-wrap items-center gap-2">
                {exit.status === "AWAITING_MANAGER" &&
                  (canApproveAsManager ? (
                    <Button
                      variant="approve"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          exitState.managerApprove,
                          `${firstName} released`,
                        )
                      }
                    >
                      Release {firstName}
                    </Button>
                  ) : (
                    <p className="text-body-sm text-body">
                      {exit.manager
                        ? `${exit.manager.name} has to release ${firstName}.`
                        : `Their manager has to release ${firstName}.`}
                    </p>
                  ))}

                {exit.status === "AWAITING_HR" &&
                  (isHr ? (
                    <Button
                      variant="approve"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void run(exitState.hrApprove, "Checklist opened")
                      }
                    >
                      Approve and start the checklist
                    </Button>
                  ) : (
                    <p className="text-body-sm text-body">
                      HR has to approve this next.
                    </p>
                  ))}

                {!closed && isHr && (
                  <Button
                    variant="accent"
                    size="sm"
                    disabled={!readiness.canComplete || busy}
                    onClick={() => setClosing(true)}
                  >
                    Close this exit
                  </Button>
                )}

                {!closed && (isHr || canApproveAsManager) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => setDeclining(true)}
                  >
                    Not going ahead
                  </Button>
                )}

                {/* Different words for a different fact. "Not going ahead" is
                    somebody refusing; this is the person changing their mind,
                    and a report that cannot tell them apart says nothing. */}
                {canWithdraw && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => setWithdrawing(true)}
                  >
                    {mine ? "I am staying after all" : `${firstName} is staying`}
                  </Button>
                )}
              </div>

              {/* One short line, naming what is in the way. */}
              {!closed && !readiness.canComplete && (
                <p className="text-body-sm text-muted sm:text-right">
                  {blockerLine(readiness.blockers)}
                </p>
              )}
            </div>
          </CardBody>
        </Card>

        <Checklist
          groups={exit.groups}
          closed={closed}
          canTick={canTick}
          canVerify={isHr}
          completedByMe={completedByMe}
          onUpdate={exitState.updateTask}
          onVerify={exitState.verifyTask}
        />

        {/* Presence, not falsiness. `finalPay` is new on `GET /readiness`, and a
            screen served against an API that predates it should lose one card
            rather than crash on the leaver's page. */}
        {readiness.finalPay !== undefined && (
          <FinalPayCard finalPay={readiness.finalPay} firstName={firstName} />
        )}

        {held.length > 0 && (
          <Card>
            <CardHeader
              title="Still on the equipment register"
              level={3}
              description={`${firstName} has not handed these back. A checklist line ticked as returned while this still says otherwise stops the exit closing.`}
              action={
                <ButtonLink href="/people/assets" variant="secondary" size="sm">
                  Open the register
                </ButtonLink>
              }
            />
            <CardBody className="flex flex-col gap-2">
              {held.map((asset) => (
                <div
                  key={asset.assignmentId}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-line p-3"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sunken text-muted [&>svg]:size-4"
                  >
                    <Laptop aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-body font-medium text-ink">
                      {asset.name}
                    </p>
                    <p className="tabular mt-0.5 text-body-sm text-muted">
                      {asset.tag} · since {shortDate(asset.assignedOn)}
                      {asset.valueKobo === null
                        ? ""
                        : ` · ${formatKobo(asset.valueKobo)}`}
                    </p>
                  </div>

                  {/* Written by the assets module, not this one. The button is
                      here because this is where the person is standing when the
                      laptop arrives, and making them find the register to close
                      an exit is how a register goes stale. */}
                  {isHr && !closed && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await equipment.takeBack(asset.assetId, {
                            outcome: "RETURNED",
                          });
                          await exitState.reload();
                        }, `${asset.name} back on the register`)
                      }
                    >
                      Got it back
                    </Button>
                  )}
                </div>
              ))}
            </CardBody>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="The exit" level={3} />
            <CardBody>
              <DescriptionList
                items={[
                  { term: "What happened", value: exit.kindLabel },
                  { term: "Why", value: exit.reason ?? "Not recorded" },
                  { term: "Told us on", value: shortDate(exit.noticeGivenOn) },
                  {
                    term: "Last working day",
                    value: `${shortDate(exit.lastWorkingDay)} · ${exit.noticeDays} days notice`,
                  },
                  {
                    term: "Released by",
                    value: exit.managerApprovedByName ?? "Not yet",
                  },
                  {
                    term: "Approved by HR",
                    value: exit.hrApprovedByName ?? "Not yet",
                  },
                  { term: "Staff number", value: exit.employee.employeeNo },
                ]}
              />
            </CardBody>
          </Card>

          {isHr && (
            <InterviewPanel
              interview={exit.interview}
              employeeFirstName={firstName}
              closed={closed}
              onSave={exitState.saveInterview}
            />
          )}
        </div>
      </PageBody>

      <ConfirmDialog
        open={closing}
        onClose={() => setClosing(false)}
        title={`Close ${firstName}'s exit?`}
        confirmLabel="Close it"
        tone="primary"
        loading={busy}
        onConfirm={() => {
          void (async () => {
            const ok = await run(exitState.complete, "Exit closed");
            if (ok) setClosing(false);
          })();
        }}
        body="Their record is kept, not deleted, so past payslips and approvals still work. Their sign-in is switched off."
      />

      {withdrawing && (
        <WithdrawDialog
          firstName={firstName}
          mine={mine}
          busy={busy}
          onClose={() => setWithdrawing(false)}
          onWithdraw={async (reason) => {
            const ok = await run(
              () => exitState.withdraw(reason || undefined),
              mine ? "Your notice has been withdrawn" : `${firstName} is staying`,
            );
            if (ok) setWithdrawing(false);
          }}
        />
      )}

      {declining && (
        <DeclineDialog
          firstName={firstName}
          busy={busy}
          onClose={() => setDeclining(false)}
          onDecline={async (reason) => {
            const ok = await run(
              () => exitState.decline(reason),
              "Recorded, and they have been told",
            );
            if (ok) setDeclining(false);
          }}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The one short line under the disabled button.
 *
 * `blockers` come off the wire already written as plain lines, so this only
 * names the first and counts the rest. Listing all eight would be the paragraph
 * this product refuses to write, and the full list is already on screen: it is
 * the unticked boxes on the checklist below.
 */
function blockerLine(blockers: string[]): string {
  const [first, ...rest] = blockers.map((line) => line.replace(/\.$/, ""));
  if (!first) return "";
  return rest.length === 0
    ? `Still open: ${first}`
    : `Still open: ${first}, and ${rest.length} more`;
}

/* -------------------------------------------------------------------------- */

function DeclineDialog({
  firstName,
  busy,
  onClose,
  onDecline,
}: {
  firstName: string;
  busy: boolean;
  onClose: () => void;
  onDecline: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");

  return (
    <Modal
      open
      onClose={onClose}
      title="Not going ahead"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={reason.trim().length < 3 || busy}
            onClick={() => void onDecline(reason.trim())}
          >
            {busy ? "Saving…" : "Record it"}
          </Button>
        </div>
      }
    >
      <Field label={`Why, so ${firstName} can be told`} required>
        <Textarea
          rows={3}
          value={reason}
          autoFocus
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Agreed to stay on for another six months."
        />
      </Field>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Final pay.
 *
 * ## No total, on purpose
 *
 * The final figure belongs to the payroll run — it is the only thing holding the
 * tax schedule, the proration divisor and the reconciliation gate. A "final pay:
 * ₦412,000" on this card would be a second answer somebody has to reconcile
 * against the payslip, and the two would disagree the first time anything
 * changed.
 *
 * So this card is the list of things that *change* that figure and that nobody
 * remembers: money still owed, leave never taken, kit never handed back. Each is
 * a decision for a person, which is why each is stated separately rather than
 * netted off into a number that looks like an answer.
 *
 * The same three facts are raised on the payroll run itself as warnings, from the
 * same calculation — so what somebody reads here and what stops them approving
 * blind are the same sentence.
 *
 * A line with nothing in it is left out rather than shown as zero. In demo mode
 * there is no loan book and no register in the browser, so those two are always
 * empty, and inventing a balance on the one screen whose argument is "the exit
 * reaches payroll" would be the worst possible place to make something up.
 */
function FinalPayCard({
  finalPay,
  firstName,
}: {
  finalPay: ApiExitFinalPay;
  firstName: string;
}) {
  const untaken = finalPay.untakenLeave.reduce((sum, row) => sum + row.days, 0);

  const rows: { icon: React.ReactNode; label: string; detail: string }[] = [
    {
      icon: <CalendarClock aria-hidden="true" />,
      label: `Last day ${shortDate(finalPay.lastWorkingDay)}`,
      detail: "Their final payslip is the one covering this date.",
    },
  ];

  if (finalPay.outstandingLoanKobo > 0) {
    rows.push({
      icon: <CreditCard aria-hidden="true" />,
      label: `${formatKobo(finalPay.outstandingLoanKobo)} still owed on a loan`,
      detail:
        "Payroll takes one instalment. Recover the rest from the final pay or write it off — there is no next month.",
    });
  }

  if (untaken > 0) {
    rows.push({
      icon: <CalendarClock aria-hidden="true" />,
      /* Deliberately **not** one summed figure. Adding annual, sick and
         compassionate days together produces a headline number nobody would ever
         pay out — untaken sick leave is not money owed — and a card that states
         it as "29 days not taken" is teaching a non-HR owner something false on
         the screen where they decide what to pay. */
      label: `Leave not taken: ${finalPay.untakenLeave
        .map((row) => `${row.days} ${row.leaveType.toLowerCase()}`)
        .join(", ")}`,
      detail:
        "Annual leave is normally payable and sick leave is not. Decide which of it is before the final payslip.",
    });
  }

  if (finalPay.heldValueKobo > 0) {
    rows.push({
      icon: <Laptop aria-hidden="true" />,
      label: `${formatKobo(finalPay.heldValueKobo)} of equipment still out`,
      detail: "Get it back or agree a deduction before the final payslip.",
    });
  }

  return (
    <Card>
      <CardHeader
        title="Final pay"
        level={3}
        description={`What has to be decided before ${firstName}'s last payslip. The figure itself comes from the payroll run.`}
        action={
          <Badge tone={finalPay.agreed ? "success" : "warning"} size="sm">
            {finalPay.agreed ? "Agreed" : "Not agreed yet"}
          </Badge>
        }
      />
      <CardBody className="flex flex-col gap-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-start gap-3 rounded-md border border-line p-3"
          >
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sunken text-muted [&>svg]:size-4"
            >
              {row.icon}
            </span>
            <div className="min-w-0">
              <p className="text-body font-medium text-ink">{row.label}</p>
              <p className="mt-0.5 text-body-sm text-muted">{row.detail}</p>
            </div>
          </div>
        ))}

        <p className="flex items-start gap-2 text-body-sm text-muted">
          <Banknote aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          The payroll run raises each of these again before anybody approves it,
          from this same list.
        </p>
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Taking it back.
 *
 * The reason is optional here and required on "not going ahead", which is
 * deliberate: why somebody left is a field every report comes back to, and why
 * they changed their mind is nobody's business but theirs. Making a person
 * explain themselves to a form before it will let them stay is the wrong tone
 * for the one screen in this flow that is good news.
 */
function WithdrawDialog({
  firstName,
  mine,
  busy,
  onClose,
  onWithdraw,
}: {
  firstName: string;
  /** True when this is the signed-in person's own notice. */
  mine: boolean;
  busy: boolean;
  onClose: () => void;
  onWithdraw: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");

  return (
    <Modal
      open
      onClose={onClose}
      title={mine ? "Withdraw my notice" : `Cancel ${firstName}'s exit`}
      description={
        mine
          ? "Your checklist stops and nothing is closed. Your manager and HR will be told."
          : `${firstName} stays on the payroll and their checklist stops. Nothing is archived.`
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={busy}
            onClick={() => void onWithdraw(reason.trim())}
          >
            {busy ? "Saving…" : mine ? "Withdraw it" : "Cancel the exit"}
          </Button>
        </div>
      }
    >
      <Field label="Anything you want to add" help="Optional.">
        <Textarea
          rows={3}
          value={reason}
          autoFocus
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
          placeholder={
            mine ? "We agreed a new role." : "They accepted a counter-offer."
          }
        />
      </Field>
    </Modal>
  );
}
