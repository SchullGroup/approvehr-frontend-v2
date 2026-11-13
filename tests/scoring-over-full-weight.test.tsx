import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import {
  overFullWeightNote,
  type ApiScoringParts,
  type ApiScoringWeights,
  type ScoreComponent,
} from "@/lib/api/performance";
import {
  PeriodWeights,
  weightsToText,
  type WeightText,
} from "@/components/performance/period-weights";

/**
 * Weights that add up to more than 100%.
 *
 * The parts are proportional: each counts for its weight over the total, so
 * 110% is a legitimate set and the API takes it. What goes wrong is the
 * reading: a person who typed 45 and sees 45% takes it for 45% of the mark and
 * the mark counts it for 45/110. So it is a **warning, said where the total
 * is and where the number is typed, and it never stops a save**.
 *
 * What is asserted, in order: the one sentence (`overFullWeightNote`), the
 * company's parts card, the add and edit dialog (the saved weight of the part
 * being edited is not counted twice), and a period's own weights editor
 * (editable, and fixed once the period has started).
 */

describe("overFullWeightNote", () => {
  it("is silent at exactly 100% and below it", () => {
    expect(overFullWeightNote(10000)).toBeNull();
    expect(overFullWeightNote(9999)).toBeNull();
    expect(overFullWeightNote(0)).toBeNull();
  });

  it("speaks from the first basis point over, in the figure it was given", () => {
    expect(overFullWeightNote(10001)).toBe(
      "These add up to 100.01%, which is more than 100%. Each part counts for its share of 100.01%, not for the weight typed. To make the weights read as shares of 100%, take off 0.01%.",
    );
    expect(overFullWeightNote(11000)).toContain("These add up to 110%");
    expect(overFullWeightNote(11000)).toContain("take off 10%");
  });

  it("gives no advice for a set that cannot be changed", () => {
    const note = overFullWeightNote(11000, { canChange: false });
    expect(note).toBe(
      "These add up to 110%, which is more than 100%. Each part counts for its share of 110%, not for the weight typed.",
    );
    expect(note).not.toContain("take off");
  });

  it("says nothing about a figure that is not a number", () => {
    expect(overFullWeightNote(Number.NaN)).toBeNull();
    expect(overFullWeightNote(Number.POSITIVE_INFINITY)).toBeNull();
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
    remove: vi.fn(),
    reload: vi.fn(),
  }),
}));
vi.mock("@/lib/store/features", async (original) => ({
  ...(await original<typeof import("@/lib/store/features")>()),
  useFeatureSettings: () => ({
    overallMark: false,
    editable: true,
    loading: false,
    saving: null,
    error: null,
    setOverallMark: vi.fn(),
  }),
}));

import { ScoringWeightsForm } from "@/app/(app)/settings/performance/weights-form";

const mount = () =>
  render(
    <ToastProvider>
      <ScoringWeightsForm scale={null} />
    </ToastProvider>,
  );

const OVER = /more than 100%/;

beforeEach(() => {
  vi.clearAllMocks();
  add.mockResolvedValue({});
  update.mockResolvedValue({});
  window.history.replaceState(null, "", "/settings/performance");
});

describe("the company's parts card", () => {
  const parts = (a: number, b: number) =>
    viewOf([
      { id: "p-1", source: "OBJECTIVES", name: "Delivery", weightBp: a },
      { id: "p-2", source: "LEADERSHIP", name: "Leading people", weightBp: b },
    ]);

  it("says so, with the way out, when the parts add up to 110%", () => {
    view = parts(6000, 5000);
    mount();
    const note = screen.getByText(OVER);
    expect(note).toHaveTextContent("These add up to 110%");
    expect(note).toHaveTextContent("take off 10%");
    expect(note).toHaveAttribute("role", "status");
  });

  it("says nothing at exactly 100%", () => {
    view = parts(6000, 4000);
    mount();
    expect(screen.queryByText(OVER)).toBeNull();
  });

  it("says nothing at 90%: weights that fall short are not misleading", () => {
    view = parts(6000, 3000);
    mount();
    expect(screen.queryByText(OVER)).toBeNull();
  });

  it("does not stop the parts being edited", () => {
    view = parts(6000, 5000);
    mount();
    expect(screen.getByRole("button", { name: "Edit Delivery" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Add part" })).toBeEnabled();
  });
});

describe("the add and edit dialog", () => {
  beforeEach(() => {
    view = viewOf([
      { id: "p-1", source: "OBJECTIVES", name: "Delivery", weightBp: 6000 },
      { id: "p-2", source: "LEADERSHIP", name: "Leading", weightBp: 3000 },
    ]);
  });

  it("warns while the number is typed: 20 more on 90% is 110%", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Add part" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Weight"), "10");
    expect(within(dialog).queryByText(OVER)).toBeNull();
    await user.clear(within(dialog).getByLabelText("Weight"));
    await user.type(within(dialog).getByLabelText("Weight"), "20");
    const note = within(dialog).getByText(OVER);
    expect(note).toHaveTextContent("These add up to 110%");
    expect(note).toHaveTextContent("take off 10%");
  });

  it("does not shut Save over it: the name and a source are all it asks for", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Add part" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Customer focus");
    await user.selectOptions(
      within(dialog).getByLabelText("Scored from"),
      "CORE_COMPETENCY",
    );
    await user.type(within(dialog).getByLabelText("Weight"), "20");
    expect(within(dialog).getByText(OVER)).toBeInTheDocument();
    const addPart = within(dialog).getByRole("button", { name: "Add part" });
    expect(addPart).toBeEnabled();
    await user.click(addPart);
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ weightBp: 2000 }),
    );
  });

  it("says nothing while the weight is not a usable number", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Add part" }));
    const dialog = screen.getByRole("dialog");
    /* Empty: nothing to add up. */
    expect(within(dialog).queryByText(OVER)).toBeNull();
    /* Out of range: the field's own refusal, not a total built on 150. */
    await user.type(within(dialog).getByLabelText("Weight"), "150");
    expect(
      within(dialog).getByText("A number between 0 and 100."),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(OVER)).toBeNull();
  });

  it("does not count the saved weight of the part being edited a second time", async () => {
    const user = userEvent.setup();
    view = viewOf([
      { id: "p-1", source: "OBJECTIVES", name: "Delivery", weightBp: 6000 },
      { id: "p-2", source: "LEADERSHIP", name: "Leading", weightBp: 4000 },
    ]);
    mount();
    await user.click(screen.getByRole("button", { name: "Edit Delivery" }));
    const dialog = screen.getByRole("dialog");
    /* Saved at 60 beside 40: still 100. Counting its own 60 twice would read 160. */
    expect(within(dialog).getByLabelText("Weight")).toHaveValue(60);
    expect(within(dialog).queryByText(OVER)).toBeNull();
    const weight = within(dialog).getByLabelText("Weight");
    await user.clear(weight);
    await user.type(weight, "70");
    const note = within(dialog).getByText(OVER);
    expect(note).toHaveTextContent("These add up to 110%");
    expect(note).toHaveTextContent("take off 10%");
    await user.clear(weight);
    await user.type(weight, "50");
    expect(within(dialog).queryByText(OVER)).toBeNull();
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
  it("is quiet at 100%", () => {
    render(<Harness />);
    expect(screen.queryByText(OVER)).toBeNull();
  });

  it("warns as soon as a row takes the total over 100%, and says how much to take off", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const objectives = screen.getByLabelText("Delivery against objectives");
    await user.clear(objectives);
    await user.type(objectives, "50");
    const note = screen.getByText(OVER);
    expect(note).toHaveTextContent("These add up to 110%");
    expect(note).toHaveTextContent("take off 10%");
    expect(screen.getByTestId("weights-total")).toHaveTextContent("110%");
    /* A warning only: nothing in the editor is shut by it. */
    expect(objectives).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /Use the company defaults/ }),
    ).toBeEnabled();
  });

  it("goes again when the total comes back to 100%", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const objectives = screen.getByLabelText("Delivery against objectives");
    await user.clear(objectives);
    await user.type(objectives, "50");
    expect(screen.getByText(OVER)).toBeInTheDocument();
    await user.clear(objectives);
    await user.type(objectives, "40");
    expect(screen.queryByText(OVER)).toBeNull();
  });

  it("does not add up a set that has a row that is not a whole number", async () => {
    const user = userEvent.setup();
    render(
      <Harness start={{ ...START, OBJECTIVES: "80", LEADERSHIP: "1.5" }} />,
    );
    /* 80 + 25 + 20 + 1.5 would be over, but the row rule is what is on screen. */
    expect(
      screen.getByText("Each weight is a whole number from 0 to 100."),
    ).toBeInTheDocument();
    expect(screen.queryByText(OVER)).toBeNull();
    await user.clear(screen.getByLabelText("Leadership"));
    await user.type(screen.getByLabelText("Leadership"), "15");
    expect(screen.getByText(OVER)).toBeInTheDocument();
  });

  it("states a fixed set that is over 100% without advice nobody can follow", () => {
    render(<Harness readOnly start={{ ...START, OBJECTIVES: "50" }} />);
    const note = screen.getByText(OVER);
    expect(note).toHaveTextContent("These add up to 110%");
    expect(note).not.toHaveTextContent("take off");
  });

  it("is quiet for a fixed set at 100%", () => {
    render(<Harness readOnly />);
    expect(screen.queryByText(OVER)).toBeNull();
  });
});
