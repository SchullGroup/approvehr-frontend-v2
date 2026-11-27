import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuestionsDialog } from "@/app/(app)/performance/period-dialogs";
import type { ApiQuestion } from "@/lib/api/performance";

/**
 * Changing the questions of a period that has started is a plain list (owner, 27
 * Nov 2026): the question, who is asked as words, a pencil and a bin. No view
 * switch, no add form, no start-from-a-period, no scoring essay, no badges.
 */

const listed: ApiQuestion[] = [];

vi.mock("@/lib/store/performance", () => ({
  useCycleQuestions: () => ({
    questions: listed,
    loading: false,
    reload: vi.fn(),
  }),
  useFramework: () => ({
    competencies: [],
    groups: [],
    loading: false,
    error: null,
    source: "api",
  }),
}));

const question = (
  id: string,
  prompt: string,
  over: Partial<ApiQuestion> = {},
): ApiQuestion => ({
  id,
  reviewCycleId: "c-1",
  competencyId: null,
  prompt,
  kind: "TEXT",
  askedOf: ["SELF"],
  required: true,
  options: [],
  allowCustom: false,
  order: 1,
  source: "MANAGER",
  departmentIds: [],
  ...over,
});

const draw = () => {
  const onUpdate = vi.fn().mockResolvedValue(undefined);
  const onRemove = vi.fn().mockResolvedValue(undefined);
  listed.length = 0;
  listed.push(
    question("q-1", "What went well?"),
    question("q-2", "Integrity", {
      competencyId: "k-1",
      answersSubsection: true,
      askedOf: ["SELF", "MANAGER"],
    }),
  );
  render(
    <QuestionsDialog
      open
      cycleId="c-1"
      onClose={vi.fn()}
      onUpdate={onUpdate}
      onRemove={onRemove}
    />,
  );
  return { onUpdate, onRemove };
};

describe("the questions of a period that has started", () => {
  it("is a list of the period's own questions, with who is asked as words", () => {
    draw();
    expect(screen.getByText("What went well?")).toBeInTheDocument();
    expect(screen.getByText("Person")).toBeInTheDocument();
    /* A competency the form asks is rated on its own and is changed on the tab. */
    expect(screen.queryByText("Integrity")).toBeNull();
  });

  it("has nothing to add, copy or file under, and no view to switch", () => {
    draw();
    expect(screen.queryByText("All questions")).toBeNull();
    expect(screen.queryByText("By section")).toBeNull();
    expect(screen.queryByText("Add a question")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add question" })).toBeNull();
    expect(screen.queryByText(/Start from a previous period/)).toBeNull();
    expect(screen.queryByText(/standard self\/manager/)).toBeNull();
    expect(screen.queryByText("Not filed under a section")).toBeNull();
    expect(screen.queryByText(/This period has started/)).toBeNull();
  });

  it("carries no badges on a row", () => {
    draw();
    for (const badge of [
      "Own words",
      "Must be answered",
      "Added by a manager",
    ]) {
      expect(screen.queryByText(badge)).toBeNull();
    }
  });

  it("changes a question in place, and does not touch where it is filed", async () => {
    const { onUpdate } = draw();
    await userEvent.click(screen.getByRole("button", { name: /^Edit "/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(onUpdate.mock.calls[0]?.[0]).toBe("q-1");
    expect(onUpdate.mock.calls[0]?.[1]).not.toHaveProperty("competencyId");
  });
});
