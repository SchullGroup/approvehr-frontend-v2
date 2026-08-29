/**
 * Verifies every text colour in the palette against WCAG 2.1 AA on the
 * surfaces it is actually used on. Colour choices drift during a build, so
 * this is checked rather than trusted.
 */

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function luminance([r, g, b]: RGB): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const la = luminance(hexToRgb(a));
  const lb = luminance(hexToRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACE = "#ffffff";
const CANVAS = "#f7f9fb";
const INK = "#0a1f2d";

/**
 * Every background the app actually renders text on.
 *
 * The earlier version of this file modelled `surface` and `canvas` only, and
 * passed while three real pairs failed in the browser — 11px text on
 * `bg-sunken`, and supporting copy inside callout tints. A model that omits a
 * background cannot catch a failure on it, so the text tokens are now checked
 * against all of them as a matrix.
 */
const BACKGROUNDS: Record<string, string> = {
  surface: SURFACE,
  canvas: CANVAS,
  sunken: "#f1f5f8",
  "accent-soft": "#f0f2f9",
  "success-soft": "#f1f8ef",
  "warning-soft": "#fdf8ec",
  "danger-soft": "#fdf2f1",
  "info-soft": "#eff7fc",
};

/**
 * Text colours, every one of which must clear 4.5:1 wherever it is used.
 *
 * `faint` is in here rather than exempted at 3:1. It was exempted on the
 * reasoning that it was for icons and large text, and that was simply not true
 * of the code — it renders 11px section headings and table hints.
 */
const TEXT_TOKENS: Record<string, string> = {
  ink: "#0a1f2d",
  "ink-soft": "#16334a",
  body: "#4a5a68",
  muted: "#586675",
  faint: "#616d76",
};

/** [name, colour, background, minimum required ratio, why] */
const CHECKS: [string, string, string, number, string][] = [
  ["ink on surface", "#0a1f2d", SURFACE, 4.5, "headings and primary text"],
  ["ink on canvas", "#0a1f2d", CANVAS, 4.5, "headings on page background"],
  ["ink-soft on surface", "#16334a", SURFACE, 4.5, "secondary headings"],
  ["body on surface", "#4a5a68", SURFACE, 4.5, "body copy"],
  ["body on canvas", "#4a5a68", CANVAS, 4.5, "body copy on page background"],
  ["muted on surface", "#586675", SURFACE, 4.5, "secondary text"],
  ["muted on sunken", "#586675", "#f1f5f8", 4.5, "nav badge counts — was 4.34:1"],
  ["faint on surface", "#616d76", SURFACE, 4.5, "11px section headings — was 3.20:1"],
  ["faint on sunken", "#616d76", "#f1f5f8", 4.5, "tertiary text on a tinted chip"],
  ["accent on surface", "#2b3990", SURFACE, 3.0, "large text, icons, borders"],
  ["accent-text on surface", "#2b3990", SURFACE, 4.5, "accent body text and links"],
  ["accent-text on canvas", "#2b3990", CANVAS, 4.5, "accent links on canvas"],
  ["accent-text on accent-soft", "#2b3990", "#f0f2f9", 4.5, "callout text"],
  ["control-line on surface", "#6b7c89", SURFACE, 3.0, "buttons, pickers, hover accents"],
  ["field-line on surface", "#8492a0", SURFACE, 3.0, "resting border, text and select inputs"],
  ["success-text on surface", "#417739", SURFACE, 4.5, "success copy"],
  ["success-text on success-soft", "#417739", "#f1f8ef", 4.5, "success callout"],
  ["warning-text on surface", "#8a5a00", SURFACE, 4.5, "warning copy"],
  ["warning-text on warning-soft", "#8a5a00", "#fdf8ec", 4.5, "warning callout"],
  ["danger-text on surface", "#b3261e", SURFACE, 4.5, "error copy"],
  ["danger-text on danger-soft", "#b3261e", "#fdf2f1", 4.5, "danger callout"],
  ["info-text on surface", "#1a5f8a", SURFACE, 4.5, "info copy"],
  ["info-text on info-soft", "#1a5f8a", "#eff7fc", 4.5, "info callout"],
  ["white on ink", SURFACE, INK, 4.5, "ink fill label — headers and the marketing dark pill"],
  ["white on accent", SURFACE, "#2b3990", 4.5, "primary/accent/approve button label — the ApproveHR blue"],
  ["ink on success", INK, "#8ac97d", 4.5, "green secondary on hover — brand green carries ink, never white"],
  ["white on danger-text", SURFACE, "#b3261e", 4.5, "destructive button label"],
  ["white on success-strong", SURFACE, "#529546", 3.0, "switch thumb against an on track"],
];

const failures: string[] = [];
const rows: string[] = [];

/* The matrix, generated rather than hand-listed — a hand-listed set is exactly
   what had the holes. */
let matrixCount = 0;
for (const [token, fg] of Object.entries(TEXT_TOKENS)) {
  for (const [bgName, bg] of Object.entries(BACKGROUNDS)) {
    const ratio = contrast(fg, bg);
    matrixCount++;
    if (ratio < 4.5) {
      rows.push(
        `  FAIL  ${ratio.toFixed(2).padStart(6)}:1  needs 4.5  ${token} on ${bgName}`,
      );
      failures.push(`${token} on ${bgName} is ${ratio.toFixed(2)}:1, needs 4.5:1`);
    }
  }
}
rows.push(
  `  pass  ${matrixCount} text-token/background pairs, every one at or above 4.5:1`,
);

for (const [name, fg, bg, min, why] of CHECKS) {
  const ratio = contrast(fg, bg);
  const pass = ratio >= min;
  rows.push(
    `  ${pass ? "pass" : "FAIL"}  ${ratio.toFixed(2).padStart(6)}:1  needs ${min}  ${name}  (${why})`,
  );
  if (!pass) failures.push(`${name} is ${ratio.toFixed(2)}:1, needs ${min}:1`);
}

console.log(rows.join("\n"));

if (failures.length) {
  console.error(`\nContrast check failed:\n${failures.map((f) => "  " + f).join("\n")}`);
  process.exit(1);
}
console.log(
  `\nContrast check passed. ${CHECKS.length} named pairs and ${matrixCount} ` +
    `text-token/background combinations meet WCAG 2.1 AA.`,
);
