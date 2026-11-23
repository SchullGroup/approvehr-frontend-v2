import { describe, expect, it } from "vitest";
import { NAV } from "@/components/portal/nav";
import { buildSidebar } from "@/components/portal/sidebar-model";

/**
 * A section heading in the sidebar is one line in small capitals, and a long one
 * is cut off: "INTERVIEWS AND OFFE…" on every hiring page (UAT 23 Nov, L18 /
 * PERF-41). Eighteen characters is what fits beside the fold button.
 */
const FITS = 18;

describe("sidebar section headings", () => {
  it("are short enough to read in full", () => {
    const labels = new Set<string>();
    for (const entry of buildSidebar(NAV).flat()) {
      if (entry.kind !== "drill") continue;
      for (const section of entry.sections)
        if (section.label) labels.add(section.label);
    }
    expect(labels.size).toBeGreaterThan(0);
    const tooLong = [...labels].filter((label) => label.length > FITS);
    expect(tooLong).toEqual([]);
  });
});
