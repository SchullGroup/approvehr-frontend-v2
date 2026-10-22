/**
 * Which tab a link asked for, read from `?tab=` on the server and handed to the
 * screen as a prop.
 *
 * Its own module with no `"use client"`: a server `page.tsx` cannot call a
 * function exported from a client module (Next throws at request time while
 * `tsc` and lint pass), and the screen's hook lives in `hooks/use-url-tab.ts`.
 * An unknown or repeated value falls back rather than rendering no tab at all,
 * the same as the Pay setup page this follows.
 */
export function tabFromQuery<T extends string>(
  raw: string | string[] | undefined,
  ids: readonly T[],
  fallback: T,
): T {
  const one = Array.isArray(raw) ? raw[0] : raw;
  return ids.find((id) => id === one) ?? fallback;
}
