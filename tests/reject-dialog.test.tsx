import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RejectDialog } from "@/components/hiring/reject-dialog";
import type { RejectionReason } from "@/lib/hiring/pipeline/model";

/**
 * Turning somebody down, with a reason from the company's list.
 *
 * Rejecting is a decision with a record, so the reason is required and comes from
 * the company's own list, only the reasons that are switched on are offered, the
 * words say it is the person's decision, and it starts blank every time.
 */

const reasons: RejectionReason[] = [
  { id: "r1", label: "Over the band", active: true },
  { id: "r2", label: "Cannot start in time", active: true },
  { id: "r3", label: "Retired reason", active: false },
];

describe("the reject dialog", () => {
  it("needs a reason before Reject can be pressed", async () => {
    const user = userEvent.setup();
    render(
      <RejectDialog
        open
        onClose={() => undefined}
        subject="Ada Okafor"
        reasons={reasons}
        onConfirm={() => undefined}
      />,
    );
    const reject = screen.getByRole("button", { name: "Reject" });
    expect(reject).toBeDisabled();
    await user.selectOptions(
      screen.getByRole("combobox", { name: /Reason/ }),
      "Over the band",
    );
    expect(reject).toBeEnabled();
  });

  it("offers only the reasons that are switched on", () => {
    render(
      <RejectDialog
        open
        onClose={() => undefined}
        subject="Ada Okafor"
        reasons={reasons}
        onConfirm={() => undefined}
      />,
    );
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual([
      "Choose a reason",
      "Over the band",
      "Cannot start in time",
    ]);
  });

  it("hands back the reason's id and the trimmed note, or no note", async () => {
    const user = userEvent.setup();
    const confirm = vi.fn();
    render(
      <RejectDialog
        open
        onClose={() => undefined}
        subject="Ada Okafor"
        reasons={reasons}
        onConfirm={confirm}
      />,
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: /Reason/ }),
      "Cannot start in time",
    );
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(confirm).toHaveBeenLastCalledWith({
      reasonId: "r2",
      note: null,
      sendEmail: false,
    });

    await user.type(
      screen.getByRole("textbox", { name: /Note/ }),
      "  Needs three months  ",
    );
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(confirm).toHaveBeenLastCalledWith({
      reasonId: "r2",
      note: "Needs three months",
      sendEmail: false,
    });
  });

  it("says it is the person's decision, recorded under their name, and sends nothing", () => {
    render(
      <RejectDialog
        open
        onClose={() => undefined}
        subject="Ada Okafor"
        reasons={reasons}
        onConfirm={() => undefined}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Reject Ada Okafor?" });
    expect(dialog).toHaveTextContent(
      "The decision is yours and is recorded under your name",
    );
    expect(dialog).toHaveTextContent("It is not sent to the person.");
    expect(dialog).not.toHaveTextContent(/the system/i);
  });

  it("points at settings when there are no reasons, and cannot be confirmed", () => {
    render(
      <RejectDialog
        open
        onClose={() => undefined}
        subject="Ada Okafor"
        reasons={[{ id: "r3", label: "Retired reason", active: false }]}
        onConfirm={() => undefined}
      />,
    );
    expect(
      screen.getByText("There are no reasons to choose from"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Hiring settings" }),
    ).toHaveAttribute("href", "/hiring/settings/rejection-reasons");
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
  });

  it("starts blank each time it opens", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <RejectDialog
        open
        onClose={() => undefined}
        subject="Ada Okafor"
        reasons={reasons}
        onConfirm={() => undefined}
      />,
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: /Reason/ }),
      "Over the band",
    );
    await user.type(
      screen.getByRole("textbox", { name: /Note/ }),
      "Half written",
    );
    rerender(
      <RejectDialog
        open={false}
        onClose={() => undefined}
        subject="Ada Okafor"
        reasons={reasons}
        onConfirm={() => undefined}
      />,
    );
    rerender(
      <RejectDialog
        open
        onClose={() => undefined}
        subject="Bola Adeyemi"
        reasons={reasons}
        onConfirm={() => undefined}
      />,
    );
    expect(await screen.findByRole("combobox", { name: /Reason/ })).toHaveValue(
      "",
    );
    expect(screen.getByRole("textbox", { name: /Note/ })).toHaveValue("");
  });

  it("shows the API's refusal where the person is looking", () => {
    render(
      <RejectDialog
        open
        onClose={() => undefined}
        subject="Ada Okafor"
        reasons={reasons}
        error="Ada Okafor is no longer in the process."
        onConfirm={() => undefined}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Ada Okafor is no longer in the process.",
    );
  });
  describe("the decline email", () => {
    const offer = {
      label: "Send them a decline email",
      description:
        "Off unless you tick it. Rejecting never emails anybody by itself.",
      blockedBy: [] as string[],
    };

    it("is not offered unless the screen offers it, and nothing is sent", async () => {
      const user = userEvent.setup();
      const confirm = vi.fn();
      render(
        <RejectDialog
          open
          onClose={() => undefined}
          subject="Ada Okafor"
          reasons={reasons}
          onConfirm={confirm}
        />,
      );
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
      await user.selectOptions(
        screen.getByRole("combobox", { name: /Reason/ }),
        "Cannot start in time",
      );
      await user.click(screen.getByRole("button", { name: "Reject" }));
      expect(confirm).toHaveBeenLastCalledWith(
        expect.objectContaining({ sendEmail: false }),
      );
    });

    it("is off every time the dialog opens, and only a tick sends it", async () => {
      const user = userEvent.setup();
      const confirm = vi.fn();
      const { rerender } = render(
        <RejectDialog
          open
          onClose={() => undefined}
          subject="Ada Okafor"
          reasons={reasons}
          emailOffer={offer}
          onConfirm={confirm}
        />,
      );
      const tick = screen.getByRole("checkbox", {
        name: /Send them a decline email/,
      });
      expect(tick).not.toBeChecked();
      await user.click(tick);
      await user.selectOptions(
        screen.getByRole("combobox", { name: /Reason/ }),
        "Cannot start in time",
      );
      await user.click(screen.getByRole("button", { name: "Reject" }));
      expect(confirm).toHaveBeenLastCalledWith(
        expect.objectContaining({ sendEmail: true }),
      );

      /* Closed and opened again: the last tick is not remembered. */
      rerender(
        <RejectDialog
          open={false}
          onClose={() => undefined}
          subject="Ada Okafor"
          reasons={reasons}
          emailOffer={offer}
          onConfirm={confirm}
        />,
      );
      rerender(
        <RejectDialog
          open
          onClose={() => undefined}
          subject="Bola Ade"
          reasons={reasons}
          emailOffer={offer}
          onConfirm={confirm}
        />,
      );
      expect(
        screen.getByRole("checkbox", { name: /Send them a decline email/ }),
      ).not.toBeChecked();
    });

    it("says why it would not be sent, in the API's words, once it is ticked", async () => {
      const user = userEvent.setup();
      render(
        <RejectDialog
          open
          onClose={() => undefined}
          subject="Ada Okafor"
          reasons={reasons}
          emailOffer={{
            ...offer,
            blockedBy: [
              "Add a reply-to address: replies from candidates have to go somewhere.",
            ],
          }}
          onConfirm={() => undefined}
        />,
      );
      expect(screen.queryByText(/would not be sent/)).not.toBeInTheDocument();
      await user.click(
        screen.getByRole("checkbox", { name: /Send them a decline email/ }),
      );
      expect(screen.getByText(/It would not be sent right now/)).toBeVisible();
      expect(
        screen.getByText(/Add a reply-to address: replies from candidates/),
      ).toBeVisible();
    });
  });
});
