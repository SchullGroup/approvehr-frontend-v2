import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";

/**
 * Appraisal scoring with the seventh part, Manager appraisal.
 *
 * The weight is a row like the others. What is specific to it: the API's own
 * sentence about what the weight does (the double count included) is drawn once,
 * beside the weight, and said to be about the saved set whenever a weight has
 * moved; a server that predates the part gets no row, no sentence, and nothing
 * sent for it, because a weight the server drops looks saved and moves no mark.
 */

const save = vi.fn<(...args: unknown[]) => Promise<{ frozenCycles: string[] }>>(
  async () => ({ frozenCycles: [] }),
);

type Row = {
  component: string;
  label: string;
  weightBp: number;
  defaultLabel?: string;
};

const NOTE = "THE API'S NOTE ABOUT MANAGER APPRAISAL";

const baseRows = (): Row[] => [
  {
    component: "OBJECTIVES",
    label: "Delivery against objectives",
    weightBp: 4000,
  },
  { component: "TASKS", label: "Weekly tasks", weightBp: 0 },
  { component: "CORE_COMPETENCY", label: "Core competencies", weightBp: 2500 },
  {
    component: "BEHAVIOURAL_COMPETENCY",
    label: "Behavioural competencies",
    weightBp: 2000,
  },
  { component: "LEADERSHIP", label: "Leadership", weightBp: 1500 },
  { component: "SELF_ASSESSMENT", label: "Self-assessment", weightBp: 0 },
];

const withManager = (weightBp: number, label = "Manager appraisal"): Row[] => {
  const rows = baseRows();
  rows.splice(5, 0, { component: "MANAGER_APPRAISAL", label, weightBp });
  return rows;
};

/* One object per scenario: the form keeps a draft only while the weights it was
   started from are the same object. */
let current: unknown = null;
const serve = (rows: Row[], note?: string) => {
  current = {
    source: "saved",
    selfAssessmentNote: "THE SELF NOTE",
    ...(note === undefined ? {} : { managerAppraisalNote: note }),
    totalBp: rows.reduce((sum, row) => sum + row.weightBp, 0),
    rows,
  };
};

vi.mock("@/lib/permissions", () => ({ useCan: () => true }));
vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/lib/store/performance", async (original) => ({
  ...(await original<typeof import("@/lib/store/performance")>()),
  useScoringWeights: () => ({
    weights: current,
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
    editable: true,
    loading: false,
    saving: null,
    error: null,
    setOverallMark: vi.fn(),
  }),
}));

import { ScoringWeightsForm } from "@/app/(app)/settings/performance/weights-form";

const mount = (tab: "weights" | "marks" = "weights") =>
  render(
    <ToastProvider>
      <ScoringWeightsForm scale={<p>THE SCALE FORM</p>} initialTab={tab} />
    </ToastProvider>,
  );

const row = (component: string) =>
  document.querySelector(`[data-part="${component}"]`) as HTMLElement | null;

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/settings/performance");
});

describe("a server that has the part", () => {
  it("draws its row between Leadership and Self-assessment", () => {
    serve(withManager(0), NOTE);
    mount();
    const order = Array.from(document.querySelectorAll("[data-part]")).map(
      (one) => one.getAttribute("data-part"),
    );
    expect(order).toEqual([
      "OBJECTIVES",
      "TASKS",
      "CORE_COMPETENCY",
      "BEHAVIOURAL_COMPETENCY",
      "LEADERSHIP",
      "MANAGER_APPRAISAL",
      "SELF_ASSESSMENT",
    ]);
  });

  it("says it is left out at 0%, and its share of a mark above it", async () => {
    serve(withManager(0), NOTE);
    mount();
    const manager = within(row("MANAGER_APPRAISAL") as HTMLElement);
    expect(manager.getByText("Left out of the mark")).toBeInTheDocument();
    await userEvent.clear(manager.getByLabelText("Weight"));
    await userEvent.type(manager.getByLabelText("Weight"), "30");
    /* Weights are proportional: 4000 + 2500 + 2000 + 1500 + 3000 is 13000, so
       3000 is a 23.08% share, not 30%. The row says the share, as the others do. */
    expect(manager.getByText("23.08% of a mark")).toBeInTheDocument();
  });

  it("draws the API's sentence once, verbatim, beside the weight it is about", () => {
    serve(withManager(3000), NOTE);
    mount();
    expect(screen.getAllByText(NOTE)).toHaveLength(1);
    expect(
      within(row("MANAGER_APPRAISAL") as HTMLElement).getByText(NOTE),
    ).toBeInTheDocument();
  });

  it("says nothing of its own about the double count: no sentence on the page beyond the API's", () => {
    serve(withManager(3000), NOTE);
    mount();
    expect(screen.queryByText(/counts? twice|both ways|double/i)).toBeNull();
  });

  it("says the sentence is about the saved set once any weight has been moved, and not before", async () => {
    serve(withManager(3000), NOTE);
    mount();
    expect(screen.queryByText(/Saved now, not yet changed/)).toBeNull();
    const objectives = within(row("OBJECTIVES") as HTMLElement);
    await userEvent.clear(objectives.getByLabelText("Weight"));
    await userEvent.type(objectives.getByLabelText("Weight"), "10");
    const manager = within(row("MANAGER_APPRAISAL") as HTMLElement);
    expect(
      manager.getByText(/Saved now, not yet changed:/),
    ).toBeInTheDocument();
    expect(manager.getByText(NOTE)).toBeInTheDocument();
  });

  it("sends the weight with the rest of the set, in basis points", async () => {
    serve(withManager(0), NOTE);
    mount();
    const manager = within(row("MANAGER_APPRAISAL") as HTMLElement);
    await userEvent.clear(manager.getByLabelText("Weight"));
    await userEvent.type(manager.getByLabelText("Weight"), "30");
    await userEvent.click(
      screen.getByRole("button", { name: "Save the whole set" }),
    );
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0]).toEqual({
      OBJECTIVES: 4000,
      TASKS: 0,
      CORE_COMPETENCY: 2500,
      BEHAVIOURAL_COMPETENCY: 2000,
      LEADERSHIP: 1500,
      MANAGER_APPRAISAL: 3000,
      SELF_ASSESSMENT: 0,
    });
  });

  it("can be renamed like any part, and the company's own name is what the switch card uses", async () => {
    serve(withManager(0, "Line view"), NOTE);
    mount("marks");
    expect(
      screen.getByText(
        /except for managers in a period that weights Line view: they have to give one/,
      ),
    ).toBeInTheDocument();
  });
});

describe("a server that predates the part", () => {
  it("draws six rows and no sentence about it", () => {
    serve(baseRows());
    mount();
    expect(document.querySelectorAll("[data-part]")).toHaveLength(6);
    expect(row("MANAGER_APPRAISAL")).toBeNull();
    expect(screen.queryByText(/Manager appraisal/)).toBeNull();
  });

  it("sends six keys and none for the part, so nothing is written over a weight set elsewhere", async () => {
    serve(baseRows());
    mount();
    const objectives = within(row("OBJECTIVES") as HTMLElement);
    await userEvent.clear(objectives.getByLabelText("Weight"));
    await userEvent.type(objectives.getByLabelText("Weight"), "50");
    await userEvent.click(
      screen.getByRole("button", { name: "Save the whole set" }),
    );
    expect(save).toHaveBeenCalledTimes(1);
    const payload = save.mock.calls[0]?.[0] as Record<string, number>;
    expect("MANAGER_APPRAISAL" in payload).toBe(false);
    expect(Object.keys(payload)).toHaveLength(6);
    expect(payload.OBJECTIVES).toBe(5000);
  });

  it("keeps the switch card's old words, which were true of that server", () => {
    serve(baseRows());
    mount("marks");
    expect(
      screen.getByText(
        "The person picks one of the names below after the questions. It is optional. A manager's overall mark is shown beside the score and is not counted in it.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/have to give one/)).toBeNull();
  });
});
