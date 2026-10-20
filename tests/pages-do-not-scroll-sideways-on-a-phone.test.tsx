import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card, CardHeader } from "@/components/ui";

/**
 * The page itself never grows a sideways scroll on a phone.
 *
 * Found by opening every route at 320px and 375px and comparing the layout
 * width with the screen: seventeen of 135 were wider than the phone, one of
 * them 1,563px. It matters beyond the page — a mobile browser answers
 * overflow by widening the layout viewport, so every sheet opened from such a
 * page came up at its desktop width, on a screen that had been zoomed out to
 * fit it.
 *
 * Three shared causes covered most of them, and each is a structural fact
 * that jsdom can hold even though it cannot measure a layout. The rest were
 * one-off rows, fixed where they were.
 */

const classes = (node: Element) => Array.from(node.classList);

describe("Card", () => {
  it("can be narrower than its content, so a grid or flex item cannot widen the page", () => {
    /* A card is nearly always a grid or flex item, and an item's automatic
       minimum width is its content's: one no-wrap progress row made a card
       510px wide inside a 335px column on the onboarding screen. */
    render(<Card data-testid="card">x</Card>);
    expect(classes(screen.getByTestId("card"))).toContain("min-w-0");
  });
});

describe("CardHeader", () => {
  it("caps its action at the header's own width", () => {
    /* `shrink-0` alone let a four-option SegmentedControl claim more than
       the card had — the overtime, shifts, help and applications screens. */
    render(<CardHeader title="Interviews" action={<button>Show</button>} />);
    const action = screen.getByRole("button", { name: "Show" }).parentElement;
    expect(classes(action as Element)).toEqual(
      expect.arrayContaining(["shrink-0", "max-w-full"]),
    );
  });
});

describe("scroll-x", () => {
  const css = readFileSync(
    path.join(process.cwd(), "src/app/globals.css"),
    "utf8",
  );

  it("is a containing block, so a hidden label in a wide table cannot widen the page", () => {
    /* `sr-only` is `position: absolute`. A box is only clipped by an overflow
       ancestor that is, or sits inside, its containing block — so the
       visually hidden text in the far column of the skills matrix was laid out
       at x=1500 against the page, ignored the scroller, and the page was
       1,563px wide. */
    const at = css.indexOf("@utility scroll-x {");
    expect(at).toBeGreaterThan(-1);
    const block = css.slice(at, css.indexOf("}", at));
    expect(block).toContain("position: relative");
    expect(block).toContain("overflow-x: auto");
  });
});
