import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ApiKeyResult } from "@/lib/api/performance";

/**
 * A number nobody has read, as the objective's detail shows it.
 *
 * The 0% beside a measure that was never read is the 0 it started at, not a
 * result, and a bar drawn at 0% is a claim that the work has not moved. `tsc`
 * cannot see that: `percent: number` is satisfied by both. These pin what the
 * row says instead, that typing the starting figure as a first reading still
 * counts as a reading (0 can be the honest answer), and that a server which
 * does not say whether anything was read is not told its measures are unread.
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

describe("a measure nobody has read", () => {
  it("says so, and draws no bar", () => {
    show(number());
    expect(screen.getByText("Not read yet")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    /* What it costs is said once, under the objective's bar, not here. */
    expect(
      screen.queryByText(/left out of this objective/),
    ).not.toBeInTheDocument();
  });

  it("does not offer its starting figure as a current one", () => {
    show(number({ startValue: "5", currentValue: "5" }));
    expect(screen.queryByText(/Now 5/)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /No reading yet · target 10 offers · started at 5 offers/,
      ),
    ).toBeInTheDocument();
  });

  it("asks for a first reading in an empty box", () => {
    show(number({ startValue: "5", currentValue: "5" }));
    const box = screen.getByLabelText("First reading for Offers accepted");
    expect(box).toHaveValue("");
    expect(box).toHaveAttribute("placeholder", "First reading");
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

describe("a measure somebody has read", () => {
  const read = (over: Partial<ApiKeyResult> = {}) =>
    number({
      lastReadAt: "2026-10-22T09:00:00.000Z",
      currentValue: "3",
      percent: 30,
      ...over,
    });

  it("shows its figure and its bar, and does not call it unread", () => {
    show(read());
    expect(screen.queryByText("Not read yet")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(
      screen.getByText(/Now 3 offers · target 10 offers · started at 0 offers/),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Latest number for Offers accepted"),
    ).toHaveValue("3");
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
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });
});

describe("a measure from a server that does not say", () => {
  it("is not called unread", () => {
    /* An older server sends no `lastReadAt`. Telling its users that nothing
       they track has been read would be a claim about their data. */
    const { lastReadAt: _omitted, ...older } = number();
    void _omitted;
    show(older as ApiKeyResult);
    expect(screen.queryByText("Not read yet")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });
});
