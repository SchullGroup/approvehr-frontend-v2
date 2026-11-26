"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button, Callout, ConfirmDialog } from "@/components/ui";
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
  const [confirming, setConfirming] = useState(false);
  /* Everybody a send has named as having no address (U77). The run's counts
     cannot tell them apart from anybody else not yet sent, so without this the
     button went on offering "Send 48 payslips" to 48 people it had just been
     told it could not reach. Kept for the life of the screen: adding an
     address happens on the person's record, and coming back starts afresh. */
  const [noAddress, setNoAddress] = useState<ReadonlySet<string>>(new Set());
  const reachable =
    notSent === undefined ? undefined : Math.max(0, notSent - noAddress.size);

  async function send() {
    setConfirming(false);
    setBusy(true);
    setFailed(null);
    setOutcome(null);
    try {
      const result = await actions.sendPayslips(runId);
      setOutcome(result);
      setNoAddress(
        (known) =>
          new Set([...known, ...result.noEmail.map((p) => p.employeeNo)]),
      );
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

  /* Not shown at all until the payroll is approved. The API refuses a draft
     and an email cannot be taken back, so there is nothing to offer, and a
     card explaining why there is nothing to offer is content nobody asked for. */
  if (!approved) return null;

  return (
    <div className="flex flex-col gap-3">
      {failed && <Callout tone="danger">{failed}</Callout>}

      {outcome && <Outcome outcome={outcome} />}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="accent"
          loading={busy}
          disabled={busy || reachable === 0}
          onClick={() => setConfirming(true)}
        >
          {!busy && <Send aria-hidden="true" className="size-4" />}
          {sendLabel(notSent, reachable)}
        </Button>
        {/* The count is on the button, so this says the thing the count does
            not: pressing it again is safe. */}
        <span className="text-meta text-muted">
          Anybody who already has theirs is left alone.
        </span>
      </div>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void send()}
        tone="primary"
        confirmLabel="Send them"
        title={
          reachable === undefined
            ? "Send the payslips that have not gone?"
            : `Send ${String(reachable)} ${reachable === 1 ? "payslip" : "payslips"}?`
        }
        body={
          <p>
            Each person is emailed their net pay with their payslip attached as
            a PDF, so they do not need to sign in to see it. An email cannot be
            taken back. Anybody with no email address on their record is named
            afterwards, and nothing is sent to them.
          </p>
        }
      />
    </div>
  );
}

function sendLabel(
  notSent: number | undefined,
  reachable: number | undefined,
): string {
  if (notSent === undefined || reachable === undefined)
    return "Send the ones that have not gone";
  if (notSent === 0) return "Everybody has theirs";
  if (reachable === 0) return "Nobody left to email";
  return `Send ${String(reachable)} ${reachable === 1 ? "payslip" : "payslips"}`;
}

/**
 * What happened, in the four states that need four different actions.
 *
 * Rendered as a report rather than a toast, because two of the four are lists
 * of names somebody has to work through and a toast is gone in six seconds.
 *
 * The figures come first, on one line, so the answer to "did it work" is
 * readable without scrolling. The people who need something done sit below in
 * columns, nine at a time: a forty-eight-row list down the left of a wide page
 * hid the table the person came here for.
 */
function Outcome({ outcome }: { outcome: PayslipSendOutcome }) {
  const nothingHappened =
    outcome.sent === 0 &&
    outcome.noEmail.length === 0 &&
    outcome.failed.length === 0;

  if (nothingHappened) {
    return (
      <p className="text-body-sm text-ink">
        {outcome.alreadySent > 0
          ? "Everybody on this payroll already had theirs. Nothing was sent."
          : "There was nobody to send to."}
      </p>
    );
  }

  return (
    <section
      aria-label="What the send did"
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:p-5"
    >
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        <Figure label={outcome.sent === 1 ? "payslip sent" : "payslips sent"}>
          {outcome.sent}
        </Figure>
        {outcome.alreadySent > 0 && (
          <Figure label="already had theirs">{outcome.alreadySent}</Figure>
        )}
        {outcome.noEmail.length > 0 && (
          <Figure label="no email address">{outcome.noEmail.length}</Figure>
        )}
        {outcome.failed.length > 0 && (
          <Figure label="did not go" danger>
            {outcome.failed.length}
          </Figure>
        )}
      </dl>

      {outcome.noEmail.length > 0 && (
        <PeopleList
          title={`${String(outcome.noEmail.length)} ${outcome.noEmail.length === 1 ? "person has" : "people have"} no email address`}
          hint="Nothing went wrong: there is nowhere to send theirs. Add an address on their record and send again, or open their payslip from the table and print the PDF."
          people={outcome.noEmail.map((p) => ({
            key: p.employeeNo,
            name: p.name,
            code: p.employeeNo,
          }))}
        />
      )}

      {outcome.failed.length > 0 && (
        <PeopleList
          title={`${String(outcome.failed.length)} did not go`}
          hint="These were tried and refused. They are still marked as not sent, so pressing send again tries them and nobody else."
          danger
          people={outcome.failed.map((p) => ({
            key: p.employeeNo,
            name: p.name,
            code: p.employeeNo,
            note: p.reason,
          }))}
        />
      )}
    </section>
  );
}

function Figure({
  label,
  danger = false,
  children,
}: {
  label: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dd
        className={`text-h3 tabular ${danger ? "text-danger" : "text-ink"} order-first`}
      >
        {children}
      </dd>
      <dt className="text-body-sm text-muted">{label}</dt>
    </div>
  );
}

/** How many names show before "Show all": three rows of three on a wide page. */
const PEOPLE_SHOWN = 9;

function PeopleList({
  title,
  hint,
  people,
  danger = false,
}: {
  title: string;
  hint: string;
  people: { key: string; name: string; code: string; note?: string }[];
  danger?: boolean;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? people : people.slice(0, PEOPLE_SHOWN);
  const hidden = people.length - shown.length;

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <h3 className={`text-h4 ${danger ? "text-danger" : "text-ink"}`}>
        {title}
      </h3>
      <p className="max-w-3xl text-body-sm text-muted">{hint}</p>
      <ul className="mt-1 grid gap-x-8 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((person) => (
          <li key={person.key} className="min-w-0 text-body-sm">
            <span className="font-medium text-ink">{person.name}</span>{" "}
            <span className="text-meta text-muted">{person.code}</span>
            {person.note && (
              <span className="block text-meta text-muted">{person.note}</span>
            )}
          </li>
        ))}
      </ul>
      {people.length > PEOPLE_SHOWN && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAll((open) => !open)}
          >
            {all ? "Show fewer" : `Show all ${String(people.length)}`}
          </Button>
          {!all && hidden > 0 && (
            <span className="sr-only">{hidden} more people</span>
          )}
        </div>
      )}
    </div>
  );
}
