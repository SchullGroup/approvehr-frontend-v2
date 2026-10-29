import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuestionsDialog } from "@/app/(app)/performance/period-dialogs";

/**
 * Filing a question says what filing does, and does not promise a weight.
 *
 * The dialog said "Answers to this count towards Core competency, which is 40%
 * of the mark" under the two pickers. Nothing makes that so: the competency
 * part of the mark is built from the level a manager records on the subsection,
 * and the score register never reads the answer to a question. `tsc` cannot see
 * a sentence being false; only mounting the dialog and reading it can, so this
 * does, in the three states HR actually passes through while choosing.
 */

vi.mock("@/lib/store/performance", () => ({
  useCycleQuestions: () => ({
    questions: [],
    loading: false,
    reload: vi.fn(),
  }),
  useFramework: () => ({
    competencies: [
      {
        id: "c-dil",
        name: "Diligence",
        sectionId: "s-core",
        sectionName: "Core competency",
        description: null,
        isCore: true,
        scaleMax: 5,
        active: true,
        archived: false,
        ratingCount: 0,
      },
      {
        id: "c-pun",
        name: "Punctuality",
        sectionId: null,
        sectionName: null,
        description: null,
        isCore: false,
        scaleMax: 5,
        active: true,
        archived: false,
        ratingCount: 0,
      },
    ],
    groups: [],
    loading: false,
    error: null,
    source: "api",
  }),
  useSections: () => ({
    sections: [
      {
        id: "s-core",
        name: "Core competency",
        order: 1,
        competencyCount: 1,
        component: "CORE_COMPETENCY",
        weightBp: 4000,
      },
      {
        id: "s-culture",
        name: "Culture",
        order: 2,
        competencyCount: 0,
        component: null,
        weightBp: null,
      },
    ],
    loading: false,
  }),
  useFrameworkActions: () => ({}),
  useAppraisals: () => ({ cycles: [], loading: false }),
}));

const mount = () =>
  render(
    <QuestionsDialog
      open
      cycleId="c-1"
      periodName="H2 2026 Appraisal"
      onClose={vi.fn()}
      onAdd={vi.fn().mockResolvedValue(undefined)}
      onUpdate={vi.fn().mockResolvedValue(undefined)}
      onRemove={vi.fn()}
    />,
  );

const pickSection = (name: string) =>
  userEvent.selectOptions(screen.getByLabelText("Section"), name);
/* A yes-or-no or pick-one option reads "Name, yes or no": found by its name, chosen by its value. */
const pickSubsection = (name: string) => {
  const select = screen.getByLabelText("Subsection") as HTMLSelectElement;
  const option = Array.from(select.options).find(
    (one) => one.text === name || one.text.startsWith(`${name}, `),
  );
  if (!option) throw new Error(`No subsection called ${name} in the picker.`);
  return userEvent.selectOptions(select, option.value);
};

describe("the sentence under Section and Subsection", () => {
  it("says an answer does not count, before anything is chosen", () => {
    mount();
    expect(
      screen.getByText(
        "Answers to a question do not count towards the mark. The mark comes from what is recorded on each subsection, under Competency ratings.",
      ),
    ).toBeInTheDocument();
  });

  it("names the weight, and where the mark really comes from, once a subsection is chosen", async () => {
    mount();
    await pickSection("Core competency, 40% of the mark");
    await pickSubsection("Diligence");
    expect(
      screen.getByText(
        "Answers to a question do not count towards the mark. Core competency is 40% of the mark, and it comes from the level recorded on Diligence, under Competency ratings.",
      ),
    ).toBeInTheDocument();
  });

  it("says a section that is not weighted is not weighted", async () => {
    mount();
    await pickSection("Culture, not weighted");
    /* No subsection yet: the warning, which is the only state that is one. */
    expect(
      screen.getByText(
        "Pick a subsection to file this question under. A section on its own files it under nothing.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Culture has no subsections yet. Add one to file this question under it.",
      ),
    ).toBeInTheDocument();
  });

  it("warns when a section is chosen and no subsection is", async () => {
    mount();
    await pickSection("Core competency, 40% of the mark");
    expect(
      screen.getByText(
        "Pick a subsection to file this question under. A section on its own files it under nothing.",
      ),
    ).toBeInTheDocument();
  });

  it("never tells HR that an answer counts towards a section", async () => {
    mount();
    await pickSection("Core competency, 40% of the mark");
    await pickSubsection("Diligence");
    expect(document.body.textContent).not.toMatch(
      /answers? to (this|these|it|them) counts?/i,
    );
    expect(document.body.textContent).not.toMatch(
      /count towards core competency/i,
    );
  });

  it("says an unfiled subsection counts towards no part of the mark", async () => {
    mount();
    await pickSubsection("Punctuality");
    expect(
      screen.getByText(
        "Answers to a question do not count towards the mark. Punctuality is not filed under a section, so a level recorded on it counts towards no part of the mark either.",
      ),
    ).toBeInTheDocument();
  });
});
