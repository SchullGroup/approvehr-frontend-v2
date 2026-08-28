/**
 * `read()` is for rendering. `current()` is for writing. Checked, not trusted.
 *
 * `lib/store/persisted.ts` states the rule and explains what breaking it cost:
 * `read()` returns the seed until something subscribes, so a screen that only
 * ever *writes* to a store computes its write from the seed and `commit`
 * persists that — discarding everything the store already held. It shipped on
 * `/people/[id]`, whose "Record their exit" button overwrote the previously
 * recorded exit and made the duplicate refusal never fire.
 *
 * Every gate in this repo exists because something invisible to `tsc` went
 * wrong, and this is the worst of that class so far. Both calls are correctly
 * typed, both are individually correct, lint has no opinion, and the build is
 * green. The only witness is a browser with something already in localStorage —
 * which is the state a developer's browser is *least* often in, because the
 * fastest way to test a store is to clear it.
 *
 * ## The two rules
 *
 * 1. **`read` may be referenced, never called.** The audit that added this
 *    script classified all 98 `.read()` calls in `src/lib/store/*.ts` and every
 *    single one was a write path. Not one was a render read — render always
 *    passes `store.read` to `useSyncExternalStore` as a bare reference. So the
 *    distinction is mechanical: `store.read` is render, `store.read()` is a bug.
 *
 * 2. **`current()` never runs during render.** It hydrates on first call, so
 *    reaching it from render puts stored state into the client's first paint and
 *    brings back the hydration mismatch the whole arrangement avoids. Checked
 *    two ways: not inside `useMemo`, and not in the immediate body of a hook
 *    (depth 1), which is render by definition.
 *
 * ## What it cannot see
 *
 * Rule 2 catches `current()` in the two constructs this codebase renders
 * through. It does not catch `current()` inside a plain helper function that a
 * hook body then calls during render — that needs a call graph, and saying so
 * here is better than implying a completeness this does not have. A model that
 * omits a case cannot catch a failure on it.
 *
 * ## The escape hatch
 *
 * A genuine render read may call `read()` if the line, or the line above it,
 * carries `read-for-render`. There are none today. It exists so that adding one
 * is a deliberate sentence somebody writes rather than a check somebody deletes.
 */

import fs from "node:fs";
import path from "node:path";

const STORES = path.join(process.cwd(), "src", "lib", "store");
const ESCAPE = "read-for-render";

type Offence = { file: string; line: number; snippet: string; why: string };

const offences: Offence[] = [];
let filesScanned = 0;
let readRefs = 0;
let currentCalls = 0;

/**
 * Each line with its comments removed, so brace counting and matching only ever
 * see code.
 *
 * Tracking the block state matters rather than being tidy: this repo's stores
 * are heavily commented and the *continuation* lines of a `/* … *\/` block start
 * with neither `*` nor `/`. The first draft of this script tested only for a
 * leading marker and reported the prose in `departments.ts` as a violation.
 */
function stripComments(lines: string[]): string[] {
  let inBlock = false;
  return lines.map((line) => {
    let out = "";
    let i = 0;
    while (i < line.length) {
      if (inBlock) {
        const close = line.indexOf("*/", i);
        if (close === -1) return out;
        inBlock = false;
        i = close + 2;
        continue;
      }
      if (line.startsWith("//", i)) return out;
      if (line.startsWith("/*", i)) {
        inBlock = true;
        i += 2;
        continue;
      }
      out += line[i];
      i += 1;
    }
    return out;
  });
}

/** Brace depth at the start of each line. Code only — see `stripComments`. */
function depths(code: string[]): number[] {
  let depth = 0;
  return code.map((line) => {
    const at = depth;
    depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    return at;
  });
}

const files = fs
  .readdirSync(STORES, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
  .map((entry) => path.join(STORES, entry.name));

for (const file of files) {
  filesScanned += 1;
  const rel = path.relative(process.cwd(), file);
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const code = stripComments(lines);
  const depth = depths(code);

  /* Line ranges that are render context: a `useMemo(` argument, and the
     immediate body of an exported hook. Both are collected first so the
     `current()` pass can ask a range rather than re-scan. */
  const renderRanges: { from: number; to: number; what: string }[] = [];

  code.forEach((line, index) => {
    if (/\buseMemo\(/.test(line)) {
      const open = depth[index] ?? 0;
      let end = index;
      for (let j = index + 1; j < code.length; j += 1) {
        if ((depth[j] ?? 0) <= open) break;
        end = j;
      }
      renderRanges.push({ from: index, to: end, what: "a useMemo" });
    }

    /* The immediate body of a hook — depth exactly one inside its opener — runs
       on every render. Anything nested deeper is a callback. */
    if (/^export function use[A-Z]/.test(line)) {
      const open = depth[index] ?? 0;
      for (let j = index + 1; j < code.length; j += 1) {
        const d = depth[j] ?? 0;
        if (d <= open) break;
        if (d === open + 1) {
          renderRanges.push({ from: j, to: j, what: "a hook body" });
        }
      }
    }
  });

  code.forEach((line, index) => {
    const source = lines[index] ?? "";

    /* Rule 1. */
    const readMatches = (line.match(/\.read\s*\(\s*\)/g) ?? []).length;
    if (readMatches > 0) {
      const excused =
        source.includes(ESCAPE) || (lines[index - 1] ?? "").includes(ESCAPE);
      if (!excused) {
        for (let i = 0; i < readMatches; i += 1) {
          offences.push({
            file: rel,
            line: index + 1,
            snippet: source.trim().slice(0, 78),
            why: "`read()` is called. A write path must use `current()`; a render read passes `store.read` to useSyncExternalStore without calling it.",
          });
        }
      }
    }

    if (/\.read\b(?!\s*\()/.test(line)) readRefs += 1;

    /* Rule 2. */
    const currentMatches = (line.match(/\.current\s*\(\s*\)/g) ?? []).length;
    for (let i = 0; i < currentMatches; i += 1) {
      currentCalls += 1;
      const where = renderRanges.find(
        (range) => index >= range.from && index <= range.to,
      );
      if (where) {
        offences.push({
          file: rel,
          line: index + 1,
          snippet: source.trim().slice(0, 78),
          why: `\`current()\` is reached from ${where.what}, which is render. It hydrates on first call, so this reintroduces the hydration mismatch.`,
        });
      }
    }
  });
}

if (offences.length > 0) {
  console.error(
    `\nStore check failed. ${offences.length} ${
      offences.length === 1 ? "call site is" : "call sites are"
    } on the wrong side of the read/current rule:\n`,
  );
  for (const offence of offences) {
    console.error(`  ${offence.file}:${offence.line}  ${offence.snippet}`);
    console.error(`      ${offence.why}\n`);
  }
  console.error(
    "The rule is in the header of src/lib/store/persisted.ts: `read()` from\n" +
      "render, `current()` from anywhere that is about to write. Getting it\n" +
      "wrong does not fail a type or a test — it silently overwrites whatever\n" +
      "localStorage already held, which is why this is a check.\n\n" +
      `A genuine render read may call read() if its line, or the line above,\n` +
      `carries \`${ESCAPE}\` with a reason. There are none today.\n`,
  );
  process.exit(1);
}

console.log(
  `\nStore check passed. ${currentCalls} write ${
    currentCalls === 1 ? "path reads" : "paths read"
  } current(), ${readRefs} render ${
    readRefs === 1 ? "reference" : "references"
  } pass read without calling it, across ${filesScanned} stores.\n`,
);
