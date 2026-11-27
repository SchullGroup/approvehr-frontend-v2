import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RangeChart } from "@/app/(app)/performance/periods/[id]/fairness/charts";

/**
 * The Fairness chart's axis came from the figures (F41, 25 Nov walkthrough). It
 * was fixed at 40% to 80%, so a company at 37% was drawn on the 40% line and the
 * axis said nothing was below it. `domainFor` has its own tests; this is that
 * the chart uses it.
 */

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private readonly callback: (entries: unknown[]) => void) {}
      observe() {
        this.callback([{ contentRect: { width: 700 } }]);
      }
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const row = (label: string, meanBp: number) => ({
  label,
  people: 6,
  meanBp,
  lowBp: meanBp - 300,
  highBp: meanBp + 300,
  emphasis: false,
});
const labels = (container: HTMLElement) =>
  [...container.querySelectorAll("text")].map((t) => t.textContent);

describe("the chart's axis follows the figures", () => {
  it("shows a range that holds a group below 40%", () => {
    const { container } = render(
      <RangeChart
        rows={[row("Finance", 3400), row("Sales", 4000)]}
        referenceBp={3700}
        caption="Average by group"
      />,
    );
    const axis = labels(container);
    expect(axis).toContain("30%");
    expect(axis).not.toContain("80%");
  });

  it("still reaches a high group", () => {
    const { container } = render(
      <RangeChart
        rows={[row("Finance", 8400), row("Sales", 9100)]}
        referenceBp={null}
        caption="Average by group"
      />,
    );
    const axis = labels(container);
    expect(axis).toContain("90%");
    expect(axis).not.toContain("40%");
  });

  it("draws a gridline at every labelled step", () => {
    const { container } = render(
      <RangeChart
        rows={[row("Finance", 5000), row("Sales", 6000)]}
        referenceBp={5500}
        caption="Average by group"
      />,
    );
    const lines = container.querySelectorAll("line.stroke-line");
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });
});
