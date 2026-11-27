import { describe, expect, it } from "vitest";
import { domainFor, ticksFor } from "@/lib/performance/fairness-domain";

/**
 * The range the Fairness chart is drawn over comes from its scores (F41). It was
 * fixed at 40% to 80%, and a score outside it was pinned to the edge: an average
 * of 37% was drawn on the 40% line.
 */
describe("the chart's range", () => {
  it("contains every score, with room either side", () => {
    const [low, high] = domainFor([5200, 6100, 7300], null);
    expect(low).toBeLessThanOrEqual(5200);
    expect(high).toBeGreaterThanOrEqual(7300);
    expect(low).toBe(4000);
    expect(high).toBe(8000);
  });

  it("goes below 40% when a score does", () => {
    const [low] = domainFor([3700, 6000], null);
    expect(low).toBeLessThan(3700);
    expect(low).toBe(3000);
  });

  it("goes above 80% when a score does, and never past 100%", () => {
    expect(domainFor([8800], null)[1]).toBeGreaterThan(8800);
    expect(domainFor([9900], null)[1]).toBe(10_000);
  });

  it("contains the company line too", () => {
    const [low, high] = domainFor([6000, 6100], 3700);
    expect(low).toBeLessThanOrEqual(3700);
    expect(high).toBeGreaterThanOrEqual(6100);
  });

  it("does not draw two groups on top of each other: it is at least two points wide", () => {
    for (const values of [[6000], [6000, 6050], [9990], [10], [0]]) {
      const [low, high] = domainFor(values, null);
      expect(high - low).toBeGreaterThanOrEqual(2000);
      expect(low).toBeGreaterThanOrEqual(0);
      expect(high).toBeLessThanOrEqual(10_000);
    }
  });

  it("is 0 to 100% when there is nothing to draw", () => {
    expect(domainFor([], null)).toEqual([0, 10_000]);
    expect(domainFor([Number.NaN], null)).toEqual([0, 10_000]);
  });

  it("has whole-step gridlines inside the range", () => {
    const domain = domainFor([5200, 7300], null);
    const ticks = ticksFor(domain, false);
    expect(ticks[0]).toBeGreaterThanOrEqual(domain[0]);
    expect(ticks.at(-1)).toBeLessThanOrEqual(domain[1]);
    expect(ticks.every((tick) => tick % 1000 === 0)).toBe(true);
  });

  it("has fewer gridlines on a narrow chart", () => {
    const domain = domainFor([3000, 9000], null);
    expect(ticksFor(domain, true).length).toBeLessThan(
      ticksFor(domain, false).length,
    );
  });
});
