"use client";

import { useId } from "react";
import { Callout, Radio, TextLink } from "@/components/ui";
import type { EmailReadiness } from "@/lib/hiring/comms/model";
import type { InviteExplainer } from "@/lib/hiring/interviews/model";
import { senderLine } from "@/lib/hiring/interviews/words";

/**
 * Asking, before an interview is booked, changed or cancelled, whether to send the
 * message about it.
 *
 * ## Nothing is sent unless somebody chose it
 *
 * Booking an interview emails nobody by itself. This is where somebody decides, and the
 * answer that is selected when the dialog opens is **Don't send**, the same default the
 * decline tick and the move question have. Both answers are one press.
 *
 * ## It says what would go to whom, in the API's words
 *
 * The candidate and each panelist are sent different things, and what each gets is
 * written once, by the API (`explainer`), so this screen cannot promise more or less than
 * the server does. A panelist's copy never carries a score, a salary or contact details.
 *
 * ## And whose name it goes in
 *
 * The sender line is shown, never edited: mail goes from ApproveHR's address with the
 * company's name, and replies go to the careers reply-to address. If that is missing the
 * line says nothing would be sent, in the same words the email editor uses.
 */

export function SendChoice({
  legend,
  sendLabel,
  dontLabel,
  sendDescription,
  dontDescription,
  value,
  onChange,
  readiness,
  explainer,
  firstEmailNote,
  disabled = false,
}: {
  legend: string;
  sendLabel: string;
  dontLabel: string;
  /** Under "send": what this message is. */
  sendDescription?: string;
  /** Under "don't send": what happens instead. */
  dontDescription: string;
  value: boolean;
  onChange: (send: boolean) => void;
  readiness: EmailReadiness | null;
  /** The API's account of who is told what. `null` where it does not give one. */
  explainer: InviteExplainer | null;
  /** Said when this would be the first email the candidate gets about the interview. */
  firstEmailNote?: string | null;
  disabled?: boolean;
}) {
  const name = useId();
  const sender = readiness?.sender ?? null;
  /* The reply-to sentence is already in the sender box; do not say it twice. */
  const reasons = (readiness?.blockedBy ?? []).filter(
    (reason) => !/reply-to/i.test(reason),
  );

  return (
    <fieldset className="flex min-w-0 flex-col gap-3 rounded-md border border-line p-3">
      <legend className="px-1 text-body-sm font-medium text-ink">
        {legend}
      </legend>

      <Radio
        name={name}
        label={dontLabel}
        description={dontDescription}
        checked={!value}
        disabled={disabled}
        onChange={() => onChange(false)}
      />
      <Radio
        name={name}
        label={sendLabel}
        description={sendDescription}
        checked={value}
        disabled={disabled}
        onChange={() => onChange(true)}
      />

      {explainer && (
        <div className="flex flex-col gap-1.5 text-body-sm text-body">
          <p>
            <span className="font-medium text-ink">The candidate: </span>
            {explainer.candidate}
          </p>
          <p>
            <span className="font-medium text-ink">Each panelist: </span>
            {explainer.panelist}
          </p>
        </div>
      )}

      {sender ? (
        <div className="text-body-sm">
          <p className="text-body">{senderLine(sender)}</p>
          {!sender.replyTo && (
            <p className="mt-1 text-warning-text">
              Without one, nothing is sent: an email whose replies go nowhere is
              not sent.{" "}
              <TextLink href="/hiring/postings/settings">
                Add it in Careers settings
              </TextLink>
              .
            </p>
          )}
        </div>
      ) : (
        <p className="text-body-sm text-muted">
          Mail is sent in your company&apos;s registered name.
        </p>
      )}

      {value && firstEmailNote && (
        <p className="text-body-sm text-muted">{firstEmailNote}</p>
      )}

      {value && reasons.length > 0 && (
        <Callout tone="warning" title="It would not be sent right now">
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <p className="mt-2">
            You can still save the change. Each message is recorded as skipped,
            with the reason.
          </p>
        </Callout>
      )}
    </fieldset>
  );
}
