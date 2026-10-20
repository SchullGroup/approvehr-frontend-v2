/**
 * The demo's clock, in one place.
 *
 * A demo re-score is paced in real time (it takes a few seconds so the bar has
 * something to show), and a score typed in now is stamped now. Both are the
 * browser's own wall clock on purpose, and neither derives a calendar day from it,
 * so the one raw read is here, marked, rather than at ten call sites.
 */
export const demoNow = (): number => Date.now(); // reads-the-clock: paces a demo re-score in real seconds; never turned into a day

/** An instant as text, the one safe shape: UTC, nothing chained on. */
export const demoStamp = (): string => new Date().toISOString();
