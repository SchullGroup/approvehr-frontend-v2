import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { CreateQuestionBody } from "@/lib/api/performance";
import {
  QUESTION_TOO_LONG,
  QUESTION_TOO_SHORT,
} from "@/lib/performance/question-limits";

/**
 * A manager adds a question of their own to a draft period.
 *
 * Nothing tested this popup. Writing the flow down found that a question that went
 * in was still typed into the box the next time the popup was opened: the dialog
 * stays mounted while it is closed, nothing emptied it, and one press of Add would
 * have asked the same question twice.
 */

let addManagerQuestion: Mock<
  (cycleId: string, body: CreateQuestionBody) => Promise<unknown>
>;

vi.mock("@/lib/store/performance", () => ({
  useCycleMutations: () => ({
    addManagerQuestion: (cycleId: string, body: CreateQuestionBody) =>
      addManagerQuestion(cycleId, body),
  }),
}));

const { ManagerQuestionButton } =
  await import("@/app/(app)/performance/manager-question");

const NEW_CLIENT = "How well did they handle the new client handover?";

const mount = () => {
  const onAdded = vi.fn();
  render(
    <ToastProvider>
      <ManagerQuestionButton cycleId="c-1" onAdded={onAdded} />
    </ToastProvider>,
  );
  return { onAdded };
};

const openIt = () =>
  userEvent.click(
    screen.getByRole("button", { name: "Add your own question" }),
  );
const box = () => screen.getByLabelText(/The question/) as HTMLTextAreaElement;
const addIt = () =>
  userEvent.click(screen.getByRole("button", { name: "Add the question" }));

beforeEach(() => {
  addManagerQuestion = vi.fn().mockResolvedValue({});
});

describe("adding", () => {
  it("sends the wording, the kind and who answers it, as a question that must be answered", async () => {
    const { onAdded } = mount();
    await openIt();
    await userEvent.selectOptions(screen.getByLabelText(/How it is answered/), [
      "BOOLEAN",
    ]);
    await userEvent.selectOptions(screen.getByLabelText(/Who answers it/), [
      "SELF",
    ]);
    await userEvent.type(box(), NEW_CLIENT);

    await addIt();

    await waitFor(() => expect(addManagerQuestion).toHaveBeenCalledTimes(1));
    expect(addManagerQuestion).toHaveBeenCalledWith("c-1", {
      prompt: NEW_CLIENT,
      kind: "BOOLEAN",
      askedOf: ["SELF"],
      required: true,
    });
    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
  });

  it("starts empty the next time it is opened, and not with the question that was just added", async () => {
    mount();
    await openIt();
    await userEvent.selectOptions(screen.getByLabelText(/How it is answered/), [
      "TEXT",
    ]);
    await userEvent.type(box(), NEW_CLIENT);
    await addIt();
    await waitFor(() => expect(addManagerQuestion).toHaveBeenCalledTimes(1));

    await openIt();

    expect(box().value).toBe("");
    expect(
      (screen.getByLabelText(/How it is answered/) as HTMLSelectElement).value,
    ).toBe("RATING");
    expect(
      (screen.getByLabelText(/Who answers it/) as HTMLSelectElement).value,
    ).toBe("MANAGER");
  });

  it("keeps what was written when it is closed without adding, for next time", async () => {
    mount();
    await openIt();
    await userEvent.type(box(), NEW_CLIENT);

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await openIt();

    expect(box().value).toBe(NEW_CLIENT);
    expect(addManagerQuestion).not.toHaveBeenCalled();
  });
});

describe("what it will not send", () => {
  it("refuses a question that is not one, in the server's sentence", async () => {
    mount();
    await openIt();
    await userEvent.type(box(), "Hi");

    await addIt();

    expect(screen.getByText(QUESTION_TOO_SHORT)).toBeInTheDocument();
    expect(addManagerQuestion).not.toHaveBeenCalled();
  });

  it("refuses one over 300 characters before asking the server, in the server's sentence", async () => {
    mount();
    await openIt();
    fireEvent.change(box(), { target: { value: "Q".repeat(300) + "?" } });

    await addIt();

    expect(screen.getByText(QUESTION_TOO_LONG)).toBeInTheDocument();
    expect(addManagerQuestion).not.toHaveBeenCalled();
  });

  it("counts the characters once it is getting long", async () => {
    mount();
    await openIt();

    fireEvent.change(box(), { target: { value: "Q".repeat(249) + "?" } });
    expect(screen.getByText("250 of 300 characters")).toBeInTheDocument();

    fireEvent.change(box(), { target: { value: "Q".repeat(100) } });
    expect(screen.queryByText(/of 300 characters/)).not.toBeInTheDocument();
  });
});

describe("when the server refuses it", () => {
  const refusal =
    "A manager can only add a question before the period has started.";

  it("says so under the question, in the server's words, and keeps what was written", async () => {
    addManagerQuestion = vi
      .fn()
      .mockRejectedValue(new ApiError(409, "conflict", refusal));
    const { onAdded } = mount();
    await openIt();
    await userEvent.type(box(), NEW_CLIENT);

    await addIt();

    expect(await screen.findByText(refusal)).toBeInTheDocument();
    expect(box().value).toBe(NEW_CLIENT);
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("does not show that refusal again the next time it is opened", async () => {
    addManagerQuestion = vi
      .fn()
      .mockRejectedValue(new ApiError(409, "conflict", refusal));
    mount();
    await openIt();
    await userEvent.type(box(), NEW_CLIENT);
    await addIt();
    await screen.findByText(refusal);

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await openIt();

    expect(screen.queryByText(refusal)).not.toBeInTheDocument();
  });
});
