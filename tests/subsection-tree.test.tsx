import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type {
  ApiChoiceOption,
  ApiCompetency,
  ApiSection,
} from "@/lib/api/performance";
import type { FrameworkGroup } from "@/lib/store/performance";

/**
 * The company's sections and subsections, and how each subsection is answered.
 *
 * The tree is where somebody decides, subsection by subsection, whether it is
 * answered by questions on the form or directly by a manager recording a level, a
 * yes or no or a pick. Every rule worth testing here is one `tsc` cannot see: which
 * tab a subsection opens on, that switching tabs changes what is on screen and
 * nothing that is stored, what the add forms send, and that they stay open for the
 * next one.
 */

let createSection: Mock<(...args: unknown[]) => Promise<unknown>>;
let createCompetency: Mock<(...args: unknown[]) => Promise<unknown>>;
let updateCompetency: Mock<(...args: unknown[]) => Promise<unknown>>;
let setChoiceOptions: Mock<(...args: unknown[]) => Promise<unknown>>;

vi.mock("@/lib/store/performance", () => ({
  useFrameworkActions: () => ({
    editable: true,
    createSection: (...args: unknown[]) => createSection(...args),
    createCompetency: (...args: unknown[]) => createCompetency(...args),
    updateCompetency: (...args: unknown[]) => updateCompetency(...args),
    setChoiceOptions: (...args: unknown[]) => setChoiceOptions(...args),
  }),
  /* `CountsTowards` lives in the sections dialog, which imports these. */
  useFramework: () => ({ competencies: [], groups: [], loading: false }),
  useSections: () => ({ sections: [], loading: false }),
}));
vi.mock("@/lib/permissions", () => ({ useCan: () => true }));

const {
  SubsectionTree,
  newSubsectionBody,
  sectionOptionsOf,
  subsectionNameProblem,
} = await import("@/app/(app)/performance/subsection-tree");
type TreeProps = React.ComponentProps<typeof SubsectionTree>;

const section = (id: string, name: string, weightBp: number | null) => ({
  id,
  name,
  weightBp,
});

const competency = (over: Partial<ApiCompetency>): ApiCompetency => ({
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

const FEEDBACK_CHOICES: ApiChoiceOption[] = [
  { id: "o1", label: "Delighted", scoreBp: 10000, sortOrder: 0 },
  { id: "o2", label: "Satisfied", scoreBp: 6000, sortOrder: 1 },
];

const SECTIONS = [
  section("s-core", "Core competency", 4000),
  section("s-kra", "Key result area", null),
];

const COMPETENCIES: ApiCompetency[] = [
  competency({ id: "c-punct", name: "Punctuality" }),
  competency({
    id: "c-safety",
    name: "Follows safety procedures",
    answerKind: "BOOLEAN",
  }),
  competency({
    id: "c-feedback",
    name: "Customer feedback",
    answerKind: "CHOICE",
    choiceOptions: FEEDBACK_CHOICES,
  }),
  competency({
    id: "c-orphan",
    name: "Initiative",
    sectionId: null,
    sectionName: null,
  }),
];

/** The parent owns which subsection is open; this stands in for it. */
function Harness(props: Partial<TreeProps> & { startOpen?: string | null }) {
  const { startOpen = null, ...rest } = props;
  const [selectedId, setSelectedId] = useState<string | null>(startOpen);
  return (
    <ToastProvider>
      <SubsectionTree
        periodName="H2 2026 Appraisal"
        sections={SECTIONS}
        competencies={COMPETENCIES}
        loading={false}
        questionCounts={new Map()}
        unfiledQuestionCount={0}
        editable
        whyNot={null}
        selectedId={selectedId}
        onSelect={(next) => setSelectedId(next?.id ?? null)}
        onChanged={() => {}}
        renderQuestions={(one) => (
          <div data-testid="questions-panel">Questions for {one.name}</div>
        )}
        {...rest}
      />
    </ToastProvider>
  );
}

const open = async (name: RegExp | string) =>
  userEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  createSection = vi.fn().mockResolvedValue({});
  createCompetency = vi.fn().mockResolvedValue({});
  updateCompetency = vi.fn().mockResolvedValue({});
  setChoiceOptions = vi.fn().mockResolvedValue({});
});

describe("reading the framework", () => {
  it("shows each section with how many subsections it has and what it is worth", () => {
    render(<Harness />);
    const core = screen.getByRole("button", { name: /Core competency/ });
    expect(core).toHaveTextContent("3 subsections");
    expect(core).toHaveTextContent("40% of the mark");
    /* Null is "not weighted", never 0%. */
    const kra = screen.getByRole("button", { name: /Key result area/ });
    expect(kra).toHaveTextContent("0 subsections");
    expect(kra).toHaveTextContent("Not weighted");
    expect(kra).not.toHaveTextContent("0%");
  });

  it("says, on each subsection, how it is answered and how many questions it carries", async () => {
    render(<Harness questionCounts={new Map([["c-punct", 2]])} />);
    await open(/Core competency/);

    const punctuality = screen.getByRole("button", { name: /Punctuality/ });
    expect(punctuality).toHaveTextContent("Rated");
    expect(punctuality).toHaveTextContent("2 questions");
    expect(
      screen.getByRole("button", { name: /Follows safety procedures/ }),
    ).toHaveTextContent("Yes or no");
    const feedback = screen.getByRole("button", { name: /Customer feedback/ });
    expect(feedback).toHaveTextContent("Pick one");
    expect(feedback).not.toHaveTextContent("question");
  });

  it("reads a subsection that does not say how it is answered as rated", async () => {
    render(<Harness />);
    await open(/Core competency/);
    expect(
      screen.getByRole("button", { name: /Punctuality/ }),
    ).toHaveTextContent("Rated");
  });

  it("keeps the subsections that are filed under no section in a group of their own", async () => {
    render(<Harness />);
    const unfiled = screen.getByRole("button", {
      name: /Not filed under a section/,
    });
    expect(unfiled).toHaveTextContent("1 subsection");
    await userEvent.click(unfiled);
    expect(
      screen.getByRole("button", { name: /Initiative/ }),
    ).toBeInTheDocument();
  });

  it("says how many of this period's questions are filed under no subsection, and where they are", () => {
    const { unmount } = render(<Harness unfiledQuestionCount={1} />);
    expect(
      screen.getByText(
        "1 question in this period is not filed under a subsection. They are in All questions.",
      ),
    ).toBeInTheDocument();
    unmount();

    render(<Harness unfiledQuestionCount={3} />);
    expect(
      screen.getByText(
        "3 questions in this period are not filed under a subsection. They are in All questions.",
      ),
    ).toBeInTheDocument();
  });

  it("says nothing about unfiled questions when there are none", () => {
    render(<Harness unfiledQuestionCount={0} />);
    expect(
      screen.queryByText(/not filed under a subsection/),
    ).not.toBeInTheDocument();
  });

  it("is loading, and does not claim there are no sections, until the framework has answered once", () => {
    render(<Harness loading sections={[]} competencies={[]} />);
    expect(screen.getByText("Loading the sections")).toBeInTheDocument();
    expect(
      screen.queryByText(/There are no sections yet/),
    ).not.toBeInTheDocument();
  });

  it("says there are none, and where to start, only once it has answered with none", () => {
    render(<Harness sections={[]} competencies={[]} />);
    expect(
      screen.getByText("There are no sections yet. Add one above to start."),
    ).toBeInTheDocument();
  });
});

describe("the two tabs under a subsection", () => {
  it("are 'Rated directly' and 'Answered by questions', with the count on the second", async () => {
    render(<Harness questionCounts={new Map([["c-punct", 2]])} />);
    await open(/Core competency/);
    await open(/Punctuality/);

    expect(
      screen.getByRole("tab", { name: "Rated directly" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Answered by questions/ }),
    ).toHaveTextContent("2");
  });

  it("open on the questions for a level subsection that already has some", async () => {
    render(<Harness questionCounts={new Map([["c-punct", 2]])} />);
    await open(/Core competency/);
    await open(/Punctuality/);

    expect(
      screen.getByRole("tab", { name: /Answered by questions/ }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("questions-panel")).toHaveTextContent(
      "Questions for Punctuality",
    );
  });

  it("open on how it is answered for a level subsection with no questions yet", async () => {
    render(<Harness />);
    await open(/Core competency/);
    await open(/Punctuality/);

    expect(screen.getByRole("tab", { name: "Rated directly" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("How it is answered")).toBeInTheDocument();
  });

  it("open on how it is answered for a yes or no that has questions, because its next decision is how it is answered", async () => {
    render(<Harness questionCounts={new Map([["c-safety", 4]])} />);
    await open(/Core competency/);
    await open(/Follows safety procedures/);

    expect(screen.getByRole("tab", { name: "Rated directly" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("are a view switch and nothing else: both are always reachable and nothing is written by moving between them", async () => {
    render(<Harness questionCounts={new Map([["c-safety", 1]])} />);
    await open(/Core competency/);
    await open(/Follows safety procedures/);

    await userEvent.click(
      screen.getByRole("tab", { name: /Answered by questions/ }),
    );
    expect(screen.getByTestId("questions-panel")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("How it is answered"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Rated directly" }));
    expect(screen.getByLabelText("How it is answered")).toBeInTheDocument();
    expect(screen.queryByTestId("questions-panel")).not.toBeInTheDocument();

    expect(updateCompetency).not.toHaveBeenCalled();
    expect(setChoiceOptions).not.toHaveBeenCalled();
    expect(createCompetency).not.toHaveBeenCalled();
  });

  it("show the kind picker with the kind the subsection has, in the direct tab", async () => {
    render(<Harness />);
    await open(/Core competency/);
    await open(/Follows safety procedures/);
    expect(
      (screen.getByLabelText("How it is answered") as HTMLSelectElement).value,
    ).toBe("BOOLEAN");
  });

  it("show the choices of a pick-a-list subsection with what each is worth", async () => {
    render(<Harness />);
    await open(/Core competency/);
    await open(/Customer feedback/);
    expect((screen.getByLabelText("Choice 1") as HTMLInputElement).value).toBe(
      "Delighted",
    );
    expect(
      (
        screen.getByLabelText(
          "Score for choice 2, as a percentage",
        ) as HTMLInputElement
      ).value,
    ).toBe("60");
  });

  it("close when the subsection is closed", async () => {
    render(<Harness />);
    await open(/Core competency/);
    await open(/Punctuality/);
    expect(
      screen.getByRole("tab", { name: "Rated directly" }),
    ).toBeInTheDocument();
    await open(/Punctuality/);
    expect(
      screen.queryByRole("tab", { name: "Rated directly" }),
    ).not.toBeInTheDocument();
  });

  it("say, in the direct tab, where an unweighted section's answers go: nowhere", async () => {
    render(
      <Harness
        competencies={[
          competency({
            id: "c-kra",
            name: "Revenue target",
            sectionId: "s-kra",
          }),
        ]}
      />,
    );
    await open(/Key result area/);
    await open(/Revenue target/);
    expect(
      screen.getByText(
        "Key result area is not weighted, so a level recorded on this counts towards no part of the mark.",
      ),
    ).toBeInTheDocument();
  });
});

describe("adding a section", () => {
  const openForm = async () =>
    userEvent.click(screen.getByRole("button", { name: "Add a section" }));
  const nameField = () =>
    screen.getByLabelText("New section") as HTMLInputElement;

  it("asks what it counts towards, and sends that with the name and an order after the others", async () => {
    const onChanged = vi.fn();
    render(<Harness onChanged={onChanged} />);
    await openForm();
    await userEvent.type(nameField(), "Our values");
    await userEvent.selectOptions(
      screen.getByLabelText("What the new section counts towards"),
      "BEHAVIOURAL_COMPETENCY",
    );
    await userEvent.click(screen.getByRole("button", { name: "Add section" }));

    await waitFor(() =>
      expect(createSection).toHaveBeenCalledWith({
        name: "Our values",
        order: 2,
        component: "BEHAVIOURAL_COMPETENCY",
      }),
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("sends no component at all for a section that counts towards nothing", async () => {
    render(<Harness />);
    await openForm();
    await userEvent.type(nameField(), "Kept for the record");
    await userEvent.click(screen.getByRole("button", { name: "Add section" }));

    await waitFor(() => expect(createSection).toHaveBeenCalled());
    expect(createSection.mock.calls[0]?.[0]).toEqual({
      name: "Kept for the record",
      order: 2,
    });
    expect(createSection.mock.calls[0]?.[0]).not.toHaveProperty("component");
  });

  it("stays open and empty after each one, with the cursor in the name, so the next can be typed at once", async () => {
    render(<Harness />);
    await openForm();
    await userEvent.type(nameField(), "First{Enter}");
    await waitFor(() => expect(createSection).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(nameField().value).toBe(""));
    expect(nameField()).toHaveFocus();

    await userEvent.type(nameField(), "Second{Enter}");
    await waitFor(() => expect(createSection).toHaveBeenCalledTimes(2));
    expect(createSection.mock.calls[1]?.[0]).toMatchObject({ name: "Second" });
    expect(nameField()).toBeInTheDocument();
  });

  it("is closed with Done, and offered again", async () => {
    render(<Harness />);
    await openForm();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByLabelText("New section")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add a section" }),
    ).toBeInTheDocument();
  });

  it("refuses a name that is not one, without asking the API", async () => {
    render(<Harness />);
    await openForm();
    await userEvent.type(nameField(), "a{Enter}");
    expect(
      await screen.findByText("Give the section a name."),
    ).toBeInTheDocument();
    expect(createSection).not.toHaveBeenCalled();
  });

  it("shows the API's refusal as it comes, and keeps the name", async () => {
    createSection.mockRejectedValue(
      new ApiError(
        409,
        "conflict",
        "There is already a section called Our values.",
      ),
    );
    render(<Harness />);
    await openForm();
    await userEvent.type(nameField(), "Our values{Enter}");

    expect(
      await screen.findByText("There is already a section called Our values."),
    ).toBeInTheDocument();
    expect(nameField().value).toBe("Our values");
  });
});

describe("adding a subsection", () => {
  const nameField = () =>
    screen.getByLabelText("New subsection") as HTMLInputElement;
  const openCore = async () => open(/Core competency/);

  it("files it under the section that is open, as a level unless something else is chosen", async () => {
    const onChanged = vi.fn();
    render(<Harness onChanged={onChanged} />);
    await openCore();
    await userEvent.type(nameField(), "Teamwork");
    await userEvent.click(
      screen.getByRole("button", { name: "Add subsection" }),
    );

    await waitFor(() => expect(createCompetency).toHaveBeenCalledTimes(1));
    const body = createCompetency.mock.calls[0]?.[0];
    expect(body).toEqual({
      name: "Teamwork",
      scaleMax: 5,
      sectionId: "s-core",
    });
    /* A body that never mentions a kind is a level, and a server that predates
       kinds must never hear the word. */
    expect(body).not.toHaveProperty("answerKind");
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("sends the kind that was chosen when it is not a level", async () => {
    render(<Harness />);
    await openCore();
    await userEvent.type(nameField(), "Follows the dress code");
    await userEvent.selectOptions(
      screen.getByLabelText("Answered by"),
      "BOOLEAN",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Add subsection" }),
    );

    await waitFor(() =>
      expect(createCompetency).toHaveBeenCalledWith({
        name: "Follows the dress code",
        scaleMax: 5,
        sectionId: "s-core",
        answerKind: "BOOLEAN",
      }),
    );
  });

  it("offers the three kinds, with the scale spelled out for a level", async () => {
    render(<Harness />);
    await openCore();
    expect(
      within(screen.getByLabelText("Answered by"))
        .getAllByRole("option")
        .map((one) => one.textContent),
    ).toEqual([
      "A level on a scale, 1 to 5",
      "Yes or no",
      "Pick one from a list",
    ]);
  });

  it("stays open and empty after each one, with the cursor in the name, and keeps the kind for the next", async () => {
    render(<Harness />);
    await openCore();
    await userEvent.selectOptions(
      screen.getByLabelText("Answered by"),
      "BOOLEAN",
    );
    await userEvent.type(nameField(), "First{Enter}");
    await waitFor(() => expect(createCompetency).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(nameField().value).toBe(""));
    expect(nameField()).toHaveFocus();

    await userEvent.type(nameField(), "Second{Enter}");
    await waitFor(() => expect(createCompetency).toHaveBeenCalledTimes(2));
    /* Ten yes-or-no subsections in a row should not mean choosing it ten times. */
    expect(createCompetency.mock.calls[1]?.[0]).toMatchObject({
      name: "Second",
      answerKind: "BOOLEAN",
    });
  });

  it("refuses a name that is not one, without asking the API", async () => {
    render(<Harness />);
    await openCore();
    await userEvent.type(nameField(), "x{Enter}");
    expect(await screen.findByText("Give it a name.")).toBeInTheDocument();
    expect(createCompetency).not.toHaveBeenCalled();
  });

  it("shows the API's refusal as it comes", async () => {
    createCompetency.mockRejectedValue(
      new ApiError(
        409,
        "conflict",
        "There is already a subsection called Teamwork.",
      ),
    );
    render(<Harness />);
    await openCore();
    await userEvent.type(nameField(), "Teamwork{Enter}");
    expect(
      await screen.findByText("There is already a subsection called Teamwork."),
    ).toBeInTheDocument();
  });

  it("is not offered under the group of subsections that have no section", async () => {
    render(<Harness />);
    await userEvent.click(
      screen.getByRole("button", { name: /Not filed under a section/ }),
    );
    expect(screen.queryByLabelText("New subsection")).not.toBeInTheDocument();
  });
});

describe("for somebody who cannot change the framework", () => {
  const props = {
    editable: false,
    whyNot:
      "Only somebody who can manage settings can change sections, subsections and how they are answered.",
  };

  it("offers no way to add a section, and says why once", () => {
    render(<Harness {...props} />);
    expect(
      screen.queryByRole("button", { name: "Add a section" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText(props.whyNot!)).toHaveLength(1);
  });

  it("offers no way to add a subsection under a section", async () => {
    render(<Harness {...props} />);
    await open(/Core competency/);
    expect(screen.queryByLabelText("New subsection")).not.toBeInTheDocument();
  });

  it("still shows how each subsection is answered, with its kind read only", async () => {
    render(<Harness {...props} />);
    await open(/Core competency/);
    await open(/Follows safety procedures/);
    expect(screen.getByLabelText("How it is answered")).toBeDisabled();
  });
});

describe("what a new subsection is made from", () => {
  it("is the name trimmed, the company scale, and the section it goes under", () => {
    expect(newSubsectionBody({ name: "  Teamwork ", sectionId: "s1" })).toEqual(
      {
        name: "Teamwork",
        scaleMax: 5,
        sectionId: "s1",
      },
    );
  });

  it("leaves out a section that is none, and a kind that is a level", () => {
    for (const sectionId of ["", null, undefined]) {
      expect(
        newSubsectionBody({
          name: "Teamwork",
          sectionId,
          answerKind: "RATING",
        }),
      ).toEqual({ name: "Teamwork", scaleMax: 5 });
    }
  });

  it("carries the kind when it is not a level", () => {
    expect(
      newSubsectionBody({
        name: "Safe",
        sectionId: "s1",
        answerKind: "CHOICE",
      }),
    ).toMatchObject({ answerKind: "CHOICE" });
  });

  it("is refused as a name under two characters, in one sentence everywhere", () => {
    expect(subsectionNameProblem("a")).toBe("Give it a name.");
    expect(subsectionNameProblem("   ")).toBe("Give it a name.");
    expect(subsectionNameProblem("ab")).toBeNull();
  });
});

describe("the sections to list", () => {
  const apiSection = (over: Partial<ApiSection>): ApiSection => ({
    id: "s1",
    name: "Core competency",
    order: 0,
    competencyCount: 0,
    component: "CORE_COMPETENCY",
    weightBp: 4000,
    ...over,
  });
  const group = (over: Partial<FrameworkGroup>): FrameworkGroup => ({
    sectionId: "g1",
    sectionName: "From the framework",
    competencies: [],
    ...over,
  });

  it("are the API's own when it has answered, with what each is worth", () => {
    expect(
      sectionOptionsOf(
        [
          apiSection({}),
          apiSection({ id: "s2", name: "Culture", weightBp: null }),
        ],
        [group({})],
      ),
    ).toEqual([
      { id: "s1", name: "Core competency", weightBp: 4000 },
      { id: "s2", name: "Culture", weightBp: null },
    ]);
  });

  it("are the framework's groups when it has not, with no weight claimed for them", () => {
    expect(
      sectionOptionsOf(
        [],
        [group({}), group({ sectionId: null, sectionName: "Other" })],
      ),
    ).toEqual([{ id: "g1", name: "From the framework", weightBp: undefined }]);
  });
});
