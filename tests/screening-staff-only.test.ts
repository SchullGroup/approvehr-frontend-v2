import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Who can see a score.
 *
 * A score, its reasons and the pass mark are for people who hire. An interview
 * panelist holds no hiring permission by design and gets the narrow screens under
 * `my-interviews`: a name, the role, the stage, their interviews, a CV. Nothing of
 * screening may reach them, so nothing under that folder imports it. This reads the
 * source rather than rendering, because the way it would go wrong is a line added
 * to a shared component, and a render of today's screens cannot see tomorrow's.
 */

const SRC = path.resolve(import.meta.dirname, "../src");
const NARROW = [path.join(SRC, "app/(app)/hiring/my-interviews")];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });
}

describe("the narrow screens a panelist uses", () => {
  const all = NARROW.flatMap(files);

  it("reads some files", () => {
    expect(all.length).toBeGreaterThan(2);
  });

  it("import nothing from screening", () => {
    const found = all.filter((file) =>
      /from\s+["'][^"']*(\/screening\/|\/screening["'])/.test(
        readFileSync(file, "utf8"),
      ),
    );
    expect(found.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it("never name a score, a fit or a pass mark", () => {
    const found = all.filter((file) =>
      /fit score|pass mark|fitScore|assessment score/i.test(
        readFileSync(file, "utf8"),
      ),
    );
    expect(found.map((f) => path.relative(SRC, f))).toEqual([]);
  });
});

describe("the screening card on a record", () => {
  it("is on the record page, which needs a hiring permission", () => {
    const record = readFileSync(
      path.join(SRC, "app/(app)/hiring/candidates/[id]/candidate-screen.tsx"),
      "utf8",
    );
    expect(record).toMatch(/MANAGE_HIRING/);
    expect(record).toMatch(/APPROVE_HIRING/);
    expect(record).toMatch(/ScreeningCard/);
  });
});
