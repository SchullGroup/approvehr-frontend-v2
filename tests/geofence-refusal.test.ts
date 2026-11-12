import { describe, expect, it } from "vitest";
import { geofenceRefusal } from "@/lib/api/attendance";
import { ApiError } from "@/lib/api/client";

/**
 * `geofenceRefusal` decides whether the clock card can show the API's own
 * one-line `summary` as the alert headline. A reason missing from its list
 * falls back to a generic "That did not go through", which is what happened to
 * `assigned_location` when the API started sending it.
 */

const refusal = (reason: string) =>
  new ApiError(422, "unprocessable", "Refused.", {
    reason,
    summary: `summary for ${reason}`,
    locationName: "Lagos HQ",
    radiusMetres: 100,
    distanceMetres: null,
    accuracyMetres: null,
  });

describe("geofenceRefusal", () => {
  it.each(["outside", "unproven", "position_required", "assigned_location"])(
    "recognises %s and hands back its summary",
    (reason) => {
      expect(geofenceRefusal(refusal(reason))?.summary).toBe(`summary for ${reason}`);
    },
  );

  it("ignores a reason it does not know, and anything that is not an API error", () => {
    expect(geofenceRefusal(refusal("module_off"))).toBeNull();
    expect(geofenceRefusal(new Error("network"))).toBeNull();
  });
});
