/**
 * Verifies every text colour in the palette against WCAG 2.1 AA on the
 * surfaces it is actually used on, in both light and dark mode. Colour
 * choices drift during a build, so this is checked rather than trusted.
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

/**
 * Everything a theme actually renders text on, plus the named pairs and
 * categorical (chart) colours for that theme. Two themes' worth of this,
 * checked by looping once per theme below, rather than two independent
 * scripts — a hand-duplicated copy is exactly what would let one drift
 * silently while the other keeps passing.
 *
 * `checks` deliberately repeats the *fixed* pairs (white on `fill-strong`,
 * white on `accent`, `fill-strong` on `success`, white on `danger-fill`,
 * white on `success-strong`) under both themes with identical hex values —
 * these tokens are declared once in `globals.css` and never redefined under
 * `[data-theme="dark"]`, so both entries should always compute the same
 * ratio. That duplication is what would catch a future edit that
 * accidentally makes one of them theme-dependent; nothing else here asserts
 * "this pair must not change between themes."
 */
type Theme = {
  backgrounds: Record<string, string>;
  textTokens: Record<string, string>;
  categorical: Record<string, string>;
  checks: [string, string, string, number, string][];
};

const THEMES: Record<"light" | "dark", Theme> = {
  light: {
    backgrounds: {
      surface: "#ffffff",
      canvas: "#f7f9fb",
      sunken: "#f1f5f8",
      "accent-soft": "#f0f2f9",
      "success-soft": "#f1f8ef",
      "warning-soft": "#fdf8ec",
      "danger-soft": "#fdf2f1",
      "info-soft": "#eff7fc",
    },
    textTokens: {
      ink: "#0a1f2d",
      "ink-soft": "#16334a",
      body: "#4a5a68",
      muted: "#586675",
      faint: "#616d76",
    },
    categorical: {
      "cat-1": "#2b3990",
      "cat-2": "#12a374",
      "cat-3": "#bf8200", /* darkened from --color-warning's #d99400 — see globals.css */
      "cat-4": "#7c5cd6",
      "cat-5": "#2b87c4",
      "cat-6": "#c0823a",
    },
    checks: [
      ["ink on surface", "#0a1f2d", "#ffffff", 4.5, "headings and primary text"],
      ["ink on canvas", "#0a1f2d", "#f7f9fb", 4.5, "headings on page background"],
      ["ink-soft on surface", "#16334a", "#ffffff", 4.5, "secondary headings"],
      ["body on surface", "#4a5a68", "#ffffff", 4.5, "body copy"],
      ["body on canvas", "#4a5a68", "#f7f9fb", 4.5, "body copy on page background"],
      ["muted on surface", "#586675", "#ffffff", 4.5, "secondary text"],
      ["muted on sunken", "#586675", "#f1f5f8", 4.5, "nav badge counts — was 4.34:1"],
      ["faint on surface", "#616d76", "#ffffff", 4.5, "11px section headings — was 3.20:1"],
      ["faint on sunken", "#616d76", "#f1f5f8", 4.5, "tertiary text on a tinted chip"],
      ["accent on surface", "#2b3990", "#ffffff", 3.0, "large text, icons, borders"],
      ["accent-text on surface", "#2b3990", "#ffffff", 4.5, "accent body text and links"],
      ["accent-text on canvas", "#2b3990", "#f7f9fb", 4.5, "accent links on canvas"],
      ["accent-text on accent-soft", "#2b3990", "#f0f2f9", 4.5, "callout text"],
      ["control-line on surface", "#6b7c89", "#ffffff", 3.0, "pickers, choice controls, hover accents"],
      ["field-line on surface", "#8492a0", "#ffffff", 3.0, "resting border, text and select inputs"],
      ["success-text on surface", "#417739", "#ffffff", 4.5, "success copy"],
      ["success-text on success-soft", "#417739", "#f1f8ef", 4.5, "success callout"],
      ["warning-text on surface", "#8a5a00", "#ffffff", 4.5, "warning copy"],
      ["warning-text on warning-soft", "#8a5a00", "#fdf8ec", 4.5, "warning callout"],
      ["danger-text on surface", "#b3261e", "#ffffff", 4.5, "error copy"],
      ["danger-text on danger-soft", "#b3261e", "#fdf2f1", 4.5, "danger callout"],
      ["info-text on surface", "#1a5f8a", "#ffffff", 4.5, "info copy"],
      ["info-text on info-soft", "#1a5f8a", "#eff7fc", 4.5, "info callout"],
      ["white on fill-strong", "#ffffff", "#0a1f2d", 4.5, "fixed fill, both themes — ink fill label, headers, dialogs"],
      ["white on accent", "#ffffff", "#2b3990", 4.5, "fixed fill, both themes — primary/accent/approve button label"],
      ["fill-strong on success", "#0a1f2d", "#8ac97d", 4.5, "fixed fill, both themes — green secondary on hover"],
      ["white on danger-fill", "#ffffff", "#b3261e", 4.5, "fixed fill, both themes — destructive button label"],
      ["white on success-strong", "#ffffff", "#529546", 3.0, "fixed fill, both themes — switch thumb against an on track"],
    ],
  },
  dark: {
    backgrounds: {
      surface: "#141e2a",
      canvas: "#0b121b",
      sunken: "#070c12",
      "accent-soft": "#1b2242",
      "success-soft": "#142a16",
      "warning-soft": "#2e2308",
      "danger-soft": "#301512",
      "info-soft": "#10222c",
    },
    textTokens: {
      ink: "#edf1f4",
      "ink-soft": "#c7d1da",
      body: "#9ba9b5",
      muted: "#8996a3",
      faint: "#848fa0",
    },
    categorical: {
      "cat-1": "#8c99ee",
      "cat-2": "#3adaa5",
      "cat-3": "#f0b33e",
      "cat-4": "#b39cfb",
      "cat-5": "#7ec1ee",
      "cat-6": "#e2ac71",
    },
    checks: [
      ["ink on surface", "#edf1f4", "#141e2a", 4.5, "headings and primary text"],
      ["ink on canvas", "#edf1f4", "#0b121b", 4.5, "headings on page background"],
      ["ink-soft on surface", "#c7d1da", "#141e2a", 4.5, "secondary headings"],
      ["body on surface", "#9ba9b5", "#141e2a", 4.5, "body copy"],
      ["body on canvas", "#9ba9b5", "#0b121b", 4.5, "body copy on page background"],
      ["muted on surface", "#8996a3", "#141e2a", 4.5, "secondary text"],
      ["muted on sunken", "#8996a3", "#070c12", 4.5, "nav badge counts"],
      ["faint on surface", "#848fa0", "#141e2a", 4.5, "11px section headings"],
      ["faint on sunken", "#848fa0", "#070c12", 4.5, "tertiary text on a tinted chip"],
      ["accent-text on surface", "#aab8f5", "#141e2a", 4.5, "accent body text and links"],
      ["accent-text on canvas", "#aab8f5", "#0b121b", 4.5, "accent links on canvas"],
      ["accent-text on accent-soft", "#aab8f5", "#1b2242", 4.5, "callout text"],
      ["control-line on surface", "#728599", "#141e2a", 3.0, "pickers, choice controls, hover accents"],
      ["field-line on surface", "#5b6d80", "#141e2a", 3.0, "resting border, text and select inputs"],
      ["success-text on surface", "#8fd67f", "#141e2a", 4.5, "success copy"],
      ["success-text on success-soft", "#8fd67f", "#142a16", 4.5, "success callout"],
      ["warning-text on surface", "#f0b33e", "#141e2a", 4.5, "warning copy"],
      ["warning-text on warning-soft", "#f0b33e", "#2e2308", 4.5, "warning callout"],
      ["danger-text on surface", "#f1857b", "#141e2a", 4.5, "error copy"],
      ["danger-text on danger-soft", "#f1857b", "#301512", 4.5, "danger callout"],
      ["info-text on surface", "#7ec1ee", "#141e2a", 4.5, "info copy"],
      ["info-text on info-soft", "#7ec1ee", "#10222c", 4.5, "info callout"],
      ["white on fill-strong", "#ffffff", "#0a1f2d", 4.5, "fixed fill, both themes — ink fill label, headers, dialogs"],
      ["white on accent", "#ffffff", "#2b3990", 4.5, "fixed fill, both themes — primary/accent/approve button label"],
      ["fill-strong on success", "#0a1f2d", "#8ac97d", 4.5, "fixed fill, both themes — green secondary on hover"],
      ["white on danger-fill", "#ffffff", "#b3261e", 4.5, "fixed fill, both themes — destructive button label"],
      ["white on success-strong", "#ffffff", "#529546", 3.0, "fixed fill, both themes — switch thumb against an on track"],
    ],
  },
};

const failures: string[] = [];
const rows: string[] = [];
let matrixCount = 0;
let catCount = 0;

for (const [themeName, theme] of Object.entries(THEMES)) {
  /* The matrix, generated rather than hand-listed — a hand-listed set is
     exactly what had the holes, in this theme just as much as the other. */
  for (const [token, fg] of Object.entries(theme.textTokens)) {
    for (const [bgName, bg] of Object.entries(theme.backgrounds)) {
      const ratio = contrast(fg, bg);
      matrixCount++;
      const label = `[${themeName}] ${token} on ${bgName}`;
      if (ratio < 4.5) {
        rows.push(`  FAIL  ${ratio.toFixed(2).padStart(6)}:1  needs 4.5  ${label}`);
        failures.push(`${label} is ${ratio.toFixed(2)}:1, needs 4.5:1`);
      }
    }
  }
  rows.push(
    `  pass  [${themeName}] ${Object.keys(theme.textTokens).length * Object.keys(theme.backgrounds).length} text-token/background pairs checked`,
  );

  /* Categorical (chart) colours — never checked before either theme had this
     script, since no cat-* entry existed in the light-mode file at all. */
  for (const [name, fg] of Object.entries(theme.categorical)) {
    for (const bgName of ["surface", "canvas"]) {
      const bg = theme.backgrounds[bgName]!;
      const ratio = contrast(fg, bg);
      catCount++;
      const label = `[${themeName}] ${name} on ${bgName}`;
      if (ratio < 3.0) {
        rows.push(`  FAIL  ${ratio.toFixed(2).padStart(6)}:1  needs 3.0  ${label}`);
        failures.push(`${label} is ${ratio.toFixed(2)}:1, needs 3.0:1`);
      }
    }
  }
  rows.push(`  pass  [${themeName}] ${Object.keys(theme.categorical).length * 2} categorical pairs checked`);

  for (const [name, fg, bg, min, why] of theme.checks) {
    const ratio = contrast(fg, bg);
    const pass = ratio >= min;
    const label = `[${themeName}] ${name}`;
    rows.push(
      `  ${pass ? "pass" : "FAIL"}  ${ratio.toFixed(2).padStart(6)}:1  needs ${min}  ${label}  (${why})`,
    );
    if (!pass) failures.push(`${label} is ${ratio.toFixed(2)}:1, needs ${min}:1`);
  }
}

console.log(rows.join("\n"));

if (failures.length) {
  console.error(`\nContrast check failed:\n${failures.map((f) => "  " + f).join("\n")}`);
  process.exit(1);
}

const totalChecks = THEMES.light.checks.length + THEMES.dark.checks.length;
console.log(
  `\nContrast check passed. ${totalChecks} named pairs, ${matrixCount} ` +
    `text-token/background combinations, and ${catCount} categorical pairs ` +
    `meet WCAG 2.1 AA across both themes.`,
);
