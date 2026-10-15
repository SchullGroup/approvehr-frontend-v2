import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  FormBuilder,
  KNOCKOUT_STATEMENT,
} from "@/components/hiring/form-builder";
import { FormPreview } from "@/components/hiring/form-preview";
import {
  QUESTION_KINDS,
  QUESTION_KIND_INFO,
  blankQuestion,
  defaultDefinition,
  validateDefinition,
  type FormDefinition,
  type FormQuestion,
} from "@/lib/marketing/apply-form";

/**
 * The form builder, used the way a recruiter uses it.
 *
 * `Harness` holds the form in state exactly as the screens above the builder do,
 * and shows the applicant's preview beside it, so a test can press a button in the
 * editor and read what the applicant would see. Nothing reaches into the
 * components: every step is a click or keystroke on something with a name.
 */

let latest: FormDefinition = defaultDefinition();

function Harness({
  initial = defaultDefinition(),
  filesAvailable = true,
  problems = {},
  withPreview = false,
}: {
  initial?: FormDefinition;
  filesAvailable?: boolean;
  problems?: Record<string, string>;
  withPreview?: boolean;
}) {
  const [value, setValue] = useState(initial);
  /* Recorded when an edit is made, not while rendering. */
  const edit = (next: FormDefinition) => {
    latest = next;
    setValue(next);
  };
  return (
    <>
      <FormBuilder
        value={value}
        onChange={edit}
        problems={problems}
        filesAvailable={filesAvailable}
      />
      {withPreview && (
        <FormPreview
          definition={value}
          company="Acme Ltd"
          roleTitle="Payroll Analyst"
          filesAvailable={filesAvailable}
        />
      )}
    </>
  );
}

const q = (over: Partial<FormQuestion> & { kind: FormQuestion["kind"] }) => {
  const { kind, ...rest } = over;
  return { ...blankQuestion(kind, rest.id ?? "x"), ...rest };
};

const withQuestions = (...questions: FormQuestion[]): FormDefinition => ({
  ...defaultDefinition(),
  questions,
});

const card = (position: number, kind: string) =>
  screen.getByRole("region", { name: `Question ${position}: ${kind}` });

async function add(user: ReturnType<typeof userEvent.setup>, kind: string) {
  await user.click(
    within(screen.getByRole("group", { name: "Add a question" })).getByRole(
      "button",
      { name: new RegExp(`^${kind}`) },
    ),
  );
}

describe("adding a question of every kind", () => {
  it("offers all eight kinds, each with a line on what it is for", () => {
    render(<Harness />);
    const menu = within(screen.getByRole("group", { name: "Add a question" }));
    for (const kind of QUESTION_KINDS) {
      const info = QUESTION_KIND_INFO[kind];
      expect(
        menu.getByRole("button", { name: new RegExp(`^${info.label}`) }),
      ).toBeInTheDocument();
      expect(menu.getByText(info.hint)).toBeInTheDocument();
    }
  });

  it.each(QUESTION_KINDS.map((kind) => [QUESTION_KIND_INFO[kind].label, kind]))(
    "adds %s and shows the settings that belong to it, and only those",
    async (label, kind) => {
      const user = userEvent.setup();
      render(<Harness />);
      await add(user, label as string);

      const added = card(1, label as string);
      const inside = within(added);
      expect(latest.questions).toHaveLength(1);
      expect(latest.questions[0]?.kind).toBe(kind);

      /* Every kind has a question box, helper text and a Required switch. */
      expect(inside.getByLabelText(/^Question/)).toBeInTheDocument();
      expect(inside.getByLabelText(/Helper text/)).toBeInTheDocument();
      expect(
        inside.getByRole("switch", { name: "Required" }),
      ).toBeInTheDocument();

      const has = (name: string | RegExp) =>
        inside.queryByRole("switch", { name }) !== null;
      expect(has("Word limit")).toBe(kind === "LONG_TEXT");
      expect(has("Knockout question")).toBe(kind === "YES_NO");
      expect(
        inside.queryByLabelText("Smallest allowed (optional)") !== null,
      ).toBe(kind === "NUMBER");
      expect(inside.queryByRole("group", { name: "Options" }) !== null).toBe(
        kind === "SINGLE_CHOICE" || kind === "MULTI_CHOICE",
      );
    },
  );

  it("starts a long answer at 150 words and a choice question with two empty options", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await add(user, "Long answer");
    expect(latest.questions[0]?.wordLimit).toBe(150);
    expect(
      within(card(1, "Long answer")).getByLabelText("Most words"),
    ).toHaveValue(150);

    await add(user, "Pick one");
    expect(latest.questions[1]?.options).toHaveLength(2);
    expect(
      within(card(2, "Pick one")).getAllByRole("textbox", {
        name: /^Option \d/,
      }),
    ).toHaveLength(2);
  });

  it("lets the words of a question be typed, and keeps them", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await add(user, "Short answer");
    await user.type(
      within(card(1, "Short answer")).getByLabelText(/^Question/),
      "Current job title",
    );
    expect(latest.questions[0]?.label).toBe("Current job title");
  });
});

describe("what each kind lets you set", () => {
  it("turns a word limit on and off, and edits the number", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={withQuestions(
          q({ kind: "LONG_TEXT", id: "a", label: "Why us?", wordLimit: 150 }),
        )}
      />,
    );
    const inside = within(card(1, "Long answer"));
    const field = inside.getByLabelText("Most words");
    await user.clear(field);
    await user.type(field, "80");
    expect(latest.questions[0]?.wordLimit).toBe(80);

    await user.click(inside.getByRole("switch", { name: "Word limit" }));
    expect(latest.questions[0]?.wordLimit).toBeNull();
    expect(inside.queryByLabelText("Most words")).not.toBeInTheDocument();

    await user.click(inside.getByRole("switch", { name: "Word limit" }));
    expect(latest.questions[0]?.wordLimit).toBe(150);
  });

  it("sets the bounds of a number question", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={withQuestions(q({ kind: "NUMBER", id: "a", label: "Years" }))}
      />,
    );
    const inside = within(card(1, "Number"));
    await user.type(inside.getByLabelText("Smallest allowed (optional)"), "0");
    await user.type(inside.getByLabelText("Largest allowed (optional)"), "40");
    expect(latest.questions[0]).toMatchObject({ min: 0, max: 40 });
  });

  it("adds and removes options, and never goes below two", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={withQuestions(
          q({
            kind: "SINGLE_CHOICE",
            id: "a",
            label: "Tool",
            options: [
              { id: "1", label: "Excel" },
              { id: "2", label: "SQL" },
            ],
          }),
        )}
      />,
    );
    const inside = within(card(1, "Pick one"));
    expect(
      inside.getByRole("button", { name: "Remove option 1" }),
    ).toBeDisabled();

    await user.click(inside.getByRole("button", { name: "Add option" }));
    expect(latest.questions[0]?.options).toHaveLength(3);
    await user.type(
      inside.getByRole("textbox", { name: "Option 3" }),
      "Python",
    );
    expect(latest.questions[0]?.options[2]?.label).toBe("Python");

    await user.click(inside.getByRole("button", { name: "Remove option 1" }));
    expect(latest.questions[0]?.options.map((o) => o.label)).toEqual([
      "SQL",
      "Python",
    ]);
    expect(
      inside.getByRole("button", { name: "Remove option 1" }),
    ).toBeDisabled();
  });

  it("keeps an option's id when its label is edited, so answers stay linked", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={withQuestions(
          q({
            kind: "SINGLE_CHOICE",
            id: "a",
            label: "Tool",
            options: [
              { id: "keep-me", label: "Excel" },
              { id: "2", label: "SQL" },
            ],
          }),
        )}
      />,
    );
    const first = within(card(1, "Pick one")).getByRole("textbox", {
      name: "Option 1",
    });
    await user.clear(first);
    await user.type(first, "Spreadsheets");
    expect(latest.questions[0]?.options[0]).toEqual({
      id: "keep-me",
      label: "Spreadsheets",
    });
  });

  it("changes a question's kind and keeps its words", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={withQuestions(
          q({
            kind: "SHORT_TEXT",
            id: "a",
            label: "Notice period",
            helper: "In weeks",
            required: true,
          }),
        )}
      />,
    );
    await user.selectOptions(
      within(card(1, "Short answer")).getByLabelText("Kind of answer"),
      "NUMBER",
    );
    expect(latest.questions[0]).toMatchObject({
      kind: "NUMBER",
      label: "Notice period",
      helper: "In weeks",
      required: true,
    });
  });

  it("will not change the kind of a question people have already answered, and says why", () => {
    render(
      <Harness
        initial={withQuestions(
          q({ kind: "YES_NO", id: "a", label: "Right to work?", answered: 3 }),
        )}
      />,
    );
    const kind = within(card(1, "Yes or no")).getByLabelText("Kind of answer");
    expect(kind).toBeDisabled();
    expect(kind).toHaveAccessibleDescription(
      /3 applications have answered this, so its kind cannot change/,
    );
  });
});

describe("knockout", () => {
  it("states beside the switch that it flags for a person and never rejects anyone", () => {
    render(
      <Harness
        initial={withQuestions(
          q({ kind: "YES_NO", id: "a", label: "Right to work?" }),
        )}
      />,
    );
    const inside = within(card(1, "Yes or no"));
    const toggle = inside.getByRole("switch", { name: "Knockout question" });
    expect(toggle).toHaveAccessibleDescription(KNOCKOUT_STATEMENT);
    expect(KNOCKOUT_STATEMENT).toBe(
      "A knockout flags the application for a person to review. It never rejects anyone.",
    );
  });

  it("chooses which answer raises the flag, and nudges if it is not required", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={withQuestions(
          q({ kind: "YES_NO", id: "a", label: "Right to work?" }),
        )}
      />,
    );
    const inside = within(card(1, "Yes or no"));
    expect(
      inside.queryByLabelText("Flag it when the answer is"),
    ).not.toBeInTheDocument();

    await user.click(inside.getByRole("switch", { name: "Knockout question" }));
    expect(latest.questions[0]?.knockout).toBe(true);
    expect(latest.questions[0]?.knockoutWhen).toBe("NO");
    expect(
      inside.getByText(/not required, so somebody can skip it/),
    ).toBeInTheDocument();

    await user.selectOptions(
      inside.getByLabelText("Flag it when the answer is"),
      "YES",
    );
    expect(latest.questions[0]?.knockoutWhen).toBe("YES");

    await user.click(inside.getByRole("switch", { name: "Required" }));
    expect(
      inside.queryByText(/not required, so somebody can skip it/),
    ).not.toBeInTheDocument();
    expect(
      within(
        screen.getByRole("region", { name: "Question 1: Yes or no" }),
      ).getByText("Knockout", { selector: "span" }),
    ).toBeInTheDocument();
  });
});

describe("putting questions in order", () => {
  const three = () =>
    withQuestions(
      q({ kind: "SHORT_TEXT", id: "a", label: "First" }),
      q({ kind: "SHORT_TEXT", id: "b", label: "Second" }),
      q({ kind: "SHORT_TEXT", id: "c", label: "Third" }),
    );
  const order = () => latest.questions.map((question) => question.label);

  it("moves a question up and down with buttons that name it", async () => {
    const user = userEvent.setup();
    render(<Harness initial={three()} />);
    await user.click(
      screen.getByRole("button", { name: "Move question 3 up" }),
    );
    expect(order()).toEqual(["First", "Third", "Second"]);
    await user.click(
      screen.getByRole("button", { name: "Move question 1 down" }),
    );
    expect(order()).toEqual(["Third", "First", "Second"]);
  });

  it("disables the move that goes nowhere, rather than hiding it", () => {
    render(<Harness initial={three()} />);
    expect(
      screen.getByRole("button", { name: "Move question 1 up" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move question 3 down" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move question 2 up" }),
    ).toBeEnabled();
  });

  it("is reachable and operable from the keyboard alone", async () => {
    const user = userEvent.setup();
    render(<Harness initial={three()} />);
    /* Tab until the control is reached, as a keyboard user would, then press it. */
    const target = screen.getByRole("button", { name: "Move question 2 down" });
    for (let i = 0; i < 200 && document.activeElement !== target; i += 1)
      await user.tab();
    expect(document.activeElement).toBe(target);
    await user.keyboard("{Enter}");
    expect(order()).toEqual(["First", "Third", "Second"]);

    /* Space works too. Question 1 is still first and can go down. */
    const first = screen.getByRole("button", { name: "Move question 1 down" });
    first.focus();
    await user.keyboard(" ");
    expect(order()).toEqual(["Third", "First", "Second"]);
  });

  it("renumbers the cards after a move", async () => {
    const user = userEvent.setup();
    render(<Harness initial={three()} />);
    await user.click(
      screen.getByRole("button", { name: "Move question 3 up" }),
    );
    expect(
      within(card(2, "Short answer")).getByLabelText(/^Question/),
    ).toHaveValue("Third");
  });
});

describe("removing a question", () => {
  it("removes it, says so, and Undo puts it back in the same place", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={withQuestions(
          q({ kind: "SHORT_TEXT", id: "a", label: "First" }),
          q({ kind: "SHORT_TEXT", id: "b", label: "Second" }),
          q({ kind: "SHORT_TEXT", id: "c", label: "Third" }),
        )}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Delete question 2" }));
    expect(latest.questions.map((x) => x.label)).toEqual(["First", "Third"]);
    expect(screen.getByRole("status")).toHaveTextContent("Removed Second.");

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(latest.questions.map((x) => x.label)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
    expect(
      screen.queryByRole("button", { name: "Undo" }),
    ).not.toBeInTheDocument();
  });

  it("says that an answered question keeps its answers when it comes off the form", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={withQuestions(
          q({ kind: "SHORT_TEXT", id: "a", label: "Title", answered: 4 }),
        )}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Delete question 1" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      /their answers are kept/,
    );
  });
});

describe("the switches for what everyone is asked", () => {
  it("sets phone, CV and note to off, optional or required", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(
      within(
        screen.getByRole("radiogroup", { name: "Phone number" }),
      ).getByRole("radio", { name: "Required" }),
    );
    await user.click(
      within(screen.getByRole("radiogroup", { name: "CV upload" })).getByRole(
        "radio",
        { name: "Off" },
      ),
    );
    await user.click(
      within(screen.getByRole("radiogroup", { name: "A note" })).getByRole(
        "radio",
        { name: "Required" },
      ),
    );
    expect(latest.standard).toEqual({
      phone: "REQUIRED",
      cv: "OFF",
      coverNote: "REQUIRED",
    });
  });

  it("says plainly where a CV cannot be taken because there is nowhere to store it", () => {
    render(<Harness filesAvailable={false} />);
    expect(
      screen.getByText(/File storage is not set up yet/),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "Add a question" })).getByRole(
        "button",
        { name: /^File/ },
      ),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Covering letter upload" }),
    ).not.toBeInTheDocument();
  });

  it("offers a covering-letter upload as a file question, and stops at three files", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(
      screen.getByRole("button", { name: "Covering letter upload" }),
    );
    expect(latest.questions[0]).toMatchObject({
      kind: "FILE",
      label: "Your covering letter",
    });

    await add(user, "File");
    await add(user, "File");
    expect(latest.questions.filter((x) => x.kind === "FILE")).toHaveLength(3);
    expect(
      within(screen.getByRole("group", { name: "Add a question" })).getByRole(
        "button",
        { name: /^File/ },
      ),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Covering letter upload" }),
    ).not.toBeInTheDocument();
  });

  it("says whether the privacy notice is on, and that it is the company's setting", () => {
    const on: FormDefinition = {
      ...defaultDefinition(),
      consent: {
        enabled: true,
        text: "We keep it.",
        url: null,
        ref: "default-1",
      },
    };
    const { unmount } = render(<Harness initial={on} />);
    expect(screen.getByTestId("consent-state")).toHaveTextContent(
      /tick a privacy notice/,
    );
    expect(screen.getByTestId("consent-state")).toHaveTextContent(
      /Careers page settings/,
    );
    unmount();
    render(<Harness />);
    expect(screen.getByTestId("consent-state")).toHaveTextContent(
      /not asked to accept/,
    );
  });
});

describe("validation, said at the question", () => {
  it("shows a problem under the question it is about, and marks it invalid", () => {
    render(
      <Harness
        initial={withQuestions(q({ kind: "SHORT_TEXT", id: "a", label: "" }))}
        problems={{ a: "Write the question." }}
      />,
    );
    const input = within(card(1, "Short answer")).getByLabelText(/^Question/);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Write the question.");
  });

  it("agrees with validateDefinition about what is wrong", () => {
    const bad = withQuestions(
      q({
        kind: "SINGLE_CHOICE",
        id: "a",
        label: "Tool",
        options: [{ id: "1", label: "Only" }],
      }),
      q({ kind: "LONG_TEXT", id: "b", label: "Why", wordLimit: 5000 }),
    );
    const found = validateDefinition(bad);
    expect(found.questions["a"]).toBe("Give at least 2 options.");
    expect(found.questions["b"]).toMatch(/whole number from 1 to 1000/);
  });
});

describe("the preview is the applicant's own form", () => {
  it("shows a question as it is typed, with its helper and a required mark", async () => {
    const user = userEvent.setup();
    render(<Harness withPreview />);
    await add(user, "Short answer");
    const inside = within(card(1, "Short answer"));
    await user.type(inside.getByLabelText(/^Question/), "Current job title");
    await user.type(inside.getByLabelText(/Helper text/), "As on your payslip");
    await user.click(inside.getByRole("switch", { name: "Required" }));

    const preview = within(screen.getByTestId("form-preview"));
    const box = preview.getByLabelText(/Current job title/);
    expect(box).toBeRequired();
    expect(box).toHaveAccessibleDescription("As on your payslip");
  });

  it("changes with the kind, the limit, the options and the order — and says nothing of knockouts", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        withPreview
        initial={withQuestions(
          q({ kind: "LONG_TEXT", id: "a", label: "Why us?", wordLimit: 40 }),
          q({
            kind: "YES_NO",
            id: "b",
            label: "Right to work?",
            knockout: true,
            required: true,
          }),
          q({
            kind: "MULTI_CHOICE",
            id: "c",
            label: "Tools",
            options: [
              { id: "1", label: "Excel" },
              { id: "2", label: "SQL" },
            ],
          }),
        )}
      />,
    );
    const preview = within(screen.getByTestId("form-preview"));
    expect(preview.getByTestId("q-a-count")).toHaveTextContent("0 of 40 words");
    expect(
      preview.getByRole("group", { name: /Right to work\?/ }),
    ).toBeInTheDocument();
    expect(preview.getByLabelText("SQL")).toBeInTheDocument();
    /* The applicant is never told which answer flags them. */
    expect(screen.getByTestId("form-preview")).not.toHaveTextContent(
      /knockout/i,
    );
    expect(screen.getByTestId("form-preview")).not.toHaveTextContent(/flag/i);

    const limit = within(card(1, "Long answer")).getByLabelText("Most words");
    await user.clear(limit);
    await user.type(limit, "10");
    expect(preview.getByTestId("q-a-count")).toHaveTextContent("0 of 10 words");

    await user.click(
      within(card(3, "Pick several")).getByRole("button", {
        name: "Add option",
      }),
    );
    await user.type(
      within(card(3, "Pick several")).getByRole("textbox", {
        name: "Option 3",
      }),
      "Python",
    );
    expect(preview.getByLabelText("Python")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Move question 3 up" }),
    );
    const text = screen.getByTestId("form-preview").textContent ?? "";
    expect(text.indexOf("Tools")).toBeLessThan(text.indexOf("Right to work?"));
  });

  it("follows the standard switches", async () => {
    const user = userEvent.setup();
    render(<Harness withPreview />);
    const preview = within(screen.getByTestId("form-preview"));
    expect(preview.getByLabelText(/Phone/)).toBeInTheDocument();
    await user.click(
      within(
        screen.getByRole("radiogroup", { name: "Phone number" }),
      ).getByRole("radio", { name: "Off" }),
    );
    expect(preview.queryByLabelText(/Phone/)).not.toBeInTheDocument();
    await user.click(
      within(screen.getByRole("radiogroup", { name: "CV upload" })).getByRole(
        "radio",
        { name: "Off" },
      ),
    );
    expect(
      document.querySelector('[data-testid=form-preview] input[type="file"]'),
    ).toBeNull();
  });

  it("is labelled as a preview and sends nothing", async () => {
    const user = userEvent.setup();
    render(<Harness withPreview />);
    expect(screen.getByTestId("apply-mode-note")).toHaveTextContent(
      "Preview. This is what an applicant sees. Nothing you do here is sent or saved.",
    );
    const preview = within(screen.getByTestId("form-preview"));
    await user.type(preview.getByLabelText(/First name/), "A");
    await user.type(preview.getByLabelText(/Surname/), "B");
    await user.type(preview.getByLabelText(/^Email/), "a@b.co");
    await user.click(preview.getByRole("button", { name: /Send application/ }));
    expect(
      await preview.findByRole("heading", {
        name: "This is what they see after sending",
      }),
    ).toBeInTheDocument();
  });

  it("shows the company's privacy notice when it is on", () => {
    render(
      <Harness
        withPreview
        initial={{
          ...defaultDefinition(),
          consent: {
            enabled: true,
            text: "We keep it for a year.",
            url: null,
            ref: "custom-1",
          },
        }}
      />,
    );
    expect(
      within(screen.getByTestId("form-preview")).getByTestId("consent-text"),
    ).toHaveTextContent("We keep it for a year.");
  });
});
