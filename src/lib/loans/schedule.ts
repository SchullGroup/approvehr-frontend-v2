/**
 * The loan schedule, in kobo. A port of `buildSchedule` from
 * `approvehr-api/src/modules/loans/service.ts`, and it must stay a port.
 *
 * ## Why this exists on the frontend at all
 *
 * The apply form has to show the monthly deduction **while somebody is typing**,
 * before anything is submitted. That is the number they are deciding on, and a
 * round trip per keystroke is not a way to render it. The backend exports its
 * builder as a pure function for exactly this use.
 *
 * It is also what makes the demo honest: the schedule a laptop with no database
 * shows is the schedule the server would have generated, because it is the same
 * arithmetic.
 *
 * ## The rules, which are the backend's rules
 *
 * - `interestRate` is a **flat annual** rate as a fraction: 0.05 is 5% a year.
 *   `interest = principal x rate x months / 12`, rounded once. Zero is the
 *   default and the common case — the interest-free staff advance.
 * - Every instalment but the last is `floor(total / term)`; the last is the
 *   balancing figure, so the lines sum to exactly principal plus interest. One
 *   odd number at the end, where a final figure is expected anyway, beats
 *   several lines differing by a kobo.
 * - Due dates are pinned to the **first of the month, UTC**, like
 *   `PayrollRun.period`. A mid-month start normalises to that month's first,
 *   which reads as "start deducting from this month's run".
 *
 * If any of that changes on the server, change it here in the same commit. Two
 * implementations of one schedule is one too many, and the way it goes wrong is
 * a deduction instruction that does not match the letter the employee signed.
 */

export type ScheduleInput = {
  principalKobo: number;
  termMonths: number;
  /** Flat annual rate as a fraction. 0 for an interest-free advance. */
  interestRate: number;
  /** The pay period the first instalment comes out of, as `YYYY-MM-DD`. */
  startPeriod: string;
};

export type ScheduleLine = {
  /** 1-based instalment number. */
  sequence: number;
  /** First of the month it is due in, `YYYY-MM-DD`. */
  dueDate: string;
  amountKobo: number;
};

export type Schedule = {
  principalKobo: number;
  interestKobo: number;
  /** Principal plus interest. The lines sum to exactly this. */
  totalKobo: number;
  /** The regular instalment. Every line but the last is this amount. */
  instalmentKobo: number;
  /** The balancing figure. Equal to `instalmentKobo` when the total divides. */
  finalInstalmentKobo: number;
  lines: ScheduleLine[];
};

/* ------------------------------------------------------------- the calendar */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const pad = (n: number): string => String(n).padStart(2, "0");

/** `YYYY-MM-DD` for the first of whatever month the date falls in, in UTC. */
export function monthStart(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) throw new Error(`Not a date: ${String(date)}`);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
}

/** Months forward from the first of the month `iso` falls in. */
export function addMonths(iso: string, months: number): string {
  const d = new Date(monthStart(iso));
  const shifted = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1),
  );
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-01`;
}

/** `2027-03-01` becomes `March 2027`. What a pay period is called out loud. */
export function monthLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${MONTHS[d.getUTCMonth()] ?? "?"} ${d.getUTCFullYear()}`;
}

/** `2027-03-01` becomes `Mar 2027`. For a table column. */
export function shortMonthLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${(MONTHS[d.getUTCMonth()] ?? "?").slice(0, 3)} ${d.getUTCFullYear()}`;
}

/** True when the month `iso` falls in is before the month `reference` falls in. */
export function isBeforeMonth(iso: string, reference: string): boolean {
  return monthStart(iso) < monthStart(reference);
}

/* -------------------------------------------------------------- the builder */

export function buildSchedule({
  principalKobo,
  termMonths,
  interestRate,
  startPeriod,
}: ScheduleInput): Schedule {
  if (!Number.isInteger(principalKobo) || principalKobo <= 0) {
    throw new Error("A loan needs an amount above zero, in whole kobo.");
  }
  if (!Number.isInteger(termMonths) || termMonths < 1) {
    throw new Error("A loan is repaid over at least one month.");
  }
  if (!Number.isFinite(interestRate) || interestRate < 0) {
    throw new Error("A rate cannot be negative.");
  }

  /* Rounded once, here, so every figure downstream divides from a whole
     number of kobo. */
  const interestKobo = Math.round((principalKobo * interestRate * termMonths) / 12);
  const totalKobo = principalKobo + interestKobo;
  const instalmentKobo = Math.floor(totalKobo / termMonths);

  const first = monthStart(startPeriod);
  const lines: ScheduleLine[] = [];
  let remaining = totalKobo;

  for (let index = 0; index < termMonths; index += 1) {
    const last = index === termMonths - 1;
    const amountKobo = last ? remaining : instalmentKobo;
    remaining -= amountKobo;
    lines.push({
      sequence: index + 1,
      dueDate: addMonths(first, index),
      amountKobo,
    });
  }

  /* The backend asserts this before returning and so does this: a schedule that
     does not sum to what was borrowed is a rounding bug, and the place to find
     out is here rather than in a payment file. */
  const summed = lines.reduce((total, line) => total + line.amountKobo, 0);
  if (summed !== totalKobo) {
    throw new Error(
      `Schedule does not reconcile: lines sum to ${summed}, expected ${totalKobo}.`,
    );
  }

  return {
    principalKobo,
    interestKobo,
    totalKobo,
    instalmentKobo,
    finalInstalmentKobo: lines[lines.length - 1]?.amountKobo ?? instalmentKobo,
    lines,
  };
}

/**
 * The same thing, for a form that is still being filled in.
 *
 * Returns `null` rather than throwing while the inputs are not yet a loan, so a
 * live preview can render nothing instead of an error boundary. Anything that
 * *is* a loan goes through `buildSchedule` unchanged.
 */
export function priceLoan(input: {
  principalKobo: number;
  termMonths: number;
  interestRate?: number;
  startPeriod: string;
}): Schedule | null {
  const { principalKobo, termMonths, interestRate = 0, startPeriod } = input;
  if (!Number.isInteger(principalKobo) || principalKobo <= 0) return null;
  if (!Number.isInteger(termMonths) || termMonths < 1) return null;
  if (!Number.isFinite(interestRate) || interestRate < 0) return null;
  /* An amount that cannot reach a kobo a month is a term to shorten, not a
     schedule to draw. The API says the same thing with a 422. */
  if (Math.floor(principalKobo / termMonths) === 0) return null;
  try {
    return buildSchedule({ principalKobo, termMonths, interestRate, startPeriod });
  } catch {
    return null;
  }
}
