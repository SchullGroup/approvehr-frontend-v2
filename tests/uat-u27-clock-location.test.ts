import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import {
  defaultClockLocationId,
  nearestLocation,
  nearestOfficeLine,
} from "@/lib/store/attendance";

/**
 * UAT 23 Nov, U27 (SELF-4): "Where" was preset to the first office
 * alphabetically for everybody, and a clock-in at their own office was refused
 * with "You are 81.3km from Abeokuta site".
 */

const ABEOKUTA = {
  id: "abk",
  name: "Abeokuta site",
  latitude: 7.1475,
  longitude: 3.3619,
};
const LAGOS = {
  id: "lag",
  name: "Lagos HQ",
  latitude: 6.4281,
  longitude: 3.4219,
};
const REMOTE = { id: "rem", name: "Remote", latitude: null, longitude: null };
const ALL = [ABEOKUTA, LAGOS, REMOTE];

describe("which office Where starts on", () => {
  it("is the person's own work location, not the first in the list", () => {
    expect(defaultClockLocationId(ALL, null, null, "lag")).toBe("lag");
  });

  it("still gives way to a choice made now, and to the last one used", () => {
    expect(defaultClockLocationId(ALL, null, "rem", "lag")).toBe("rem");
    expect(defaultClockLocationId(ALL, "abk", null, "lag")).toBe("abk");
  });

  it("falls back to the first when their office is not on the list", () => {
    expect(defaultClockLocationId(ALL, null, null, "gone")).toBe("abk");
    expect(defaultClockLocationId(ALL, null, null, null)).toBe("abk");
  });
});

describe("a refusal", () => {
  const atLagos = { latitude: 6.4285, longitude: 3.4215, accuracyMetres: 20 };

  it("finds the nearest other office with a point on the map", () => {
    expect(nearestLocation(ALL, atLagos, "abk")?.location.name).toBe(
      "Lagos HQ",
    );
  });

  it("names it in a sentence the person can act on", () => {
    const refused = Object.assign(
      new ApiError(422, "unprocessable", "Clock in when you arrive."),
      { position: atLagos },
    );
    expect(nearestOfficeLine(refused, ALL, "abk")).toBe(
      "The nearest office is Lagos HQ. Choose it under Where and clock in again.",
    );
  });

  it("says nothing when no position came with it", () => {
    expect(
      nearestOfficeLine(new ApiError(422, "unprocessable", "No."), ALL, "abk"),
    ).toBeNull();
  });
});
