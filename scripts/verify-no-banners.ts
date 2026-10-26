/**
 * No tinted boxes for a message, and the rule is checked rather than trusted.
 *
 * The owner does not want large banners anywhere: *"the big banner like '1
 * probation has already ended' should not be used… maybe a tooltip, maybe an
 * icon that draws users' attention."* A fact about a person or a section is an
 * `AttentionMark` beside it, a failure is plain red words, and a call to action
 * is a button on one line. `Callout` was changed so it cannot draw a box.
 *
 * What it cannot stop is a `div` written by hand with the same look, which is how
 * the product came to have a second and third kind of banner: a tinted error
 * panel pasted into forty dialogs, a "Banner" component on the fairness screen.
 * `tsc` and lint cannot see a class name, so this reads them.
 *
 * ## What it bans
 *
 * A class string that gives something the warning or danger tint (`bg-warning-soft`
 * or `bg-danger-soft`, at any opacity) **and** a border **and** padding: that is a
 * box. Accent and info tints are left alone, because those are the selected state
 * of a chosen option, a drag-over, a highlighted cell; the amber and the red are
 * what a banner is made of.
 *
 * ## What it leaves alone
 *
 * Files in `ALLOWED`, each with its reason. A tint in a printed document is
 * content, not chrome, and a categorical palette is not a message.
 */

import fs from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");

const ALLOWED: Record<string, string> = {
  "components/payroll/payslip-document.tsx":
    "A printed payslip: the unpaid-days note is part of the document.",
  "app/(app)/design-system/":
    "The component gallery shows every tone on purpose.",
  "components/marketing/": "The public site has its own palette.",
  "app/(marketing)/": "The public site has its own palette.",
  "app/(app)/people/shifts/palette.ts":
    "A categorical colour for a shift, not a message.",
};

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(tsx|ts)$/.test(entry.name) ? [full] : [];
  });
}

const TINT = /(^|\s)bg-(warning|danger)-soft(\/\d+)?(\s|$)/;
const BORDER = /(^|\s)border(\s|$)/;
const PADDING = /(^|\s)p[xy]?-[\d.]+(\s|$)/;

const offences: { file: string; line: number; snippet: string }[] = [];

for (const full of walk(SRC)) {
  const rel = path.relative(SRC, full).split(path.sep).join("/");
  if (Object.keys(ALLOWED).some((prefix) => rel.startsWith(prefix))) continue;
  const lines = fs.readFileSync(full, "utf8").split("\n");
  lines.forEach((text, index) => {
    for (const match of text.matchAll(
      /"([^"\n]*bg-(?:warning|danger)-soft[^"\n]*)"/g,
    )) {
      const classes = match[1] ?? "";
      if (TINT.test(classes) && BORDER.test(classes) && PADDING.test(classes)) {
        offences.push({
          file: rel,
          line: index + 1,
          snippet: classes.slice(0, 110),
        });
      }
    }
  });
}

if (offences.length > 0) {
  console.error(
    `No-banners check failed: ${offences.length} tinted box${offences.length === 1 ? "" : "es"}.\n` +
      "A fact about a row or a section is an AttentionMark beside it; a failure is plain red words\n" +
      '(Callout tone="danger"); a call to action is a button on one line. See HANDOVER.md, "No banners anywhere".\n',
  );
  for (const hit of offences) {
    console.error(`  ${hit.file}:${hit.line}\n    ${hit.snippet}`);
  }
  process.exit(1);
}

console.log("No-banners check passed. No amber or red box is written by hand.");
