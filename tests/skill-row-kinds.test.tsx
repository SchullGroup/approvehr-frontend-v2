import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ApiCompetencyRow } from "@/lib/api/performance";

/**
 * One subsection on somebody's own list of skills, for each way it is answered.
 *
 * The defect this guards is a quiet one. A yes or no and a pick have no level, so
 * their rows carry `level: null` whether or not anybody has answered them, and a
 * row that reads a missing level as "nobody has looked" says so about every
 * answered one. Nothing in the types objects to `level === null`.
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
  name: "Punctuality",
  sectionId: "s",
  sectionName: "Core competency",
  isCore: false,
  scaleMax: 5,
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

describe("a subsection that is rated", () => {
  it("says the level and the target, and draws the level", () => {
    const { container } = show({
      answerKind: "RATING",
      level: 4,
      target: 5,
      ratedAt: ANSWERED,
    });
    expect(screen.getByText("Level 4 of 5 · target 5")).toBeInTheDocument();
    expect(segments(container)).toBe(5);
  });

  it("says no target when none was set", () => {
    show({ level: 3, ratedAt: ANSWERED });
    expect(screen.getByText("Level 3 of 5")).toBeInTheDocument();
  });

  it("is a level when the server does not say, which is what an older one means", () => {
    const { container } = show({
      answerKind: undefined,
      level: 2,
      ratedAt: ANSWERED,
    });
    expect(screen.getByText("Level 2 of 5")).toBeInTheDocument();
    expect(segments(container)).toBe(5);
  });

  it("is not assessed, and still draws its empty scale, until it has been", () => {
    const { container } = show({ level: null, ratedAt: null });
    expect(screen.getByText("Not assessed yet")).toBeInTheDocument();
    expect(segments(container)).toBe(5);
  });

  it("draws the scale of its own length", () => {
    const { container } = show({ scaleMax: 10, level: 7, ratedAt: ANSWERED });
    expect(screen.getByText("Level 7 of 10")).toBeInTheDocument();
    expect(segments(container)).toBe(10);
  });
});

describe("a subsection that is a yes or a no", () => {
  it("shows a yes as a word, with no level, no scale and no claim that nobody has looked", () => {
    const { container } = show({
      name: "Follows safety procedures",
      answerKind: "BOOLEAN",
      level: null,
      boolValue: true,
      ratedAt: ANSWERED,
    });
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.queryByText("Not assessed yet")).not.toBeInTheDocument();
    expect(screen.queryByText(/Level/)).not.toBeInTheDocument();
    expect(segments(container)).toBe(0);
  });

  it("shows a no as a no, which is an answer and not a missing one", () => {
    show({
      answerKind: "BOOLEAN",
      level: null,
      boolValue: false,
      ratedAt: ANSWERED,
    });
    expect(screen.getByText("No")).toBeInTheDocument();
    expect(screen.queryByText("Not assessed yet")).not.toBeInTheDocument();
  });

  it("is not assessed, with nothing drawn, until somebody answers it", () => {
    const { container } = show({
      answerKind: "BOOLEAN",
      level: null,
      boolValue: null,
      ratedAt: null,
    });
    expect(screen.getByText("Not assessed yet")).toBeInTheDocument();
    expect(screen.queryByText("Yes")).not.toBeInTheDocument();
    expect(screen.queryByText("No")).not.toBeInTheDocument();
    expect(segments(container)).toBe(0);
  });

  it("reads an answered row with no value as answered, and never as a yes or a no it was not told", () => {
    show({
      answerKind: "BOOLEAN",
      level: null,
      boolValue: null,
      ratedAt: ANSWERED,
    });
    expect(screen.getByText("Answered")).toBeInTheDocument();
    expect(screen.queryByText("Yes")).not.toBeInTheDocument();
    expect(screen.queryByText("No")).not.toBeInTheDocument();
  });
});

describe("a subsection answered by picking from a list", () => {
  it("shows the label of the choice, with no level and no scale", () => {
    const { container } = show({
      name: "Customer feedback",
      answerKind: "CHOICE",
      level: null,
      choiceOptionLabel: "Delighted",
      ratedAt: ANSWERED,
    });
    expect(screen.getByText("Delighted")).toBeInTheDocument();
    expect(screen.queryByText("Not assessed yet")).not.toBeInTheDocument();
    expect(segments(container)).toBe(0);
  });

  it("shows no score for the choice, which is the API's to work out", () => {
    show({
      answerKind: "CHOICE",
      level: null,
      choiceOptionLabel: "Delighted",
      ratedAt: ANSWERED,
    });
    expect(document.body.textContent).not.toMatch(/%|score/i);
  });

  it("says answered when the pick has no label to show", () => {
    show({
      answerKind: "CHOICE",
      level: null,
      choiceOptionLabel: null,
      ratedAt: ANSWERED,
    });
    expect(screen.getByText("Answered")).toBeInTheDocument();
  });

  it("is not assessed, with nothing drawn, until somebody picks", () => {
    const { container } = show({
      answerKind: "CHOICE",
      level: null,
      choiceOptionLabel: null,
      ratedAt: null,
    });
    expect(screen.getByText("Not assessed yet")).toBeInTheDocument();
    expect(segments(container)).toBe(0);
  });
});
