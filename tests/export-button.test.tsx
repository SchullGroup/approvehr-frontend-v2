import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ExportButton } from "@/components/portal/export-button";
import { ApiError } from "@/lib/api/client";

/**
 * The rule this repo keeps restating, asserted by pressing the button.
 *
 * > Where the API wrote a sentence about *this* refusal, it is shown verbatim.
 * > It knows which permission is missing or which figure does not reconcile;
 * > nothing on the client does.
 *
 * That rule is prose in four files and enforced nowhere. A well-meaning
 * `catch { toast("Download failed") }` satisfies every type in the codebase and
 * throws away the only sentence anybody can act on — and the failure is
 * invisible until somebody without a permission presses the button.
 */

const wrap = (ui: React.ReactNode) =>
  render(<ToastProvider>{ui}</ToastProvider>);

/* jsdom has no object URLs and no real downloads. Stubbing them is what lets
   the *behaviour* be tested rather than the saving. */
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
});

describe("what the reader is told when a download fails", () => {
  it("shows the server's own refusal, word for word", async () => {
    const refusal =
      "You need the following to do that: Export. Ask somebody who administers this company.";
    wrap(
      <ExportButton
        label="Export directory"
        download={() => Promise.reject(new ApiError(403, "forbidden", refusal))}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /Export directory/ }),
    );
    await waitFor(() => {
      /* Verbatim. Paraphrasing a server message locally is how the two stop
         agreeing about what was refused. */
      expect(screen.getByText(refusal)).toBeInTheDocument();
    });
  });

  it("never puts a status code in front of a reader", async () => {
    wrap(
      <ExportButton
        label="Export"
        download={() =>
          Promise.reject(
            new ApiError(502, "http_error", "The server did not answer."),
          )
        }
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Export/ }));
    await waitFor(() => {
      expect(
        screen.getByText("The server did not answer."),
      ).toBeInTheDocument();
    });
    /* A raw status code is the one class of message written for a developer
       that reaches a payroll clerk. */
    expect(screen.queryByText(/502/)).toBeNull();
  });

  it("says something a person can act on when the throw carried nothing", async () => {
    wrap(
      <ExportButton label="Export" download={() => Promise.reject("nope")} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Export/ }));
    await waitFor(() => {
      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    });
  });
});

describe("while it is working", () => {
  it("disables itself, so a slow export is not started twice", async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const download = vi.fn(() =>
      held.then(() => ({ filename: "staff.csv", body: "a,b\n1,2\n" })),
    );

    wrap(
      <ExportButton
        label="Export"
        busyLabel="Preparing…"
        download={download}
      />,
    );
    const button = screen.getByRole("button", { name: /Export/ });
    await userEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Preparing/ })).toBeDisabled();
    });
    release?.();
    await waitFor(() => {
      expect(screen.getByText(/Downloaded staff\.csv/)).toBeInTheDocument();
    });
    /* One request, however many times an impatient person presses. */
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("saves a binary file as a blob rather than as text", async () => {
    /* A PDF read as text is a corrupted PDF, and the two shapes exist so the
       call site cannot pick wrong. This asserts the button honours them. */
    const blob = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    wrap(
      <ExportButton
        label="Download PDF"
        download={() => Promise.resolve({ filename: "payslip.pdf", blob })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Download PDF/ }));
    await waitFor(() => {
      expect(screen.getByText(/Downloaded payslip\.pdf/)).toBeInTheDocument();
    });
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
  });
});
