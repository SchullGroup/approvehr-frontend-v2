import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button, Callout, Modal } from "@/components/ui";

/**
 * A failure inside a dialog is read on the footer row, beside the button that
 * caused it, and not at the top of the form.
 */
describe("a failure inside a dialog", () => {
  it("is shown in the footer, next to the buttons", () => {
    render(
      <Modal
        open
        onClose={() => {}}
        title="Bonus"
        footer={<Button>Save</Button>}
      >
        <Callout tone="danger" title="Nothing was saved">
          That bonus could not be saved.
        </Callout>
      </Modal>,
    );
    const message = screen.getByText("Nothing was saved");
    const footer = screen.getByRole("button", { name: "Save" }).parentElement;
    expect(footer?.contains(message)).toBe(true);
  });

  it("stays where it was written when the dialog has no footer", () => {
    render(
      <Modal open onClose={() => {}} title="Bonus">
        <Callout tone="danger" title="Nothing was saved" />
      </Modal>,
    );
    expect(screen.getByText("Nothing was saved")).toBeTruthy();
  });
});
