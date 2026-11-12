import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Sentences that stopped being true when the manager's overall mark could be
 * scored, and when weights became proportional.
 *
 * Each of these was found by a reviewer reading, not by a test, after it had
 * shipped in a nearby file that had just been fixed for the same reason. A
 * sentence about what counts towards a mark is a claim, and a claim left in the
 * next file along is the same defect: an appraiser's share was "for the whole
 * mark" in two strings of the appraiser map after the strip beside them had
 * stopped saying so. It was true at no weight: at 0% the overall mark counts for
 * nothing, and at 30% it counts for 30%.
 *
 * This reads the source because the failure is a phrase in a diff, and a render
 * would have to reach every screen and every state to find it. It is narrow on
 * purpose. Each line below names a phrase that is false, and the file it was last
 * found in is checked as well as the folder, so a copy cannot come back.
 *
 * ## Left alone on this branch
 *
 * `settings/performance/page.tsx`'s metadata description, and the copy of it in
 * `lib/page-index.generated.ts`, still say the weights "must make 100% exactly".
 * Another branch rewrites that description, and a second edit would conflict, so
 * they are not checked here. The Settings search blurb (`settings/filter.ts`) is.
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sources(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const read = (relative: string) =>
  readFileSync(path.join(SRC, relative), "utf8");

describe("claims about the manager's overall mark", () => {
  it("no screen says an appraiser holds the whole mark, which is true at no weight", () => {
    const hits = sources(SRC)
      .filter((file) => /for the whole mark\b/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(SRC, file));
    expect(hits).toEqual([]);
  });

  it("the appraiser map says a chosen appraiser is the only one", () => {
    const map = read("app/(app)/performance/appraiser-map.tsx");
    expect(map).toContain("As their line manager, and the only appraiser.");
    expect(map).toContain("as their only appraiser");
  });
});

describe("claims about the weights", () => {
  it("the Settings search blurb does not say the weights must make 100% exactly", () => {
    const filter = read("app/(app)/settings/filter.ts");
    expect(filter).not.toMatch(/100% exactly|must make 100%/);
    expect(filter).toContain("in proportion to the total");
  });

  it("the report's comment does not count the parts, which a new part made wrong", () => {
    const report = read(
      "app/(app)/performance/periods/[id]/report/report-screen.tsx",
    );
    expect(report).not.toMatch(/all six/);
  });
});

describe("claims in the walkthrough", () => {
  const walkthrough = readFileSync(
    path.join(ROOT, "docs/walkthroughs/performance.md"),
    "utf8",
  );

  it("does not say Save is dead only when every part is at 0%, which is one of three things", () => {
    expect(walkthrough).not.toMatch(/stays dead only if every part is 0%/);
  });

  it("says when each weights Save is dead, as the two screens do: nothing changed, a box that is not a number, or every part at 0%", () => {
    /* One for the company's set and one for a period's: the two cards disable
       their button on `!dirty`, an invalid box, and a total of nothing. */
    expect(
      walkthrough.match(/stays dead until something has changed/g),
    ).toHaveLength(2);
    expect(walkthrough).toContain("or every part is at 0%");
  });
});
