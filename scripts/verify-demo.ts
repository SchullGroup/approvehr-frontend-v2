import fs from "node:fs";
import path from "node:path";

/**
 * No demo artifact reaches a production build.
 *
 * The owner's instruction was to remove "Demo data, this browser only" and
 * anything else that signifies a demo before going live. The badges were not the
 * problem on their own — they were labelling *invented local data*, and a figure
 * that looks real and is local is the dishonesty this product exists to fix (see
 * the payroll audit in `PARITY.md`). Deleting the labels and leaving the mode
 * would have been strictly worse: the product would then present made-up numbers
 * as the company's own.
 *
 * So the mode went instead. `DEMO_ENABLED` in `src/lib/demo.ts` is
 * `process.env.NODE_ENV !== "production"`, which the bundler substitutes as a
 * literal — every `if (DEMO_ENABLED)`, `DEMO_ENABLED ? seed : []` and
 * `{DEMO_ENABLED && <Badge/>}` folds away, and the seeded salaries, fabricated
 * bank accounts and demo copy go with them. In a development build every badge
 * still renders, unchanged.
 *
 * That is a claim about a minifier, which is exactly the kind of claim that
 * should be checked rather than believed. So:
 *
 * 1. **The source check** (always) — every banned phrase in `src/` sits in a
 *    file that imports `DEMO_ENABLED`, so it is at least *capable* of being
 *    gated, and a new unguarded badge fails here rather than in production.
 * 2. **The bundle check** (when a production build is present) — grep the built
 *    client and server chunks for the phrases themselves. This is the one that
 *    actually proves it. Run `npm run build` first; on a dev-only `.next` it
 *    says so and skips rather than passing quietly.
 *
 * The second half is the gate CI wants, after the build step.
 */

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const NEXT = path.join(ROOT, ".next");

/** The owner's own list, plus the two identifiers that used to carry the copy. */
const BANNED = [
  "Demo data",
  "this browser only",
  "Demo ·",
  "demo mode",
  "Saves in this browser",
  "Demo structure",
  "Demo calendar",
  "demoRefusal",
  "demoLimits",
  "Demo session",
  "Demo locations",
  "Read-only in demo",
];

/**
 * Sentences that carry a banned phrase and are **true in a production build**.
 *
 * "this browser only" is on the list because it was the demo's own words. It is
 * also the honest description of `lib/store/employee-draft.ts`, which is a real
 * production feature: an employee draft is saved locally on purpose, and
 * `HANDOVER.md` records that the whole justification for not building a
 * server-side draft is that the cost is stated on screen in those words. Banning
 * the sentence would delete a true warning to satisfy a grep, which is the same
 * mistake as deleting the demo badges and leaving the demo.
 *
 * Each entry has to be a whole sentence, not a fragment, so a new piece of demo
 * copy cannot slip through by containing one.
 */
const TRUE_IN_PRODUCTION = [
  "Drafts live in this browser only — they are not on your other",
  "In this browser only. It will not be here on another device.",
];

const stripAllowed = (text: string): string =>
  TRUE_IN_PRODUCTION.reduce((acc, allowed) => acc.split(allowed).join(""), text);

/**
 * The module that is allowed to hold the copy, because it is the module that
 * gates it. Anything here folds to a literal at build time.
 */
const OWNS_THE_COPY = path.join(SRC, "lib", "demo.ts");

/** This file, which has to name the phrases in order to ban them. */
const SELF = path.join(ROOT, "scripts", "verify-demo.ts");

function walk(dir: string, keep: (f: string) => boolean): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, keep);
    return keep(full) ? [full] : [];
  });
}

/**
 * Strips line and block comments.
 *
 * Comments explaining the demo branch are not artifacts — the branch still
 * exists in a development build and deleting its explanation would make the code
 * worse, not cleaner. Only what can reach a screen is checked.
 *
 * Deliberately crude: it does not understand a `//` inside a string literal.
 * That over-strips at worst, and the bundle check below is the authority.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

/* ------------------------------------------------------------ source check */

type Offender = { file: string; phrase: string; reason: string };
const offenders: Offender[] = [];
let sourceFilesChecked = 0;

for (const file of walk(SRC, (f) => /\.(ts|tsx|mts)$/.test(f))) {
  if (file === OWNS_THE_COPY) continue;
  sourceFilesChecked += 1;
  const code = stripAllowed(withoutComments(fs.readFileSync(file, "utf8")));
  /* `DEMO_ENABLED` is an ambient compile-time literal, not an import — see
     `next.config.ts`. So the marker is the identifier itself. */
  const gated = code.includes("DEMO_ENABLED");
  for (const phrase of BANNED) {
    if (!code.includes(phrase)) continue;
    if (gated) continue;
    offenders.push({
      file: path.relative(ROOT, file),
      phrase,
      reason: "does not mention DEMO_ENABLED, so nothing can be folding it away",
    });
  }
}

if (offenders.length > 0) {
  console.error(
    "\nDemo check failed. These say something about a demo and are not behind " +
      "the build flag, so they would ship:\n",
  );
  for (const o of offenders) {
    console.error(`  ${o.file}\n    "${o.phrase}" — ${o.reason}`);
  }
  console.error(
    "\nFix by guarding the site with DEMO_ENABLED from @/lib/demo:\n" +
      "  {DEMO_ENABLED && !connected && <Callout …/>}\n" +
      "or, for a source label, by calling sourceNote(connected) instead of\n" +
      "writing the two strings inline. Both fold to nothing in a production\n" +
      "build. If the sentence is true in production — a module with no API at\n" +
      "all — reword it to say that instead of saying \"demo\".\n",
  );
  process.exit(1);
}

console.log(
  `Demo source check: ${sourceFilesChecked} files, no ungated demo copy.`,
);

/* ------------------------------------------------------------ bundle check */

if (!fs.existsSync(NEXT)) {
  console.log(
    "Demo bundle check: skipped — no .next directory. Run `npm run build` " +
      "first to prove the phrases are absent from the shipped chunks.",
  );
  process.exit(0);
}

/**
 * A production build writes `.next/BUILD_ID`; `next dev` does not. Without this
 * the check would pass on a dev build, where the strings are *supposed* to be
 * present — a pass that means the opposite of what it says.
 */
if (!fs.existsSync(path.join(NEXT, "build-manifest.json"))) {
  console.log(
    "Demo bundle check: skipped — .next holds a development build, where the " +
      "demo is meant to be there. Run `npm run build` to check the real thing.",
  );
  process.exit(0);
}

/**
 * `next build` writes `.next/static` and `.next/server`. `next dev` writes
 * `.next/dev/**` — a development build, where the demo is *supposed* to be
 * present — so that subtree is excluded rather than reported. A dev server
 * running beside a production build is the normal state on this machine.
 */
const chunkDirs = [
  path.join(NEXT, "static"),
  path.join(NEXT, "server"),
].filter((d) => fs.existsSync(d));

const found: { file: string; phrase: string }[] = [];
let chunksChecked = 0;

for (const dir of chunkDirs) {
  for (const file of walk(dir, (f) => /\.(js|mjs|cjs|json|html|rsc|txt)$/.test(f))) {
    if (file === SELF) continue;
    chunksChecked += 1;
    const built = stripAllowed(fs.readFileSync(file, "utf8"));
    for (const phrase of BANNED) {
      if (built.includes(phrase)) {
        found.push({ file: path.relative(ROOT, file), phrase });
      }
    }
  }
}

if (found.length > 0) {
  console.error(
    "\nDemo bundle check FAILED. A production build still carries demo copy, " +
      "which means something is not behind DEMO_ENABLED — or is behind it in a " +
      "shape the minifier cannot fold (a value passed as a prop, a template " +
      "literal built at runtime, a string in a data structure the branch " +
      "returns):\n",
  );
  const byPhrase = new Map<string, string[]>();
  for (const f of found) {
    byPhrase.set(f.phrase, [...(byPhrase.get(f.phrase) ?? []), f.file]);
  }
  for (const [phrase, files] of byPhrase) {
    console.error(`  "${phrase}" in ${files.length} chunk(s):`);
    for (const file of files.slice(0, 5)) console.error(`    ${file}`);
    if (files.length > 5) console.error(`    …and ${files.length - 5} more`);
  }
  console.error("");
  process.exit(1);
}

console.log(
  `Demo bundle check: ${chunksChecked} built files, none carries demo copy.`,
);
