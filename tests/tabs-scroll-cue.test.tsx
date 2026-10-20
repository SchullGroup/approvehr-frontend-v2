import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tabs } from "@/components/ui";

/**
 * A tab bar wider than a phone says so.
 *
 * jsdom has no layout, so the widths are given to the strip by hand; what is
 * asserted is the decision — which edge fades — and not how it looks, which was
 * checked in a browser on the Performance overview, Pay setup and the profile.
 */

const ITEMS = [
  { id: "a", label: "First" },
  { id: "b", label: "Second" },
  { id: "c", label: "Third" },
];

function strip() {
  render(<Tabs items={ITEMS} value="a" onChange={() => undefined} />);
  return screen.getByRole("tablist");
}

function size(el: HTMLElement, widths: { client: number; scroll: number }) {
  Object.defineProperty(el, "clientWidth", {
    configurable: true,
    value: widths.client,
  });
  Object.defineProperty(el, "scrollWidth", {
    configurable: true,
    value: widths.scroll,
  });
}

function scrollTo(el: HTMLElement, left: number) {
  Object.defineProperty(el, "scrollLeft", { configurable: true, value: left });
  act(() => {
    el.dispatchEvent(new Event("scroll"));
  });
}

/* Read back the property the implementation assigned. jsdom's style object has
   no `mask-image` of its own, so `getPropertyValue` would say nothing. */
const mask = (el: HTMLElement) => el.style.maskImage ?? "";

describe("Tabs scroll cue", () => {
  it("fades nothing when every tab fits", () => {
    const el = strip();
    size(el, { client: 400, scroll: 400 });
    act(() => {
      el.dispatchEvent(new Event("scroll"));
    });
    expect(mask(el)).toBe("");
  });

  it("fades the right edge when there is more to the right", () => {
    const el = strip();
    size(el, { client: 300, scroll: 600 });
    act(() => {
      el.dispatchEvent(new Event("scroll"));
    });
    expect(mask(el)).toContain("transparent 100%");
    expect(mask(el)).not.toContain("transparent 0");
  });

  it("fades both edges in the middle, and only the left at the end", () => {
    const el = strip();
    size(el, { client: 300, scroll: 600 });

    scrollTo(el, 120);
    expect(mask(el)).toContain("transparent 0");
    expect(mask(el)).toContain("transparent 100%");

    scrollTo(el, 300);
    expect(mask(el)).toContain("transparent 0");
    expect(mask(el)).not.toContain("transparent 100%");
  });

  it("changes nothing about the tabs themselves", () => {
    strip();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: "First" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
