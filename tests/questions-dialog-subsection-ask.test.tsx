import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ApiError } from "@/lib/api/client";
import type {
  ApiCompetency,
  ApiQuestion,
  ApiSection,
  ReviewAudience,
  ReviewCycleStage,
} from "@/lib/api/performance";
import { QuestionsDialog } from "@/app/(app)/performance/period-dialogs";

/**
 * Putting a directly rated subsection on a period's review form, from the
 * Questions dialog.
 *
 * Two places show it. **By section**, on a subsection's *How it is rated* tab, has
 * the control. **All questions** lists the question the period then has, as a row
 * with its own badge, its own words for who is asked and no pencil. What `tsc`
 * cannot see: the control drawn for somebody who may not use it or before the
 * period has been read, a row that says "Rating" for a subsection or offers an
 * edit that has nothing to edit, a bin that deletes a question where it should stop
 * asking, and an older server's questions turning into something else.
 */

let questions: ApiQuestion[];
let questionsLoading: boolean;
let questionsError: ApiError | null;
let competencies: ApiCompetency[];
let sections: ApiSection[];
let connected: boolean;
let canManage: boolean;

let reloadQuestions: Mock<() => void>;
let reloadFramework: Mock<() => void>;
let reloadSections: Mock<() => void>;

/** Stable on purpose: a mock that rebuilt it every render is not what the hook does. */
const NO_GROUPS: never[] = [];

vi.mock("@/lib/store/performance", () => ({
  useCycleQuestions: () => ({
    questions,
    loading: questionsLoading,
    error: questionsError,
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
    editable: connected,
    createSection: vi.fn(),
    createCompetency: vi.fn(),
    updateCompetency: vi.fn().mockResolvedValue({}),
    setChoiceOptions: vi.fn(),
  }),
  useAppraisals: () => ({ cycles: [], loading: false }),
}));
vi.mock("@/lib/permissions", () => ({ useCan: () => canManage }));

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

const ordinary = (
  id: string,
  prompt: string,
  competencyId: string | null = null,
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

/** The question a period has once it asks a subsection on the form. */
const direct = (
  competencyId: string,
  name: string,
  askedOf: ReviewAudience[],
  over: Partial<ApiQuestion> = {},
): ApiQuestion => ({
  ...ordinary(`q-${competencyId}`, name, competencyId),
  kind: "RATING",
  askedOf,
  order: 2,
  answersSubsection: true,
  competencyName: name,
  ...over,
});

const WENT_WELL = "What went well for you this period?";
const REFUSAL =
  '"Adaptability" is already answered on 12 reviews in "H2 2026 Appraisal", so it cannot be taken off the form.';

type Props = React.ComponentProps<typeof QuestionsDialog>;

const mount = ({
  asks = true,
  staged = true,
  ...over
}: Partial<Props> & {
  /** False builds a dialog that was given no way to write the control. */
  asks?: boolean;
  /** False builds a dialog that was not told where the period is. */
  staged?: boolean;
} = {}) => {
  const onAskSubsection = vi.fn().mockResolvedValue(undefined);
  const onStopAskingSubsection = vi.fn().mockResolvedValue(undefined);
  const onRemove = vi.fn().mockResolvedValue(undefined);
  const props: Props = {
    open: true,
    cycleId: "c-1",
    periodName: "H2 2026 Appraisal",
    onClose: vi.fn(),
    onAdd: vi.fn().mockResolvedValue(undefined),
    onUpdate: vi.fn().mockResolvedValue(undefined),
    onRemove,
    ...(staged ? { stage: "DRAFT" as ReviewCycleStage } : {}),
    ...(asks ? { onAskSubsection, onStopAskingSubsection } : {}),
    ...over,
  };
  const view = render(<QuestionsDialog {...props} />);
  return {
    onAskSubsection,
    onStopAskingSubsection,
    onRemove,
    /** The same dialog again, after the module state above has changed. */
    again: () => view.rerender(<QuestionsDialog {...props} />),
  };
};

const viewSwitch = (label: "All questions" | "By section") =>
  userEvent.click(screen.getByRole("radio", { name: label }));

/** The toggle of a subsection, not its Add question button, which carries the name too. */
const toggleOf = (name: string) =>
  screen
    .getAllByRole("button", { name: new RegExp(name) })
    .find((button) => button.hasAttribute("aria-expanded")) as HTMLElement;

/** By section, the section open, the subsection open, on *How it is rated*. */
const openRated = async (name: string) => {
  await viewSwitch("By section");
  await userEvent.click(
    screen.getByRole("button", { name: /Behavioural competency/ }),
  );
  await userEvent.click(toggleOf(name));
  await userEvent.click(screen.getByRole("tab", { name: "How it is rated" }));
};

const control = () =>
  screen.getByLabelText("Ask it on the review form") as HTMLSelectElement;
const noControl = () =>
  expect(
    screen.queryByLabelText("Ask it on the review form"),
  ).not.toBeInTheDocument();

const rowOf = (text: string) =>
  screen.getByText(text, { selector: "span.block" }).closest("li");

/** A press on Remove in the half second after it appears is ignored (a double tap). */
const confirmRemoval = async (name: string) => {
  await new Promise((resolve) => setTimeout(resolve, 600));
  await userEvent.click(
    screen.getByRole("button", {
      name: `Remove "${name}" from the review form`,
    }),
  );
};

beforeEach(() => {
  questions = [];
  questionsLoading = false;
  questionsError = null;
  sections = [section()];
  competencies = [
    subsection({ id: "c-adapt", name: "Adaptability" }),
    subsection({ id: "c-team", name: "Teamwork", answerKind: "BOOLEAN" }),
  ];
  connected = true;
  canManage = true;
  reloadQuestions = vi.fn();
  reloadFramework = vi.fn();
  reloadSections = vi.fn();
});

describe("By section: Ask it on the review form", () => {
  it("is on a subsection's How it is rated tab, on Not asked when the period asks nothing", async () => {
    mount();
    await openRated("Adaptability");
    expect(control().value).toBe("none");
    expect(
      within(control())
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Not asked", "The manager", "The employee", "Both"]);
  });

  it("puts the subsection on the form, then reads the period and the framework again", async () => {
    const { onAskSubsection } = mount();
    await openRated("Adaptability");

    await userEvent.selectOptions(control(), "The manager");

    await waitFor(() =>
      expect(onAskSubsection).toHaveBeenCalledWith("c-adapt", ["MANAGER"]),
    );
    await waitFor(() => expect(reloadQuestions).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(reloadFramework).toHaveBeenCalledTimes(1));
    expect(reloadSections).toHaveBeenCalledTimes(1);
  });

  it("asks both of the person and their manager with one write", async () => {
    const { onAskSubsection } = mount();
    await openRated("Adaptability");
    await userEvent.selectOptions(control(), "Both");
    await waitFor(() =>
      expect(onAskSubsection).toHaveBeenCalledWith("c-adapt", [
        "SELF",
        "MANAGER",
      ]),
    );
  });

  it("shows what the period already asks of that subsection, and not of another", async () => {
    questions = [direct("c-adapt", "Adaptability", ["SELF", "MANAGER"])];
    mount();
    await openRated("Teamwork");
    expect(control().value).toBe("none");
  });

  it("shows what the period already asks", async () => {
    questions = [direct("c-adapt", "Adaptability", ["SELF", "MANAGER"])];
    mount();
    await openRated("Adaptability");
    expect(control().value).toBe("both");
    expect(
      screen.getByText(
        "The manager's answer counts. The employee's is shown beside it.",
      ),
    ).toBeInTheDocument();
  });

  it("takes it off the form for Not asked, with the stop and not a write", async () => {
    questions = [direct("c-adapt", "Adaptability", ["MANAGER"])];
    const { onAskSubsection, onStopAskingSubsection } = mount();
    await openRated("Adaptability");

    await userEvent.selectOptions(control(), "Not asked");

    await waitFor(() =>
      expect(onStopAskingSubsection).toHaveBeenCalledWith("c-adapt"),
    );
    expect(onAskSubsection).not.toHaveBeenCalled();
    await waitFor(() => expect(reloadQuestions).toHaveBeenCalled());
  });

  it("shows the API's refusal as it comes, reads the period again, and leaves the control where the period has it", async () => {
    questions = [direct("c-adapt", "Adaptability", ["MANAGER"])];
    const { onStopAskingSubsection } = mount();
    onStopAskingSubsection.mockRejectedValue(
      new ApiError(409, "conflict", REFUSAL),
    );
    await openRated("Adaptability");

    await userEvent.selectOptions(control(), "Not asked");

    expect(await screen.findByText(REFUSAL)).toBeInTheDocument();
    expect(control().value).toBe("manager");
    /* The list may not be what the server holds, which is often why it refused. */
    await waitFor(() => expect(reloadQuestions).toHaveBeenCalled());
  });

  it("reads the period again after a refused write that was putting it on the form, as it does for taking it off", async () => {
    const { onAskSubsection } = mount();
    onAskSubsection.mockRejectedValue(
      new ApiError(409, "conflict", "H2 2026 Appraisal has started."),
    );
    await openRated("Adaptability");

    await userEvent.selectOptions(control(), "The manager");

    expect(
      await screen.findByText("H2 2026 Appraisal has started."),
    ).toBeInTheDocument();
    await waitFor(() => expect(reloadQuestions).toHaveBeenCalled());
  });

  it.each(["SELF", "MANAGER", "CALIBRATION", "PUBLISHED"] as const)(
    "is switched off, with the period's name, once the period is at %s",
    async (stage) => {
      mount({ stage });
      await openRated("Adaptability");
      expect(control()).toBeDisabled();
      expect(
        screen.getByText(
          "H2 2026 Appraisal has started, so this can no longer change.",
        ),
      ).toBeInTheDocument();
    },
  );

  it("is switched off for a period whose stage the dialog was not told", async () => {
    mount({ staged: false });
    await openRated("Adaptability");
    expect(control()).toBeDisabled();
  });

  it("says in the first sentence that which subsections the form asks are the period's own", async () => {
    mount();
    await viewSwitch("By section");
    expect(
      screen.getByText(
        /The questions under them, and which subsections the review form asks directly, are H2 2026 Appraisal’s own\./,
      ),
    ).toBeInTheDocument();
  });
});

describe("By section: where the control is not drawn at all", () => {
  it("is absent in demo mode, where there is no API to write to", async () => {
    connected = false;
    mount();
    await openRated("Adaptability");
    noControl();
    /* And the sentence does not promise it. */
    expect(
      screen.queryByText(/which subsections the review form asks directly/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /The questions under them are H2 2026 Appraisal’s own\./,
      ),
    ).toBeInTheDocument();
  });

  it("is absent for somebody who cannot manage settings", async () => {
    canManage = false;
    mount();
    await openRated("Adaptability");
    noControl();
  });

  it("is absent when the dialog was given no way to write it", async () => {
    mount({ asks: false });
    await openRated("Adaptability");
    noControl();
  });

  it("is absent before the period's questions have been read, and not a claim of Not asked", async () => {
    questionsLoading = true;
    mount();
    await openRated("Adaptability");
    noControl();
  });

  it("is absent when reading the period's questions failed", async () => {
    questionsError = new ApiError(500, "server", "Internal error");
    mount();
    await openRated("Adaptability");
    noControl();
  });

  it("is absent when a later read failed, and does not keep showing the last answer it had", async () => {
    questions = [direct("c-adapt", "Adaptability", ["MANAGER"])];
    const { again } = mount();
    await openRated("Adaptability");
    expect(control().value).toBe("manager");

    /* A held answer is for the moment a read takes. It is not an answer to show
       in place of a read that failed. */
    questions = [];
    questionsError = new ApiError(500, "server", "Internal error");
    again();
    noControl();
  });

  it("is drawn once the first read has answered", async () => {
    questionsLoading = true;
    const { again } = mount();
    await openRated("Adaptability");
    noControl();

    questionsLoading = false;
    again();
    expect(control().value).toBe("none");
  });

  it("keeps what it showed while the period is read again, and does not blank to Not asked", async () => {
    questions = [direct("c-adapt", "Adaptability", ["MANAGER"])];
    const { again } = mount();
    await openRated("Adaptability");
    expect(control().value).toBe("manager");

    /* A re-read blanks the list until it answers. */
    questions = [];
    questionsLoading = true;
    again();
    expect(control().value).toBe("manager");

    questions = [direct("c-adapt", "Adaptability", ["SELF"])];
    questionsLoading = false;
    again();
    expect(control().value).toBe("employee");
  });
});

describe("All questions: a subsection the period asks", () => {
  beforeEach(() => {
    questions = [
      ordinary("q-1", WENT_WELL),
      direct("c-adapt", "Adaptability", ["MANAGER"]),
    ];
  });

  it("is a row, with the subsection's name as its prompt", () => {
    mount();
    expect(rowOf("Adaptability")).not.toBeNull();
    expect(rowOf(WENT_WELL)).not.toBeNull();
  });

  it("says it is rated directly, and not that it is a rating", () => {
    mount();
    const row = rowOf("Adaptability") as HTMLElement;
    expect(within(row).getByText("Rated directly")).toBeInTheDocument();
    expect(within(row).queryByText("Rating")).not.toBeInTheDocument();
  });

  it("says who is asked as Manager, Employee or Both, never as Self", () => {
    questions = [
      direct("c-adapt", "Adaptability", ["MANAGER"]),
      direct("c-team", "Teamwork", ["SELF"], { kind: "BOOLEAN", order: 3 }),
      direct("c-x", "Initiative", ["SELF", "MANAGER"], { order: 4 }),
    ];
    mount();
    expect(
      within(rowOf("Adaptability") as HTMLElement).getByText("Manager"),
    ).toBeInTheDocument();
    expect(
      within(rowOf("Teamwork") as HTMLElement).getByText("Employee"),
    ).toBeInTheDocument();
    expect(
      within(rowOf("Initiative") as HTMLElement).getByText("Both"),
    ).toBeInTheDocument();
    for (const name of ["Adaptability", "Teamwork", "Initiative"]) {
      const row = rowOf(name) as HTMLElement;
      expect(within(row).queryByText("Self")).not.toBeInTheDocument();
      expect(within(row).queryByText(/Self, /)).not.toBeInTheDocument();
    }
  });

  it("does not repeat the subsection's name as where it is filed, because the name is the prompt", () => {
    mount();
    const row = rowOf("Adaptability") as HTMLElement;
    expect(within(row).getAllByText("Adaptability")).toHaveLength(1);
  });

  it("is still marked as one that must be answered, as every question here is", () => {
    mount();
    expect(
      within(rowOf("Adaptability") as HTMLElement).getByText(
        "Must be answered",
      ),
    ).toBeInTheDocument();
  });

  it("has no pencil, because there is nothing on it to edit, while an ordinary question keeps its own", () => {
    mount();
    expect(
      screen.queryByRole("button", { name: 'Edit "Adaptability"' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Edit "${WENT_WELL}"` }),
    ).toBeInTheDocument();
  });

  it("has the bin, which asks first and turns into Remove, and says what it does on hover", async () => {
    mount();
    await userEvent.click(
      screen.getByRole("button", { name: 'Remove "Adaptability"' }),
    );
    const button = screen.getByRole("button", {
      name: 'Remove "Adaptability" from the review form',
    });
    expect(button).toHaveTextContent(/^Remove$/);
    expect(button).toHaveAttribute(
      "title",
      "Stop asking this on anybody's review form in this period. The subsection itself stays.",
    );
    /* Not the sentence about deleting a question for good, which is not what this does. */
    expect(button).not.toHaveAttribute(
      "title",
      expect.stringContaining("for good"),
    );
  });

  it("stops asking, with the stop and not a delete of the question", async () => {
    const { onStopAskingSubsection, onRemove } = mount();
    await userEvent.click(
      screen.getByRole("button", { name: 'Remove "Adaptability"' }),
    );
    await confirmRemoval("Adaptability");

    await waitFor(() =>
      expect(onStopAskingSubsection).toHaveBeenCalledWith("c-adapt"),
    );
    expect(onRemove).not.toHaveBeenCalled();
    await waitFor(() => expect(reloadQuestions).toHaveBeenCalled());
  });

  it("still deletes an ordinary question with the delete it always used", async () => {
    const { onStopAskingSubsection, onRemove } = mount();
    await userEvent.click(
      screen.getByRole("button", { name: `Remove "${WENT_WELL}"` }),
    );
    await new Promise((resolve) => setTimeout(resolve, 600));
    await userEvent.click(
      screen.getByRole("button", { name: `Remove "${WENT_WELL}" for good` }),
    );

    await waitFor(() => expect(onRemove).toHaveBeenCalledWith("q-1"));
    expect(onStopAskingSubsection).not.toHaveBeenCalled();
  });

  it("says why it could not be taken off, on its own row, in the server's words", async () => {
    const { onStopAskingSubsection } = mount();
    onStopAskingSubsection.mockRejectedValue(
      new ApiError(409, "conflict", REFUSAL),
    );
    await userEvent.click(
      screen.getByRole("button", { name: 'Remove "Adaptability"' }),
    );
    await confirmRemoval("Adaptability");

    const row = rowOf("Adaptability") as HTMLElement;
    expect(await within(row).findByText(REFUSAL)).toBeInTheDocument();
    expect(
      within(rowOf(WENT_WELL) as HTMLElement).queryByText(REFUSAL),
    ).not.toBeInTheDocument();
  });

  it("falls back to the ordinary delete when the dialog was given no way to stop asking", async () => {
    const { onRemove } = mount({ asks: false });
    await userEvent.click(
      screen.getByRole("button", { name: 'Remove "Adaptability"' }),
    );
    await confirmRemoval("Adaptability");
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith("q-c-adapt"));
  });
});

describe("By section: the same question in the subsection's Questions tab", () => {
  it("is listed there too, with the same badge and the same lack of a pencil", async () => {
    questions = [direct("c-adapt", "Adaptability", ["SELF", "MANAGER"])];
    mount();
    await viewSwitch("By section");
    await userEvent.click(
      screen.getByRole("button", { name: /Behavioural competency/ }),
    );
    await userEvent.click(toggleOf("Adaptability"));

    const tab = screen.getByRole("tab", { name: /^Questions/ });
    expect(tab).toHaveTextContent("1");
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Rated directly")).toBeInTheDocument();
    expect(within(panel).getByText("Both")).toBeInTheDocument();
    expect(
      within(panel).queryByRole("button", { name: 'Edit "Adaptability"' }),
    ).not.toBeInTheDocument();
  });

  it("counts on the subsection's row as one question", async () => {
    questions = [direct("c-adapt", "Adaptability", ["MANAGER"])];
    mount();
    await viewSwitch("By section");
    await userEvent.click(
      screen.getByRole("button", { name: /Behavioural competency/ }),
    );
    expect(toggleOf("Adaptability")).toHaveTextContent("1 question");
  });
});

describe("a server that sends none of the new fields", () => {
  beforeEach(() => {
    /* An older API: no `answersSubsection`, no `competencyName`, and nothing in
       the list that is a subsection's own question. */
    questions = [
      {
        ...ordinary("q-1", WENT_WELL),
        kind: "RATING",
        askedOf: ["SELF", "MANAGER"],
      },
      { ...ordinary("q-2", "Anything else?", "c-adapt"), askedOf: ["MANAGER"] },
    ];
  });

  it("lists every question exactly as it did: the kind, the audience words and the filing", () => {
    mount();
    const first = rowOf(WENT_WELL) as HTMLElement;
    expect(within(first).getByText("Rating")).toBeInTheDocument();
    expect(within(first).getByText("Self, Manager")).toBeInTheDocument();
    expect(within(first).queryByText("Rated directly")).not.toBeInTheDocument();

    const second = rowOf("Anything else?") as HTMLElement;
    expect(within(second).getByText("Manager")).toBeInTheDocument();
    expect(within(second).getByText("Adaptability")).toBeInTheDocument();
  });

  it("keeps the pencil and the delete on every one of them", async () => {
    const { onRemove } = mount();
    expect(
      screen.getByRole("button", { name: `Edit "${WENT_WELL}"` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: 'Edit "Anything else?"' }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: 'Remove "Anything else?"' }),
    );
    await new Promise((resolve) => setTimeout(resolve, 600));
    await userEvent.click(
      screen.getByRole("button", { name: 'Remove "Anything else?" for good' }),
    );
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith("q-2"));
  });

  it("still opens the control as Not asked: nothing on the period is a subsection question", async () => {
    mount();
    await openRated("Adaptability");
    expect(control().value).toBe("none");
  });
});
