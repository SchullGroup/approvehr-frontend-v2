import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiSpecialDay, ApiWorkSchedule } from "@/lib/api/attendance";
import {
  endsAfterStart,
  orderSpecialDays,
  scheduleAudience,
  specialDayHours,
  specialDayWho,
  summariseDays,
} from "@/lib/work-schedules";

/**
 * Schedules and special days on the wire, and the words for them.
 *
 * The request helper is mocked the way `sms-api.test.ts` does it, so what is
 * pinned here is the path, the method and the body: the contract with the API,
 * which is the half of this feature the screen cannot see.
 */

const request = vi.fn();
vi.mock("@/lib/api/client", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...real, request: (...args: unknown[]) => request(...args) };
});

const { attendanceApi, expectedHours } = await import("@/lib/api/attendance");

beforeEach(() => {
  request.mockReset().mockResolvedValue(undefined);
});

const day = (weekday: number, start = "08:00", end = "17:00") => ({
  weekday,
  start,
  end,
});

describe("schedules", () => {
  it("reads the list from /attendance/schedules", async () => {
    const signal = new AbortController().signal;
    await attendanceApi.schedules(signal);
    expect(request).toHaveBeenCalledWith("/attendance/schedules", { signal });
  });

  it("creates with a POST and the body as an object, not a string", async () => {
    const body = {
      name: "Production",
      days: [day(1), day(6, "07:30", "14:00")],
      departmentIds: ["d1"],
      employeeIds: ["e1", "e2"],
    };
    await attendanceApi.createSchedule(body);
    expect(request).toHaveBeenCalledWith("/attendance/schedules", {
      method: "POST",
      body,
    });
  });

  it("changes with a PATCH on the id, sending the sets it was given", async () => {
    await attendanceApi.updateSchedule("s1", {
      employeeIds: [],
      departmentIds: ["d2"],
    });
    expect(request).toHaveBeenCalledWith("/attendance/schedules/s1", {
      method: "PATCH",
      body: { employeeIds: [], departmentIds: ["d2"] },
    });
  });

  it("deletes with a DELETE on the id", async () => {
    await attendanceApi.deleteSchedule("s1");
    expect(request).toHaveBeenCalledWith("/attendance/schedules/s1", {
      method: "DELETE",
    });
  });
});

describe("special days", () => {
  it("reads every day when no dates are given, and a window when they are", async () => {
    await attendanceApi.specialDays();
    expect(request).toHaveBeenLastCalledWith("/attendance/special-days", {
      query: { from: undefined, to: undefined },
    });
    await attendanceApi.specialDays({ from: "2026-12-01", to: "2026-12-31" });
    expect(request).toHaveBeenLastCalledWith("/attendance/special-days", {
      query: { from: "2026-12-01", to: "2026-12-31" },
    });
  });

  it("creates a day off with neither hours nor an id", async () => {
    const body = { date: "2026-12-26", working: false };
    await attendanceApi.createSpecialDay(body);
    expect(request).toHaveBeenCalledWith("/attendance/special-days", {
      method: "POST",
      body,
    });
  });

  it("changes and deletes by id", async () => {
    await attendanceApi.updateSpecialDay("x1", {
      working: true,
      start: "07:30",
      end: "12:00",
    });
    expect(request).toHaveBeenLastCalledWith("/attendance/special-days/x1", {
      method: "PATCH",
      body: { working: true, start: "07:30", end: "12:00" },
    });
    await attendanceApi.deleteSpecialDay("x1");
    expect(request).toHaveBeenLastCalledWith("/attendance/special-days/x1", {
      method: "DELETE",
    });
  });
});

describe("expectedHours", () => {
  const policy = { shiftStart: "08:00", shiftEnd: "17:00" };

  it("is the person's own hours when the row carries them", () => {
    expect(
      expectedHours(policy, { expectedStart: "07:30", expectedEnd: "14:00" }),
    ).toEqual({ start: "07:30", end: "14:00" });
  });

  it("is the company's when the row says nothing, which is every older API", () => {
    expect(expectedHours(policy, {})).toEqual({ start: "08:00", end: "17:00" });
    expect(expectedHours(policy, undefined)).toEqual({
      start: "08:00",
      end: "17:00",
    });
    expect(
      expectedHours(policy, { expectedStart: null, expectedEnd: null }),
    ).toEqual({ start: "08:00", end: "17:00" });
  });

  it("reads each end on its own", () => {
    expect(expectedHours(policy, { expectedStart: "07:30" })).toEqual({
      start: "07:30",
      end: "17:00",
    });
  });
});

describe("summariseDays", () => {
  it("folds neighbouring days with the same hours into a range", () => {
    expect(
      summariseDays([
        day(1),
        day(2),
        day(3),
        day(4),
        day(5),
        day(6, "07:30", "14:00"),
      ]),
    ).toBe("Mon–Fri 08:00–17:00 · Sat 07:30–14:00");
  });

  it("does not fold across a gap or a change of hours", () => {
    expect(
      summariseDays([day(1), day(2, "09:00", "17:00"), day(4), day(5)]),
    ).toBe("Mon 08:00–17:00 · Tue 09:00–17:00 · Thu–Fri 08:00–17:00");
  });

  it("is order-independent and says so plainly when no day is on", () => {
    expect(summariseDays([day(6, "07:30", "14:00"), day(1)])).toBe(
      "Mon 08:00–17:00 · Sat 07:30–14:00",
    );
    expect(summariseDays([])).toBe("No working days");
  });
});

describe("scheduleAudience", () => {
  const base: Pick<ApiWorkSchedule, "departments" | "people"> = {
    departments: [],
    people: [],
  };
  const person = (id: string) => ({ id, name: id, departmentId: null });

  it("names the department and counts the people", () => {
    expect(
      scheduleAudience({
        departments: [{ id: "d1", name: "Production" }],
        people: [person("a"), person("b")],
      }),
    ).toBe("Production · 2 people");
  });

  it("is singular for one person, and a count past two departments", () => {
    expect(scheduleAudience({ ...base, people: [person("a")] })).toBe(
      "1 person",
    );
    expect(
      scheduleAudience({
        ...base,
        departments: [
          { id: "1", name: "A" },
          { id: "2", name: "B" },
          { id: "3", name: "C" },
        ],
      }),
    ).toBe("3 departments");
  });

  it("is quiet about a schedule nobody is on yet", () => {
    expect(scheduleAudience(base)).toBe("Nobody yet");
  });
});

describe("special day words", () => {
  const special = (over: Partial<ApiSpecialDay>): ApiSpecialDay => ({
    id: "x",
    date: "2026-12-05",
    scope: "COMPANY",
    departmentId: null,
    departmentName: null,
    employeeId: null,
    employeeName: null,
    working: false,
    start: null,
    end: null,
    note: null,
    ...over,
  });

  it("says who, by scope", () => {
    expect(specialDayWho(special({}))).toBe("Everybody");
    expect(
      specialDayWho(
        special({
          scope: "DEPARTMENT",
          departmentId: "d",
          departmentName: "Production",
        }),
      ),
    ).toBe("Production");
    expect(
      specialDayWho(
        special({ scope: "PERSON", employeeId: "e", employeeName: "Ada Obi" }),
      ),
    ).toBe("Ada Obi");
  });

  it("says Off, or the hours", () => {
    expect(specialDayHours(special({}))).toBe("Off");
    expect(
      specialDayHours(special({ working: true, start: "07:30", end: "12:00" })),
    ).toBe("07:30–12:00");
  });

  it("puts upcoming days first, soonest at the top, then earlier ones, latest first", () => {
    const ordered = orderSpecialDays(
      [
        special({ id: "past-old", date: "2026-10-01" }),
        special({ id: "later", date: "2026-12-20" }),
        special({ id: "past-new", date: "2026-11-20" }),
        special({ id: "today", date: "2026-11-27" }),
        special({ id: "soon", date: "2026-12-05" }),
      ],
      "2026-11-27",
    ).map((d) => d.id);
    expect(ordered).toEqual(["today", "soon", "later", "past-new", "past-old"]);
  });
});

describe("endsAfterStart", () => {
  it("needs a later end, and two real times", () => {
    expect(endsAfterStart("07:30", "14:00")).toBe(true);
    expect(endsAfterStart("14:00", "07:30")).toBe(false);
    expect(endsAfterStart("08:00", "08:00")).toBe(false);
    expect(endsAfterStart("", "14:00")).toBe(false);
    expect(endsAfterStart("25:00", "26:00")).toBe(false);
  });
});
