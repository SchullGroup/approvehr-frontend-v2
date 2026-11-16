import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiCycle,
  ApiScoringWeights,
  WeightSet,
} from "@/lib/api/performance";

/**
 * The two places a period's weights are chosen: the new-period wizard and the
 * draft period's own settings. The company's parts in Settings have their own
 * file, `scoring-parts-settings.test.tsx`.
 *
 * Stores are mocked at the hook, so what is asserted is what each screen
 * *sends*, in basis points, and what it refuses before sending.
 */

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
  selfAssessmentNote: "Self-assessment is weighted at 0%.",
};

/* What `useScoringWeights` hands back; a test may swap it for a failed load. */
let companySet: { weights: ApiScoringWeights | null; error: unknown } = {
  weights: defaults,
  error: null,
};

const save = vi.fn();
const createCycle = vi.fn();
const updateCycle = vi.fn();
const addQuestion = vi.fn();

vi.mock("@/lib/permissions", () => ({ useCan: () => true }));
vi.mock("@/lib/demo", () => ({ sourceNote: () => null }));
vi.mock("@/hooks/use-url-tab", () => ({
  useUrlTab: (initial: string) => [initial, () => undefined],
}));
vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/components/portal/load-failure", () => ({
  LoadFailure: () => null,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/store/ai", () => ({
  useAssistantAvailable: () => ({
    loading: false,
    available: true,
    reason: null,
  }),
  usePeriodGoalDraft: () => ({
    loading: false,
    error: null,
    outcome: {
      available: true,
      suggestions: [],
      groundedIn: { summary: "the description", facts: [] },
    },
    ask: vi.fn().mockResolvedValue(undefined),
  }),
  usePeriodQuestionDraft: () => ({
    loading: false,
    error: null,
    outcome: {
      available: true,
      suggestions: [],
      groundedIn: { summary: "the description", facts: [] },
    },
    ask: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock("@/lib/store/performance", () => ({
  useScoringWeights: () => ({
    weights: companySet.weights,
    loading: false,
    error: companySet.error,
    source: "api",
    editable: true,
    refusal: "",
    save,
    reload: vi.fn(),
  }),
  useCycleMutations: () => ({ createCycle, updateCycle, addQuestion }),
  useKpiMutations: () => ({ createGoal: vi.fn(), addKeyResult: vi.fn() }),
}));

const { DraftPeriodWizard } =
  await import("@/app/(app)/performance/periods/new/draft-wizard");
const { PeriodWeightsSection } =
  await import("@/app/(app)/performance/periods/[id]/period-weights-section");

beforeEach(() => {
  vi.clearAllMocks();
  companySet = { weights: defaults, error: null };
  createCycle.mockResolvedValue({ id: "c-1" });
  updateCycle.mockResolvedValue({});
});

/* The set a server from before Manager appraisal sends: six parts and no key for
   the seventh. Every case here is the older-server case, and has to stay six. */
const BP: WeightSet = {
  OBJECTIVES: 2500,
  TASKS: 1500,
  CORE_COMPETENCY: 2500,
  BEHAVIOURAL_COMPETENCY: 2000,
  LEADERSHIP: 1500,
  SELF_ASSESSMENT: 0,
};

const cycle = (over: Partial<ApiCycle> = {}): ApiCycle =>
  ({
    id: "c-9",
    name: "H1 2027",
    stage: "DRAFT",
    weights: {
      values: { ...BP, OBJECTIVES: 4000, TASKS: 0 },
      basis: "company",
    },
    ...over,
  }) as unknown as ApiCycle;

describe("the new-period wizard", () => {
  const toReview = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(
      screen.getByPlaceholderText("H1 2027 appraisal"),
      "H1 2027",
    );
    await user.type(
      screen.getByPlaceholderText(/Half-year review/),
      "Half-year review for the whole company, delivery first.",
    );
  };

  it("pre-fills from the company defaults, and blocks Draft it only for a bad row", async () => {
    const user = userEvent.setup();
    render(<DraftPeriodWizard />);
    await toReview(user);
    const draftIt = screen.getByRole("button", { name: /Draft it/ });
    expect(draftIt).toBeEnabled();
    /* A total other than 100% is fine: weights are proportional. */
    await user.clear(screen.getByLabelText("Weekly tasks"));
    await user.type(screen.getByLabelText("Weekly tasks"), "10");
    expect(draftIt).toBeEnabled();
    await user.clear(screen.getByLabelText("Weekly tasks"));
    await user.type(screen.getByLabelText("Weekly tasks"), "150");
    expect(
      screen.getByText("Each weight is a whole number from 0 to 100."),
    ).toBeInTheDocument();
    expect(draftIt).toBeDisabled();
  });

  it("sends the weights, in basis points, when the period is created", async () => {
    const user = userEvent.setup();
    render(<DraftPeriodWizard />);
    await toReview(user);
    await user.clear(screen.getByLabelText("Delivery against objectives"));
    await user.type(screen.getByLabelText("Delivery against objectives"), "25");
    await user.clear(screen.getByLabelText("Weekly tasks"));
    await user.type(screen.getByLabelText("Weekly tasks"), "15");
    await user.click(screen.getByRole("button", { name: /Draft it/ }));
    // goals -> questions -> review
    for (const label of [/Next|Continue|Questions/i, /Next|Continue|Review/i]) {
      await user.click(await screen.findByRole("button", { name: label }));
    }
    await user.click(
      await screen.findByRole("button", { name: /^Create H1 2027/ }),
    );
    await waitFor(() => expect(createCycle).toHaveBeenCalledTimes(1));
    expect(createCycle.mock.calls[0]![2]).toMatchObject({ weights: BP });
  });

  const createIt = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: /Draft it/ }));
    for (const label of [/Next|Continue|Questions/i, /Next|Continue|Review/i]) {
      await user.click(await screen.findByRole("button", { name: label }));
    }
    await user.click(
      await screen.findByRole("button", { name: /^Create H1 2027/ }),
    );
    await waitFor(() => expect(createCycle).toHaveBeenCalledTimes(1));
  };

  it("does not hold up untouched company defaults, and sends no weights for them", async () => {
    /* Settings takes two decimals, so a company can hold 33.33 / 33.33 / 33.34.
       Left alone, the period follows the company; the whole-percent rule is
       for a set somebody types here. */
    companySet = {
      weights: {
        ...defaults,
        rows: defaults.rows.map((row) => ({
          ...row,
          weightBp:
            row.component === "OBJECTIVES" ||
            row.component === "CORE_COMPETENCY"
              ? 3333
              : row.component === "BEHAVIOURAL_COMPETENCY"
                ? 3334
                : 0,
        })),
      },
      error: null,
    };
    const user = userEvent.setup();
    render(<DraftPeriodWizard />);
    await toReview(user);
    expect(screen.getByRole("button", { name: /Draft it/ })).toBeEnabled();
    await createIt(user);
    expect(createCycle.mock.calls[0]![2] ?? {}).not.toHaveProperty("weights");
  });

  it("says so when the weights did not load, and still lets the period be drafted", async () => {
    const { ApiError } = await import("@/lib/api/client");
    companySet = {
      weights: null,
      error: new ApiError(500, "INTERNAL", "Down."),
    };
    const user = userEvent.setup();
    render(<DraftPeriodWizard />);
    await toReview(user);
    expect(
      screen.getByText("The weights have not loaded."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Draft it/ })).toBeEnabled();
    await createIt(user);
    expect(createCycle.mock.calls[0]![2] ?? {}).not.toHaveProperty("weights");
  });
});

describe("a period's own settings", () => {
  it("PATCHes the weights on a draft", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    render(<PeriodWeightsSection period={cycle()} onChanged={onChanged} />);
    await user.clear(screen.getByLabelText("Delivery against objectives"));
    await user.type(screen.getByLabelText("Delivery against objectives"), "25");
    await user.clear(screen.getByLabelText("Weekly tasks"));
    await user.type(screen.getByLabelText("Weekly tasks"), "15");
    await user.click(screen.getByRole("button", { name: "Save the weights" }));
    await waitFor(() =>
      expect(updateCycle).toHaveBeenCalledWith("c-9", { weights: BP }),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it("allows a total other than 100, and keeps Save off for a bad row", async () => {
    const user = userEvent.setup();
    render(<PeriodWeightsSection period={cycle()} onChanged={vi.fn()} />);
    await user.clear(screen.getByLabelText("Weekly tasks"));
    await user.type(screen.getByLabelText("Weekly tasks"), "5");
    expect(
      screen.getByRole("button", { name: "Save the weights" }),
    ).toBeEnabled();
    await user.clear(screen.getByLabelText("Weekly tasks"));
    await user.type(screen.getByLabelText("Weekly tasks"), "2.5");
    expect(
      screen.getByRole("button", { name: "Save the weights" }),
    ).toBeDisabled();
  });

  it("'Use the company defaults' sends weights: null", async () => {
    const user = userEvent.setup();
    render(
      <PeriodWeightsSection
        period={cycle({ weights: { values: BP, basis: "period" } })}
        onChanged={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Use the company defaults" }),
    );
    await waitFor(() =>
      expect(updateCycle).toHaveBeenCalledWith("c-9", { weights: null }),
    );
  });

  it("a reset that lands on the same set clears what was typed", async () => {
    const user = userEvent.setup();
    render(<PeriodWeightsSection period={cycle()} onChanged={vi.fn()} />);
    await user.clear(screen.getByLabelText("Weekly tasks"));
    await user.type(screen.getByLabelText("Weekly tasks"), "10");
    await user.click(
      screen.getByRole("button", { name: "Use the company defaults" }),
    );
    await waitFor(() => expect(updateCycle).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByLabelText("Weekly tasks")).toHaveValue(0),
    );
    expect(
      screen.getByRole("button", { name: "Save the weights" }),
    ).toBeDisabled();
  });

  it("says which set a draft is using", () => {
    const { unmount } = render(
      <PeriodWeightsSection period={cycle()} onChanged={vi.fn()} />,
    );
    expect(screen.getByText("Using the company defaults.")).toBeInTheDocument();
    unmount();
    render(
      <PeriodWeightsSection
        period={cycle({ weights: { values: BP, basis: "period" } })}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getByText("Set for this period.")).toBeInTheDocument();
  });

  it("shows the server's 409 message if one comes back", async () => {
    const { ApiError } = await import("@/lib/api/client");
    updateCycle.mockRejectedValue(
      new ApiError(
        409,
        "CONFLICT",
        "The weights were fixed when this period started.",
      ),
    );
    const user = userEvent.setup();
    render(<PeriodWeightsSection period={cycle()} onChanged={vi.fn()} />);
    await user.clear(screen.getByLabelText("Weekly tasks"));
    await user.type(screen.getByLabelText("Weekly tasks"), "10");
    await user.clear(screen.getByLabelText("Delivery against objectives"));
    await user.type(screen.getByLabelText("Delivery against objectives"), "30");
    await user.click(screen.getByRole("button", { name: "Save the weights" }));
    expect(
      await screen.findByText(
        "The weights were fixed when this period started.",
      ),
    ).toBeInTheDocument();
  });

  it("is read-only after the period has started", () => {
    render(
      <PeriodWeightsSection
        period={cycle({
          stage: "SELF",
          weights: { values: BP, basis: "frozen" },
        })}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
    expect(
      screen.getByText("Fixed when this period started."),
    ).toBeInTheDocument();
    const row = screen
      .getByText("Weekly tasks")
      .closest("[data-weight-row]") as HTMLElement;
    expect(within(row).getByText("15%")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save the weights" }),
    ).not.toBeInTheDocument();
  });

  it("says a started period without a snapshot follows the company today", () => {
    render(
      <PeriodWeightsSection
        period={cycle({
          stage: "SELF",
          weights: { values: BP, basis: "company" },
        })}
        onChanged={vi.fn()}
      />,
    );
    expect(
      screen.queryByText("Fixed when this period started."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "This period follows the company's weights as they are today.",
      ),
    ).toBeInTheDocument();
  });

  it("renders nothing for a period from an API that sends no weights", () => {
    const { container } = render(
      <PeriodWeightsSection
        period={cycle({ weights: undefined })}
        onChanged={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(
      screen.queryByText("How the mark is made up"),
    ).not.toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */

/**
 * The same three places, against a server that has Manager appraisal.
 *
 * Everything above is the older server's case: six parts, six keys sent, no row
 * for the seventh. These are the other half. The part is drawn only where the
 * server spoke of it, and what is sent carries it only then, so neither half can
 * silently write a weight the other would drop.
 */
describe("with the Manager appraisal part", () => {
  const withManager = (managerBp = 0): ApiScoringWeights => ({
    ...defaults,
    rows: [
      ...defaults.rows.slice(0, 5),
      {
        component: "MANAGER_APPRAISAL",
        label: "Manager appraisal",
        weightBp: managerBp,
      },
      ...defaults.rows.slice(5),
    ],
  });
  const SEVEN: WeightSet = { ...BP, MANAGER_APPRAISAL: 0 };

  beforeEach(() => {
    companySet = { weights: withManager(), error: null };
  });

  it("the wizard: pre-fills the row from the company defaults and sends it when the period is created", async () => {
    const user = userEvent.setup();
    render(<DraftPeriodWizard />);
    await user.type(
      screen.getByPlaceholderText("H1 2027 appraisal"),
      "H1 2027",
    );
    await user.type(
      screen.getByPlaceholderText(/Half-year review/),
      "Half-year review for the whole company, delivery first.",
    );
    expect(screen.getByLabelText("Manager appraisal")).toHaveValue(0);
    await user.clear(screen.getByLabelText("Delivery against objectives"));
    await user.type(screen.getByLabelText("Delivery against objectives"), "25");
    await user.clear(screen.getByLabelText("Weekly tasks"));
    await user.type(screen.getByLabelText("Weekly tasks"), "15");
    await user.clear(screen.getByLabelText("Manager appraisal"));
    await user.type(screen.getByLabelText("Manager appraisal"), "30");
    await user.click(screen.getByRole("button", { name: /Draft it/ }));
    for (const label of [/Next|Continue|Questions/i, /Next|Continue|Review/i]) {
      await user.click(await screen.findByRole("button", { name: label }));
    }
    await user.click(
      await screen.findByRole("button", { name: /^Create H1 2027/ }),
    );
    await waitFor(() => expect(createCycle).toHaveBeenCalledTimes(1));
    expect(createCycle.mock.calls[0]![2]).toMatchObject({
      weights: { ...BP, MANAGER_APPRAISAL: 3000 },
    });
  });

  it("a draft period: PATCHes the seventh weight with the rest", async () => {
    const user = userEvent.setup();
    render(
      <PeriodWeightsSection
        period={cycle({ weights: { values: SEVEN, basis: "company" } })}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Manager appraisal")).toHaveValue(0);
    await user.clear(screen.getByLabelText("Manager appraisal"));
    await user.type(screen.getByLabelText("Manager appraisal"), "30");
    await user.click(screen.getByRole("button", { name: "Save the weights" }));
    await waitFor(() =>
      expect(updateCycle).toHaveBeenCalledWith("c-9", {
        weights: { ...SEVEN, MANAGER_APPRAISAL: 3000 },
      }),
    );
  });

  it("a draft period from a server that has no such part sends six keys and draws six rows", async () => {
    const user = userEvent.setup();
    companySet = { weights: defaults, error: null };
    render(
      <PeriodWeightsSection
        period={cycle({ weights: { values: BP, basis: "company" } })}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("Manager appraisal")).toBeNull();
    /* Different from what the period holds, or there is nothing to save. */
    await user.clear(screen.getByLabelText("Weekly tasks"));
    await user.type(screen.getByLabelText("Weekly tasks"), "10");
    await user.click(screen.getByRole("button", { name: "Save the weights" }));
    await waitFor(() => expect(updateCycle).toHaveBeenCalledTimes(1));
    const sent = updateCycle.mock.calls[0]![1] as { weights: object };
    expect("MANAGER_APPRAISAL" in sent.weights).toBe(false);
    expect(Object.keys(sent.weights)).toHaveLength(6);
  });

  it("a started period shows the seventh part's weight, read only", () => {
    render(
      <PeriodWeightsSection
        period={cycle({
          stage: "SELF",
          weights: {
            values: { ...SEVEN, MANAGER_APPRAISAL: 3000 },
            basis: "frozen",
          },
        })}
        onChanged={vi.fn()}
      />,
    );
    const row = screen
      .getByText("Manager appraisal")
      .closest("[data-weight-row]") as HTMLElement;
    expect(within(row).getByText("30%")).toBeInTheDocument();
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
  });
  it("a draft period draws the API's sentence about its own weights, and says it is about the saved set once something is typed", async () => {
    const user = userEvent.setup();
    render(
      <PeriodWeightsSection
        period={cycle({
          weights: { values: SEVEN, basis: "company" },
          managerAppraisalNote: "THE PERIOD'S NOTE",
        })}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getAllByText("THE PERIOD'S NOTE")).toHaveLength(1);
    expect(screen.queryByText(/Saved now, not yet changed/)).toBeNull();
    await user.clear(screen.getByLabelText("Manager appraisal"));
    await user.type(screen.getByLabelText("Manager appraisal"), "30");
    expect(screen.getByText(/Saved now, not yet changed:/)).toBeInTheDocument();
    expect(screen.getAllByText("THE PERIOD'S NOTE")).toHaveLength(1);
  });

  it("a started period draws it too, with nothing about saving", () => {
    render(
      <PeriodWeightsSection
        period={cycle({
          stage: "SELF",
          weights: {
            values: { ...SEVEN, MANAGER_APPRAISAL: 3000 },
            basis: "frozen",
          },
          managerAppraisalNote: "THE PERIOD'S NOTE",
        })}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getByText("THE PERIOD'S NOTE")).toBeInTheDocument();
    expect(screen.queryByText(/Saved now, not yet changed/)).toBeNull();
  });

  it("says nothing where the server sends no note", async () => {
    const user = userEvent.setup();
    render(
      <PeriodWeightsSection
        period={cycle({ weights: { values: SEVEN, basis: "company" } })}
        onChanged={vi.fn()}
      />,
    );
    await user.clear(screen.getByLabelText("Manager appraisal"));
    await user.type(screen.getByLabelText("Manager appraisal"), "30");
    /* Typed over, and still nothing to say it is about the saved set: there is
       no sentence for it to be about. */
    expect(screen.queryByText(/Saved now, not yet changed/)).toBeNull();
  });
});
