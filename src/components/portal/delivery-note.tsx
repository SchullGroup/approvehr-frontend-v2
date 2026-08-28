"use client";

import { ButtonLink, Callout } from "@/components/ui";
import type { DeliveryHint } from "@/lib/api/account";

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
  if (!hint) return null;

  /* A time alone reads as "today", and a verification token lasts a day —
     "stops working at 4:42 PM" on a link good until tomorrow afternoon is worse
     than saying nothing. The weekday appears only when it is needed, which is
     also the longest any of these tokens lives. */
  const expires = new Date(hint.expiresAt);
  const clock = Number.isNaN(expires.getTime())
    ? null
    : expires.toDateString() === new Date().toDateString()
      ? expires.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : expires.toLocaleString([], {
          weekday: "long",
          hour: "2-digit",
          minute: "2-digit",
        });

  return (
    <Callout tone="warning" title="No email was sent" className="mt-5">
      <p>
        This server cannot send email yet, so use the link here instead.
        {clock ? ` It stops working at ${clock}.` : ""}
      </p>
      <ButtonLink href={href(hint.token)} variant="secondary" size="sm" className="mt-3">
        {action}
      </ButtonLink>
    </Callout>
  );
}
