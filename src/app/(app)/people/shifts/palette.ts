/**
 * Colours for shift blocks.
 *
 * ## Colour is never the only signal
 *
 * Every block also carries the shift's **short name** — `N`, `E`, `L` — which is
 * exactly why `shortName` is a required field on the API capped at four
 * characters. A rota distinguished by colour alone is unreadable to about one
 * man in twelve, and unreadable to everybody once it is photocopied and pinned
 * to a wall, which is what actually happens to rotas.
 *
 * ## Why these six and not a generated hue ramp
 *
 * Each entry pairs a background from the app's palette with `text-ink` on top,
 * and every one of those pairs is already checked in `scripts/verify-contrast.ts`
 * — `surface`, `sunken`, and the five `*-soft` grounds. A generated ramp would
 * look better and would put text on a colour nothing has measured, and
 * `HANDOVER.md` is explicit that contrast you cannot measure is contrast you
 * cannot promise. So: no new tokens, no new checks needed, no unverified pair.
 *
 * The strong colour appears only as a 3px bar and a legend swatch. Both are
 * decorative — remove them and the grid still reads.
 *
 * A seventh shift wraps round to the first. Two shifts sharing a colour is
 * survivable precisely because the label carries the meaning; running out of
 * verified colours and inventing one is not.
 */

export type ShiftColour = {
  /** Background and hairline for the block. Carries `text-ink` at 17:1. */
  block: string;
  /** The 3px identity bar. Decorative. */
  bar: string;
  /** The legend swatch, and the dot on a preview strip. Decorative. */
  swatch: string;
};

const PALETTE: ShiftColour[] = [
  {
    block: "bg-accent-soft border-accent-line",
    bar: "bg-accent",
    swatch: "bg-accent",
  },
  {
    block: "bg-success-soft border-success-line",
    bar: "bg-success-strong",
    swatch: "bg-success-strong",
  },
  {
    block: "bg-info-soft border-info-line",
    bar: "bg-info",
    swatch: "bg-info",
  },
  {
    block: "bg-warning-soft border-warning-line",
    bar: "bg-warning",
    swatch: "bg-warning",
  },
  {
    block: "bg-danger-soft border-danger-line",
    bar: "bg-danger",
    swatch: "bg-danger",
  },
  {
    block: "bg-sunken border-line-strong",
    bar: "bg-muted",
    swatch: "bg-muted",
  },
];

/** What an unknown shift id gets. Never a blank square. */
export const UNKNOWN_SHIFT: ShiftColour = PALETTE[5] as ShiftColour;

/**
 * Colours by shift id, assigned by position.
 *
 * Position rather than a hash of the id, and the reason is that a hash is worse
 * where it matters: with three shifts and six colours a hash collides about a
 * third of the time, and two of three shifts the same colour is exactly the
 * outcome a palette exists to avoid. Position guarantees six distinct ones.
 *
 * Sorted by start time before the assignment so the order is a property of the
 * shifts rather than of whichever endpoint the caller happened to read — the
 * rota includes archived shifts and the catalogue does not, and a legend that
 * recoloured itself between two screens would look like a bug.
 */
export function shiftColours(
  shifts: readonly { id: string; startTime?: string }[],
): Map<string, ShiftColour> {
  const ordered = [...shifts].sort(
    (a, b) =>
      (a.startTime ?? "").localeCompare(b.startTime ?? "") ||
      a.id.localeCompare(b.id),
  );
  const map = new Map<string, ShiftColour>();
  ordered.forEach((shift, index) => {
    map.set(shift.id, PALETTE[index % PALETTE.length] as ShiftColour);
  });
  return map;
}

export const colourFor = (
  colours: Map<string, ShiftColour>,
  shiftId: string | null,
): ShiftColour => (shiftId ? colours.get(shiftId) ?? UNKNOWN_SHIFT : UNKNOWN_SHIFT);
