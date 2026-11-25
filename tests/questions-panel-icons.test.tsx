import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * Add and edit are a plus and a pencil at the right of each card's title, not
 * buttons floating above the cards.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/performance/periods/c1",
}));
vi.mock("@/lib/store/performance", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/performance")>()),
  useCycleQuestions: () => ({
    questions: [
      {
        id: "q1",
        prompt: "What went well?",
        askedOf: ["SELF"],
        answersSubsection: false,
      },
      {
        id: "q2",
        prompt: "Integrity",
        askedOf: ["SELF", "MANAGER"],
        answersSubsection: true,
      },
    ],
    loading: false,
    error: null,
    reload: () => {},
  }),
}));

const { QuestionsPanel } =
  await import("@/app/(app)/performance/periods/[id]/period-screen");

describe("the questions panel", () => {
  it("has a plus and a pencil on each card, going to the questions page while it is a draft", () => {
    render(<QuestionsPanel cycleId="c1" editable draft onEdit={() => {}} />);
    expect(
      screen.getByRole("link", { name: "Add to the questions" }),
    ).toHaveAttribute("href", "/performance/periods/c1/questions");
    expect(
      screen.getByRole("link", { name: "Edit the questions" }),
    ).toHaveAttribute("href", "/performance/periods/c1/questions");
    expect(
      screen.getByRole("link", { name: "Add to the competencies" }),
    ).toHaveAttribute("href", "/performance/skills");
    expect(
      screen.getByRole("button", { name: "Edit the competencies" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add questions" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit questions" })).toBeNull();
  });

  it("has no icons where the period can no longer be changed", () => {
    render(
      <QuestionsPanel
        cycleId="c1"
        editable={false}
        draft={false}
        onEdit={() => {}}
      />,
    );
    expect(screen.queryByRole("link", { name: /Add to the/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Edit the/ })).toBeNull();
  });
});
