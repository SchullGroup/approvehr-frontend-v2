import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Who can see a score.
 *
 * A score, its reasons and the pass mark are for people who hire. An interview
 * panelist or invited collaborator holds no hiring permission by design and gets the
 * narrow screens under `my-interviews`: a name, the role, the stage, their interviews,
 * a CV.
 *
 * **One exception, and it is the job's to grant.** A job can let people who are only
 * panelists see its fit score and the reasons for it (recruiters and the hiring manager
 * always do). Where the API sends it, the narrow screens draw it, through two
 * presentational components and nothing else; where it does not, they draw nothing.
 * Everything else about screening (the pass mark, the assessment, the criteria, the
 * answers, the knockout flags, the gateway that fetches any of it) stays out of reach,
 * so nothing under that folder imports it.
 *
 * This reads the source rather than rendering, because the way it would go wrong is a
 * line added to a shared component, and a render of today's screens cannot see
 * tomorrow's.
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

  /** Every import path that reaches into screening, whatever it names. */
  const screeningImports = (text: string): string[] =>
    [...text.matchAll(/from\s+["']([^"']*\/screening(?:\/[^"']*)?)["']/g)].map(
      (match) => match[1] ?? "",
    );

  /** The only two things of screening a narrow screen may draw: how a score reads. */
  const ALLOWED = [
    "@/components/hiring/screening/fit-badge",
    "@/components/hiring/screening/fit-score-card",
  ];

  it("import nothing from screening but the two components that draw a score", () => {
    const stray = all.flatMap((file) =>
      screeningImports(readFileSync(file, "utf8"))
        .filter((spec) => !ALLOWED.includes(spec))
        .map((spec) => `${path.relative(SRC, file)} imports ${spec}`),
    );
    expect(stray).toEqual([]);
  });

  it("never name a pass mark, an assessment, criteria or a flagged answer", () => {
    const found = all.filter((file) =>
      /pass mark|assessment|criteria|knockout|flagged answer/i.test(
        readFileSync(file, "utf8"),
      ),
    );
    expect(found.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it("draw the fit score only where it was sent, never a placeholder for one that was not", () => {
    const list = readFileSync(
      path.join(SRC, "app/(app)/hiring/my-interviews/my-interviews-screen.tsx"),
      "utf8",
    );
    const one = readFileSync(
      path.join(
        SRC,
        "app/(app)/hiring/my-interviews/[id]/my-application-screen.tsx",
      ),
      "utf8",
    );
    expect(list).toMatch(/row\.fit\s*&&\s*<FitBadge/);
    expect(one).toMatch(/application\.screening\s*&&/);
    for (const text of [list, one]) {
      expect(text).not.toMatch(
        /not scored|no score|score hidden|hidden score/i,
      );
    }
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
