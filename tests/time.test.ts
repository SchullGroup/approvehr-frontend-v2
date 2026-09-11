import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatTime } from "../src/lib/time";

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
