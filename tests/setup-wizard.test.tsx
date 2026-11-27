import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiScoringWeights, ScoreComponent } from "@/lib/api/performance";

/**
 * The first-time set-up asks what counts, how much, and what is rated, one
 * screen at a time, and starts from what the company is scored on today.
 *
 * `useScoringWeights` is the real hook over a mocked API on purpose. The test that
 * used to stand here mocked the hook to answer before the first render, which is
 * the one thing the real one cannot do, and so it passed while the wizard ignored
 * everything the company had saved (F4).
 *
 * It never asks for a total: the last weight is worked out from the others, so
 * the weights add up to 100 and Continue is never refused over a figure. Tasks
 * done is shown as unavailable, with the reason, where there is no Projects to
 * do tasks in.
 */

const session = vi.hoisted(() => ({ isConnected: true }));
vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => session,
}));

const gate = vi.hoisted(() => ({ enabled: true, loading: false }));
vi.mock("@/lib/store/project-session", async (original) => ({
  ...(await original<typeof import("@/lib/store/project-session")>()),
  useProjectsGate: () => gate,
}));

const api = vi.hoisted(() => ({
  scoringWeights: vi.fn(),
  scoringParts: vi.fn(),
  setScoringWeights: vi.fn(),
  deleteScoringPart: vi.fn(),
}));
vi.mock("@/lib/api/performance", async (original) => ({
  ...(await original<typeof import("@/lib/api/performance")>()),
  performanceApi: api,
}));

const framework = vi.hoisted(() => ({
  createCompetency: vi.fn(),
  updateCompetency: vi.fn(),
  reload: vi.fn(),
  sections: [] as { id: string; component: string }[],
  competencies: [] as {
    id: string;
    name: string;
    active: boolean;
    archived: boolean;
    sectionId: string;
  }[],
}));
vi.mock("@/lib/store/performance", async (original) => ({
  ...(await original<typeof import("@/lib/store/performance")>()),
  useSections: () => ({
    sections: framework.sections,
    loading: false,
    reload: framework.reload,
  }),
  useFramework: () => ({
    competencies: framework.competencies,
    reload: framework.reload,
  }),
  useFrameworkActions: () => framework,
}));

const { SetupWizard } =
  await import("@/app/(app)/performance/setup/setup-wizard");

type Row = ApiScoringWeights["rows"][number];

const BUILT_IN: Record<ScoreComponent, { label: string; description: string }> =
  {
    OBJECTIVES: {
      label: "Delivery against objectives",
      description: "Progress on the objectives agreed for the cycle.",
    },
    TASKS: {
      label: "Weekly tasks",
      description:
        "How the weekly tasks graded against this period's objectives were rated.",
    },
    CORE_COMPETENCY: {
      label: "Core competencies",
      description: "Ratings against competencies filed under Core competency.",
    },
    BEHAVIOURAL_COMPETENCY: {
      label: "Behavioural competencies",
      description:
        "Ratings against competencies filed under Behavioural competency.",
    },
    LEADERSHIP: {
      label: "Leadership",
      description: "Ratings under Leadership, for people who lead others.",
    },
    MANAGER_APPRAISAL: {
      label: "Manager appraisal",
      description: "The overall mark each appraiser gave.",
    },
    SELF_ASSESSMENT: {
      label: "Self-assessment",
      description: "How somebody rated themselves.",
    },
  };

/** The seven rows the API always sends, in its order, with the weights given. */
function rows(
  weightsBp: Partial<Record<ScoreComponent, number>>,
  own: Partial<Record<ScoreComponent, Partial<Row>>> = {},
): Row[] {
  return (Object.keys(BUILT_IN) as ScoreComponent[]).map((component) => ({
    component,
    label: BUILT_IN[component].label,
    defaultLabel: BUILT_IN[component].label,
    description: BUILT_IN[component].description,
    defaultDescription: BUILT_IN[component].description,
    weightBp: weightsBp[component] ?? 0,
    isPart: component in weightsBp,
    ...own[component],
  }));
}

const weights = (
  rowsOf: Row[],
  source: "saved" | "default" = "saved",
): ApiScoringWeights => ({
  source,
  rows: rowsOf,
  totalBp: rowsOf.reduce((sum, row) => sum + row.weightBp, 0),
  selfAssessmentNote: "",
});

/** Six parts the company saved: 20, 20, 20, 15, 10, 15. */
const SAVED_SIX: Partial<Record<ScoreComponent, number>> = {
  OBJECTIVES: 2000,
  CORE_COMPETENCY: 2000,
  BEHAVIOURAL_COMPETENCY: 2000,
  LEADERSHIP: 1500,
  MANAGER_APPRAISAL: 1000,
  SELF_ASSESSMENT: 1500,
};
const SIX_PARTS = Object.keys(SAVED_SIX) as ScoreComponent[];

/** Four parts at the built-in weights, which a company that never chose is on. */
const BUILT_IN_FOUR: Partial<Record<ScoreComponent, number>> = {
  OBJECTIVES: 4000,
  CORE_COMPETENCY: 2500,
  BEHAVIOURAL_COMPETENCY: 2000,
  LEADERSHIP: 1500,
};

const parts = (...sources: ScoreComponent[]) => ({
  parts: sources.map((source) => ({
    id: `part-${source}`,
    source,
    name: BUILT_IN[source].label,
    weightBp: 0,
  })),
});

const refusal = (message: string) =>
  new ApiError(422, "unprocessable", message);

const open = () =>
  render(<SetupWizard open onClose={() => {}} onDone={() => {}} />);

const choice = (name: RegExp | string) => screen.findByRole("button", { name });

const pressed = (button: HTMLElement) => button.getAttribute("aria-pressed");

type User = ReturnType<typeof userEvent.setup>;

async function setWeights(user: User, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) {
    const field = screen.getByLabelText(name);
    await user.clear(field);
    await user.type(field, value);
  }
}

/* The last ticked part is shown and not typed: it is what the others leave. With
   Self-assessment and Manager appraisal off, that is Leadership, so 40 + 25 + 20
   typed is 15 for it, which is what the company had. */
const THREE_AT_40_25_20 = {
  "Delivery against objectives": "40",
  "Core competencies": "25",
  "Behavioural competencies": "20",
};

beforeEach(() => {
  /* Reset, not only clear: a refusal queued with `mockRejectedValueOnce` that a
     test never reached would otherwise answer the next test's first write. */
  vi.resetAllMocks();
  session.isConnected = true;
  gate.enabled = true;
  gate.loading = false;
  framework.sections = [];
  framework.competencies = [];
  api.scoringWeights.mockResolvedValue(weights(rows(SAVED_SIX)));
  api.scoringParts.mockResolvedValue(parts(...SIX_PARTS));
  api.setScoringWeights.mockResolvedValue({ saved: true });
  api.deleteScoringPart.mockResolvedValue(undefined);
  framework.createCompetency.mockResolvedValue(undefined);
  framework.updateCompetency.mockResolvedValue(undefined);
});

describe("where it starts", () => {
  it("is what the company saved, even though the answer arrives after the first render", async () => {
    const user = userEvent.setup();
    open();
    expect(pressed(await choice(/Delivery against objectives/))).toBe("true");
    for (const name of [
      /Core competencies/,
      /Behavioural competencies/,
      /Leadership/,
      /Manager appraisal/,
      /Self-assessment/,
    ]) {
      expect(pressed(await choice(name))).toBe("true");
    }
    expect(pressed(await choice(/Tasks done/))).toBe("false");

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("Delivery against objectives")).toHaveValue(
      20,
    );
    expect(screen.getByLabelText("Core competencies")).toHaveValue(20);
    expect(screen.getByLabelText("Leadership")).toHaveValue(15);
    expect(screen.getByLabelText("Manager appraisal")).toHaveValue(10);
    expect(screen.getByLabelText("Self-assessment")).toHaveValue(15);
    expect(screen.getByTestId("pie-total")).toHaveTextContent("100%");
  });

  it("shows no questions while what the company has is on its way, so nothing can start from defaults", async () => {
    let arrive: (value: ApiScoringWeights) => void = () => undefined;
    api.scoringWeights.mockReturnValue(
      new Promise<ApiScoringWeights>((resolve) => {
        arrive = resolve;
      }),
    );
    open();
    expect(
      screen.queryByRole("button", { name: /Delivery against objectives/ }),
    ).not.toBeInTheDocument();
    arrive(weights(rows(SAVED_SIX)));
    expect(await choice(/Delivery against objectives/)).toBeInTheDocument();
  });

  it("says when it could not read them, offers to try again, and opens no questions on defaults", async () => {
    const user = userEvent.setup();
    api.scoringWeights.mockRejectedValueOnce(
      new ApiError(500, "server", "Something broke."),
    );
    open();
    const retry = await screen.findByRole("button", { name: /try again/i });
    expect(
      screen.queryByRole("button", { name: /Delivery against objectives/ }),
    ).not.toBeInTheDocument();
    await user.click(retry);
    expect(await choice(/Delivery against objectives/)).toBeInTheDocument();
    expect(api.scoringWeights).toHaveBeenCalledTimes(2);
  });

  it("is the built-in weights for a company that has chosen nothing, and an untouched default re-splits evenly", async () => {
    const user = userEvent.setup();
    api.scoringWeights.mockResolvedValue(
      weights(rows(BUILT_IN_FOUR), "default"),
    );
    open();
    expect(pressed(await choice(/Delivery against objectives/))).toBe("true");
    expect(pressed(await choice(/Manager appraisal/))).toBe("false");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("Delivery against objectives")).toHaveValue(
      40,
    );
    expect(screen.getByLabelText("Leadership")).toHaveValue(15);

    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(await choice(/Manager appraisal/));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    for (const name of [
      "Delivery against objectives",
      "Core competencies",
      "Behavioural competencies",
      "Leadership",
      "Manager appraisal",
    ]) {
      expect(screen.getByLabelText(name)).toHaveValue(20);
    }
  });

  it("keeps the numbers a company chose when another part is ticked, and the new part starts without one", async () => {
    const user = userEvent.setup();
    api.scoringWeights.mockResolvedValue(
      weights(
        rows({
          OBJECTIVES: 4500,
          CORE_COMPETENCY: 2500,
          BEHAVIOURAL_COMPETENCY: 1500,
          LEADERSHIP: 1500,
        }),
      ),
    );
    open();
    await user.click(await choice(/Self-assessment/));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("Delivery against objectives")).toHaveValue(
      45,
    );
    expect(screen.getByLabelText("Core competencies")).toHaveValue(25);
    /* The new part is the last, so it is what the others leave, and the others
       were already 100: it starts with nothing. */
    expect(screen.getByLabelText("Self-assessment")).toHaveValue(0);
    expect(screen.getByLabelText("Self-assessment")).toHaveAttribute(
      "readonly",
    );
    /* It adds up to 100 and still cannot go on: a ticked part with nothing to
       count for would be saved as no part. */
    expect(screen.getByTestId("pie-total")).toHaveTextContent("100%");
    expect(
      screen.getByText(/Self-assessment needs a share/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    /* Taking 10 off another part is how it is given one. */
    await setWeights(user, { "Delivery against objectives": "35" });
    expect(screen.getByLabelText("Self-assessment")).toHaveValue(10);
    expect(screen.queryByText(/needs a share/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("works the last weight out, so the total is 100 and Continue is never refused", async () => {
    const user = userEvent.setup();
    api.scoringWeights.mockResolvedValue(
      weights(rows(BUILT_IN_FOUR), "default"),
    );
    open();
    await choice(/Delivery against objectives/);
    await user.click(screen.getByRole("button", { name: "Continue" }));

    /* The last one is shown, not typed. */
    expect(screen.getByLabelText("Leadership")).toHaveAttribute("readonly");
    const first = screen.getByLabelText("Delivery against objectives");
    await user.clear(first);
    await user.type(first, "50");

    /* 50 + 25 + 20 of the rest, so 5 is what is left for the last. */
    expect(screen.getByLabelText("Leadership")).toHaveValue(5);
    expect(screen.getByTestId("pie-total")).toHaveTextContent("100%");
    expect(screen.queryByText(/off somewhere|more somewhere/)).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("holds a box to what the others have left, and never to more than 100", async () => {
    const user = userEvent.setup();
    api.scoringWeights.mockResolvedValue(
      weights(rows(BUILT_IN_FOUR), "default"),
    );
    open();
    await choice(/Delivery against objectives/);
    await user.click(screen.getByRole("button", { name: "Continue" }));

    const first = screen.getByLabelText("Delivery against objectives");
    await user.clear(first);
    await user.type(first, "90");

    /* The other two typed parts hold 25 + 20, so 55 is the most this can have. */
    expect(first).toHaveValue(55);
    expect(screen.getByLabelText("Leadership")).toHaveValue(0);
    expect(screen.getByTestId("pie-total")).toHaveTextContent("100%");
    /* Nothing is left for the last part, which would be saved as no part at all,
       so it says so and does not go on. */
    expect(screen.getByText(/Leadership needs a share/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("counts an empty box as 0, works the last out from it, and holds Save with the reason until the part has a share", async () => {
    const user = userEvent.setup();
    api.scoringWeights.mockResolvedValue(
      weights(rows(BUILT_IN_FOUR), "default"),
    );
    open();
    await choice(/Delivery against objectives/);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.clear(screen.getByLabelText("Core competencies"));
    expect(screen.getByLabelText("Leadership")).toHaveValue(40);
    /* An emptied box is a part with nothing to count for, which would be saved as
       no part, so it is named and Save waits for a share. */
    expect(
      screen.getByText(/Core competencies needs a share/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.type(screen.getByLabelText("Core competencies"), "10");
    expect(screen.queryByText(/needs a share/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});

describe("what each choice is called and says", () => {
  it("is what Settings says: the name and the description the API sent", async () => {
    open();
    const delivery = await choice(/Delivery against objectives/);
    expect(
      within(delivery).getByText(
        "Progress on the objectives agreed for the cycle.",
      ),
    ).toBeInTheDocument();
    expect(
      within(await choice(/Self-assessment/)).getByText(
        "How somebody rated themselves.",
      ),
    ).toBeInTheDocument();
    /* None of the old wizard-only names. */
    expect(screen.queryByText("Objectives they delivered")).toBeNull();
    expect(screen.queryByText("Behaviour")).toBeNull();
  });

  it("is the company's own name and description where it wrote them", async () => {
    api.scoringWeights.mockResolvedValue(
      weights(
        rows(SAVED_SIX, {
          SELF_ASSESSMENT: {
            label: "Their own rating",
            description: "What they say of themselves.",
          },
        }),
      ),
    );
    open();
    const own = await choice(/Their own rating/);
    expect(
      within(own).getByText("What they say of themselves."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Self-assessment")).toBeNull();
  });

  it("calls a tasks part nobody named Tasks done, and never describes weekly grading", async () => {
    open();
    const tasks = await choice(/Tasks done/);
    expect(
      within(tasks).getByText(/tasks finished in Projects/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Weekly tasks/)).toBeNull();
    expect(screen.queryByText(/weekly tasks graded/)).toBeNull();
  });

  it("keeps the name a company gave its tasks part", async () => {
    api.scoringWeights.mockResolvedValue(
      weights(
        rows(SAVED_SIX, {
          TASKS: { label: "Work shipped", description: "What got shipped." },
        }),
      ),
    );
    open();
    const tasks = await choice(/Work shipped/);
    expect(within(tasks).getByText("What got shipped.")).toBeInTheDocument();
    expect(screen.queryByText("Tasks done")).toBeNull();
  });

  it("does not offer a part the server sent no row for", async () => {
    api.scoringWeights.mockResolvedValue(
      weights(
        rows(SAVED_SIX).filter((row) => row.component !== "MANAGER_APPRAISAL"),
      ),
    );
    open();
    await choice(/Delivery against objectives/);
    expect(
      screen.queryByRole("button", { name: /Manager appraisal/ }),
    ).toBeNull();
  });
});

describe("Tasks done, with Projects off", () => {
  beforeEach(() => {
    gate.enabled = false;
  });

  it("is offered as unavailable, with the reason on the page, and cannot be ticked", async () => {
    const user = userEvent.setup();
    open();
    const tasks = await choice(/Tasks done/);
    expect(tasks).toBeDisabled();
    expect(
      within(tasks).getByText(
        "Needs Projects, which is switched off for your company.",
      ),
    ).toBeInTheDocument();
    await user.click(tasks);
    expect(pressed(tasks)).toBe("false");
  });

  it("is left out of an even split and of the weights", async () => {
    const user = userEvent.setup();
    api.scoringWeights.mockResolvedValue(
      weights(rows(BUILT_IN_FOUR), "default"),
    );
    open();
    await user.click(await choice(/Self-assessment/));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.queryByLabelText("Tasks done")).toBeNull();
    expect(screen.getByLabelText("Self-assessment")).toHaveValue(20);
  });

  it("starts unticked when it was saved with a weight, and says what saving does to it", async () => {
    api.scoringWeights.mockResolvedValue(
      weights(
        rows({
          OBJECTIVES: 2000,
          TASKS: 1600,
          CORE_COMPETENCY: 2000,
          BEHAVIOURAL_COMPETENCY: 2000,
          LEADERSHIP: 1200,
          SELF_ASSESSMENT: 1200,
        }),
      ),
    );
    open();
    const tasks = await choice(/Tasks done/);
    expect(pressed(tasks)).toBe("false");
    expect(
      within(tasks).getByText(
        /counts for nothing now, and saving here takes it off your parts/,
      ),
    ).toBeInTheDocument();
  });

  it("is offered as before while the answer is still on its way", async () => {
    gate.loading = true;
    open();
    expect(await choice(/Tasks done/)).toBeEnabled();
  });
});

describe("saving", () => {
  it("is one write of the whole set, after the company owns its parts, and takes unticked parts off afterwards", async () => {
    const user = userEvent.setup();
    const order: string[] = [];
    api.scoringParts.mockImplementation(() => {
      order.push("parts");
      return Promise.resolve(parts(...SIX_PARTS));
    });
    api.setScoringWeights.mockImplementation(() => {
      order.push("write");
      return Promise.resolve({ saved: true });
    });
    api.deleteScoringPart.mockImplementation((id: string) => {
      order.push(`delete ${id}`);
      return Promise.resolve();
    });
    open();
    /* Take Self-assessment and Manager appraisal off. */
    await user.click(await choice(/Self-assessment/));
    await user.click(await choice(/Manager appraisal/));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    /* Leadership is the last, so 30 + 30 + 25 leaves it 15. */
    await setWeights(user, {
      "Delivery against objectives": "30",
      "Core competencies": "30",
      "Behavioural competencies": "25",
    });
    expect(screen.getByLabelText("Leadership")).toHaveValue(15);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("heading", { name: "All set" });

    expect(api.setScoringWeights).toHaveBeenCalledTimes(1);
    /* Weights only. No names or descriptions go with it: a part the company named
       keeps its name, and a new one follows the built-in. */
    expect(api.setScoringWeights).toHaveBeenCalledWith(
      {
        OBJECTIVES: 3000,
        TASKS: 0,
        CORE_COMPETENCY: 3000,
        BEHAVIOURAL_COMPETENCY: 2500,
        LEADERSHIP: 1500,
        MANAGER_APPRAISAL: 0,
        SELF_ASSESSMENT: 0,
      },
      undefined,
      undefined,
    );
    /* No part is written one at a time any more. */
    expect(order).toEqual([
      "parts",
      "write",
      "delete part-MANAGER_APPRAISAL",
      "delete part-SELF_ASSESSMENT",
    ]);
  });

  it("changes nothing when the server refuses the set, says so in its own words, and can be tried again", async () => {
    const user = userEvent.setup();
    const sentence =
      "Tasks done counts the tasks done in Projects, and Projects is switched off for your company. Switch Projects on, or leave this part at 0%.";
    framework.sections = [{ id: "s1", component: "CORE_COMPETENCY" }];
    api.setScoringWeights.mockRejectedValueOnce(refusal(sentence));
    open();
    await user.click(await choice(/Self-assessment/));
    await user.click(await choice(/Manager appraisal/));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await setWeights(user, THREE_AT_40_25_20);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(sentence);
    expect(alert).toHaveTextContent("Nothing was changed.");
    /* The refusal came before anything after it. */
    expect(api.deleteScoringPart).not.toHaveBeenCalled();
    expect(framework.createCompetency).not.toHaveBeenCalled();
    expect(framework.updateCompetency).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "All set" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("heading", { name: "All set" });
    expect(api.setScoringWeights).toHaveBeenCalledTimes(2);
  });

  it("does not claim nothing changed when it cannot tell, such as a timeout", async () => {
    const user = userEvent.setup();
    api.setScoringWeights.mockRejectedValueOnce(
      new ApiError(504, "timeout", "Gateway timeout"),
    );
    open();
    await user.click(await choice(/Self-assessment/));
    await user.click(await choice(/Manager appraisal/));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await setWeights(user, THREE_AT_40_25_20);
    await user.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/not clear whether/);
    expect(alert).not.toHaveTextContent("Nothing was changed.");
  });

  it("says the weights are saved when a part cannot be taken off, leaves it at nothing, and a second Save takes off only what is left", async () => {
    const user = userEvent.setup();
    api.deleteScoringPart.mockRejectedValueOnce(
      new ApiError(500, "server", "Boom"),
    );
    open();
    await user.click(await choice(/Self-assessment/));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await setWeights(user, { Leadership: "30" });
    await user.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The weights are saved.");
    expect(alert).toHaveTextContent("Self-assessment");
    expect(alert).toHaveTextContent("stays at 0%");
    expect(screen.queryByRole("heading", { name: "All set" })).toBeNull();

    /* What the server holds now: Self-assessment is still there, at nothing. */
    api.scoringParts.mockResolvedValue(parts("SELF_ASSESSMENT"));
    api.deleteScoringPart.mockClear();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("heading", { name: "All set" });
    expect(api.deleteScoringPart).toHaveBeenCalledTimes(1);
    expect(api.deleteScoringPart).toHaveBeenCalledWith("part-SELF_ASSESSMENT");
  });

  it("treats a part that is already gone as taken off", async () => {
    const user = userEvent.setup();
    api.deleteScoringPart.mockRejectedValue(
      new ApiError(404, "not_found", "That scoring part is not there."),
    );
    open();
    await user.click(await choice(/Self-assessment/));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await setWeights(user, { Leadership: "30" });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("heading", { name: "All set" });
  });

  it("never makes the same competency change twice when Save is pressed again", async () => {
    const user = userEvent.setup();
    framework.sections = [{ id: "s1", component: "CORE_COMPETENCY" }];
    framework.competencies = [
      {
        id: "c1",
        name: "Judgement",
        active: true,
        archived: false,
        sectionId: "s1",
      },
    ];
    framework.createCompetency
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(
        new ApiError(409, "conflict", "That name is taken."),
      )
      .mockResolvedValue(undefined);
    open();
    await choice(/Delivery against objectives/);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    /* On the Core competencies page: drop Judgement, add two. */
    await user.click(screen.getByRole("button", { name: "Remove Judgement" }));
    const box = screen.getByLabelText("Add one");
    await user.type(box, "Initiative{Enter}");
    await user.type(box, "Teamwork{Enter}");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The weights are saved.");
    expect(alert).toHaveTextContent("That name is taken.");
    expect(framework.updateCompetency).toHaveBeenCalledTimes(1);
    expect(framework.createCompetency).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("heading", { name: "All set" });
    /* Judgement was switched off and Initiative made the first time: neither again. */
    expect(framework.updateCompetency).toHaveBeenCalledTimes(1);
    expect(framework.createCompetency).toHaveBeenCalledTimes(3);
    expect(framework.createCompetency).toHaveBeenLastCalledWith({
      name: "Teamwork",
      sectionId: "s1",
      scaleMax: 5,
    });
  });

  it("is refused before anything is asked when there is no server", async () => {
    const user = userEvent.setup();
    session.isConnected = false;
    open();
    await choice(/Delivery against objectives/);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/needs the API/);
    expect(api.scoringParts).not.toHaveBeenCalled();
    expect(api.setScoringWeights).not.toHaveBeenCalled();
    expect(api.deleteScoringPart).not.toHaveBeenCalled();
  });
});
