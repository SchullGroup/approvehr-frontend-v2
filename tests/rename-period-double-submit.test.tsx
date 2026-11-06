import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";

/**
 * Renaming a period sends the name once, however many times it is submitted.
 *
 * The Save button is off while a request is in flight, but Enter in the box
 * submits the form and does not look at the button. A second Enter while the
 * first is on its way would send the same name twice, and the second answer
 * (a refusal for a name that is now taken, by this very period) would be shown
 * over a rename that had worked.
 */

let updateCycle: Mock<(...args: unknown[]) => Promise<unknown>>;

vi.mock("@/lib/store/performance", () => ({
  useCycleMutations: () => ({
    updateCycle: (...args: unknown[]) => updateCycle(...args),
  }),
}));

const { RenamePeriodDialog } =
  await import("@/app/(app)/performance/periods/[id]/rename-period");

beforeEach(() => {
  updateCycle = vi.fn();
});

const show = () => {
  const onClose = vi.fn();
  const onRenamed = vi.fn();
  render(
    <ToastProvider>
      <RenamePeriodDialog
        period={{ id: "cycle-1", name: "Q1-Q3 Appraisal" }}
        open
        onClose={onClose}
        onRenamed={onRenamed}
      />
    </ToastProvider>,
  );
  return { onClose, onRenamed };
};

const retype = async (name: string) => {
  const user = userEvent.setup();
  const box = screen.getByRole("textbox");
  await user.clear(box);
  await user.type(box, name);
  return user;
};

const form = () => screen.getByRole("dialog").querySelector("form")!;

describe("a second submit while one is in flight", () => {
  it("is ignored, whatever sends it: the button being off is not the only guard", async () => {
    let finish: (value: unknown) => void = () => undefined;
    updateCycle.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { onRenamed } = show();
    await retype("H1 2027 Appraisal");

    fireEvent.submit(form());
    fireEvent.submit(form());

    expect(updateCycle).toHaveBeenCalledTimes(1);
    expect(updateCycle).toHaveBeenCalledWith("cycle-1", {
      name: "H1 2027 Appraisal",
    });

    await act(async () => {
      finish({});
    });
    expect(onRenamed).toHaveBeenCalledTimes(1);
  });

  it("does not stop a second try once the first has been refused", async () => {
    updateCycle
      .mockRejectedValueOnce(
        new ApiError(409, "CONFLICT", "“H1 2027 Appraisal” already exists."),
      )
      .mockResolvedValueOnce({});
    const { onRenamed } = show();
    await retype("H1 2027 Appraisal");

    await act(async () => {
      fireEvent.submit(form());
    });
    expect(
      await screen.findByText("“H1 2027 Appraisal” already exists."),
    ).toBeTruthy();
    expect(onRenamed).not.toHaveBeenCalled();

    await retype("H1 2027 Review");
    await act(async () => {
      fireEvent.submit(form());
    });

    expect(updateCycle).toHaveBeenCalledTimes(2);
    expect(updateCycle).toHaveBeenLastCalledWith("cycle-1", {
      name: "H1 2027 Review",
    });
    expect(onRenamed).toHaveBeenCalledTimes(1);
  });
});
