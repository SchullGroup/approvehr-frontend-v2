import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/*
 * The design system defines custom font size utilities (text-h2, text-lead
 * and so on) alongside custom text colours (text-ink, text-body). Out of the
 * box tailwind-merge cannot tell them apart: it reads every `text-*` as a
 * colour, so `cn("text-h2", "text-ink")` silently drops the size.
 *
 * Registering the sizes explicitly keeps both groups independent, so a
 * heading can carry a size and a colour at the same time.
 */

const FONT_SIZES = [
  "display",
  "h1",
  "h2",
  "h3",
  "h4",
  "lead",
  "eyebrow",
  /* The body scale. `meta` is the smallest size the app ships — see the note in
     globals.css for why there is a floor at all. */
  "body-lg",
  "body",
  "body-sm",
  "meta",
];

const TEXT_COLOURS = [
  "ink",
  "ink-soft",
  "body",
  "muted",
  "faint",
  "accent",
  "accent-text",
  "accent-hover",
  "success",
  "success-text",
  "warning",
  "warning-text",
  "danger",
  "danger-text",
  "info",
  "info-text",
  "canvas",
  "surface",
  "sunken",
];

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": FONT_SIZES.map((size) => `text-${size}`),
      "text-color": TEXT_COLOURS.map((colour) => `text-${colour}`),
    },
  },
});

/**
 * Compose Tailwind class names, resolving conflicts so the last value wins.
 * Used by every component in components/ui so callers can always override.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
