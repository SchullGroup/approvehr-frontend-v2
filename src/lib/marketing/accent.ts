/**
 * A company's accent colour, made safe to put a white label on.
 *
 * A company picks a colour for its careers page, and the one place it appears as
 * a button is the Send button, which carries white text. A pale yellow or a light
 * green is a perfectly good brand colour and an unreadable button. So the colour
 * is **kept as it is wherever it only decorates** (a rule, a ring) and, for the
 * button, **darkened toward black until white text clears 4.5:1** — the same hue,
 * just far enough in to be read. Nothing is ever lightened, and a colour that
 * already passes is returned unchanged.
 */

const HEX = /^#([0-9a-f]{6})$/i;

export function parseHex(
  value: string | null | undefined,
): [number, number, number] | null {
  const match = value ? HEX.exec(value.trim()) : null;
  if (!match?.[1]) return null;
  const n = Number.parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (rgb: [number, number, number]): string =>
  `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

/** WCAG relative luminance. */
function luminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast of white text on this colour. */
export function contrastWithWhite(rgb: [number, number, number]): number {
  return 1.05 / (luminance(rgb) + 0.05);
}

const darken = (
  rgb: [number, number, number],
  amount: number,
): [number, number, number] => [
  rgb[0] * (1 - amount),
  rgb[1] * (1 - amount),
  rgb[2] * (1 - amount),
];

export type Accent = {
  /** The colour as chosen, for decoration. */
  decorative: string;
  /** Safe under white text. Equal to `decorative` when that already passes. */
  button: string;
  /** Its hover state: a little darker still. */
  buttonHover: string;
};

/** `null` for anything that is not a six-digit hex colour. */
export function accentFor(value: string | null | undefined): Accent | null {
  const rgb = parseHex(value);
  if (!rgb) return null;
  let safe = rgb;
  for (let step = 0; step < 40 && contrastWithWhite(safe) < 4.5; step += 1)
    safe = darken(safe, 0.05);
  return {
    decorative: toHex(rgb),
    button: toHex(safe),
    buttonHover: toHex(darken(safe, 0.14)),
  };
}
