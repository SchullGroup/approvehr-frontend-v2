import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import {
  consentRequired,
  consentStale,
  moduleOff,
  reasonOf,
  teamsOffered,
  type ApiSummary,
} from "@/lib/api/wellness";
import {
  amountText,
  compactCount,
  dayWord,
  entryProblem,
  weekEndingOn,
  weekPoints,
  weekTotals,
  windowText,
} from "@/lib/wellness/format";
import {
  breakProblem,
  intervalsText,
  parseIntervals,
  toPolicyBody,
} from "@/lib/wellness/reminders";

/**
 * The small rules the Wellness screens lean on, said once and checked.
 *
 * None of these is clever. They are the places a screen could say something
 * false with no one noticing: a day with nothing logged drawn as zero, a floor
 * of two accepted by a field, an error read as the wrong kind of refusal.
 */

describe("the week", () => {
  const summary: ApiSummary = {
    from: "2026-10-15",
    to: "2026-10-21",
    days: [
      { day: "2026-10-19", metric: "STEPS", total: 8000 },
      { day: "2026-10-21", metric: "STEPS", total: 4000 },
      { day: "2026-10-21", metric: "WATER_ML", total: 750 },
    ],
  };

  it("is the seven days ending today, oldest first", () => {
    expect(weekEndingOn("2026-10-21")).toEqual([
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
    ]);
  });

  it("crosses a month end without losing a day", () => {
    expect(weekEndingOn("2026-11-02")[0]).toBe("2026-10-27");
  });

  it("draws a day with nothing logged as missing, never as zero", () => {
    const points = weekPoints(summary, "STEPS", weekEndingOn("2026-10-21"));
    expect(points).toHaveLength(7);
    expect(points[0]?.value).toBeNull();
    expect(points[4]?.value).toBe(8000);
    expect(points[6]?.value).toBe(4000);
    expect(points.filter((p) => p.value === 0)).toHaveLength(0);
  });

  it("totals only the metric asked for, and counts the days that have something", () => {
    const days = weekEndingOn("2026-10-21");
    expect(weekTotals(summary, "STEPS", days)).toEqual({
      total: 12000,
      daysLogged: 2,
    });
    expect(weekTotals(summary, "WATER_ML", days)).toEqual({
      total: 750,
      daysLogged: 1,
    });
  });

  it("names the weekday by the calendar, whatever zone the browser is in", () => {
    const labels = weekPoints(summary, "STEPS", weekEndingOn("2026-10-21")).map(
      (p) => p.label,
    );
    /* 21 October 2026 is a Wednesday. */
    expect(labels[6]).toBe("Wed");
    expect(labels[0]).toBe("Thu");
  });

  it("says today and yesterday in words, and anything else as a date", () => {
    expect(dayWord("2026-10-21", "2026-10-21")).toBe("Today");
    expect(dayWord("2026-10-20", "2026-10-21")).toBe("Yesterday");
    expect(dayWord("2026-10-12", "2026-10-21")).toBe("12 Oct");
  });
});

describe("figures", () => {
  it("writes the unit beside the number", () => {
    expect(amountText("WATER_ML", 1250)).toBe("1,250 ml");
    expect(amountText("STEPS", 8000)).toBe("8,000 steps");
  });

  it("shortens only what is too wide for the top of a narrow column", () => {
    expect(compactCount(9_999)).toBe("9,999");
    expect(compactCount(12_300)).toBe("12.3k");
    expect(compactCount(20_000)).toBe("20k");
  });

  it("writes a challenge window, and a one day window as one date", () => {
    expect(windowText("2026-11-03", "2026-11-17")).toBe("3 Nov to 17 Nov");
    expect(windowText("2026-11-03", "2026-11-03")).toBe("3 Nov");
  });
});

describe("an entry before it is sent", () => {
  it("wants a whole number in range, and says which rule it broke", () => {
    expect(entryProblem("WATER_ML", "")).toMatch(/Enter how many ml/);
    expect(entryProblem("WATER_ML", "2.5")).toBe("Use a whole number.");
    expect(entryProblem("WATER_ML", "-5")).toBe("Use a whole number.");
    expect(entryProblem("WATER_ML", "0")).toBe("Enter at least 1.");
    expect(entryProblem("WATER_ML", "3001")).toMatch(/at most 3,000 ml/);
    expect(entryProblem("WATER_ML", "3000")).toBeNull();
    expect(entryProblem("STEPS", "100000")).toBeNull();
    expect(entryProblem("STEPS", "100001")).toMatch(/at most 100,000 steps/);
  });
});

describe("reminder intervals", () => {
  it("reads commas or spaces, and rejects what the API would", () => {
    expect(parseIntervals("15, 30")).toEqual({ ok: true, value: [15, 30] });
    expect(parseIntervals("15 30  60")).toEqual({
      ok: true,
      value: [15, 30, 60],
    });
    expect(parseIntervals("")).toMatchObject({ ok: false });
    expect(parseIntervals("fifteen")).toMatchObject({ ok: false });
    expect(parseIntervals("4")).toMatchObject({ ok: false });
    expect(parseIntervals("241")).toMatchObject({ ok: false });
    expect(parseIntervals("15, 15")).toMatchObject({ ok: false });
    expect(parseIntervals("5,10,15,20,25,30,35")).toMatchObject({ ok: false });
  });

  it("says them as a sentence", () => {
    expect(intervalsText([30, 15])).toBe("15 and 30 minutes");
    expect(intervalsText([60])).toBe("60 minutes");
    expect(intervalsText([15, 30, 60])).toBe("15, 30 and 60 minutes");
  });
});

describe("named breaks", () => {
  const good = { name: "Lunch", startsAt: "13:00", minutes: "60" };

  it("needs a name, a time and a length in range", () => {
    expect(breakProblem(good)).toBeNull();
    expect(breakProblem({ ...good, name: " " })).toMatch(/name/);
    expect(breakProblem({ ...good, startsAt: "" })).toMatch(/start time/);
    expect(breakProblem({ ...good, minutes: "0" })).toMatch(/1 to 240/);
    expect(breakProblem({ ...good, minutes: "241" })).toMatch(/1 to 240/);
  });

  it("builds the body the API wants, with the name trimmed", () => {
    const built = toPolicyBody({
      enabled: true,
      intervalsText: "15, 30",
      breaks: [{ ...good, name: " Lunch " }],
    });
    expect(built).toEqual({
      ok: true,
      value: {
        enabled: true,
        intervals: [15, 30],
        breaks: [{ name: "Lunch", startsAt: "13:00", durationMinutes: 60 }],
      },
    });
  });

  it("stops at the first thing wrong instead of sending half a policy", () => {
    expect(
      toPolicyBody({ enabled: true, intervalsText: "x", breaks: [] }),
    ).toMatchObject({ ok: false });
    expect(
      toPolicyBody({
        enabled: true,
        intervalsText: "15",
        breaks: [{ ...good, name: "" }],
      }),
    ).toMatchObject({ ok: false });
  });
});

describe("reading a refusal", () => {
  const refusal = (
    status: number,
    code: string,
    details?: Record<string, unknown>,
  ) => new ApiError(status, code, "The API's sentence.", details);

  it("knows the module is off, and not by its words", () => {
    const off = refusal(422, "unprocessable", {
      reason: "module_off",
      module: "wellness",
    });
    expect(moduleOff(off)).toBe(true);
    expect(reasonOf(off)).toBe("module_off");
    expect(moduleOff(refusal(422, "unprocessable"))).toBe(false);
    expect(moduleOff(new Error("module_off"))).toBe(false);
  });

  it("knows consent is missing from its own code", () => {
    expect(
      consentRequired(
        refusal(422, "consent_required", {
          reason: "consent_required",
          purpose: "SELF_TRACKING",
          state: "absent",
        }),
      ),
    ).toBe(true);
    expect(consentRequired(refusal(422, "unprocessable"))).toBe(false);
  });

  it("knows the wording is stale", () => {
    expect(
      consentStale(refusal(409, "conflict", { reason: "consent_stale" })),
    ).toBe(true);
    expect(consentStale(refusal(409, "conflict"))).toBe(false);
  });

  it("reads the teams a person may choose from a refusal that names them", () => {
    const teams = [{ id: "t1", name: "Squad", members: 3 }];
    expect(
      teamsOffered(
        refusal(422, "unprocessable", { reason: "team_required", teams }),
      ),
    ).toEqual(teams);
    expect(
      teamsOffered(refusal(422, "unprocessable", { reason: "other" })),
    ).toBeNull();
  });

  it("does not read details that are a list of fields", () => {
    const fields = new ApiError(400, "validation_failed", "Bad.", [
      { field: "value", message: "Too big." },
    ]);
    expect(reasonOf(fields)).toBeNull();
  });
});
