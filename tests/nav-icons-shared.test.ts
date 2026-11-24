import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAGE_ICONS } from "@/components/portal/nav-icons";

const read = (p: string) => readFileSync(p, "utf8");
const nav = read("src/components/portal/nav.tsx");
const period = read("src/app/(app)/performance/periods/[id]/period-screen.tsx");

/** A shortcut to a page with a sidebar row wears the row's icon: both read one map. */
describe("sidebar rows and header shortcuts share one icon", () => {
  for (const href of Object.keys(PAGE_ICONS)) {
    it(`${href} comes from PAGE_ICONS in both places`, () => {
      expect(nav).toContain(`PAGE_ICONS["${href}"]`);
      expect(period).toContain(`PAGE_ICONS["${href}"]`);
    });
  }
  it("the period header no longer draws these icons directly", () => {
    expect(period).not.toMatch(/<Users aria-hidden="true" className="size-4"/);
    expect(period).not.toMatch(/<Scale\b/);
  });
});
