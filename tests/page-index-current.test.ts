import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { trackedFiles } from "../scripts/docs/source";
import { buildPageIndex } from "../scripts/docs/page-index";
import { PAGE_INDEX } from "@/lib/page-index.generated";

describe("page index", () => {
  it("is current: every titled page is in it, so every page is searchable", () => {
    const fresh = buildPageIndex(
      trackedFiles(join(__dirname, ".."), ["src/app"]),
    );
    expect(PAGE_INDEX).toEqual(fresh);
  });

  it("holds no page with a parameter in its address", () => {
    expect(PAGE_INDEX.some((p) => p.href.includes("["))).toBe(false);
  });
});
