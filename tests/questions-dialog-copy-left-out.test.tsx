import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { QuestionCopy } from "@/lib/api/performance";
import { QuestionsDialog } from "@/app/(app)/performance/period-dialogs";

/**
 * Copying a period's questions, and what the dialog says about what it left behind.
 *
 * A question that asks a subsection on the review form is read again from the
 * subsection when a period is copied, and one whose subsection has since been
 * switched off or removed is left behind. The API says so; the dialog read only how
 * many arrived, so the new period quietly had fewer questions and nothing said why.
 * What `tsc` cannot see: the API's sentence dropped, reworded or shown only for a
 * copy that put something on the list, a line that stays after the next copy, and
 * a line invented for a copy that left nothing out or for a server that said nothing.
 */

const NOTE = 'Left out: "Teamwork" (it is switched off).';

vi.mock("@/lib/store/performance", () => ({
  useCycleQuestions: () => ({
    questions: [],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useFramework: () => ({
    competencies: [],
    groups: [],
    loading: false,
    error: null,
    source: "api",
    reload: vi.fn(),
  }),
  useSections: () => ({ sections: [], loading: false, reload: vi.fn() }),
  useFrameworkActions: () => ({
    editable: true,
    createSection: vi.fn(),
    createCompetency: vi.fn(),
    updateCompetency: vi.fn(),
    setChoiceOptions: vi.fn(),
  }),
  useAppraisals: () => ({
    cycles: [{ id: "c-0", name: "H1 2026 Appraisal", questionCount: 5 }],
    loading: false,
  }),
}));
vi.mock("@/lib/permissions", () => ({ useCan: () => true }));

let onCopyFrom: Mock<(sourceCycleId: string) => Promise<QuestionCopy>>;

const dialog = (open: boolean) => (
  <QuestionsDialog
    open={open}
    cycleId="c-1"
    periodName="H2 2026 Appraisal"
    stage="DRAFT"
    onClose={vi.fn()}
    onAdd={vi.fn().mockResolvedValue(undefined)}
    onUpdate={vi.fn().mockResolvedValue(undefined)}
    onRemove={vi.fn().mockResolvedValue(undefined)}
    onCopyFrom={(id) => onCopyFrom(id)}
  />
);

const mount = () => render(dialog(true));

/** Choose the period to copy from, and press the button. */
const copy = async () => {
  await userEvent.selectOptions(screen.getByLabelText("Copy from"), "c-0");
  await userEvent.click(screen.getByRole("button", { name: "Copy them over" }));
};

beforeEach(() => {
  onCopyFrom = vi.fn().mockResolvedValue({ cycleId: "c-1", copied: 5 });
});

describe("a copy that left a question behind", () => {
  it("says what arrived and the API's own sentence about what did not", async () => {
    onCopyFrom.mockResolvedValue({
      cycleId: "c-1",
      copied: 2,
      skipped: 1,
      skippedNote: NOTE,
    });
    mount();
    await copy();

    expect(onCopyFrom).toHaveBeenCalledWith("c-0");
    expect(
      await screen.findByText(`Copied 2 questions. ${NOTE}`),
    ).toBeInTheDocument();
  });

  it("says it even when nothing arrived, which is when it matters most", async () => {
    onCopyFrom.mockResolvedValue({
      cycleId: "c-1",
      copied: 0,
      skipped: 1,
      skippedNote: NOTE,
    });
    mount();
    await copy();

    expect(
      await screen.findByText(`Nothing was copied. ${NOTE}`),
    ).toBeInTheDocument();
  });

  it("goes when the next copy starts, and does not wait for it to finish", async () => {
    onCopyFrom.mockResolvedValueOnce({
      cycleId: "c-1",
      copied: 2,
      skipped: 1,
      skippedNote: NOTE,
    });
    mount();
    await copy();
    await screen.findByText(`Copied 2 questions. ${NOTE}`);

    let finish: (value: QuestionCopy) => void = () => {};
    onCopyFrom.mockReturnValueOnce(
      new Promise<QuestionCopy>((resolve) => {
        finish = resolve;
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Copy them over" }),
    );

    expect(screen.queryByText(/Left out:/)).not.toBeInTheDocument();
    finish({ cycleId: "c-1", copied: 5, skipped: 0, skippedNote: null });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Copy them over" }),
      ).toBeEnabled(),
    );
    expect(screen.queryByText(/Left out:/)).not.toBeInTheDocument();
  });
});

describe("closing the dialog", () => {
  it("drops the line, so it is not still there the next time the dialog is opened", async () => {
    onCopyFrom.mockResolvedValue({
      cycleId: "c-1",
      copied: 2,
      skipped: 1,
      skippedNote: NOTE,
    });
    const view = mount();
    await copy();
    await screen.findByText(`Copied 2 questions. ${NOTE}`);

    /* The dialog stays mounted when it closes, so its state outlives the close. */
    view.rerender(dialog(false));
    view.rerender(dialog(true));

    expect(screen.queryByText(/Left out:/)).not.toBeInTheDocument();
  });
});

describe("a copy that left nothing behind", () => {
  it("says nothing when the API says nothing was left out", async () => {
    onCopyFrom.mockResolvedValue({
      cycleId: "c-1",
      copied: 5,
      skipped: 0,
      skippedNote: null,
    });
    mount();
    await copy();

    await waitFor(() => expect(onCopyFrom).toHaveBeenCalled());
    expect(screen.queryByText(/Left out:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Copied 5/)).not.toBeInTheDocument();
  });

  it("says nothing for a server that sends neither field", async () => {
    mount();
    await copy();

    await waitFor(() => expect(onCopyFrom).toHaveBeenCalled());
    expect(
      screen.queryByText(/Left out|were left out|was left out/),
    ).not.toBeInTheDocument();
  });
});

describe("a copy that was refused", () => {
  it("shows the refusal and no account of what was copied", async () => {
    onCopyFrom.mockRejectedValue(
      new ApiError(409, "conflict", "H2 2026 Appraisal already has questions."),
    );
    mount();
    await copy();

    expect(
      await screen.findByText("H2 2026 Appraisal already has questions."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Copied \d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nothing was copied/)).not.toBeInTheDocument();
  });
});
