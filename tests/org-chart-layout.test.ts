import { describe, expect, it } from "vitest";
import type { ApiOrgNode } from "@/lib/api/endpoints";
import {
  CARD_H,
  CARD_W,
  DEFAULT_OPEN_DEPTH,
  GAP_X,
  GAP_Y,
  PAD,
  STACK_INDENT,
  STACK_MIN,
  TOP_ID,
  layoutChart,
  peopleShown,
  visibleFor,
  type ChartBox,
  type Layout,
} from "@/app/(app)/people/org-chart/tree-layout";

/**
 * The reporting chart's geometry, asserted as properties rather than as a
 * picture: nothing overlaps, everything is joined to the person above it, and a
 * manager sits over the people they lead. A drawing can look fine and still put
 * two cards on top of each other for exactly one shape of company, which is why
 * the last block sweeps a few hundred generated trees instead of the three in
 * the examples.
 */

let counter = 0;
const person = (name: string, reports: ApiOrgNode[] = []): ApiOrgNode => {
  counter += 1;
  const below = reports.reduce((sum, report) => sum + 1 + report.totalBelow, 0);
  return {
    id: `id-${String(counter)}-${name}`,
    employeeNo: `E-${String(counter).padStart(4, "0")}`,
    name,
    jobTitle: "Engineer",
    department: "Engineering",
    workLocation: null,
    status: "ACTIVE",
    reports,
    totalBelow: below,
  };
};

const leaves = (count: number, prefix = "Leaf"): ApiOrgNode[] =>
  Array.from({ length: count }, (_, index) =>
    person(`${prefix} ${String(index + 1)}`),
  );

const lay = (
  roots: ApiOrgNode[],
  more: Partial<Parameters<typeof layoutChart>[0]> = {},
): Layout =>
  layoutChart({
    roots,
    openDepth: Number.POSITIVE_INFINITY,
    toggled: new Set(),
    ...more,
  });

const byName = (layout: Layout, name: string): ChartBox => {
  const box = layout.boxes.find((candidate) => candidate.person?.name === name);
  if (!box) throw new Error(`No card for ${name}`);
  return box;
};

const centre = (box: ChartBox): number => box.x + box.w / 2;

const overlap = (a: ChartBox, b: ChartBox): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Every pair of cards, reported by name, so a failure says which two. */
const overlaps = (layout: Layout): string[] => {
  const found: string[] = [];
  layout.boxes.forEach((a, i) => {
    layout.boxes.slice(i + 1).forEach((b) => {
      if (overlap(a, b)) found.push(`${a.id} / ${b.id}`);
    });
  });
  return found;
};

describe("the reporting chart's layout", () => {
  it("draws nothing for nobody", () => {
    const layout = lay([]);
    expect(layout.boxes).toEqual([]);
    expect(layout.width).toBe(0);
    expect(layout.path).toBe("");
  });

  it("draws one card and no lines for one person", () => {
    const layout = lay([person("Amara")]);
    expect(layout.boxes).toHaveLength(1);
    expect(layout.segments).toEqual([]);
    expect(layout.width).toBe(CARD_W + PAD * 2);
    expect(layout.height).toBe(CARD_H + PAD * 2);
  });

  describe("a manager and their reports", () => {
    const boss = person("Boss", [person("Left"), person("Right")]);
    const layout = lay([boss]);

    it("puts the reports one level below, side by side", () => {
      const left = byName(layout, "Left");
      const right = byName(layout, "Right");
      expect(left.y).toBe(byName(layout, "Boss").y + CARD_H + GAP_Y);
      expect(right.y).toBe(left.y);
      expect(right.x - (left.x + left.w)).toBe(GAP_X);
    });

    it("centres the manager over the middle of the two", () => {
      const middle =
        (centre(byName(layout, "Left")) + centre(byName(layout, "Right"))) / 2;
      expect(centre(byName(layout, "Boss"))).toBe(middle);
    });

    it("joins them: a stub, a bar, and a drop to each report", () => {
      expect(layout.segments).toHaveLength(4);
      const bar = layout.segments.find((s) => s.y1 === s.y2);
      expect(bar).toBeDefined();
      expect(bar!.x1).toBe(centre(byName(layout, "Left")));
      expect(bar!.x2).toBe(centre(byName(layout, "Right")));
    });
  });

  describe("people with nobody below them", () => {
    it("hang in one column when there are enough of them", () => {
      const layout = lay([person("Boss", leaves(STACK_MIN + 2))]);
      const stacked = layout.boxes.filter((box) => box.stacked);
      expect(stacked).toHaveLength(STACK_MIN + 2);
      expect(new Set(stacked.map((box) => box.x)).size).toBe(1);
      const ys = stacked.map((box) => box.y);
      expect([...ys].sort((a, b) => a - b)).toEqual(ys);
      expect(new Set(ys).size).toBe(ys.length);
    });

    it("keep the chart narrow however many there are", () => {
      const few = lay([person("Boss", leaves(STACK_MIN))]);
      const many = lay([person("Boss", leaves(40))]);
      expect(many.width).toBe(few.width);
      expect(many.width).toBe(STACK_INDENT + CARD_W + PAD * 2);
    });

    it("stay in the row when there are only a few", () => {
      const layout = lay([person("Boss", leaves(STACK_MIN - 1))]);
      expect(layout.boxes.some((box) => box.stacked)).toBe(false);
      expect(layout.width).toBeGreaterThan(CARD_W * (STACK_MIN - 1));
    });

    it("leave managers in the row beside the column", () => {
      const boss = person("Boss", [
        person("Team lead A", [person("A1")]),
        person("Team lead B", [person("B1")]),
        ...leaves(6),
      ]);
      const layout = lay([boss]);
      expect(byName(layout, "Team lead A").stacked).toBe(false);
      expect(byName(layout, "Team lead B").stacked).toBe(false);
      expect(layout.boxes.filter((box) => box.stacked)).toHaveLength(6);
      expect(overlaps(layout)).toEqual([]);
    });

    it("keep the manager over the column's spine when it is the only child group", () => {
      const layout = lay([person("Boss", leaves(5))]);
      const boss = byName(layout, "Boss");
      const first = layout.boxes.find((box) => box.stacked)!;
      /* The stub leaves the manager's bottom edge, and has to land on the spine
         that runs down the left of the column. */
      const stub = layout.segments.find(
        (s) => s.x1 === s.x2 && s.y1 === boss.y + boss.h,
      );
      expect(stub).toBeDefined();
      expect(stub!.x1).toBeGreaterThan(boss.x);
      expect(stub!.x1).toBeLessThan(first.x);
    });
  });

  describe("opening and closing", () => {
    const tree = () =>
      person("Top", [
        person("Mid", [person("Low", [person("Lowest")])]),
        person("Other"),
      ]);

    it("shows the top person and their reports by default", () => {
      const layout = lay([tree()], {
        openDepth: DEFAULT_OPEN_DEPTH,
      });
      const names = layout.boxes.map((box) => box.person?.name);
      expect(names).toContain("Top");
      expect(names).toContain("Mid");
      expect(names).toContain("Low");
      expect(names).not.toContain("Lowest");
    });

    it("marks a closed manager as something to open, with the people it hides", () => {
      const layout = lay([tree()], { openDepth: DEFAULT_OPEN_DEPTH });
      const low = byName(layout, "Low");
      expect(low.open).toBe(false);
      expect(low.toggleable).toBe(true);
      expect(low.below).toBe(1);
      expect(low.recorded).toBe(1);
      expect(byName(layout, "Other").toggleable).toBe(false);
    });

    it("opens a closed one when its id is toggled, and closes an open one", () => {
      const root = tree();
      const low = root.reports[0]!.reports[0]!;
      const opened = lay([root], {
        openDepth: DEFAULT_OPEN_DEPTH,
        toggled: new Set([low.id]),
      });
      expect(opened.boxes.map((box) => box.person?.name)).toContain("Lowest");

      const mid = root.reports[0]!;
      const closed = lay([root], {
        openDepth: DEFAULT_OPEN_DEPTH,
        toggled: new Set([mid.id]),
      });
      expect(closed.boxes.map((box) => box.person?.name)).not.toContain("Low");
    });

    it("collapses to one level and expands to all with one number", () => {
      const root = tree();
      expect(peopleShown(lay([root], { openDepth: 1 }))).toBe(3);
      expect(peopleShown(lay([root], { openDepth: 0 }))).toBe(1);
      expect(peopleShown(lay([root]))).toBe(5);
    });
  });

  describe("more than one person at the top", () => {
    const layout = lay([person("Ada"), person("Bayo"), person("Chi")]);

    it("hangs them from a group card rather than ranking them under somebody", () => {
      expect(layout.boxes[0]?.kind).toBe("group");
      expect(layout.boxes[0]?.id).toBe(TOP_ID);
      expect(layout.boxes[0]?.person).toBeNull();
      expect(layout.boxes[0]?.below).toBe(3);
      expect(peopleShown(layout)).toBe(3);
    });

    it("never offers to close the group, and does not stack the one root with reports", () => {
      expect(layout.boxes[0]?.toggleable).toBe(false);
      const withBranch = lay([
        person("Ada", [person("Ada's report")]),
        person("Bayo"),
      ]);
      expect(withBranch.boxes[0]?.kind).toBe("group");
      expect(withBranch.boxes[0]?.open).toBe(true);
    });

    it("is not drawn for a single root", () => {
      expect(lay([person("Only")]).boxes[0]?.kind).toBe("person");
    });
  });

  describe("searching", () => {
    const root = person("Top", [
      person("Mid", [person("Wanjiru Kamau"), person("Obi")]),
      person("Other", [person("Another")]),
    ]);

    it("keeps the people who match and everybody above them", () => {
      const { visible, matches } = visibleFor([root], "wanjiru");
      expect([...matches]).toHaveLength(1);
      const names = [...visible].map((id) => {
        const find = (node: ApiOrgNode): string | null =>
          node.id === id
            ? node.name
            : (node.reports.map(find).find((found) => found !== null) ?? null);
        return find(root);
      });
      expect(names.sort()).toEqual(["Mid", "Top", "Wanjiru Kamau"]);
    });

    it("matches on job title, staff number, department and location too", () => {
      const tagged = person("Somebody");
      tagged.jobTitle = "Head of Treasury";
      tagged.workLocation = "Port Harcourt";
      tagged.department = "Finance";
      const top = person("Top", [tagged]);
      for (const needle of ["treasury", "port harcourt", "finance", "e-"]) {
        expect(visibleFor([top], needle).matches.has(tagged.id)).toBe(true);
      }
      expect(visibleFor([top], "nothing like this").visible.size).toBe(0);
    });

    it("draws only those people, all open, with nothing to toggle", () => {
      const { visible } = visibleFor([root], "wanjiru");
      const layout = lay([root], {
        openDepth: 0,
        toggled: new Set(),
        visible,
      });
      expect(layout.boxes.map((box) => box.person?.name)).toEqual([
        "Top",
        "Mid",
        "Wanjiru Kamau",
      ]);
      expect(layout.boxes.every((box) => !box.toggleable)).toBe(true);
    });

    it("draws nothing when nothing matches", () => {
      const { visible } = visibleFor([root], "zzz");
      expect(lay([root], { visible }).boxes).toEqual([]);
    });
  });
});

/* ------------------------------------------------------------- the sweep */

/** A small seeded generator, so a failure is the same failure next time. */
const seeded = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

const randomTree = (random: () => number, size: number): ApiOrgNode => {
  const nodes: { person: ApiOrgNode; reports: ApiOrgNode[] }[] = [];
  const make = (name: string) => {
    const reports: ApiOrgNode[] = [];
    const node = { person: person(name, reports), reports };
    nodes.push(node);
    return node;
  };
  const root = make("root");
  for (let index = 1; index < size; index += 1) {
    /* Favouring recent nodes makes deep chains, favouring early ones makes wide
       fans: both shapes are what a real company is made of. */
    const parent =
      nodes[Math.floor(random() ** (index % 3 === 0 ? 3 : 1) * nodes.length)]!;
    const child = make(`n${String(index)}`);
    parent.reports.push(child.person);
  }
  /* `totalBelow` is derived from the shape, so rebuild it bottom-up. */
  const settle = (node: ApiOrgNode): number => {
    node.totalBelow = node.reports.reduce(
      (sum, report) => sum + 1 + settle(report),
      0,
    );
    return node.totalBelow;
  };
  settle(root.person);
  return root.person;
};

describe("any shape of company", { timeout: 60_000 }, () => {
  const random = seeded(20261021);
  const trees = Array.from({ length: 300 }, (_, index) =>
    randomTree(
      random,
      1 + Math.floor(random() * 60) + (index % 10 === 0 ? 120 : 0),
    ),
  );

  it("never puts two cards on top of each other", () => {
    for (const [index, tree] of trees.entries()) {
      for (const openDepth of [DEFAULT_OPEN_DEPTH, Number.POSITIVE_INFINITY]) {
        const layout = lay([tree], { openDepth });
        expect(
          overlaps(layout),
          `tree ${String(index)} at depth ${String(openDepth)}`,
        ).toEqual([]);
      }
    }
  });

  it("keeps every card, and every line, inside the drawing", () => {
    for (const tree of trees) {
      const layout = lay([tree]);
      for (const box of layout.boxes) {
        expect(box.x).toBeGreaterThanOrEqual(PAD);
        expect(box.y).toBeGreaterThanOrEqual(PAD);
        expect(box.x + box.w).toBeLessThanOrEqual(layout.width - PAD);
        expect(box.y + box.h).toBeLessThanOrEqual(layout.height - PAD);
      }
      for (const s of layout.segments) {
        expect(Math.min(s.x1, s.x2)).toBeGreaterThanOrEqual(PAD);
        expect(Math.max(s.x1, s.x2)).toBeLessThanOrEqual(layout.width - PAD);
        expect(Math.max(s.y1, s.y2)).toBeLessThanOrEqual(layout.height - PAD);
        /* An org chart is square: no diagonals. */
        expect(s.x1 === s.x2 || s.y1 === s.y2).toBe(true);
      }
    }
  });

  it("joins every card to the one above it", () => {
    for (const [index, tree] of trees.entries()) {
      const layout = lay([tree]);
      for (const box of layout.boxes.slice(1)) {
        const joined = layout.segments.some((s) =>
          box.stacked
            ? s.y1 === s.y2 && s.x2 === box.x && s.y1 === box.y + box.h / 2
            : s.x1 === s.x2 && s.y2 === box.y && s.x1 === box.x + box.w / 2,
        );
        expect(joined, `tree ${String(index)}, card ${box.id}`).toBe(true);
      }
    }
  });

  it("never leaves a line ending in mid-air", () => {
    /* The join test above proves a card is reached. This proves the line that
       reaches it is itself attached to something: every end of every segment
       sits on a card or on another line, so a stub that lands beside the bar it
       is meant to feed fails here and nowhere else. */
    for (const [index, tree] of trees.entries()) {
      const layout = lay([tree]);
      for (const s of layout.segments) {
        for (const [x, y] of [
          [s.x1, s.y1],
          [s.x2, s.y2],
        ] as const) {
          const onCard = layout.boxes.some(
            (b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h,
          );
          const onLine = layout.segments.some(
            (o) =>
              o !== s &&
              x >= Math.min(o.x1, o.x2) &&
              x <= Math.max(o.x1, o.x2) &&
              y >= Math.min(o.y1, o.y2) &&
              y <= Math.max(o.y1, o.y2),
          );
          expect(
            onCard || onLine,
            `tree ${String(index)}, end ${String(x)},${String(y)}`,
          ).toBe(true);
        }
      }
    }
  });

  it("draws every person exactly once when everything is open", () => {
    for (const tree of trees) {
      const layout = lay([tree]);
      expect(peopleShown(layout)).toBe(1 + tree.totalBelow);
      expect(new Set(layout.boxes.map((box) => box.id)).size).toBe(
        layout.boxes.length,
      );
    }
  });

  it("puts each person below their manager", () => {
    for (const tree of trees) {
      const layout = lay([tree]);
      const at = new Map(layout.boxes.map((box) => [box.id, box]));
      const walk = (node: ApiOrgNode) => {
        for (const report of node.reports) {
          expect(at.get(report.id)!.y).toBeGreaterThan(at.get(node.id)!.y);
          walk(report);
        }
      };
      walk(tree);
    }
  });
});
