"use client";

import { AttentionMark } from "@/components/ui";
import type {
  ApiScheduledAllowance,
  ApiScheduleStatus,
} from "@/lib/api/pay-components";
import { formatKobo } from "@/lib/api/payroll";
import type { ScheduledAllowancesState } from "@/lib/store/scheduled-allowances";

/**
 * What a payroll holds back, and what it lets through, on an allowance's
 * schedule.
 *
 * A payslip prints a due allowance as a line and **nothing** for one that is
 * not due: no ₦0 line, no "next due" on a document somebody takes to a bank.
 * The person working the run needs the other half, or they are surprised that an
 * allowance somebody expected did not appear. It is a quiet line with the detail
 * behind the mark, never a banner: most months for most companies it is not on
 * the screen at all.
 *
 * ## Where the words and the figures come from
 *
 * Every word of "next due Mar 2028" and "due this month" is the API's
 * (`status.text`), and the only figure is `amountKobo`, the one payment the API
 * reports. Nothing here works out when anything falls due, or what it comes to.
 * An allowance that is a percentage reports no amount, and then none is shown.
 *
 * ## It says nothing it does not know
 *
 * No answer (offline, an API without schedules, no permission, a read that
 * failed) renders nothing, never "no allowances held back". And for a run that
 * is not open the API answers with nobody in it: that run's payslips are the
 * record.
 */

/**
 * Said under every list. This is the schedule as it stands now, not what the last
 * calculation put on a payslip: an allowance assigned, or a schedule changed,
 * after the payroll was calculated is on the payslip only once it is calculated
 * again, and an approver should not read this line as the payslips.
 */
const AS_THE_SCHEDULE_STANDS =
  "This follows the schedules as they are now. If one was changed or an allowance was assigned after the last calculation, calculate again so the payslips match.";

/** How many people the mark names before it says "and N more". */
const SHOWN = 12;

const lowerFirst = (text: string) =>
  text.length > 1 && /[A-Z]/.test(text[0] ?? "") && !/[A-Z]/.test(text[1] ?? "")
    ? `${(text[0] ?? "").toLowerCase()}${text.slice(1)}`
    : text;

/** "Long-service allowance, next due Mar 2028" or "..., due this month, ₦1,200,000.00". */
export function allowanceLine(allowance: {
  name: string;
  status: Pick<ApiScheduleStatus, "text" | "due">;
  amountKobo: number | null;
}): string {
  const base = `${allowance.name}, ${lowerFirst(allowance.status.text)}`;
  return allowance.status.due && allowance.amountKobo !== null
    ? `${base}, ${formatKobo(allowance.amountKobo)}`
    : base;
}

export function ScheduledNote({
  scheduled,
  names,
  mode,
}: {
  scheduled: ScheduledAllowancesState;
  /** Who is on the run, to put a name to an id. */
  names: ReadonlyMap<string, string>;
  /** `held`: not due this month. `due`: falls due this month. */
  mode: "held" | "due";
}) {
  const answer = scheduled.answer;
  if (!scheduled.available || !answer?.open) return null;

  const people = answer.people
    .map((person) => ({
      employeeId: person.employeeId,
      allowances: person.allowances.filter(
        (allowance: ApiScheduledAllowance) =>
          mode === "due" ? allowance.status.due : !allowance.status.due,
      ),
    }))
    .filter((person) => person.allowances.length > 0);
  if (people.length === 0) return null;

  const lines = people.flatMap((person) =>
    person.allowances.map(
      (allowance) =>
        `${names.get(person.employeeId) ?? "Somebody on this payroll"}: ${allowanceLine(allowance)}`,
    ),
  );
  const shown = lines.slice(0, SHOWN);
  const more = lines.length - shown.length;

  const count = people.length;
  const sentence =
    mode === "due"
      ? `${String(count)} ${count === 1 ? "person has" : "people have"} an allowance falling due this month.`
      : `${String(count)} ${count === 1 ? "person has" : "people have"} an allowance that is not due this month, so it is not on their payslip.`;

  return (
    <p className="flex flex-wrap items-center gap-2 text-body-sm text-muted">
      <span>{sentence}</span>
      <AttentionMark
        tone={mode === "due" ? "info" : "attention"}
        text={[
          ...shown,
          more > 0 ? `and ${String(more)} more.` : null,
          AS_THE_SCHEDULE_STANDS,
        ]}
      />
    </p>
  );
}
