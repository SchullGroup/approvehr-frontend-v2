import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ApiError } from "@/lib/api/client";
import type {
  ApiCompetency,
  ApiQuestion,
  ApiSection,
  CreateQuestionBody,
  UpdateQuestionBody,
} from "@/lib/api/performance";
import { QuestionsDialog } from "@/app/(app)/performance/period-dialogs";

/**
 * Writing questions in the Questions dialog, from either view.
 *
 * A person opened a subsection under By section, pressed Done, and saw nothing
 * made: the form was behind a second tab they never opened. Looking at the whole
 * flow found the rest of what this pins. Enter did nothing in the question box,
 * pressing Add left the page with nothing focused so the second of ten questions
 * had to be clicked into, Edit opened its form under the whole list and so out of
 * sight on a long one, and the bin deleted a question for good with no question
 * asked and, if it failed, said so above a form at the bottom of the list.
 *
 * The questions here are a small fake of the period's own: adding one puts a row
 * in the list the dialog reads, which is what lets these say "and it is there" and
 * not just "the API was called". It is the same list in both views.
 */

let questions: ApiQuestion[];
let competencies: ApiCompetency[];
let sections: ApiSection[];
let canManage: boolean;
let reloadQuestions: Mock<() => void>;
let redraw: () => void;

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
    reload: () => {},
  }),
  useSections: () => ({ sections, loading: false, reload: () => {} }),
  useFrameworkActions: () => ({
    editable: true,
    createSection: vi.fn(),
    createCompetency: vi.fn(),
    updateCompetency: vi.fn(),
    setChoiceOptions: vi.fn(),
  }),
  useAppraisals: () => ({ cycles: [], loading: false }),
}));
vi.mock("@/lib/permissions", () => ({ useCan: () => canManage }));

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

const WENT_WELL = "What went well for you this period?";
const GOT_IN_THE_WAY = "What got in your way this period?";
const NEXT_HALF = "What will you do differently next half?";

type Api = {
  onAdd: Mock<(body: CreateQuestionBody) => Promise<void>>;
  onUpdate: Mock<(id: string, body: UpdateQuestionBody) => Promise<void>>;
  onRemove: Mock<(id: string) => Promise<void>>;
};

/** A period that keeps what it is given, and a dialog that re-reads it. */
const mount = (over: Partial<Api> = {}) => {
  const api: Api = {
    onAdd: vi.fn(async (body: CreateQuestionBody) => {
      questions = [
        ...questions,
        {
          ...question(
            `q-${String(questions.length + 1)}`,
            body.prompt,
            body.competencyId ?? null,
          ),
        },
      ];
    }),
    onUpdate: vi.fn(async (id: string, body: UpdateQuestionBody) => {
      questions = questions.map((one) =>
        one.id === id
          ? {
              ...one,
              prompt: body.prompt ?? one.prompt,
              competencyId:
                body.competencyId === undefined
                  ? one.competencyId
                  : body.competencyId,
            }
          : one,
      );
    }),
    onRemove: vi.fn(async (id: string) => {
      questions = questions.filter((one) => one.id !== id);
    }),
    ...over,
  };
  const props = {
    open: true,
    cycleId: "c-1",
    periodName: "H2 2026 Appraisal",
    onClose: vi.fn(),
    ...api,
  };
  const view = render(<QuestionsDialog {...props} />);
  redraw = () => view.rerender(<QuestionsDialog {...props} />);
  return { ...api, onClose: props.onClose };
};

const viewSwitch = (label: "All questions" | "By section") =>
  userEvent.click(screen.getByRole("radio", { name: label }));

const field = () =>
  screen.getByLabelText(/(Add|Edit) (a|the) question/) as HTMLInputElement;

const addButton = () => screen.getByRole("button", { name: "Add question" });

/** By section, with Core competency open: every subsection's row is showing. */
const openSections = async () => {
  await viewSwitch("By section");
  await userEvent.click(
    screen.getByRole("button", { name: /Core competency/ }),
  );
};

const rowOf = (text: string) => screen.getByText(text).closest("li");

beforeEach(() => {
  questions = [];
  canManage = true;
  sections = [
    {
      id: "s-core",
      name: "Core competency",
      order: 0,
      competencyCount: 2,
      component: "CORE_COMPETENCY",
      weightBp: 4000,
    },
  ];
  competencies = [
    subsection({ id: "c-dil", name: "Diligence" }),
    subsection({ id: "c-team", name: "Teamwork", answerKind: "BOOLEAN" }),
  ];
  reloadQuestions = vi.fn(() => redraw());
});

describe("Add question on a subsection's row, in By section", () => {
  it("opens the subsection on its questions and puts the cursor in the box", async () => {
    mount();
    await openSections();
    expect(screen.queryByLabelText(/Add a question/)).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Add question to Diligence" }),
    );

    await waitFor(() => expect(field()).toHaveFocus());
    expect(
      screen.getByRole("button", { name: /Diligence/, expanded: true }),
    ).toBeInTheDocument();
  });

  it("does the same for a yes-or-no subsection, which used to open on how it is rated", async () => {
    mount();
    await openSections();

    await userEvent.click(
      screen.getByRole("button", { name: "Add question to Teamwork" }),
    );

    await waitFor(() => expect(field()).toHaveFocus());
    expect(screen.getByRole("tab", { name: /^Questions/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("is there for somebody who cannot change the framework, because a question belongs to the period", async () => {
    canManage = false;
    mount();
    await openSections();

    await userEvent.click(
      screen.getByRole("button", { name: "Add question to Diligence" }),
    );

    await waitFor(() => expect(field()).toHaveFocus());
  });

  it("drops a change that was in progress, and starts a new question", async () => {
    questions = [question("q-1", WENT_WELL, "c-dil")];
    mount();
    await openSections();
    await userEvent.click(
      screen.getByRole("button", { name: /Diligence/, expanded: false }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: `Edit "${WENT_WELL}"` }),
    );
    expect(screen.getByLabelText(/Edit the question/)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Add question to Diligence" }),
    );

    expect(
      screen.queryByLabelText(/Edit the question/),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(field()).toHaveFocus());
    expect(field().value).toBe("");
    expect(screen.getByLabelText(/Add a question/)).toBeInTheDocument();
  });
});

describe("adding several in a row", () => {
  it("lists each one read only above the box, filed under the subsection, and leaves the box empty and focused", async () => {
    const { onAdd } = mount();
    await openSections();
    await userEvent.click(
      screen.getByRole("button", { name: "Add question to Diligence" }),
    );

    for (const [index, text] of [WENT_WELL, GOT_IN_THE_WAY].entries()) {
      await waitFor(() => expect(field()).toHaveFocus());
      await userEvent.type(field(), text);
      await userEvent.click(addButton());

      await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(index + 1));
      expect(onAdd.mock.calls[index]?.[0]).toMatchObject({
        prompt: text,
        competencyId: "c-dil",
      });
      /* There, and read only: a pencil and a bin, and no second form. */
      await waitFor(() => expect(rowOf(text)).not.toBeNull());
      expect(
        within(rowOf(text) as HTMLElement).getByRole("button", {
          name: `Edit "${text}"`,
        }),
      ).toBeInTheDocument();
      expect(
        within(rowOf(text) as HTMLElement).getByRole("button", {
          name: `Remove "${text}"`,
        }),
      ).toBeInTheDocument();
      await waitFor(() => expect(field().value).toBe(""));
    }

    await waitFor(() => expect(field()).toHaveFocus());
    expect(
      screen.getAllByLabelText(/(Add|Edit) (a|the) question/),
    ).toHaveLength(1);
  });

  it("is the same list in All questions, with the subsection each is filed under", async () => {
    mount();
    await openSections();
    await userEvent.click(
      screen.getByRole("button", { name: "Add question to Diligence" }),
    );
    await userEvent.type(field(), WENT_WELL);
    await userEvent.click(addButton());
    await waitFor(() => expect(rowOf(WENT_WELL)).not.toBeNull());

    await viewSwitch("All questions");

    expect(rowOf(WENT_WELL)).toHaveTextContent("Diligence");
  });

  it("is the same list the other way: one written in All questions is under its subsection", async () => {
    mount();
    await userEvent.selectOptions(screen.getByLabelText("Section"), "s-core");
    await userEvent.selectOptions(
      screen.getByLabelText("Subsection"),
      "c-team",
    );
    await userEvent.type(field(), GOT_IN_THE_WAY);
    await userEvent.click(addButton());
    await waitFor(() => expect(rowOf(GOT_IN_THE_WAY)).not.toBeNull());

    await openSections();
    await userEvent.click(
      screen.getByRole("button", { name: /Teamwork/, expanded: false }),
    );

    expect(rowOf(GOT_IN_THE_WAY)).not.toBeNull();
    expect(rowOf(GOT_IN_THE_WAY)).not.toHaveTextContent("Teamwork");
  });
});

describe("Enter in the question box", () => {
  it("adds the question in By section, as the button does", async () => {
    const { onAdd } = mount();
    await openSections();
    await userEvent.click(
      screen.getByRole("button", { name: "Add question to Diligence" }),
    );

    await userEvent.type(field(), `${NEXT_HALF}{Enter}`);

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd.mock.calls[0]?.[0]).toMatchObject({
      prompt: NEXT_HALF,
      competencyId: "c-dil",
    });
    await waitFor(() => expect(field().value).toBe(""));
  });

  it("adds the question in All questions too", async () => {
    const { onAdd } = mount();

    await userEvent.type(field(), `${WENT_WELL}{Enter}`);

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd.mock.calls[0]?.[0]).toMatchObject({ prompt: WENT_WELL });
  });

  it("is refused a question that is not one, in the same words the button uses", async () => {
    const { onAdd } = mount();

    await userEvent.type(field(), "Hi{Enter}");

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByText("Write the question out.")).toBeInTheDocument();
  });

  it("does not add the same question twice when Enter is pressed again while it is saving", async () => {
    let finish: () => void = () => {};
    const slow = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    mount({ onAdd: slow });

    await userEvent.type(field(), `${WENT_WELL}{Enter}{Enter}{Enter}`);
    finish();

    await waitFor(() => expect(slow).toHaveBeenCalledTimes(1));
  });
});

describe("changing a question", () => {
  beforeEach(() => {
    questions = [
      question("q-1", WENT_WELL, "c-dil"),
      question("q-2", GOT_IN_THE_WAY, "c-dil"),
      question("q-3", NEXT_HALF, "c-dil"),
    ];
  });

  it("opens the form in the row's place, filled in, with the cursor in it, and no second form under the list", async () => {
    mount();

    await userEvent.click(
      screen.getByRole("button", { name: `Edit "${GOT_IN_THE_WAY}"` }),
    );

    const box = field();
    expect(box.value).toBe(GOT_IN_THE_WAY);
    await waitFor(() => expect(box).toHaveFocus());
    /* The first row, then the form where the second was, then the third. */
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0] as HTMLElement).getByText(WENT_WELL)).toBeVisible();
    expect(items[1]).toContainElement(box);
    expect(within(items[2] as HTMLElement).getByText(NEXT_HALF)).toBeVisible();
    expect(
      screen.getAllByLabelText(/(Add|Edit) (a|the) question/),
    ).toHaveLength(1);
  });

  it("puts the row back, read only, with the new words, once it is saved", async () => {
    const { onUpdate } = mount();
    await userEvent.click(
      screen.getByRole("button", { name: `Edit "${GOT_IN_THE_WAY}"` }),
    );

    await userEvent.clear(field());
    await userEvent.type(field(), "What slowed you down this period?");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0]?.[0]).toBe("q-2");
    await waitFor(() =>
      expect(
        screen.getByText("What slowed you down this period?"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(GOT_IN_THE_WAY)).not.toBeInTheDocument();
    /* The add form is back under the list, and it is the add form. */
    expect(screen.getByLabelText(/Add a question/)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("puts the row back as it was when it is cancelled", async () => {
    const { onUpdate } = mount();
    await userEvent.click(
      screen.getByRole("button", { name: `Edit "${GOT_IN_THE_WAY}"` }),
    );
    await userEvent.type(field(), " and more");

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText(GOT_IN_THE_WAY)).toBeInTheDocument();
    expect(screen.getByLabelText(/Add a question/)).toBeInTheDocument();
  });

  it("is in the row's place under a subsection in By section as well", async () => {
    mount();
    await openSections();
    await userEvent.click(
      screen.getByRole("button", { name: /Diligence/, expanded: false }),
    );

    await userEvent.click(
      screen.getByRole("button", { name: `Edit "${GOT_IN_THE_WAY}"` }),
    );

    /* The closest list item is the question's own, not the subsection's, which
       also contains the form. Its neighbours are the other two questions. */
    const box = field();
    expect(box.value).toBe(GOT_IN_THE_WAY);
    const own = box.closest("li") as HTMLElement;
    const siblings = Array.from((own.parentElement as HTMLElement).children);
    expect(siblings).toHaveLength(3);
    expect(siblings.indexOf(own)).toBe(1);
    expect(siblings[0]).toHaveTextContent(WENT_WELL);
    expect(siblings[2]).toHaveTextContent(NEXT_HALF);
    expect(
      screen.getAllByLabelText(/(Add|Edit) (a|the) question/),
    ).toHaveLength(1);
  });
});

describe("removing a question", () => {
  beforeEach(() => {
    questions = [
      question("q-1", WENT_WELL, "c-dil"),
      question("q-2", GOT_IN_THE_WAY, "c-dil"),
    ];
  });

  const bin = (text: string) =>
    screen.getByRole("button", { name: `Remove "${text}"` });

  it("asks on the row first, and removes nothing until it is answered", async () => {
    const { onRemove } = mount();

    await userEvent.click(bin(GOT_IN_THE_WAY));

    const ask = screen.getByRole("group", {
      name: `Remove "${GOT_IN_THE_WAY}"?`,
    });
    expect(rowOf(GOT_IN_THE_WAY)).toContainElement(ask);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("is two buttons and no sentence, with Keep last, where the bin was", async () => {
    mount();
    await userEvent.click(bin(GOT_IN_THE_WAY));

    const ask = screen.getByRole("group", {
      name: `Remove "${GOT_IN_THE_WAY}"?`,
    });
    /* The buttons replace the icons on that row, so which question it is is not in
       doubt, and a sentence beside them is what made the row wrap on a phone. Keep
       is last so that a second tap on the bin lands on the safe answer. */
    expect(ask).toHaveTextContent(/^RemoveKeep$/);
    expect(
      within(ask)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Remove", "Keep"]);
  });

  it("says what each button does on hover, because a touch screen has the names", async () => {
    mount();
    await userEvent.click(bin(GOT_IN_THE_WAY));

    expect(screen.getByRole("button", { name: "Remove" })).toHaveAttribute(
      "title",
      "Remove this question from this period for good. It is no longer asked on anybody's form, and this cannot be undone.",
    );
    expect(screen.getByRole("button", { name: "Keep" })).toHaveAttribute(
      "title",
      "Keep this question. Nothing is changed.",
    );
  });

  it("puts the focus on Keep, so the answer Enter gives is the safe one", async () => {
    mount();
    await userEvent.click(bin(GOT_IN_THE_WAY));
    expect(screen.getByRole("button", { name: "Keep" })).toHaveFocus();
  });

  it("keeps it when Keep is pressed", async () => {
    const { onRemove } = mount();
    await userEvent.click(bin(GOT_IN_THE_WAY));

    await userEvent.click(screen.getByRole("button", { name: "Keep" }));

    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(bin(GOT_IN_THE_WAY)).toBeInTheDocument();
  });

  it("puts the focus back on the bin when Keep is pressed, so the next Tab starts from the row", async () => {
    mount();
    await userEvent.click(bin(GOT_IN_THE_WAY));

    await userEvent.click(screen.getByRole("button", { name: "Keep" }));

    expect(bin(GOT_IN_THE_WAY)).toHaveFocus();
  });

  it("does the same when Keep is answered from the keyboard, where it already has the focus", async () => {
    const { onRemove } = mount();
    await userEvent.click(bin(GOT_IN_THE_WAY));

    await userEvent.keyboard("{Enter}");

    expect(onRemove).not.toHaveBeenCalled();
    expect(bin(GOT_IN_THE_WAY)).toHaveFocus();
  });

  it("removes that question, and only it, when Remove is pressed", async () => {
    const { onRemove } = mount();
    await userEvent.click(bin(GOT_IN_THE_WAY));

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(onRemove).toHaveBeenCalledWith("q-2"));
    await waitFor(() =>
      expect(screen.queryByText(GOT_IN_THE_WAY)).not.toBeInTheDocument(),
    );
    expect(screen.getByText(WENT_WELL)).toBeInTheDocument();
  });

  it("says why on that row when it cannot be removed, and not above the form", async () => {
    const refusal =
      "Somebody has already answered it, so it cannot be removed. Take it off the form for the next period instead.";
    const { onRemove } = mount({
      onRemove: vi
        .fn()
        .mockRejectedValue(new ApiError(409, "conflict", refusal)),
    });
    await userEvent.click(bin(GOT_IN_THE_WAY));
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(refusal);
    expect(rowOf(GOT_IN_THE_WAY)).toContainElement(alert);
    expect(
      screen.queryByText("That did not go through"),
    ).not.toBeInTheDocument();
    expect(onRemove).toHaveBeenCalledTimes(1);
    /* Still there, and the other row is untouched. */
    expect(screen.getByText(GOT_IN_THE_WAY)).toBeInTheDocument();
    expect(
      within(rowOf(WENT_WELL) as HTMLElement).queryByRole("alert"),
    ).not.toBeInTheDocument();
  });

  it("clears the reason when it is tried again", async () => {
    const onRemove = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(409, "conflict", "It is in use."))
      .mockResolvedValue(undefined);
    mount({ onRemove });
    await userEvent.click(bin(GOT_IN_THE_WAY));
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("It is in use.");

    await userEvent.click(bin(GOT_IN_THE_WAY));
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
  });

  it("asks in By section too", async () => {
    const { onRemove } = mount();
    await openSections();
    await userEvent.click(
      screen.getByRole("button", { name: /Diligence/, expanded: false }),
    );

    await userEvent.click(bin(GOT_IN_THE_WAY));

    expect(screen.getByRole("button", { name: "Keep" })).toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();
  });
});

describe("closing with a question that has not been added", () => {
  /* A person typed a question and pressed Done: the dialog closed and the question
     was gone, and the list behind it showed nothing made. Done, the cross and
     Escape now ask first. */
  const done = () => screen.getByRole("button", { name: "Done" });

  it("closes at once when nothing has been written", async () => {
    const { onClose } = mount();

    await userEvent.click(done());

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks first when a question has been written, and neither closes nor adds it", async () => {
    const { onClose, onAdd } = mount();
    await userEvent.type(field(), WENT_WELL);

    await userEvent.click(done());

    expect(onClose).not.toHaveBeenCalled();
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "You wrote a question and have not added it.",
    );
    expect(
      screen.getByRole("button", { name: "Add it and close" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Done" }),
    ).not.toBeInTheDocument();
  });

  it("goes back to the form with the words still there when asked to keep writing", async () => {
    const { onClose } = mount();
    await userEvent.type(field(), WENT_WELL);
    await userEvent.click(done());

    await userEvent.click(screen.getByRole("button", { name: "Keep writing" }));

    expect(field().value).toBe(WENT_WELL);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(done()).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("adds it where it was being written, and then closes", async () => {
    const { onClose, onAdd } = mount();
    await openSections();
    await userEvent.click(
      screen.getByRole("button", { name: "Add question to Diligence" }),
    );
    await userEvent.type(field(), WENT_WELL);
    await userEvent.click(done());

    await userEvent.click(
      screen.getByRole("button", { name: "Add it and close" }),
    );

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd.mock.calls[0]?.[0]).toMatchObject({
      prompt: WENT_WELL,
      competencyId: "c-dil",
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("throws it away, and closes, when asked to discard", async () => {
    const { onClose, onAdd } = mount();
    await userEvent.type(field(), WENT_WELL);
    await userEvent.click(done());

    await userEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(onAdd).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(field().value).toBe("");
  });

  it("stays open on the form, with the reason, when it cannot be added", async () => {
    const refusal = "You cannot add questions to a period that has finished.";
    const { onClose } = mount({
      onAdd: vi.fn().mockRejectedValue(new ApiError(409, "conflict", refusal)),
    });
    await userEvent.type(field(), WENT_WELL);
    await userEvent.click(done());

    await userEvent.click(
      screen.getByRole("button", { name: "Add it and close" }),
    );

    expect(await screen.findByText(refusal)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(field().value).toBe(WENT_WELL);
    expect(done()).toBeInTheDocument();
  });

  it("asks on Escape as well, which is the other way people leave", async () => {
    const { onClose } = mount();
    await userEvent.type(field(), WENT_WELL);

    await userEvent.keyboard("{Escape}");

    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Add it and close" }),
    ).toBeInTheDocument();
  });

  describe("a question that is being changed", () => {
    beforeEach(() => {
      questions = [question("q-1", WENT_WELL, "c-dil")];
    });

    it("closes at once when nothing about it was changed", async () => {
      const { onClose } = mount();
      await userEvent.click(
        screen.getByRole("button", { name: `Edit "${WENT_WELL}"` }),
      );

      await userEvent.click(done());

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("asks to save when it was, and saves and closes when told to", async () => {
      const { onClose, onUpdate } = mount();
      await userEvent.click(
        screen.getByRole("button", { name: `Edit "${WENT_WELL}"` }),
      );
      await userEvent.clear(field());
      await userEvent.type(field(), "What went really well this period?");

      await userEvent.click(done());

      expect(screen.getByRole("alert")).toHaveTextContent(
        "You changed this question and have not saved it.",
      );
      expect(onClose).not.toHaveBeenCalled();
      await userEvent.click(
        screen.getByRole("button", { name: "Save and close" }),
      );
      await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
      expect(onUpdate.mock.calls[0]?.[0]).toBe("q-1");
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it("counts a changed setting as a change, not only changed words", async () => {
      const { onClose } = mount();
      await userEvent.click(
        screen.getByRole("button", { name: `Edit "${WENT_WELL}"` }),
      );
      await userEvent.click(
        screen.getByRole("checkbox", {
          name: "It must be answered before the form can be sent",
        }),
      );

      await userEvent.click(done());

      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });
});

describe("what the server will take for a question", () => {
  const longQuestion = (length: number) =>
    "Q".repeat(Math.max(0, length - 1)) + "?";

  it("refuses one over 300 characters in the server's own sentence, before asking the server", async () => {
    const { onAdd } = mount();
    fireEvent.change(field(), { target: { value: longQuestion(301) } });

    await userEvent.click(addButton());

    expect(
      screen.getByText("Keep the question short enough to read on a phone."),
    ).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("takes exactly 300", async () => {
    const { onAdd } = mount();
    fireEvent.change(field(), { target: { value: longQuestion(300) } });

    await userEvent.click(addButton());

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
  });

  it("counts the characters only once it is getting long", () => {
    mount();

    fireEvent.change(field(), { target: { value: longQuestion(249) } });
    expect(screen.queryByText(/of 300 characters/)).not.toBeInTheDocument();

    fireEvent.change(field(), { target: { value: longQuestion(250) } });
    expect(screen.getByText("250 of 300 characters")).toBeInTheDocument();

    fireEvent.change(field(), { target: { value: longQuestion(301) } });
    expect(screen.getByText("301 of 300 characters")).toBeInTheDocument();
  });

  it("stops offering another choice at ten, and says why", async () => {
    mount();
    await userEvent.selectOptions(screen.getByLabelText("How they answer"), [
      "CHOICE",
    ]);
    const add = () => screen.getByRole("button", { name: "Add a choice" });
    expect(screen.getAllByPlaceholderText(/^Choice \d+$/)).toHaveLength(2);

    for (let count = 2; count < 10; count++) {
      expect(add()).toBeEnabled();
      await userEvent.click(add());
    }

    expect(screen.getAllByPlaceholderText(/^Choice \d+$/)).toHaveLength(10);
    expect(add()).toBeDisabled();
    expect(
      screen.getByText("Ten is the most a question can have."),
    ).toBeInTheDocument();
  });
});

describe("writing a pick-from-a-list question", () => {
  /* The form's second argument once shared a name with the choices it reads, and
     opening this kind crashed it. Nothing else here chooses it. */
  const answerAsAList = () =>
    userEvent.selectOptions(screen.getByLabelText("How they answer"), [
      "CHOICE",
    ]);

  it("sends the choices that were typed into it, in the full list", async () => {
    const { onAdd } = mount();
    await answerAsAList();
    await userEvent.type(screen.getByPlaceholderText("Choice 1"), "Yes");
    await userEvent.type(screen.getByPlaceholderText("Choice 2"), "Not yet");

    await userEvent.type(field(), "Did you get the support you needed?{Enter}");

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd.mock.calls[0]?.[0]).toMatchObject({
      prompt: "Did you get the support you needed?",
      kind: "CHOICE",
      options: ["Yes", "Not yet"],
      allowCustom: false,
    });
  });

  it("sends them under a subsection in By section, and empties the choices for the next", async () => {
    const { onAdd } = mount();
    await openSections();
    await userEvent.click(
      screen.getByRole("button", { name: "Add question to Diligence" }),
    );
    await answerAsAList();
    await userEvent.type(screen.getByPlaceholderText("Choice 1"), "Often");
    await userEvent.type(screen.getByPlaceholderText("Choice 2"), "Rarely");
    await userEvent.type(field(), "How often did you ask for help?{Enter}");

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd.mock.calls[0]?.[0]).toMatchObject({
      kind: "CHOICE",
      options: ["Often", "Rarely"],
      competencyId: "c-dil",
    });
    await waitFor(() =>
      expect(
        (screen.getByPlaceholderText("Choice 1") as HTMLInputElement).value,
      ).toBe(""),
    );
  });

  it("refuses one with fewer than two choices, as it always has", async () => {
    const { onAdd } = mount();
    await answerAsAList();
    await userEvent.type(screen.getByPlaceholderText("Choice 1"), "Yes");

    await userEvent.type(field(), "Did you get the support you needed?{Enter}");

    expect(onAdd).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "A pick-from-a-list question needs at least two choices.",
      ),
    ).toBeInTheDocument();
  });
});

describe("the Subsection picker in All questions", () => {
  /* The Section picker says what each section is worth. The Subsection picker said
     nothing, so a subsection rated yes or no looked like any other. */
  it("says beside a yes-or-no or pick-one subsection how it is rated, and leaves a level as its plain name", async () => {
    competencies = [
      ...competencies,
      subsection({
        id: "c-fb",
        name: "Customer feedback",
        answerKind: "CHOICE",
      }),
    ];
    mount();
    await userEvent.selectOptions(screen.getByLabelText("Section"), "s-core");

    const options = Array.from(
      (screen.getByLabelText("Subsection") as HTMLSelectElement).options,
    ).map((one) => one.text);

    expect(options).toEqual([
      "None",
      "Diligence",
      "Teamwork, yes or no",
      "Customer feedback, pick one",
    ]);
  });

  it("still files the question under the subsection that was chosen, whatever its label says", async () => {
    const { onAdd } = mount();
    await userEvent.selectOptions(screen.getByLabelText("Section"), "s-core");
    await userEvent.selectOptions(
      screen.getByLabelText("Subsection"),
      "c-team",
    );

    await userEvent.type(field(), `${GOT_IN_THE_WAY}{Enter}`);

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd.mock.calls[0]?.[0]).toMatchObject({ competencyId: "c-team" });
  });
});
