"use client";

/**
 * Reading the device's position, for a geofenced clock-in.
 *
 * ## Asked for on the button, never on the page
 *
 * `navigator.geolocation.getCurrentPosition` shows a browser permission prompt.
 * A prompt that appears on arrival, before the person has asked for anything, is
 * the one they dismiss — and Chrome and Safari both treat a dismissal as a
 * standing "no" for the origin, so the cost of asking at the wrong moment is
 * that the feature is dead on that device until somebody digs through site
 * settings. So this is only ever called from a click, and only when the answer
 * can change the outcome: `useAttendanceMutations().clockIn` calls it for a
 * location whose fence is actually enforced and for nothing else.
 *
 * ## Three failures, three different things to do about them
 *
 * The Geolocation API returns one error object with a `code`, and the three
 * codes mean genuinely different things. Collapsing them into "could not get
 * your location" tells somebody with a blocked permission to go outside, and
 * somebody indoors to check their browser settings — each of which is the
 * wrong instruction:
 *
 * - **denied** — they, or their browser, said no. Nothing about waiting or
 *   moving helps; the permission has to be changed, or HR records the clock-in.
 * - **unavailable** — the device tried and could not work it out. Usually
 *   indoors with wifi off, or a desktop with no radios at all. Moving helps.
 * - **timeout** — it is still trying. Trying again often works, and this is the
 *   one failure where "try again" is honest advice rather than a shrug.
 *
 * Each carries a short `title` and a longer `message`, mirroring the way the
 * API's own geofence refusal carries a `summary` and a `message`, so a screen
 * renders both the same way whichever side turned the clock-in down.
 */

export type PositionFix = {
  latitude: number;
  longitude: number;
  /**
   * Metres — the radius the browser says the fix is good to, not a percentage.
   *
   * Sent to the API, which refuses to judge a fence it cannot decide rather
   * than pretending a two-kilometre error bar places somebody inside a
   * hundred-metre circle. See `geofence.ts` in the API.
   */
  accuracyMetres: number;
};

export type PositionFailureReason = "denied" | "unavailable" | "timeout" | "unsupported";

/**
 * A position that could not be read. Thrown, so a caller cannot forget it.
 *
 * Deliberately not an `ApiError`: no request was made, and dressing a browser
 * refusal up as an HTTP one would have a screen reporting a server problem for
 * something the server never heard about.
 */
export class PositionError extends Error {
  constructor(
    readonly reason: PositionFailureReason,
    /** One short line, for a toast heading. */
    readonly title: string,
    message: string,
  ) {
    super(message);
    this.name = "PositionError";
  }
}

/**
 * How long to wait before giving up.
 *
 * Twelve seconds is long enough for a cold GPS fix on a phone that has just
 * come indoors and short enough that somebody standing at a turnstile does not
 * think the button is broken.
 */
const TIMEOUT_MS = 12_000;

const FAILURES: Record<
  Exclude<PositionFailureReason, "unsupported">,
  { title: string; message: string }
> = {
  denied: {
    title: "Location access is turned off",
    message:
      "This site is blocked from seeing your location, so a clock-in here cannot be checked against the site. Allow location for this site in your browser settings and try again, or ask your HR team to record it for you.",
  },
  unavailable: {
    title: "Your device could not find its position",
    message:
      "The location request went through but came back empty: usually indoors, or on a machine with no GPS or wifi. Try again near a window or outside, or ask your HR team to record it for you.",
  },
  timeout: {
    title: "Finding your location took too long",
    message: `Your device did not answer within ${TIMEOUT_MS / 1000} seconds. Try again, or ask your HR team to record it for you.`,
  },
};

/**
 * The device's current position.
 *
 * Throws a `PositionError` rather than returning a result union, so a caller
 * that forgets to check gets an error instead of clocking in with a position of
 * `undefined` — which the API would read as "no position sent" and refuse
 * anyway, one round trip later and with a less useful message.
 */
export async function readPosition(): Promise<PositionFix> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new PositionError(
      "unsupported",
      "This browser cannot report a location",
      "Clocking in here has to be checked against the site, and this browser has no way to say where it is. Ask your HR team to record it for you.",
    );
  }

  return new Promise<PositionFix>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMetres: position.coords.accuracy,
        });
      },
      (error) => {
        const reason: PositionFailureReason =
          error.code === error.PERMISSION_DENIED
            ? "denied"
            : error.code === error.TIMEOUT
              ? "timeout"
              : "unavailable";
        const failure = FAILURES[reason as Exclude<PositionFailureReason, "unsupported">];
        reject(new PositionError(reason, failure.title, failure.message));
      },
      {
        /* Worth the extra second and the extra battery: the API accepts a fence
           only when the whole accuracy circle is inside it, so a coarse
           network-derived fix is refused as unprovable. High accuracy is what
           turns "your device cannot tell" into a clock-in. */
        enableHighAccuracy: true,
        timeout: TIMEOUT_MS,
        /* Never a cached fix. A position from twenty minutes ago is a statement
           about where the phone was twenty minutes ago, and this one is
           evidence attached to a record payroll pays against. */
        maximumAge: 0,
      },
    );
  });
}
