import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ApiCompetencyRow } from "@/lib/api/performance";

/**
 * One written subsection on somebody's own list of skills.
 *
 * A written answer has no level, no scale, no target and no gap, and it is never a
 * score: it is the person's own words, read by people. What a row can get wrong is
 * quiet. It can draw the words cut short with nothing to read the rest, call an
 * answered row "Not assessed yet" because it has no level, draw a nought or a
 * percentage where words belong, or claim an answer said something when the server
 * never sent it. Nothing in the types objects to any of them.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, back: () => {}, replace: () => {} }),
  usePathname: () => "/performance",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/store/performance", () => ({
  CATEGORY_ORDER: [],
  useSkills: vi.fn(),
  useGaps: vi.fn(),
  useHeatmap: vi.fn(),
  useRating: vi.fn(),
  useAppraisals: vi.fn(),
  useFramework: vi.fn(),
}));

const { SkillRow } = await import("@/app/(app)/performance/skills");

const row = (over: Partial<ApiCompetencyRow>): ApiCompetencyRow => ({
  competencyId: "c",
  name: "Communication",
  sectionId: "s",
  sectionName: "Core competency",
  isCore: false,
  scaleMax: 5,
  answerKind: "TEXT",
  level: null,
  target: null,
  gap: null,
  note: null,
  ratedAt: null,
  ...over,
});

const ANSWERED = "2026-10-20T09:00:00.000Z";

const show = (over: Partial<ApiCompetencyRow>) =>
  render(
    <ul>
      <SkillRow row={row(over)} />
    </ul>,
  );

/** The segments of a level. Drawn for a level and for nothing else. */
const segments = (container: HTMLElement) =>
  container.querySelectorAll("span.rounded-full").length;

/** The paragraph that holds some words, found by what it says whole. */
const paragraph = (words: string) =>
  screen.getByText((_, element) => element?.textContent === words, {
    selector: "p",
  });

const LONG =
  `${"Reads the room well and says the hard thing early. ".repeat(8)}`.trim();

describe("an answered written subsection", () => {
  it("shows the words and a Written badge, and none of a level", () => {
    const { container } = show({
      textValue: "Clear and early, and kind with it.",
      ratedAt: ANSWERED,
    });
    expect(
      screen.getByText("Clear and early, and kind with it."),
    ).toBeInTheDocument();
    expect(screen.getByText("Written")).toBeInTheDocument();
    expect(screen.queryByText(/Level/)).not.toBeInTheDocument();
    expect(screen.queryByText(/target/i)).not.toBeInTheDocument();
    expect(segments(container)).toBe(0);
  });

  it("is not called not assessed, which is what a missing level would have said", () => {
    show({ textValue: "Clear and early.", ratedAt: ANSWERED });
    expect(screen.queryByText("Not assessed yet")).not.toBeInTheDocument();
  });

  it("is never a score: no percentage, no nought, no scale ceiling", () => {
    show({ textValue: "Clear and early.", ratedAt: ANSWERED });
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText(/of 5/)).not.toBeInTheDocument();
    expect(screen.queryByText(/score/i)).not.toBeInTheDocument();
  });

  it("draws no target and no gap even if the row carries numbers for them", () => {
    const { container } = show({
      textValue: "Clear and early.",
      ratedAt: ANSWERED,
      target: 5,
      gap: 2,
      level: 3,
    });
    expect(screen.queryByText(/target/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/gap/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Level 3/)).not.toBeInTheDocument();
    expect(segments(container)).toBe(0);
  });

  it("keeps the paragraphs the person wrote, and lets a long unbroken string wrap", () => {
    show({ textValue: "First point.\n\nSecond point.", ratedAt: ANSWERED });
    const words = paragraph("First point.\n\nSecond point.");
    expect(words).toHaveClass("whitespace-pre-line");
    expect(words).toHaveClass("break-words");
  });

  it("gives the words the width of the row to be read in", () => {
    show({ textValue: "Clear and early.", ratedAt: ANSWERED });
    const left = screen.getByText("Communication").parentElement;
    expect(left).toHaveClass("flex-1");
  });

  it("does not stretch a row that has no words, which is laid out as the others are", () => {
    show({ ratedAt: null });
    expect(screen.getByText("Communication").parentElement).not.toHaveClass(
      "flex-1",
    );
  });
});

describe("a written subsection nobody has answered", () => {
  it("is not assessed, with nothing drawn: no badge, no words, no scale", () => {
    const { container } = show({ ratedAt: null, textValue: null });
    expect(screen.getByText("Not assessed yet")).toBeInTheDocument();
    expect(screen.queryByText("Written")).not.toBeInTheDocument();
    expect(segments(container)).toBe(0);
  });

  it("is not assessed when the server sends no words either, and says nothing it was not told", () => {
    show({ ratedAt: null });
    expect(screen.getByText("Not assessed yet")).toBeInTheDocument();
  });

  it("does not show words that arrive on a row that says nobody has answered", () => {
    /* `ratedAt` decides whether it has been answered, as for every other kind. */
    show({ ratedAt: null, textValue: "Stale words" });
    expect(screen.getByText("Not assessed yet")).toBeInTheDocument();
    expect(screen.queryByText("Stale words")).not.toBeInTheDocument();
    expect(screen.queryByText("Written")).not.toBeInTheDocument();
  });
});

describe("an answered row whose words did not arrive", () => {
  it("says Answered, and claims nothing about what it said", () => {
    show({ ratedAt: ANSWERED, textValue: null });
    expect(screen.getByText("Answered")).toBeInTheDocument();
    expect(screen.queryByText("Written")).not.toBeInTheDocument();
    expect(screen.queryByText("Not assessed yet")).not.toBeInTheDocument();
  });

  it("says Answered when a server one deploy behind sends no such field at all", () => {
    show({ ratedAt: ANSWERED });
    expect(screen.getByText("Answered")).toBeInTheDocument();
  });

  it("does not draw a box of spaces as words", () => {
    show({ ratedAt: ANSWERED, textValue: "   \n  " });
    expect(screen.getByText("Answered")).toBeInTheDocument();
    expect(screen.queryByText("Written")).not.toBeInTheDocument();
  });
});

describe("a long written answer", () => {
  it("is folded to three lines, with a way to read all of it", () => {
    show({ textValue: LONG, ratedAt: ANSWERED });
    const words = paragraph(LONG);
    expect(words).toHaveClass("line-clamp-3");
    expect(screen.getByRole("button", { name: "Read all" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("has all of its words on the page while it is folded, so nothing is lost to a reader that does not see the fold", () => {
    show({ textValue: LONG, ratedAt: ANSWERED });
    expect(paragraph(LONG).textContent).toBe(LONG);
  });

  it("opens on Read all, in full, and folds again on Show less", async () => {
    show({ textValue: LONG, ratedAt: ANSWERED });
    await userEvent.click(screen.getByRole("button", { name: "Read all" }));

    expect(paragraph(LONG)).not.toHaveClass("line-clamp-3");
    const less = screen.getByRole("button", { name: "Show less" });
    expect(less).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(less);
    expect(paragraph(LONG)).toHaveClass("line-clamp-3");
    expect(
      screen.getByRole("button", { name: "Read all" }),
    ).toBeInTheDocument();
  });

  it("is offered the way to read it all at four thousand characters, the most there can be", () => {
    const max = "w".repeat(4000);
    show({ textValue: max, ratedAt: ANSWERED });
    expect(paragraph(max).textContent).toHaveLength(4000);
    expect(
      screen.getByRole("button", { name: "Read all" }),
    ).toBeInTheDocument();
  });

  it("is folded for its lines as well as its length: four short lines are more than three", () => {
    const lines = "one\ntwo\nthree\nfour";
    show({ textValue: lines, ratedAt: ANSWERED });
    expect(
      screen.getByRole("button", { name: "Read all" }),
    ).toBeInTheDocument();
  });
});

describe("a short written answer", () => {
  it("is not folded and has nothing to open", () => {
    show({ textValue: "Clear and early.", ratedAt: ANSWERED });
    const words = paragraph("Clear and early.");
    expect(words.className).not.toMatch(/line-clamp/);
    expect(
      screen.queryByRole("button", { name: /read all|show less/i }),
    ).not.toBeInTheDocument();
  });

  it("is not folded at three lines, which fit", () => {
    show({ textValue: "one\ntwo\nthree", ratedAt: ANSWERED });
    expect(
      screen.queryByRole("button", { name: /read all/i }),
    ).not.toBeInTheDocument();
  });
});

describe("the kinds beside it are as they were", () => {
  it("still draws a level with its scale", () => {
    const { container } = show({
      answerKind: "RATING",
      level: 4,
      target: 5,
      ratedAt: ANSWERED,
    });
    expect(screen.getByText("Level 4 of 5 · target 5")).toBeInTheDocument();
    expect(segments(container)).toBe(5);
    expect(screen.queryByText("Written")).not.toBeInTheDocument();
  });

  it("does not draw words for a yes or no that happens to carry a text field", () => {
    show({
      answerKind: "BOOLEAN",
      boolValue: true,
      textValue: "Should not show",
      ratedAt: ANSWERED,
    });
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.queryByText("Should not show")).not.toBeInTheDocument();
  });
});
