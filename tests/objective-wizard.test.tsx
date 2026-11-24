import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiGoal } from "@/lib/api/performance";
import type { DirectoryPerson } from "@/lib/types";
import {
  BLANK_OBJECTIVE,
  draftIsBlank,
  goalBodyOf,
  keyResultBodyOf,
  levelsOffered,
  newObjectiveHref,
  periodsTakingObjectives,
  safeBack,
  stepProblems,
  type ObjectiveDraft,
} from "@/lib/performance/objective-wizard";

/**
 * New objective, as a full-page wizard (owner request, 24 Nov 2026), in place
 * of the dialog that made an objective with no target in it.
 *
 * What each test pins, because a type cannot:
 *
 * - **The dialog's rules are kept.** A title of three characters, a personal
 *   objective filed in a period when one is open, the target's direction,
 *   who may be offered which rung, Due quarter starting on today's quarter.
 * - **Nothing is written twice.** The objective, its target and the send are
 *   three requests; a later one failing leaves the earlier ones written and a
 *   second press carries on.
 * - **A draft is kept if they leave**, and thrown away once it is written.
 */

const state = vi.hoisted(() => ({
  permissions: new Set<string>(),
  employeeId: "emp-head" as string | null,
  departments: [] as {
    id: string;
    name: string;
    headId: string | null;
    archived?: boolean;
  }[],
  people: [] as DirectoryPerson[],
  cycles: [] as { id: string; name: string; stage: string }[],
  periodsLoading: false,
  goals: [] as ApiGoal[],
  push: vi.fn(),
  createGoal: vi.fn(),
  addKeyResult: vi.fn(),
  updateGoal: vi.fn(),
  updateKeyResult: vi.fn(),
  submit: vi.fn(),
  fetchGoal: vi.fn(),
}));

vi.mock("@/lib/api/performance", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api/performance")>();
  return {
    ...real,
    performanceApi: {
      ...real.performanceApi,
      goal: (id: string) => state.fetchGoal(id),
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push, replace: vi.fn() }),
}));
vi.mock("@/lib/permissions", () => ({
  useCan: (permission: string) => state.permissions.has(permission),
}));
vi.mock("@/lib/store/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/session")>()),
  useSession: () => ({
    employeeId: state.employeeId,
    actingId: state.employeeId ?? "",
    user: { id: `user-${state.employeeId ?? "none"}` },
    isConnected: true,
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ flat: state.departments }),
  useHeadedDepartmentIds: () =>
    new Set(
      state.departments
        .filter((department) => department.headId === state.employeeId)
        .map((department) => department.id),
    ),
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({ employees: [], people: state.people }),
}));
vi.mock("@/lib/store/performance", () => ({
  useAppraisals: () => ({
    cycles: state.cycles,
    loading: state.periodsLoading,
  }),
  useKpis: () => ({ goals: state.goals, loading: false }),
  useKpiMutations: () => ({
    editable: true,
    createGoal: state.createGoal,
    addKeyResult: state.addKeyResult,
    updateGoal: state.updateGoal,
    updateKeyResult: state.updateKeyResult,
  }),
  useObjectiveMutations: () => ({ submit: state.submit }),
}));
vi.mock("@/lib/store/ai", () => ({
  useAssistantAvailable: () => ({ available: false, loading: false }),
  useObjectiveSuggestions: () => ({
    loading: false,
    ask: vi.fn(),
    clear: vi.fn(),
  }),
}));

const { ObjectiveWizard } =
  await import("@/app/(app)/performance/kpis/new/objective-wizard");
const { resetObjectiveDrafts } = await import("@/lib/store/objective-draft");

const person = (
  id: string,
  fullName: string,
  over: Partial<DirectoryPerson> = {},
): DirectoryPerson =>
  ({
    id,
    fullName,
    jobTitle: "Analyst",
    department: "Engineering",
    departmentId: "d-eng",
    managerId: null,
    ...over,
  }) as DirectoryPerson;

const madeGoal = (over: Partial<ApiGoal> = {}): ApiGoal =>
  ({
    id: "g-new",
    title: "Fill the two Lagos roles",
    description: null,
    ownerId: "emp-head",
    ownerName: "Adaeze Okonkwo",
    departmentId: null,
    departmentName: null,
    level: "personal",
    companyWide: false,
    parentId: null,
    parentTitle: null,
    status: "ON_TRACK",
    progress: 0,
    measuredProgress: null,
    keyResults: [],
    approval: "DRAFT",
    approvalLabel: "Draft",
    reviewCycleId: "c-h2",
    reviewCycleName: "H2 2026 Appraisal",
    dueQuarter: "2026-Q4",
    createdAt: "2026-10-21T09:00:00.000Z",
    updatedAt: "2026-10-21T09:00:00.000Z",
    ...over,
  }) as ApiGoal;

const H2 = { id: "c-h2", name: "H2 2026 Appraisal", stage: "SELF" };
const Q1 = { id: "c-q1", name: "Q1 2027 Appraisal", stage: "DRAFT" };
const LATE = { id: "c-mgr", name: "H1 2026 Appraisal", stage: "MANAGER" };
const DONE = { id: "c-old", name: "H2 2025 Appraisal", stage: "PUBLISHED" };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T09:00:00Z"));
  window.localStorage.clear();
  resetObjectiveDrafts();
  state.permissions = new Set();
  state.employeeId = "emp-head";
  state.departments = [
    { id: "d-eng", name: "Engineering", headId: "emp-head" },
    { id: "d-fin", name: "Finance", headId: "emp-other" },
  ];
  state.people = [
    person("emp-head", "Adaeze Okonkwo"),
    person("eng-1", "Tunde Bello"),
    person("fin-1", "Segun Ojo", {
      department: "Finance",
      departmentId: "d-fin",
    }),
  ];
  state.cycles = [DONE, LATE, H2];
  state.periodsLoading = false;
  state.goals = [];
  state.push = vi.fn();
  state.createGoal = vi.fn().mockResolvedValue(madeGoal());
  state.addKeyResult = vi.fn().mockResolvedValue({});
  state.updateGoal = vi.fn().mockResolvedValue({});
  state.updateKeyResult = vi.fn().mockResolvedValue({});
  state.fetchGoal = vi.fn();
  state.submit = vi.fn().mockResolvedValue({
    ...madeGoal(),
    approval: "AWAITING_APPROVAL",
    sentTo: ["m-1"],
  });
});
afterEach(() => vi.useRealTimers());

const BACK = "/performance/kpis?scope=mine";
const open = (parent: string | null = null) => {
  const user = userEvent.setup();
  const view = render(<ObjectiveWizard parent={parent} back={BACK} />);
  return { user, ...view };
};
const next = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Continue" }));

/** Fills the first two screens with a number target and lands on the third. */
async function throughTarget(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByRole("textbox", { name: /objective title/i }),
    "Fill the two Lagos roles",
  );
  await next(user);
  await user.click(screen.getByRole("radio", { name: /a number to reach/i }));
  await user.type(
    screen.getByRole("textbox", { name: /what is counted/i }),
    "Offers accepted",
  );
  await user.type(screen.getByRole("textbox", { name: /target value/i }), "2");
  await next(user);
}

describe("the questions, one to a screen", () => {
  it("opens full page on the aim, with a progress bar and an X, not a dialog of fields", () => {
    open();
    const page = screen.getByRole("dialog", { name: "What is the aim?" });
    expect(
      within(page).getByRole("heading", { level: 1, name: "What is the aim?" }),
    ).toBeInTheDocument();
    expect(within(page).getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
    expect(within(page).getByRole("button", { name: "Close" })).toBeVisible();
    expect(
      within(page).queryByRole("button", { name: /create objective/i }),
    ).not.toBeInTheDocument();
  });

  it("refuses a short title on the first screen, in the dialog's words, and stays there", async () => {
    const { user } = open();
    await user.type(
      screen.getByRole("textbox", { name: /objective title/i }),
      "Go",
    );
    await next(user);
    expect(
      screen.getByText("Give it a title of at least three characters."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "What is the aim?" }),
    ).toBeInTheDocument();
  });

  it("asks for a kind of target, then holds a number to the dialog's direction rule", async () => {
    const { user } = open();
    await user.type(
      screen.getByRole("textbox", { name: /objective title/i }),
      "Fill the two Lagos roles",
    );
    await next(user);
    expect(
      screen.getByRole("heading", { name: "What is the target?" }),
    ).toBeInTheDocument();
    await next(user);
    expect(
      screen.getByText("Choose a kind of target, or add one later."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /a number to reach/i }));
    await user.type(
      screen.getByRole("textbox", { name: /what is counted/i }),
      "Cost per hire",
    );
    const start = screen.getByRole("textbox", { name: /starting value/i });
    await user.clear(start);
    await user.type(start, "500");
    await user.type(
      screen.getByRole("textbox", { name: /target value/i }),
      "300",
    );
    await next(user);
    expect(
      screen.getByText(
        "The target is below the starting number. Tick the box if it is meant to come down.",
      ),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("checkbox", { name: /this number should go down/i }),
    );
    await next(user);
    expect(
      screen.getByRole("heading", { name: "Which period does it count in?" }),
    ).toBeInTheDocument();
  });

  it("starts Due quarter on today's quarter, not the ended one", async () => {
    const { user } = open();
    await throughTarget(user);
    expect(screen.getByLabelText(/Due quarter/)).toHaveValue("2026-Q4");
  });

  it("offers only the periods still taking objectives, and starts on the running one", async () => {
    const { user } = open();
    await throughTarget(user);
    const period = screen.getByLabelText(/Appraisal period/);
    const offered = within(period)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(offered).toEqual(["H2 2026 Appraisal"]);
    expect(period).toHaveValue("c-h2");
  });

  it("honours ?period= from the notification: preselected, and one welcome line", async () => {
    state.cycles = [Q1, { ...Q1, id: "c-q2", name: "Q2 2027 Appraisal" }];
    const user = userEvent.setup();
    render(<ObjectiveWizard parent={null} period="c-q2" back={BACK} />);
    expect(
      screen.getByText("Setting objectives for Q2 2027 Appraisal"),
    ).toBeVisible();
    await throughTarget(user);
    expect(screen.getByLabelText(/Appraisal period/)).toHaveValue("c-q2");
  });

  it("ignores a ?period= that no longer takes objectives, and says nothing", () => {
    render(<ObjectiveWizard parent={null} period="gone" back={BACK} />);
    expect(screen.queryByText(/Setting objectives for/)).toBeNull();
  });

  it("holds a personal objective to a period when several are open and none is running", async () => {
    state.cycles = [Q1, { ...Q1, id: "c-q2", name: "Q2 2027 Appraisal" }];
    const { user } = open();
    await throughTarget(user);
    expect(screen.getByLabelText(/Appraisal period/)).toHaveValue("");
    await next(user);
    expect(
      screen.getByText(
        "Choose the appraisal period this is scored in. An objective with none counts towards nobody's score, even once it is agreed.",
      ),
    ).toBeInTheDocument();
  });
  it("says so, in words, when no period is open, and still goes on", async () => {
    state.cycles = [DONE];
    const { user } = open();
    await throughTarget(user);
    expect(screen.queryByLabelText(/Appraisal period/)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /No appraisal period is open, so this objective will count/,
      ),
    ).toBeInTheDocument();
    await next(user);
    expect(
      screen.getByRole("heading", {
        name: "Check it, then send it to be agreed",
      }),
    ).toBeInTheDocument();
  });

  it("does not hold a department objective to a period", async () => {
    const { user } = open();
    await user.click(screen.getByRole("radio", { name: /a department/i }));
    await throughTarget(user);
    expect(screen.getByLabelText(/Appraisal period/)).toHaveValue("");
    await next(user);
    expect(
      screen.getByRole("heading", {
        name: "Check it, then send it to be agreed",
      }),
    ).toBeInTheDocument();
  });
});

describe("whose it is", () => {
  it("offers HR the company, a department and a person, starting on their own", () => {
    state.permissions = new Set(["EDIT_RECORDS"]);
    state.employeeId = "emp-hr";
    open();
    const who = screen.getByRole("group", { name: "Who is it for?" });
    expect(
      within(who)
        .getAllByRole("radio")
        .map((radio) => (radio as HTMLInputElement).value),
    ).toEqual(["company", "department", "person"]);
    expect(
      within(who).getByRole("radio", { name: /one person/i }),
    ).toBeChecked();
  });

  it("offers a department head their own department and nobody else's", async () => {
    const { user } = open();
    await user.click(screen.getByRole("radio", { name: /a department/i }));
    const select = screen.getByRole("combobox", { name: /department/i });
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Engineering"]);
  });

  it("offers a leader the people they lead by name, and not another department", () => {
    open();
    const select = screen.getByRole("combobox", { name: /whose objective/i });
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Mine", "Tunde Bello · Analyst"]);
  });

  it("asks a plain employee nothing about whose it is", () => {
    state.employeeId = "emp-plain";
    state.departments = [];
    state.people = [];
    open();
    expect(
      screen.queryByRole("group", { name: "Who is it for?" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("It is your own objective.")).toBeInTheDocument();
  });
});

describe("sending it", () => {
  it("writes the objective, then its target, then sends it, and says who it went to", async () => {
    const { user } = open();
    await throughTarget(user);
    await next(user);
    expect(
      screen.getByRole("heading", {
        name: "Check it, then send it to be agreed",
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send to be agreed" }));

    expect(state.createGoal).toHaveBeenCalledTimes(1);
    expect(state.createGoal.mock.calls[0]?.[0]).toEqual({
      title: "Fill the two Lagos roles",
      dueQuarter: "2026-Q4",
      reviewCycleId: "c-h2",
    });
    expect(state.addKeyResult).toHaveBeenCalledWith("g-new", {
      label: "Offers accepted",
      targetValue: "2",
      startValue: "0",
    });
    expect(state.submit).toHaveBeenCalledWith("g-new");

    const done = screen.getByRole("heading", {
      level: 1,
      name: '"Fill the two Lagos roles" is waiting to be agreed',
    });
    expect(done).toBeInTheDocument();
    expect(
      screen.getByText("Sent to 1 person who can agree it."),
    ).toBeInTheDocument();
    /* One button, and the X: no Close button of its own. */
    expect(
      screen.getByRole("button", { name: "Back to objectives" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "",
      "Back to objectives",
    ]);
    await user.click(
      screen.getByRole("button", { name: "Back to objectives" }),
    );
    expect(state.push).toHaveBeenCalledWith(BACK);
  });

  it("adds another on the same period, lists both, and sends both", async () => {
    const { user } = open();
    await throughTarget(user);
    await next(user);
    await user.click(screen.getByRole("button", { name: "Add another" }));

    /* Only the aim and the target are asked again; the period is kept. */
    expect(
      screen.getByRole("textbox", { name: /objective title/i }),
    ).toHaveValue("");
    await user.type(
      screen.getByRole("textbox", { name: /objective title/i }),
      "Cut hiring time to 30 days",
    );
    await next(user);
    await user.click(screen.getByRole("radio", { name: /a number to reach/i }));
    await user.type(
      screen.getByRole("textbox", { name: /what is counted/i }),
      "Days to hire",
    );
    await user.type(
      screen.getByRole("textbox", { name: /target value/i }),
      "30",
    );
    await next(user);

    const added = screen.getByRole("list", {
      name: "Objectives already added",
    });
    expect(within(added).getByText("Fill the two Lagos roles")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Send 2 to be agreed" }),
    );

    expect(state.createGoal).toHaveBeenCalledTimes(2);
    expect(state.createGoal.mock.calls[0]?.[0]).toMatchObject({
      title: "Fill the two Lagos roles",
      reviewCycleId: "c-h2",
    });
    expect(state.createGoal.mock.calls[1]?.[0]).toMatchObject({
      title: "Cut hiring time to 30 days",
      reviewCycleId: "c-h2",
    });
    expect(state.submit).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "2 objectives sent to be agreed",
      }),
    ).toBeInTheDocument();
  });

  it("keeps it as a draft without sending it", async () => {
    const { user } = open();
    await throughTarget(user);
    await next(user);
    await user.click(screen.getByRole("button", { name: "Save as a draft" }));
    expect(state.createGoal).toHaveBeenCalledTimes(1);
    expect(state.addKeyResult).toHaveBeenCalledTimes(1);
    expect(state.submit).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", {
        name: '"Fill the two Lagos roles" is saved as a draft',
      }),
    ).toBeInTheDocument();
  });

  it("does not make the objective twice when its target failed and is tried again", async () => {
    state.addKeyResult = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network down"))
      .mockResolvedValueOnce({});
    const { user } = open();
    await throughTarget(user);
    await next(user);
    await user.click(screen.getByRole("button", { name: "Send to be agreed" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      /The objective is saved as a draft, but its target is not/,
    );
    expect(state.submit).not.toHaveBeenCalled();
    /* Written, so there is nothing to go back and change. */
    expect(
      screen.queryByRole("button", { name: "Back" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Send to be agreed" }));
    expect(state.createGoal).toHaveBeenCalledTimes(1);
    expect(state.addKeyResult).toHaveBeenCalledTimes(2);
    expect(state.submit).toHaveBeenCalledTimes(1);
  });

  it("sends no target when it is to be added later", async () => {
    const { user } = open();
    await user.type(
      screen.getByRole("textbox", { name: /objective title/i }),
      "Fill the two Lagos roles",
    );
    await next(user);
    await user.click(screen.getByRole("radio", { name: /add it later/i }));
    await next(user);
    await next(user);
    await user.click(screen.getByRole("button", { name: "Send to be agreed" }));
    expect(state.addKeyResult).not.toHaveBeenCalled();
    expect(state.submit).toHaveBeenCalledTimes(1);
  });

  it("starts under the objective it was opened from", async () => {
    state.goals = [
      madeGoal({
        id: "g-company",
        title: "Grow the business",
        level: "company",
        ownerId: null,
        ownerName: null,
        approval: "AGREED",
      }),
    ];
    const { user } = open("g-company");
    await throughTarget(user);
    expect(screen.getByLabelText(/what does it support/i)).toHaveValue(
      "g-company",
    );
    await next(user);
    await user.click(screen.getByRole("button", { name: "Send to be agreed" }));
    expect(state.createGoal.mock.calls[0]?.[0]).toMatchObject({
      parentId: "g-company",
    });
  });
});

describe("a draft kept if they leave", () => {
  it("carries on from what was typed, and Start again clears it", async () => {
    const first = open();
    await first.user.type(
      screen.getByRole("textbox", { name: /objective title/i }),
      "Fill the two Lagos roles",
    );
    await first.user.click(screen.getByRole("button", { name: "Close" }));
    expect(state.push).toHaveBeenCalledWith(BACK);
    first.unmount();

    const second = open();
    await act(async () => {});
    expect(
      screen.getByRole("textbox", { name: /objective title/i }),
    ).toHaveValue("Fill the two Lagos roles");
    expect(
      screen.getByText(/Carried on from where you left it/),
    ).toBeInTheDocument();

    await second.user.click(
      screen.getByRole("button", { name: "Start again" }),
    );
    expect(
      screen.getByRole("textbox", { name: /objective title/i }),
    ).toHaveValue("");
    second.unmount();

    open();
    await act(async () => {});
    expect(
      screen.getByRole("textbox", { name: /objective title/i }),
    ).toHaveValue("");
  });

  it("throws the draft away once the objective is written", async () => {
    const first = open();
    await throughTarget(first.user);
    await next(first.user);
    await first.user.click(
      screen.getByRole("button", { name: "Send to be agreed" }),
    );
    first.unmount();

    open();
    await act(async () => {});
    expect(
      screen.getByRole("textbox", { name: /objective title/i }),
    ).toHaveValue("");
    expect(
      screen.queryByText(/Carried on from where you left it/),
    ).not.toBeInTheDocument();
  });
});

describe("a draft carried on to the last screen", () => {
  it("waits for the periods before writing, so it is not filed in none", async () => {
    const first = open();
    await throughTarget(first.user);
    await next(first.user);
    await first.user.click(screen.getByRole("button", { name: "Close" }));
    first.unmount();

    /* Opened again before the company's periods have arrived. */
    state.cycles = [];
    state.periodsLoading = true;
    const second = open();
    await act(async () => {});
    expect(
      screen.getByRole("heading", {
        name: "Check it, then send it to be agreed",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Send to be agreed" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Save as a draft" }),
    ).toBeDisabled();

    state.cycles = [H2];
    state.periodsLoading = false;
    second.rerender(<ObjectiveWizard parent={null} back={BACK} />);
    await second.user.click(
      screen.getByRole("button", { name: "Save as a draft" }),
    );
    expect(state.createGoal.mock.calls[0]?.[0]).toMatchObject({
      reviewCycleId: "c-h2",
    });
  });

  it("checks every answer again, and goes back to the one that no longer holds", async () => {
    const first = open();
    await throughTarget(first.user);
    await next(first.user);
    await first.user.click(screen.getByRole("button", { name: "Close" }));
    first.unmount();

    /* The running period has since moved on; two drafts are open instead. */
    state.cycles = [Q1, { ...Q1, id: "c-q2", name: "Q2 2027 Appraisal" }];
    const second = open();
    await act(async () => {});
    await second.user.click(
      screen.getByRole("button", { name: "Send to be agreed" }),
    );
    expect(state.createGoal).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Which period does it count in?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Choose the appraisal period this is scored in/),
    ).toBeInTheDocument();
  });
});

describe("Edit and resend, for one that was declined", () => {
  const declined = () =>
    madeGoal({
      id: "g-declined",
      title: "Fill the two Lagos roles",
      approval: "NEEDS_REVISION",
      approvalLabel: "Sent back",
      approvalNote: "Two is too few; the plan says three.",
      keyResults: [
        {
          id: "kr-1",
          label: "Offers accepted",
          kind: "NUMBER",
          unit: null,
          startValue: "0",
          targetValue: "2",
          currentValue: "0",
          lowerIsBetter: false,
        } as unknown as ApiGoal["keyResults"][number],
      ],
    });
  const openEdit = () => {
    const user = userEvent.setup();
    const view = render(
      <ObjectiveWizard parent={null} edit="g-declined" back={BACK} />,
    );
    return { user, ...view };
  };

  it("opens on what was sent, with the feedback beside every question", async () => {
    state.fetchGoal = vi.fn().mockResolvedValue(declined());
    openEdit();
    expect(
      await screen.findByRole("textbox", { name: /objective title/i }),
    ).toHaveValue("Fill the two Lagos roles");
    expect(state.fetchGoal).toHaveBeenCalledWith("g-declined");
    expect(
      screen.getByText("Feedback when it was declined"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Two is too few; the plan says three."),
    ).toBeInTheDocument();
    /* Whose it is is not changed here. */
    expect(
      screen.queryByRole("group", { name: "Who is it for?" }),
    ).not.toBeInTheDocument();
  });

  it("sends only what changed, then sends it to be agreed again", async () => {
    state.fetchGoal = vi.fn().mockResolvedValue(declined());
    const { user } = openEdit();
    await screen.findByRole("textbox", { name: /objective title/i });
    await next(user);
    expect(
      screen.getByText("Two is too few; the plan says three."),
    ).toBeInTheDocument();
    const target = screen.getByRole("textbox", { name: /target value/i });
    expect(target).toHaveValue("2");
    await user.clear(target);
    await user.type(target, "3");
    await next(user);
    await next(user);
    await user.click(screen.getByRole("button", { name: "Send to be agreed" }));
    expect(state.createGoal).not.toHaveBeenCalled();
    expect(state.updateGoal).not.toHaveBeenCalled();
    expect(state.updateKeyResult).toHaveBeenCalledWith("kr-1", {
      targetValue: "3",
    });
    expect(state.submit).toHaveBeenCalledWith("g-declined");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: '"Fill the two Lagos roles" is waiting to be agreed',
      }),
    ).toBeInTheDocument();
  });

  it("saves the change without sending it, and says it stays declined", async () => {
    state.fetchGoal = vi.fn().mockResolvedValue(declined());
    const { user } = openEdit();
    const title = await screen.findByRole("textbox", {
      name: /objective title/i,
    });
    await user.clear(title);
    await user.type(title, "Fill the three Lagos roles");
    await next(user);
    await next(user);
    await next(user);
    await user.click(
      screen.getByRole("button", { name: "Save without sending" }),
    );
    expect(state.updateGoal).toHaveBeenCalledWith("g-declined", {
      title: "Fill the three Lagos roles",
    });
    expect(state.submit).not.toHaveBeenCalled();
    expect(
      screen.getByText(/It stays declined until it is sent to be agreed again/),
    ).toBeInTheDocument();
  });

  it("does not offer to change one that is agreed", async () => {
    state.fetchGoal = vi.fn().mockResolvedValue(
      madeGoal({
        id: "g-declined",
        approval: "AGREED",
        approvalLabel: "Agreed",
        targetFrozen: true,
      }),
    );
    openEdit();
    expect(
      await screen.findByRole("heading", {
        name: "This objective cannot be changed here",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /objective title/i }),
    ).not.toBeInTheDocument();
  });
});

describe("the rules, as data", () => {
  const draft = (over: Partial<ObjectiveDraft> = {}): ObjectiveDraft => ({
    ...BLANK_OBJECTIVE,
    title: "Ship the payments rebuild",
    level: "person",
    ...over,
  });
  const context = { reviewCycleId: "", openPeriods: 1 };

  it("files a company objective as nobody's, a department's under the department, and one's own with no owner", () => {
    const where = { reviewCycleId: "", quarter: "2026-Q4" };
    expect(goalBodyOf(draft({ level: "company" }), where)).toEqual({
      title: "Ship the payments rebuild",
      dueQuarter: "2026-Q4",
      ownerId: null,
    });
    expect(
      goalBodyOf(draft({ level: "department", departmentId: "d-eng" }), where),
    ).toMatchObject({ ownerId: null, departmentId: "d-eng" });
    expect(goalBodyOf(draft({ personId: "me" }), where)).not.toHaveProperty(
      "ownerId",
    );
    expect(goalBodyOf(draft({ personId: "eng-1" }), where)).toMatchObject({
      ownerId: "eng-1",
    });
  });

  it("asks a personal objective for a period and leaves a shared one free", () => {
    expect(stepProblems("period", draft(), context).period).toBeDefined();
    expect(
      stepProblems("period", draft({ level: "department" }), context).period,
    ).toBeUndefined();
    expect(
      stepProblems("period", draft(), { ...context, openPeriods: 0 }).period,
    ).toBeUndefined();
  });

  it("sends a done-or-not target as its words alone, and none for later", () => {
    expect(
      keyResultBodyOf(draft({ target: "DONE", label: "Both hired" })),
    ).toEqual({ kind: "DONE", label: "Both hired" });
    expect(keyResultBodyOf(draft({ target: "LATER" }))).toBeNull();
  });

  it("offers only the rungs the API accepts", () => {
    expect(
      levelsOffered({
        canSetCompanyWide: false,
        departments: [],
        hasStaffRecord: true,
        leadsAnybody: false,
      }),
    ).toEqual(["person"]);
    expect(
      periodsTakingObjectives([DONE, LATE, H2, Q1]).map((one) => one.id),
    ).toEqual(["c-h2", "c-q1"]);
  });

  it("goes back only to an Objectives address", () => {
    expect(safeBack("/performance/kpis?scope=team")).toBe(
      "/performance/kpis?scope=team",
    );
    expect(safeBack("https://evil.example")).toBe("/performance/kpis");
    expect(safeBack("//evil.example/performance/kpis")).toBe(
      "/performance/kpis",
    );
    expect(safeBack("/performance/kpis/new")).toBe("/performance/kpis");
    expect(newObjectiveHref({ parent: "g-1", back: "/performance/kpis" })).toBe(
      "/performance/kpis/new?parent=g-1&back=%2Fperformance%2Fkpis",
    );
    expect(draftIsBlank(BLANK_OBJECTIVE)).toBe(true);
  });
});
