/**
 * Proves both halves of `ENABLE_DEMO_IN_PRODUCTION_BUILD` — see the header
 * comments in `next.config.ts` and `src/lib/demo.ts` for the whole argument.
 *
 * A define-time flag is a claim about a minifier, and `verify-demo.ts` exists
 * precisely because that claim was wrong once (an exported `const`) and
 * shipped anyway. This is the same discipline applied to the newer flag:
 *
 * 1. A **default** production build — `next build`, no special env at all —
 *    must stay exactly as demo-free as every production build always was.
 *    Reuses `verify-demo.ts` itself against that build's output, unmodified:
 *    if the real gate is not satisfied here, nothing below matters.
 * 2. The **standalone public demo** build — the one deliberately long opt-in
 *    set — must genuinely turn the demo on. Absence-of-a-bug is not the same
 *    claim as presence-of-a-feature, so this checks for a known demo string
 *    in the built output rather than only asserting the first build's
 *    absence of one.
 *
 * Two real `next build`s. Run after any change to `next.config.ts` or
 * `src/lib/demo.ts`.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const DEFAULT_DIST = ".next-verify-default";
const PUBLIC_DEMO_DIST = ".next-verify-public-demo";

/** A phrase that can only be in the output if the demo genuinely rendered. */
const DEMO_MARKER = "Demo mode: not connected to a server";

function build(distDir: string, extraEnv: Record<string, string>): void {
  execFileSync("npx", ["next", "build"], {
    cwd: ROOT,
    env: { ...process.env, ...extraEnv, NEXT_DIST_DIR: distDir },
    stdio: "inherit",
  });
}

/** Runs the real gate against a given build's output. True means clean. */
function isCleanByVerifyDemo(distDir: string): boolean {
  try {
    execFileSync("npx", ["tsx", "scripts/verify-demo.ts"], {
      cwd: ROOT,
      env: { ...process.env, NEXT_DIST_DIR: distDir },
      stdio: "inherit",
    });
    return true;
  } catch {
    return false;
  }
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function bundleContains(distDir: string, needle: string): boolean {
  const dirs = ["static", "server"].map((d) => path.join(ROOT, distDir, d));
  for (const dir of dirs) {
    for (const file of walk(dir)) {
      if (!/\.(js|mjs|cjs|json|html|rsc|txt)$/.test(file)) continue;
      if (fs.readFileSync(file, "utf8").includes(needle)) return true;
    }
  }
  return false;
}

console.log("== 1/2: default production build (no special env at all) ==\n");
build(DEFAULT_DIST, {});
if (!isCleanByVerifyDemo(DEFAULT_DIST)) {
  console.error(
    "\nFAILED: a default production build — the one every real deployment " +
      "runs unless it deliberately opts in — carries demo content or " +
      "fabricated data. This must never happen: it means the default " +
      "behaviour of a production build has regressed since " +
      "ENABLE_DEMO_IN_PRODUCTION_BUILD was added.\n",
  );
  process.exit(1);
}
console.log("\nDefault production build: clean, unchanged from before.\n");

console.log("== 2/2: the standalone public demo deployment ==\n");
build(PUBLIC_DEMO_DIST, {
  NEXT_PUBLIC_ENABLE_DEMO_IN_PRODUCTION_BUILD:
    "yes-this-is-the-standalone-demo-deployment",
});
if (!bundleContains(PUBLIC_DEMO_DIST, DEMO_MARKER)) {
  console.error(
    `\nFAILED: setting ENABLE_DEMO_IN_PRODUCTION_BUILD did not turn the ` +
      `demo on — "${DEMO_MARKER}" is not in the built output. The opt-in ` +
      `is not working.\n`,
  );
  process.exit(1);
}
console.log(
  '\nStandalone public demo build: "Demo mode" genuinely present — the ' +
    "opt-in works.\n",
);

console.log("Both halves verified.");
