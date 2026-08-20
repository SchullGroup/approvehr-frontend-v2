"use client";

import { useState } from "react";
import { DoorOpen, Laptop } from "lucide-react";
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
import type { ApiExitTask } from "@/lib/api/offboarding";
import { useCan } from "@/lib/permissions";
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
  const [busy, setBusy] = useState(false);

  if (exitState.loading) {
    return (
      <>
        <PageHeader title="Leaver" breadcrumb={[{ href: "/people/offboarding", label: "Leavers" }]} />
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
        <PageHeader title="Leaver" breadcrumb={[{ href: "/people/offboarding", label: "Leavers" }]} />
        <PageBody>
          <Card>
            <EmptyState
              icon={<DoorOpen aria-hidden="true" />}
              title="We could not find that exit"
              action={
                <ButtonLink href="/people/offboarding">Back to leavers</ButtonLink>
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

  return (
    <>
      <PageHeader
        title={exit.employee.name}
        breadcrumb={[{ href: "/people/offboarding", label: "Leavers" }]}
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

        {exit.status === "COMPLETED" && (
          <Callout tone="success" title="Closed">
            {firstName}&rsquo;s record is archived, not deleted. Past payslips still
            work.
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
                    <p className="text-[0.875rem] text-body">
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
                    <p className="text-[0.875rem] text-body">
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
              </div>

              {/* One short line, naming what is in the way. */}
              {!closed && !readiness.canComplete && (
                <p className="text-[0.875rem] text-muted sm:text-right">
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

        {held.length > 0 && (
          <Card>
            <CardHeader
              title="Still on the equipment register"
              level={3}
              description={`${firstName} has not handed these back.`}
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
                    <p className="text-[0.9375rem] font-medium text-ink">
                      {asset.name}
                    </p>
                    <p className="tabular mt-0.5 text-[0.875rem] text-muted">
                      {asset.tag} · since {shortDate(asset.assignedOn)}
                    </p>
                  </div>
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
        body="Their record is kept, not deleted. Past payslips still work."
      />

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
