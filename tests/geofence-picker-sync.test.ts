import { describe, expect, it } from "vitest";
import {
  distanceMetres,
  fenceMoved,
  fieldsFromPin,
  pointFromFields,
  radiusFromField,
  readout,
} from "@/components/geofence-picker/sync";

/**
 * The rules that keep the map pin and the typed coordinates saying one thing.
 * Pure, so no map is needed: jsdom cannot draw Leaflet, and what goes wrong here
 * is arithmetic, not pixels.
 */

describe("typed coordinates to a pin", () => {
  it("is a pin only when both numbers are whole and in range", () => {
    expect(pointFromFields("6.601838", "3.350890")).toEqual({
      latitude: 6.601838,
      longitude: 3.35089,
    });
    expect(pointFromFields("-33.9", "151.2")).toEqual({
      latitude: -33.9,
      longitude: 151.2,
    });
  });

  it.each([
    ["latitude half-typed", "6.", "3.35"],
    ["a lone minus", "-", "3.35"],
    ["longitude empty", "6.6", ""],
    ["both empty", "", ""],
    ["latitude past the pole", "91", "3.35"],
    ["longitude past the date line", "6.6", "181"],
  ])("is no pin with %s, so the pin stays where it was", (_name, lat, lng) => {
    expect(pointFromFields(lat, lng)).toBeNull();
  });
});

describe("a pin to the typed fields", () => {
  it("writes six decimal places and leaves a chosen radius alone", () => {
    expect(
      fieldsFromPin({ latitude: 6.6014552, longitude: 3.3521317 }, "500"),
    ).toEqual({
      latitude: "6.601455",
      longitude: "3.352132",
      radiusMetres: "500",
    });
  });

  it("gives a first pin 150 m when no radius has been chosen", () => {
    expect(
      fieldsFromPin({ latitude: 6.6, longitude: 3.35 }, "").radiusMetres,
    ).toBe("150");
    expect(
      fieldsFromPin({ latitude: 6.6, longitude: 3.35 }, "  ").radiusMetres,
    ).toBe("150");
  });
});

describe("the radius field", () => {
  it("is whole metres between 10 and 50,000, or nothing", () => {
    expect(radiusFromField("150")).toBe(150);
    expect(radiusFromField("10")).toBe(10);
    expect(radiusFromField("50000")).toBe(50_000);
    expect(radiusFromField("9")).toBeNull();
    expect(radiusFromField("50001")).toBeNull();
    expect(radiusFromField("150.5")).toBeNull();
    expect(radiusFromField("")).toBeNull();
  });
});

describe("a moved fence", () => {
  const saved = { latitude: 6.6, longitude: 3.35, radiusMetres: 150 };

  it("is moved once the new centre is outside the old circle", () => {
    /* About 220 m north. */
    expect(fenceMoved(saved, { latitude: 6.602, longitude: 3.35 })).toBe(true);
    /* About 55 m north. */
    expect(fenceMoved(saved, { latitude: 6.6005, longitude: 3.35 })).toBe(
      false,
    );
  });

  it("is never moved without a saved fence or a pin", () => {
    expect(fenceMoved(null, { latitude: 6.6, longitude: 3.35 })).toBe(false);
    expect(fenceMoved(saved, null)).toBe(false);
  });

  it("measures distance in metres on the ground", () => {
    /* One thousandth of a degree of latitude is about 111 m everywhere. */
    expect(
      distanceMetres(
        { latitude: 6.6, longitude: 3.35 },
        { latitude: 6.601, longitude: 3.35 },
      ),
    ).toBeCloseTo(111, 0);
  });
});

describe("the line under the map", () => {
  it("names the pin and the radius, or says there is no pin", () => {
    expect(readout({ latitude: 6.5244, longitude: 3.3792 }, 1_000)).toBe(
      "6.524400, 3.379200 · 1,000 m",
    );
    expect(readout({ latitude: 6.5244, longitude: 3.3792 }, null)).toBe(
      "6.524400, 3.379200",
    );
    expect(readout(null, 150)).toBe("No pin yet");
  });
});
