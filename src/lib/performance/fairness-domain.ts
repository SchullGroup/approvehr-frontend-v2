/**
 * The range the Fairness check's chart is drawn over, taken from the scores it
 * draws.
 *
 * It was fixed at 40% to 80%. Scores outside it were pinned to the edge, so a
 * company whose average was 37% was drawn as if it sat on the 40% line, and
 * the axis said nothing was below it. A range that comes from the data cannot
 * hide a figure, and a fixed one can.
 *
 * Pure, in basis points (10,000 is 100%).
 */

const FULL = 10_000;
/** A chart narrower than this cannot show a difference between two groups. */
const MIN_SPAN = 2_000;
/** Room either side of the lowest and highest, so a mark is not on the frame. */
const MARGIN = 500;
const STEP = 1_000;

export function domainFor(
  values: readonly number[],
  referenceBp: number | null,
): readonly [number, number] {
  const all = [
    ...values,
    ...(referenceBp === null ? [] : [referenceBp]),
  ].filter((value) => Number.isFinite(value));
  if (all.length === 0) return [0, FULL];

  let low = Math.max(0, Math.floor((Math.min(...all) - MARGIN) / STEP) * STEP);
  let high = Math.min(
    FULL,
    Math.ceil((Math.max(...all) + MARGIN) / STEP) * STEP,
  );

  /* Grow a narrow range outwards rather than drawing two groups on top of each
     other, and slide it back inside 0 to 100% when it hits an end. */
  while (high - low < MIN_SPAN) {
    if (low > 0) low -= STEP;
    if (high - low < MIN_SPAN && high < FULL) high += STEP;
    if (low === 0 && high === FULL) break;
  }
  return [low, high];
}

/** The gridlines: every whole step inside the range, thinned for a narrow chart. */
export function ticksFor(
  domain: readonly [number, number],
  narrow: boolean,
): number[] {
  const span = domain[1] - domain[0];
  const step = span <= 5_000 ? STEP : span <= 8_000 ? 2 * STEP : 2_500;
  const every = narrow ? step * 2 : step;
  const ticks: number[] = [];
  for (
    let tick = Math.ceil(domain[0] / step) * step;
    tick <= domain[1];
    tick += step
  ) {
    if (narrow ? tick % every === 0 : true) ticks.push(tick);
  }
  return ticks;
}
