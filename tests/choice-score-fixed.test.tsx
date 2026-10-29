import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { ApiChoiceOption, ApiCompetency } from "@/lib/api/performance";

/**
 * A choice somebody has already picked keeps its score, and the editor says so
 * before a save is refused.
 *
 * The API refuses to change the score of any choice a rating has picked, because
 * it would change marks people were already given, and names every choice in the
 * way in one refusal. That is the right rule and a late place to learn it: the
 * editor let somebody retype a score and press Save to find out. The API now sends
 * how many ratings picked each choice, and the score of one that has been picked is
 * shown as fixed, with the reason, from the start. Its label and its place in the
 * list stay free, and a server that sends no count claims nothing.
 */

let updateCompetency: Mock<(...args: unknown[]) => Promise<unknown>>;
let setChoiceOptions: Mock<(...args: unknown[]) => Promise<unknown>>;

vi.mock("@/lib/store/performance", () => ({
  useFrameworkActions: () => ({
    updateCompetency: (...args: unknown[]) => updateCompetency(...args),
    setChoiceOptions: (...args: unknown[]) => setChoiceOptions(...args),
  }),
}));

const { DirectAnswerPanel } =
  await import("@/app/(app)/performance/direct-answer-panel");

const option = (
  id: string,
  label: string,
  scoreBp: number,
  sortOrder: number,
  ratingCount?: number,
): ApiChoiceOption => ({
  id,
  label,
  scoreBp,
  sortOrder,
  ...(ratingCount !== undefined ? { ratingCount } : {}),
});

const pickList = (options: ApiChoiceOption[]): ApiCompetency => ({
  id: "c1",
  name: "Customer feedback",
  sectionId: "s1",
  sectionName: "Core competency",
  description: null,
  isCore: false,
  scaleMax: 5,
  active: true,
  archived: false,
  ratingCount: 0,
  answerKind: "CHOICE",
  choiceOptions: options,
});

const show = (
  subject: ApiCompetency,
  props: Partial<React.ComponentProps<typeof DirectAnswerPanel>> = {},
) =>
  render(
    <ToastProvider>
      <DirectAnswerPanel
        competency={subject}
        section={{ name: "Core competency", weightBp: 4000 }}
        editable
        whyNot={null}
        onChanged={vi.fn()}
        {...props}
      />
    </ToastProvider>,
  );

const scoreOf = (n: number) =>
  screen.getByLabelText(
    `Score for choice ${String(n)}, as a percentage`,
  ) as HTMLInputElement;
const labelOf = (n: number) =>
  screen.getByLabelText(`Choice ${String(n)}`) as HTMLInputElement;

beforeEach(() => {
  updateCompetency = vi.fn().mockResolvedValue({});
  setChoiceOptions = vi.fn().mockResolvedValue({});
});

describe("a choice that has been picked", () => {
  it("has its score fixed, with the reason beside it, before anything is saved", () => {
    show(
      pickList([
        option("o1", "Exceeds", 10000, 0, 2),
        option("o2", "Meets", 6000, 1, 0),
      ]),
    );

    expect(scoreOf(1)).toBeDisabled();
    expect(
      screen.getByText(
        "Picked 2 times, so its score is fixed. Add a new choice to score it differently.",
      ),
    ).toBeVisible();
    /* The reason is what describes the field, for somebody who cannot see it. */
    expect(scoreOf(1)).toHaveAccessibleDescription(
      "Picked 2 times, so its score is fixed. Add a new choice to score it differently.",
    );
  });

  it("says one time, not 1 times", () => {
    show(
      pickList([
        option("o1", "Exceeds", 10000, 0, 1),
        option("o2", "Meets", 6000, 1, 0),
      ]),
    );
    expect(
      screen.getByText(/^Picked 1 time, so its score is fixed/),
    ).toBeVisible();
  });

  it("leaves its label and its place in the list free", async () => {
    show(
      pickList([
        option("o1", "Exceeds", 10000, 0, 2),
        option("o2", "Meets", 6000, 1, 0),
      ]),
    );

    expect(labelOf(1)).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Move choice 1 down" }),
    ).toBeEnabled();

    await userEvent.clear(labelOf(1));
    await userEvent.type(labelOf(1), "Well above");
    await userEvent.click(screen.getByRole("button", { name: "Save choices" }));

    /* Saved with the score it already had, which the API accepts. */
    await waitFor(() =>
      expect(setChoiceOptions).toHaveBeenCalledWith("c1", [
        { id: "o1", label: "Well above", scoreBp: 10000, sortOrder: 0 },
        { id: "o2", label: "Meets", scoreBp: 6000, sortOrder: 1 },
      ]),
    );
  });
});

describe("a choice nobody has picked, or that is not known to have been", () => {
  it("can be rescored, and says nothing about it", () => {
    show(
      pickList([
        option("o1", "Exceeds", 10000, 0, 2),
        option("o2", "Meets", 6000, 1, 0),
      ]),
    );

    expect(scoreOf(2)).toBeEnabled();
    expect(screen.getAllByText(/so its score is fixed/)).toHaveLength(1);
  });

  it("is not claimed to be fixed by a server that sends no count", () => {
    show(
      pickList([
        option("o1", "Exceeds", 10000, 0),
        option("o2", "Meets", 6000, 1),
      ]),
    );

    expect(scoreOf(1)).toBeEnabled();
    expect(scoreOf(2)).toBeEnabled();
    expect(screen.queryByText(/so its score is fixed/)).not.toBeInTheDocument();
  });

  it("is not fixed for a row added in the editor, which has no ratings", async () => {
    show(
      pickList([
        option("o1", "Exceeds", 10000, 0, 2),
        option("o2", "Meets", 6000, 1, 0),
      ]),
    );
    await userEvent.click(screen.getByRole("button", { name: "Add a choice" }));

    expect(scoreOf(3)).toBeEnabled();
    expect(screen.getAllByText(/so its score is fixed/)).toHaveLength(1);
  });
});

describe("for somebody who may not change it", () => {
  it("shows the scores as they are and does not explain a lock that is not the reason", () => {
    show(
      pickList([
        option("o1", "Exceeds", 10000, 0, 2),
        option("o2", "Meets", 6000, 1, 0),
      ]),
      {
        editable: false,
        whyNot:
          "Only somebody who can manage settings can change sections, subsections and how they are answered.",
      },
    );

    expect(scoreOf(1)).toBeDisabled();
    expect(screen.queryByText(/so its score is fixed/)).not.toBeInTheDocument();
  });
});
