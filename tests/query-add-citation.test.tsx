import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { ToastProvider } from "@/components/ui";

/**
 * Add a reference to a draft.
 *
 * What is proved: each kind sends exactly the body the server wants (an id for the four that are
 * records, a date for the two that are days); leave is offered as dates and a status with the
 * sentence that the type and the reason are deliberately not cited; the server's refusal is shown as
 * it came with the choice still made; a toast says an act and never what was cited; and the dialog
 * starts blank each time it opens, so a reference chosen for one letter is never left for the next.
 */

const addCitation = vi.fn();
vi.mock("@/lib/store/queries", async (original) => ({
  ...(await original<typeof import("@/lib/store/queries")>()),
  useQueryActions: () => ({ addCitation }),
}));
vi.mock("@/lib/store/conduct", () => ({
  dayLabel: (day: string | null) => (day ? `D(${day})` : "—"),
}));
const optionsFor = vi.fn();
vi.mock("@/lib/store/query-citation-options", () => ({
  useCitationOptions: (kind: string) => optionsFor(kind),
}));

const { AddCitationDialog } =
  await import("@/app/(app)/people/queries/[id]/add-citation-dialog");

const onAdded = vi.fn();
const onClose = vi.fn();
const props = {
  queryId: "q-1",
  subject: { id: "e-1", name: "Chidi Nwosu" },
  citations: [],
  onClose,
  onAdded,
};

const mount = (open = true) =>
  render(
    <ToastProvider>
      <AddCitationDialog open={open} {...props} />
    </ToastProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  onAdded.mockResolvedValue(undefined);
  addCitation.mockResolvedValue({ citation: {}, warnings: [] });
  optionsFor.mockReturnValue({
    options: [],
    loading: false,
    error: null,
    cut: false,
  });
});

const choose = async (kind: string) =>
  userEvent.selectOptions(screen.getByLabelText(/What kind of record/), kind);

describe("each kind", () => {
  it("sends a day for an attendance day, and nothing until there is one", async () => {
    mount();
    await choose("ATTENDANCE_DAY");
    const add = screen.getByRole("button", { name: "Add the reference" });
    expect(add).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Which day/), "2026-11-04");
    await userEvent.click(add);
    await waitFor(() =>
      expect(addCitation).toHaveBeenCalledWith("q-1", {
        kind: "ATTENDANCE_DAY",
        date: "2026-11-04",
      }),
    );
    expect(onAdded).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("bounds the day to 2000 to 2100, the same as the server", async () => {
    mount();
    for (const kind of ["ATTENDANCE_DAY", "ROTA_DAY"]) {
      await choose(kind);
      const day = screen.getByLabelText(/Which day/);
      expect(day).toHaveAttribute("min", "2000-01-01");
      expect(day).toHaveAttribute("max", "2100-12-31");
    }
  });

  it("sends a day for a rota day", async () => {
    mount();
    await choose("ROTA_DAY");
    await userEvent.type(screen.getByLabelText(/Which day/), "2026-11-10");
    await userEvent.click(
      screen.getByRole("button", { name: "Add the reference" }),
    );
    await waitFor(() =>
      expect(addCitation).toHaveBeenCalledWith("q-1", {
        kind: "ROTA_DAY",
        date: "2026-11-10",
      }),
    );
  });

  it.each([
    ["POLICY", { kind: "POLICY", policyId: "r-1" }],
    ["EQUIPMENT", { kind: "EQUIPMENT", assignmentId: "r-1" }],
    ["LEAVE_REQUEST", { kind: "LEAVE_REQUEST", leaveRequestId: "r-1" }],
    [
      "DOCUMENT_REQUEST",
      { kind: "DOCUMENT_REQUEST", documentRequestId: "r-1" },
    ],
  ])("sends the id of the record chosen for %s", async (kind, body) => {
    optionsFor.mockReturnValue({
      options: [{ value: "r-1", label: "The first one" }],
      loading: false,
      error: null,
      cut: false,
    });
    mount();
    await choose(kind);
    const add = screen.getByRole("button", { name: "Add the reference" });
    expect(add).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText(/Which one/), "r-1");
    await userEvent.click(add);
    await waitFor(() => expect(addCitation).toHaveBeenCalledWith("q-1", body));
  });
});

describe("what is said about each kind", () => {
  it("says leave is dates and status only, never the type or the reason, because either can be health information", async () => {
    mount();
    await choose("LEAVE_REQUEST");
    expect(
      screen.getByText(
        /dates, the number of days and the status only.*Never the type of leave and never the reason/,
      ),
    ).toBeInTheDocument();
  });

  it("says a self clock-in is a claim and a system clock-out is not a recorded time", async () => {
    mount();
    await choose("ATTENDANCE_DAY");
    expect(
      screen.getByText(/A time they clocked themselves is a claim/),
    ).toBeInTheDocument();
  });

  it("says the handbook keeps no earlier versions of a policy", async () => {
    mount();
    await choose("POLICY");
    expect(screen.getByText(/keeps no earlier versions/)).toBeInTheDocument();
  });

  it("says nothing is of this kind to cite, rather than showing an empty list, and says when it could not read them", async () => {
    mount();
    await choose("EQUIPMENT");
    expect(
      screen.getByRole("option", {
        name: "There is nothing of this kind to cite",
      }),
    ).toBeInTheDocument();
    optionsFor.mockReturnValue({
      options: [],
      loading: false,
      error: new Error("x"),
      cut: false,
    });
    mount();
    await userEvent.selectOptions(
      screen.getAllByLabelText(/What kind of record/)[1]!,
      "EQUIPMENT",
    );
    expect(
      screen.getByRole("option", { name: "Their records could not be read" }),
    ).toBeInTheDocument();
  });
});

describe("a refusal", () => {
  it("is the server's own sentence, with the choice still made and the dialog open", async () => {
    addCitation.mockRejectedValue(
      new ApiError(
        422,
        "unprocessable",
        "Attendance was not recorded for that day, so there is nothing to cite.",
      ),
    );
    mount();
    await choose("ATTENDANCE_DAY");
    await userEvent.type(screen.getByLabelText(/Which day/), "2026-11-30");
    await userEvent.click(
      screen.getByRole("button", { name: "Add the reference" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Attendance was not recorded for that day, so there is nothing to cite.",
    );
    expect(screen.getByLabelText(/Which day/)).toHaveValue("2026-11-30");
    expect(onClose).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
  });
});

describe("a toast", () => {
  it("says a reference was added and never what was cited", async () => {
    optionsFor.mockReturnValue({
      options: [{ value: "r-1", label: "A SECRET POLICY NAME, version 9" }],
      loading: false,
      error: null,
      cut: false,
    });
    mount();
    await choose("POLICY");
    await userEvent.selectOptions(screen.getByLabelText(/Which one/), "r-1");
    await userEvent.click(
      screen.getByRole("button", { name: "Add the reference" }),
    );
    expect(await screen.findByText("Reference added")).toBeInTheDocument();
    const toast = screen.getByText("Reference added").closest("div");
    expect(toast?.textContent ?? "").not.toMatch(/SECRET/);
  });
});

describe("opened again", () => {
  it("starts blank, so nothing chosen for one letter is left for the next", async () => {
    const view = mount();
    await choose("ATTENDANCE_DAY");
    await userEvent.type(screen.getByLabelText(/Which day/), "2026-11-04");
    view.rerender(
      <ToastProvider>
        <AddCitationDialog open={false} {...props} />
      </ToastProvider>,
    );
    view.rerender(
      <ToastProvider>
        <AddCitationDialog open {...props} />
      </ToastProvider>,
    );
    expect(
      (screen.getByLabelText(/What kind of record/) as HTMLSelectElement).value,
    ).toBe("");
    expect(screen.queryByLabelText(/Which day/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Add the reference" }),
    ).toBeDisabled();
  });

  it("does not close while the request is out", async () => {
    let finish: (value: unknown) => void = () => undefined;
    addCitation.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    mount();
    await choose("ROTA_DAY");
    await userEvent.type(screen.getByLabelText(/Which day/), "2026-11-10");
    await userEvent.click(
      screen.getByRole("button", { name: "Add the reference" }),
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    finish({ citation: {}, warnings: [] });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
