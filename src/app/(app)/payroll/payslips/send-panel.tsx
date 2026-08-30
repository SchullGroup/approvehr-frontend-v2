"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Badge, Button, Callout, Card, CardBody, CardHeader } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { PayslipSendOutcome } from "@/lib/api/payroll";
import { usePayrollActions } from "@/lib/store/payroll";

/**
 * Sending this month's payslips to the people on it.
 *
 * ## What this closes
 *
 * The three delivery states on this screen — Not sent, Sent, Opened — have
 * been counted correctly and truthfully since they were built, off
 * `emailedAt` and `viewedAt`, and **nothing in the product ever wrote the
 * first column**. Every payslip has sat at "Not sent" for ever. The screen was
 * reporting the exact truth about a thing nobody could change, which is a
 * particular kind of dead end: it looks like a feature, so nobody reports it.
 *
 * ## Two things it must never say
 *
 * **It cannot claim to have sent what it did not.** The API stamps `emailedAt`
 * only after a provider accepts the message, and this renders the counts it
 * returns rather than the count it hoped for. Anything else is the green
 * "Paid" against money nobody moved.
 *
 * **It cannot skip anybody quietly.** Somebody with no address on their record
 * is named here, with their staff number, because the fix is a person going and
 * adding one. A bare "3 not sent" is a number to investigate; three names are
 * three things to do.
 */
export function SendPayslips({
  runId,
  approved,
  notSent,
  onSent,
}: {
  runId: string;
  /**
   * Whether the run is approved.
   *
   * The API refuses a draft, and this refuses to offer it — `prepare` deletes
   * and rebuilds every payslip, and an email is the one act in this product
   * that cannot be taken back. Said in place of the button rather than by
   * greying it out, because "why is this off" is the question a greyed control
   * always raises and never answers.
   */
  approved: boolean;
  /** From the run's own counts, so this cannot disagree with the tile above. */
  notSent: number | undefined;
  /** Re-read the list, so the delivery counts on screen are the new ones. */
  onSent: () => void;
}) {
  const actions = usePayrollActions();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<PayslipSendOutcome | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setFailed(null);
    setOutcome(null);
    try {
      const result = await actions.sendPayslips(runId);
      setOutcome(result);
      onSent();
    } catch (error) {
      setFailed(
        error instanceof ApiError
          ? error.message
          : "Nothing was sent. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Send the payslips"
        description="Everybody on this payroll with an email address gets theirs, with their net pay and a link to the breakdown."
      />
      <CardBody className="flex flex-col gap-4">
        {!approved ? (
          <Callout tone="info" title="Not until this payroll is approved">
            Calculating a payroll again replaces every payslip on it, and an
            email cannot be taken back. Approve the month and this becomes
            available.
          </Callout>
        ) : (
          <>
            {failed && (
              <Callout tone="danger" title="Nothing was sent">
                {failed}
              </Callout>
            )}

            {outcome && <Outcome outcome={outcome} />}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="accent"
                loading={busy}
                disabled={busy || notSent === 0}
                onClick={() => void send()}
              >
                {!busy && <Send aria-hidden="true" className="size-4" />}
                {notSent === undefined
                  ? "Send the ones that have not gone"
                  : notSent === 0
                    ? "Everybody has theirs"
                    : `Send ${String(notSent)} ${notSent === 1 ? "payslip" : "payslips"}`}
              </Button>
              {/* The count is on the button, so this says the thing the count
                  does not: pressing it again is safe. That is the question
                  somebody has after a partial send, and the answer is what
                  lets them press it. */}
              <span className="text-meta text-muted">
                Anybody who already has theirs is left alone.
              </span>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * What happened, in the four states that need four different actions.
 *
 * Rendered as a report rather than a toast, because two of the four are lists
 * of names somebody has to work through and a toast is gone in six seconds.
 */
function Outcome({ outcome }: { outcome: PayslipSendOutcome }) {
  const nothingHappened =
    outcome.sent === 0 &&
    outcome.noEmail.length === 0 &&
    outcome.failed.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-ink">
        {outcome.sent === 0 ? (
          nothingHappened ? (
            outcome.alreadySent > 0 ? (
              <>Everybody on this payroll already had theirs. Nothing was sent.</>
            ) : (
              <>There was nobody to send to.</>
            )
          ) : (
            <>No payslip was sent.</>
          )
        ) : (
          <>
            <strong className="tabular">{outcome.sent}</strong>{" "}
            {outcome.sent === 1 ? "payslip" : "payslips"} sent.
            {outcome.alreadySent > 0 && (
              <>
                {" "}
                <span className="text-muted">
                  {outcome.alreadySent} already had theirs and were left alone.
                </span>
              </>
            )}
          </>
        )}
      </p>

      {outcome.noEmail.length > 0 && (
        <Callout
          tone="warning"
          title={`${String(outcome.noEmail.length)} ${outcome.noEmail.length === 1 ? "person has" : "people have"} no email address`}
        >
          <p>
            Nothing was attempted for them, and nothing went wrong — there is
            nowhere to send it. Add an address on their record and send again.
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {outcome.noEmail.map((person) => (
              <li key={person.employeeNo}>
                <strong className="text-ink">{person.name}</strong>{" "}
                <Badge tone="neutral" size="sm">
                  {person.employeeNo}
                </Badge>
              </li>
            ))}
          </ul>
        </Callout>
      )}

      {outcome.failed.length > 0 && (
        <Callout
          tone="danger"
          title={`${String(outcome.failed.length)} did not go`}
        >
          <p>
            These were attempted and refused. They are still marked as not sent,
            so pressing send again tries them and nobody else.
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {outcome.failed.map((person) => (
              <li key={person.employeeNo}>
                <strong className="text-ink">{person.name}</strong>{" "}
                <Badge tone="neutral" size="sm">
                  {person.employeeNo}
                </Badge>{" "}
                — {person.reason}
              </li>
            ))}
          </ul>
        </Callout>
      )}
    </div>
  );
}
