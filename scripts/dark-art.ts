/**
 * Writes the dark-theme copies of the app's line art, from the light files and the dark tokens.
 *
 *     npx tsx scripts/dark-art.ts           # write them
 *     npx tsx scripts/dark-art.ts --check   # fail if any is missing or out of date (part of `npm run check`)
 *
 * The Open Peeps figures (`public/illustrations/peeps/`) are a white fill and a black line, and the Open Doodles
 * scenes (`public/wellness/scenes/`) a black line and one pink. On a dark page black line work cannot be read and
 * a white fill is a glaring patch, so the dark theme draws each one in the theme's own indigo instead:
 *
 * - the line in `--color-accent-text` (the dark theme's indigo text, well over 3:1 on every dark surface),
 * - the fill in `--color-accent-soft` (the dark indigo wash, so a figure stays solid and does not show the card
 *   through it),
 * - the scenes' pink in `--color-well-pink-text` (the Wellness pink, lightened for dark).
 *
 * The colours are read out of the `:root[data-theme="dark"]` block of `src/app/globals.css` every time, so a
 * figure follows the token if the token moves; `--check` is what notices a token changed and the files did not.
 * Each light file must contain exactly the colours listed below and no others: a new colour in a new figure
 * stops the script rather than being drawn as it is on a dark page.
 *
 * `Illustration` and `SceneImage` draw the file under `dark/` when `<html data-theme="dark">` is set, and the
 * light file otherwise. docs/illustrations.md has the rules.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

/** The dark tokens a dark figure is drawn in, read from globals.css. */
export function darkTokens(css: string): Record<string, string> {
  const start = css.indexOf(':root[data-theme="dark"] {');
  if (start < 0)
    throw new Error('globals.css has no :root[data-theme="dark"] block');
  const block = css.slice(start, css.indexOf("\n}", start));
  const read = (name: string) => {
    const match = block.match(
      new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})\\b`),
    );
    if (!match?.[1])
      throw new Error(`--color-${name} is not set in the dark block`);
    return match[1].toLowerCase();
  };
  return {
    line: read("accent-text"),
    fill: read("accent-soft"),
    pink: read("well-pink-text"),
  };
}

type Set = {
  dir: string;
  /** Every colour a light file in this set may use, and what it becomes in the dark copy. */
  swap: (tokens: Record<string, string>) => Record<string, string>;
};

const SETS: Set[] = [
  {
    dir: "public/illustrations/peeps",
    swap: (t) => ({ "#fff": t.fill!, "#000": t.line! }),
  },
  {
    dir: "public/wellness/scenes",
    swap: (t) => ({ "#000000": t.line!, "#FF5678": t.pink! }),
  },
];

/** The dark copy of one light file. Throws on a colour it does not know. */
export function darken(
  svg: string,
  swap: Record<string, string>,
  name: string,
): string {
  const used = new Set(
    [...svg.matchAll(/(?:fill|stroke|stop-color)="(#[0-9a-fA-F]{3,8})"/g)].map(
      (m) => m[1]!,
    ),
  );
  for (const colour of used) {
    if (!(colour in swap)) {
      throw new Error(
        `${name}: ${colour} has no dark colour. Add it to SETS in scripts/dark-art.ts.`,
      );
    }
  }
  if (/style=|<style|rgb\(|currentColor/.test(svg)) {
    throw new Error(
      `${name}: colour set outside a fill attribute; this script only swaps fill="#…"`,
    );
  }
  return svg.replace(
    /(fill|stroke|stop-color)="(#[0-9a-fA-F]{3,8})"/g,
    (_, attr: string, colour: string) => {
      return `${attr}="${swap[colour]}"`;
    },
  );
}

/** Every dark file, keyed by its path from the repo root, as it should read now. */
export function expectedDarkFiles(root = ROOT): Map<string, string> {
  const tokens = darkTokens(
    readFileSync(join(root, "src/app/globals.css"), "utf8"),
  );
  const files = new Map<string, string>();
  for (const set of SETS) {
    const swap = set.swap(tokens);
    for (const file of readdirSync(join(root, set.dir)).sort()) {
      if (!file.endsWith(".svg")) continue;
      const light = readFileSync(join(root, set.dir, file), "utf8");
      files.set(
        `${set.dir}/dark/${file}`,
        darken(light, swap, `${set.dir}/${file}`),
      );
    }
  }
  return files;
}

function main() {
  const check = process.argv.includes("--check");
  const stale: string[] = [];
  for (const [path, content] of expectedDarkFiles()) {
    const full = join(ROOT, path);
    if (check) {
      if (!existsSync(full) || readFileSync(full, "utf8") !== content)
        stale.push(path);
      continue;
    }
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  if (check) {
    if (stale.length) {
      console.error(
        `Dark line art is missing or out of date:\n${stale.map((p) => `  ${p}`).join("\n")}\n` +
          "Run `npx tsx scripts/dark-art.ts` and commit the result.",
      );
      process.exit(1);
    }
    console.log("Dark line art matches the light files and the dark tokens.");
    return;
  }
  console.log("Wrote the dark line art.");
}

if (process.argv[1]?.endsWith("dark-art.ts")) main();
