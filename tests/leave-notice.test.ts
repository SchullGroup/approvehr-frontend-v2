import { describe, expect, it } from "vitest";
import { noticeLine } from "@/lib/leave-notice";

/**
 * A type's notice setting, said against the dates somebody typed. Guidance, not
 * a gate: nothing here refuses, and a type that asks for none says nothing.
 */
const TZ = "Africa/Lagos";
const base = {
  typeName: "Annual",
  minNoticeDays: 7,
  today: "2026-11-06",
  timeZone: TZ,
};

describe("noticeLine", () => {
  it("says what the type asks for when the dates give enough notice", () => {
    expect(noticeLine({ ...base, from: "2026-11-13" })).toEqual({
      text: "Annual asks for 7 days' notice.",
      short: false,
    });
  });

  it("says the dates fall short, and that it can still be raised", () => {
    const line = noticeLine({ ...base, from: "2026-11-09" });
    expect(line?.short).toBe(true);
    expect(line?.text).toContain("starts in 3 days");
    expect(line?.text).toContain("It can still be raised.");
  });

  it("reads one day, today and the past in their own words", () => {
    expect(noticeLine({ ...base, from: "2026-11-07" })?.text).toContain(
      "starts in 1 day,",
    );
    expect(noticeLine({ ...base, from: "2026-11-06" })?.text).toContain(
      "starts today",
    );
    expect(noticeLine({ ...base, from: "2026-11-01" })?.text).toContain(
      "starts in the past",
    );
  });

  it("is singular for one day of notice", () => {
    expect(
      noticeLine({ ...base, minNoticeDays: 1, from: "2026-11-20" })?.text,
    ).toBe("Annual asks for 1 day's notice.");
  });

  it("says nothing where no notice is asked for, or none is known", () => {
    expect(
      noticeLine({ ...base, minNoticeDays: 0, from: "2026-11-09" }),
    ).toBeNull();
    expect(
      noticeLine({ ...base, minNoticeDays: null, from: "2026-11-09" }),
    ).toBeNull();
    expect(
      noticeLine({ ...base, minNoticeDays: undefined, from: "2026-11-09" }),
    ).toBeNull();
  });

  it("says nothing before there is a date, or for something that is not one", () => {
    expect(noticeLine({ ...base, from: "" })).toBeNull();
    expect(noticeLine({ ...base, from: "tomorrow" })).toBeNull();
  });
});
