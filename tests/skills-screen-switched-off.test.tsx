import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Competency ratings with appraisals switched off.
 *
 * Somebody who can turn them on is told so and given the one button. Everybody
 * else has nothing to do here, so the page draws nothing and sends them back to
 * Performance, instead of handing them a link to a screen that would refuse them.
 */

let canTurnOn = true;
let appraisals = false;
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, back: () => {}, replace }),
  usePathname: () => "/performance/skills",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/permissions", () => ({
  useCan: (permission: string) =>
    permission === "MANAGE_SETTINGS" ? canTurnOn : true,
  useIsManager: () => true,
}));
vi.mock("@/lib/store/features", () => ({
  useFeatures: () => ({ loading: false, appraisals }),
}));
vi.mock("@/lib/store/performance", () => ({
  useRating: () => ({ editable: true }),
}));
vi.mock("@/app/(app)/performance/skills", () => ({
  SkillsTab: () => <div>The competencies</div>,
}));
vi.mock("@/app/(app)/performance/skills/edit-competencies-button", () => ({
  EditCompetenciesButton: () => (
    <button type="button">Edit competencies</button>
  ),
}));
vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const { SkillsScreen } =
  await import("@/app/(app)/performance/skills/skills-screen");

beforeEach(() => {
  canTurnOn = true;
  appraisals = false;
  replace.mockClear();
});

describe("appraisals are switched off", () => {
  it("gives somebody who can turn them on a title and one button, and no description", () => {
    const { container } = render(<SkillsScreen initialTab="mine" />);
    expect(screen.getByText("Appraisals are switched off")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Turn appraisals on" }),
    ).toHaveAttribute("href", "/settings/features");
    expect(container.textContent).not.toMatch(/Scored reviews/);
    expect(replace).not.toHaveBeenCalled();
  });

  it("draws nothing for everybody else, and sends them to Performance", () => {
    canTurnOn = false;
    const { container } = render(<SkillsScreen initialTab="mine" />);
    expect(container).toBeEmptyDOMElement();
    expect(
      screen.queryByRole("link", { name: "Turn appraisals on" }),
    ).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith("/performance");
  });

  it("does neither when appraisals are on", () => {
    appraisals = true;
    canTurnOn = false;
    render(<SkillsScreen initialTab="mine" />);
    expect(screen.getByText("The competencies")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
