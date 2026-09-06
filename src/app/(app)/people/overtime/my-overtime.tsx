"use client";

import { Badge, ButtonLink, Card, CardBody, CardHeader, Money, Spinner } from "@/components/ui";
import {
  KIND_LABEL,
  STATUS_LABEL,
  dayLabel,
  hoursLabel,
  naira,
  spokenHours,
} from "@/lib/api/overtime";
import { useMyOvertime } from "@/lib/store/overtime";
import { STATUS_TONE } from "./tone";

/**
 * Your own overtime, for `/profile` and for anybody who opens
 * `/people/overtime` without permission to see everybody's.
 *
 * Written once and exported rather than repeated inside the profile screen, so
 * there is one component that knows what overtime looks like to the person who
 * worked it. The same argument as `MyRota` and `MyLoans`.
 *
 * Two things it says that nothing else will:
 *
 * - **Waiting is not paid.** Somebody looking at their own hours should not have
 *   to work out that a pending row is money they have not been promised.
 * - **A capped day is a question about the clock**, not a short payment. The
 *   person who forgot to clock out is the only one who knows what happened.
 *
 * Renders `fallback` — nothing, by default — when this sign-in has no staff
 * record. An accountant with a login and no employment has no overtime, and a
 * card explaining that is a card explaining itself.
 */
export function MyOvertime({
  className,
  fallback = null,
}: {
  className?: string;
  fallback?: React.ReactNode;
}) {
  const { rows, waiting, approved, policy, policyKnown, loading, noRecord } =
    useMyOvertime();

  if (noRecord) return <>{fallback}</>;

  return (
    <Card className={className}>
      <CardHeader
        title="My overtime"
        description="Worked out from your clock-outs. There is nothing to file."
        level={3}
      />
      <CardBody className="flex flex-col gap-4">
        {loading ? (
          <span className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading
          </span>
        ) : policyKnown && !policy.enabled ? (
          <p className="text-body-sm leading-relaxed text-body">
            Your company does not pay overtime, so extra hours are not worked out.
          </p>
        ) : rows.length === 0 ? (
          <p className="text-body-sm leading-relaxed text-body">
            No overtime on your record. It is worked out from the clock, so{" "}
            {policy.graceMinutes === 0
              ? "any time past your shift end"
              : `anything past ${spokenHours(policy.graceMinutes)} beyond your shift end`}{" "}
            shows up here.
          </p>
        ) : (
          <>
            {waiting.count > 0 && (
              <div className="rounded-md border border-warning-line bg-warning-soft px-3.5 py-3">
                <p className="text-body-sm font-semibold text-ink">
                  <Money amount={naira(waiting.amountKobo)} decimals /> waiting for
                  approval
                </p>
                <p className="mt-0.5 text-body-sm text-body">
                  {hoursLabel(waiting.minutes)} across{" "}
                  {waiting.count === 1 ? "one day" : `${waiting.count} days`}. It is
                  not paid until somebody approves it.
                </p>
              </div>
            )}

            {approved.count > 0 && (
              <p className="text-body-sm text-body">
                <Money amount={naira(approved.amountKobo)} decimals /> approved: the next payroll run picks it up.
              </p>
            )}

            <ul className="flex flex-col divide-y divide-line">
              {rows.map((row) => (
                <li key={row.id} className="flex flex-col gap-1 py-2.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="tabular w-24 shrink-0 text-body-sm text-body">
                      {dayLabel(row.onDate)}
                    </span>
                    <span className="tabular text-body-sm font-medium text-ink">
                      {hoursLabel(row.minutes)}
                    </span>
                    <Badge tone="neutral" size="sm">
                      {KIND_LABEL[row.kind]} {row.rate}&times;
                    </Badge>
                    <span className="ml-auto tabular text-body-sm font-medium text-ink">
                      <Money amount={naira(row.amountKobo)} decimals />
                    </span>
                    <Badge tone={STATUS_TONE[row.status]} size="sm" dot>
                      {STATUS_LABEL[row.status]}
                    </Badge>
                  </div>

                  {row.atCap && (
                    <p className="text-body-sm text-body">
                      Capped at {spokenHours(policy.dailyCapMinutes)}. Check whether
                      you forgot to clock out.
                    </p>
                  )}

                  {row.declinedReason && (
                    <p className="text-body-sm text-body">
                      Turned down &mdash; {row.declinedReason}
                    </p>
                  )}
                </li>
              ))}
            </ul>

            <div>
              <ButtonLink size="sm" href="/people/attendance">
                See my clock-ins
              </ButtonLink>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
