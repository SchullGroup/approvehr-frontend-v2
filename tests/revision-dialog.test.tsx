import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sending a review back is one dialog wherever it is opened (owner, 27 Nov 2026):
 * a title, the reason, Cancel and Send back. The choice between the manager's
 * review and the person's own appears only when both could be meant, and the
 * button waits for a reason instead of scolding afterwards.
 */

const requestRevision = vi.hoisted(() => vi.fn());

vi.mock("@/lib/store/performance", () => ({
  useCycleMutations: () => ({ requestRevision }),
}));

const { RevisionDialog } =
  await import("@/components/performance/revision-dialog");
const { ToastProvider } = await import("@/components/ui");

const draw = (
  props: Partial<React.ComponentProps<typeof RevisionDialog>> = {},
) => {
  const onClose = vi.fn();
  const onChanged = vi.fn();
  render(
    <ToastProvider>
      <RevisionDialog
        open
        onClose={onClose}
        cycleId="c1"
        employeeId="e1"
        employeeName="Ada Obi"
        onChanged={onChanged}
        {...props}
      />
    </ToastProvider>,
  );
  return { onClose, onChanged };
};

beforeEach(() => {
  requestRevision.mockReset().mockResolvedValue({});
});

describe("sending a review back", () => {
  it("is a title and a reason, with no description, help line or choice of review", () => {
    draw();
    expect(
      screen.getByRole("heading", { name: "Send Ada Obi's review back" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Which review")).toBeNull();
    expect(screen.queryByText(/Opens that one review again/)).toBeNull();
    expect(screen.queryByText(/This is kept with the request/)).toBeNull();
  });

  it("waits for a reason, and says nothing red about it", async () => {
    draw();
    const send = screen.getByRole("button", { name: "Send back" });
    expect(send).toBeDisabled();
    await userEvent.type(
      screen.getByRole("textbox", { name: /Why/ }),
      "Two answers are missing.",
    );
    expect(send).toBeEnabled();
    expect(screen.queryByText(/this is the record of it/)).toBeNull();
  });

  it("sends the manager's review back unless told otherwise", async () => {
    const { onClose, onChanged } = draw();
    await userEvent.type(
      screen.getByRole("textbox", { name: /Why/ }),
      "Two answers are missing.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send back" }));
    await waitFor(() => expect(requestRevision).toHaveBeenCalled());
    expect(requestRevision).toHaveBeenCalledWith("c1", {
      employeeId: "e1",
      targetStage: "MANAGER",
      reason: "Two answers are missing.",
    });
    expect(onClose).toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalled();
  });

  it("sends the person's own appraisal back when that is the one to send", async () => {
    draw({ target: "SELF" });
    await userEvent.type(
      screen.getByRole("textbox", { name: /Why/ }),
      "Please add your objectives.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send back" }));
    await waitFor(() => expect(requestRevision).toHaveBeenCalled());
    expect(requestRevision.mock.calls[0]?.[1]).toMatchObject({
      targetStage: "SELF",
    });
  });

  it("offers the choice only when both reviews could be meant", async () => {
    draw({ choose: true });
    const which = screen.getByRole("combobox", { name: /Which review/ });
    expect(which).toHaveValue("MANAGER");
    await userEvent.selectOptions(which, "SELF");
    await userEvent.type(
      screen.getByRole("textbox", { name: /Why/ }),
      "Please add your objectives.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send back" }));
    await waitFor(() => expect(requestRevision).toHaveBeenCalled());
    expect(requestRevision.mock.calls[0]?.[1]).toMatchObject({
      targetStage: "SELF",
    });
  });

  it("starts from the words a caller has for it", () => {
    draw({ message: "Please add the work this score is based on." });
    expect(screen.getByRole("textbox", { name: /Why/ })).toHaveValue(
      "Please add the work this score is based on.",
    );
    expect(screen.getByRole("button", { name: "Send back" })).toBeEnabled();
  });
});
