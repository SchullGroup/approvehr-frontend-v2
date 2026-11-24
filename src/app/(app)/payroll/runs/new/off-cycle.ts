/**
 * Whether "Pay somebody outside this payroll" is in force (L4, PAY-29).
 *
 * An off-cycle payroll is a new run beside a month that is already approved: a
 * leaver's final pay, a bonus on its own, a correction. On a month still being
 * worked there is nothing to sit beside, and the tick only changed what
 * calculating again would do, with nothing on screen to say so. So it applies
 * to an approved or paid month and to nothing else, even if it was ticked on
 * one and the month was then changed.
 */
export function offCycleApplies(
  ticked: boolean,
  monthStatus: string | null | undefined,
): boolean {
  return ticked && (monthStatus === "APPROVED" || monthStatus === "PAID");
}
