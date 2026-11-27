import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ApiKeyResult } from "@/lib/api/performance";

/**
 * A number nobody has read, as the objective's detail shows it.
 *
 * The 0% beside a measure that was never read is the 0 it started at, not a
 * result. `tsc` cannot see that: `percent: number` is satisfied by both. These
 * pin what the row says instead (an empty box that says "Not recorded", once),
 * that typing the starting figure as a first reading still counts as a reading
 * (0 can be the honest answer), that a row has no bar of its own (the objective
 * carries the one), and that a server which does not say whether anything was
 * read is not told its measures are unread.
 */

vi.mock("@/lib/store/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/ai")>()),
  useAssistantAvailable: () => ({ available: false, loading: false }),
  useTaskSummarySuggestion: () => ({
    loading: false,
    outcome: null,
    ask: vi.fn(),
    clear: vi.fn(),
  }),
}));

const { MeasureRow } = await import("@/app/(app)/performance/kpis");

const number = (over: Partial<ApiKeyResult> = {}): ApiKeyResult =>
  ({
    id: "m-1",
    goalId: "g-1",
    label: "Offers accepted",
    kind: "NUMBER",
    unit: "offers",
    startValue: "0",
    targetValue: "10",
    currentValue: "0",
    lowerIsBetter: false,
    percent: 0,
    met: false,
    lastReadAt: null,
    confirmedAt: null,
    confirmedByName: null,
    confirmNote: null,
    updatedAt: "2026-10-20T09:00:00.000Z",
    ...over,
  }) as ApiKeyResult;

function show(measure: ApiKeyResult, editable = true) {
  const onRecord = vi.fn().mockResolvedValue(undefined);
  render(
    <ul>
      <MeasureRow
        measure={measure}
        goalId="g-1"
        editable={editable}
        onRecord={onRecord}
      />
    </ul>,
  );
  return onRecord;
}

describe("a target nobody has read", () => {
  it("says it is not recorded, once, with no badge, no percentage and no bar", () => {
    show(number());
    /* Said once, as the empty box's placeholder, and in no sentence. */
    expect(screen.queryByText(/Not recorded|Not read yet/)).toBeNull();
    expect(screen.getAllByPlaceholderText("Not recorded")).toHaveLength(1);
    expect(screen.queryByText("Not read yet")).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/No reading yet/)).not.toBeInTheDocument();
  });

  it("does not offer its starting figure as a current one", () => {
    show(number({ startValue: "5", currentValue: "5" }));
    expect(screen.queryByText(/Now 5/)).not.toBeInTheDocument();
    expect(screen.queryByText(/started at/)).not.toBeInTheDocument();
    expect(screen.getByText("of 10 offers")).toBeInTheDocument();
  });

  it("asks for a first reading in an empty box that says Not recorded", () => {
    show(number({ startValue: "5", currentValue: "5" }));
    const box = screen.getByLabelText("First reading for Offers accepted");
    expect(box).toHaveValue("");
    expect(box).toHaveAttribute("placeholder", "Not recorded");
  });

  it("says Not recorded as words, and no box, where nobody may record", () => {
    show(number(), false);
    expect(screen.getByText("Not recorded")).toBeInTheDocument();
    expect(screen.getByText("of 10 offers")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("takes the starting figure typed as a first reading, because 0 can be the honest answer", async () => {
    const user = userEvent.setup();
    const onRecord = show(number({ startValue: "0", currentValue: "0" }));

    await user.type(
      screen.getByLabelText("First reading for Offers accepted"),
      "0",
    );
    await user.click(screen.getByRole("button", { name: /Save/ }));

    expect(onRecord).toHaveBeenCalledWith("m-1", "0", undefined);
  });

  it("offers no Save for an empty box", async () => {
    const user = userEvent.setup();
    show(number());
    const box = screen.getByLabelText("First reading for Offers accepted");
    await user.type(box, "3");
    expect(screen.getByRole("button", { name: /Save/ })).toBeInTheDocument();
    await user.clear(box);
    expect(
      screen.queryByRole("button", { name: /Save/ }),
    ).not.toBeInTheDocument();
  });
});

describe("a target somebody has read", () => {
  const read = (over: Partial<ApiKeyResult> = {}) =>
    number({
      lastReadAt: "2026-10-22T09:00:00.000Z",
      currentValue: "3",
      percent: 30,
      ...over,
    });

  it("shows its figure as text with no bar of its own, and does not call it unread", () => {
    show(read());
    expect(screen.queryByText("Not read yet")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(screen.getByText("of 10 offers")).toBeInTheDocument();
    expect(screen.queryByText(/aiming for|started at|Now 3/)).toBeNull();
    expect(
      screen.getByLabelText("Latest number for Offers accepted"),
    ).toHaveValue("3");
  });

  it("says its direction only when it counts down, and says what it started from", () => {
    show(read());
    expect(screen.queryByLabelText("Counting down")).not.toBeInTheDocument();
    expect(screen.queryByText("Counting up")).not.toBeInTheDocument();
  });

  it("marks a target that counts down with a small arrow, and its starting figure", () => {
    show(
      read({
        lowerIsBetter: true,
        startValue: "40",
        targetValue: "20",
        currentValue: "35",
        percent: 25,
      }),
    );
    expect(screen.getByLabelText("Counting down")).toBeInTheDocument();
    expect(screen.queryByText("Counting down")).not.toBeInTheDocument();
    expect(
      screen.getByText("of 20 offers · from 40 offers"),
    ).toBeInTheDocument();
  });

  it("does not say Met: the figure is enough", () => {
    show(read({ met: true, percent: 100, currentValue: "10" }));
    expect(screen.queryByText("Met")).not.toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("offers no Save until the number has changed", async () => {
    const user = userEvent.setup();
    show(read());
    expect(
      screen.queryByRole("button", { name: /Save/ }),
    ).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/Latest number/), "5");
    expect(screen.getByRole("button", { name: /Save/ })).toBeInTheDocument();
  });

  it("is a reading of the starting figure when the server says it was read", () => {
    show(read({ currentValue: "0", percent: 0 }));
    expect(screen.queryByText("Not read yet")).not.toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
  });
});

describe("a note on a changed target", () => {
  it("is one line, with Save and Cancel and nothing else", async () => {
    const user = userEvent.setup();
    show(number({ lastReadAt: "2026-10-22T09:00:00.000Z", currentValue: "3" }));
    await user.type(screen.getByLabelText(/Latest number/), "5");
    expect(screen.getByRole("button", { name: /Save/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Undo/ })).toBeNull();
    const note = screen.getByLabelText("What moved Offers accepted");
    expect(note.tagName).toBe("INPUT");
    expect(screen.queryByText(/A few more words/)).toBeNull();
  });

  it("puts the number back, and drops the note, on Cancel", async () => {
    const user = userEvent.setup();
    show(number({ lastReadAt: "2026-10-22T09:00:00.000Z", currentValue: "3" }));
    const box = screen.getByLabelText(/Latest number/);
    await user.type(box, "5");
    await user.type(screen.getByLabelText("What moved Offers accepted"), "x");
    await user.click(screen.getByRole("button", { name: /Cancel/ }));
    expect(box).toHaveValue("3");
    expect(screen.queryByLabelText("What moved Offers accepted")).toBeNull();
  });

  it("sends the note with the number", async () => {
    const user = userEvent.setup();
    const onRecord = show(
      number({ lastReadAt: "2026-10-22T09:00:00.000Z", currentValue: "3" }),
    );
    await user.type(screen.getByLabelText(/Latest number/), "5");
    await user.type(
      screen.getByLabelText("What moved Offers accepted"),
      "Closed two",
    );
    await user.click(screen.getByRole("button", { name: /Save/ }));
    expect(onRecord).toHaveBeenCalledWith("m-1", "35", "Closed two");
  });
});

describe("a target from a server that does not say", () => {
  it("is not called unread", () => {
    /* An older server sends no `lastReadAt`. Telling its users that nothing
       they track has been read would be a claim about their data. */
    const { lastReadAt: _omitted, ...older } = number();
    void _omitted;
    show(older as ApiKeyResult);
    expect(screen.queryByText("Not read yet")).not.toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
  });
});
