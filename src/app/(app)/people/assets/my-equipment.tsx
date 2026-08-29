"use client";

import { Laptop } from "lucide-react";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  Money,
  Spinner,
  type BadgeTone,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { useSession } from "@/lib/store/session";
import {
  CONDITION_LABEL,
  STATUS_LABEL,
  dayLabel,
  daysSince,
  useMyEquipment,
  type AssetStatus,
} from "@/lib/store/assets";

/**
 * What one person is holding, as they see it. For `/profile`.
 *
 * ## Why this is a card on somebody's own page and not a report
 *
 * The person who has to hand the laptop back is the one who should be able to
 * see what "the laptop" means. Without this, "return company property" on an
 * exit checklist is an instruction nobody can check — and a laptop goes missing
 * politely, because the leaver genuinely did not know it was on their record.
 *
 * `GET /assets/employees/:id` sits behind `requirePermissionOrSelf`, so reading
 * **your own** needs no permission at all. That is what lets this render for
 * everybody with no role check.
 *
 * ## What is on it, and why each thing is
 *
 * - **What it cost.** An owner might flinch at showing staff a figure. It is the
 *   number that makes "hand it back" real, the API already sends it on your own
 *   holdings, and somebody who has had a ₦1.45m laptop for a year should know
 *   that is what they are carrying around Lagos.
 * - **Whether it has to come back.** Some things do not — a branded backpack is
 *   a gift. Saying so is what stops the mandatory list being ignored.
 * - **Anything already handed back.** Two lines, because "I gave that back in
 *   March" is a claim, and this is where it is settled.
 *
 * No paragraph explaining custody, and no button: an employee cannot record
 * their own return, so offering one would be a lie. HR does that from
 * `/people/assets`, which is where the button lives.
 */

/** A held item's own state, when it is not simply "you have it". */
const HOLDING_TONE: Partial<Record<AssetStatus, BadgeTone>> = {
  IN_REPAIR: "info",
  LOST: "danger",
  RETIRED: "neutral",
};

export function MyAssets({
  employeeId,
  className,
}: {
  /** Somebody else's, for an HR view. Defaults to the signed-in person. */
  employeeId?: string;
  className?: string;
}) {
  const session = useSession();
  const id = employeeId ?? session.employeeId;
  const { kit, loading, error } = useMyEquipment(id);

  const holding = kit?.holding ?? [];
  const returned = kit?.returned ?? [];
  const mustReturn = kit?.counts.mustReturn ?? 0;

  return (
    <Card className={className}>
      <CardHeader
        title="Equipment you have"
        level={3}
        description={
          holding.length === 0
            ? undefined
            : mustReturn === 0
              ? "Yours to keep. Nothing here has to come back."
              : `${mustReturn} ${
                  mustReturn === 1 ? "thing" : "things"
                } to hand back if you leave.`
        }
        action={
          holding.length > 0 && (kit?.counts.value ?? 0) > 0 ? (
            <Money amount={kit?.counts.value ?? 0} size="sm" />
          ) : undefined
        }
      />

      <CardBody className="flex flex-col gap-4">
        {loading && (
          <div className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading
          </div>
        )}

        <LoadFailure subject="the equipment signed out to you" error={error} />

        {!loading && !error && holding.length === 0 && (
          <p className="flex items-center gap-2.5 text-body-sm text-muted">
            <Laptop aria-hidden="true" className="size-4 shrink-0 text-faint" />
            Nothing is signed out to you.
          </p>
        )}

        {holding.length > 0 && (
          <ul className="flex flex-col divide-y divide-line">
            {holding.map((item) => {
              const tone = HOLDING_TONE[item.status];
              return (
                <li
                  key={item.assignmentId}
                  className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-body font-medium text-ink">
                      {item.name}
                      <span className="tabular text-meta font-normal text-muted">
                        {item.tag}
                      </span>
                      {tone && (
                        <Badge tone={tone} size="sm">
                          {STATUS_LABEL[item.status]}
                        </Badge>
                      )}
                      {!item.returnRequired && (
                        <Badge tone="neutral" size="sm">
                          Yours to keep
                        </Badge>
                      )}
                    </p>
                    <p className="mt-0.5 text-body-sm text-muted">
                      {item.kind ? `${item.kind} · ` : ""}Given to you{" "}
                      {dayLabel(item.assignedOn)} · {daysSince(item.assignedOn)}{" "}
                      days · {CONDITION_LABEL[item.conditionOut].toLowerCase()}{" "}
                      when you got it
                    </p>
                  </div>
                  {item.value !== null && (
                    <Money amount={item.value} size="sm" className="shrink-0" />
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {returned.length > 0 && (
          <div>
            <p className="text-meta font-medium uppercase tracking-wide text-faint">
              Already handed back
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {returned.slice(0, 4).map((item) => (
                <li key={item.assignmentId} className="text-body-sm text-muted">
                  {item.name}{" "}
                  <span className="tabular text-meta">{item.tag}</span> ·
                  handed back {dayLabel(item.returnedOn)}
                  {item.conditionBack
                    ? ` · ${CONDITION_LABEL[item.conditionBack].toLowerCase()}`
                    : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
