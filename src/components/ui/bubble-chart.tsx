"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/*
 * A bubble chart, drawn by hand like the rest of `chart.tsx`: no chart library,
 * palette tokens only, a visually hidden table for anybody not looking at it.
 *
 * ## What it is for, and what it must never say
 *
 * One bubble per group (a department), x and y chosen by the caller, bubble
 * AREA the group's size. It shows where groups sit relative to each other and
 * to the company average, and nothing else. There are deliberately no quadrant
 * names, no shaded regions and no words like "stars" or "laggards": a chart
 * that labels a corner has made a judgement about the people in it, and the
 * caller never asked it to. The two reference lines are context, not dividers.
 *
 * ## One label per bubble, always, and never on top of another
 *
 * The 3D chart this replaces left one department with no name beside it, which
 * made every other bubble unreadable too: a picture you cannot decode is worse
 * than a table. So every bubble carries visible text, and `layoutBubbles`
 * decides where it goes, deterministically:
 *
 *   1. the four spots touching the bubble (right, left, above, below);
 *   2. the same spots pushed outwards in steps, at twelve more angles, with a
 *      thin leader line back to the bubble;
 *   3. the same again but allowed to sit over a neighbouring bubble (the fill
 *      is translucent and the text has a halo, so it still reads);
 *   4. if the plot is simply full, the spot with the least overlap, and the
 *      label says so (`crowded`) rather than pretending.
 *
 * Tiers 1 and 2 never overlap another label, a reference-line label or the plot
 * edge, which is the property the tests assert. Tier 4 is the honest limit: a
 * plot only so big holds only so many names, and the answer there is a wider
 * container or fewer groups, not a smaller font.
 *
 * ## Real pixels, not a scaled picture
 *
 * The viewBox is the container's measured width, so one unit is one CSS pixel
 * and the 14px type floor holds at 320px and at 1,440px alike. A fixed 720 unit
 * viewBox scaled down to a phone would render 14px labels at 7px. Until the
 * first measurement (and on the server, and in jsdom, which has no layout) the
 * chart lays itself out at `DEFAULT_WIDTH`.
 *
 * ## Absent is not zero
 *
 * A point whose x, y or size is not a finite number, or whose size is not
 * above zero, is not drawn at all and is **counted** in a sentence under the
 * chart. Drawing it at the origin, or as a speck, would be a claim about a
 * department we know nothing about; dropping it silently would be a claim that
 * it does not exist.
 */

/* -------------------------------------------------------------------------- */
/* Public shape                                                                */
/* -------------------------------------------------------------------------- */

export type BubblePoint = {
  id: string;
  /** The department's name. Always drawn as visible text next to the bubble. */
  label: string;
  x: number;
  y: number;
  /** Headcount. Bubble AREA is proportional to it (so radius goes as its square root). */
  size: number;
  /** Ochre ring plus the word "flagged" on the visible label and the accessible name. Never colour alone. */
  flagged?: boolean;
  /** The full sentence a screen reader and the hover title say. The caller builds it, so the chart never formats money or marks itself. */
  detail: string;
};

export type BubbleChartProps = {
  points: readonly BubblePoint[];
  /** Axis titles with units, e.g. "Gross pay per head, per month" and "Average mark". */
  xLabel: string;
  yLabel: string;
  /** The caller formats ticks: the chart knows nothing about naira or percent. */
  formatX: (value: number) => string;
  formatY: (value: number) => string;
  /** Company mean lines. Optional. Thin, muted, dashed, labelled "Company average". */
  referenceX?: number;
  referenceY?: number;
  /** Visible title above the plot, and the basis of the accessible name. */
  title: string;
  /** One sentence for assistive tech: how many bubbles, what the axes are. Not drawn. */
  summary: string;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /**
   * What a group is called in "1 department could not be plotted". Defaults to
   * department, which is the only caller today.
   */
  noun?: { singular: string; plural: string };
  className?: string;
};

/* -------------------------------------------------------------------------- */
/* Layout: pure, so it can be asserted without a DOM                           */
/* -------------------------------------------------------------------------- */

export type Box = { x: number; y: number; width: number; height: number };

export type Leader = { x1: number; y1: number; x2: number; y2: number };

export type PlacedText = {
  /** Already wrapped. One entry for most labels. */
  lines: string[];
  anchor: "start" | "middle" | "end";
  /** The x every line is anchored on, and the baseline of the first line. */
  x: number;
  y: number;
  box: Box;
};

export type PlacedLabel = PlacedText & {
  /** A thin line back to the bubble, only when the label sits clear of it. */
  leader: Leader | null;
  /** True only when no free spot existed and this label overlaps another. */
  crowded: boolean;
};

export type PlacedBubble = {
  id: string;
  /** Position in the caller's list. */
  index: number;
  point: BubblePoint;
  cx: number;
  cy: number;
  r: number;
  label: PlacedLabel;
};

export type Tick = { value: number; position: number; text: string };

export type BubbleLayout = {
  width: number;
  height: number;
  /** The axis rectangle. Tick labels and axis titles sit outside it. */
  plot: Box;
  /** Paint order: largest first, so a small bubble is never hidden by a big one. */
  bubbles: PlacedBubble[];
  xTicks: Tick[];
  yTicks: Tick[];
  /** Present only when a finite reference value was given. */
  referenceX: { position: number; label: PlacedText } | null;
  referenceY: { position: number; label: PlacedText } | null;
  /** Points that could not be drawn. */
  skipped: number;
};

export type LayoutOptions = {
  formatX?: (value: number) => string;
  formatY?: (value: number) => string;
  referenceX?: number;
  referenceY?: number;
};

/**
 * Text width cannot be measured here: the server and jsdom have no layout, and
 * a measured width would make the first paint differ from the second. So it is
 * estimated, at the 14px floor. Geist averages about 7.7px a letter and 8.4px
 * a digit at that size, and 8.5px a character errs on the wide side, which only
 * ever means labels sit a little further apart than strictly necessary. The
 * estimate was checked against `getBBox` in a real browser (see the note in the
 * test file) rather than trusted.
 */
export const CHAR_PX = 8.5;
/** One line of 14px text and its leading. */
export const LINE_PX = 18;
/** From the top of a text box to the first baseline. */
const BASELINE_PX = 13.5;
/** Clear space kept between two label boxes. */
const GAP_PX = 4;
/** Smallest a bubble is ever drawn. See `radiusFor`. */
const MIN_RADIUS = 4;

export const DEFAULT_WIDTH = 720;
const MIN_WIDTH = 240;
const MAX_WIDTH = 1600;

const MARGIN_TOP = 10;
/* Tick labels (a row) and the x axis title (a row) both live below the plot. */
const MARGIN_BOTTOM = 56;
/* The rotated y axis title lives left of the tick labels. */
const Y_TITLE_PX = 24;

/** Height follows width, with a floor so a phone still gets a usable plot. */
export const heightFor = (width: number): number =>
  clamp(Math.round(width * 0.6), 340, 520);

const clamp = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), high);

const textWidth = (text: string): number => Math.ceil(text.length * CHAR_PX);

const finiteOrNull = (value: number | undefined): number | null =>
  value !== undefined && Number.isFinite(value) ? value : null;

/** Whether a point can be drawn at all. Size must be above zero: a bubble of no area is no bubble. */
export const isPlottable = (point: BubblePoint): boolean =>
  Number.isFinite(point.x) &&
  Number.isFinite(point.y) &&
  Number.isFinite(point.size) &&
  point.size > 0;

const countText = (size: number): string =>
  Number.isInteger(size) ? String(size) : String(Math.round(size * 10) / 10);

/** The visible text beside a bubble: "Finance, 12", and ", flagged" where it is. */
export const labelTextFor = (point: BubblePoint): string =>
  `${point.label}, ${countText(point.size)}${point.flagged ? ", flagged" : ""}`;

/** The accessible name. `detail` as given, plus the word the visible label also carries. */
export const accessibleNameFor = (point: BubblePoint): string =>
  point.flagged ? `${point.detail}, flagged` : point.detail;

const ELLIPSIS = "…";

const truncate = (text: string, maxChars: number): string =>
  text.length <= maxChars
    ? text
    : `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}${ELLIPSIS}`;

/**
 * Greedy word wrap into at most `maxLines`, each at most `maxChars`. A label
 * wraps before it is shortened, and is shortened only past that: a phone is
 * narrow and "Customer Success, 18" is a real name.
 */
function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    const next = current === "" ? word : `${current} ${word}`;
    if (current === "" || next.length <= maxChars) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  const kept =
    lines.length <= maxLines
      ? lines
      : [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(" ")];
  return kept.map((line) => truncate(line, maxChars));
}

const measure = (lines: readonly string[]): { w: number; h: number } => ({
  w: Math.max(0, ...lines.map(textWidth)),
  h: lines.length * LINE_PX,
});

const anchorX = (box: Box, anchor: PlacedText["anchor"]): number =>
  anchor === "start"
    ? box.x
    : anchor === "end"
      ? box.x + box.width
      : box.x + box.width / 2;

const intersects = (a: Box, b: Box, gap: number): boolean =>
  a.x < b.x + b.width + gap &&
  b.x < a.x + a.width + gap &&
  a.y < b.y + b.height + gap &&
  b.y < a.y + a.height + gap;

const overlapArea = (a: Box, b: Box): number => {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};

type Circle = { cx: number; cy: number; r: number };

const hitsCircle = (box: Box, circle: Circle, margin: number): boolean => {
  const nx = clamp(circle.cx, box.x, box.x + box.width);
  const ny = clamp(circle.cy, box.y, box.y + box.height);
  return (
    (nx - circle.cx) ** 2 + (ny - circle.cy) ** 2 < (circle.r + margin) ** 2
  );
};

const inside = (box: Box, region: Box): boolean =>
  box.x >= region.x - 0.5 &&
  box.y >= region.y - 0.5 &&
  box.x + box.width <= region.x + region.width + 0.5 &&
  box.y + box.height <= region.y + region.height + 0.5;

/* ---- Scales ---------------------------------------------------------------- */

/**
 * The smallest "nice" step (1, 2, 2.5, 5 times a power of ten) at or above
 * `raw`. `chart.tsx`'s `niceCeiling` does the same thing for one end of a
 * zero-based axis; this axis starts wherever the data does, so it needs the
 * step rather than the ceiling.
 */
function niceStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  for (const factor of [1, 2, 2.5, 5, 10]) {
    if (raw <= factor * magnitude * (1 + 1e-9)) return factor * magnitude;
  }
  return 10 * magnitude;
}

type Scale = { lo: number; hi: number; ticks: number[] };

/**
 * A round-numbered axis around [min, max], with at most `maxTicks` ticks.
 *
 * It does **not** start at zero: a mean mark of 61 to 84 drawn from 0 is a
 * chart of empty space, and these axes are labelled with their own numbers so
 * nobody has to guess where they start. When everything is equal (one point,
 * or a department list with one cost per head) the range is opened up by a tenth
 * either side, so a divide by zero never reaches the picture.
 */
function niceScale(min: number, max: number, maxTicks: number): Scale {
  let lo = min;
  let hi = max;
  if (!(hi > lo)) {
    const half = lo === 0 ? 1 : Math.abs(lo) * 0.1;
    lo -= half;
    hi += half;
  }
  const limit = Math.max(2, maxTicks);
  let step = niceStep((hi - lo) / (limit - 1));
  let start = 0;
  let count = 0;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    start = Math.floor(lo / step + 1e-9) * step;
    const end = Math.ceil(hi / step - 1e-9) * step;
    count = Math.round((end - start) / step) + 1;
    if (count <= limit) break;
    step = niceStep(step * 1.001);
  }
  return {
    lo: Number(start.toPrecision(12)),
    hi: Number((start + (count - 1) * step).toPrecision(12)),
    ticks: Array.from({ length: count }, (_, i) =>
      Number((start + i * step).toPrecision(12)),
    ),
  };
}

/** Ticks with their text. A tick whose text repeats the one before is dropped: two "73%" in a row say nothing. */
function labelled(
  ticks: readonly number[],
  position: (value: number) => number,
  format: (value: number) => string,
): Tick[] {
  const out: Tick[] = [];
  for (const value of ticks) {
    const text = format(value);
    if (out[out.length - 1]?.text === text) continue;
    out.push({ value, position: position(value), text });
  }
  return out;
}

/* ---- Label placement -------------------------------------------------------- */

/* Degrees clockwise from east, in screen space (y grows downwards). The first
   four are right, left, above, below, in that order; then the four diagonals;
   then the eight in between. */
const ANGLES = [
  0, 180, 270, 90, 315, 45, 225, 135, 330, 30, 210, 150, 300, 60, 240, 120,
];
/* How far past touching a label may be pushed, in px. 0 is adjacent. */
const PUSH = [0, 10, 22, 36, 54, 76, 104, 140, 180];
/* A leader line is drawn only when the label is at least this far clear. */
const LEADER_MIN = 8;

type Candidate = {
  box: Box;
  anchor: PlacedText["anchor"];
  leader: Leader | null;
};

function candidateAt(
  circle: Circle,
  ringPx: number,
  size: { w: number; h: number },
  angleDeg: number,
  push: number,
  region: Box,
): Candidate {
  const reach = circle.r + ringPx + push;
  const rad = (angleDeg * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const px = circle.cx + ux * reach;
  const py = circle.cy + uy * reach;

  const anchor: Candidate["anchor"] =
    ux > 0.4 ? "start" : ux < -0.4 ? "end" : "middle";
  const rawX = ux > 0.4 ? px : ux < -0.4 ? px - size.w : px - size.w / 2;
  const rawY = uy > 0.4 ? py : uy < -0.4 ? py - size.h : py - size.h / 2;

  /* Pushed back inside the plot rather than rejected, so a bubble at the edge
     still gets its four adjacent spots. If that lands the label on its own
     bubble the overlap test below rejects it. */
  const box: Box = {
    x: clamp(
      rawX,
      region.x,
      Math.max(region.x, region.x + region.width - size.w),
    ),
    y: clamp(
      rawY,
      region.y,
      Math.max(region.y, region.y + region.height - size.h),
    ),
    width: size.w,
    height: size.h,
  };

  let leader: Leader | null = null;
  const nx = clamp(circle.cx, box.x, box.x + box.width);
  const ny = clamp(circle.cy, box.y, box.y + box.height);
  const dx = nx - circle.cx;
  const dy = ny - circle.cy;
  const dist = Math.hypot(dx, dy);
  const edge = circle.r + ringPx;
  if (dist - edge > LEADER_MIN) {
    leader = {
      x1: circle.cx + (dx / dist) * edge,
      y1: circle.cy + (dy / dist) * edge,
      x2: nx - (dx / dist) * 3,
      y2: ny - (dy / dist) * 3,
    };
  }
  return { box, anchor, leader };
}

function placeLabel(args: {
  index: number;
  circles: readonly Circle[];
  ringPx: number;
  size: { w: number; h: number };
  placed: readonly Box[];
  region: Box;
}): { candidate: Candidate; crowded: boolean } {
  const { index, circles, ringPx, size, placed, region } = args;
  const own = circles[index];
  if (own === undefined)
    throw new Error("placeLabel: no circle for this bubble");

  const all: Candidate[] = [];
  for (const push of PUSH) {
    for (const angle of ANGLES) {
      all.push(candidateAt(own, ringPx, size, angle, push, region));
    }
  }

  const clearOfLabels = (box: Box) =>
    inside(box, region) &&
    !placed.some((other) => intersects(box, other, GAP_PX));
  const clearOfOwn = (box: Box) => !hitsCircle(box, own, 2);
  const clearOfOthers = (box: Box) =>
    !circles.some((circle, j) => j !== index && hitsCircle(box, circle, 2));

  /* Strict first, across every distance: a label that touches nothing beats a
     label that is nearer but sits on a neighbour. Then allow the neighbour. */
  const strict = all.find(
    (c) => clearOfLabels(c.box) && clearOfOwn(c.box) && clearOfOthers(c.box),
  );
  if (strict) return { candidate: strict, crowded: false };
  const relaxed = all.find((c) => clearOfLabels(c.box) && clearOfOwn(c.box));
  if (relaxed) return { candidate: relaxed, crowded: false };

  /* Nothing is free. Take the least bad and say so. */
  let best = all[0];
  let bestScore = Number.POSITIVE_INFINITY;
  let bestOverlap = 0;
  for (const c of all) {
    const labelOverlap = placed.reduce(
      (sum, other) => sum + overlapArea(c.box, other),
      0,
    );
    const outside = inside(c.box, region) ? 0 : 1;
    const score =
      labelOverlap +
      (clearOfOwn(c.box) ? 0 : 5000) +
      (clearOfOthers(c.box) ? 0 : 300) +
      outside * 2000;
    if (score < bestScore) {
      best = c;
      bestScore = score;
      bestOverlap = labelOverlap;
    }
  }
  if (best === undefined) throw new Error("placeLabel: no candidates");
  return { candidate: best, crowded: bestOverlap > 0 };
}

/** A fixed label (the reference lines'): first spot that is free, else first that is at least in bounds. */
function placeFixed(args: {
  lines: string[];
  spots: readonly { x: number; y: number; anchor: PlacedText["anchor"] }[];
  region: Box;
  reserved: readonly Box[];
  circles: readonly Circle[];
}): PlacedText {
  const { lines, spots, region, reserved, circles } = args;
  const size = measure(lines);
  const make = (spot: (typeof spots)[number]): PlacedText => {
    const x =
      spot.anchor === "start"
        ? spot.x
        : spot.anchor === "end"
          ? spot.x - size.w
          : spot.x - size.w / 2;
    const box: Box = {
      x: clamp(
        x,
        region.x,
        Math.max(region.x, region.x + region.width - size.w),
      ),
      y: clamp(
        spot.y,
        region.y,
        Math.max(region.y, region.y + region.height - size.h),
      ),
      width: size.w,
      height: size.h,
    };
    return {
      lines,
      anchor: spot.anchor,
      x: anchorX(box, spot.anchor),
      y: box.y + BASELINE_PX,
      box,
    };
  };
  const options = spots.map(make);
  const free = options.find(
    (o) =>
      !reserved.some((box) => intersects(o.box, box, GAP_PX)) &&
      !circles.some((circle) => hitsCircle(o.box, circle, 2)),
  );
  const clear = options.find(
    (o) => !reserved.some((box) => intersects(o.box, box, GAP_PX)),
  );
  const first = options[0];
  if (first === undefined) throw new Error("placeFixed: no spots");
  return free ?? clear ?? first;
}

/**
 * Everything the chart draws, as numbers. Pure: the same input gives the same
 * output, and nothing here reads a DOM.
 *
 * `width` and `height` are the picture's size in pixels. The component passes
 * its measured width; a test passes whatever it wants to exercise.
 */
export function layoutBubbles(
  points: readonly BubblePoint[],
  width: number,
  height: number,
  options: LayoutOptions = {},
): BubbleLayout {
  const formatX = options.formatX ?? String;
  const formatY = options.formatY ?? String;
  const refX = finiteOrNull(options.referenceX);
  const refY = finiteOrNull(options.referenceY);

  const plotted = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => isPlottable(point));
  const skipped = points.length - plotted.length;

  const plotTop = MARGIN_TOP;
  const plotHeight = Math.max(120, height - MARGIN_TOP - MARGIN_BOTTOM);

  if (plotted.length === 0) {
    return {
      width,
      height,
      plot: {
        x: 40,
        y: plotTop,
        width: Math.max(120, width - 56),
        height: plotHeight,
      },
      bubbles: [],
      xTicks: [],
      yTicks: [],
      referenceX: null,
      referenceY: null,
      skipped,
    };
  }

  const xs = plotted.map(({ point }) => point.x);
  const ys = plotted.map(({ point }) => point.y);
  if (refX !== null) xs.push(refX);
  if (refY !== null) ys.push(refY);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);

  /* The y ticks come first because their widest label decides the left margin,
     and the left margin decides how wide the plot is. They depend only on the
     height, so there is no loop. */
  const yScale = niceScale(
    yMin,
    yMax,
    clamp(Math.floor(plotHeight / 44), 3, 7),
  );
  const yTexts = yScale.ticks.map(formatY);
  const yLabelPx = Math.max(0, ...yTexts.map(textWidth));
  const left = Y_TITLE_PX + yLabelPx + 10;

  /* The x labels are centred on their ticks, so the last one hangs over the
     plot's right edge by half its width less the padding inside the plot. The
     right margin is that overhang, estimated from the labels at the data's own
     ends (tick labels are the same kind of number, so the same width). */
  const xLabelPx = Math.max(
    textWidth(formatX(xMin)),
    textWidth(formatX(xMax)),
    ...(refX === null ? [] : [textWidth(formatX(refX))]),
  );
  const right = clamp(Math.ceil(xLabelPx / 2) - 14, 12, 56);
  const plot: Box = {
    x: left,
    y: plotTop,
    width: Math.max(120, width - left - right),
    height: plotHeight,
  };
  const xScale = niceScale(
    xMin,
    xMax,
    clamp(Math.floor(plot.width / (xLabelPx + 18)), 2, 7),
  );

  /* Area is proportional to size, so radius goes as its square root. The
     largest bubble gets `rMax` and everything else is relative to it, which is
     why the ratio of two radii is exactly the square root of the ratio of their
     sizes. MIN_RADIUS is a floor for the case where the largest is more than
     about 100 times the smallest: a one-person department must still be
     visible, and the floor only ever bites there. */
  const sizeMax = Math.max(...plotted.map(({ point }) => point.size));
  const rMax = clamp(Math.min(plot.width, plot.height) * 0.1, 12, 40);
  const radiusFor = (size: number) =>
    Math.max(MIN_RADIUS, rMax * Math.sqrt(size / sizeMax));

  /* Positions are inset by the largest radius (plus room for the flag ring), so
     whatever the data, no bubble can reach the edge of the plot. */
  const pad = rMax + 6;
  const spanX = Math.max(1, plot.width - 2 * pad);
  const spanY = Math.max(1, plot.height - 2 * pad);
  const xPos = (value: number) =>
    plot.x + pad + ((value - xScale.lo) / (xScale.hi - xScale.lo)) * spanX;
  const yPos = (value: number) =>
    plot.y + pad + (1 - (value - yScale.lo) / (yScale.hi - yScale.lo)) * spanY;

  const region: Box = {
    x: plot.x + 3,
    y: plot.y + 3,
    width: plot.width - 6,
    height: plot.height - 6,
  };

  /* Largest first. Ties keep the caller's order, so the layout is stable. */
  const ordered = [...plotted].sort(
    (a, b) => b.point.size - a.point.size || a.index - b.index,
  );
  const circles: Circle[] = ordered.map(({ point }) => ({
    cx: xPos(point.x),
    cy: yPos(point.y),
    r: radiusFor(point.size),
  }));

  /* The reference labels are placed before any bubble's, so they are the
     fixed furniture the bubble labels route around. */
  const maxRefChars = Math.max(
    16,
    Math.floor(Math.min(plot.width * 0.5, 260) / CHAR_PX),
  );
  const reserved: Box[] = [];
  let referenceX: BubbleLayout["referenceX"] = null;
  let referenceY: BubbleLayout["referenceY"] = null;
  if (refX !== null) {
    const position = xPos(refX);
    const label = placeFixed({
      lines: wrapLines(`Company average ${formatX(refX)}`, maxRefChars, 3),
      spots: [
        { x: position + 6, y: plot.y + 4, anchor: "start" },
        { x: position - 6, y: plot.y + 4, anchor: "end" },
        { x: position + 6, y: plot.y + plot.height, anchor: "start" },
        { x: position - 6, y: plot.y + plot.height, anchor: "end" },
      ],
      region,
      reserved,
      circles,
    });
    reserved.push(label.box);
    referenceX = { position, label };
  }
  if (refY !== null) {
    const position = yPos(refY);
    const lines = wrapLines(`Company average ${formatY(refY)}`, maxRefChars, 3);
    const h = measure(lines).h;
    const label = placeFixed({
      lines,
      spots: [
        { x: plot.x + plot.width - 6, y: position - 3 - h, anchor: "end" },
        { x: plot.x + 6, y: position - 3 - h, anchor: "start" },
        { x: plot.x + plot.width - 6, y: position + 3, anchor: "end" },
        { x: plot.x + 6, y: position + 3, anchor: "start" },
      ],
      region,
      reserved,
      circles,
    });
    reserved.push(label.box);
    referenceY = { position, label };
  }

  /* The bubble labels. Greedy: each one takes the best spot left by the ones
     placed before it, so the ORDER decides what a crowded plot can hold. The
     first order is largest bubble first (the biggest gets the best spot). If
     that leaves any label with nowhere free, three more fixed orders are tried
     and the one with the fewest crowded labels wins. All four are
     deterministic, so the answer is still the same every time it is asked. */
  const maxLabelChars = Math.max(
    10,
    Math.floor(Math.min(plot.width * 0.65, 260) / CHAR_PX),
  );
  const wrapped = ordered.map(({ point }) =>
    wrapLines(labelTextFor(point), maxLabelChars, 2),
  );

  const labelAll = (order: readonly number[]) => {
    const placed: Box[] = [...reserved];
    const result: ReturnType<typeof placeLabel>[] = [];
    let crowdedCount = 0;
    for (const i of order) {
      const placement = placeLabel({
        index: i,
        circles,
        ringPx: ordered[i]?.point.flagged ? 8 : 5,
        size: measure(wrapped[i] ?? []),
        placed,
        region,
      });
      placed.push(placement.candidate.box);
      result[i] = placement;
      if (placement.crowded) crowdedCount += 1;
    }
    return { result, crowdedCount };
  };

  const identity = circles.map((_, i) => i);
  /* Gap to the nearest other bubble: the tightest ones are the hardest to
     place, so the second order does them first. */
  const nearest = circles.map((a, i) =>
    Math.min(
      ...circles.map((b, j) =>
        j === i
          ? Number.POSITIVE_INFINITY
          : Math.hypot(a.cx - b.cx, a.cy - b.cy) - a.r - b.r,
      ),
    ),
  );
  const orders: (readonly number[])[] = [
    identity,
    [...identity].sort(
      (a, b) => (nearest[a] ?? 0) - (nearest[b] ?? 0) || a - b,
    ),
    [...identity].sort(
      (a, b) =>
        (circles[a]?.cy ?? 0) - (circles[b]?.cy ?? 0) ||
        (circles[a]?.cx ?? 0) - (circles[b]?.cx ?? 0),
    ),
    [...identity].reverse(),
  ];
  let chosen = labelAll(orders[0] ?? identity);
  for (const order of orders.slice(1)) {
    if (chosen.crowdedCount === 0) break;
    const attempt = labelAll(order);
    if (attempt.crowdedCount < chosen.crowdedCount) chosen = attempt;
  }

  const bubbles: PlacedBubble[] = ordered.map(({ point, index }, i) => {
    const circle = circles[i];
    const placement = chosen.result[i];
    if (circle === undefined || placement === undefined) {
      throw new Error("layoutBubbles: a bubble was not placed");
    }
    const { candidate, crowded } = placement;
    return {
      id: point.id,
      index,
      point,
      cx: circle.cx,
      cy: circle.cy,
      r: circle.r,
      label: {
        lines: wrapped[i] ?? [],
        anchor: candidate.anchor,
        x: anchorX(candidate.box, candidate.anchor),
        y: candidate.box.y + BASELINE_PX,
        box: candidate.box,
        leader: candidate.leader,
        crowded,
      },
    };
  });

  return {
    width,
    height,
    plot,
    bubbles,
    xTicks: labelled(xScale.ticks, xPos, formatX),
    yTicks: labelled(yScale.ticks, yPos, formatY),
    referenceX,
    referenceY,
    skipped,
  };
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The container's width in pixels. Until the first observation (the server,
 * the first client render, jsdom) it is `DEFAULT_WIDTH`, so the first paint is
 * the same everywhere and nothing mismatches on hydration.
 */
function useMeasuredWidth() {
  const ref = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      /* A hidden tab reports 0. Keep the last real width rather than
         collapsing the chart to nothing. */
      const next = Math.floor(entry?.contentRect.width ?? 0);
      if (next > 0) setWidth(clamp(next, MIN_WIDTH, MAX_WIDTH));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const DEFAULT_NOUN = { singular: "department", plural: "departments" };

export function BubbleChart({
  points,
  xLabel,
  yLabel,
  formatX,
  formatY,
  referenceX,
  referenceY,
  title,
  summary,
  selectedId = null,
  onSelect,
  noun = DEFAULT_NOUN,
  className,
}: BubbleChartProps) {
  const [ref, width] = useMeasuredWidth();
  const height = heightFor(width);

  const layout = useMemo(
    () =>
      layoutBubbles(points, width, height, {
        formatX,
        formatY,
        ...(referenceX === undefined ? {} : { referenceX }),
        ...(referenceY === undefined ? {} : { referenceY }),
      }),
    [points, width, height, formatX, formatY, referenceX, referenceY],
  );

  const { plot, bubbles, skipped } = layout;
  const interactive = onSelect !== undefined;
  /* The sentence under the chart, and the one place the noun is used. */
  const skippedNote =
    skipped === 0
      ? null
      : `${String(skipped)} ${skipped === 1 ? noun.singular : noun.plural} could not be plotted`;

  if (bubbles.length === 0) {
    return (
      <figure ref={ref} className={cn("min-w-0", className)}>
        <p className="text-body-sm text-muted">Nothing to plot.</p>
        {skippedNote && (
          <p className="mt-1 text-meta text-muted">{skippedNote}</p>
        )}
      </figure>
    );
  }

  const xTitle = truncate(xLabel, Math.floor((width - 16) / CHAR_PX));
  const yTitle = truncate(yLabel, Math.floor(plot.height / CHAR_PX));
  const xTitleCentre = clamp(
    plot.x + plot.width / 2,
    textWidth(xTitle) / 2 + 8,
    width - textWidth(xTitle) / 2 - 8,
  );
  const tickRowY = plot.y + plot.height + 20;
  const titleRowY = plot.y + plot.height + 46;

  return (
    <figure ref={ref} className={cn("min-w-0", className)}>
      {/* The accessible name already carries the title, so the visible one is
          hidden from assistive tech rather than read twice. */}
      <p aria-hidden="true" className="mb-2 text-body-sm font-medium text-ink">
        {title}
      </p>

      {/* `role="img"` is the spec's name for "a picture with this description".
          The bubbles inside it are focusable buttons, and some screen readers
          treat the children of an image as decoration, so the same figures are
          also in the hidden table below. */}
      <svg
        role="img"
        aria-label={`${title}. ${summary}`}
        viewBox={`0 0 ${String(width)} ${String(height)}`}
        className="block h-auto w-full"
      >
        <g aria-hidden="true">
          {layout.yTicks.map((tick) => (
            <line
              key={`gy-${String(tick.value)}`}
              x1={plot.x}
              x2={plot.x + plot.width}
              y1={tick.position}
              y2={tick.position}
              stroke="var(--color-line)"
              strokeWidth={1}
            />
          ))}
          {layout.xTicks.map((tick) => (
            <line
              key={`gx-${String(tick.value)}`}
              x1={tick.position}
              x2={tick.position}
              y1={plot.y}
              y2={plot.y + plot.height}
              stroke="var(--color-line)"
              strokeWidth={1}
            />
          ))}
          <line
            x1={plot.x}
            x2={plot.x}
            y1={plot.y}
            y2={plot.y + plot.height}
            stroke="var(--color-line-strong)"
            strokeWidth={1}
          />
          <line
            x1={plot.x}
            x2={plot.x + plot.width}
            y1={plot.y + plot.height}
            y2={plot.y + plot.height}
            stroke="var(--color-line-strong)"
            strokeWidth={1}
          />

          {layout.yTicks.map((tick) => (
            <text
              key={`ty-${String(tick.value)}`}
              x={plot.x - 8}
              y={tick.position + 5}
              textAnchor="end"
              className="tabular text-meta"
              fill="var(--color-muted)"
            >
              {tick.text}
            </text>
          ))}
          {layout.xTicks.map((tick) => (
            <text
              key={`tx-${String(tick.value)}`}
              x={tick.position}
              y={tickRowY}
              textAnchor="middle"
              className="tabular text-meta"
              fill="var(--color-muted)"
            >
              {tick.text}
            </text>
          ))}

          <text
            x={xTitleCentre}
            y={titleRowY}
            textAnchor="middle"
            className="text-meta font-medium"
            fill="var(--color-body)"
          >
            {xTitle}
          </text>
          <text
            transform={`translate(17 ${String(plot.y + plot.height / 2)}) rotate(-90)`}
            textAnchor="middle"
            className="text-meta font-medium"
            fill="var(--color-body)"
          >
            {yTitle}
          </text>

          {/* Company averages: context, not dividers. Dashed and thin, and
              the word beside each says what it is. */}
          {layout.referenceX && (
            <g data-reference="x">
              <line
                x1={layout.referenceX.position}
                x2={layout.referenceX.position}
                y1={plot.y}
                y2={plot.y + plot.height}
                stroke="var(--color-control-line)"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <PlacedTextNode text={layout.referenceX.label} />
            </g>
          )}
          {layout.referenceY && (
            <g data-reference="y">
              <line
                x1={plot.x}
                x2={plot.x + plot.width}
                y1={layout.referenceY.position}
                y2={layout.referenceY.position}
                stroke="var(--color-control-line)"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <PlacedTextNode text={layout.referenceY.label} />
            </g>
          )}
        </g>

        {bubbles.map((bubble) => {
          const selected = selectedId === bubble.id;
          const flagged = bubble.point.flagged === true;
          return (
            <g
              key={bubble.id}
              role="button"
              tabIndex={0}
              aria-label={accessibleNameFor(bubble.point)}
              aria-pressed={interactive ? selected : undefined}
              data-bubble={bubble.id}
              className={cn(
                "group outline-none",
                interactive && "cursor-pointer",
              )}
              onClick={() => onSelect?.(bubble.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect?.(bubble.id);
                }
              }}
            >
              <title>{bubble.point.detail}</title>

              {bubble.label.leader && (
                <line
                  x1={bubble.label.leader.x1}
                  y1={bubble.label.leader.y1}
                  x2={bubble.label.leader.x2}
                  y2={bubble.label.leader.y2}
                  stroke="var(--color-control-line)"
                  strokeWidth={1}
                />
              )}

              {/* The keyboard focus ring: its own circle, because an outline
                  on an SVG group is drawn by some browsers and not others. */}
              <circle
                cx={bubble.cx}
                cy={bubble.cy}
                r={bubble.r + (flagged ? 10 : 7)}
                fill="none"
                stroke="none"
                strokeWidth={2}
                data-focus-ring=""
                className="group-focus-visible:[stroke:var(--color-accent-text)]"
              />
              {/* Ochre, plus the word on the label. The ring is the second
                  cue, never the only one. */}
              {flagged && (
                <circle
                  cx={bubble.cx}
                  cy={bubble.cy}
                  r={bubble.r + 4.5}
                  fill="none"
                  stroke="var(--color-warning-text)"
                  strokeWidth={2}
                  data-ring="flagged"
                />
              )}
              <circle
                cx={bubble.cx}
                cy={bubble.cy}
                r={bubble.r}
                fill="var(--color-accent-text)"
                fillOpacity={0.18}
                stroke="var(--color-accent-text)"
                strokeWidth={selected ? 3 : 1.5}
                data-disc=""
                data-selected={selected ? "true" : undefined}
                className={cn(interactive && "group-hover:[fill-opacity:0.3]")}
              />

              <text
                aria-hidden="true"
                x={bubble.label.x}
                y={bubble.label.y}
                textAnchor={bubble.label.anchor}
                className={cn("text-meta", selected && "font-semibold")}
                fill={selected ? "var(--color-ink)" : "var(--color-body)"}
                stroke="var(--color-surface)"
                strokeWidth={3}
                strokeLinejoin="round"
                paintOrder="stroke"
              >
                {bubble.label.lines.length === 1
                  ? bubble.label.lines[0]
                  : bubble.label.lines.map((line, i) => (
                      <tspan
                        key={line}
                        x={bubble.label.x}
                        dy={i === 0 ? 0 : LINE_PX}
                      >
                        {line}
                      </tspan>
                    ))}
              </text>
            </g>
          );
        })}
      </svg>

      {skippedNote && (
        <p className="mt-2 text-meta text-muted">{skippedNote}</p>
      )}

      {/* The same figures for anybody not looking at the picture. Same
          clipping wrapper as `chart.tsx`'s table, for the same reason: a
          `<table>` does not honour `width: 1px`. */}
      <div className="sr-only-focusable">
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">{xLabel}</th>
              <th scope="col">{yLabel}</th>
              <th scope="col">Size</th>
            </tr>
          </thead>
          <tbody>
            {[...bubbles]
              .sort((a, b) => a.index - b.index)
              .map(({ point }) => (
                <tr key={point.id}>
                  <th scope="row">
                    {point.flagged ? `${point.label}, flagged` : point.label}
                  </th>
                  <td>{formatX(point.x)}</td>
                  <td>{formatY(point.y)}</td>
                  <td>{countText(point.size)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/** A pre-placed text block (the reference labels), with the same halo as the bubble labels. */
function PlacedTextNode({ text }: { text: PlacedText }) {
  return (
    <text
      x={text.x}
      y={text.y}
      textAnchor={text.anchor}
      className="text-meta"
      fill="var(--color-muted)"
      stroke="var(--color-surface)"
      strokeWidth={3}
      strokeLinejoin="round"
      paintOrder="stroke"
    >
      {text.lines.length === 1
        ? text.lines[0]
        : text.lines.map((line, i) => (
            <tspan key={line} x={text.x} dy={i === 0 ? 0 : LINE_PX}>
              {line}
            </tspan>
          ))}
    </text>
  );
}
