import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ExportDialog } from "@/components/hiring/hired/export-dialog";
import type { ExportOptions } from "@/lib/hiring/hired/model";

/**
 * The export dialog says what the file is, offers only the extras the viewer may see,
 * and stops where the API says a file ends.
 */

const OPTIONS: ExportOptions = {
  fixed: ["Name", "Email", "Phone", "Job", "Accepted on", "State"],
  extras: [
    { key: "answers", label: "Answers to the questions", help: null },
    { key: "salary", label: "Pay on the offer", help: "Needs offers access." },
  ],
  maxRows: 10_000,
  capMessage: null,
};

function mount(over: Partial<React.ComponentProps<typeof ExportDialog>> = {}) {
  const onExport = vi.fn();
  const onClose = vi.fn();
  const props: React.ComponentProps<typeof ExportDialog> = {
    open: true,
    onClose,
    scope: "everyone on the list",
    total: 42,
    options: OPTIONS,
    loading: false,
    loadError: null,
    busy: false,
    error: null,
    onExport,
    ...over,
  };
  const view = render(<ExportDialog {...props} />);
  return { onExport, onClose, props, view };
}

describe("ExportDialog", () => {
  it("says the file is personal data and that each export is logged", () => {
    mount();
    expect(screen.getByText("This file holds personal data")).toBeTruthy();
    expect(screen.getByText(/Each export is logged/)).toBeTruthy();
  });

  it("lists the fixed columns as a fact and offers only the extras it was given", () => {
    mount({
      options: {
        ...OPTIONS,
        extras: [
          { key: "answers", label: "Answers to the questions", help: null },
        ],
      },
    });
    expect(screen.getByText(/Name, Email, Phone, Job/)).toBeTruthy();
    expect(
      screen.getByRole("checkbox", { name: /Answers to the questions/ }),
    ).toBeTruthy();
    /* What the viewer may not see is absent, not greyed. */
    expect(
      screen.queryByRole("checkbox", { name: /Pay on the offer/ }),
    ).toBeNull();
    expect(screen.queryByText(/screening/i)).toBeNull();
  });

  it("offers no 'add to the file' group at all when there is nothing to add", () => {
    mount({ options: { ...OPTIONS, extras: [] } });
    expect(screen.queryByText("Add to the file")).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("hands over exactly what was ticked", async () => {
    const user = userEvent.setup();
    const { onExport } = mount();
    await user.click(screen.getByRole("button", { name: "Download CSV" }));
    expect(onExport).toHaveBeenLastCalledWith([]);

    await user.click(
      screen.getByRole("checkbox", { name: /Pay on the offer/ }),
    );
    await user.click(screen.getByRole("button", { name: "Download CSV" }));
    expect(onExport).toHaveBeenLastCalledWith(["salary"]);

    await user.click(
      screen.getByRole("checkbox", { name: /Answers to the questions/ }),
    );
    await user.click(screen.getByRole("button", { name: "Download CSV" }));
    expect(onExport).toHaveBeenLastCalledWith(["salary", "answers"]);
  });

  it("starts again with nothing ticked each time it opens", async () => {
    const user = userEvent.setup();
    const { props, view } = mount();
    await user.click(
      screen.getByRole("checkbox", { name: /Pay on the offer/ }),
    );
    expect(
      (
        screen.getByRole("checkbox", {
          name: /Pay on the offer/,
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);

    view.rerender(<ExportDialog {...props} open={false} />);
    view.rerender(<ExportDialog {...props} open />);
    expect(
      (
        screen.getByRole("checkbox", {
          name: /Pay on the offer/,
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
  });

  it("switches the download off and says the API's sentence when the list is over the cap", () => {
    mount({
      total: 12_500,
      options: {
        ...OPTIONS,
        capMessage:
          "That is more than one file holds. Filter by job or date and export in parts.",
      },
    });
    expect(
      screen.getByText(
        "That is more than one file holds. Filter by job or date and export in parts.",
      ),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Download CSV",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("falls back to its own cap sentence when the API sends none", () => {
    mount({ total: 10_001 });
    expect(screen.getByRole("alert").textContent).toMatch(
      /at most 10,000 people/,
    );
  });

  it("does not offer a download for an empty list or before the options arrive", () => {
    const { view, props } = mount({ total: 0 });
    expect(
      (
        screen.getByRole("button", {
          name: "Download CSV",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    view.rerender(<ExportDialog {...props} total={5} options={null} loading />);
    expect(
      (
        screen.getByRole("button", {
          name: "Download CSV",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByText("Loading the export options")).toBeTruthy();
  });

  it("shows a failure to load the options and a refusal from the export, in the API's words", () => {
    const { view, props } = mount({
      options: null,
      loadError: { message: "Could not read the export options." } as never,
    });
    expect(screen.getByText("Could not read the export options.")).toBeTruthy();
    view.rerender(
      <ExportDialog {...props} error="You cannot export pay for this job." />,
    );
    expect(
      screen.getByText("You cannot export pay for this job."),
    ).toBeTruthy();
  });
});
