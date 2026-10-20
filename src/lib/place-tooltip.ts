/**
 * Where a floating panel goes, given where its trigger is and how much screen
 * there is. Arithmetic only: no DOM, no React, so a test can hand it numbers.
 *
 * The caller measures — the trigger's rectangle, the panel's size, the region a
 * person can actually see — and this decides. That split is the point. The
 * measuring has to happen in a layout effect, before the browser paints, and
 * the deciding has to be checkable without a browser.
 */

/** A rectangle in viewport coordinates, which is what `getBoundingClientRect`
    and `visualViewport` both speak once you add the viewport's own offset. */
export type Box = { top: number; left: number; right: number; bottom: number };

export type TooltipPlacement = {
  /** Viewport coordinates of the panel's top-left corner. */
  left: number;
  top: number;
  side: "above" | "below";
  /** Set only when the panel is taller than the room on either side, so the
      caller can cap it and let it scroll rather than run off the screen. */
  maxHeight?: number;
};

/** Between the trigger and the panel. */
export const TOOLTIP_GAP = 8;

/** Clear of the edge of the screen on every side, so the panel never lands
    flush against it. */
export const TOOLTIP_MARGIN = 16;

/** Smallest a capped panel is allowed to be: two lines of the help text. */
const MIN_CAPPED_HEIGHT = 64;

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(value, high));

/**
 * Above the trigger if the panel fits there, otherwise below it, otherwise on
 * whichever side has more room with its height capped to fit.
 *
 * **Above comes first** because it is what the panel always did, and for a
 * field it is the better side: below a label is the control the person is about
 * to use, and a panel there covers it.
 *
 * It has to be able to say "below", because above is not always on the screen.
 * The first field in a dialog is a few pixels under the dialog's own top edge,
 * and a panel that opened upward from there was cut off by the dialog's scroll
 * area — 55 of its 71 pixels, on a laptop as much as on a phone. The room above
 * is measured against the region a person can see, not against a container.
 *
 * Horizontally the panel starts at the trigger's left edge and is pulled back
 * just far enough that neither of its edges crosses the margin. That is the
 * rule the earlier, fixed-position version of this had, kept: a trigger near
 * the middle of a narrow screen has room on neither pure side.
 */
export function placeTooltip({
  anchor,
  panel,
  bounds,
  gap = TOOLTIP_GAP,
  margin = TOOLTIP_MARGIN,
}: {
  /** The trigger, as it is on screen now. */
  anchor: Box;
  /** The panel's own size at the width it will be shown at. */
  panel: { width: number; height: number };
  /** What can be seen: the visual viewport, not the page. */
  bounds: Box;
  gap?: number;
  margin?: number;
}): TooltipPlacement {
  const lowest = bounds.left + margin;
  const highest = bounds.right - margin - panel.width;
  const left = clamp(anchor.left, lowest, Math.max(lowest, highest));

  const roomAbove = anchor.top - gap - (bounds.top + margin);
  const roomBelow = bounds.bottom - margin - (anchor.bottom + gap);

  const side: "above" | "below" =
    panel.height <= roomAbove
      ? "above"
      : panel.height <= roomBelow
        ? "below"
        : roomAbove >= roomBelow
          ? "above"
          : "below";

  const room = side === "above" ? roomAbove : roomBelow;
  const capped = panel.height > room;
  const height = capped ? Math.max(room, MIN_CAPPED_HEIGHT) : panel.height;

  return {
    left,
    top: side === "above" ? anchor.top - gap - height : anchor.bottom + gap,
    side,
    ...(capped ? { maxHeight: height } : {}),
  };
}
