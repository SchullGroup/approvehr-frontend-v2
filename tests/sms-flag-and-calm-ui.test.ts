import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADVANCED_FEATURE_KEYS,
  FEATURE_KEYS,
  MODULE_FEATURE_KEYS,
  RECORD_FIELD_KEYS,
  WORKFLOW_FEATURE_KEYS,
} from "@/lib/api/setup";
import { FEATURE_COPY } from "@/lib/store/features";

/**
 * The flag is added without disturbing the screens that list the others, and the
 * new screens keep to the rules the owner set for the whole app.
 *
 * The second half reads source, because the failures it stops are shapes in a diff
 * that no render would show: a red pill, an em dash in a sentence, a tone the
 * palette does not have. Comments are stripped first, since a comment may name
 * what it is not doing.
 */

describe("the smsDigest flag", () => {
  it("is a feature key the PATCH may carry, with its own copy", () => {
    expect(FEATURE_KEYS).toContain("smsDigest");
    expect(FEATURE_COPY.smsDigest.label).toBe("Weekly text message");
    expect(FEATURE_COPY.smsDigest.line.length).toBeGreaterThan(0);
  });

  it("is a workflow switch, so /settings/features does not list it a second time", () => {
    expect(WORKFLOW_FEATURE_KEYS).toContain("smsDigest");
    for (const group of [
      MODULE_FEATURE_KEYS,
      RECORD_FIELD_KEYS,
      ADVANCED_FEATURE_KEYS,
    ] as readonly (readonly string[])[]) {
      expect(group).not.toContain("smsDigest");
    }
  });
});

const ROOT = path.resolve(import.meta.dirname, "..");

const FILES = [
  "src/app/(app)/settings/sms/sms-screen.tsx",
  "src/app/(app)/settings/sms/people-tab.tsx",
  "src/app/(app)/settings/sms/consent-dialog.tsx",
  "src/app/(app)/settings/sms/page.tsx",
  "src/app/(app)/profile/text-messages-card.tsx",
  "src/lib/api/sms.ts",
];

const withoutComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** The opening tag of every `<Badge`, up to the `>` that is not inside braces. */
function badgeTags(code: string): string[] {
  const tags: string[] = [];
  for (const start of code.matchAll(/<Badge\b/g)) {
    let depth = 0;
    let end = start.index;
    for (; end < code.length; end += 1) {
      const char = code[end];
      if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      else if (char === ">" && depth === 0) break;
    }
    tags.push(code.slice(start.index, end));
  }
  return tags;
}

describe.each(FILES)("%s", (file) => {
  const code = withoutComments(readFileSync(path.join(ROOT, file), "utf8"));

  it("has no em dash in anything a person could read", () => {
    expect(code).not.toContain(String.fromCharCode(0x2014));
  });

  it("uses only the two hues: no red or green utilities, and no Badge tone outside neutral, accent and warning", () => {
    expect(code).not.toMatch(/\b(?:text|bg|border)-(?:red|green|emerald)-/);
    for (const tag of badgeTags(code)) {
      for (const literal of tag.matchAll(/"(\w+)"/g)) {
        /* `size="sm"` is a string too; only a tone is held to the three. */
        if (literal[1] === "sm" || literal[1] === "md") continue;
        expect(["neutral", "accent", "warning"]).toContain(literal[1]);
      }
    }
  });

  it("does not reach for a loose segmented filter or a font below the floor", () => {
    expect(code).not.toContain("SegmentedControl");
    expect(code).not.toMatch(/\btext-xs\b/);
  });
});
