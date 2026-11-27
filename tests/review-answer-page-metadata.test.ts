import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(focus)/performance/reviews/[id]/answer/review-focus", () => ({
  ReviewFocus: () => null,
}));

import { metadata } from "@/app/(focus)/performance/reviews/[id]/answer/page";

/**
 * The description of the answering page, which a browser shows in a tab or a
 * history entry. It said "Your answers are saved as you go", of a form that holds
 * three things in the browser until they are sent.
 */
describe("the answering page's description", () => {
  it("says the answers to the questions are saved, and nothing more than that", () => {
    const description = String(metadata.description);
    expect(description).toContain(
      "Your answers to the questions are saved as you go",
    );
    expect(description).not.toMatch(/Your answers are saved as you go/);
  });
});
