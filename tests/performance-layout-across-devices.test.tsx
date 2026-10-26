import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BarChart, Stat } from "@/components/ui";

/**
 * The performance screens fit the device they are opened on.
 *
 * Found by opening every performance route at 320, 375, 412, 768, 1024, 1366
 * and 1920px against a seeded company and measuring what the page did, rather
 * than looking at it: text drawn over other text, text cut off with an
 * ellipsis, a sentence broken into columns, a child sticking out of its card,
 * a grid wider than the screen. Five of those were real, and each is a
 * structural fact that jsdom can hold even though it cannot lay a page out.
 */

const classes = (node: Element) => Array.from(node.classList);
const source = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

describe("Stat", () => {
  it("wraps its value and its hint instead of cutting them off with an ellipsis", () => {
    /* The hint is a full clause on these screens ("Across the 9 marks given.
       People with no mark are not counted."), and the half that `truncate`
       removed was the caveat. The value is worse: an employee reading their
       own rating on a 320px phone was shown "Exceeds Expect…". A `title`
       tooltip is no answer on a phone, where nothing hovers. */
    render(
      <Stat
        label="Overall mark"
        value="Exceeds Expectations"
        hint="Across the 9 marks given. People with no mark are not counted."
      />,
    );
    const value = screen.getByText("Exceeds Expectations");
    const hint = screen.getByText(/People with no mark are not counted/);
    for (const element of [value, hint]) {
      expect(classes(element)).toContain("break-words");
      expect(classes(element)).not.toContain("truncate");
    }
  });

  it("still holds a long filename inside the card, because break-words breaks a word that cannot fit", () => {
    /* The reason `truncate` was there in the first place. */
    render(
      <Stat
        label="File"
        value="1"
        hint="ApproveHR_employees_reformatted_final_v2.xlsx"
      />,
    );
    const hint = screen.getByText(/ApproveHR_employees_reformatted/);
    expect(classes(hint)).toContain("break-words");
  });

  it("keeps the whole hint available to hover as well", () => {
    render(<Stat label="Marks" value="9" hint="Everybody has one" />);
    expect(screen.getByText("Everybody has one")).toHaveAttribute(
      "title",
      "Everybody has one",
    );
  });
});

describe("BarChart", () => {
  it("colours each bar by its own tone when given tones, which is what lets it stand in for a column chart on a phone", () => {
    /* The report draws a score distribution as five columns from `sm` up, and
       as five bars below it: at a phone's width each column is about 55px and
       "Outstanding" does not fit in 55px. The bars have to keep the band
       colours, or the phone would be the one place the bands lose them. */
    const { container } = render(
      <BarChart
        points={[
          { label: "Outstanding", value: 0 },
          { label: "Exceeds expectations", value: 9 },
        ]}
        tones={["rgb(1, 2, 3)", "rgb(4, 5, 6)"]}
        caption="Two bands"
      />,
    );
    const filled = container.querySelectorAll<HTMLElement>(
      "[style*='background-color']",
    );
    /* A band with nobody in it is a bar of no width, in its own colour. */
    expect(filled).toHaveLength(2);
    expect(filled[0]?.style.backgroundColor).toBe("rgb(1, 2, 3)");
    expect(filled[0]?.style.width).toBe("0%");
    expect(filled[1]?.style.backgroundColor).toBe("rgb(4, 5, 6)");
  });
});

describe("the nine-box", () => {
  const nineBox = source(
    "src/app/(app)/performance/periods/[id]/nine-box/nine-box-screen.tsx",
  );

  it("is no wider than an iPad held upright, so its third column is not cut off mid-word", () => {
    /* 768px less the page's padding leaves about 712px. At 52rem (832px) the
       grid showed two and a half columns with nothing to say it scrolled. */
    const width = /min-w-\[(\d+(?:\.\d+)?)rem\]/.exec(nineBox);
    expect(width).not.toBeNull();
    expect(Number(width?.[1])).toBeLessThanOrEqual(44);
  });

  it("keeps its row labels in view while the columns scroll on a phone", () => {
    /* Both the empty corner and every row's label: lose either and a scrolled
       grid is a set of boxes with no way to tell which row they belong to. */
    expect(nineBox.match(/sticky left-0/g)?.length ?? 0).toBeGreaterThanOrEqual(
      2,
    );
  });
});

describe("the report's spread of marks", () => {
  const report = source(
    "src/app/(app)/performance/periods/[id]/report/report-screen.tsx",
  );

  it("is columns from sm up and bars below it, and never both in the page", () => {
    /* `hidden` is display: none, which also takes the one out of the
       accessibility tree: a screen reader meets one data table, not two. */
    expect(report).toMatch(/<ColumnChart[^>]*className="hidden sm:block"/);
    expect(report).toMatch(/<BarChart[^>]*className="sm:hidden"/);
  });
});

describe("the scoring settings page", () => {
  const form = source("src/app/(app)/settings/performance/weights-form.tsx");

  it("keeps the frozen-period sentence in one element, because its paragraph is a flex row", () => {
    /* A flex row makes every direct child a column, so loose text, a link and
       more text rendered as three blocks side by side, at every width. */
    const at = form.indexOf(
      "A period screen says whether its weights are frozen",
    );
    expect(at).toBeGreaterThan(-1);
    const before = form.slice(Math.max(0, at - 200), at);
    expect(before).toMatch(/<span className="min-w-0">\s*$/);
  });

  it("lets the save bar's buttons wrap on a 320px phone instead of running out of the card", () => {
    expect(form).not.toMatch(/className="flex shrink-0 flex-wrap gap-2"/);
  });
});
