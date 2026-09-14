/**
 * Every capability bullet has its own illustration slot, and the slots line up.
 *
 * `CAPABILITY_MOCKUPS` in `components/marketing/module-mockups.tsx` is indexed
 * by **position** against `MODULES[].capabilities` in `lib/marketing/modules.ts`
 * — the product page reads `CAPABILITY_MOCKUPS[mod.id]?.[i]` where `i` is the
 * bullet's index. Two arrays in two files, joined by nothing but their order.
 *
 * ## Why this is a gate
 *
 * `733c4b7` inserted "Review-language check" as the third performance bullet.
 * The mockup array had not changed since the initial commit and was never given
 * a hole for it, so every illustration from that point shifted up one: the
 * review-language check rendered the competency-scores art, KPI measuring
 * rendered the calibration art, and Calibration itself rendered nothing. The
 * `time` module had the same defect independently — the `Holidays` illustration
 * sat under "Timesheets payroll can use" while "Public holidays" got none.
 *
 * Both were live on the public product pages. `tsc` cannot see it (both arrays
 * are well-typed), lint cannot see it, and the build is clean — the only witness
 * is somebody looking at the page and recognising that the picture is wrong,
 * which is precisely the class of bug this repo keeps finding late.
 *
 * ## The rule
 *
 * **A module's slot count must equal its bullet count exactly**, with an
 * explicit `undefined` for every bullet that has no art. A shorter array would
 * also render correctly today — trailing bullets just get nothing — but it makes
 * an inserted bullet indistinguishable from a deliberate omission, which is how
 * the two defects above survived. Exact length turns an insertion into a failing
 * check on the same commit that causes it.
 *
 * Alignment past that is a judgement about what a picture shows, and no script
 * can make it. What this guarantees is that somebody is asked the question.
 */

import fs from "node:fs";
import path from "node:path";

const MODULES_FILE = path.join(process.cwd(), "src/lib/marketing/modules.ts");
const MOCKUPS_FILE = path.join(
  process.cwd(),
  "src/components/marketing/module-mockups.tsx",
);

/** Capability bullet titles, in order, per module id. */
function capabilities(source: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const match of source.matchAll(/id:\s*"([a-z-]+)"/g)) {
    const start = source.indexOf("capabilities:", match.index);
    if (start === -1) continue;
    const end = source.indexOf("\n    ],", start);
    if (end === -1) continue;
    const titles = [
      ...source.slice(start, end).matchAll(/title:\s*"([^"]+)"/g),
    ].map((m) => m[1]!);
    if (titles.length > 0) out.set(match[1]!, titles);
  }
  return out;
}

/** Illustration slots, in order, per module id. `undefined` counts as a slot. */
function slots(source: string): Map<string, string[]> {
  const from = source.indexOf("export const CAPABILITY_MOCKUPS");
  if (from === -1) {
    console.error(
      "\nCould not find `export const CAPABILITY_MOCKUPS` in\n" +
        `  ${path.relative(process.cwd(), MOCKUPS_FILE)}\n\n` +
        "If it was renamed, update this check with it.\n",
    );
    process.exit(1);
  }
  const block = source.slice(from);
  const out = new Map<string, string[]>();
  for (const match of block.matchAll(/"?([a-z-]+)"?:\s*\[([^\]]*)\]/g)) {
    out.set(
      match[1]!,
      match[2]!
        .split(",")
        .map((entry) => entry.replace(/\/\*[\s\S]*?\*\//g, "").trim())
        .filter((entry) => entry.length > 0),
    );
  }
  return out;
}

const bullets = capabilities(fs.readFileSync(MODULES_FILE, "utf8"));
const art = slots(fs.readFileSync(MOCKUPS_FILE, "utf8"));

type Problem = {
  module: string;
  expected: number;
  actual: number;
  extra: string[];
};
const problems: Problem[] = [];

for (const [id, titles] of bullets) {
  const found = art.get(id);
  if (found === undefined) {
    problems.push({
      module: id,
      expected: titles.length,
      actual: -1,
      extra: [],
    });
    continue;
  }
  if (found.length !== titles.length) {
    problems.push({
      module: id,
      expected: titles.length,
      actual: found.length,
      extra: found.length < titles.length ? titles.slice(found.length) : [],
    });
  }
}

for (const id of art.keys()) {
  if (!bullets.has(id)) {
    problems.push({
      module: id,
      expected: -1,
      actual: art.get(id)!.length,
      extra: [],
    });
  }
}

if (problems.length > 0) {
  console.error(
    "\nCapability illustrations are out of step with their bullets.\n\n" +
      "`CAPABILITY_MOCKUPS` is indexed by bullet position, so a mismatch means\n" +
      "an illustration is rendering under the wrong capability — or none is.\n",
  );
  for (const p of problems) {
    if (p.actual === -1) {
      console.error(
        `  ${p.module}: has ${p.expected} bullets and no entry in CAPABILITY_MOCKUPS.`,
      );
    } else if (p.expected === -1) {
      console.error(
        `  ${p.module}: has ${p.actual} illustration slots and no such module in MODULES.`,
      );
    } else {
      const named =
        p.extra.length > 0
          ? `\n      with no slot: ${p.extra.map((t) => `"${t}"`).join(", ")}`
          : "";
      console.error(
        `  ${p.module}: ${p.expected} bullets, ${p.actual} slots.${named}`,
      );
    }
  }
  console.error(
    "\nGive every bullet a slot. Use an explicit `undefined` where a capability\n" +
      "has no illustration, and put a comment beside it saying which one it is.\n" +
      "See the header of scripts/verify-capability-mockups.ts.\n",
  );
  process.exit(1);
}

const total = [...bullets.values()].reduce((n, t) => n + t.length, 0);
const holes = [...art.values()].reduce(
  (n, s) => n + s.filter((e) => e === "undefined").length,
  0,
);
console.log(
  `\nCapability illustrations check passed. ${bullets.size} modules, ` +
    `${total} bullets, each with a slot (${holes} deliberately empty).\n`,
);
