import type {
  ApiSchedule,
  ApiScheduleChange,
  PayComponentApplyMode,
  PayFrequency,
  PaySchedule,
  PayServiceClock,
} from "@/lib/api/pay-components";

/**
 * When an allowance falls due, in words and in the form's own terms.
 *
 * ## What lives here, and what does not
 *
 * The API owns the rules and the wording: it works out the sentence
 * (`summary`), the refusals and the dates, and `POST /pay-components/schedule-preview`
 * hands them back as data. This module is only the translation the form needs
 * either side of that call: **years to months and back** (the API never takes
 * years), the typed strings to a whole schedule, and the one place that decides
 * what to print when there is no schedule at all.
 *
 * It never works out when anything falls due. Two implementations of that is
 * how a screen quotes a month the payroll run does not pay.
 *
 * ## Absent is monthly
 *
 * An allowance with no `schedule` on it (an API that predates schedules, the
 * offline defaults) is paid every month, which is exactly what the default
 * schedule says. So it prints **Monthly**, never a blank: a blank cell reads as
 * missing data, and here it would be wrong.
 */

export const DEFAULT_SCHEDULE: PaySchedule = {
  qualifyingMonths: 0,
  serviceClock: "START_DATE",
  frequency: "MONTHLY",
  intervalMonths: null,
  maxPayments: null,
  durationMonths: null,
};

/** What the Paid column prints for the default, and for no schedule at all. */
export const EVERY_MONTH_TEXT = "Monthly";

/**
 * What goes in the Paid column.
 *
 * The API's own sentence for anything unusual, "Monthly" for the default and for
 * an allowance that has no schedule on it. Never empty.
 */
export function scheduleText(
  schedule: Pick<ApiSchedule, "isEveryMonth" | "summary"> | null | undefined,
): string {
  if (!schedule || schedule.isEveryMonth) return EVERY_MONTH_TEXT;
  return schedule.summary.trim() === ""
    ? EVERY_MONTH_TEXT
    : schedule.summary.trim();
}

/** The six fields and nothing else, so a stored schedule can be compared with a typed one. */
export function scheduleOnly(
  schedule: Partial<PaySchedule> | null | undefined,
): PaySchedule {
  return {
    qualifyingMonths:
      schedule?.qualifyingMonths ?? DEFAULT_SCHEDULE.qualifyingMonths,
    serviceClock: schedule?.serviceClock ?? DEFAULT_SCHEDULE.serviceClock,
    frequency: schedule?.frequency ?? DEFAULT_SCHEDULE.frequency,
    intervalMonths: schedule?.intervalMonths ?? null,
    maxPayments: schedule?.maxPayments ?? null,
    durationMonths: schedule?.durationMonths ?? null,
  };
}

export function sameSchedule(
  a: Partial<PaySchedule> | null | undefined,
  b: Partial<PaySchedule> | null | undefined,
): boolean {
  return JSON.stringify(scheduleOnly(a)) === JSON.stringify(scheduleOnly(b));
}

/** Whether this is anything other than "every month, from the day it is given". */
export function isScheduled(
  schedule: Partial<PaySchedule> | null | undefined,
): boolean {
  if (!schedule) return false;
  return (
    (schedule.qualifyingMonths ?? 0) !== 0 ||
    (schedule.frequency ?? "MONTHLY") !== "MONTHLY" ||
    (schedule.maxPayments ?? null) !== null ||
    (schedule.durationMonths ?? null) !== null ||
    (schedule.serviceClock ?? "START_DATE") !== "START_DATE"
  );
}

/**
 * "a month" or "per payment".
 *
 * The amount on a scheduled allowance is what is paid **each time it falls due**
 * (for a long-service allowance, the lump sum), not a monthly figure. A line that
 * says "₦1,200,000 a month" beside a schedule of every three years is a claim
 * somebody will read as a payroll cost twelve times too large.
 */
export function amountPeriod(
  schedule: Partial<PaySchedule> | null | undefined,
): "a month" | "per payment" {
  return isScheduled(schedule) ? "per payment" : "a month";
}

/* --------------------------------------------------------- years and months */

export type ScheduleUnit = "months" | "years";

export const toMonths = (count: number, unit: ScheduleUnit): number =>
  unit === "years" ? count * 12 : count;

/** 36 months is 3 years; 18 is 18 months; 0 is 0 months. Whole years only. */
export function fromMonths(months: number): {
  count: number;
  unit: ScheduleUnit;
} {
  if (months >= 12 && months % 12 === 0) {
    return { count: months / 12, unit: "years" };
  }
  return { count: months, unit: "months" };
}

/* ------------------------------------------------------------------ a draft */

export type StopKind = "NONE" | "PAYMENTS" | "TIME";

/** The form's state: what was typed, as typed. */
export type ScheduleDraft = {
  clock: PayServiceClock;
  waitCount: string;
  waitUnit: ScheduleUnit;
  frequency: PayFrequency;
  everyCount: string;
  everyUnit: ScheduleUnit;
  stop: StopKind;
  paymentsCount: string;
  timeCount: string;
  timeUnit: ScheduleUnit;
};

export const EMPTY_DRAFT: ScheduleDraft = {
  clock: "START_DATE",
  waitCount: "0",
  waitUnit: "months",
  frequency: "MONTHLY",
  everyCount: "3",
  everyUnit: "months",
  stop: "NONE",
  paymentsCount: "12",
  timeCount: "12",
  timeUnit: "months",
};

/** The form for an existing schedule, or for none. */
export function draftFromSchedule(
  schedule: Partial<PaySchedule> | null | undefined,
): ScheduleDraft {
  if (!schedule) return EMPTY_DRAFT;
  const wait = fromMonths(schedule.qualifyingMonths ?? 0);
  const every =
    schedule.intervalMonths != null
      ? fromMonths(schedule.intervalMonths)
      : { count: 3, unit: "months" as const };
  const time =
    schedule.durationMonths != null
      ? fromMonths(schedule.durationMonths)
      : { count: 12, unit: "months" as const };
  const stop: StopKind =
    schedule.maxPayments != null
      ? "PAYMENTS"
      : schedule.durationMonths != null
        ? "TIME"
        : "NONE";
  return {
    clock: schedule.serviceClock ?? "START_DATE",
    waitCount: String(wait.count),
    waitUnit: wait.unit,
    frequency: schedule.frequency ?? "MONTHLY",
    everyCount: String(every.count),
    everyUnit: every.unit,
    stop,
    paymentsCount: String(schedule.maxPayments ?? 12),
    timeCount: String(time.count),
    timeUnit: time.unit,
  };
}

export type ScheduleProblem = { field: string; message: string };

const WHOLE = /^\d+$/;

function wholeNumber(raw: string): number | null {
  const text = raw.trim();
  return WHOLE.test(text) ? Number(text) : null;
}

/**
 * The schedule to send, or the problems that stop it being one.
 *
 * Only what cannot be sent at all is refused here: a number that is not a whole
 * number. Every rule about what is allowed (an interval of at least 2, a cap on
 * "once", a duration shorter than the gap between payments) is the API's, and it
 * answers as data through `schedule-preview`, so the wording and the rules are
 * written once, in one repo.
 *
 * **All six fields are always sent.** On update the object replaces the stored
 * schedule, and a field left out takes the default: sending only what changed
 * would quietly reset the rest.
 */
export function scheduleFromDraft(
  draft: ScheduleDraft,
  applyMode: PayComponentApplyMode = "OPTIONAL",
): { schedule: PaySchedule | null; problems: ScheduleProblem[] } {
  const problems: ScheduleProblem[] = [];
  const need = (raw: string, field: string, what: string): number => {
    const value = wholeNumber(raw);
    if (value === null) {
      problems.push({
        field,
        message: `Use a whole number for ${what}, like 3 or 12.`,
      });
      return 0;
    }
    return value;
  };

  const waited = toMonths(
    need(draft.waitCount, "schedule.qualifyingMonths", "how long it waits"),
    draft.waitUnit,
  );

  const frequency = draft.frequency;
  const interval =
    frequency === "EVERY_N_MONTHS"
      ? toMonths(
          need(
            draft.everyCount,
            "schedule.intervalMonths",
            "how often it is paid",
          ),
          draft.everyUnit,
        )
      : null;

  /* "Once" stops after one by being once: the API refuses a cap on it. */
  const stops = frequency !== "ONCE" ? draft.stop : "NONE";
  const maxPayments =
    stops === "PAYMENTS"
      ? need(
          draft.paymentsCount,
          "schedule.maxPayments",
          "how many payments there are",
        )
      : null;
  const durationMonths =
    stops === "TIME"
      ? toMonths(
          need(draft.timeCount, "schedule.durationMonths", "how long it lasts"),
          draft.timeUnit,
        )
      : null;

  if (problems.length > 0) return { schedule: null, problems };

  return {
    schedule: {
      qualifyingMonths: waited,
      /* An allowance nobody is assigned has no assignment date to count from. */
      serviceClock:
        applyMode === "PERMANENT" || draft.clock === "START_DATE"
          ? "START_DATE"
          : "ASSIGNMENT_DATE",
      frequency,
      intervalMonths: interval,
      maxPayments,
      durationMonths,
    },
    problems: [],
  };
}

/**
 * What a person's line says about when it is paid, under its name.
 *
 * "From 4 Mar 2023, every month" for an ordinary allowance, as before. For one on
 * a schedule it is the API's own sentence, so the line says "After 3 years of
 * service, then every 3 years" rather than a claim that it is paid monthly.
 */
export function lineWindow(
  from: string,
  to: string | null,
  schedule: Pick<ApiSchedule, "isEveryMonth" | "summary"> | null | undefined,
  fmt: (iso: string) => string,
): string {
  if (to) return `${fmt(from)} to ${fmt(to)}`;
  if (!schedule || schedule.isEveryMonth)
    return `From ${fmt(from)}, every month`;
  return `From ${fmt(from)}. ${scheduleText(schedule)}`;
}

/* ------------------------------------------------------------------ the sentence */

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** `2029-03-01` to `Mar 2029`. A calendar label, read as one: no clock, no zone. */
export function dueMonth(iso: string): string {
  const [year, month] = iso.slice(0, 10).split("-");
  const name = MONTH_NAMES[Number(month) - 1];
  return name && year ? `${name} ${year}` : iso;
}

/** `2023-03-15` to `15 Mar 2023`. A calendar label, read as one. */
export function dayWords(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  const name = MONTH_NAMES[Number(month) - 1];
  return name && year && day ? `${Number(day)} ${name} ${year}` : iso;
}

/** `Mar 2026, Mar 2029 and Mar 2032`. */
export function dueMonths(isos: readonly string[]): string {
  const months = isos.map(dueMonth);
  if (months.length <= 1) return months.join("");
  return `${months.slice(0, -1).join(", ")} and ${months[months.length - 1] ?? ""}`;
}

const FULL_MONTHS = [
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
];

/** `2026-03-01` to `March 2026`. */
function periodWords(iso: string): string {
  const [year, month] = iso.slice(0, 10).split("-");
  const name = FULL_MONTHS[Number(month) - 1];
  return name && year ? `${name} ${year}` : iso;
}

const RUN_STATE: Record<string, string> = {
  DRAFT: "a draft",
  IN_REVIEW: "in review",
};

/**
 * What a saved schedule change reaches, from the API's own answer.
 *
 * Null when it reached nothing open: the edit was recorded, nothing was
 * recalculated, and an approved or paid run is never touched. Otherwise one
 * sentence per open run, saying it will use the new schedule the next time it
 * is calculated, because that is the only moment it changes.
 */
export function openRunsSentence(
  change: Pick<ApiScheduleChange, "openRuns"> | null | undefined,
): string | null {
  const runs = change?.openRuns ?? [];
  if (runs.length === 0) return null;
  const named = runs.map((run) => {
    const month = periodWords(run.period);
    const which = run.sequence > 1 ? ` (run ${String(run.sequence)})` : "";
    const state = RUN_STATE[run.status];
    return `The ${month}${which} payroll${state ? ` is ${state}` : ""}.`;
  });
  return `${named.join(" ")} ${runs.length === 1 ? "It" : "They"} will use the new schedule the next time ${runs.length === 1 ? "it is" : "they are"} calculated.`;
}

/**
 * Said before the save, when anybody is already on the allowance.
 *
 * The API cannot tell whether anything has been paid (a payslip line does not
 * record its component), so the count of people is what there is to warn with.
 * Plain about both halves: it moves when it falls due for all of them, from the
 * next run that has not been prepared, and nothing already paid changes.
 */
export function editWarning(
  assignmentCount: number,
  appliesToEveryone = false,
): string | null {
  if (assignmentCount <= 0 && !appliesToEveryone) return null;
  const who = appliesToEveryone
    ? "It applies to everybody, so changing the schedule moves when it falls due for all of them."
    : `${
        assignmentCount === 1
          ? "One person has been on it."
          : `${String(assignmentCount)} people have been on it.`
      } Changing the schedule moves when it falls due for all of them.`;
  return `${who} It applies from the next run that has not been prepared. Payslips already approved do not change, and the change is recorded.`;
}
