/**
 * The overtime arithmetic, once.
 *
 * A port of `detect` in `approvehr-api/src/modules/overtime/service.ts`, kept
 * pure so the demo can work overtime out from the attendance it already holds
 * rather than pretend to. Same order of operations, same rounding, same
 * decisions — if the two ever disagree, the demo is teaching something the
 * product does not do.
 *
 * Three rules carried across, all three counter-intuitive enough that they are
 * worth stating where somebody will read them:
 *
 * 1. **Overtime is worked out from the clock, never claimed.** There is no
 *    "hours" field anybody can type into, because a figure somebody types is a
 *    figure somebody can round up, and the clock-out is already recorded.
 * 2. **Grace is a threshold, not a deduction.** Past it, the whole overrun is
 *    paid: 40 minutes past a 30-minute grace pays 40 minutes, not 10. Deducting
 *    the grace would pay a 31-minute overrun for one minute.
 * 3. **The daily cap caps, it does not reject.** A clock-out twenty hours late
 *    is somebody who went home without clocking out. The record stays, at the
 *    cap, saying so — paying it and hiding it are both worse than showing it.
 */

export type OvertimeKind = "WEEKDAY" | "WEEKEND" | "PUBLIC_HOLIDAY";

export type OvertimeStatus = "PENDING" | "APPROVED" | "DECLINED" | "PAID";

export type OvertimePolicy = {
  enabled: boolean;
  /** Minutes past the scheduled end before any of it counts. */
  graceMinutes: number;
  /** Nothing beyond this in one day, however late the clock-out. */
  dailyCapMinutes: number;
  weekdayRate: number;
  weekendRate: number;
  holidayRate: number;
  requiresApproval: boolean;
  /** The divisor: hours in a normal working day. */
  hoursPerDay: number;
};

/** The API's own defaults, so an unconfigured company reads the same either way. */
export const DEFAULT_OVERTIME_POLICY: OvertimePolicy = {
  enabled: false,
  graceMinutes: 30,
  dailyCapMinutes: 360,
  weekdayRate: 1.5,
  weekendRate: 2,
  holidayRate: 2,
  requiresApproval: true,
  hoursPerDay: 8,
};

/**
 * What the API's validator accepts. A form that offers more gets a 422, so the
 * inputs are bounded here rather than by guessing.
 */
export const POLICY_LIMITS = {
  graceMinutes: { min: 0, max: 480 },
  dailyCapMinutes: { min: 30, max: 960 },
  rate: { min: 1, max: 5 },
  hoursPerDay: { min: 1, max: 24 },
} as const;

/** Minutes from midnight for an `HH:MM` clock string. */
export function clockMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * What one hour of somebody's time is worth, in kobo.
 *
 * `monthlyGross / workingDays / hoursPerDay`. Both divisors are settings rather
 * than constants because a company on a six-day week values an hour differently
 * from one on five.
 */
export function hourlyRateKobo(
  grossMonthlyKobo: number,
  workingDaysPerMonth: number,
  hoursPerDay: number,
): number {
  const days = Math.max(1, workingDaysPerMonth);
  const hours = Math.max(1, hoursPerDay);
  return Math.round(grossMonthlyKobo / days / hours);
}

export function rateFor(policy: OvertimePolicy, kind: OvertimeKind): number {
  if (kind === "PUBLIC_HOLIDAY") return policy.holidayRate;
  if (kind === "WEEKEND") return policy.weekendRate;
  return policy.weekdayRate;
}

/** Rounded once, at the end, the way the payroll engine does it. */
export function amountKoboFor(
  hourlyKobo: number,
  minutes: number,
  rate: number,
): number {
  return Math.round((hourlyKobo * minutes * rate) / 60);
}

/**
 * Whether a record sits at the daily cap.
 *
 * Inferred, not stored: the API writes `min(overrun, cap)` and keeps no flag, so
 * a day capped from twenty hours and a day that genuinely ran to exactly six are
 * the same row. Both want the same sentence on screen — check the clock-out —
 * which is why inferring it is good enough and worth saying out loud.
 */
export function isAtCap(minutes: number, policy: OvertimePolicy): boolean {
  return minutes >= policy.dailyCapMinutes;
}

export function kindFor(
  isoDate: string,
  workingWeekdays: readonly number[],
  holidays: readonly string[],
): OvertimeKind {
  if (holidays.includes(isoDate)) return "PUBLIC_HOLIDAY";
  const weekday = new Date(`${isoDate}T00:00:00.000Z`).getUTCDay();
  return workingWeekdays.includes(weekday) ? "WEEKDAY" : "WEEKEND";
}

export type DerivedOvertime = {
  employeeId: string;
  /** `YYYY-MM-DD`. */
  onDate: string;
  /** After the cap. What gets paid. */
  minutes: number;
  /** Before the cap. Higher than `minutes` only on a capped day. */
  rawMinutes: number;
  kind: OvertimeKind;
  rate: number;
  hourlyRateKobo: number;
  amountKobo: number;
};

export type DeriveInput = {
  /** Attendance. A day with no clock-out cannot produce overtime. */
  entries: readonly {
    employeeId: string;
    date: string;
    clockIn?: string | undefined;
    clockOut?: string | undefined;
  }[];
  /** Gross monthly pay in kobo, by employee id. Anybody missing is skipped. */
  grossMonthlyKobo: ReadonlyMap<string, number>;
  policy: OvertimePolicy;
  /** The office's scheduled end, `HH:MM`. */
  shiftEnd: string;
  /** A rostered person's own end, `HH:MM`, keyed `employeeId:YYYY-MM-DD`. */
  rosterEnd?: ReadonlyMap<string, string>;
  /** 0 is Sunday. Days outside this list pay the weekend rate. */
  workingWeekdays: readonly number[];
  holidays: readonly string[];
  workingDaysPerMonth: number;
};

/**
 * Every day of overtime in the entries given, valued.
 *
 * Order matters and is the API's: scheduled end, then the grace threshold, then
 * the cap, then the multiplier, then one rounding at the end.
 */
export function deriveOvertime(input: DeriveInput): DerivedOvertime[] {
  const {
    entries,
    grossMonthlyKobo,
    policy,
    shiftEnd,
    rosterEnd,
    workingWeekdays,
    holidays,
    workingDaysPerMonth,
  } = input;

  const officeEnd = clockMinutes(shiftEnd);
  const found: DerivedOvertime[] = [];

  for (const entry of entries) {
    if (!entry.clockIn || !entry.clockOut) continue;

    const gross = grossMonthlyKobo.get(entry.employeeId);
    if (gross === undefined) continue;

    /* The roster's end if they were rostered, the office's otherwise. */
    const rostered = rosterEnd?.get(`${entry.employeeId}:${entry.date}`);
    const scheduledEnd =
      rostered === undefined ? officeEnd : clockMinutes(rostered);

    const beyond = clockMinutes(entry.clockOut) - scheduledEnd;
    if (beyond <= policy.graceMinutes) continue;

    const minutes = Math.min(beyond, policy.dailyCapMinutes);
    const kind = kindFor(entry.date, workingWeekdays, holidays);
    const rate = rateFor(policy, kind);
    const hourly = hourlyRateKobo(gross, workingDaysPerMonth, policy.hoursPerDay);

    found.push({
      employeeId: entry.employeeId,
      onDate: entry.date,
      minutes,
      rawMinutes: beyond,
      kind,
      rate,
      hourlyRateKobo: hourly,
      amountKobo: amountKoboFor(hourly, minutes, rate),
    });
  }

  return found;
}
