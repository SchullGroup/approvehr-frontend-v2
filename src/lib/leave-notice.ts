import { daysBetweenIn } from "@/lib/time";

/**
 * What a leave type's "notice" setting means for the dates somebody has typed.
 *
 * `LeaveType.minNoticeDays` is stored, edited on Settings, and shown in the
 * table, and until this nothing read it: not the API (it only echoes the number)
 * and not the booking form. A figure that looks like a rule and changes nothing
 * is the failure this product is sold against, so the booking form says what the
 * type asks for and whether these dates fall short of it.
 *
 * It says so and nothing more. Notice is guidance a company states, not a gate:
 * the API accepts a request that starts sooner, and a screen that refused what
 * the server allows would teach the wrong model. Sick leave, which has no notice
 * to give, is `0` and says nothing at all.
 *
 * `null` means there is nothing to say: no notice asked for, no start date yet,
 * or a start date that is not a date. A bare `0` from `daysBetweenIn` would read
 * as "starts today", so unparseable input is refused before it is asked.
 */
export function noticeLine(args: {
  typeName: string;
  minNoticeDays: number | null | undefined;
  /** `YYYY-MM-DD`, what the person typed. Empty before they have. */
  from: string;
  /** `YYYY-MM-DD` for right now in the company's zone. */
  today: string;
  timeZone: string;
}): { text: string; short: boolean } | null {
  const { typeName, minNoticeDays, from, today, timeZone } = args;
  if (!minNoticeDays || minNoticeDays <= 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return null;

  const asks = `${typeName} asks for ${minNoticeDays} ${
    minNoticeDays === 1 ? "day's" : "days'"
  } notice.`;
  const given = daysBetweenIn(today, from, timeZone);
  if (given >= minNoticeDays) return { text: asks, short: false };

  const when =
    given < 0
      ? "starts in the past"
      : given === 0
        ? "starts today"
        : `starts in ${given} ${given === 1 ? "day" : "days"}`;
  return {
    text: `${asks} This ${when}, so the approver may ask why it is late. It can still be raised.`,
    short: true,
  };
}
