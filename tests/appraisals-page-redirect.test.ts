/**
 * `/performance/appraisals` was an older copy of what the Overview already
 * shows (where your own appraisal stands and where your team's do) with a step
 * count that did not match the form's. The page is gone: its address sends
 * people to Performance, and it is not offered in the header search.
 */
import { describe, expect, it, vi } from "vitest";
import { PAGE_INDEX } from "@/lib/page-index.generated";

const redirect = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});
vi.mock("next/navigation", () => ({ redirect }));

describe("the old Appraisals page", () => {
  it("sends the old address to Performance", async () => {
    const page = await import("@/app/(app)/performance/appraisals/page");
    expect(() => page.default()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/performance");
  });

  it("is no longer offered in the header search", () => {
    expect(
      PAGE_INDEX.some((page) => page.href === "/performance/appraisals"),
    ).toBe(false);
  });
});
