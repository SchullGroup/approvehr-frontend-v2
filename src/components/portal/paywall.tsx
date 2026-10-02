"use client";

import { CreditCard } from "lucide-react";
import { Card, ButtonLink, EmptyState } from "@/components/ui";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDate } from "@/lib/time";
import type { ApiBilling } from "@/lib/api/endpoints";

/**
 * The heading, which is the whole explanation — there is no separate body
 * copy, because each variant already says what happened and that the data is
 * safe in one sentence. `status === "CANCELLED"` is checked ahead of
 * `reason`, because the design calls it out as "the expired wording, with
 * 'cancelled'" rather than a value `reason` itself ever carries.
 *
 * The date is whichever of these three a locked company actually has:
 * `lockedSince` once the lock has fired, else `currentPeriodEnd` (an expired
 * paid subscription) or `trialEndsAt` (an expired trial that never converted).
 */
function headingFor(billing: ApiBilling, timeZone: string): string {
  const date = formatDate(
    billing.lockedSince ?? billing.currentPeriodEnd ?? billing.trialEndsAt,
    timeZone,
  );
  if (billing.status === "CANCELLED") {
    return `Your subscription was cancelled and ended on ${date}. Your data is safe — renew to carry on.`;
  }
  if (billing.reason === "no_subscription") {
    return "Choose a plan to start using ApproveHR.";
  }
  return `Your subscription ended on ${date}. Your data is safe — renew to carry on.`;
}

/**
 * Rendered by `BillingGate` in place of a locked company's page.
 *
 * `canPay` is `usePermissions().can("MANAGE_SETTINGS")`, checked by the
 * caller rather than here — this component has no opinion on permissions,
 * only on what to show for each of the two answers.
 *
 * The outer padding matches `PageBody` in `shell.tsx` exactly, copied rather
 * than imported: `shell.tsx` renders `BillingGate`, which renders this, so
 * importing `PageBody` from it would be a cycle through the app's one
 * central module.
 */
export function Paywall({
  billing,
  canPay,
}: {
  billing: ApiBilling;
  canPay: boolean;
}) {
  const timeZone = useOrgTimezone();
  return (
    <div className="px-5 py-6 sm:px-7">
      <Card>
        <EmptyState
          icon={<CreditCard aria-hidden="true" />}
          title={headingFor(billing, timeZone)}
          description={
            canPay ? undefined : "Ask your administrator to subscribe."
          }
          action={
            canPay ? (
              <ButtonLink href="/billing/pay" variant="accent">
                Subscribe / Pay
              </ButtonLink>
            ) : undefined
          }
        />
      </Card>
    </div>
  );
}
