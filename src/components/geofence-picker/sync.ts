import { DEFAULT_RADIUS, RADIUS_MAX, RADIUS_MIN } from "./region";

/**
 * The rules that keep the map and the typed fields saying the same thing.
 *
 * Pure functions, so they are tested without a map: `jsdom` cannot draw Leaflet,
 * and the bugs that matter here are arithmetic and timing, not pixels.
 *
 * ## The fields stay the truth
 *
 * The form keeps latitude, longitude and radius as **strings**, exactly as it did
 * before the map existed (see `location-form.tsx`: `Number("")` is 0, and 0 is the
 * equator). The map never owns a coordinate. It *reads* the pin from the strings,
 * and when somebody moves the pin it *writes* the strings. So:
 *
 * - pin → fields: always, at six decimal places (about a tenth of a metre);
 * - fields → pin: only when both numbers are complete and in range, and without
 *   ever rewriting what the person is typing — "6.5" stays "6.5" while they reach
 *   for the next digit.
 */

export type Point = { latitude: number; longitude: number };

/** Six decimal places: what a phone's maps app shows, and well under a metre. */
export const formatCoordinate = (value: number): string => value.toFixed(6);

const isComplete = (text: string) => /^-?\d+(\.\d+)?$/.test(text.trim());

/**
 * The pin the two typed fields describe, or `null` while they describe none.
 *
 * `null` for a half-typed number ("6.", "-"), for one field empty, and for a value
 * out of range: in each of those the pin stays where it was rather than jumping to
 * a guess.
 */
export function pointFromFields(
  latitude: string,
  longitude: string,
): Point | null {
  if (!isComplete(latitude) || !isComplete(longitude)) return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { latitude: lat, longitude: lng };
}

/** The radius the field holds, as the whole metres the API takes, or `null`. */
export function radiusFromField(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const value = Number(text);
  return value >= RADIUS_MIN && value <= RADIUS_MAX ? value : null;
}

/**
 * What the three fields become when somebody places or moves the pin.
 *
 * A first pin with no radius chosen gets `DEFAULT_RADIUS`, so the circle and the
 * Save button both work at once instead of waiting on a third field the person may
 * not have noticed. A radius already typed is left exactly as it is.
 */
export function fieldsFromPin(
  point: Point,
  radiusText: string,
): { latitude: string; longitude: string; radiusMetres: string } {
  return {
    latitude: formatCoordinate(point.latitude),
    longitude: formatCoordinate(point.longitude),
    radiusMetres:
      radiusText.trim() === "" ? String(DEFAULT_RADIUS) : radiusText,
  };
}

/** Metres between two points on the Earth's surface (haversine; good to ~0.5%). */
export function distanceMetres(a: Point, b: Point): number {
  const R = 6_371_000;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Whether a moved pin leaves the old fence behind: further from the saved centre
 * than the saved radius. Somebody standing where the old fence was centred would
 * be outside the new one, so the form warns before saving.
 */
export function fenceMoved(
  saved: (Point & { radiusMetres: number }) | null,
  current: Point | null,
): boolean {
  if (!saved || !current) return false;
  return distanceMetres(saved, current) > saved.radiusMetres;
}

/** "6.524400, 3.379200 · 150 m", for the line under the map. */
export function readout(point: Point | null, radius: number | null): string {
  if (!point) return "No pin yet";
  const where = `${formatCoordinate(point.latitude)}, ${formatCoordinate(point.longitude)}`;
  return radius === null
    ? where
    : `${where} · ${radius.toLocaleString("en-NG")} m`;
}
