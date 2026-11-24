import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * "New appraisal period" is offered on the Overview and on Appraisal periods,
 * and on no other Performance tab: a button for starting a period on Weekly
 * tasks, Objectives, Competency ratings and Objectives to agree sat on screens
 * that are about something else.
 */
const ROOT = join(process.cwd(), "src/app/(app)/performance");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? sources(path)
      : /\.tsx$/.test(name)
        ? [path]
        : [];
  });
}

describe("the New appraisal period button", () => {
  it("is rendered only by the Overview and the Appraisal periods list (and the Now panel)", () => {
    const users = sources(ROOT)
      .filter((file) => /<StartPeriodButton/.test(readFileSync(file, "utf8")))
      .map((file) => relative(ROOT, file))
      .sort();

    expect(users).toEqual([
      "now.tsx",
      "performance-screen.tsx",
      "periods/periods-list-screen.tsx",
    ]);
  });
});
