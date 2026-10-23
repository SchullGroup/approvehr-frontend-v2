import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

/**
 * Add a measure, in two steps.
 *
 * `tsc` cannot see what these pin: that a number sends no `kind` (a server that
 * predates kinds has a strict body and refuses an unknown key), that a
 * done-or-not-done measure sends nothing but its kind and its words (the API
 * refuses a number, a unit or a direction on it by name), and that the dialog
 * opens clean every time instead of showing the last measure's fields against a
 * different objective.
 */

vi.mock("@/lib/permissions", () => ({ useCan: () => true }));
vi.mock("@/lib/store/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/session")>()),
  useSession: () => ({ employeeId: "emp-1" }),
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ flat: [] }),
  useHeadedDepartmentIds: () => new Set<string>(),
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({ employees: [], people: [] }),
}));
vi.mock("@/lib/store/performance", () => ({
  useAppraisals: () => ({ cycles: [] }),
}));
vi.mock("@/lib/store/ai", () => ({
  useAssistantAvailable: () => ({ available: false, loading: false }),
  useObjectiveSuggestions: () => ({
    loading: false,
    ask: vi.fn(),
    clear: vi.fn(),
  }),
}));

const { AddMeasureDialog } =
  await import("@/app/(app)/performance/goal-dialogs");

function open() {
  const onAdd = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const view = render(
    <AddMeasureDialog
      goalTitle="Grow the team"
      open
      onClose={onClose}
      onAdd={onAdd}
    />,
  );
  return { onAdd, onClose, view };
}

const kind = (name: RegExp) => screen.getByRole("radio", { name });
const next = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Next" }));

describe("the first step", () => {
  it("asks what kind of measure it is, with a number already chosen", () => {
    open();
    expect(
      screen.getByRole("group", { name: /What kind of measure is this/ }),
    ).toBeInTheDocument();
    expect(kind(/A number to reach/)).toBeChecked();
    expect(kind(/Done or not done/)).not.toBeChecked();
    /* The fields come after the question, not beside it. */
    expect(screen.queryByLabelText(/Target value/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add measure" }),
    ).not.toBeInTheDocument();
  });

  it("goes on to the number's fields, and back to the question", async () => {
    const user = userEvent.setup();
    open();
    await next(user);
    expect(screen.getByLabelText(/Target value/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Starting value/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(kind(/A number to reach/)).toBeChecked();
  });
});

describe("a number to reach", () => {
  it("sends the figures and no kind", async () => {
    const user = userEvent.setup();
    const { onAdd } = open();
    await next(user);
    await user.type(screen.getByLabelText(/^Measure/), "Offers accepted");
    await user.type(screen.getByLabelText(/Target value/), "10");
    await user.click(screen.getByRole("button", { name: "Add measure" }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const body = onAdd.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body).toEqual({
      label: "Offers accepted",
      targetValue: "10",
      startValue: "0",
    });
    /* An older server's strict body schema would refuse the key. */
    expect(body).not.toHaveProperty("kind");
  });

  it("sends no current value when it is left blank, which is what leaves it unread", async () => {
    const user = userEvent.setup();
    const { onAdd } = open();
    await next(user);
    await user.type(screen.getByLabelText(/^Measure/), "Offers accepted");
    await user.type(screen.getByLabelText(/Target value/), "10");
    await user.click(screen.getByRole("button", { name: "Add measure" }));

    expect(onAdd.mock.calls[0]?.[0]).not.toHaveProperty("currentValue");
  });

  it("sends the current value when one is typed, which is a reading", async () => {
    const user = userEvent.setup();
    const { onAdd } = open();
    await next(user);
    await user.type(screen.getByLabelText(/^Measure/), "Offers accepted");
    await user.type(screen.getByLabelText(/Target value/), "10");
    await user.type(screen.getByLabelText(/Current value/), "3");
    await user.click(screen.getByRole("button", { name: "Add measure" }));

    expect(onAdd.mock.calls[0]?.[0]).toMatchObject({ currentValue: "3" });
  });

  it("says what a blank current value means before it is left blank", async () => {
    const user = userEvent.setup();
    open();
    await next(user);
    expect(screen.getByText(/counts as unread/)).toBeInTheDocument();
  });

  it("refuses a measure with no target, and sends nothing", async () => {
    const user = userEvent.setup();
    const { onAdd } = open();
    await next(user);
    await user.type(screen.getByLabelText(/^Measure/), "Offers accepted");
    await user.click(screen.getByRole("button", { name: "Add measure" }));

    expect(
      await screen.findByText("Set the number you are aiming at."),
    ).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });
});

describe("done or not done", () => {
  const choose = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(kind(/Done or not done/));
    await next(user);
  };

  it("asks what done means and offers no numbers", async () => {
    const user = userEvent.setup();
    open();
    await choose(user);

    expect(screen.getByLabelText(/What does done mean/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Target value/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Starting value/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Unit/)).not.toBeInTheDocument();
  });

  it("sends its kind and its words and nothing else", async () => {
    const user = userEvent.setup();
    const { onAdd } = open();
    await choose(user);
    await user.type(
      screen.getByLabelText(/What does done mean/),
      "Both engineers hired",
    );
    await user.click(screen.getByRole("button", { name: "Add measure" }));

    /* The API refuses a number, a unit or a direction on this kind by name, so
       a body carrying any of them would be a refusal rather than a save. */
    expect(onAdd).toHaveBeenCalledWith({
      kind: "DONE",
      label: "Both engineers hired",
    });
  });

  it("refuses an empty answer in its own words, and sends nothing", async () => {
    const user = userEvent.setup();
    const { onAdd } = open();
    await choose(user);
    await user.click(screen.getByRole("button", { name: "Add measure" }));

    expect(
      await screen.findByText("Say what done means, in a few words."),
    ).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("says who confirms it, and what it counts as until then", async () => {
    const user = userEvent.setup();
    open();
    await choose(user);
    expect(
      screen.getByText(/A manager confirms it when it is done/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/until then it counts as not done/),
    ).toBeInTheDocument();
  });
});

describe("opening it again", () => {
  it("starts on the question with nothing typed, whatever the last one was", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const props = { onAdd, onClose, goalTitle: "Grow the team" };
    const { rerender } = render(<AddMeasureDialog {...props} open />);

    await next(user);
    await user.type(screen.getByLabelText(/^Measure/), "Offers accepted");
    await user.type(screen.getByLabelText(/Target value/), "10");

    rerender(<AddMeasureDialog {...props} open={false} />);
    rerender(<AddMeasureDialog {...props} goalTitle="Another one" open />);

    expect(kind(/A number to reach/)).toBeChecked();
    await next(user);
    expect(screen.getByLabelText(/^Measure/)).toHaveValue("");
    expect(screen.getByLabelText(/Target value/)).toHaveValue("");
  });
});
