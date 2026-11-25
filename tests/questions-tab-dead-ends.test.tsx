import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * A button whose destination can only say "you can't" is an error dressed as a
 * button (owner, 24 Nov 2026). On a period that has started the Questions tab
 * offers no "Add questions" step-by-step link, and with nothing in it says so
 * plainly.
 */

const state = vi.hoisted(() => ({ questions: [] as unknown[] }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/performance/periods/c1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/store/performance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/performance")>()),
  useCycleQuestions: () => ({
    questions: state.questions,
    loading: false,
    error: null,
    reload: () => {},
  }),
}));

const { QuestionsPanel } =
  await import("@/app/(app)/performance/periods/[id]/period-screen");

describe("the Questions tab", () => {
  it("offers the step-by-step Add questions only on a draft", () => {
    const { rerender } = render(
      <QuestionsPanel cycleId="c1" editable draft onEdit={() => {}} />,
    );
    expect(screen.getByRole("link", { name: "Add questions" })).toHaveAttribute(
      "href",
      "/performance/periods/c1/questions",
    );
    rerender(
      <QuestionsPanel cycleId="c1" editable draft={false} onEdit={() => {}} />,
    );
    expect(screen.queryByRole("link", { name: "Add questions" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Edit questions" }),
    ).toBeVisible();
  });

  it("offers neither where nothing can be changed, and says it is empty plainly", () => {
    render(
      <QuestionsPanel
        cycleId="c1"
        editable={false}
        draft={false}
        onEdit={() => {}}
      />,
    );
    expect(screen.queryByRole("link", { name: "Add questions" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit questions" })).toBeNull();
    expect(screen.getByText("No questions in this period")).toBeVisible();
  });
});
