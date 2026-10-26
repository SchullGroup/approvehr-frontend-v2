import { describe, expect, it } from "vitest";
import {
  placeTooltip,
  TOOLTIP_GAP,
  TOOLTIP_MARGIN,
  type Box,
} from "@/lib/place-tooltip";

/**
 * Where the help panel goes, as arithmetic.
 *
 * The component measures and this decides, so every case here is a handful of
 * numbers and an exact answer — no browser, and nothing to take on trust. The
 * numbers are a real phone: 375 by 812, the panel 256 wide and 71 tall (what a
 * two-line sentence measures at the panel's own width), the icon 14 square.
 */

const screen: Box = { top: 0, left: 0, right: 375, bottom: 812 };
const panel = { width: 256, height: 71 };
const icon = (left: number, top: number): Box => ({
  left,
  top,
  right: left + 14,
  bottom: top + 14,
});

describe("which side", () => {
  it("opens above when there is room, as it always did", () => {
    const placed = placeTooltip({
      anchor: icon(40, 400),
      panel,
      bounds: screen,
    });
    expect(placed.side).toBe("above");
    // 400 - 8 (the gap) - 71 (the panel).
    expect(placed.top).toBe(400 - TOOLTIP_GAP - panel.height);
  });

  it("opens below for the first field in a dialog, where there is no room above", () => {
    /* The report: a dialog's first label sits about 20px under its own top
       edge, and a panel opened upward from there was cut off. Measured against
       the screen there is room, but not here: 20 - 8 - 16 is negative. */
    const placed = placeTooltip({
      anchor: icon(40, 20),
      panel,
      bounds: screen,
    });
    expect(placed.side).toBe("below");
    // 34 (the icon's bottom) + 8.
    expect(placed.top).toBe(34 + TOOLTIP_GAP);
    expect(placed.maxHeight).toBeUndefined();
  });

  it("opens above for the last field on a screen, where there is no room below", () => {
    const placed = placeTooltip({
      anchor: icon(40, 790),
      panel,
      bounds: screen,
    });
    expect(placed.side).toBe("above");
  });

  it("prefers above when it fits both ways", () => {
    expect(
      placeTooltip({ anchor: icon(40, 300), panel, bounds: screen }).side,
    ).toBe("above");
  });

  it("takes the side with more room, and caps the panel, when neither fits", () => {
    /* A phone held sideways: 375 tall. The icon is near the middle, with 150px
       above and 180 below, and the panel wants 240. */
    const landscape: Box = { top: 0, left: 0, right: 812, bottom: 375 };
    const tall = { width: 256, height: 240 };
    const placed = placeTooltip({
      anchor: icon(40, 160),
      panel: tall,
      bounds: landscape,
    });
    expect(placed.side).toBe("below");
    // 375 - 16 (margin) - (174 + 8) = 177 of room.
    expect(placed.maxHeight).toBe(177);
    expect(placed.top).toBe(182);
    // The capped panel ends exactly at the margin, not past it.
    expect((placed.top ?? 0) + (placed.maxHeight ?? 0)).toBe(
      375 - TOOLTIP_MARGIN,
    );
  });

  it("never caps a panel to less than a couple of lines", () => {
    const sliver: Box = { top: 0, left: 0, right: 375, bottom: 120 };
    const placed = placeTooltip({
      anchor: icon(40, 50),
      panel: { width: 256, height: 200 },
      bounds: sliver,
    });
    expect(placed.maxHeight).toBeGreaterThanOrEqual(64);
  });
});

describe("how far across", () => {
  it("starts at the icon's own left edge", () => {
    expect(
      placeTooltip({ anchor: icon(40, 400), panel, bounds: screen }).left,
    ).toBe(40);
  });

  it("is pulled back from the right edge, so it never runs off the screen", () => {
    /* An icon at x=300 would put a 256px panel's right edge at 556 on a 375px
       screen. That was the bug that made a phone widen its layout viewport. */
    const placed = placeTooltip({
      anchor: icon(300, 400),
      panel,
      bounds: screen,
    });
    expect(placed.left).toBe(375 - TOOLTIP_MARGIN - 256);
    expect(placed.left + panel.width).toBeLessThanOrEqual(375 - TOOLTIP_MARGIN);
  });

  it("is held off the left edge by the same margin", () => {
    expect(
      placeTooltip({ anchor: icon(2, 400), panel, bounds: screen }).left,
    ).toBe(TOOLTIP_MARGIN);
  });

  it("is correct for an icon in the middle, which has room on neither pure side", () => {
    const narrow: Box = { top: 0, left: 0, right: 320, bottom: 568 };
    const placed = placeTooltip({
      anchor: icon(150, 300),
      panel,
      bounds: narrow,
    });
    expect(placed.left).toBe(320 - TOOLTIP_MARGIN - 256);
    expect(placed.left).toBeGreaterThanOrEqual(TOOLTIP_MARGIN);
  });

  it("keeps to the screen when the screen is narrower than the panel", () => {
    /* Pinch-zoomed in, the visual viewport is 187px wide. There is no good
       answer; the margin on the left wins and the caller caps the width. */
    const zoomed: Box = { top: 0, left: 0, right: 187, bottom: 400 };
    expect(
      placeTooltip({ anchor: icon(100, 200), panel, bounds: zoomed }).left,
    ).toBe(TOOLTIP_MARGIN);
  });
});

describe("the region it is measured against", () => {
  it("is where the person is looking, not the top of the page", () => {
    /* The keyboard is up on an iPhone: the visible region starts at 0 and ends
       at 340. An icon at 330 is on screen and has nothing below it. */
    const withKeyboard: Box = { top: 0, left: 0, right: 375, bottom: 340 };
    expect(
      placeTooltip({ anchor: icon(40, 300), panel, bounds: withKeyboard }).side,
    ).toBe("above");
  });

  it("honours an offset visual viewport", () => {
    /* Zoomed in and scrolled: the visible region starts 500px down. An icon at
       510 has 10px above it *within what is visible*, though 510 above it on
       the page. */
    const scrolled: Box = { top: 500, left: 0, right: 375, bottom: 900 };
    const placed = placeTooltip({
      anchor: icon(40, 510),
      panel,
      bounds: scrolled,
    });
    expect(placed.side).toBe("below");
    expect(placed.top).toBe(524 + TOOLTIP_GAP);
  });
});
