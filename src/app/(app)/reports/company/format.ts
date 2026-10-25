import { formatKobo } from "@/lib/api/payroll";
import { markPercent, pointsBetween } from "@/lib/api/company-report";

/**
 * How the company report writes a figure.
 *
 * An absent figure is a dash and never a zero (ADR 0003): a department nobody
 * has marked has no average, which is not an average of nought.
 */

export const DASH = "—";

/** A mark in basis points as a percentage, or a dash where nobody has one. */
export const markOrDash = (bp: number | null): string =>
  bp === null ? DASH : markPercent(bp);

/** A rounded 0 to 100 figure such as goal progress, or a dash. */
export const progressOrDash = (value: number | null): string =>
  value === null ? DASH : `${String(value)}%`;

export const koboOrDash = (kobo: number | undefined): string =>
  kobo === undefined ? DASH : formatKobo(kobo);

export const plural = (n: number, one: string, many: string): string =>
  n === 1 ? one : many;

/** "16.4 points above everyone else", from a signed gap in basis points. */
export function gapSentence(gapBp: number): string {
  const side = gapBp < 0 ? "below" : "above";
  return `${pointsBetween(gapBp)} points ${side} everyone else`;
}

/** A gap with its sign, "+16.4" or "-4.4", for a column where direction matters. */
export const signedPoints = (bp: number): string =>
  `${bp < 0 ? "-" : "+"}${pointsBetween(bp)}`;

/**
 * "+7.1 to +25.6" from the gap's likely range, or null when there is none.
 *
 * Signed, because a range that crosses zero ("-12.6 to +3.9") is the whole
 * reason a gap is not flagged, and printing it without signs would read as a
 * range of positive numbers.
 */
export function likelyRange(
  lowBp: number | null,
  highBp: number | null,
): string | null {
  if (lowBp === null || highBp === null) return null;
  return `${signedPoints(lowBp)} to ${signedPoints(highBp)}`;
}
