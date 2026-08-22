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
const NEXT = path.join(ROOT, process.env["NEXT_DIST_DIR"] ?? ".next");

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

/* ========================================================================== *
 * Fabricated records, which the two checks above cannot see
 * ========================================================================== *
 *
 * Everything above looks for demo-mode *copy*. That is the right check for a
 * badge and it is blind to the defect that actually shipped: `/design-system`
 * carried the seed directory's staff names, their salaries, a manager and a
 * pension PIN of `PEN100482913`, as ordinary component props on an internal
 * style reference. No banned phrase appeared anywhere near them, the page is not
 * demo *mode*, and both checks above passed while a fabricated credential sat in
 * a production chunk.
 *
 * So this half asks a different question: does any file name a person the seed
 * invented, or hold a value shaped like a credential, without being behind the
 * flag that folds it away?
 *
 * ## The names are derived, never listed
 *
 * From `lib/mock/people.ts`, which is the seed. A list here would go stale the
 * first time somebody adds a persona, and the check would keep passing.
 *
 * ## Why this half is source-side and the credential half is not
 *
 * A built chunk cannot tell you which file a name came from, and one legitimate
 * surface ships these names on purpose: the marketing mockups are hand-drawn
 * illustrations of the product on the public site, where a plausible Nigerian
 * name is the argument being made and claims nothing about any reader's data.
 * Scoping that exemption is possible in the source and guesswork in a chunk, so
 * the name check runs over `src/` — which is also where the defect was written,
 * and therefore where saying so is most useful.
 *
 * A credential-shaped value has no such exemption. Nothing legitimate renders
 * something that reads as somebody's RSA PIN, in any surface, so that one is
 * checked in the built output too and has no allowlist.
 */

/** Seed personas, read from the seed itself. */
function seedNames(): string[] {
  const seed = path.join(SRC, "lib", "mock", "people.ts");
  if (!fs.existsSync(seed)) return [];
  const text = fs.readFileSync(seed, "utf8");
  const names = new Set<string>();
  const pattern = /firstName:\s*"([^"]+)",\s*lastName:\s*"([^"]+)"/g;
  for (const m of text.matchAll(pattern)) names.add(`${m[1]} ${m[2]}`);
  return [...names];
}

/**
 * Values shaped like a credential somebody could mistake for a real one.
 *
 * A pension PIN is `PEN` and nine digits. All-zero is how the design system now
 * shows the shape without inventing one, so it is excluded by the digit class
 * rather than by an allowlist — a placeholder that reads as a placeholder is the
 * point, and `PEN000000000` cannot be mistaken for anybody's.
 */
const CREDENTIAL_SHAPES: { name: string; pattern: RegExp }[] = [
  { name: "pension PIN", pattern: /\bPEN(?!0{9})\d{9,}\b/g },
];

/**
 * The only file allowed to name a seed persona: the seed itself, which is gated
 * and is where the list above is read from.
 *
 * There used to be three more entries here. The marketing mockups and the public
 * demo form's name placeholder are illustrations rather than records, so
 * exempting them was defensible — and it made the check unenforceable where it
 * matters. A built chunk cannot tell you which file a name came from, so as long
 * as one legitimate surface shipped the *same* names as the seed, a seed persona
 * in a production bundle could always be explained away.
 *
 * Those surfaces have their own roster now — Chioma Aduba and five others,
 * plausible Nigerian names in the register the marketing site argues in, none of
 * them on the seed. Nothing about what those pages claim has changed. What
 * changed is that a seed persona in the built output is now unambiguous, which is
 * what lets the bundle half below run with no allowlist at all.
 */
const ILLUSTRATION = [path.join(SRC, "lib", "mock", "people.ts")];

const NAMES = seedNames();
if (NAMES.length === 0) {
  console.error(
    "\nFabrication check FAILED: no personas could be read out of " +
      "src/lib/mock/people.ts, so the check has nothing to look for. Either the " +
      "seed moved or its shape changed — fix `seedNames()` rather than leaving " +
      "a check that cannot fail.\n",
  );
  process.exit(1);
}

/** A loose fabrication: the file, and the name or credential it holds. */
type Fabrication = { file: string; phrase: string };

const fabricated: Fabrication[] = [];

for (const file of walk(SRC, (f) => /\.(ts|tsx|mts)$/.test(f))) {
  if (file === SELF || ILLUSTRATION.includes(file)) continue;
  const raw = fs.readFileSync(file, "utf8");
  /* Comments are stripped: a doc comment explaining a demo branch is kept
     deliberately, and comments do not survive minification anyway. */
  const code = withoutComments(raw);

  /* Per *declaration*, not per file. The first version of this asked whether
     the file mentioned DEMO_ENABLED anywhere, and that let a fabricated
     payment history through `lib/store/payments.ts` — two of its seeds were
     gated, a third was not, and the file-level question answered "gated" for
     all three. A module-scope declaration is the unit that folds or does not. */
  for (const decl of code.split(
    /^(?=(?:export )?(?:const|let|function|class) )/m,
  )) {
    const gated = decl.includes("DEMO_ENABLED");
    if (gated) continue;
    for (const name of NAMES) {
      if (decl.includes(name)) fabricated.push({ file, phrase: name });
    }
    for (const { name, pattern } of CREDENTIAL_SHAPES) {
      const hit = decl.match(pattern);
      if (hit) fabricated.push({ file, phrase: `${name} ${hit[0]}` });
    }
  }
}

if (fabricated.length > 0) {
  console.error(
    "\nFabrication check FAILED. These files invent a person or a credential " +
      "and are not behind DEMO_ENABLED, so the values ship to production as " +
      "though they were somebody's record:\n",
  );
  for (const o of fabricated) {
    console.error(`  ${path.relative(ROOT, o.file)}\n    ${o.phrase}`);
  }
  console.error(
    "\nFix it by making the value obviously synthetic — that is what the " +
      "design system does — or by putting it behind DEMO_ENABLED if it is " +
      "genuinely demo data. Gating the *route* is not enough: a lazily " +
      "imported module still emits its chunk, and the values stay fetchable " +
      "from .next/static.\n",
  );
  process.exit(1);
}

/* Over the built output, with no allowlist: neither a seed persona nor a
   credential shape has any legitimate reason to be in a production bundle. This
   is the half that proves something -- the source half above says a value is
   *capable* of folding, and the exported-const incident recorded in
   `lib/demo.ts` is what happens when that is mistaken for proof. */
const builtCredentials: Fabrication[] = [];
for (const dir of chunkDirs) {
  if (!fs.existsSync(dir)) continue;
  for (const file of walk(dir, (f) =>
    /\.(js|mjs|cjs|json|html|rsc|txt)$/.test(f),
  )) {
    if (file.endsWith(".map")) continue;
    const built = fs.readFileSync(file, "utf8");
    for (const { name, pattern } of CREDENTIAL_SHAPES) {
      const hit = built.match(pattern);
      if (hit) builtCredentials.push({ file, phrase: `${name} ${hit[0]}` });
    }
    for (const persona of NAMES) {
      if (built.includes(persona)) {
        builtCredentials.push({ file, phrase: `seed persona ${persona}` });
      }
    }
  }
}

if (builtCredentials.length > 0) {
  console.error(
    "\nFabrication check FAILED in the built output. A production build " +
      "carries a seed persona or a value shaped like somebody's " +
      "credential:\n",
  );
  for (const c of builtCredentials.slice(0, 10)) {
    console.error(`  ${path.relative(ROOT, c.file)}\n    ${c.phrase}`);
  }
  console.error("");
  process.exit(1);
}

console.log(
  `Fabrication check: ${NAMES.length} seed personas and ` +
    `${CREDENTIAL_SHAPES.length} credential shape(s), none loose in src/ ` +
    `or the build.`,
);
