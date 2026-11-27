import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MEASURE_NUMBER_PROBLEM } from "@/lib/api/performance";

/**
 * Add a target, in two steps.
 *
 * `tsc` cannot see what these pin: that a number sends no `kind` (a server that
 * predates kinds has a strict body and refuses an unknown key), that a
 * done-or-not-done target sends nothing but its kind and its words (the API
 * refuses a number, a unit or a direction on it by name), that the direction is
 * read from the two figures and never asked, and that the dialog opens clean
 * every time instead of showing the last target's fields against a different
 * objective.
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
  it("asks what kind of target it is, with a number already chosen", () => {
    open();
    expect(
      screen.getByRole("group", { name: /What kind of target is this/ }),
    ).toBeInTheDocument();
    expect(kind(/A number to reach/)).toBeChecked();
    expect(kind(/Done or not done/)).not.toBeChecked();
    /* The fields come after the question, not beside it. */
    expect(screen.queryByLabelText(/^To/)).not.toBeInTheDocument();
    /* Two cards with a name each, and no sentence under either. */
    expect(screen.queryByText(/revenue of/)).not.toBeInTheDocument();
    expect(screen.queryByText(/A manager confirms/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add target" }),
    ).not.toBeInTheDocument();
  });

  it("goes on to the number's fields, and back to the question", async () => {
    const user = userEvent.setup();
    open();
    await next(user);
    expect(screen.getByLabelText(/^What/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^From/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^To/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Unit/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(kind(/A number to reach/)).toBeChecked();
  });
});

describe("a number to reach", () => {
  it("sends the figures and no kind", async () => {
    const user = userEvent.setup();
    const { onAdd } = open();
    await next(user);
    await user.type(screen.getByLabelText(/^What/), "Offers accepted");
    await user.type(screen.getByLabelText(/^To/), "10");
    await user.click(screen.getByRole("button", { name: "Add target" }));

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

  it("never asks for a current value, so a new target is always unread until its first reading", async () => {
    const user = userEvent.setup();
    const { onAdd } = open();
    await next(user);
    expect(screen.queryByLabelText(/Current value/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/^What/), "Offers accepted");
    await user.type(screen.getByLabelText(/^To/), "10");
    await user.click(screen.getByRole("button", { name: "Add target" }));

    expect(onAdd.mock.calls[0]?.[0]).not.toHaveProperty("currentValue");
  });

  it("has no help line and no tick box: three fields and a unit", async () => {
    const user = userEvent.setup();
    open();
    await next(user);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/should go down/)).not.toBeInTheDocument();
    expect(screen.queryByText(/counts as unread/)).not.toBeInTheDocument();
    expect(screen.queryByText(/whatever you say out loud/)).toBeNull();
    expect(screen.queryByRole("button", { name: /More about/ })).toBeNull();
  });

  it("sends the unit, and shows it on both figures", async () => {
    const user = userEvent.setup();
    const { onAdd } = open();
    await next(user);
    await user.type(screen.getByLabelText(/^What/), "Revenue");
    await user.type(screen.getByLabelText(/^To/), "20");
    await user.type(screen.getByLabelText(/^Unit/), "₦m");
    expect(screen.getAllByText("₦m")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Add target" }));

    expect(onAdd.mock.calls[0]?.[0]).toMatchObject({ unit: "₦m" });
  });

  it("counts up when To is above From, and says nothing of direction", async () => {
    const user = userEvent.setup();
    const { onAdd } = open();
    await next(user);
    await user.type(screen.getByLabelText(/^What/), "Offers accepted");
    await user.type(screen.getByLabelText(/^To/), "10");
    await user.click(screen.getByRole("button", { name: "Add target" }));

    expect(onAdd.mock.calls[0]?.[0]).not.toHaveProperty("lowerIsBetter");
  });

  it("counts down when To is below From, without being told", async () => {
    const user = userEvent.setup();
    const { onAdd } = open();
    await next(user);
    await user.type(screen.getByLabelText(/^What/), "Days to hire");
    const from = screen.getByLabelText(/^From/);
    await user.clear(from);
    await user.type(from, "40");
    await user.type(screen.getByLabelText(/^To/), "20");
    await user.click(screen.getByRole("button", { name: "Add target" }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0]?.[0]).toEqual({
      label: "Days to hire",
      targetValue: "20",
      startValue: "40",
      lowerIsBetter: true,
    });
  });

  it("refuses a To that is the same as From, since there is nothing to measure", async () => {
    const user = userEvent.setup();
    const { onAdd } = open();
    await next(user);
    await user.type(screen.getByLabelText(/^What/), "Offers accepted");
    await user.type(screen.getByLabelText(/^To/), "0");
    await user.click(screen.getByRole("button", { name: "Add target" }));

    expect(
      await screen.findByText(/same as the starting number/),
    ).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("refuses a target with no target value, and sends nothing", async () => {
    const user = userEvent.setup();
    const { onAdd } = open();
    await next(user);
    await user.type(screen.getByLabelText(/^What/), "Offers accepted");
    await user.click(screen.getByRole("button", { name: "Add target" }));

    expect(
      await screen.findByText("Set the number you are aiming at."),
    ).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });
});

describe("a start or a target that is not a number (F17)", () => {
  it("refuses a From that is not a number under its own box, in the API's words, and sends nothing", async () => {
    const user = userEvent.setup();
    const { onAdd } = open();
    await next(user);
    await user.type(screen.getByLabelText(/^What/), "Offers accepted");
    const from = screen.getByLabelText(/^From/);
    await user.clear(from);
    await user.type(from, "abc");
    await user.type(screen.getByLabelText(/^To/), "10");
    await user.click(screen.getByRole("button", { name: "Add target" }));

    expect(
      await screen.findByText(
        `The starting number is not a number. ${MEASURE_NUMBER_PROBLEM}`,
      ),
    ).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("refuses a To that is not a number, rather than reading it as 0 and calling it the same as the start", async () => {
    const user = userEvent.setup();
    const { onAdd } = open();
    await next(user);
    await user.type(screen.getByLabelText(/^What/), "Offers accepted");
    await user.type(screen.getByLabelText(/^To/), "abc");
    await user.click(screen.getByRole("button", { name: "Add target" }));

    expect(await screen.findByText(MEASURE_NUMBER_PROBLEM)).toBeInTheDocument();
    expect(screen.queryByText(/same as the starting number/)).toBeNull();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("does not ask about a From that is left blank, which is 0", async () => {
    const user = userEvent.setup();
    const { onAdd } = open();
    await next(user);
    await user.type(screen.getByLabelText(/^What/), "Offers accepted");
    await user.clear(screen.getByLabelText(/^From/));
    await user.type(screen.getByLabelText(/^To/), "10");
    await user.click(screen.getByRole("button", { name: "Add target" }));

    expect(screen.queryByText(MEASURE_NUMBER_PROBLEM)).not.toBeInTheDocument();
    expect(onAdd).toHaveBeenCalledTimes(1);
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
    expect(screen.queryByLabelText(/^To/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^From/)).not.toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Add target" }));

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
    await user.click(screen.getByRole("button", { name: "Add target" }));

    expect(
      await screen.findByText("Say what done means, in a few words."),
    ).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("is one field with no help under it", async () => {
    const user = userEvent.setup();
    open();
    await choose(user);
    expect(
      screen.queryByText(/A manager confirms it when it is done/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/until then it counts as not done/),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /More about/ })).toBeNull();
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
    await user.type(screen.getByLabelText(/^What/), "Offers accepted");
    await user.type(screen.getByLabelText(/^To/), "10");

    rerender(<AddMeasureDialog {...props} open={false} />);
    rerender(<AddMeasureDialog {...props} goalTitle="Another one" open />);

    expect(kind(/A number to reach/)).toBeChecked();
    await next(user);
    expect(screen.getByLabelText(/^What/)).toHaveValue("");
    expect(screen.getByLabelText(/^To/)).toHaveValue("");
  });
});
