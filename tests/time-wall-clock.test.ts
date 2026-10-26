import { describe, expect, it } from "vitest";
import { instantFromWall, wallClockIn, zoneLabel } from "@/lib/time";

/**
 * A time typed into a form is on the company's clock.
 *
 * "10:00" booked from a laptop in London and from one in Lagos has to be the same
 * moment, so the instant is made from the company's zone and never from the browser's.
 * These hold that conversion, both ways, including the two hours a year a clock lies.
 */

describe("a wall time on the company's clock", () => {
  it("is the instant it names in Lagos, which has no daylight saving", () => {
    expect(instantFromWall("2026-10-20", "10:00", "Africa/Lagos")).toBe(
      "2026-10-20T09:00:00.000Z",
    );
    expect(instantFromWall("2026-01-05", "00:30", "Africa/Lagos")).toBe(
      "2026-01-04T23:30:00.000Z",
    );
  });

  it("reads back as the same day and time", () => {
    const iso = instantFromWall("2026-10-20", "10:00", "Africa/Lagos") ?? "";
    expect(wallClockIn(iso, "Africa/Lagos")).toEqual({
      day: "2026-10-20",
      time: "10:00",
    });
    /* The same instant on another company's clock is another wall time. */
    expect(wallClockIn(iso, "Africa/Nairobi")).toEqual({
      day: "2026-10-20",
      time: "12:00",
    });
  });

  it("follows a zone that changes its clock", () => {
    /* London is on BST (UTC+1) in July and GMT in January. */
    expect(instantFromWall("2026-07-01", "09:00", "Europe/London")).toBe(
      "2026-07-01T08:00:00.000Z",
    );
    expect(instantFromWall("2026-01-15", "09:00", "Europe/London")).toBe(
      "2026-01-15T09:00:00.000Z",
    );
  });

  it("refuses a time the zone skips, instead of booking a different one", () => {
    /* 01:30 on 29 March 2026 does not exist in London: the clock goes 01:00 to 02:00. */
    expect(instantFromWall("2026-03-29", "01:30", "Europe/London")).toBeNull();
  });

  it("refuses anything that is not a real day and time", () => {
    for (const [day, time] of [
      ["", "10:00"],
      ["2026-10-20", ""],
      ["2026-13-01", "10:00"],
      ["2026-02-31", "10:00"],
      ["2026-10-20", "25:00"],
      ["2026-10-20", "10:60"],
      ["20 Oct 2026", "10:00"],
    ] as const) {
      expect(
        instantFromWall(day, time, "Africa/Lagos"),
        `${day} ${time}`,
      ).toBeNull();
    }
  });

  it("reads midnight as 00:00, never 24:00", () => {
    expect(wallClockIn("2026-10-19T23:00:00.000Z", "Africa/Lagos")).toEqual({
      day: "2026-10-20",
      time: "00:00",
    });
  });

  it("reads nothing from an unparseable instant", () => {
    expect(wallClockIn("not a date", "Africa/Lagos")).toBeNull();
    expect(wallClockIn(null, "Africa/Lagos")).toBeNull();
  });
});

describe("naming the zone beside a time", () => {
  it("says the city and its short name for the zones this product's companies are in", () => {
    expect(zoneLabel("Africa/Lagos")).toBe("Lagos time (WAT)");
    expect(zoneLabel("Africa/Nairobi")).toBe("Nairobi time (EAT)");
    expect(zoneLabel("Africa/Johannesburg")).toBe("Johannesburg time (SAST)");
    expect(zoneLabel("UTC")).toBe("UTC");
  });

  it("falls back to the browser's own short name for a zone it has not been told", () => {
    expect(zoneLabel("Asia/Kolkata")).toMatch(/^Kolkata time \(.+\)$/);
  });
});
