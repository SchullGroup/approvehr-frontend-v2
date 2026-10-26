import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCHEDULE,
  EMPTY_DRAFT,
  amountPeriod,
  dayWords,
  draftFromSchedule,
  dueMonth,
  dueMonths,
  editWarning,
  fromMonths,
  isScheduled,
  lineWindow,
  openRunsSentence,
  sameSchedule,
  scheduleFromDraft,
  scheduleOnly,
  scheduleText,
  toMonths,
} from "@/lib/pay/schedule";
import { amountLine, assignmentLine } from "@/lib/pay/flags";
import type { ApiSchedule } from "@/lib/api/pay-components";

/**
 * When an allowance falls due, as the form and the table say it.
 *
 * What these protect is what the API does not do for the screen: the API owns
 * the rules and the wording, so what is checked here is the translation either
 * side of it (years to months and back, six fields every time) and the one place
 * that decides what to print when there is no schedule at all, which must never
 * be a blank.
 */

const longService: ApiSchedule = {
  qualifyingMonths: 36,
  serviceClock: "START_DATE",
  frequency: "EVERY_N_MONTHS",
  intervalMonths: 36,
  maxPayments: null,
  durationMonths: null,
  isEveryMonth: false,
  summary: "After 3 years of service, then every 3 years",
};

describe("what the Paid column prints", () => {
  it("is Monthly for an allowance that has no schedule on it, never blank", () => {
    expect(scheduleText(undefined)).toBe("Monthly");
    expect(scheduleText(null)).toBe("Monthly");
  });

  it("is Monthly for the default, whatever sentence the API sent with it", () => {
    expect(scheduleText({ isEveryMonth: true, summary: "Every month" })).toBe(
      "Monthly",
    );
  });

  it("is the API's own sentence for anything unusual, as it was sent", () => {
    expect(scheduleText(longService)).toBe(
      "After 3 years of service, then every 3 years",
    );
  });

  it("is Monthly rather than empty when the API sends a blank sentence", () => {
    expect(scheduleText({ isEveryMonth: false, summary: "  " })).toBe(
      "Monthly",
    );
  });
});

describe("years and months", () => {
  it("turns years into months on the way out and whole years back on the way in", () => {
    expect(toMonths(3, "years")).toBe(36);
    expect(toMonths(18, "months")).toBe(18);
    expect(fromMonths(36)).toEqual({ count: 3, unit: "years" });
    expect(fromMonths(18)).toEqual({ count: 18, unit: "months" });
    expect(fromMonths(0)).toEqual({ count: 0, unit: "months" });
    expect(fromMonths(12)).toEqual({ count: 1, unit: "years" });
  });
});

describe("the form's draft", () => {
  it("opens on the default for no schedule, and on the stored values for one", () => {
    expect(draftFromSchedule(undefined)).toEqual(EMPTY_DRAFT);
    const draft = draftFromSchedule(longService);
    expect(draft).toMatchObject({
      clock: "START_DATE",
      waitCount: "3",
      waitUnit: "years",
      frequency: "EVERY_N_MONTHS",
      everyCount: "3",
      everyUnit: "years",
      stop: "NONE",
    });
  });

  it("opens on the stop that is set", () => {
    expect(
      draftFromSchedule({ ...DEFAULT_SCHEDULE, maxPayments: 4 }).stop,
    ).toBe("PAYMENTS");
    expect(
      draftFromSchedule({ ...DEFAULT_SCHEDULE, durationMonths: 24 }),
    ).toMatchObject({ stop: "TIME", timeCount: "2", timeUnit: "years" });
  });

  it("sends all six fields every time, in months", () => {
    const { schedule, problems } = scheduleFromDraft(
      draftFromSchedule(longService),
    );
    expect(problems).toEqual([]);
    expect(schedule).toEqual({
      qualifyingMonths: 36,
      serviceClock: "START_DATE",
      frequency: "EVERY_N_MONTHS",
      intervalMonths: 36,
      maxPayments: null,
      durationMonths: null,
    });
    expect(Object.keys(schedule ?? {})).toHaveLength(6);
  });

  it("sends the default, in full, for a form that was never touched", () => {
    expect(scheduleFromDraft(EMPTY_DRAFT).schedule).toEqual(DEFAULT_SCHEDULE);
  });

  it("carries a cap on payments, or on time, and never both", () => {
    const base = { ...EMPTY_DRAFT, frequency: "MONTHLY" as const };
    expect(
      scheduleFromDraft({ ...base, stop: "PAYMENTS", paymentsCount: "6" })
        .schedule,
    ).toMatchObject({ maxPayments: 6, durationMonths: null });
    expect(
      scheduleFromDraft({
        ...base,
        stop: "TIME",
        timeCount: "2",
        timeUnit: "years",
      }).schedule,
    ).toMatchObject({ maxPayments: null, durationMonths: 24 });
  });

  it("leaves a cap off 'once', which the API refuses", () => {
    expect(
      scheduleFromDraft({
        ...EMPTY_DRAFT,
        frequency: "ONCE",
        stop: "PAYMENTS",
        paymentsCount: "3",
      }).schedule,
    ).toMatchObject({
      frequency: "ONCE",
      intervalMonths: null,
      maxPayments: null,
      durationMonths: null,
    });
  });

  it("counts an allowance that applies to everyone from the start date, which has no assignment date", () => {
    const draft = { ...EMPTY_DRAFT, clock: "ASSIGNMENT_DATE" as const };
    expect(scheduleFromDraft(draft, "OPTIONAL").schedule?.serviceClock).toBe(
      "ASSIGNMENT_DATE",
    );
    expect(scheduleFromDraft(draft, "PERMANENT").schedule?.serviceClock).toBe(
      "START_DATE",
    );
  });

  it("names a number that cannot be sent, at its own field, and sends nothing", () => {
    const { schedule, problems } = scheduleFromDraft({
      ...EMPTY_DRAFT,
      waitCount: "three",
      frequency: "EVERY_N_MONTHS",
      everyCount: "1.5",
    });
    expect(schedule).toBeNull();
    expect(problems.map((problem) => problem.field)).toEqual([
      "schedule.qualifyingMonths",
      "schedule.intervalMonths",
    ]);
  });

  it("leaves every other rule to the API, so a rule is written once", () => {
    /* An interval of 1 is the API's to refuse ("every month is MONTHLY"). */
    const { schedule, problems } = scheduleFromDraft({
      ...EMPTY_DRAFT,
      frequency: "EVERY_N_MONTHS",
      everyCount: "1",
    });
    expect(problems).toEqual([]);
    expect(schedule?.intervalMonths).toBe(1);
  });
});

describe("comparing a stored schedule with a typed one", () => {
  it("ignores the API's sentence and the extra fields it carries", () => {
    expect(sameSchedule(longService, scheduleOnly(longService))).toBe(true);
  });

  it("reads no schedule as the default", () => {
    expect(sameSchedule(undefined, DEFAULT_SCHEDULE)).toBe(true);
    expect(sameSchedule(undefined, longService)).toBe(false);
  });

  it("treats anything but the default as scheduled", () => {
    expect(isScheduled(undefined)).toBe(false);
    expect(isScheduled(DEFAULT_SCHEDULE)).toBe(false);
    expect(isScheduled({ ...DEFAULT_SCHEDULE, qualifyingMonths: 12 })).toBe(
      true,
    );
    expect(isScheduled({ ...DEFAULT_SCHEDULE, maxPayments: 3 })).toBe(true);
  });
});

describe("the amount is per payment once it is scheduled", () => {
  it("says a month for the default and for no schedule", () => {
    expect(amountPeriod(undefined)).toBe("a month");
    expect(amountPeriod(DEFAULT_SCHEDULE)).toBe("a month");
  });

  it("says per payment otherwise, in the library and on a person's line", () => {
    expect(amountPeriod(longService)).toBe("per payment");
    expect(
      amountLine({
        basis: "FIXED",
        defaultAmountKobo: 120_000_000,
        defaultRate: null,
        schedule: longService,
      }),
    ).toBe("₦1,200,000.00 per payment");
    expect(
      amountLine({
        basis: "FIXED",
        defaultAmountKobo: 5_000_000,
        defaultRate: null,
      }),
    ).toBe("₦50,000.00 a month");
    expect(
      assignmentLine({
        basis: "FIXED",
        amountKobo: 120_000_000,
        rate: null,
        fromDefault: false,
        schedule: longService,
      }),
    ).toBe("₦1,200,000.00 per payment");
  });
});

describe("dates, as calendar labels", () => {
  it("prints a pay month and a day without a clock or a zone", () => {
    expect(dueMonth("2029-03-01")).toBe("Mar 2029");
    expect(dayWords("2023-03-15")).toBe("15 Mar 2023");
    expect(dueMonths(["2026-03-01"])).toBe("Mar 2026");
    expect(dueMonths(["2026-03-01", "2029-03-01", "2032-03-01"])).toBe(
      "Mar 2026, Mar 2029 and Mar 2032",
    );
    expect(dueMonths([])).toBe("");
  });

  it("prints a line's window as before for an ordinary allowance, and the API's sentence for a scheduled one", () => {
    const fmt = (iso: string) => iso;
    expect(lineWindow("2026-01-01", null, undefined, fmt)).toBe(
      "From 2026-01-01, every month",
    );
    expect(lineWindow("2026-01-01", "2026-06-30", longService, fmt)).toBe(
      "2026-01-01 to 2026-06-30",
    );
    expect(lineWindow("2026-01-01", null, longService, fmt)).toBe(
      "From 2026-01-01. After 3 years of service, then every 3 years",
    );
  });
});

describe("what saving a change says", () => {
  it("names the open payrolls, and says nothing when it reached none", () => {
    expect(openRunsSentence(null)).toBeNull();
    expect(openRunsSentence({ openRuns: [] })).toBeNull();
    expect(
      openRunsSentence({
        openRuns: [
          { id: "r1", period: "2026-03-01", sequence: 1, status: "IN_REVIEW" },
        ],
      }),
    ).toBe(
      "The March 2026 payroll is in review. It will use the new schedule the next time it is calculated.",
    );
  });

  it("says each of several, and which run of the month", () => {
    const sentence = openRunsSentence({
      openRuns: [
        { id: "r1", period: "2026-03-01", sequence: 1, status: "DRAFT" },
        { id: "r2", period: "2026-03-01", sequence: 2, status: "IN_REVIEW" },
      ],
    });
    expect(sentence).toContain("The March 2026 payroll is a draft.");
    expect(sentence).toContain("The March 2026 (run 2) payroll is in review.");
    expect(sentence).toContain("They will use the new schedule");
  });

  it("warns before the save only when somebody is on it, and says history does not change", () => {
    expect(editWarning(0)).toBeNull();
    expect(editWarning(1)).toContain("One person has been on it.");
    expect(editWarning(12)).toContain("12 people have been on it.");
    expect(editWarning(12)).toContain("next run that has not been prepared");
    expect(editWarning(12)).toContain("do not change");
    /* An allowance that applies to everyone has nobody assigned and everyone on it. */
    expect(editWarning(0, true)).toContain("applies to everybody");
  });
});
