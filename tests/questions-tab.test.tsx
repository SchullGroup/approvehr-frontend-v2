import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The period's Questions tab (owner, 27 Nov 2026): a card only when it has rows,
 * one pencil, no plus, the competencies named for what they are, and on a draft
 * one control on each competency: Off, Person, Manager or Both.
 */

const state = vi.hoisted(() => ({
  questions: [] as unknown[],
  competencies: [] as unknown[],
  connected: true,
}));
const askSubsection = vi.hoisted(() => vi.fn());
const stopAskingSubsection = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/performance/periods/c1",
}));
vi.mock("@/lib/store/performance", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/performance")>()),
  useCycleQuestions: () => ({
    questions: state.questions,
    loading: false,
    error: null,
    reload: () => {},
  }),
  useCycleMutations: () => ({ askSubsection, stopAskingSubsection }),
  useFrameworkActions: () => ({ editable: state.connected }),
  useFramework: () => ({
    competencies: state.competencies,
    groups: [
      {
        sectionId: "s1",
        sectionName: "Behavioural competency",
        competencies: state.competencies,
      },
    ],
    loading: false,
    error: null,
    source: "api",
    reload: () => {},
  }),
}));

const { QuestionsPanel } =
  await import("@/app/(app)/performance/periods/[id]/period-questions");
const { ToastProvider } = await import("@/components/ui");

const own = {
  id: "q1",
  prompt: "What went well?",
  askedOf: ["SELF"],
  answersSubsection: false,
  competencyId: null,
};
const asked = {
  id: "q2",
  prompt: "Integrity",
  askedOf: ["SELF", "MANAGER"],
  answersSubsection: true,
  competencyId: "k1",
};
const competency = (id: string, name: string, over = {}) => ({
  id,
  name,
  sectionId: "s1",
  sectionName: "Behavioural competency",
  active: true,
  archived: false,
  ratingCount: 0,
  scaleMax: 5,
  ...over,
});

const draw = (props: { editable?: boolean; draft?: boolean } = {}) => {
  const onEdit = vi.fn();
  render(
    <ToastProvider>
      <QuestionsPanel
        cycleId="c1"
        editable={props.editable ?? true}
        draft={props.draft ?? true}
        onEdit={onEdit}
      />
    </ToastProvider>,
  );
  return onEdit;
};

beforeEach(() => {
  state.questions = [own, asked];
  state.competencies = [
    competency("k1", "Integrity"),
    competency("k2", "Teamwork"),
  ];
  state.connected = true;
  askSubsection.mockReset().mockResolvedValue({});
  stopAskingSubsection.mockReset().mockResolvedValue({});
});

describe("the Questions tab of a draft", () => {
  it("has the questions in a card with no heading, and one pencil that goes to the step-by-step form", () => {
    draw();
    expect(screen.queryByRole("heading", { name: "Questions" })).toBeNull();
    expect(screen.getByText("What went well?")).toBeInTheDocument();
    expect(screen.getAllByText("Person").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: "Edit the questions" }),
    ).toHaveAttribute("href", "/performance/periods/c1/questions");
    expect(screen.queryByRole("link", { name: /Add to the/ })).toBeNull();
    expect(screen.queryByText(/Read by managers/)).toBeNull();
  });

  it("says nothing but one way to start when there are no questions", () => {
    state.questions = [];
    draw();
    expect(screen.getByRole("link", { name: "Add questions" })).toHaveAttribute(
      "href",
      "/performance/periods/c1/questions",
    );
    expect(
      screen.queryByRole("link", { name: "Edit the questions" }),
    ).toBeNull();
  });

  it("calls the second card Competencies, with one control on each and a Save only after a change", async () => {
    const user = userEvent.setup();
    draw();
    expect(
      screen.getByRole("heading", { name: "Competencies" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Rated" })).toBeNull();
    const teamwork = screen.getByRole("combobox", {
      name: "Who is asked about Teamwork",
    });
    expect(
      within(teamwork)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Off", "Person", "Manager", "Both"]);
    expect(teamwork).toHaveValue("none");
    expect(
      screen.getByRole("combobox", { name: "Who is asked about Integrity" }),
    ).toHaveValue("both");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();

    await user.selectOptions(teamwork, "employee");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(askSubsection).toHaveBeenCalledWith("c1", "k2", ["SELF"]);
  });

  it("takes a competency off the form by choosing Off", async () => {
    const user = userEvent.setup();
    draw();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Who is asked about Integrity" }),
      "none",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(stopAskingSubsection).toHaveBeenCalledWith("c1", "k1");
  });

  it("leaves out a pick-one competency that has no choices to pick from", () => {
    state.competencies = [
      competency("k1", "Integrity"),
      competency("k3", "Feedback", { answerKind: "CHOICE", choiceOptions: [] }),
    ];
    draw();
    expect(
      screen.queryByRole("combobox", { name: "Who is asked about Feedback" }),
    ).toBeNull();
  });

  it("has no competency controls without the API", () => {
    state.connected = false;
    draw();
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

describe("the Questions tab of a period that has started", () => {
  it("has one pencil that opens the list, and shows the competencies as words", async () => {
    const user = userEvent.setup();
    const onEdit = draw({ draft: false });
    await user.click(
      screen.getByRole("button", { name: "Edit the questions" }),
    );
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("heading", { name: "Competencies" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Integrity")).toBeInTheDocument();
    expect(screen.getByText("Person and manager")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("link", { name: "Add questions" })).toBeNull();
  });

  it("has no icons where nothing can be changed", () => {
    draw({ editable: false, draft: false });
    expect(screen.queryByRole("button", { name: /Edit the/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Edit the/ })).toBeNull();
    expect(screen.getByText("What went well?")).toBeInTheDocument();
  });
});
