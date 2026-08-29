/**
 * Nothing renders below 14px, and the floor is checked rather than trusted.
 *
 * `src/app/globals.css` says it plainly: `--text-meta` (14px) is the floor, and
 * "Nothing in the app renders smaller than 14px." That sentence was true when it
 * was written and had stopped being true by the time anybody read it again — the
 * four `people/import/*` screens carried sixteen sizes at 12px and 13px, written
 * as arbitrary values (`text-[0.75rem]`) that no reviewer reading a class list
 * recognises as a number.
 *
 * The audience is the reason this is a gate and not a preference. This product is
 * sold to owner-managers of Nigerian SMEs doing their own payroll; that reader is
 * frequently over fifty, and presbyopia is near-universal past forty-five. 12px
 * in a dense table of import errors is the exact combination of small and
 * consequential that the scale exists to prevent.
 *
 * `tsc` cannot see a class name and neither can lint. Only a browser can, which
 * is the class of bug this repo keeps finding late — so it is a check.
 *
 * ## What it bans
 *
 * Arbitrary font sizes below the floor, in any unit, plus Tailwind's own
 * `text-xs`. Arbitrary sizes at or above 14px are left alone: the marketing site
 * uses a few display sizes deliberately, and this check is about the floor rather
 * than about tokenising every value in the repo.
 */

import fs from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");

/** The floor, in px. `--text-meta` in `globals.css`. */
const FLOOR_PX = 14;
const ROOT_FONT_PX = 16;

type Offence = { file: string; line: number; snippet: string; px: number };

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(tsx|ts)$/.test(entry.name) ? [full] : [];
  });
}

/**
 * A font size in px, or null if this is not a size we can judge.
 *
 * `rem` and `em` both resolve against a 16px root here. The app never changes the
 * root size, and a check that quietly skipped `em` would miss the shorthand
 * somebody reaches for next.
 */
function toPx(raw: string): number | null {
  const value = raw.trim();
  const match = /^(-?[\d.]+)(px|rem|em)$/.exec(value);
  if (!match) return null;
  const size = Number(match[1]);
  if (!Number.isFinite(size)) return null;
  return match[2] === "px" ? size : size * ROOT_FONT_PX;
}

const offences: Offence[] = [];
let filesScanned = 0;
let sizesChecked = 0;

for (const file of walk(SRC)) {
  filesScanned += 1;
  const lines = fs.readFileSync(file, "utf8").split("\n");

  lines.forEach((line, index) => {
    /* Arbitrary values: text-[13px], text-[0.8125rem], sm:text-[12px]. */
    for (const match of line.matchAll(/\btext-\[([^\]]+)\]/g)) {
      const px = toPx(match[1] ?? "");
      if (px === null) continue;
      sizesChecked += 1;
      if (px < FLOOR_PX) {
        offences.push({
          file: path.relative(process.cwd(), file),
          line: index + 1,
          snippet: match[0],
          px,
        });
      }
    }

    /* Tailwind's own sub-floor step. 12px, and it reads as a size nobody
       measured. */
    for (const match of line.matchAll(/\btext-xs\b/g)) {
      sizesChecked += 1;
      offences.push({
        file: path.relative(process.cwd(), file),
        line: index + 1,
        snippet: match[0],
        px: 12,
      });
    }
  });
}

if (offences.length > 0) {
  console.error(
    `\nType scale check failed. ${offences.length} ${
      offences.length === 1 ? "size renders" : "sizes render"
    } below the ${FLOOR_PX}px floor:\n`,
  );
  for (const offence of offences) {
    console.error(
      `  ${offence.file}:${offence.line}  ${offence.snippet}  (${offence.px}px)`,
    );
  }
  console.error(
    "\nUse the body-scale tokens instead — text-body-lg (17px), text-body-md\n" +
      "(16px), text-body-sm (15px) or text-meta (14px, the floor). Note that\n" +
      "`text-body` is a COLOUR utility and carries no size at all; the 16px step\n" +
      "is `text-body-md`.\n\n" +
      "If a design seems to need 12px, the design is wrong — either it shows\n" +
      "something that does not belong on that screen, or the container needs to\n" +
      "be bigger. See the body-scale note in src/app/globals.css.\n",
  );
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* No size token may share a name with a colour token                          */
/* -------------------------------------------------------------------------- */

/**
 * A `--text-x` and a `--color-x` generate the same `text-x` utility, and
 * Tailwind v4 resolves it in favour of the colour. The size then produces
 * **nothing at all**, silently — the class is still valid, still does
 * something, and simply is not the thing its author asked for.
 *
 * `--text-body` and `--color-body` collided for months. Every `text-body` in
 * the app is a colour and always was; what did not exist was any way to name
 * the 16px step. It cost two defects in one day, both reported as "the fonts
 * are not uniform": `CardHeader` got 16px by inheriting from `body` rather than
 * from anything its class list said, and `Disclosure` was then moved onto
 * `text-body-lg` and rendered a section heading 17px beside the 16px card
 * heading it exists to match.
 *
 * The 16px step is `--text-body-md` now. This check is why it cannot quietly
 * become unreachable again — and it is structural rather than a list, so a
 * collision on any future token fails without anybody remembering to add it.
 */
const css = fs.readFileSync(path.join(SRC, "app/globals.css"), "utf8");
const named = (prefix: string): Set<string> =>
  new Set(
    [...css.matchAll(new RegExp(`--${prefix}-([a-z0-9-]+)\\s*:`, "g"))]
      .map((m) => m[1] ?? "")
      .filter((name) => name !== "" && !name.endsWith("--line-height")),
  );

const collisions = [...named("text")].filter((name) => named("color").has(name)).sort();
if (collisions.length > 0) {
  console.error(
    `\nThese tokens exist as BOTH a size and a colour, so the size generates\n` +
      `nothing and any class using it silently has no font-size:\n\n` +
      collisions.map((name) => `  --text-${name}  vs  --color-${name}`).join("\n") +
      `\n\nRename the size — the colour is what every existing call site means.\n` +
      `See the body-scale note in src/app/globals.css.\n`,
  );
  process.exit(1);
}

console.log(
  `\nType scale check passed. ${sizesChecked} explicit ${
    sizesChecked === 1 ? "size" : "sizes"
  } across ${filesScanned} files, none below ${FLOOR_PX}px.\n`,
);
