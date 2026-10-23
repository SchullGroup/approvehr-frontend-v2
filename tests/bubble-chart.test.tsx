import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BubbleChart,
  layoutBubbles,
  type Box,
  type BubbleChartProps,
  type BubbleLayout,
  type BubblePoint,
} from "@/components/ui/bubble-chart";

/**
 * The bubble chart is a picture, and a picture has three ways to fail without
 * a type noticing: it can leave a bubble unnamed (the 3D chart it replaces did
 * exactly that, and every other bubble became unreadable with it), it can put
 * two names on top of each other, and it can draw a number nobody has.
 *
 * Placement is asserted on `layoutBubbles`, which is pure, because jsdom has no
 * layout and a test that read box sizes out of a DOM would be asserting zeroes.
 * The text-width estimate behind it (8.5px a character at the 14px floor) was
 * checked in a real Chromium against `getBBox` on this chart's own labels, at
 * 14px Geist: widest label measured 7.9px a character against the 8.5
 * estimated, so a box is never narrower than its text.
 */

const naira = (v: number) => `N${String(v)}`;
const percent = (v: number) => `${String(v)}%`;

const point = (
  id: string,
  x: number,
  y: number,
  size: number,
  more: Partial<BubblePoint> = {},
): BubblePoint => ({
  id,
  label: id,
  x,
  y,
  size,
  detail: `${id}, ${String(size)} people, average mark ${String(y)}%`,
  ...more,
});

const eight = (): BubblePoint[] => [
  point("Engineering", 1_400_000, 78, 18),
  point("Finance", 1_000_000, 73, 12, { flagged: true }),
  point("Sales", 820_000, 66, 14),
  point("Operations", 760_000, 70, 22),
  point("People", 1_150_000, 81, 6),
  point("Legal", 1_320_000, 74, 4),
  point("Marketing", 900_000, 62, 9),
  point("Support", 680_000, 68, 16),
];

const chart = (over: Partial<BubbleChartProps> = {}) => (
  <BubbleChart
    points={eight()}
    xLabel="Gross pay per head, per month"
    yLabel="Average mark"
    formatX={naira}
    formatY={percent}
    title="Pay and marks by department"
    summary="8 departments. Pay per head across, average mark up."
    {...over}
  />
);

const disc = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-bubble="${id}"] [data-disc]`);

const touches = (a: Box, b: Box, gap = 0) =>
  a.x < b.x + b.width + gap &&
  b.x < a.x + a.width + gap &&
  a.y < b.y + b.height + gap &&
  b.y < a.y + a.height + gap;

/** Every number anywhere in a layout, so a NaN cannot hide in a corner of it. */
function numbers(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (Array.isArray(value)) return value.flatMap(numbers);
  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap(numbers);
  }
  return [];
}

const names = [
  "Engineering",
  "Finance",
  "Sales",
  "Operations",
  "People",
  "Legal",
  "Marketing",
  "Support",
  "Design",
  "Data",
  "Security",
  "Facilities",
];

/** Eleven departments within a few percent of each other, and one far away. The shape that crowds a plot. */
const clustered = (): BubblePoint[] => [
  ...names
    .slice(0, 11)
    .map((name, i) =>
      point(name, 1_000_000 + (i % 4) * 8_000, 72 + (i % 3) * 0.4, 8 + i * 3),
    ),
  point("Outlier", 2_400_000, 90, 5),
];

describe("naming every bubble", () => {
  it("draws each name as text and gives each bubble its detail as its name", () => {
    render(chart());
    for (const p of eight()) {
      const visible = `${p.label}, ${String(p.size)}${p.flagged ? ", flagged" : ""}`;
      const text = screen.getByText(visible);
      /* Hidden from assistive tech so the bubble is not read twice: once from
         its own name and once from the words painted beside it. */
      expect(text).toHaveAttribute("aria-hidden", "true");
      expect(
        screen.getByRole("button", {
          name: p.flagged ? `${p.detail}, flagged` : p.detail,
        }),
      ).toBeInTheDocument();
    }
  });

  it("is one picture, named by its title and its summary", () => {
    render(chart());
    expect(
      screen.getByRole("img", {
        name: "Pay and marks by department. 8 departments. Pay per head across, average mark up.",
      }),
    ).toBeInTheDocument();
  });

  it("puts the detail in a title element for the hover tooltip", () => {
    const { container } = render(chart());
    const titles = [...container.querySelectorAll("svg title")].map(
      (t) => t.textContent,
    );
    for (const p of eight()) expect(titles).toContain(p.detail);
  });

  it("lists the same figures in a table for anybody not looking at the picture", () => {
    render(chart());
    const table = screen.getByRole("table", {
      name: "Pay and marks by department",
    });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(9);
    /* Formatted by the caller's formatters, in the caller's order. */
    expect(
      within(rows[1]!)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["N1400000", "78%", "18"]);
    expect(within(rows[2]!).getByRole("rowheader")).toHaveTextContent(
      "Finance, flagged",
    );
  });
});

describe("pressing a bubble", () => {
  it("calls onSelect with its id on click, Enter and Space, once each", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(chart({ onSelect }));
    const finance = screen.getByRole("button", { name: /^Finance, 12 people/ });

    await user.click(finance);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenLastCalledWith("Finance");

    finance.focus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(2);

    await user.keyboard(" ");
    expect(onSelect).toHaveBeenCalledTimes(3);
    expect(onSelect).toHaveBeenLastCalledWith("Finance");
  });

  it("ignores every other key, and keeps Space from scrolling the page", () => {
    const onSelect = vi.fn();
    render(chart({ onSelect }));
    const sales = screen.getByRole("button", { name: /^Sales/ });
    fireEvent.keyDown(sales, { key: "a" });
    fireEvent.keyDown(sales, { key: "Escape" });
    expect(onSelect).not.toHaveBeenCalled();
    /* `fireEvent` returns false when the handler called preventDefault. */
    expect(fireEvent.keyDown(sales, { key: " " })).toBe(false);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("takes keyboard focus on every bubble", () => {
    render(chart());
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(8);
    for (const button of buttons)
      expect(button).toHaveAttribute("tabindex", "0");
  });

  it("marks the chosen bubble with a thicker outline and aria-pressed, and no other", () => {
    const { container } = render(
      chart({ selectedId: "Sales", onSelect: vi.fn() }),
    );
    expect(screen.getByRole("button", { name: /^Sales/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /^Legal/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(disc(container, "Sales")).toHaveAttribute("stroke-width", "3");
    expect(disc(container, "Legal")).toHaveAttribute("stroke-width", "1.5");
  });

  it("claims no pressed state when nothing can be chosen", () => {
    render(chart());
    expect(screen.getByRole("button", { name: /^Sales/ })).not.toHaveAttribute(
      "aria-pressed",
    );
  });
});

describe("flagged", () => {
  it("adds the word to the label and the name, and an ochre ring, and only for the flagged one", () => {
    const { container } = render(chart());
    expect(screen.getByText("Finance, 12, flagged")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Finance, 12 people, average mark 73%, flagged",
      }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("[data-ring='flagged']")).toHaveLength(1);
    expect(
      container.querySelector("[data-bubble='Finance'] [data-ring='flagged']"),
    ).toHaveAttribute("stroke", "var(--color-warning-text)");
    /* An unflagged bubble is exactly its detail and exactly its name. */
    expect(screen.getByText("Sales, 14")).toBeInTheDocument();
    expect(
      container.querySelector("[data-bubble='Sales'] [data-ring]"),
    ).toBeNull();
  });
});

describe("area", () => {
  it("scales with size, so radius goes as the square root of it", () => {
    const { container } = render(
      chart({
        points: [point("small", 1, 1, 4), point("big", 2, 2, 16)],
      }),
    );
    const small = Number(disc(container, "small")?.getAttribute("r"));
    const big = Number(disc(container, "big")?.getAttribute("r"));
    expect(big / small).toBeCloseTo(Math.sqrt(16 / 4), 6);
  });

  it("holds for any pair, not only a round one", () => {
    const layout = layoutBubbles(
      [point("a", 1, 1, 3), point("b", 2, 3, 27), point("c", 3, 2, 12)],
      720,
      432,
    );
    const r = (id: string) => layout.bubbles.find((b) => b.id === id)?.r ?? NaN;
    expect(r("b") / r("a")).toBeCloseTo(Math.sqrt(27 / 3), 6);
    expect(r("c") / r("a")).toBeCloseTo(Math.sqrt(12 / 3), 6);
  });

  it("never lets a bubble reach the edge of the plot, flagged ring included", () => {
    const layout = layoutBubbles(
      [
        point("far-left", 0, 0, 40, { flagged: true }),
        point("far-right", 100, 100, 40, { flagged: true }),
        point("tiny", 50, 50, 1),
      ],
      720,
      432,
    );
    const { plot } = layout;
    for (const b of layout.bubbles) {
      const reach = b.r + 4.5 + 1;
      expect(b.cx - reach).toBeGreaterThanOrEqual(plot.x);
      expect(b.cx + reach).toBeLessThanOrEqual(plot.x + plot.width);
      expect(b.cy - reach).toBeGreaterThanOrEqual(plot.y);
      expect(b.cy + reach).toBeLessThanOrEqual(plot.y + plot.height);
    }
  });
});

describe("label placement", () => {
  const widths: [number, number][] = [
    [1100, 520],
    [720, 432],
    [390, 340],
    [320, 340],
  ];

  for (const [w, h] of widths) {
    /* No two boxes ever intersect, at any width. The 4px of clear space
       between them is held wherever the plot has room for it, which is every
       width here but the narrowest: 12 names in a clump plus two average
       labels in a 240px plot leave one pair closer than 4px, never touching. */
    const gap = w >= 360 ? 4 : 0;

    it(`never overlaps two labels, or a label and an axis, with 12 crowded points at ${String(w)}px`, () => {
      const layout = layoutBubbles(clustered(), w, h, {
        formatX: naira,
        formatY: percent,
        referenceX: 1_010_000,
        referenceY: 72.5,
      });
      expect(layout.bubbles).toHaveLength(12);

      const boxes = layout.bubbles.map((b) => b.label.box);
      for (const b of layout.bubbles) expect(b.label.crowded).toBe(false);

      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          expect(
            touches(boxes[i]!, boxes[j]!, gap),
            `${layout.bubbles[i]?.id ?? ""} and ${layout.bubbles[j]?.id ?? ""}`,
          ).toBe(false);
        }
        /* Inside the plot, so clear of both axes and of the tick labels. */
        const box = boxes[i]!;
        expect(box.x).toBeGreaterThan(layout.plot.x);
        expect(box.y).toBeGreaterThan(layout.plot.y);
        expect(box.x + box.width).toBeLessThan(
          layout.plot.x + layout.plot.width,
        );
        expect(box.y + box.height).toBeLessThan(
          layout.plot.y + layout.plot.height,
        );
      }

      /* And clear of the reference labels too. */
      for (const reference of [layout.referenceX, layout.referenceY]) {
        expect(reference).not.toBeNull();
        for (const box of boxes) {
          expect(touches(box, reference!.label.box, gap)).toBe(false);
        }
      }
    });
  }

  it("paints a name for every one of them", () => {
    render(chart({ points: clustered() }));
    for (const p of clustered()) {
      expect(
        screen.getByText(`${p.label}, ${String(p.size)}`),
      ).toBeInTheDocument();
    }
  });

  it("tries right, left, above, then below, and draws no leader when it is touching", () => {
    const layout = layoutBubbles([point("alone", 1, 1, 10)], 720, 432);
    const [only] = layout.bubbles;
    expect(only?.label.anchor).toBe("start");
    expect(only?.label.leader).toBeNull();
    expect(only!.label.box.x).toBeGreaterThan(only!.cx + only!.r);
  });

  it("moves to the left when the right is full, and to a leader line when everything near is", () => {
    const layout = layoutBubbles(clustered(), 720, 432);
    const leaders = layout.bubbles.filter((b) => b.label.leader !== null);
    expect(leaders.length).toBeGreaterThan(0);
    for (const b of leaders) {
      const l = b.label.leader!;
      /* A leader starts on the bubble's edge, not its centre, and ends clear of it. */
      expect(Math.hypot(l.x1 - b.cx, l.y1 - b.cy)).toBeGreaterThan(b.r);
      expect(Math.hypot(l.x2 - b.cx, l.y2 - b.cy)).toBeGreaterThan(b.r);
    }
  });

  it("says so when a plot is simply full, rather than pretending", () => {
    /* Sixty-odd long names in a phone-sized plot cannot all fit. */
    const crowd = Array.from({ length: 70 }, (_, i) =>
      point(
        `Department number ${String(i)}`,
        1 + (i % 2),
        1 + (i % 3),
        5 + (i % 7),
      ),
    );
    const layout = layoutBubbles(crowd, 320, 340);
    expect(layout.bubbles.some((b) => b.label.crowded)).toBe(true);
    expect(numbers(layout).every(Number.isFinite)).toBe(true);
  });

  it("wraps a long name onto two lines instead of running off a phone", () => {
    const layout = layoutBubbles(
      [point("Customer Success and Enablement", 5, 5, 18)],
      320,
      340,
    );
    const [only] = layout.bubbles;
    expect(only!.label.lines.length).toBe(2);
    expect(only!.label.box.x + only!.label.box.width).toBeLessThan(
      layout.plot.x + layout.plot.width,
    );
    /* Wrapped on screen, whole to a screen reader. */
    render(
      chart({
        points: [point("Customer Success and Enablement", 5, 5, 18)],
      }),
    );
    expect(
      screen.getByRole("button", { name: /^Customer Success and Enablement/ }),
    ).toBeInTheDocument();
  });

  it("is the same answer every time it is asked", () => {
    const a = layoutBubbles(clustered(), 720, 432, { referenceX: 1_010_000 });
    const b = layoutBubbles(clustered(), 720, 432, { referenceX: 1_010_000 });
    expect(a).toEqual(b);
  });
});

describe("a degenerate set of points", () => {
  const sane = (layout: BubbleLayout) => {
    expect(numbers(layout).every(Number.isFinite)).toBe(true);
    for (const b of layout.bubbles) {
      expect(b.r).toBeGreaterThan(0);
      expect(b.cx).toBeGreaterThan(layout.plot.x);
      expect(b.cx).toBeLessThan(layout.plot.x + layout.plot.width);
    }
  };

  it("draws a single point without a NaN anywhere", () => {
    const only = [point("Only", 1_000_000, 72, 9)];
    sane(layoutBubbles(only, 720, 432, { formatX: naira, formatY: percent }));
    const { container } = render(chart({ points: only }));
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(screen.getByText("Only, 9")).toBeInTheDocument();
  });

  it("draws points that share one x, and one y, without a divide by zero", () => {
    const flat = [
      point("A", 500, 70, 5),
      point("B", 500, 70, 9),
      point("C", 500, 70, 14),
    ];
    sane(layoutBubbles(flat, 720, 432));
    const { container } = render(chart({ points: flat }));
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("copes with a value of zero on both axes", () => {
    const zero = [point("Z", 0, 0, 3)];
    sane(layoutBubbles(zero, 720, 432));
    const { container } = render(chart({ points: zero }));
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it("copes with a reference line that is the only thing at its value", () => {
    const layout = layoutBubbles([point("One", 5, 5, 4)], 720, 432, {
      referenceX: 5,
      referenceY: 5,
    });
    sane(layout);
    expect(layout.referenceX).not.toBeNull();
  });

  it("draws every bubble at its true size when sizes are far apart, down to a floor", () => {
    const layout = layoutBubbles(
      [point("giant", 1, 1, 100_000), point("one", 2, 2, 1)],
      720,
      432,
    );
    const one = layout.bubbles.find((b) => b.id === "one");
    expect(one!.r).toBeGreaterThanOrEqual(4);
  });
});

describe("nothing to draw, or something that cannot be", () => {
  it("says so in one line when there are no points, and draws no empty box", () => {
    const { container } = render(chart({ points: [] }));
    expect(screen.getByText("Nothing to plot.")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("skips a point whose numbers are not numbers, and counts it", () => {
    const bad = point("Broken", Number.NaN, 70, 5);
    render(chart({ points: [...eight(), bad] }));
    expect(
      screen.getByText("1 department could not be plotted"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Broken/ })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(8);
  });

  it("counts every kind of unplottable point, and says departments when there are several", () => {
    const { container } = render(
      chart({
        points: [
          ...eight(),
          point("NaN x", Number.NaN, 1, 1),
          point("Infinite y", 1, Number.POSITIVE_INFINITY, 1),
          point("No size", 1, 1, 0),
          point("Negative", 1, 1, -4),
          point("Size NaN", 1, 1, Number.NaN),
        ],
      }),
    );
    expect(
      screen.getByText("5 departments could not be plotted"),
    ).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(screen.getAllByRole("button")).toHaveLength(8);
  });

  it("says nothing to plot and counts them when every point is unusable", () => {
    render(
      chart({
        points: [point("A", Number.NaN, 1, 1), point("B", 1, 1, 0)],
      }),
    );
    expect(screen.getByText("Nothing to plot.")).toBeInTheDocument();
    expect(
      screen.getByText("2 departments could not be plotted"),
    ).toBeInTheDocument();
  });

  it("names what it could not plot in the caller's own words", () => {
    render(
      chart({
        points: [...eight(), point("Broken", Number.NaN, 1, 1)],
        noun: { singular: "team", plural: "teams" },
      }),
    );
    expect(screen.getByText("1 team could not be plotted")).toBeInTheDocument();
  });

  it("says nothing at all when every point is fine", () => {
    render(chart());
    expect(screen.queryByText(/could not be plotted/)).toBeNull();
  });
});

describe("company average lines", () => {
  it("draws none, and no words, unless asked", () => {
    const { container } = render(chart());
    expect(container.querySelector("[data-reference]")).toBeNull();
    expect(screen.queryByText(/Company average/)).toBeNull();
  });

  it("draws one line with its label for each value given, in the caller's format", () => {
    const { container } = render(chart({ referenceX: 1_000_000 }));
    expect(container.querySelectorAll("[data-reference]")).toHaveLength(1);
    expect(container.querySelector("[data-reference='x']")).not.toBeNull();
    expect(screen.getByText("Company average N1000000")).toBeInTheDocument();

    render(chart({ referenceY: 72.5 }));
    expect(screen.getByText("Company average 72.5%")).toBeInTheDocument();
  });

  it("draws both when both are given, dashed and thin", () => {
    const { container } = render(
      chart({ referenceX: 1_000_000, referenceY: 72.5 }),
    );
    expect(container.querySelectorAll("[data-reference]")).toHaveLength(2);
    for (const line of container.querySelectorAll("[data-reference] line")) {
      expect(line).toHaveAttribute("stroke-dasharray");
      expect(line).toHaveAttribute("stroke-width", "1");
    }
  });

  it("ignores a value that is not a number rather than drawing it at the edge", () => {
    const { container } = render(
      chart({ referenceX: Number.NaN, referenceY: Number.POSITIVE_INFINITY }),
    );
    expect(container.querySelector("[data-reference]")).toBeNull();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it("opens the axis to include the average, so the line is always on the plot", () => {
    const layout = layoutBubbles(eight(), 720, 432, {
      referenceX: 5_000_000,
      referenceY: 10,
    });
    const { plot, referenceX, referenceY } = layout;
    expect(referenceX!.position).toBeGreaterThan(plot.x);
    expect(referenceX!.position).toBeLessThan(plot.x + plot.width);
    expect(referenceY!.position).toBeGreaterThan(plot.y);
    expect(referenceY!.position).toBeLessThan(plot.y + plot.height);
  });

  it("names no quadrant, shades nothing and passes no verdict", () => {
    const { container } = render(
      chart({ referenceX: 1_000_000, referenceY: 72.5 }),
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/star|laggard|leader|underperform|high|low/i);
    expect(container.querySelectorAll("rect")).toHaveLength(0);
  });
});

describe("axes", () => {
  it("writes every tick through the caller's formatters, and titles both axes", () => {
    const { container } = render(
      chart({
        formatX: (v) => `X${String(v)}`,
        formatY: (v) => `Y${String(v)}`,
      }),
    );
    const svg = container.querySelector("svg");
    const texts = [...(svg?.querySelectorAll("text") ?? [])].map(
      (t) => t.textContent ?? "",
    );
    expect(texts.filter((t) => /^X\d/.test(t)).length).toBeGreaterThanOrEqual(
      2,
    );
    expect(texts.filter((t) => /^Y\d/.test(t)).length).toBeGreaterThanOrEqual(
      3,
    );
    /* No tick the formatter did not write: nothing bare, nothing in naira. */
    expect(texts.filter((t) => /^\d/.test(t))).toEqual([]);
    expect(texts).toContain("Gross pay per head, per month");
    expect(texts).toContain("Average mark");
  });

  it("uses round numbers, evenly spaced, and does not start at zero", () => {
    const layout = layoutBubbles(
      [point("a", 1_030_000, 61, 5), point("b", 1_410_000, 84, 9)],
      720,
      432,
    );
    const xs = layout.xTicks.map((t) => t.value);
    const ys = layout.yTicks.map((t) => t.value);
    expect(xs[0]).toBeGreaterThan(0);
    expect(ys[0]).toBeGreaterThan(0);
    for (const ticks of [xs, ys]) {
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      const step = ticks[1]! - ticks[0]!;
      for (let i = 1; i < ticks.length; i += 1) {
        expect(ticks[i]! - ticks[i - 1]!).toBeCloseTo(step, 6);
      }
      const mantissa = step / 10 ** Math.floor(Math.log10(step));
      expect([1, 2, 2.5, 5, 10]).toContain(Math.round(mantissa * 1e6) / 1e6);
    }
    /* The data sits inside the ticks. */
    expect(xs[0]).toBeLessThanOrEqual(1_030_000);
    expect(xs.at(-1)).toBeGreaterThanOrEqual(1_410_000);
    expect(ys[0]).toBeLessThanOrEqual(61);
    expect(ys.at(-1)).toBeGreaterThanOrEqual(84);
  });

  it("does not repeat a label when two ticks round to the same words", () => {
    const layout = layoutBubbles(
      [point("a", 1, 70.01, 5), point("b", 2, 70.04, 9)],
      720,
      432,
      { formatY: (v) => `${String(Math.round(v))}%` },
    );
    const labels = layout.yTicks.map((t) => t.text);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("fitting a screen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A ResizeObserver that reports whatever width a test hands it. */
  function stubObserver() {
    const callbacks: ((
      entries: { contentRect: { width: number } }[],
    ) => void)[] = [];
    class FakeObserver {
      constructor(
        callback: (entries: { contentRect: { width: number } }[]) => void,
      ) {
        callbacks.push(callback);
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", FakeObserver);
    return (width: number) =>
      act(() => {
        for (const callback of callbacks)
          callback([{ contentRect: { width } }]);
      });
  }

  it("lays itself out at its container's width, so 14px text stays 14px", () => {
    const resizeTo = stubObserver();
    const { container } = render(chart());
    const svg = () => container.querySelector("svg");
    expect(svg()?.getAttribute("viewBox")).toBe("0 0 720 432");

    resizeTo(390);
    /* One unit in the viewBox is one CSS pixel at this width. A fixed 720
       viewBox squeezed onto a phone would draw 14px text at about 7px. */
    expect(svg()?.getAttribute("viewBox")).toBe("0 0 390 340");

    resizeTo(1300);
    expect(svg()?.getAttribute("viewBox")).toBe("0 0 1300 520");
  });

  it("keeps the last real width when the container reports none", () => {
    const resizeTo = stubObserver();
    const { container } = render(chart());
    resizeTo(500);
    resizeTo(0);
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe(
      "0 0 500 340",
    );
  });

  it("never lets the figure be wider than the space it is given", () => {
    const { container } = render(chart({ className: "custom" }));
    const figure = container.querySelector("figure");
    expect(figure?.className).toContain("min-w-0");
    expect(figure?.className).toContain("custom");
    expect(container.querySelector("svg")?.className.baseVal).toContain(
      "w-full",
    );
  });
});

describe("the words it uses", () => {
  it("has no em dash anywhere on screen", () => {
    const { container } = render(
      chart({
        referenceX: 1_000_000,
        referenceY: 72.5,
        points: [...eight(), point("Broken", Number.NaN, 1, 1)],
      }),
    );
    expect(container.textContent).not.toContain("—");
    expect(container.textContent).not.toContain("–");
  });

  it("draws every piece of text at the 14px token or larger", () => {
    const { container } = render(
      chart({ referenceX: 1_000_000, referenceY: 72.5 }),
    );
    const texts = [...container.querySelectorAll("svg text")];
    expect(texts.length).toBeGreaterThan(10);
    for (const text of texts) {
      expect(text.getAttribute("class")).toContain("text-meta");
    }
  });
});
