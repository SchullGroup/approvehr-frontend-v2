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
 * Starting a new version from inside the Questions dialog.
 *
 * The tree and the dialog it starts are tested on their own. What is worth a test
 * here is the wiring between the tree and the period: a draft period's questions
 * were moved to the new subsection on the server, so the dialog has to read them
 * again, and the framework and the sections with them. A tree that re-read only the
 * framework would show the new subsection with none of the questions that were just
 * moved onto it, which reads as them having been lost. Nothing about that is
 * visible to `tsc`.
 */

let questions: ApiQuestion[];
let competencies: ApiCompetency[];
let sections: ApiSection[];

let reloadQuestions: Mock<() => void>;
let reloadFramework: Mock<() => void>;
let reloadSections: Mock<() => void>;
let newCompetencyVersion: Mock<(...args: unknown[]) => Promise<unknown>>;

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
    loading: false,
    error: null,
    source: "api",
    reload: reloadFramework,
  }),
  useSections: () => ({ sections, loading: false, reload: reloadSections }),
  useFrameworkActions: () => ({
    editable: true,
    createSection: vi.fn(),
    createCompetency: vi.fn(),
    updateCompetency: vi.fn(),
    setChoiceOptions: vi.fn(),
    newCompetencyVersion: (...args: unknown[]) => newCompetencyVersion(...args),
  }),
  useAppraisals: () => ({ cycles: [], loading: false }),
}));
vi.mock("@/lib/permissions", () => ({ useCan: () => true }));

const section = (): ApiSection => ({
  id: "s-core",
  name: "Core competency",
  order: 0,
  competencyCount: 1,
  component: "CORE_COMPETENCY",
  weightBp: 4000,
});

const teamwork = (over: Partial<ApiCompetency> = {}): ApiCompetency => ({
  id: "c-team",
  name: "Teamwork",
  sectionId: "s-core",
  sectionName: "Core competency",
  description: null,
  isCore: false,
  scaleMax: 5,
  active: true,
  archived: false,
  ratingCount: 12,
  answerKind: "BOOLEAN",
  ...over,
});

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

/** Down to the dialog that starts it: By section, the section, the subsection, its rated tab. */
const openTheDialog = async () => {
  await userEvent.click(screen.getByRole("radio", { name: "By section" }));
  await userEvent.click(
    screen.getByRole("button", { name: /Core competency/ }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: /Teamwork/, expanded: false }),
  );
  await userEvent.click(screen.getByRole("tab", { name: "How it is rated" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Start a new version" }),
  );
};

const confirm = async (way: string) => {
  await userEvent.selectOptions(
    screen.getByLabelText(/How the new version is answered/),
    way,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Start new version" }),
  );
};

beforeEach(() => {
  questions = [];
  sections = [section()];
  competencies = [teamwork()];
  reloadQuestions = vi.fn();
  reloadFramework = vi.fn();
  reloadSections = vi.fn();
  newCompetencyVersion = vi.fn().mockResolvedValue({
    competency: teamwork({ id: "c-new", ratingCount: 0, answerKind: "RATING" }),
    retired: { id: "c-team", name: "Teamwork (retired)", ratingsKept: 12 },
    notes: [],
  });
});

describe("after a new version has been started", () => {
  it("reads the period's questions again, and the framework and the sections with them", async () => {
    mount();
    await openTheDialog();
    expect(reloadQuestions).not.toHaveBeenCalled();
    expect(reloadFramework).not.toHaveBeenCalled();

    await confirm("A level on a scale, 1 to 5");

    await waitFor(() =>
      expect(newCompetencyVersion).toHaveBeenCalledWith("c-team", "RATING"),
    );
    await waitFor(() => expect(reloadQuestions).toHaveBeenCalledTimes(1));
    expect(reloadFramework).toHaveBeenCalledTimes(1);
    expect(reloadSections).toHaveBeenCalledTimes(1);
  });

  it("reads nothing again when the API refuses, because nothing changed", async () => {
    newCompetencyVersion.mockRejectedValue(
      new ApiError(
        409,
        "conflict",
        '"Teamwork" is asked on the review form of "H2 2026 Appraisal", which is running.',
      ),
    );
    mount();
    await openTheDialog();
    await confirm("A level on a scale, 1 to 5");

    await screen.findByText(/which is running/);
    expect(reloadQuestions).not.toHaveBeenCalled();
    expect(reloadFramework).not.toHaveBeenCalled();
    expect(reloadSections).not.toHaveBeenCalled();
  });
});
