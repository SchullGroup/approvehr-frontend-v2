import { describe, expect, it } from "vitest";
import {
  dayHeading,
  dayKey,
  fullStamp,
  timeLabel,
} from "../src/lib/audit/language";

/**
 * `lib/audit/language.ts`'s clock section reimplemented on `lib/time.ts`'s
 * zone-aware primitives (task 7c, step 2) — these assert it actually threads
 * the given `timeZone` through, rather than reading the machine's own clock.
 *
 * The sandbox this suite runs in defaults to `Africa/Lagos`, which is also
 * this app's fallback zone — so a test that only ever passes `"Africa/Lagos"`
 * would pass just as well against the *unconverted* code, which read the
 * machine's local getters and got the right answer purely by coincidence.
 * Every case below also asserts against `"UTC"`, which the machine's clock
 * disagrees with, so a regression back to local getters shows up as a
 * failure here rather than passing silently.
 */
describe("dayKey", () => {
  it("keys an instant by the company's calendar day, not UTC's", () => {
    /* 2026-09-11T23:30 UTC is half past midnight on the 12th in Lagos. */
    const iso = "2026-09-11T23:30:00.000Z";
    expect(dayKey(iso, "Africa/Lagos")).toBe("2026-09-12");
    expect(dayKey(iso, "UTC")).toBe("2026-09-11");
  });

  it("echoes the input rather than producing NaN-NaN-NaN on a bad date", () => {
    expect(dayKey("not-a-date", "UTC")).toBe("not-a-date");
  });
});

describe("fullStamp", () => {
  it("renders the exact moment in the company's zone", () => {
    const iso = "2026-09-11T23:30:00.000Z";
    /* "Sep", not "Sept" — see fullStamp's fix round 1 notes: en-GB's raw
       CLDR short month for September is four letters, the only one of the
       twelve that differs from lib/audit/language.ts's MONTHS, and
       lib/time.ts's formatDateTimeShort now truncates it to three. */
    expect(fullStamp(iso, "Africa/Lagos")).toBe("12 Sep 2026, 00:30");
    expect(fullStamp(iso, "UTC")).toBe("11 Sep 2026, 23:30");
  });

  it("echoes the input on a bad date rather than throwing", () => {
    expect(fullStamp("not-a-date", "UTC")).toBe("not-a-date");
  });
});

describe("dayHeading", () => {
  it("crosses into 'Yesterday' at the company's midnight, not UTC's", () => {
    /* iso is already 20 August in Lagos; now is 20 August in both zones,
       an hour later. Zoned to Lagos that is the same day ("Today"); zoned
       to UTC, iso is still 19 August, one calendar day back ("Yesterday"). */
    const iso = "2026-08-19T23:30:00Z";
    const now = new Date("2026-08-20T00:30:00Z");
    expect(dayHeading(iso, now, "Africa/Lagos")).toBe("Today");
    expect(dayHeading(iso, now, "UTC")).toBe("Yesterday");
  });

  it("names the weekday inside the last week, in the company's zone", () => {
    /* 19 August 2026 is a Wednesday in UTC; the same instant is already
       Thursday 20 August in Lagos. Four days later in each zone. */
    const iso = "2026-08-19T23:30:00Z";
    const now = new Date("2026-08-24T12:00:00Z");
    expect(dayHeading(iso, now, "Africa/Lagos")).toBe("Thursday");
    expect(dayHeading(iso, now, "UTC")).toBe("Wednesday");
  });

  it("falls back to the short date beyond a week, in the company's zone", () => {
    /* 18-19 calendar days apart either way, well past the weekday-name
       cutoff — and the two zones still land on different calendar days
       for both `iso` and `now`, so a browser-local implementation would
       not coincidentally produce the same fallback string in both cases. */
    const iso = "2026-08-01T23:30:00Z";
    const now = new Date("2026-08-20T12:00:00Z");
    expect(dayHeading(iso, now, "Africa/Lagos")).toBe("2 Aug 2026");
    expect(dayHeading(iso, now, "UTC")).toBe("1 Aug 2026");
  });

  it("echoes the input on a bad date rather than throwing", () => {
    expect(dayHeading("not-a-date", new Date(), "UTC")).toBe("not-a-date");
  });
});

describe("timeLabel", () => {
  it("falls back to the clock time after a day, in the company's zone", () => {
    const iso = "2026-08-19T23:30:00Z";
    const now = new Date("2026-08-21T01:30:00Z"); // 26 hours later
    expect(timeLabel(iso, now, "Africa/Lagos")).toBe("00:30");
    expect(timeLabel(iso, now, "UTC")).toBe("23:30");
  });

  it("is still the relative phrasing, zone-independent, inside a day", () => {
    const iso = "2026-08-19T23:30:00Z";
    const now = new Date("2026-08-19T23:45:00Z"); // 15 minutes later
    expect(timeLabel(iso, now, "Africa/Lagos")).toBe("15 min ago");
    expect(timeLabel(iso, now, "UTC")).toBe("15 min ago");
  });
});
