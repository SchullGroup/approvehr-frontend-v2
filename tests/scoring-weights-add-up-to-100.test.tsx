import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import {
  weightTotalNote,
  type ApiScoringParts,
  type ApiScoringWeights,
  type ScoreComponent,
} from "@/lib/api/performance";
import {
  PeriodWeights,
  periodWeightsProblem,
  weightsToText,
  type WeightText,
} from "@/components/performance/period-weights";
import { WEIGHTS_RULE } from "@/lib/performance/score-wording";

/**
 * The weights add up to 100%, everywhere (UAT 23 Nov, L14 / PERF-39).
 *
 * The owner's decision: a part's weight is its share of the score, so Settings
 * refuses to save a set that is not 100% and says so, How it works and
 * Settings say the same sentence, and a period's own weights keep the rule they
 * already had. Parts are saved one at a time, so a part's weight is changed only
 * in the weights editor, which sends the whole set at once and only at 100%:
 * a new part starts at 0%, and a part that still counts is not deleted.
 */

describe("weightTotalNote", () => {
  it("is silent at exactly 100%", () => {
    expect(weightTotalNote(10000)).toBeNull();
  });

  it("speaks above and below 100%, with how far off and what the set means meanwhile", () => {
    expect(weightTotalNote(11000)).toBe(
      "These add up to 110%. They have to add up to 100%: change the weights to take off 10%. Until they do, each part counts for its share of 110%.",
    );
    expect(weightTotalNote(9000)).toBe(
      "These add up to 90%. They have to add up to 100%: change the weights to add 10%. Until they do, each part counts for its share of 90%.",
    );
  });

  it("gives no advice for a set that cannot be changed", () => {
    expect(weightTotalNote(11000, { canChange: false })).toBe(
      "These add up to 110%, not 100%. Until they do, each part counts for its share of 110%.",
    );
  });

  it("says nothing about a figure that is not a number", () => {
    expect(weightTotalNote(Number.NaN)).toBeNull();
  });
});

describe("the one sentence", () => {
  it("says the weights add up to 100%", () => {
    expect(WEIGHTS_RULE).toBe(
      "A part's weight is its share of the score, so the weights add up to 100%.",
    );
  });
});

/* ---------------------------------------------------------------- the company's parts */

const SOURCES: { source: ScoreComponent; label: string }[] = [
  { source: "OBJECTIVES", label: "Delivery against objectives" },
  { source: "TASKS", label: "Weekly tasks" },
  { source: "CORE_COMPETENCY", label: "Core competencies" },
  { source: "BEHAVIOURAL_COMPETENCY", label: "Behavioural competencies" },
  { source: "LEADERSHIP", label: "Leadership" },
  { source: "SELF_ASSESSMENT", label: "Self-assessment" },
];

const viewOf = (
  parts: {
    id: string;
    source: ScoreComponent;
    name: string;
    weightBp: number;
  }[],
): ApiScoringParts => {
  const totalBp = parts.reduce((sum, part) => sum + part.weightBp, 0);
  return {
    parts: parts.map((part) => ({
      ...part,
      sourceLabel: SOURCES.find((s) => s.source === part.source)!.label,
      description: null,
      shareBp:
        totalBp === 0 ? 0 : Math.round((part.weightBp * 10000) / totalBp),
    })),
    totalBp,
    sources: SOURCES.map((s) => ({
      ...s,
      description: `About ${s.label}`,
      usedBy: parts.find((part) => part.source === s.source)?.id ?? null,
    })),
    selfAssessmentNote: "THE API'S NOTE",
  };
};

let view: ApiScoringParts = viewOf([]);
const add = vi.fn();
const update = vi.fn();
const remove = vi.fn();
const save = vi.fn();

vi.mock("@/lib/permissions", () => ({ useCan: () => true }));
vi.mock("@/lib/demo", () => ({ sourceNote: () => null }));
vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/lib/store/performance", async (original) => ({
  ...(await original<typeof import("@/lib/store/performance")>()),
  useScoringParts: () => ({
    parts: view,
    loading: false,
    error: null,
    source: "api",
    editable: true,
    refusal: "",
    add,
    update,
    remove,
    reload: vi.fn(),
  }),
  useScoringWeights: () => ({
    weights: null,
    loading: false,
    error: null,
    source: "api",
    editable: true,
    refusal: "",
    save,
    reload: vi.fn(),
  }),
}));
vi.mock("@/lib/store/features", async (original) => ({
  ...(await original<typeof import("@/lib/store/features")>()),
  useFeatureSettings: () => ({
    overallMark: false,
    workEvidenceMonths: null,
    workInAnswers: false,
    workAssists: false,
    flags: { projects: true },
    editable: true,
    loading: false,
    saving: null,
    error: null,
    setOverallMark: vi.fn(),
    setWorkEvidenceMonths: vi.fn(),
    setWorkInAnswers: vi.fn(),
    setWorkAssists: vi.fn(),
  }),
}));

import { ScoringWeightsForm } from "@/app/(app)/settings/performance/weights-form";

const mount = () =>
  render(
    <ToastProvider>
      <ScoringWeightsForm scale={null} />
    </ToastProvider>,
  );

const NOT_100 = /They have to add up to 100%/;

const twoParts = (a: number, b: number) =>
  viewOf([
    { id: "p-1", source: "OBJECTIVES", name: "Delivery", weightBp: a },
    { id: "p-2", source: "LEADERSHIP", name: "Leading people", weightBp: b },
  ]);

beforeEach(() => {
  vi.clearAllMocks();
  add.mockResolvedValue({});
  update.mockResolvedValue({});
  remove.mockResolvedValue(undefined);
  save.mockResolvedValue({ frozenCycles: [] });
  window.history.replaceState(null, "", "/settings/performance");
});

describe("the company's parts card", () => {
  it("has no heading, no rule sentence, no chart and no footer sentence", () => {
    view = twoParts(6000, 4000);
    mount();
    expect(
      screen.queryByRole("heading", { name: "The parts of the score" }),
    ).toBeNull();
    expect(screen.queryByText(new RegExp(WEIGHTS_RULE))).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(
      screen.queryByText(/A period keeps the parts and weights/),
    ).toBeNull();
  });

  it("says nothing more at exactly 100%, and no Total", () => {
    view = twoParts(6000, 4000);
    mount();
    expect(screen.queryByText(NOT_100)).toBeNull();
    expect(screen.queryByText("Total")).toBeNull();
  });

  it("says the Total only when it is not 100%", () => {
    view = twoParts(6000, 5000);
    mount();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getAllByText("110%").length).toBeGreaterThan(0);
  });

  it("says a set saved at 110% has to come down, and what it means until then", () => {
    view = twoParts(6000, 5000);
    mount();
    const note = screen.getByText(NOT_100);
    expect(note).toHaveTextContent("take off 10%");
    expect(note).toHaveTextContent("its share of 110%");
  });

  it("says a set at 90% has to come up", () => {
    view = twoParts(6000, 3000);
    mount();
    expect(screen.getByText(NOT_100)).toHaveTextContent("add 10%");
  });
});

describe("a part's own dialog has no weight", () => {
  beforeEach(() => {
    view = twoParts(6000, 4000);
  });

  it("adds a part at 0% and then opens the weights", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Add part" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByLabelText("Weight")).toBeNull();
    await user.type(within(dialog).getByLabelText("Name"), "Customer focus");
    await user.selectOptions(
      within(dialog).getByLabelText("Scored from"),
      "CORE_COMPETENCY",
    );
    await user.click(within(dialog).getByRole("button", { name: "Add part" }));
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Customer focus", weightBp: 0 }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Edit weights" }),
    ).toBeInTheDocument();
  });

  it("edits a part without touching its weight", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Edit Delivery" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByLabelText("Weight")).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]![1]).not.toHaveProperty("weightBp");
  });
});

describe("the weights editor", () => {
  beforeEach(() => {
    view = twoParts(6000, 4000);
  });

  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: "Edit weights" }));
    return screen.getByRole("dialog", { name: "Edit weights" });
  };

  it("will not save a set that is not 100%, and says by how much", async () => {
    const user = userEvent.setup();
    mount();
    const dialog = await open(user);
    const delivery = within(dialog).getByLabelText("Delivery");
    await user.clear(delivery);
    await user.type(delivery, "70");
    expect(
      within(dialog).getByText("These add up to 110%. Take off 10%."),
    ).toBeInTheDocument();
    const saveButton = within(dialog).getByRole("button", {
      name: "Save weights",
    });
    expect(saveButton).toBeDisabled();
    await user.clear(delivery);
    await user.type(delivery, "50");
    expect(
      within(dialog).getByText("These add up to 90%. Add 10%."),
    ).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
  });

  it("saves the whole set in one write once it is 100%", async () => {
    const user = userEvent.setup();
    mount();
    const dialog = await open(user);
    const delivery = within(dialog).getByLabelText("Delivery");
    const leading = within(dialog).getByLabelText("Leading people");
    await user.clear(delivery);
    await user.type(delivery, "55");
    await user.clear(leading);
    await user.type(leading, "45");
    const saveButton = within(dialog).getByRole("button", {
      name: "Save weights",
    });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![0]).toEqual({
      OBJECTIVES: 5500,
      TASKS: 0,
      CORE_COMPETENCY: 0,
      BEHAVIOURAL_COMPETENCY: 0,
      LEADERSHIP: 4500,
      SELF_ASSESSMENT: 0,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("opens on a set saved before the rule, and lets it be brought to 100%", async () => {
    view = twoParts(6000, 5000);
    const user = userEvent.setup();
    mount();
    const dialog = await open(user);
    const saveButton = within(dialog).getByRole("button", {
      name: "Save weights",
    });
    expect(saveButton).toBeDisabled();
    const leading = within(dialog).getByLabelText("Leading people");
    await user.clear(leading);
    await user.type(leading, "40");
    expect(saveButton).toBeEnabled();
  });
});

describe("deleting a part", () => {
  it("does not delete a part that still counts: its weight goes to the others first", async () => {
    view = twoParts(6000, 4000);
    const user = userEvent.setup();
    mount();
    await user.click(
      screen.getByRole("button", { name: "Delete Leading people" }),
    );
    const confirm = screen.getByRole("dialog");
    expect(confirm).toHaveTextContent("Leading people counts for 40%");
    await user.click(
      within(confirm).getByRole("button", { name: "Edit weights" }),
    );
    expect(remove).not.toHaveBeenCalled();
    const editor = await screen.findByRole("dialog", {
      name: "Edit weights",
    });
    expect(within(editor).getByLabelText("Leading people")).toHaveValue(0);
  });

  it("deletes a part at 0%", async () => {
    view = viewOf([
      { id: "p-1", source: "OBJECTIVES", name: "Delivery", weightBp: 10000 },
      { id: "p-2", source: "LEADERSHIP", name: "Leading people", weightBp: 0 },
    ]);
    const user = userEvent.setup();
    mount();
    await user.click(
      screen.getByRole("button", { name: "Delete Leading people" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete part" }));
    expect(remove).toHaveBeenCalledWith("p-2");
  });
});

/* ---------------------------------------------------------------- a period's own weights */

const defaults: ApiScoringWeights = {
  source: "default",
  rows: [
    {
      component: "OBJECTIVES",
      label: "Delivery against objectives",
      weightBp: 4000,
    },
    { component: "TASKS", label: "Weekly tasks", weightBp: 0 },
    {
      component: "CORE_COMPETENCY",
      label: "Core competencies",
      weightBp: 2500,
    },
    {
      component: "BEHAVIOURAL_COMPETENCY",
      label: "Behavioural competencies",
      weightBp: 2000,
    },
    { component: "LEADERSHIP", label: "Leadership", weightBp: 1500 },
    { component: "SELF_ASSESSMENT", label: "Self-assessment", weightBp: 0 },
  ],
  totalBp: 10000,
  selfAssessmentNote: "",
};

const START: WeightText = weightsToText({
  OBJECTIVES: 4000,
  TASKS: 0,
  CORE_COMPETENCY: 2500,
  BEHAVIOURAL_COMPETENCY: 2000,
  LEADERSHIP: 1500,
  SELF_ASSESSMENT: 0,
});

function Harness({
  start = START,
  readOnly = false,
}: {
  start?: WeightText;
  readOnly?: boolean;
}) {
  const [value, setValue] = useState<WeightText>(start);
  return (
    <PeriodWeights
      value={value}
      onChange={setValue}
      companyDefaults={defaults}
      {...(readOnly ? { readOnly: true } : {})}
    />
  );
}

describe("a period's own weights", () => {
  it("are refused at any total other than 100%", () => {
    expect(periodWeightsProblem(START)).toBeNull();
    expect(periodWeightsProblem({ ...START, OBJECTIVES: "50" })).toBe(
      "The weights have to add up to 100%.",
    );
    expect(periodWeightsProblem({ ...START, OBJECTIVES: "30" })).toBe(
      "The weights have to add up to 100%.",
    );
  });

  it("is quiet at 100%", () => {
    render(<Harness />);
    expect(screen.getByTestId("pie-total")).toHaveTextContent("100%");
    expect(screen.queryByText(/off somewhere/)).toBeNull();
  });

  it("says how much to take off as soon as a row takes the total over 100%", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const objectives = screen.getByLabelText("Delivery against objectives");
    await user.clear(objectives);
    await user.type(objectives, "50");
    expect(screen.getByText("Take 10% off somewhere")).toBeInTheDocument();
    expect(screen.getByTestId("pie-total")).toHaveTextContent("110%");
    /* Nothing in the editor is shut by it. */
    expect(objectives).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /Use my company's weights/ }),
    ).toBeEnabled();
  });

  it("goes again when the total comes back to 100%", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const objectives = screen.getByLabelText("Delivery against objectives");
    await user.clear(objectives);
    await user.type(objectives, "50");
    expect(screen.getByText("Take 10% off somewhere")).toBeInTheDocument();
    await user.clear(objectives);
    await user.type(objectives, "40");
    expect(screen.queryByText(/off somewhere/)).toBeNull();
  });

  it("states a fixed set that is over 100% without advice nobody can follow", () => {
    render(<Harness readOnly start={{ ...START, OBJECTIVES: "50" }} />);
    expect(screen.getByText("Adds up to 110%")).toBeInTheDocument();
    expect(screen.queryByText(/off somewhere/)).toBeNull();
  });
});
