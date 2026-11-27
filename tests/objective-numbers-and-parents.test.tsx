import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import {
  MEASURE_NUMBER_PROBLEM,
  isPlainNumber,
  type ApiGoal,
  type ApiKeyResult,
} from "@/lib/api/performance";
import { measureProblems } from "@/lib/performance/measure-problems";
import {
  draftFromGoal,
  stepProblems,
  withoutOwnLine,
  BLANK_OBJECTIVE,
} from "@/lib/performance/objective-wizard";

/**
 * Editing an objective, and typing a figure (F16, F17).
 *
 * "abc" in a reading box was accepted by the screen and refused by the API with
 * "Some fields are not valid", which names no box. An objective being changed
 * was offered as its own parent, which the API refuses as a loop and which the
 * wizard did not send, so it looked saved and was not. An objective with no
 * target opened its target page with nothing chosen and no way on. None of that
 * is a type error.
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

describe("a plain number", () => {
  it("is what the API takes: up to 14 digits, a point, up to 4 decimals", () => {
    for (const ok of [
      "0",
      "7",
      "-3",
      "12.5",
      "0.0001",
      "99999999999999",
      " 42 ",
    ]) {
      expect(isPlainNumber(ok), ok).toBe(true);
    }
  });

  it("is not letters, commas, units, a trailing point or too many decimals", () => {
    for (const bad of [
      "abc",
      "1,000",
      "₦5",
      "5%",
      "5.",
      ".5",
      "1.23456",
      "",
      "  ",
      "1e3",
      "999999999999999",
    ]) {
      expect(isPlainNumber(bad), bad).toBe(false);
    }
  });
});

describe("a target as it is typed", () => {
  const base = {
    kind: "NUMBER" as const,
    label: "Offers accepted",
    start: "0",
    target: "10",
    countDown: false,
  };

  it("refuses a target that is not a number, in the API's words", () => {
    expect(measureProblems({ ...base, target: "abc" }).target).toBe(
      MEASURE_NUMBER_PROBLEM,
    );
    expect(measureProblems({ ...base, target: "1,000" }).target).toBe(
      MEASURE_NUMBER_PROBLEM,
    );
  });

  it("does not call it 'the same as the starting number'", () => {
    /* parseMeasure turns "abc" into 0, and 0 equals a start of 0. */
    const found = measureProblems({ ...base, target: "abc" });
    expect(found.target).not.toMatch(/same as the starting number/);
  });

  it("refuses a start that is not a number, and says it is the start", () => {
    const found = measureProblems({ ...base, start: "abc" });
    expect(found.start).toMatch(/starting number/);
    expect(found.start).toContain(MEASURE_NUMBER_PROBLEM);
  });

  it("accepts a blank start (it is 0) and plain numbers", () => {
    expect(measureProblems({ ...base, start: "" })).toEqual({});
    expect(measureProblems({ ...base, start: "2.5", target: "40" })).toEqual(
      {},
    );
  });

  it("is carried to the wizard's one place for a number's problem", () => {
    const draft = {
      ...BLANK_OBJECTIVE,
      title: "Grow",
      target: "NUMBER" as const,
      label: "Offers",
      start: "abc",
      value: "10",
    };
    const found = stepProblems("target", draft, {
      openPeriods: 0,
      reviewCycleId: "",
    });
    expect(found.value).toMatch(/starting number/);
  });
});

const measure = (over: Partial<ApiKeyResult> = {}): ApiKeyResult =>
  ({
    id: "m-1",
    goalId: "g-1",
    label: "Offers accepted",
    kind: "NUMBER",
    unit: "offers",
    startValue: "0",
    targetValue: "10",
    currentValue: "3",
    lowerIsBetter: false,
    percent: 30,
    met: false,
    lastReadAt: "2026-11-02T09:00:00.000Z",
    confirmedAt: null,
    confirmedByName: null,
    confirmNote: null,
    updatedAt: "2026-11-02T09:00:00.000Z",
    ...over,
  }) as ApiKeyResult;

function row(onRecord = vi.fn().mockResolvedValue(undefined)) {
  render(
    <ul>
      <MeasureRow
        measure={measure()}
        goalId="g-1"
        editable
        onRecord={onRecord}
      />
    </ul>,
  );
  return onRecord;
}

describe("the reading box", () => {
  it("says what is wrong with 'abc' and does not offer to send it", async () => {
    const user = userEvent.setup();
    const onRecord = row();
    await user.type(screen.getByLabelText(/Latest number for/), "abc");
    expect(screen.getByText(MEASURE_NUMBER_PROBLEM)).toBeInTheDocument();
    /* Nothing to press until it is a number: Save is not drawn, Cancel is. */
    expect(
      screen.queryByRole("button", { name: /Save/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel/ })).toBeInTheDocument();
    expect(onRecord).not.toHaveBeenCalled();
  });

  it("refuses a thousands comma, which the API also refuses", async () => {
    const user = userEvent.setup();
    row();
    await user.type(screen.getByLabelText(/Latest number for/), "1,000");
    expect(screen.getByText(MEASURE_NUMBER_PROBLEM)).toBeInTheDocument();
  });

  it("sends a plain number as before", async () => {
    const user = userEvent.setup();
    const onRecord = row();
    const box = screen.getByLabelText(/Latest number for/);
    await user.clear(box);
    await user.type(box, "7.5");
    expect(screen.queryByText(MEASURE_NUMBER_PROBLEM)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Save/ }));
    expect(onRecord).toHaveBeenCalledWith("m-1", "7.5", undefined);
  });

  it("shows the API's sentence for the box when it refuses anyway", async () => {
    const user = userEvent.setup();
    const onRecord = vi
      .fn()
      .mockRejectedValue(
        new ApiError(400, "validation_error", "Some fields are not valid.", [
          { field: "currentValue", message: "That reading is out of range." },
        ]),
      );
    row(onRecord);
    const box = screen.getByLabelText(/Latest number for/);
    await user.clear(box);
    await user.type(box, "8");
    await user.click(screen.getByRole("button", { name: /Save/ }));
    expect(
      await screen.findByText("That reading is out of range."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Some fields are not valid."),
    ).not.toBeInTheDocument();
  });

  it("falls back to the general sentence when the API names no field", async () => {
    const user = userEvent.setup();
    const onRecord = vi
      .fn()
      .mockRejectedValue(
        new ApiError(409, "conflict", "The period is published."),
      );
    row(onRecord);
    const box = screen.getByLabelText(/Latest number for/);
    await user.clear(box);
    await user.type(box, "8");
    await user.click(screen.getByRole("button", { name: /Save/ }));
    expect(
      await screen.findByText("The period is published."),
    ).toBeInTheDocument();
  });
});

describe("the objectives one being changed may sit under (F16)", () => {
  const goals = [
    { id: "a", parentId: null },
    { id: "b", parentId: "a" },
    { id: "c", parentId: "b" },
    { id: "d", parentId: null },
    { id: "e", parentId: "d" },
  ];

  it("is everything for a new objective", () => {
    expect(withoutOwnLine(goals, null).map((g) => g.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });

  it("leaves out the objective itself and everything under it, at any depth", () => {
    expect(withoutOwnLine(goals, "a").map((g) => g.id)).toEqual(["d", "e"]);
    expect(withoutOwnLine(goals, "b").map((g) => g.id)).toEqual([
      "a",
      "d",
      "e",
    ]);
  });

  it("keeps what is above it and beside it", () => {
    expect(withoutOwnLine(goals, "c").map((g) => g.id)).toEqual([
      "a",
      "b",
      "d",
      "e",
    ]);
  });

  it("does not hang on a loop already in the data", () => {
    const loop = [
      { id: "x", parentId: "y" },
      { id: "y", parentId: "x" },
      { id: "z", parentId: null },
    ];
    expect(withoutOwnLine(loop, "z").map((g) => g.id)).toEqual(["x", "y"]);
  });
});

describe("an objective with no target, changed again (F16)", () => {
  const goal = (keyResults: unknown[]): ApiGoal =>
    ({
      id: "g",
      title: "Grow",
      description: null,
      level: "personal",
      departmentId: null,
      ownerId: "emp",
      dueQuarter: "2026-Q4",
      reviewCycleId: null,
      parentId: null,
      keyResults,
    }) as unknown as ApiGoal;

  it("starts on 'add it later', the answer it already has", () => {
    expect(draftFromGoal(goal([]), "emp").target).toBe("LATER");
  });

  it("is not blocked at the page that asks for the kind", () => {
    const draft = draftFromGoal(goal([]), "emp");
    const found = stepProblems("target", draft, {
      openPeriods: 0,
      reviewCycleId: "",
    });
    expect(found.target).toBeUndefined();
  });

  it("keeps its own list of targets when it has some", () => {
    const draft = draftFromGoal(
      goal([
        {
          id: "m",
          kind: "NUMBER",
          label: "Offers",
          startValue: "0",
          targetValue: "10",
          unit: null,
          lowerIsBetter: false,
        },
      ]),
      "emp",
    );
    expect(draft.target).toBeNull();
    expect(Object.keys(draft.targets)).toEqual(["m"]);
  });
});
