import { cn } from "@/lib/cn";
import { PEEPS, type PeepName } from "@/lib/peeps";

/**
 * A person from the Open Peeps set (CC0, by Pablo Stanley), asked for by name. The same figures, with the same
 * names, are in the mobile app. `docs/illustrations.md` says where one belongs and where it does not.
 *
 * - **Drawn as it is in the light theme.** White fill and black line, straight on the page.
 * - **Drawn in the dark theme's indigo in the dark theme.** Black line work cannot be read on a dark page and a white
 *   fill is a glaring patch, so under `<html data-theme="dark">` the copy in `peeps/dark/` is drawn instead: the line
 *   in `accent-text`, the fill in `accent-soft`, straight on the page with no tile. `scripts/dark-art.ts` writes
 *   those files from the light ones and the dark tokens; `npm run check` fails if they fall out of date.
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
  const size = { width: Math.round((height * w) / h), height };
  return (
    <span
      aria-hidden="true"
      data-illustration={name}
      className={cn(
        "inline-flex max-w-full shrink-0 items-center justify-center",
        className,
      )}
    >
      {/* Small static SVGs from `public/`: `next/image` would only add a loader. Two files, one per theme; the
          one that is `display: none` is never fetched, because a lazy image without a box never enters the
          viewport. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/illustrations/peeps/${name}.svg`}
        alt=""
        {...size}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="h-auto max-w-full select-none [[data-theme=dark]_&]:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/illustrations/peeps/dark/${name}.svg`}
        alt=""
        {...size}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="hidden h-auto max-w-full select-none [[data-theme=dark]_&]:block"
      />
    </span>
  );
}
