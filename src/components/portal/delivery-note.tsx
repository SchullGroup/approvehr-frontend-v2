"use client";

import { ButtonLink, Callout } from "@/components/ui";
import type { DeliveryHint } from "@/lib/api/account";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateTime } from "@/lib/time";

/**
 * The link that should have arrived by email.
 *
 * **The API has no mail transport.** Rather than pretend — a `sendEmail()` that
 * logs "sent!" would have the first person testing a password reset believe the
 * feature works — the API returns the one-time token in the response outside
 * production and says so. This renders that: one sentence of fact and the button
 * it makes possible.
 *
 * In production `hint` is `null`, always, so this component renders nothing and
 * disappears from the product the day a transport is wired. That is the whole
 * lifecycle of this file; there is nothing to remove later.
 */
export function DeliveryNote({
  hint,
  href,
  action,
}: {
  hint: DeliveryHint;
  /** Where the link in the email would have pointed, given the token. */
  href: (token: string) => string;
  action: string;
}) {
  const timeZone = useOrgTimezone();

  if (!hint) return null;

  /* A time alone used to read as "today" — but "today" was decided by
     comparing against the *browser's* clock, the same bug this whole feature
     exists to fix, and it could disagree with the company's own day near
     midnight. The full date and time, always, in the company's zone, is
     unambiguous regardless of whose laptop is reading it. */
  const clock = formatDateTime(hint.expiresAt, timeZone);

  return (
    <Callout tone="warning" title="No email was sent" className="mt-5">
      <p>
        This server cannot send email yet, so use the link here instead.
        {clock !== "—" ? ` It stops working at ${clock}.` : ""}
      </p>
      <ButtonLink
        href={href(hint.token)}
        variant="secondary"
        size="sm"
        className="mt-3"
      >
        {action}
      </ButtonLink>
    </Callout>
  );
}
