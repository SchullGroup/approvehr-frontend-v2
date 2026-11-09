import path from "node:path";
import { describe, expect, it } from "vitest";
import { visibleStrings } from "./support/visible-strings";

/**
 * The words on every screen that shows finished project work, and on the link
 * between a task and an objective.
 *
 * Linking is optional and finished work is evidence, so these screens are calm:
 * no exclamation mark, no claim that a task is "not counted", nothing "waiting"
 * for a grade, no talk of a weekly task being filed, and no word of the old
 * refusal. A task that is not linked is the ordinary case and is never described
 * as missing anything.
 *
 * Read from the source, so a string added later is held to it without anybody
 * remembering to add a test.
 */

const SRC = path.resolve(import.meta.dirname, "../src");

const FILES = [
  "components/projects/objective-link.tsx",
  "components/projects/objective-picker.tsx",
  "components/projects/bulk-link-dialog.tsx",
  "components/projects/reduced-issue-drawer.tsx",
  "components/performance/completed-item.tsx",
  "components/performance/completed-work.tsx",
  "components/performance/work-this-cycle.tsx",
  "components/performance/work-record.tsx",
  "app/(app)/projects/team/completed-view.tsx",
  "lib/projects/bulk-link.ts",
  "lib/projects/objectives.ts",
  "lib/projects/completions.ts",
  "lib/api/completions.ts",
];

const BANNED: { re: RegExp; why: string }[] = [
  { re: /!/, why: "an exclamation mark" },
  { re: /not counted/i, why: '"not counted" says a task is a fault' },
  {
    re: /waiting (for|on) a grade|awaiting grade|ungraded/i,
    why: "nothing waits for a grade",
  },
  { re: /weekly task/i, why: "finished project work files no weekly task" },
  {
    re: /objective_not_usable|NOT_COUNTED|WEEK_CLOSED|NO_OBJECTIVE/,
    why: "the old refusal codes",
  },
  { re: /week (has )?closed|closed week/i, why: "there is no week window" },
  {
    re: /must (be )?link|you need to link|link this (task )?to|please link|forgot to link/i,
    why: "linking is never asked of anybody",
  },
  {
    re: /unlinked|no link yet|missing (a )?link|without a link/i,
    why: "an unlinked task is not a gap",
  },
];

describe("copy on the finished-work and linking screens", () => {
  const found: string[] = [];
  for (const file of FILES) {
    for (const s of visibleStrings(path.join(SRC, file))) {
      for (const { re, why } of BANNED) {
        if (re.test(s.text)) {
          found.push(`${file}:${s.line}  "${s.text}"  (${why})`);
        }
      }
    }
  }

  it("says nothing alarming, nothing demanding, and nothing from the old bridge", () => {
    expect(found).toEqual([]);
  });

  it("reads every file it was asked to (a renamed file would otherwise pass silently)", () => {
    for (const file of FILES) {
      expect(visibleStrings(path.join(SRC, file)).length).toBeGreaterThan(0);
    }
  });
});
