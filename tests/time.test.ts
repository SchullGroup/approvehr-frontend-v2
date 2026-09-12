import { describe, expect, it, vi } from "vitest";
import {
  dayIn,
  daysBetweenIn,
  formatDate,
  formatDateShort,
  formatDateTime,
  formatDateTimeShort,
  formatTime,
  hourIn,
  isValidInstant,
  todayIn,
  weekdayIn,
} from "../src/lib/time";

/**
 * Every date on every screen goes through here.
 *
 * Before this, half the call sites hardcoded UTC and the other half passed no
 * zone at all — which formats in the *viewer's* browser, so two colleagues in
 * different countries read different dates off the same record.
 */
describe("formatting an instant in a company's zone", () => {
  /* 2026-09-11T23:30 UTC is half past midnight on the 12th in Lagos. */
  const lateEvening = "2026-09-11T23:30:00.000Z";

  it("shows the company's day, not UTC's", () => {
    expect(formatDate(lateEvening, "Africa/Lagos")).toBe("12 September 2026");
    expect(formatDate(lateEvening, "UTC")).toBe("11 September 2026");
  });

  it("shows the company's clock", () => {
    expect(formatTime(lateEvening, "Africa/Lagos")).toBe("00:30");
    expect(formatTime(lateEvening, "UTC")).toBe("23:30");
  });

  it("puts the two together", () => {
    expect(formatDateTime(lateEvening, "Africa/Lagos")).toBe(
      "12 September 2026, 00:30",
    );
  });

  it("takes a Date as readily as a string", () => {
    expect(formatDate(new Date(lateEvening), "Africa/Lagos")).toBe(
      "12 September 2026",
    );
  });

  it("renders an em dash rather than Invalid Date", () => {
    /* An absent date is ordinary — a nullable column, a record that has not
       reached that stage. "Invalid Date" on a screen is a bug report. */
    expect(formatDate(null as unknown as string, "Africa/Lagos")).toBe("—");
    expect(formatDate("", "Africa/Lagos")).toBe("—");
    expect(formatDate("not a date", "Africa/Lagos")).toBe("—");
  });
});

/**
 * The primitives underneath the audit trail, the notification inbox, and the
 * dashboard greeting — everywhere a screen has to reason about *which day* an
 * instant falls on, not just print it.
 */
describe("dayIn", () => {
  /* Chosen so all three zones genuinely disagree: half past eleven at night in
     UTC is already the next day in Lagos (UTC+1) and in Auckland (UTC+12 in
     August, before its daylight saving starts). */
  const nearMidnight = "2026-08-19T23:30:00Z";

  it("reads the calendar day the instant falls on, in the given zone", () => {
    expect(dayIn(nearMidnight, "Pacific/Auckland")).toBe("2026-08-20");
    expect(dayIn(nearMidnight, "Africa/Lagos")).toBe("2026-08-20");
    expect(dayIn(nearMidnight, "UTC")).toBe("2026-08-19");
  });

  it("returns null for null, empty and unparseable input", () => {
    expect(dayIn(null, "Africa/Lagos")).toBeNull();
    expect(dayIn("", "Africa/Lagos")).toBeNull();
    expect(dayIn("not-a-date", "Africa/Lagos")).toBeNull();
  });
});

describe("todayIn", () => {
  it("returns a YYYY-MM-DD string", () => {
    expect(todayIn("Africa/Lagos")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("agrees with dayIn(new Date(), timeZone) for the same instant", () => {
    const now = new Date();
    expect(todayIn("Africa/Lagos")).toBe(dayIn(now, "Africa/Lagos"));
  });

  /*
   * Neither case above actually discriminates on the zone parameter: the
   * first only checks the output's shape, and the second compares
   * `todayIn` against a fresh `dayIn(new Date(), ...)` call made with the
   * *same* zone string — an implementation that ignored its argument
   * entirely and read the machine's own clock would still pass both,
   * since both calls would agree with each other trivially.
   *
   * `Pacific/Kiritimati` (UTC+14) and `Pacific/Niue` (UTC−11) are 25 hours
   * apart with no daylight saving on either side, so for almost any real
   * instant — including the one pinned here — they disagree about which
   * calendar day it is. Fixing the clock and asserting literal, independent
   * expected strings is what makes this a genuine test of the parameter
   * rather than of the machine running it.
   */
  it("actually reads the given zone, not the machine's own clock", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-19T12:00:00Z"));
      expect(todayIn("Pacific/Kiritimati")).toBe("2026-08-20");
      expect(todayIn("Pacific/Niue")).toBe("2026-08-19");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("daysBetweenIn", () => {
  it("counts whole calendar days in the zone, not elapsed milliseconds", () => {
    /* One hour apart, and both fall on 19 August in UTC — but Lagos (UTC+1)
       reads the later one as 20 August, so the company's calendar has
       already turned over even though no UTC midnight has passed. */
    const beforeLagosMidnight = "2026-08-19T22:30:00Z";
    const afterLagosMidnight = "2026-08-19T23:30:00Z";

    expect(
      daysBetweenIn(beforeLagosMidnight, afterLagosMidnight, "Africa/Lagos"),
    ).toBe(1);
    expect(daysBetweenIn(beforeLagosMidnight, afterLagosMidnight, "UTC")).toBe(
      0,
    );
  });

  it("is zero for the same calendar day", () => {
    expect(
      daysBetweenIn("2026-08-19T08:00:00Z", "2026-08-19T20:00:00Z", "UTC"),
    ).toBe(0);
  });

  it("counts 2 days across a DST transition, where millisecond maths says 1", () => {
    /* UK clocks go forward on the last Sunday of March — 2026-03-29, at
       01:00 UTC. `2026-03-28T23:30Z` is 23:30 GMT on the 28th; exactly 24
       hours later, `2026-03-29T23:30Z` is already 00:30 BST on the 30th,
       because the clock skipped an hour in between. Elapsed time is
       exactly 24 hours either way — this is the case a `startOfDay`-style
       local-constructor or a bare millisecond division would get wrong. */
    expect(
      daysBetweenIn(
        "2026-03-28T23:30:00Z",
        "2026-03-29T23:30:00Z",
        "Europe/London",
      ),
    ).toBe(2);
  });
});

describe("weekdayIn", () => {
  it("names the weekday an instant falls on, in the given zone", () => {
    /* 19 August 2026 UTC is a Wednesday; 20 August in Lagos (see dayIn above)
       is a Thursday — so this only proves something if the zone is honoured. */
    const nearMidnight = "2026-08-19T23:30:00Z";
    expect(weekdayIn(nearMidnight, "UTC")).toBe("Wednesday");
    expect(weekdayIn(nearMidnight, "Africa/Lagos")).toBe("Thursday");
  });
});

describe("formatDateShort", () => {
  it("renders the short form, for dense logs", () => {
    expect(formatDateShort("2026-08-19T23:30:00Z", "Africa/Lagos")).toBe(
      "20 Aug 2026",
    );
    /* A second zone — "Africa/Lagos" alone is also this machine's own
       system zone, so a regression back to browser-local getters would
       pass that case by coincidence. */
    expect(formatDateShort("2026-08-19T23:30:00Z", "UTC")).toBe("19 Aug 2026");
  });

  /*
   * `en-GB`'s CLDR short month for September is "Sept" (four letters) —
   * the only one of the twelve that isn't three. `lib/audit/language.ts`'s
   * `MONTHS` array (which backs `readableDate`, untouched and byte-identical
   * since it's a calendar-only value) says "Sep" for all twelve, so this
   * function truncates the month part to three characters — see the
   * comment on `shortDateString` in `lib/time.ts` for why, and for the
   * locales that were ruled out. This checks every month against that same
   * `MONTHS` array so the two can never quietly drift apart again.
   */
  it("agrees with lib/audit/language.ts's three-letter month abbreviations, for all twelve months", () => {
    const MONTHS = [
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
    for (let month = 0; month < 12; month++) {
      const iso = new Date(Date.UTC(2026, month, 15)).toISOString();
      expect(formatDateShort(iso, "UTC")).toBe(`15 ${MONTHS[month]} 2026`);
    }
  });

  it("renders an em dash for null, empty and unparseable input", () => {
    expect(formatDateShort(null, "Africa/Lagos")).toBe("—");
    expect(formatDateShort("", "Africa/Lagos")).toBe("—");
    expect(formatDateShort("not-a-date", "Africa/Lagos")).toBe("—");
  });
});

describe("formatDateTimeShort", () => {
  it("renders the short date with the time", () => {
    /* Truncated to three letters, matching lib/audit/language.ts's MONTHS
       — see formatDateShort's tests above for the full twelve-month check
       and lib/time.ts's shortDateString for why. */
    expect(
      formatDateTimeShort("2026-09-11T23:30:00.000Z", "Africa/Lagos"),
    ).toBe("12 Sep 2026, 00:30");
  });

  it("renders an em dash for null, empty and unparseable input", () => {
    expect(formatDateTimeShort(null, "Africa/Lagos")).toBe("—");
    expect(formatDateTimeShort("", "Africa/Lagos")).toBe("—");
    expect(formatDateTimeShort("not-a-date", "Africa/Lagos")).toBe("—");
  });
});

describe("isValidInstant", () => {
  it("is true for a real instant, string or Date", () => {
    expect(isValidInstant("2026-08-19T23:30:00Z")).toBe(true);
    expect(isValidInstant(new Date("2026-08-19T23:30:00Z"))).toBe(true);
  });

  it("is false for null, undefined, empty and unparseable input", () => {
    expect(isValidInstant(null)).toBe(false);
    expect(isValidInstant(undefined)).toBe(false);
    expect(isValidInstant("")).toBe(false);
    expect(isValidInstant("not-a-date")).toBe(false);
  });
});

/**
 * The company's hour, for the dashboard greeting — see `dashboard/header.tsx`.
 * Built the same way `formatTime` is, so a reader in a different zone to the
 * company never gets "Good evening" at the company's breakfast time.
 */
describe("hourIn", () => {
  it("reads the hour an instant falls in, in the given zone", () => {
    /* Half past eleven at night UTC is half past midnight in Lagos. */
    const lateEvening = new Date("2026-09-11T23:30:00.000Z");
    expect(hourIn(lateEvening, "Africa/Lagos")).toBe(0);
    expect(hourIn(lateEvening, "UTC")).toBe(23);
  });
});
