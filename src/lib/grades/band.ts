/**
 * Where a figure sits in a salary band.
 *
 * A port of `bandPosition` in `approvehr-api/src/modules/grades/service.ts`, and
 * the only copy on this side. Every meter, badge and sentence about a band reads
 * its numbers from here, because the two decisions below have to be made once:
 *
 * ## 1. The fraction is not clamped
 *
 * `fraction` can exceed 1 and go below 0. Somebody paid above the top of their
 * band is common — three rises and no re-grade — and a meter pinned at 1.0 hides
 * the one case a manager needs to act on. The marker is drawn outside the track
 * rather than pushed onto its end.
 *
 * `null` when the band has no width, because there is no position in a band of
 * one point, and a fudged 0.5 would be drawn as though there were.
 *
 * ## 2. The label is words, not a percentile
 *
 * "Mid-point" and "Below the band for this grade" are what a business owner
 * reads. "62nd percentile of range" is a number that needs a course to
 * interpret, and there is nothing you can do with it that you cannot do with the
 * sentence.
 *
 * Pure, no React, no fetch — so the offer screen can draw a band for a figure
 * nobody has been paid yet, and so the demo can compute the same numbers the API
 * would return.
 */

/** The three kobo edges of a band. Integer kobo, as everywhere. */
export type Band = {
  minGrossKobo: number;
  midGrossKobo: number;
  maxGrossKobo: number;
};

/** The API's `BandPosition`, shape for shape. */
export type BandPlacement = {
  /** `(gross - min) / (max - min)`, four places, uncapped. Null in a flat band. */
  fraction: number | null;
  /** Gross over the midpoint. 1.0 is paid at the midpoint. */
  compaRatio: number | null;
  /** 1–4 inside the band, null outside it. */
  quartile: number | null;
  withinBand: boolean;
  /** `max - gross`. Negative once they are above the top. */
  headroomKobo: number;
  /** What it would take to reach the bottom. Zero at or above it. */
  shortfallKobo: number;
};

const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

export function bandPositionOf(grossKobo: number, band: Band): BandPlacement {
  const width = band.maxGrossKobo - band.minGrossKobo;
  const withinBand =
    grossKobo >= band.minGrossKobo && grossKobo <= band.maxGrossKobo;
  const fraction =
    width > 0 ? round4((grossKobo - band.minGrossKobo) / width) : null;

  return {
    fraction,
    compaRatio:
      band.midGrossKobo > 0 ? round4(grossKobo / band.midGrossKobo) : null,
    quartile:
      withinBand && fraction !== null
        ? Math.min(4, Math.floor(fraction * 4) + 1)
        : null,
    withinBand,
    headroomKobo: band.maxGrossKobo - grossKobo,
    shortfallKobo: Math.max(0, band.minGrossKobo - grossKobo),
  };
}

/* ------------------------------------------------------------------ words */

/** Coarse state. Drives the badge tone and nothing else. */
export type BandStanding = "below" | "within" | "above" | "flat";

export function bandStanding(grossKobo: number, band: Band): BandStanding {
  if (band.maxGrossKobo === band.minGrossKobo) {
    return grossKobo === band.minGrossKobo ? "flat" : grossKobo > band.maxGrossKobo ? "above" : "below";
  }
  if (grossKobo < band.minGrossKobo) return "below";
  if (grossKobo > band.maxGrossKobo) return "above";
  return "within";
}

/**
 * The plain sentence. Six of them, and none is a percentage.
 *
 * Written as full labels rather than assembled from parts so each one reads as
 * something a person would say. "Below the band for this grade" is a sentence;
 * "below" + "band" + a number is a readout.
 */
export function bandLabel(grossKobo: number, band: Band): string {
  const standing = bandStanding(grossKobo, band);
  if (standing === "flat") return "This grade is one figure, not a band";
  if (standing === "below") return "Below the band for this grade";
  if (standing === "above") return "Above the top of the band";

  if (grossKobo === band.midGrossKobo) return "Mid-point";
  if (grossKobo === band.minGrossKobo) return "Bottom of band";
  if (grossKobo === band.maxGrossKobo) return "Top of band";

  const { quartile } = bandPositionOf(grossKobo, band);
  if (grossKobo < band.midGrossKobo) {
    return quartile === 1 ? "Bottom quarter of the band" : "Below the mid-point";
  }
  return quartile === 4 ? "Top quarter of the band" : "Above the mid-point";
}

/** The badge beside the label. Short, because the label carries the meaning. */
export function bandBadge(
  grossKobo: number,
  band: Band,
): { label: string; tone: "success" | "info" | "warning" | "neutral" } {
  switch (bandStanding(grossKobo, band)) {
    case "below":
      return { label: "Under band", tone: "info" };
    case "above":
      return { label: "Over band", tone: "warning" };
    case "flat":
      return { label: "Single figure", tone: "neutral" };
    default:
      return { label: "In band", tone: "success" };
  }
}

/**
 * Where to draw the marker, as a percentage of the track.
 *
 * Clamped to −8…108 for *drawing only* — the meter has to stay on the page —
 * and the caller is expected to render the out-of-band case as a different
 * colour plus the label above, never as a marker resting on the end of the
 * track. Which is why this is a separate function from `bandPositionOf`: the
 * clamp is a layout concern and must not leak into the arithmetic.
 */
export function markerPercent(grossKobo: number, band: Band): number {
  const width = band.maxGrossKobo - band.minGrossKobo;
  if (width <= 0) return 50;
  const raw = ((grossKobo - band.minGrossKobo) / width) * 100;
  return Math.max(-8, Math.min(108, raw));
}

/* ------------------------------------------------------------- conversion */

/**
 * A band from naira figures, for a caller whose data is in naira.
 *
 * `mid` defaults to the arithmetic midpoint, because a requisition holding only
 * a floor and a ceiling has no third figure to give — and stating that default
 * once here beats every call site inventing its own.
 *
 * Lives in this file, not beside the component that draws the meter, because
 * that component is `"use client"` and a helper exported from a client module
 * cannot be *called* by a server component — only rendered. A server component
 * assembling a band would fail at request time with "attempted to call
 * bandFromNaira() from the server", which is a confusing way to learn where a
 * pure function belongs.
 */
export function bandFromNaira(min: number, max: number, mid?: number): Band {
  return {
    minGrossKobo: Math.round(min * 100),
    midGrossKobo: Math.round((mid ?? (min + max) / 2) * 100),
    maxGrossKobo: Math.round(max * 100),
  };
}
