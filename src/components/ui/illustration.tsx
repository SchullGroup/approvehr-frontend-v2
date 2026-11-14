import { cn } from "@/lib/cn";
import { PEEPS, type PeepName } from "@/lib/peeps";

/**
 * A person from the Open Peeps set (CC0, by Pablo Stanley), asked for by name. The same figures, with the same
 * names, are in the mobile app. `docs/illustrations.md` says where one belongs and where it does not.
 *
 * - **Drawn as it is.** White fill and black line, never recoloured. It sits straight on the page; in the dark
 *   theme, where black line work cannot be read, it gets the light `well-sticker` tile the Wellness scenes use.
 * - **Decorative.** Hidden from assistive tech with an empty `alt`: the words beside a figure say everything.
 * - **Still.** No motion, so nothing for reduced-motion to switch off.
 * - `height` is the drawn height in pixels (the width follows the figure's shape); it never grows past its
 *   container, so a narrow screen shrinks it rather than scrolling sideways.
 *
 * Pass it where a drawing is expected: `<EmptyState art={<Illustration name="shrug" />} … />` or
 * `<SuccessMoment art={…} … />`. Do not put one in a card in a grid, on an error, a missing permission or a
 * record that is not there.
 */
export function Illustration({
  name,
  height = 144,
  className,
}: {
  name: PeepName;
  height?: number;
  className?: string;
}) {
  const [w, h] = PEEPS[name];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex max-w-full shrink-0 items-center justify-center",
        "[[data-theme=dark]_&]:rounded-2xl [[data-theme=dark]_&]:bg-well-sticker [[data-theme=dark]_&]:p-3",
        className,
      )}
    >
      {/* Small static SVGs from `public/`: `next/image` would only add a loader. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/illustrations/peeps/${name}.svg`}
        alt=""
        width={Math.round((height * w) / h)}
        height={height}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="h-auto max-w-full select-none"
      />
    </span>
  );
}
