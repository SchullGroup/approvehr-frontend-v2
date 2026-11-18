/**
 * Everything about *where* the geofence picker starts and what it draws with,
 * in one place, so a second market or a second tile provider changes this file
 * and nothing else.
 *
 * ## Free tiles, and what that costs
 *
 * The base map defaults to OpenStreetMap's standard raster tiles: free, no key,
 * no account. Its tile policy asks for three things this picker does: the
 * attribution shown on the map, the browser's normal `Referer` kept (this app
 * sends `strict-origin-when-cross-origin`), and no bulk or offline download (the
 * service worker only ever handles navigations). It also says access for
 * commercial users is best-effort and may be withdrawn, which is why the URL is a
 * build setting: `NEXT_PUBLIC_MAP_TILE_URL` points the picker at another provider
 * (MapTiler, Stadia, a self-hosted server) with a rebuild and no code change. The
 * Content-Security-Policy is computed from the same setting at build time, in
 * `next.config.ts`, which cannot import this file — hence the copy of
 * `MAP_TILE_DEFAULT` there, held equal by `tests/geofence-map-tiles.test.ts`.
 */

/** The OpenStreetMap standard tile layer. Also in `next.config.ts`; see above. */
export const MAP_TILE_DEFAULT =
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const MAP_ATTRIBUTION_DEFAULT =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

/* `process.env.NEXT_PUBLIC_…` written out in full: Next.js substitutes the value
   into the client bundle only where the whole name appears literally. */
export const mapTileUrl = (): string =>
  process.env.NEXT_PUBLIC_MAP_TILE_URL?.trim() || MAP_TILE_DEFAULT;

export const mapAttribution = (): string =>
  process.env.NEXT_PUBLIC_MAP_ATTRIBUTION?.trim() || MAP_ATTRIBUTION_DEFAULT;

/**
 * The one market today. A new location with no pin opens on Lagos at a zoom that
 * shows the city, which is where most offices are; the address search leans
 * towards Nigeria on the API side for the same reason (`geocode.ts` there).
 */
export const DEFAULT_REGION = {
  centre: { latitude: 6.5244, longitude: 3.3792 },
  zoom: 11,
} as const;

/** How close the map goes when it moves to a pin. Street level, not a rooftop. */
export const PIN_ZOOM = 17;

/** The API's bounds for a fence radius (`schemas.ts`, `radiusMetres`). */
export const RADIUS_MIN = 10;
export const RADIUS_MAX = 50_000;

/** What a first pin gets when nobody has chosen a radius: a building and its car park. */
export const DEFAULT_RADIUS = 150;

export const RADIUS_PRESETS = [50, 150, 500, 1_000] as const;
