import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiCompetency, ReviewAudience } from "@/lib/api/performance";
import type { SubsectionAsk } from "@/lib/performance/subsection-ask";

/**
 * **Ask it on the review form**, under how a subsection is answered.
 *
 * What `tsc` cannot see: a pick that writes before anybody has pressed the button
 * (the product owner asked twice where to click Add), a button that says Add when
 * it is going to change or remove, "Both" sent as one audience, "Not asked" sent
 * as a write with nobody in it, a refusal replaced by "Something went wrong", a
 * control that flips back to the old value for the second the period is being read
 * again, a control that says "Not asked" about a form nobody has read, and a
 * control offered on a period that has already started.
 */

let onAsk: Mock<(...args: unknown[]) => Promise<void>>;
let onStop: Mock<(...args: unknown[]) => Promise<void>>;
/** What the period holds for the subsection, which the control reads. */
let held: ReviewAudience[] | null;

vi.mock("@/lib/store/performance", () => ({
  useFrameworkActions: () => ({
    updateCompetency: vi.fn().mockResolvedValue({}),
    setChoiceOptions: vi.fn().mockResolvedValue({}),
  }),
}));

const { DirectAnswerPanel } =
  await import("@/app/(app)/performance/direct-answer-panel");

const competency = (over: Partial<ApiCompetency> = {}): ApiCompetency => ({
  id: "c1",
  name: "Adaptability",
  sectionId: "s1",
  sectionName: "Behavioural competency",
  description: null,
  isCore: false,
  scaleMax: 5,
  active: true,
  archived: false,
  ratingCount: 0,
  ...over,
});

const ask = (over: Partial<SubsectionAsk> = {}): SubsectionAsk => ({
  periodName: "H2 2026 Appraisal",
  draft: true,
  askedOf: () => held,
  onAsk: (...args) => onAsk(...args),
  onStop: (...args) => onStop(...args),
  ...over,
});

const panel = (
  subject: ApiCompetency,
  props: Partial<React.ComponentProps<typeof DirectAnswerPanel>> = {},
) => (
  <ToastProvider>
    <DirectAnswerPanel
      competency={subject}
      section={{ name: "Behavioural competency", weightBp: 3000 }}
      editable
      whyNot={null}
      onChanged={() => {}}
      ask={ask()}
      {...props}
    />
  </ToastProvider>
);

const show = (
  subject: ApiCompetency = competency(),
  props: Partial<React.ComponentProps<typeof DirectAnswerPanel>> = {},
) => {
  const onChanged = vi.fn();
  const view = render(panel(subject, { onChanged, ...props }));
  return {
    onChanged,
    /** The same panel again, after what the period holds has moved. */
    again: (
      next: Partial<React.ComponentProps<typeof DirectAnswerPanel>> = {},
    ) => view.rerender(panel(subject, { onChanged, ...next })),
  };
};

const control = () =>
  screen.getByLabelText("Ask it on the review form") as HTMLSelectElement;
const pick = (label: string) => userEvent.selectOptions(control(), label);
const ADD = "Add to the review form";
const SAVE = "Save change";
const TAKE_OFF = "Take it off the form";
/** The button that writes what is picked, by what it says it will do. */
const button = (name: string) => screen.getByRole("button", { name });
const press = (name: string) => userEvent.click(button(name));
/** Pick, then press the button that says what it is going to do. */
const choose = async (label: string, action: string) => {
  await pick(label);
  await press(action);
};
const ALL_ACTIONS = new RegExp(`^(${ADD}|${SAVE}|${TAKE_OFF})$`);

const CONSEQUENCES = {
  manager: "Recorded when the manager sends their review.",
  employee: "Their own answer counts towards the mark.",
  both: "The manager's answer counts. The employee's is shown beside it.",
};

beforeEach(() => {
  onAsk = vi.fn().mockResolvedValue(undefined);
  onStop = vi.fn().mockResolvedValue(undefined);
  held = null;
});

describe("the four choices", () => {
  it("are Not asked, The manager, The employee and Both, in that order", () => {
    show();
    expect(
      within(control())
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Not asked", "The manager", "The employee", "Both"]);
  });

  it("start on Not asked for a subsection the period does not ask", () => {
    show();
    expect(control().value).toBe("none");
  });

  it("show what the period holds", () => {
    held = ["SELF", "MANAGER"];
    show();
    expect(control().value).toBe("both");
  });

  it("are not drawn at all where the period cannot be asked", () => {
    /* No `ask` is no period to put it on: demo, no permission, or its questions
       not read. The control would otherwise say "Not asked" without knowing. */
    render(
      <ToastProvider>
        <DirectAnswerPanel
          competency={competency()}
          section={null}
          editable
          whyNot={null}
          onChanged={() => {}}
        />
      </ToastProvider>,
    );
    expect(
      screen.queryByLabelText("Ask it on the review form"),
    ).not.toBeInTheDocument();
  });
});

describe("picking one", () => {
  it("writes nothing by itself", async () => {
    show();
    await pick("Both");
    expect(onAsk).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
  });

  it("writes nothing by itself when taking it off either", async () => {
    held = ["MANAGER"];
    show();
    await pick("Not asked");
    expect(onAsk).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
  });

  it("sends nothing when the choice is the one already there, and there is nothing to press", async () => {
    held = ["MANAGER"];
    show();
    await pick("The manager");
    expect(
      screen.queryByRole("button", { name: ALL_ACTIONS }),
    ).not.toBeInTheDocument();
    expect(onAsk).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
  });
});

describe("the button", () => {
  it("is there from the start, switched off, and says Add to the review form", () => {
    show();
    expect(button(ADD)).toBeDisabled();
  });

  it("is switched on once somebody is chosen", async () => {
    show();
    await pick("Both");
    expect(button(ADD)).toBeEnabled();
  });

  it("is switched off again when the pick goes back to Not asked", async () => {
    show();
    await pick("Both");
    await pick("Not asked");
    expect(button(ADD)).toBeDisabled();
  });

  it("is replaced by On the review form while the period asks it, with nothing to press", () => {
    held = ["MANAGER"];
    show();
    expect(screen.getByText("On the review form")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: ALL_ACTIONS }),
    ).not.toBeInTheDocument();
  });

  it("says Save change, and not Add, when it is on the form and somebody else is chosen", async () => {
    held = ["MANAGER"];
    show();
    await pick("Both");
    expect(button(SAVE)).toBeEnabled();
    expect(screen.queryByRole("button", { name: ADD })).not.toBeInTheDocument();
    expect(screen.queryByText("On the review form")).not.toBeInTheDocument();
  });

  it("says Take it off the form for Not asked, and not Save change", async () => {
    held = ["MANAGER"];
    show();
    await pick("Not asked");
    expect(button(TAKE_OFF)).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: SAVE }),
    ).not.toBeInTheDocument();
  });

  it("goes back to nothing to press when the pick returns to what the period holds", async () => {
    held = ["MANAGER"];
    show();
    await pick("Both");
    expect(button(SAVE)).toBeInTheDocument();
    await pick("The manager");
    expect(
      screen.queryByRole("button", { name: ALL_ACTIONS }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("On the review form")).toBeInTheDocument();
  });
});

describe("pressing it", () => {
  it("asks the manager alone", async () => {
    const { onChanged } = show();
    await choose("The manager", ADD);
    await waitFor(() => expect(onAsk).toHaveBeenCalledTimes(1));
    expect(onAsk).toHaveBeenCalledWith("c1", ["MANAGER"]);
    expect(onStop).not.toHaveBeenCalled();
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("asks the employee alone", async () => {
    show();
    await choose("The employee", ADD);
    await waitFor(() => expect(onAsk).toHaveBeenCalledWith("c1", ["SELF"]));
  });

  it("asks both, the person and then their manager, and nobody else", async () => {
    show();
    await choose("Both", ADD);
    await waitFor(() => expect(onAsk).toHaveBeenCalledTimes(1));
    expect(onAsk).toHaveBeenCalledWith("c1", ["SELF", "MANAGER"]);
  });

  it("changes who is asked with the same write that put it there", async () => {
    held = ["MANAGER"];
    show();
    await choose("Both", SAVE);
    await waitFor(() =>
      expect(onAsk).toHaveBeenCalledWith("c1", ["SELF", "MANAGER"]),
    );
    expect(onStop).not.toHaveBeenCalled();
  });

  it("takes it off the form for Not asked, which is a stop and never a write with nobody in it", async () => {
    held = ["MANAGER"];
    const { onChanged } = show();
    await choose("Not asked", TAKE_OFF);
    await waitFor(() => expect(onStop).toHaveBeenCalledWith("c1"));
    expect(onAsk).not.toHaveBeenCalled();
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("leaves On the review form where the button was, once it has gone through", async () => {
    show();
    await choose("Both", ADD);
    expect(await screen.findByText("On the review form")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: ALL_ACTIONS }),
    ).not.toBeInTheDocument();
  });

  it("goes back to a switched-off Add once it has been taken off", async () => {
    held = ["MANAGER"];
    const { again } = show();
    await choose("Not asked", TAKE_OFF);
    await waitFor(() => expect(onStop).toHaveBeenCalled());
    held = null;
    again();
    expect(button(ADD)).toBeDisabled();
    expect(screen.queryByText("On the review form")).not.toBeInTheDocument();
  });
});

describe("saying it was saved", () => {
  /* The button is replaced by On the review form, which stays. This is what says
     what happened, to whom, and where to find the question, and it is gone in six
     seconds. */
  it("says it was added, to whom, and where to find it, once the write has gone through", async () => {
    show();
    await choose("Both", ADD);
    expect(
      await screen.findByText("Adaptability added to the review form"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Asked of both. Find it under All questions."),
    ).toBeInTheDocument();
  });

  it("says the form was updated when it was already on it", async () => {
    held = ["MANAGER"];
    show();
    await choose("Both", SAVE);
    expect(
      await screen.findByText("Adaptability updated on the review form"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Adaptability added to the review form"),
    ).not.toBeInTheDocument();
  });

  it("says it came off for Not asked", async () => {
    held = ["MANAGER"];
    show();
    await choose("Not asked", TAKE_OFF);
    expect(
      await screen.findByText("Adaptability taken off the review form"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("It is no longer asked in this period."),
    ).toBeInTheDocument();
  });

  it("says nothing of the kind when the API refused, and shows its sentence instead", async () => {
    const sentence = "H2 2026 Appraisal has started.";
    onAsk.mockRejectedValue(new ApiError(409, "conflict", sentence));
    show();
    await choose("Both", ADD);
    expect(await screen.findByText(sentence)).toBeInTheDocument();
    expect(
      screen.queryByText("Adaptability added to the review form"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Adaptability updated on the review form"),
    ).not.toBeInTheDocument();
  });

  it("says nothing about a pick that has not been pressed", async () => {
    held = ["MANAGER"];
    show();
    await pick("Both");
    expect(
      screen.queryByText("Adaptability added to the review form"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Adaptability updated on the review form"),
    ).not.toBeInTheDocument();
  });
});

describe("what choosing it means", () => {
  it("says so in one line for each choice, and nothing for Not asked", async () => {
    show();
    expect(screen.queryByText(CONSEQUENCES.manager)).not.toBeInTheDocument();
    expect(screen.queryByText(CONSEQUENCES.employee)).not.toBeInTheDocument();
    expect(screen.queryByText(CONSEQUENCES.both)).not.toBeInTheDocument();

    await pick("The manager");
    expect(await screen.findByText(CONSEQUENCES.manager)).toBeInTheDocument();
    await pick("The employee");
    expect(await screen.findByText(CONSEQUENCES.employee)).toBeInTheDocument();
    expect(screen.queryByText(CONSEQUENCES.manager)).not.toBeInTheDocument();
    await pick("Both");
    expect(await screen.findByText(CONSEQUENCES.both)).toBeInTheDocument();
    expect(screen.queryByText(CONSEQUENCES.employee)).not.toBeInTheDocument();
  });

  it("says what the period holds when the panel opens, without anything being picked", () => {
    held = ["SELF"];
    show();
    expect(screen.getByText(CONSEQUENCES.employee)).toBeInTheDocument();
  });

  it("names the period in the hover, because the control is the period's and not the company's", () => {
    show();
    expect(
      screen.getByRole("button", { name: "More about this field" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "H2 2026 Appraisal only. Other periods choose for themselves.",
      ),
    ).toBeInTheDocument();
  });
});

describe("while the period is read again after a write", () => {
  it("shows what was just written at once, and does not flip back to the old value", async () => {
    const { again } = show();
    await choose("The manager", ADD);
    await waitFor(() => expect(onAsk).toHaveBeenCalled());

    /* The write landed and the period has not been read again: the panel is
       handed what it was handed before. A control driven by that alone would show
       Not asked again until the read landed, which reads as a change that did not
       take. */
    again();
    expect(control().value).toBe("manager");
    expect(screen.getByText(CONSEQUENCES.manager)).toBeInTheDocument();
  });

  it("believes the period once it has moved, and a stale write does not come back", async () => {
    const { again } = show();
    await choose("The manager", ADD);
    await waitFor(() => expect(onAsk).toHaveBeenCalled());

    /* The read landed with what was written. */
    held = ["MANAGER"];
    again();
    expect(control().value).toBe("manager");

    /* Somebody else takes it off. Kept any longer, the write above would show
       again here, for a choice that nobody holds. */
    held = null;
    again();
    expect(control().value).toBe("none");

    /* And somebody else puts it back to what this panel first saw. */
    held = ["SELF"];
    again();
    expect(control().value).toBe("employee");
    held = null;
    again();
    expect(control().value).toBe("none");
  });
});

describe("a refusal", () => {
  const refusal =
    '"Adaptability" is already answered on 12 reviews in "H2 2026 Appraisal", so it cannot be taken off the form.';

  it("is the API's own sentence, under the control, and the control is where the period has it", async () => {
    held = ["MANAGER"];
    onStop.mockRejectedValue(new ApiError(409, "conflict", refusal));
    const { onChanged } = show();

    await choose("Not asked", TAKE_OFF);

    expect(await screen.findByText(refusal)).toBeInTheDocument();
    expect(control().value).toBe("manager");
    expect(control()).toHaveAttribute("aria-invalid", "true");
    expect(onChanged).not.toHaveBeenCalled();
    /* Back on what the period holds, so it does not say a thing is off the form
       that is still on it. */
    expect(screen.getByText("On the review form")).toBeInTheDocument();
  });

  it("is shown as it comes for a write that puts it on the form", async () => {
    const sentence =
      "A subsection's answer is given by the person or their manager, never by peers.";
    onAsk.mockRejectedValue(new ApiError(422, "invalid", sentence));
    show();

    await choose("Both", ADD);

    expect(await screen.findByText(sentence)).toBeInTheDocument();
    expect(control().value).toBe("none");
    expect(button(ADD)).toBeDisabled();
  });

  it("is not a vague failure for something the server said in words", async () => {
    onAsk.mockRejectedValue(
      new ApiError(409, "conflict", "H2 2026 Appraisal has started."),
    );
    show();
    await choose("The manager", ADD);
    expect(
      await screen.findByText("H2 2026 Appraisal has started."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Something went wrong. Try again."),
    ).not.toBeInTheDocument();
  });

  it("goes as soon as another choice is made, which is before it is pressed", async () => {
    onAsk
      .mockRejectedValueOnce(new ApiError(409, "conflict", refusal))
      .mockResolvedValueOnce(undefined);
    show();
    await choose("The manager", ADD);
    expect(await screen.findByText(refusal)).toBeInTheDocument();

    await pick("The employee");
    expect(screen.queryByText(refusal)).not.toBeInTheDocument();
    expect(onAsk).toHaveBeenCalledTimes(1);
  });
});

describe("when it cannot be changed", () => {
  it("is switched off once the period has started, and says why", () => {
    held = ["MANAGER"];
    show(competency(), { ask: ask({ draft: false }) });
    expect(control()).toBeDisabled();
    expect(control().value).toBe("manager");
    expect(
      screen.getByText(
        "H2 2026 Appraisal has started, so this can no longer change.",
      ),
    ).toBeInTheDocument();
    /* A button that could never be pressed is a dead control, so there is none. */
    expect(
      screen.queryByRole("button", { name: ALL_ACTIONS }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("On the review form")).not.toBeInTheDocument();
  });

  it("says nothing about a period that has not started", () => {
    show();
    expect(control()).toBeEnabled();
    expect(screen.queryByText(/has started/)).not.toBeInTheDocument();
  });

  it("is switched off for somebody who cannot change the framework", () => {
    show(competency(), {
      editable: false,
      whyNot: "Only somebody who can manage settings can change this.",
    });
    expect(control()).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: ALL_ACTIONS }),
    ).not.toBeInTheDocument();
  });

  it("is switched off while a write is on its way, so a second press cannot cross it", async () => {
    let finish: () => void = () => {};
    onAsk.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    show();
    await choose("The manager", ADD);
    await waitFor(() => expect(control()).toBeDisabled());
    expect(button(ADD)).toBeDisabled();
    expect(button(ADD)).toHaveAttribute("aria-busy", "true");
    expect(onAsk).toHaveBeenCalledTimes(1);

    finish();
    await waitFor(() => expect(control()).toBeEnabled());
  });
});

describe("a pick-one subsection", () => {
  const choice = (id: string, label: string, sortOrder: number) => ({
    id,
    label,
    scoreBp: 5000,
    sortOrder,
  });

  it("cannot be asked while it has fewer than two choices, because nobody could answer it", () => {
    show(competency({ answerKind: "CHOICE", choiceOptions: [] }));
    const options = within(control()).getAllByRole("option");
    expect(
      options.map((option) => [
        option.textContent,
        (option as HTMLOptionElement).disabled,
      ]),
    ).toEqual([
      ["Not asked", false],
      ["The manager", true],
      ["The employee", true],
      ["Both", true],
    ]);
    expect(
      screen.getByText(
        "It needs at least two choices before a form can ask it.",
      ),
    ).toBeInTheDocument();
    /* Nothing can be chosen, so the button has nothing to do. */
    expect(button(ADD)).toBeDisabled();
  });

  it("can still be taken off the form, which is the way out if it somehow got on", async () => {
    held = ["MANAGER"];
    show(competency({ answerKind: "CHOICE", choiceOptions: [] }));
    await choose("Not asked", TAKE_OFF);
    await waitFor(() => expect(onStop).toHaveBeenCalledWith("c1"));
  });

  it("can be asked once it has two", async () => {
    show(
      competency({
        answerKind: "CHOICE",
        choiceOptions: [
          choice("o1", "Delighted", 0),
          choice("o2", "Satisfied", 1),
        ],
      }),
    );
    expect(
      screen.queryByText(
        "It needs at least two choices before a form can ask it.",
      ),
    ).not.toBeInTheDocument();
    await choose("Both", ADD);
    await waitFor(() =>
      expect(onAsk).toHaveBeenCalledWith("c1", ["SELF", "MANAGER"]),
    );
  });

  it("does not hold a level or a yes or no to a choices rule", () => {
    show(competency({ answerKind: "BOOLEAN", choiceOptions: [] }));
    expect(
      within(control())
        .getAllByRole("option")
        .every((option) => !(option as HTMLOptionElement).disabled),
    ).toBe(true);
  });
});

describe("what the panel said before", () => {
  it("still says how it is answered is shared by every period, and no longer that the whole tab is", () => {
    show();
    expect(
      screen.getByText(
        /How it is answered is shared by every appraisal period\./,
      ),
    ).toBeInTheDocument();
  });
});
