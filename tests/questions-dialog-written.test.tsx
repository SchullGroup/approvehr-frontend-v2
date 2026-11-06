import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiCompetency,
  ApiQuestion,
  ApiSection,
  ReviewAudience,
} from "@/lib/api/performance";
import { QuestionsDialog } from "@/app/(app)/performance/period-dialogs";
import { WRITTEN_NEVER_COUNTS } from "@/lib/performance/answer-kind";

/**
 * A subsection answered in the person's own words, in the Questions dialog.
 *
 * Three places name how a subsection is answered: the row of **All questions** a
 * period has once it asks the subsection on its form, the **Subsection** picker a
 * question is filed under, and the row and panel of **By section**. For a written
 * subsection each of them has a wrong thing it could say that a level or a pick has
 * a right way of saying: that it is "rated", that it feeds the mark through its
 * section, that it has choices to add. None of that is visible to `tsc`.
 */

let questions: ApiQuestion[];
let competencies: ApiCompetency[];
let sections: ApiSection[];

const NO_GROUPS: never[] = [];

vi.mock("@/lib/store/performance", () => ({
  useCycleQuestions: () => ({
    questions,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useFramework: () => ({
    competencies,
    groups: NO_GROUPS,
    loading: false,
    error: null,
    source: "api",
    reload: vi.fn(),
  }),
  useSections: () => ({ sections, loading: false, reload: vi.fn() }),
  useFrameworkActions: () => ({
    editable: true,
    createSection: vi.fn(),
    createCompetency: vi.fn(),
    updateCompetency: vi.fn().mockResolvedValue({}),
    setChoiceOptions: vi.fn(),
  }),
  useAppraisals: () => ({ cycles: [], loading: false }),
}));
vi.mock("@/lib/permissions", () => ({ useCan: () => true }));

const section = (over: Partial<ApiSection> = {}): ApiSection => ({
  id: "s-beh",
  name: "Behavioural competency",
  order: 0,
  competencyCount: 0,
  component: "BEHAVIOURAL_COMPETENCY",
  weightBp: 3000,
  ...over,
});

const subsection = (over: Partial<ApiCompetency>): ApiCompetency => ({
  id: "c",
  name: "Subsection",
  sectionId: "s-beh",
  sectionName: "Behavioural competency",
  description: null,
  isCore: false,
  scaleMax: 5,
  active: true,
  archived: false,
  ratingCount: 0,
  ...over,
});

/** The question a period has once it asks a subsection on the form. */
const direct = (
  competencyId: string,
  name: string,
  askedOf: ReviewAudience[],
  kind: ApiQuestion["kind"],
): ApiQuestion => ({
  id: `q-${competencyId}`,
  reviewCycleId: "c-1",
  competencyId,
  prompt: name,
  kind,
  askedOf,
  required: true,
  options: [],
  allowCustom: false,
  order: 1,
  source: "HR",
  departmentIds: [],
  answersSubsection: true,
  competencyName: name,
});

const mount = () =>
  render(
    <QuestionsDialog
      open
      cycleId="c-1"
      periodName="H2 2026 Appraisal"
      stage="DRAFT"
      onClose={vi.fn()}
      onAdd={vi.fn().mockResolvedValue(undefined)}
      onUpdate={vi.fn().mockResolvedValue(undefined)}
      onRemove={vi.fn().mockResolvedValue(undefined)}
      onAskSubsection={vi.fn().mockResolvedValue(undefined)}
      onStopAskingSubsection={vi.fn().mockResolvedValue(undefined)}
    />,
  );

const rowOf = (text: string) =>
  screen.getByText(text, { selector: "span.block" }).closest("li");

const toggleOf = (name: string) =>
  screen
    .getAllByRole("button", { name: new RegExp(name) })
    .find((button) => button.hasAttribute("aria-expanded")) as HTMLElement;

beforeEach(() => {
  sections = [section()];
  competencies = [
    subsection({ id: "c-level", name: "Adaptability" }),
    subsection({ id: "c-words", name: "Communication", answerKind: "TEXT" }),
  ];
  questions = [];
});

describe("All questions: the row a written subsection has once the period asks it", () => {
  it("says it is written directly, and not rated, whoever is asked", () => {
    questions = [direct("c-words", "Communication", ["MANAGER"], "TEXT")];
    mount();
    const row = rowOf("Communication") as HTMLElement;
    expect(within(row).getByText("Written directly")).toBeInTheDocument();
    expect(within(row).queryByText("Rated directly")).not.toBeInTheDocument();
  });

  it("says who is asked in the same three words as for any other kind", () => {
    for (const [askedOf, word] of [
      [["MANAGER"], "Manager"],
      [["SELF"], "Employee"],
      [["SELF", "MANAGER"], "Both"],
    ] as const) {
      questions = [direct("c-words", "Communication", [...askedOf], "TEXT")];
      const { unmount } = mount();
      expect(
        within(rowOf("Communication") as HTMLElement).getByText(word),
      ).toBeInTheDocument();
      unmount();
    }
  });

  it("is still required, and has no pencil, because there is nothing on it to edit", () => {
    questions = [direct("c-words", "Communication", ["SELF"], "TEXT")];
    mount();
    const row = rowOf("Communication") as HTMLElement;
    expect(within(row).getByText("Must be answered")).toBeInTheDocument();
    expect(
      within(row).queryByRole("button", { name: /^Edit/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps saying rated directly for a level, so the change is the kind and not every row", () => {
    questions = [direct("c-level", "Adaptability", ["SELF"], "RATING")];
    mount();
    const row = rowOf("Adaptability") as HTMLElement;
    expect(within(row).getByText("Rated directly")).toBeInTheDocument();
    expect(within(row).queryByText("Written directly")).not.toBeInTheDocument();
  });

  it("is not called written directly when it is an ordinary written question, which is not a subsection", () => {
    questions = [
      {
        ...direct("c-words", "What went well?", [], "TEXT"),
        id: "q-plain",
        competencyId: null,
        answersSubsection: false,
      },
    ];
    mount();
    const row = rowOf("What went well?") as HTMLElement;
    expect(within(row).getByText("Own words")).toBeInTheDocument();
    expect(within(row).queryByText("Written directly")).not.toBeInTheDocument();
  });
});

describe("the Subsection picker a question is filed under", () => {
  const pickerOptions = () =>
    Array.from(
      (screen.getByLabelText("Subsection") as HTMLSelectElement).options,
    ).map((option) => option.text);

  it("says a written subsection is written, in the comma form, and a level is its bare name", async () => {
    mount();
    await userEvent.selectOptions(
      screen.getByLabelText("Section"),
      "Behavioural competency, 30% of the mark",
    );
    expect(pickerOptions()).toEqual([
      "None",
      "Adaptability",
      "Communication, written",
    ]);
  });

  it("says, once a written subsection is chosen, that nothing recorded on it counts, and quotes no weight", async () => {
    mount();
    await userEvent.selectOptions(
      screen.getByLabelText("Section"),
      "Behavioural competency, 30% of the mark",
    );
    const select = screen.getByLabelText("Subsection") as HTMLSelectElement;
    const option = Array.from(select.options).find(
      (one) => one.text === "Communication, written",
    ) as HTMLOptionElement;
    await userEvent.selectOptions(select, option.value);

    expect(
      screen.getByText(
        "Answers to questions written here do not count towards the mark. Nor does the written answer recorded on Communication.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Behavioural competency is 30% of the mark/),
    ).not.toBeInTheDocument();
  });

  it("still says where the mark comes from for a level", async () => {
    mount();
    await userEvent.selectOptions(
      screen.getByLabelText("Section"),
      "Behavioural competency, 30% of the mark",
    );
    const select = screen.getByLabelText("Subsection") as HTMLSelectElement;
    const option = Array.from(select.options).find(
      (one) => one.text === "Adaptability",
    ) as HTMLOptionElement;
    await userEvent.selectOptions(select, option.value);
    expect(
      screen.getByText(
        /Behavioural competency is 30% of the mark, and it comes from the level recorded on Adaptability/,
      ),
    ).toBeInTheDocument();
  });
});

describe("By section: a written subsection", () => {
  const openBySection = async () => {
    await userEvent.click(screen.getByRole("radio", { name: "By section" }));
    await userEvent.click(
      screen.getByRole("button", { name: /Behavioural competency/ }),
    );
  };

  it("is tagged Written in front of its name, and a level is tagged Rated", async () => {
    mount();
    await openBySection();
    expect(toggleOf("Communication")).toHaveTextContent("Written");
    expect(toggleOf("Adaptability")).toHaveTextContent("Rated");
  });

  it("says on its How it is rated tab that it never counts, once, and has no choices to add", async () => {
    mount();
    await openBySection();
    await userEvent.click(toggleOf("Communication"));
    await userEvent.click(screen.getByRole("tab", { name: "How it is rated" }));

    expect(
      (screen.getByLabelText("How it is answered") as HTMLSelectElement).value,
    ).toBe("TEXT");
    expect(screen.getAllByText(WRITTEN_NEVER_COUNTS)).toHaveLength(1);
    expect(screen.queryByLabelText("Choice 1")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add a choice" }),
    ).not.toBeInTheDocument();
  });

  it("can be asked on the review form, with the lines under it true of words", async () => {
    mount();
    await openBySection();
    await userEvent.click(toggleOf("Communication"));
    await userEvent.click(screen.getByRole("tab", { name: "How it is rated" }));

    await userEvent.selectOptions(
      screen.getByLabelText("Ask it on the review form"),
      "Both",
    );
    expect(
      screen.getByText(
        "The manager's words are recorded. The employee's are shown beside them.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add to the review form" }),
    ).toBeEnabled();
  });

  it("offers In their own words to a new subsection, beside the other three ways", async () => {
    mount();
    await openBySection();
    expect(
      within(screen.getByLabelText("Answered by"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([
      "A level on a scale, 1 to 5",
      "Yes or no",
      "Pick one from a list",
      "In their own words",
    ]);
  });
});
