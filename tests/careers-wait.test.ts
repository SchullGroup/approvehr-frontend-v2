import { describe, expect, it } from "vitest";
import { parseRetryAfter, waitPhrase } from "@/lib/marketing/careers";

/**
 * "Try again in about two minutes", worked out from what the API said.
 *
 * `Retry-After` is either a count of seconds or an HTTP date and both are legal,
 * so both are read. Anything that is not a usable wait is `null` rather than a
 * guess, because a page that says "in 0 minutes" sends somebody straight back
 * into the limiter.
 */

describe("Retry-After", () => {
  it("reads a count of seconds", () => {
    expect(parseRetryAfter("120")).toBe(120);
    expect(parseRetryAfter(" 45 ")).toBe(45);
  });

  it("reads an HTTP date as the distance from now", () => {
    const now = Date.parse("2026-10-15T12:00:00Z");
    expect(parseRetryAfter("Thu, 15 Oct 2026 12:02:30 GMT", now)).toBe(150);
  });

  it("rounds a fraction of a second up, so nobody retries early", () => {
    const now = Date.parse("2026-10-15T12:00:00.400Z");
    expect(parseRetryAfter("Thu, 15 Oct 2026 12:00:10 GMT", now)).toBe(10);
  });

  it.each([
    ["nothing", null],
    ["an empty value", ""],
    ["zero", "0"],
    ["a negative", "-5"],
    ["nonsense", "soon"],
    ["a date already past", "Thu, 15 Oct 2026 11:00:00 GMT"],
  ])("gives no wait for %s", (_name, header) => {
    const now = Date.parse("2026-10-15T12:00:00Z");
    expect(parseRetryAfter(header, now)).toBeNull();
  });
});

describe("how long to wait, in words", () => {
  it.each([
    [null, "a few minutes"],
    [0, "a few minutes"],
    [20, "under a minute"],
    [59, "under a minute"],
    [60, "about 1 minute"],
    [61, "about 2 minutes"],
    [130, "about 3 minutes"],
    [3_540, "about 59 minutes"],
    [3_600, "about 1 hour"],
    [3_601, "about 2 hours"],
    [7_200, "about 2 hours"],
  ])("%s seconds is %s", (seconds, words) => {
    expect(waitPhrase(seconds)).toBe(words);
  });
});
