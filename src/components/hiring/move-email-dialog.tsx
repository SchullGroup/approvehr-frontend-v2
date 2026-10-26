"use client";

import { Button, Callout, Modal } from "@/components/ui";
import type { EmailReadiness } from "@/lib/hiring/comms/model";

/**
 * Asking, before a move, whether to send the stage's email.
 *
 * A stage can be set up to send a message to whoever is moved into it. The API sends
 * it when a person moves somebody, unless told not to, so a drag onto such a stage
 * would email a stranger without anyone having decided to. This is where somebody
 * decides, and both answers are one press: **Move and email**, or **Move without
 * emailing**.
 *
 * It says the name of the email, so the person knows which one they are agreeing to,
 * and when the email would not actually leave (no reply-to address, emails switched
 * off) it says so, in the API's words. Moving is still allowed: the move does not
 * depend on the email.
 */

export function MoveEmailDialog({
  open,
  onClose,
  who,
  stage,
  mail,
  readiness,
  busy = false,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  /** "Ada Okafor" or "42 people". */
  who: string;
  /** The stage they are going into. */
  stage: string;
  mail: { name: string; kindLabel: string } | null;
  readiness: EmailReadiness | null;
  busy?: boolean;
  onChoose: (sendEmail: boolean) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={`Move ${who} to ${stage}?`}
      description={
        mail
          ? `${stage} has an email set up for whoever is moved into it.`
          : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={() => onChoose(false)}
            disabled={busy}
          >
            Move without emailing
          </Button>
          <Button
            variant="accent"
            loading={busy}
            onClick={() => onChoose(true)}
          >
            Move and email
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-body-sm text-body">
        {mail && (
          <p>
            The email is{" "}
            <span className="font-medium text-ink">{mail.name}</span> (
            {mail.kindLabel.toLowerCase()}). It is sent in your company&apos;s
            name, and only if you choose to send it now.
          </p>
        )}
        {readiness && readiness.blockedBy.length > 0 && (
          <Callout tone="warning" title="It would not be sent right now">
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {readiness.blockedBy.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <p className="mt-2">
              You can still move them. The email is recorded as not sent, with
              the reason.
            </p>
          </Callout>
        )}
      </div>
    </Modal>
  );
}
