import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderInToasts } from "./pipeline-workspace-helpers";

/**
 * "Send a document for signature" starts blank each time it is opened.
 *
 * The screen keeps it mounted so the dialog can animate out, and `Modal`
 * unmounts its children when it closes. The file picker therefore started over
 * while the fields above it did not: after one contract was sent, the next open
 * showed "Choose a file" over a button that was still live and still carried the
 * last PDF and the last person picked. Press it, and a document went for
 * signature, in the company's name, to somebody it was never meant for.
 */

const people = [
  { value: "emp-grace", label: "Grace Effiong" },
  { value: "emp-bola", label: "Bola Ade" },
];

const send = vi.hoisted(() => vi.fn());
const search = vi.hoisted(() => vi.fn());

vi.mock("@/lib/store/signatures", () => ({
  useSignatureMutations: () => ({ send, available: true, refusal: "" }),
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeSearch: () => ({
    search,
    options: people,
    pending: false,
    failed: false,
    retry: vi.fn(),
    more: false,
  }),
}));

const { SendDialog } =
  await import("@/app/(app)/people/signatures/send-dialog");

function Harness({ onSent }: { onSent?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open the form
      </button>
      <SendDialog
        open={open}
        onClose={() => setOpen(false)}
        onSent={() => {
          onSent?.();
          setOpen(false);
        }}
      />
    </>
  );
}

const gone = () =>
  waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
const fileInput = () =>
  document.querySelector('input[type="file"]') as HTMLInputElement;
const pdf = (name: string, text: string) =>
  new File([text], name, { type: "application/pdf" });
const sendIt = () => screen.getByRole("button", { name: /Send it/ });

async function pick(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("combobox", { name: "Who signs it" }));
  await user.click(screen.getByRole("option", { name }));
}

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({});
  search.mockReset();
});

describe("Send a document for signature", () => {
  it("opens blank after one was sent, with the picker and the button agreeing", async () => {
    const user = userEvent.setup();
    renderInToasts(<Harness />);

    await user.click(screen.getByRole("button", { name: "Open the form" }));
    await pick(user, "Grace Effiong");
    await user.type(screen.getByLabelText(/What it is/), "Employment contract");
    await user.type(screen.getByLabelText(/A note to them/), "Before day one.");
    await user.upload(fileInput(), pdf("contract.pdf", "the contract"));
    expect(await screen.findByText("contract.pdf")).toBeInTheDocument();
    await user.click(sendIt());
    expect(send).toHaveBeenCalledTimes(1);
    await gone();

    await user.click(screen.getByRole("button", { name: "Open the form" }));
    expect(screen.getByRole("combobox", { name: "Who signs it" })).toHaveValue(
      "",
    );
    expect(screen.getByLabelText(/What it is/)).toHaveValue("");
    expect(screen.getByLabelText(/A note to them/)).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Choose a file" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("contract.pdf")).toBeNull();
    expect(sendIt()).toBeDisabled();
  });

  it("does not send the last document to somebody else", async () => {
    /* The harm, not only the symptom. */
    const user = userEvent.setup();
    renderInToasts(<Harness />);

    await user.click(screen.getByRole("button", { name: "Open the form" }));
    await pick(user, "Grace Effiong");
    await user.type(screen.getByLabelText(/What it is/), "Employment contract");
    await user.upload(fileInput(), pdf("contract.pdf", "the contract"));
    await screen.findByText("contract.pdf");
    await user.click(sendIt());
    await gone();

    await user.click(screen.getByRole("button", { name: "Open the form" }));
    await pick(user, "Bola Ade");
    await user.type(screen.getByLabelText(/What it is/), "Staff handbook");
    /* Everything but the document: nothing to press. */
    await user.click(sendIt());
    expect(send).toHaveBeenCalledTimes(1);

    await user.upload(fileInput(), pdf("handbook.pdf", "the handbook"));
    await screen.findByText("handbook.pdf");
    await user.click(sendIt());
    expect(send).toHaveBeenCalledTimes(2);
    const second = send.mock.calls[1]?.[0] as {
      signerId: string;
      title: string;
      documentBase64: string;
    };
    expect(second.signerId).toBe("emp-bola");
    expect(second.title).toBe("Staff handbook");
    expect(second.documentBase64).toBe(btoa("the handbook"));
    expect(second.documentBase64).not.toBe(btoa("the contract"));
  });

  it("does not bring back what was typed and cancelled", async () => {
    const user = userEvent.setup();
    renderInToasts(<Harness />);

    await user.click(screen.getByRole("button", { name: "Open the form" }));
    await pick(user, "Grace Effiong");
    await user.type(screen.getByLabelText(/What it is/), "Half a thought");
    await user.upload(fileInput(), pdf("draft.pdf", "x"));
    await screen.findByText("draft.pdf");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await gone();

    await user.click(screen.getByRole("button", { name: "Open the form" }));
    expect(screen.getByLabelText(/What it is/)).toHaveValue("");
    expect(screen.queryByText("draft.pdf")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Who signs it" })).toHaveValue(
      "",
    );
    expect(sendIt()).toBeDisabled();
  });

  it("does not change what is on screen while it is closing", async () => {
    const user = userEvent.setup();
    renderInToasts(<Harness />);

    await user.click(screen.getByRole("button", { name: "Open the form" }));
    await user.type(screen.getByLabelText(/What it is/), "Still here");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByLabelText(/What it is/)).toHaveValue("Still here");
    await gone();
  });
});
