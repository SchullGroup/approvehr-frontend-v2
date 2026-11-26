import { describe, expect, it } from "vitest";
import { employmentStatusLook } from "@/lib/employment-status";

/**
 * The directory's Archived tab is everybody who left, and every one of them is EXITED. A status
 * missing from the directory's map threw on `.tone` and took the whole tab down, so the history of
 * people who left could not be opened. Every status the database can hold has a look.
 */

describe("employmentStatusLook", () => {
  it("has a look for every status the database can hold, in either case", () => {
    for (const status of [
      "ONBOARDING",
      "ACTIVE",
      "ON_LEAVE",
      "SUSPENDED",
      "EXITED",
    ]) {
      expect(employmentStatusLook(status).tone).toBeTruthy();
      expect(employmentStatusLook(status.toLowerCase()).label).toBeTruthy();
    }
  });

  it("says somebody who exited has left the company", () => {
    expect(employmentStatusLook("EXITED").label).toBe("Left the company");
    expect(employmentStatusLook("exited").tone).toBe("neutral");
  });

  it("reads a status it has never heard of as a sentence, and does not throw", () => {
    expect(employmentStatusLook("ON_SABBATICAL")).toEqual({
      tone: "neutral",
      label: "On sabbatical",
    });
  });
});
