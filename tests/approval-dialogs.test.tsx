import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { ApprovalReasonDialog } from "@/app/(app)/performance/approval-dialogs";

/**
 * The reason on a decline or a reopen.
 *
 * The dialog is the question in its title, one field for the reason, Cancel
 * and the act. The consequence is what the title says, so there is no paragraph
 * above the field and no help beneath it; the button waits for three
 * characters, which is the API's own floor, and nothing is shown in red for a
 * box that is simply empty.
 */

const open = (
  act: "decline" | "revise",
  onConfirm = vi.fn().mockResolvedValue(undefined),
) => {
  render(
    <ApprovalReasonDialog
      act={act}
      goalTitle="Reconcile the bank daily"
      open
      onClose={vi.fn()}
      onConfirm={onConfirm}
    />,
  );
  return { onConfirm, dialog: within(screen.getByRole("dialog")) };
};

describe("decline", () => {
  it("asks the question, and for feedback, with nothing else to read", () => {
    const { dialog } = open("decline");
    expect(
      dialog.getByRole("heading", {
        name: 'Decline "Reconcile the bank daily"?',
      }),
    ).toBeInTheDocument();
    expect(dialog.getByRole("textbox", { name: /feedback/i })).toBeVisible();
    expect(
      dialog.queryByText(/They can change it and send it again/),
    ).toBeNull();
    expect(dialog.queryByText(/Say what would make it agreeable/)).toBeNull();
    expect(dialog.queryByRole("button", { name: /More about/ })).toBeNull();
    expect(dialog.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });
});

describe("reopen", () => {
  it("asks the question, and why, with nothing else to read", () => {
    const { dialog } = open("revise");
    expect(
      dialog.getByRole("heading", {
        name: 'Reopen "Reconcile the bank daily"?',
      }),
    ).toBeInTheDocument();
    expect(dialog.getByRole("textbox", { name: /^why/i })).toBeVisible();
    expect(dialog.queryByText(/has to be agreed again afterwards/)).toBeNull();
    expect(dialog.queryByText(/only record of why/)).toBeNull();
    expect(dialog.queryByRole("button", { name: /More about/ })).toBeNull();
  });

  it("waits for three characters, says nothing in red about it, then sends the reason", async () => {
    const user = userEvent.setup();
    const { dialog, onConfirm } = open("revise");
    const go = dialog.getByRole("button", { name: "Reopen it" });
    expect(go).toBeDisabled();
    await user.type(dialog.getByRole("textbox", { name: /^why/i }), "ab");
    expect(go).toBeDisabled();
    expect(dialog.queryByText(/Say why in a few words/)).toBeNull();
    await user.type(dialog.getByRole("textbox", { name: /^why/i }), "c");
    await user.click(go);
    expect(onConfirm).toHaveBeenCalledWith("abc");
  });

  it("keeps what the server said, and the reason, when it refuses", async () => {
    const user = userEvent.setup();
    const { dialog } = open(
      "revise",
      vi
        .fn()
        .mockRejectedValue(new ApiError(409, "conflict", "It is not agreed.")),
    );
    await user.type(dialog.getByRole("textbox", { name: /^why/i }), "Changed");
    await user.click(dialog.getByRole("button", { name: "Reopen it" }));
    expect(await dialog.findByText("It is not agreed.")).toBeInTheDocument();
    expect(dialog.getByRole("textbox", { name: /^why/i })).toHaveValue(
      "Changed",
    );
  });
});
