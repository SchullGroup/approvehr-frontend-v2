import type { ApiOrgNode } from "@/lib/api/endpoints";

/**
 * Where every card and every line of the reporting chart goes.
 *
 * Pure geometry, no React: a card is a box, a line is a segment, and the whole
 * drawing is a list of each. That is what lets `tests/org-chart-layout.test.ts`
 * assert the properties that make a chart readable (no two cards overlap, every
 * card is joined to the one above it, a parent sits over its children) rather
 * than eyeballing a screenshot, and it keeps the component a thin renderer.
 *
 * ## The shape
 *
 * Top-down, the way an org chart is drawn: a card, a stub down to a bar, and a
 * drop from the bar to each card below. Two details make it survive a real
 * company rather than a five-person slide:
 *
 * - **People with nobody below them are stacked, not spread.** A manager with
 *   seventeen reports, fourteen of whom manage nobody, would otherwise be
 *   4,000px of cards in one row. Three or more such people hang in one column
 *   from a spine (`STACK_MIN`), and anybody who does manage people stays in
 *   the row, so the row holds the branches and the column holds the rest.
 * - **A card is centred over the span of its children, not over the whole
 *   block.** The bar then runs from the first drop to the last and the parent
 *   sits over its middle, which is the one thing every org chart has in common.
 *
 * ## Collapsing
 *
 * `openDepth` is how many levels show by default and `toggled` is the set of
 * people whose state differs from that default, so "expand all" and "collapse
 * all" are one number each and a single click is one id. A search ignores both
 * and opens the path to every match, because a match inside a closed branch is
 * a match nobody can see.
 *
 * ## Several people at the top
 *
 * One person with no manager is the root. More than one is a company that has
 * not filled in everybody's manager, and drawing them as a row of separate
 * trees would be a row of 27 unrelated cards. They hang from a group card that
 * says so in words, which is true, rather than being ranked under a name that
 * is not theirs.
 *
 * No pay is read or drawn here: `ApiOrgNode` carries none, deliberately.
 */

export const CARD_W = 256;
export const CARD_H = 80;
/** The "no manager set" card at the top is a label, not a person. */
export const GROUP_H = 56;
export const GAP_X = 24;
/** From the bottom of a card to the top of the cards it leads. The bar sits in the middle. */
export const GAP_Y = 48;
export const STACK_GAP = 24;
/** How many people with nobody below them it takes before they hang in a column. */
export const STACK_MIN = 3;
/** Where the spine runs, from the left edge of a stack. Also how far in a parent's stub may sit. */
export const SPINE_X = 16;
export const STACK_INDENT = 32;
export const PAD = 24;
/** The top person and their direct reports. Everything deeper starts closed. */
export const DEFAULT_OPEN_DEPTH = 2;

export const TOP_ID = "__top__";

export type ChartBox = {
  id: string;
  kind: "person" | "group";
  /** Null only for the group card. */
  person: ApiOrgNode | null;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Levels below the top person. The group card is -1. */
  depth: number;
  /** Their reports are showing. */
  open: boolean;
  /** Direct reports on the record, whether or not they are showing. */
  recorded: number;
  /** Everybody below them at any depth, for the closed chip. */
  below: number;
  /** There is something to open or close here. */
  toggleable: boolean;
  /** Hanging from a spine rather than standing in the row. */
  stacked: boolean;
  /** Where the line leaves the bottom edge, from the card's own left. */
  connX: number;
};

export type Segment = { x1: number; y1: number; x2: number; y2: number };

export type Layout = {
  width: number;
  height: number;
  boxes: ChartBox[];
  segments: Segment[];
  /** Every segment as one SVG path. */
  path: string;
  /** Where the top card's middle is, so the view can be centred on it. */
  rootCenter: number;
};

export type LayoutOptions = {
  roots: readonly ApiOrgNode[];
  openDepth: number;
  toggled: ReadonlySet<string>;
  /** When set, only these people are drawn, all of them open. A search. */
  visible?: ReadonlySet<string> | null;
};

type TreeNode = {
  id: string;
  person: ApiOrgNode | null;
  reports: TreeNode[];
  recorded: number;
  below: number;
};

type Measured = {
  node: TreeNode;
  depth: number;
  open: boolean;
  cardH: number;
  w: number;
  h: number;
  cardX: number;
  connX: number;
  items: Item[];
};

type Item =
  | {
      kind: "branch";
      m: Measured;
      x: number;
      anchor: number;
      w: number;
      h: number;
    }
  | {
      kind: "stack";
      leaves: Measured[];
      x: number;
      anchor: number;
      w: number;
      h: number;
    };

/* ------------------------------------------------------------------ search */

const matchText = (person: ApiOrgNode): string[] =>
  [
    person.name,
    person.jobTitle,
    person.employeeNo,
    person.department ?? "",
    person.workLocation ?? "",
  ].map((text) => text.toLowerCase());

export function personMatches(person: ApiOrgNode, needle: string): boolean {
  return matchText(person).some((text) => text.includes(needle));
}

/**
 * Everybody a search keeps: the people who match, and everybody above them, so
 * a match is never a card floating with no line to anyone. `matches` is the
 * subset that actually matched, for highlighting.
 */
export function visibleFor(
  roots: readonly ApiOrgNode[],
  needle: string,
): { visible: Set<string>; matches: Set<string> } {
  const visible = new Set<string>();
  const matches = new Set<string>();
  const walk = (node: ApiOrgNode): boolean => {
    let keep = false;
    if (personMatches(node, needle)) {
      matches.add(node.id);
      keep = true;
    }
    for (const report of node.reports) {
      if (walk(report)) keep = true;
    }
    if (keep) visible.add(node.id);
    return keep;
  };
  for (const root of roots) walk(root);
  return { visible, matches };
}

/* ------------------------------------------------------------------ layout */

const clamp = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), Math.max(low, high));

function build(
  node: ApiOrgNode,
  visible: ReadonlySet<string> | null,
): TreeNode {
  return {
    id: node.id,
    person: node,
    reports: node.reports
      .filter((report) => visible === null || visible.has(report.id))
      .map((report) => build(report, visible)),
    recorded: node.reports.length,
    below: node.totalBelow,
  };
}

export function layoutChart(options: LayoutOptions): Layout {
  const visible = options.visible ?? null;
  const searching = visible !== null;
  const roots = options.roots
    .filter((root) => visible === null || visible.has(root.id))
    .map((root) => build(root, visible));

  if (roots.length === 0) {
    return {
      width: 0,
      height: 0,
      boxes: [],
      segments: [],
      path: "",
      rootCenter: 0,
    };
  }

  const top: TreeNode =
    roots.length === 1 && roots[0]
      ? roots[0]
      : {
          id: TOP_ID,
          person: null,
          reports: roots,
          recorded: roots.length,
          below: roots.reduce((sum, root) => sum + 1 + root.below, 0),
        };

  const isOpen = (node: TreeNode, depth: number): boolean => {
    if (node.reports.length === 0) return false;
    if (node.person === null || searching) return true;
    /* Open by default above `openDepth`, and a click flips whichever it is. */
    return depth < options.openDepth !== options.toggled.has(node.id);
  };

  const measure = (node: TreeNode, depth: number): Measured => {
    const cardH = node.person === null ? GROUP_H : CARD_H;
    const open = isOpen(node, depth);
    if (!open) {
      return {
        node,
        depth,
        open: false,
        cardH,
        w: CARD_W,
        h: cardH,
        cardX: 0,
        connX: CARD_W / 2,
        items: [],
      };
    }

    const childDepth = node.person === null ? 0 : depth + 1;
    const kids = node.reports.map((report) => measure(report, childDepth));
    const loose = kids.filter((kid) => !kid.open);
    const stacked = new Set<Measured>(loose.length >= STACK_MIN ? loose : []);

    const items: Item[] = [];
    let cursor = 0;
    for (const kid of kids) {
      if (stacked.has(kid)) continue;
      items.push({
        kind: "branch",
        m: kid,
        x: cursor,
        anchor: cursor + kid.cardX + CARD_W / 2,
        w: kid.w,
        h: kid.h,
      });
      cursor += kid.w + GAP_X;
    }
    if (stacked.size > 0) {
      const leaves = kids.filter((kid) => stacked.has(kid));
      const w = STACK_INDENT + CARD_W;
      items.push({
        kind: "stack",
        leaves,
        x: cursor,
        anchor: cursor + SPINE_X,
        w,
        h: leaves.length * cardHOf(leaves) + (leaves.length - 1) * STACK_GAP,
      });
      cursor += w + GAP_X;
    }

    const rowW = cursor - GAP_X;
    const anchors = items.map((item) => item.anchor);
    const first = Math.min(...anchors);
    const last = Math.max(...anchors);
    const mid = (first + last) / 2;
    const cardX = clamp(mid - CARD_W / 2, 0, rowW - CARD_W);
    const connX = clamp(mid - cardX, SPINE_X, CARD_W - SPINE_X);

    return {
      node,
      depth,
      open: true,
      cardH,
      w: rowW,
      h: cardH + GAP_Y + Math.max(...items.map((item) => item.h)),
      cardX,
      connX,
      items,
    };
  };

  const rootDepth = top.person === null ? -1 : 0;
  const measured = measure(top, rootDepth);

  const boxes: ChartBox[] = [];
  const segments: Segment[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    if (x1 !== x2 || y1 !== y2) segments.push({ x1, y1, x2, y2 });
  };

  const boxFor = (
    m: Measured,
    x: number,
    y: number,
    stacked: boolean,
  ): ChartBox => ({
    id: m.node.id,
    kind: m.node.person === null ? "group" : "person",
    person: m.node.person,
    x,
    y,
    w: CARD_W,
    h: m.cardH,
    depth: m.depth,
    open: m.open,
    recorded: m.node.recorded,
    below: m.node.below,
    toggleable: m.node.person !== null && m.node.recorded > 0 && !searching,
    stacked,
    connX: m.connX,
  });

  const place = (m: Measured, ox: number, oy: number, stacked: boolean) => {
    boxes.push(boxFor(m, ox + m.cardX, oy, stacked));
    if (!m.open) return;

    const busY = oy + m.cardH + GAP_Y / 2;
    const childTop = oy + m.cardH + GAP_Y;
    const px = ox + m.cardX + m.connX;
    line(px, oy + m.cardH, px, busY);

    const anchors = m.items.map((item) => ox + item.anchor);
    line(Math.min(px, ...anchors), busY, Math.max(px, ...anchors), busY);

    for (const item of m.items) {
      const ax = ox + item.anchor;
      if (item.kind === "branch") {
        line(ax, busY, ax, childTop);
        place(item.m, ox + item.x, childTop, false);
        continue;
      }
      const rowH = cardHOf(item.leaves);
      const lastMid =
        childTop + (item.leaves.length - 1) * (rowH + STACK_GAP) + rowH / 2;
      line(ax, busY, ax, lastMid);
      item.leaves.forEach((leaf, index) => {
        const y = childTop + index * (rowH + STACK_GAP);
        line(ax, y + rowH / 2, ox + item.x + STACK_INDENT, y + rowH / 2);
        place(leaf, ox + item.x + STACK_INDENT, y, true);
      });
    }
  };

  place(measured, PAD, PAD, false);

  const topBox = boxes[0];
  return {
    width: measured.w + PAD * 2,
    height: measured.h + PAD * 2,
    boxes,
    segments,
    path: segments
      .map(
        (s) =>
          `M${String(s.x1)} ${String(s.y1)}L${String(s.x2)} ${String(s.y2)}`,
      )
      .join(""),
    rootCenter: topBox ? topBox.x + CARD_W / 2 : 0,
  };
}

/** Stacked cards are all people, so they share one height. */
function cardHOf(leaves: readonly Measured[]): number {
  return leaves[0]?.cardH ?? CARD_H;
}

/** How many real people a layout draws. The group card is not one. */
export function peopleShown(layout: Layout): number {
  return layout.boxes.filter((box) => box.kind === "person").length;
}
