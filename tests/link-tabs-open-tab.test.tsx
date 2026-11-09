import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LinkTabs } from "@/components/ui";

/**
 * The tab that is open has to be on screen.
 *
 * A tab bar wider than a phone scrolls, and a page reached by a link used to open
 * with its own tab past the edge: Wellness has five or six, and on a 375px phone
 * the last of them was out of sight while it was the page being read. jsdom has no
 * layout, so the boxes are given by hand: what is pinned is the rule (scroll just
 * far enough, along the strip, and only when the tab is cut off) and not the pixels
 * a browser would measure.
 */

const ITEMS = [
  { href: "/a", label: "One" },
  { href: "/b", label: "Two" },
  { href: "/c", label: "Three" },
  { href: "/d", label: "Four" },
  { href: "/e", label: "Five" },
];

const boxes = (strip: [number, number], tab: [number, number]) =>
  vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      const [left, right] =
        this.tagName === "NAV"
          ? strip
          : this.getAttribute("aria-current") === "page"
            ? tab
            : [0, 0];
      return {
        left,
        right,
        top: 0,
        bottom: 0,
        width: right - left,
        height: 0,
        x: left,
        y: 0,
        toJSON() {},
      };
    });

afterEach(() => vi.restoreAllMocks());

describe("the open tab", () => {
  it("is scrolled into view when it is past the right edge", () => {
    boxes([0, 335], [451, 537]);
    render(<LinkTabs items={ITEMS} activeHref="/e" />);
    /* Just far enough to show it, with a little room after it. */
    expect(
      screen.getByRole("navigation", { name: "Sections" }).scrollLeft,
    ).toBe(537 - 335 + 16);
  });

  it("is scrolled back when it is past the left edge", () => {
    boxes([100, 435], [40, 120]);
    render(<LinkTabs items={ITEMS} activeHref="/a" />);
    const strip = screen.getByRole("navigation", { name: "Sections" });
    expect(strip.scrollLeft).toBe(0);
  });

  it("is left alone when it is already on screen", () => {
    boxes([0, 335], [20, 114]);
    render(<LinkTabs items={ITEMS} activeHref="/a" />);
    expect(
      screen.getByRole("navigation", { name: "Sections" }).scrollLeft,
    ).toBe(0);
  });

  it("does nothing with no layout at all, and with no open tab", () => {
    render(<LinkTabs items={ITEMS} activeHref="/e" />);
    render(<LinkTabs items={ITEMS} activeHref="/nowhere" label="Other" />);
    expect(screen.getByRole("navigation", { name: "Other" }).scrollLeft).toBe(
      0,
    );
  });
});
