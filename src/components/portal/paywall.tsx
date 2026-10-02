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
 * `BillingGate` replaces a route's `children`, which is where that route's
 * own `PageHeader` normally lives — so without one, a locked page has no
 * `h1` at all. The markup and classes below are `PageHeader`'s own, for a
 * title-only call (`<PageHeader title="Subscription" />`, no breadcrumb,
 * meta, description, action or tabs), copied rather than imported for the
 * same reason as `PageBody` just below: `shell.tsx` renders `BillingGate`,
 * which renders this, so importing from it would be a cycle through the
 * app's one central module. Keep these two blocks in step with
 * `PageHeader`/`PageBody` in `shell.tsx` if either changes.
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
    <>
      <div className="grid-fade border-b border-line">
        <div className="px-5 pt-6 sm:px-7">
          <div className="flex flex-wrap items-start justify-between gap-4 pb-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-h3 text-ink">Subscription</h1>
              </div>
            </div>
          </div>
        </div>
      </div>
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
    </>
  );
}
