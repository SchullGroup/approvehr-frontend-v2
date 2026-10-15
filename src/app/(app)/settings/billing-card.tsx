"use client";

import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  type BadgeTone,
} from "@/components/ui";
import { usePermissions } from "@/lib/permissions";
import { useBilling } from "@/lib/billing";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDate } from "@/lib/time";
import type { ApiBilling } from "@/lib/api/endpoints";

/**
 * The Settings screen's own billing status card — `task-6-brief.md`, rendered
 * above the static `ONGOING` grid in `settings-screen.tsx` rather than as a
 * row inside it (`constraints.md`, departure 2): `ONGOING` is plain
 * `{href, title, description, icon}` data with no live status to carry, and
 * this card's whole reason to exist is that status.
 *
 * Gated on `MANAGE_SETTINGS` entirely — not the "ask your administrator"
 * fallback `Paywall` and `BillingBanner` use when the status itself is worth
 * surfacing to everyone. Here the status *is* the card, and Settings is
 * already an administrator's screen, so anybody without the permission to
 * act on it sees nothing rather than a line they can't do anything about.
 * `billing` null or undefined (demo mode, an older backend, a failed read)
 * means the same: show nothing.
 */

const STATUS_TONE: Record<ApiBilling["status"], BadgeTone> = {
  TRIALING: "info",
  ACTIVE: "success",
  GRACE: "warning",
  LOCKED: "danger",
  CANCELLED: "danger",
};

/** The status in words, for the badge and for the `GRACE`/`LOCKED`/`CANCELLED` line. */
const STATUS_WORD: Record<ApiBilling["status"], string> = {
  TRIALING: "Free trial",
  ACTIVE: "Active",
  GRACE: "Grace period",
  LOCKED: "Locked",
  CANCELLED: "Cancelled",
};

/**
 * The extra line under the badge, naming the date (and plan) the badge's own
 * word doesn't carry. `GRACE`, `LOCKED` and `CANCELLED` need nothing more
 * than the status in words the badge already says, so there is no second
 * copy of that same word sitting underneath it.
 */
function lineFor(billing: ApiBilling, timeZone: string): string | null {
  if (billing.status === "TRIALING") {
    return `Free trial · ends ${formatDate(billing.trialEndsAt, timeZone)}`;
  }
  if (billing.status === "ACTIVE") {
    const plan = billing.plan?.name ?? "your plan";
    return `${plan} · paid until ${formatDate(billing.currentPeriodEnd, timeZone)}`;
  }
  return null;
}

export function BillingCard() {
  const { can } = usePermissions();
  const billing = useBilling();
  const timeZone = useOrgTimezone();

  if (!can("MANAGE_SETTINGS") || !billing) return null;

  const actionLabel =
    billing.status === "TRIALING" ? "Subscribe / Pay" : "Renew";
  const line = lineFor(billing, timeZone);

  return (
    <Card className="mb-4">
      <CardBody className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-body-md font-semibold text-ink">Billing</h3>
            <Badge tone={STATUS_TONE[billing.status]}>
              {STATUS_WORD[billing.status]}
            </Badge>
          </div>
          {line && <p className="mt-1 text-body-sm text-body">{line}</p>}
          {!billing.enforced && (
            <p className="mt-1 text-body-sm text-muted">
              Billing isn&apos;t switched on yet — nothing is locked.
            </p>
          )}
        </div>
        <ButtonLink href="/billing/pay" variant="accent" size="sm">
          {actionLabel}
        </ButtonLink>
      </CardBody>
    </Card>
  );
}
