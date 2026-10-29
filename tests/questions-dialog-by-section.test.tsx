import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ApiError } from "@/lib/api/client";
import type {
  ApiCompetency,
  ApiQuestion,
  ApiSection,
} from "@/lib/api/performance";
import { QuestionsDialog } from "@/app/(app)/performance/period-dialogs";

/**
 * The Questions dialog has two views of one form: every question in the period,
 * and the same questions under the sections and subsections they belong to.
 *
 * What is worth a test here is the wiring `tsc` cannot see. That a question written
 * from under a subsection is filed under it, and still is after an edit has been
 * saved. That the full list is the list it was. That the tree keeps what somebody is
 * typing while the framework is read again. That a failed read is not mistaken for a
 * company with no sections.
 */

let questions: ApiQuestion[];
let competencies: ApiCompetency[];
let sections: ApiSection[];
let frameworkLoading: boolean;
let frameworkError: ApiError | null;
let connected: boolean;
let canManage: boolean;

let reloadQuestions: Mock<() => void>;
let reloadFramework: Mock<() => void>;
let reloadSections: Mock<() => void>;
let createCompetency: Mock<(...args: unknown[]) => Promise<unknown>>;
let createSection: Mock<(...args: unknown[]) => Promise<unknown>>;

/** Stable on purpose: a mock that rebuilt it every render is not what the hook does. */
const NO_GROUPS: never[] = [];

vi.mock("@/lib/store/performance", () => ({
  useCycleQuestions: () => ({
    questions,
    loading: false,
    reload: reloadQuestions,
  }),
  useFramework: () => ({
    competencies,
    groups: NO_GROUPS,
    loading: frameworkLoading,
    error: frameworkError,
    source: "api",
    reload: reloadFramework,
  }),
  useSections: () => ({
    sections,
    loading: frameworkLoading,
    reload: reloadSections,
  }),
  useFrameworkActions: () => ({
    editable: connected,
    createSection: (...args: unknown[]) => createSection(...args),
    createCompetency: (...args: unknown[]) => createCompetency(...args),
    updateCompetency: vi.fn(),
    setChoiceOptions: vi.fn(),
  }),
  useAppraisals: () => ({ cycles: [], loading: false }),
}));
vi.mock("@/lib/permissions", () => ({ useCan: () => canManage }));

const section = (over: Partial<ApiSection>): ApiSection => ({
  id: "s-core",
  name: "Core competency",
  order: 0,
  competencyCount: 0,
  component: "CORE_COMPETENCY",
  weightBp: 4000,
  ...over,
});

const subsection = (over: Partial<ApiCompetency>): ApiCompetency => ({
  id: "c",
  name: "Subsection",
  sectionId: "s-core",
  sectionName: "Core competency",
  description: null,
  isCore: false,
  scaleMax: 5,
  active: true,
  archived: false,
  ratingCount: 0,
  ...over,
});

const question = (
  id: string,
  prompt: string,
  competencyId: string | null,
): ApiQuestion => ({
  id,
  reviewCycleId: "c-1",
  competencyId,
  prompt,
  kind: "TEXT",
  askedOf: [],
  required: true,
  options: [],
  allowCustom: false,
  order: 1,
  source: "HR",
  departmentIds: [],
});

const DELIVER = "What did you deliver this period?";
const TEAM = "How did the team work together this period?";

const mount = () => {
  const onAdd = vi.fn().mockResolvedValue(undefined);
  const onUpdate = vi.fn().mockResolvedValue(undefined);
  const props = {
    open: true,
    cycleId: "c-1",
    periodName: "H2 2026 Appraisal",
    onClose: vi.fn(),
    onAdd,
    onUpdate,
    onRemove: vi.fn(),
  };
  const view = render(<QuestionsDialog {...props} />);
  return {
    onAdd,
    onUpdate,
    /** The same dialog again, after the module state above has changed. */
    again: () => view.rerender(<QuestionsDialog {...props} />),
  };
};

const viewSwitch = (label: "All questions" | "By section") =>
  userEvent.click(screen.getByRole("radio", { name: label }));

/**
 * Open a subsection in the section view. A subsection's row holds two buttons that
 * carry its name, the toggle that opens it and Add question, so the toggle is the
 * one that says whether it is open.
 */
const openSubsection = async (name: string) => {
  await viewSwitch("By section");
  await userEvent.click(
    screen.getByRole("button", { name: /Core competency/ }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: new RegExp(name), expanded: false }),
  );
};
/** The toggle of a subsection, not its Add question button, which carries the name too. */
const toggleOf = (name: string) =>
  screen
    .getAllByRole("button", { name: new RegExp(name) })
    .find((button) => button.hasAttribute("aria-expanded")) as HTMLElement;
/** Opens on the questions already; kept so a test can say it is looking at them. */
const questionsTab = () =>
  userEvent.click(screen.getByRole("tab", { name: /^Questions/ }));

const questionField = () =>
  screen.getByLabelText(/(Add|Edit) (a|the) question/) as HTMLInputElement;

beforeEach(() => {
  questions = [];
  sections = [
    section({}),
    section({
      id: "s-culture",
      name: "Culture",
      weightBp: null,
      component: null,
    }),
  ];
  competencies = [
    subsection({ id: "c-dil", name: "Diligence" }),
    subsection({ id: "c-team", name: "Teamwork", answerKind: "BOOLEAN" }),
  ];
  frameworkLoading = false;
  frameworkError = null;
  connected = true;
  canManage = true;
  reloadQuestions = vi.fn();
  reloadFramework = vi.fn();
  reloadSections = vi.fn();
  createCompetency = vi.fn().mockResolvedValue({ id: "c-new" });
  createSection = vi.fn().mockResolvedValue({});
});

describe("the two views", () => {
  it("opens on every question in the period, with the form it has always had", () => {
    mount();
    expect(screen.getByRole("radio", { name: "All questions" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "By section" })).not.toBeChecked();
    expect(screen.getByLabelText("Section")).toBeInTheDocument();
    expect(screen.getByLabelText("Subsection")).toBeInTheDocument();
  });

  it("shows the sections instead of the picker when asked to go by section", async () => {
    mount();
    await viewSwitch("By section");

    expect(
      screen.getByRole("button", { name: /Core competency/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Culture/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("Section")).not.toBeInTheDocument();
  });

  it("goes back to the full list, picker and all", async () => {
    mount();
    await viewSwitch("By section");
    await viewSwitch("All questions");
    expect(screen.getByLabelText("Section")).toBeInTheDocument();
  });

  it("lists every question in the full list with where each is filed, as it did", () => {
    questions = [
      question("q-1", DELIVER, "c-dil"),
      question("q-2", TEAM, null),
    ];
    mount();
    const row = screen.getByText(DELIVER).closest("li, div.flex");
    expect(row).toHaveTextContent("Diligence");
    expect(screen.getByText(TEAM)).toBeInTheDocument();
  });

  it("counts, on each subsection, the questions this period has filed under it", async () => {
    questions = [
      question("q-1", DELIVER, "c-dil"),
      question("q-2", TEAM, "c-dil"),
      question("q-3", "A general question about the period?", null),
    ];
    mount();
    await viewSwitch("By section");
    await userEvent.click(
      screen.getByRole("button", { name: /Core competency/ }),
    );

    expect(toggleOf("Diligence")).toHaveTextContent("2 questions");
    expect(toggleOf("Teamwork")).not.toHaveTextContent("question");
    expect(
      screen.getByText(
        "1 question in this period is not filed under a subsection. They are in All questions.",
      ),
    ).toBeInTheDocument();
  });
});

describe("a question written from under a subsection", () => {
  it("is filed under that subsection, and the picker is not there to say otherwise", async () => {
    const { onAdd } = mount();
    await openSubsection("Diligence");
    await questionsTab();

    expect(screen.queryByLabelText("Section")).not.toBeInTheDocument();
    await userEvent.type(questionField(), DELIVER);
    await userEvent.click(screen.getByRole("button", { name: "Add question" }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd.mock.calls[0]?.[0]).toMatchObject({
      prompt: DELIVER,
      competencyId: "c-dil",
    });
    expect(reloadQuestions).toHaveBeenCalled();
  });

  it("says where the mark comes from, in the words of how that subsection is answered", async () => {
    mount();
    await openSubsection("Teamwork");
    await questionsTab();

    expect(
      screen.getByText(
        "Answers to a question do not count towards the mark. Core competency is 40% of the mark, and it comes from the answer recorded on Teamwork, under Competency ratings.",
      ),
    ).toBeInTheDocument();
  });

  it("says a level for a subsection that is rated", async () => {
    mount();
    await openSubsection("Diligence");
    await questionsTab();
    expect(
      screen.getByText(/it comes from the level recorded on Diligence/),
    ).toBeInTheDocument();
  });

  it("lists only that subsection's own questions, and does not say again where each is filed", async () => {
    questions = [
      question("q-1", DELIVER, "c-dil"),
      question("q-2", TEAM, "c-team"),
      question("q-3", "A general question about the period?", null),
    ];
    mount();
    await openSubsection("Diligence");

    expect(screen.getByText(DELIVER)).toBeInTheDocument();
    expect(screen.queryByText(TEAM)).not.toBeInTheDocument();
    expect(
      screen.queryByText("A general question about the period?"),
    ).not.toBeInTheDocument();
    const row = screen.getByText(DELIVER).closest("li");
    expect(row).not.toHaveTextContent("Diligence");
  });

  it("says so when nothing in this period is filed under it yet", async () => {
    mount();
    await openSubsection("Teamwork");
    await questionsTab();
    expect(
      screen.getByText(
        "Nothing in H2 2026 Appraisal is filed under Teamwork yet.",
      ),
    ).toBeInTheDocument();
  });

  it("is still filed under it after an edit has been saved, and not under nothing", async () => {
    /* `cancelEdit` clears the picker's own state, which the section view does not
       use. Had the next question read from it, the one after a saved edit would
       have gone in with no subsection while the screen still showed it under the
       open one. */
    questions = [question("q-1", DELIVER, "c-dil")];
    const { onAdd, onUpdate } = mount();
    await openSubsection("Diligence");

    await userEvent.click(
      screen.getByRole("button", { name: `Edit "${DELIVER}"` }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0]?.[1]).toMatchObject({
      competencyId: "c-dil",
    });

    await userEvent.type(questionField(), TEAM);
    await userEvent.click(screen.getByRole("button", { name: "Add question" }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd.mock.calls[0]?.[0]).toMatchObject({ competencyId: "c-dil" });
  });

  it("goes to whichever subsection is open when another is opened", async () => {
    const { onAdd } = mount();
    await openSubsection("Diligence");
    await questionsTab();
    /* Close it and open the other. */
    await userEvent.click(toggleOf("Diligence"));
    await userEvent.click(toggleOf("Teamwork"));
    await questionsTab();

    await userEvent.type(questionField(), TEAM);
    await userEvent.click(screen.getByRole("button", { name: "Add question" }));
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(onAdd.mock.calls[0]?.[0]).toMatchObject({ competencyId: "c-team" });
  });
});

describe("moving between the views", () => {
  it("drops an edit in progress, which may not be on the other view at all", async () => {
    questions = [question("q-1", DELIVER, "c-dil")];
    mount();
    await userEvent.click(
      screen.getByRole("button", { name: `Edit "${DELIVER}"` }),
    );
    expect(questionField().value).toBe(DELIVER);
    expect(screen.getByLabelText(/Edit the question/)).toBeInTheDocument();

    await viewSwitch("By section");
    await viewSwitch("All questions");

    expect(screen.getByLabelText(/Add a question/)).toBeInTheDocument();
    expect(questionField().value).toBe("");
    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
  });

  it("keeps what was typed into a new question, which belongs to neither view", async () => {
    mount();
    await userEvent.type(questionField(), "A question I have started");
    await viewSwitch("By section");
    await viewSwitch("All questions");
    expect(questionField().value).toBe("A question I have started");
  });
});

describe("a subsection made while writing a question in the full list", () => {
  it("is made without a section, the framework is read again, and the dialog is told its own copy is out of date", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: "New" }));
    await userEvent.type(
      screen.getByLabelText("Subsection name"),
      "Initiative",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Add subsection" }),
    );

    await waitFor(() => expect(createCompetency).toHaveBeenCalledTimes(1));
    expect(createCompetency).toHaveBeenCalledWith({
      name: "Initiative",
      scaleMax: 5,
    });
    /* Once for the picker's own read of the framework and once for the
       dialog's, which is a separate hook with a separate copy. */
    await waitFor(() => expect(reloadFramework).toHaveBeenCalledTimes(2));
  });

  it("is refused a name that is not one, in the same sentence the tree uses", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: "New" }));
    await userEvent.type(screen.getByLabelText("Subsection name"), "x");
    await userEvent.click(
      screen.getByRole("button", { name: "Add subsection" }),
    );
    expect(await screen.findByText("Give it a name.")).toBeInTheDocument();
    expect(createCompetency).not.toHaveBeenCalled();
  });
});

describe("who may change the framework from here", () => {
  it("is somebody who can manage settings, connected", async () => {
    mount();
    await viewSwitch("By section");
    expect(
      screen.getByRole("button", { name: "Add a section" }),
    ).toBeInTheDocument();
  });

  it("is nobody else, and the reason is said once", async () => {
    canManage = false;
    mount();
    await viewSwitch("By section");
    expect(
      screen.queryByRole("button", { name: "Add a section" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Only somebody who can manage settings can change sections, subsections and how they are answered.",
      ),
    ).toBeInTheDocument();
  });

  it("is nobody when there is no API to change it on", async () => {
    connected = false;
    mount();
    await viewSwitch("By section");
    expect(
      screen.queryByRole("button", { name: "Add a section" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Changing sections, subsections and how they are answered needs the API: the demo framework is fixed.",
      ),
    ).toBeInTheDocument();
  });

  it("can still read how a subsection is answered when it cannot change it", async () => {
    canManage = false;
    mount();
    await openSubsection("Teamwork");
    await userEvent.click(screen.getByRole("tab", { name: "How it is rated" }));
    expect(screen.getByLabelText("How it is answered")).toBeDisabled();
  });
});

describe("while the framework is read again", () => {
  it("keeps the list, and what somebody is typing into it, instead of blanking it", async () => {
    /* Every write in the tree ends by asking the framework again, and a re-read
       blanks what it returns until it answers. The add forms are inside that list:
       blanking it would unmount the form somebody is typing the next subsection
       into and take their cursor with it. */
    const { again } = mount();
    await viewSwitch("By section");
    await userEvent.click(
      screen.getByRole("button", { name: /Core competency/ }),
    );
    await userEvent.type(screen.getByLabelText("New subsection"), "Half typed");

    competencies = [];
    sections = [];
    frameworkLoading = true;
    again();

    expect(screen.queryByText("Loading the sections")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Core competency/ }),
    ).toBeInTheDocument();
    expect(toggleOf("Diligence")).toBeInTheDocument();
    expect(
      (screen.getByLabelText("New subsection") as HTMLInputElement).value,
    ).toBe("Half typed");

    competencies = [
      subsection({ id: "c-dil", name: "Diligence" }),
      subsection({ id: "c-new", name: "Initiative" }),
    ];
    sections = [section({})];
    frameworkLoading = false;
    again();

    expect(toggleOf("Initiative")).toBeInTheDocument();
    expect(
      (screen.getByLabelText("New subsection") as HTMLInputElement).value,
    ).toBe("Half typed");
  });

  it("says it is loading, and not that there are no sections, on the very first read", async () => {
    sections = [];
    competencies = [];
    frameworkLoading = true;
    mount();
    await viewSwitch("By section");
    expect(screen.getByText("Loading the sections")).toBeInTheDocument();
    expect(
      screen.queryByText(/There are no sections yet/),
    ).not.toBeInTheDocument();
  });

  it("says the read failed, and not that the company has no sections", async () => {
    sections = [];
    competencies = [];
    frameworkError = new ApiError(500, "server", "Internal error");
    mount();
    await viewSwitch("By section");

    expect(
      screen.getByText(/The sections and subsections did not load/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/There are no sections yet/),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(reloadFramework).toHaveBeenCalled();
  });
});

describe("asking the framework again after a write in the tree", () => {
  it("re-reads both the framework and the sections", async () => {
    mount();
    await viewSwitch("By section");
    await userEvent.click(
      screen.getByRole("button", { name: "Add a section" }),
    );
    await userEvent.type(screen.getByLabelText("New section"), "Our values");
    await userEvent.click(screen.getByRole("button", { name: "Add section" }));

    await waitFor(() => expect(createSection).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(reloadFramework).toHaveBeenCalledTimes(1));
    expect(reloadSections).toHaveBeenCalledTimes(1);
  });

  it("files a section made here with an order after the ones there are", async () => {
    mount();
    await viewSwitch("By section");
    await userEvent.click(
      screen.getByRole("button", { name: "Add a section" }),
    );
    await userEvent.type(screen.getByLabelText("New section"), "Our values");
    await userEvent.click(screen.getByRole("button", { name: "Add section" }));
    await waitFor(() => expect(createSection).toHaveBeenCalled());
    expect(createSection.mock.calls[0]?.[0]).toMatchObject({
      name: "Our values",
      order: 2,
    });
  });
});
