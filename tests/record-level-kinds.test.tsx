import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiCompetency, RateBody } from "@/lib/api/performance";
import { RecordLevelDialog } from "@/app/(app)/performance/rating-dialog";

/**
 * Recording an answer on a subsection asks for the answer the subsection takes.
 *
 * A subsection is answered one of three ways, and the API refuses any answer that
 * is not in the way the subsection names: a level on a yes-or-no subsection is
 * refused by name, and so is a target on anything but a level. A form that always
 * sent a level would be refused on two of the three, and `RateBody` types a level,
 * a yes or no and a choice as three optional fields, so `tsc` is satisfied by a
 * body that sends all three. What goes in the body is the thing to test.
 */

/* Lookup-shaped, as the directory hands every caller: a full name and no first
   or last name. The dialog reads these from `people`, never from `employees`. */
const PEOPLE = [
  {
    id: "e-chidi",
    fullName: "Chidi Nwosu",
    jobTitle: "Engineer",
    department: "Engineering",
    managerId: "me",
  },
  {
    id: "e-emeka",
    fullName: "Emeka Anyanwu",
    jobTitle: "Analyst",
    department: "Engineering",
    managerId: "me",
  },
];

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

const COMPETENCIES: ApiCompetency[] = [
  subsection({ id: "c-punct", name: "Punctuality" }),
  subsection({
    id: "c-safety",
    name: "Follows safety procedures",
    answerKind: "BOOLEAN",
  }),
  subsection({
    id: "c-feedback",
    name: "Customer feedback",
    answerKind: "CHOICE",
    choiceOptions: [
      { id: "o-b", label: "Satisfied", scoreBp: 6000, sortOrder: 1 },
      { id: "o-a", label: "Delighted", scoreBp: 10000, sortOrder: 0 },
    ],
  }),
  subsection({
    id: "c-empty",
    name: "Site visits",
    answerKind: "CHOICE",
    choiceOptions: [],
  }),
  subsection({ id: "c-ten", name: "Delivery", scaleMax: 10 }),
];
const GROUPS = [
  {
    sectionId: "s-core",
    sectionName: "Core competency",
    competencies: COMPETENCIES,
  },
];

let cycles: { id: string; name: string; stage: string }[];

vi.mock("@/lib/store/performance", () => ({
  useFramework: () => ({
    competencies: COMPETENCIES,
    groups: GROUPS,
    loading: false,
    error: null,
  }),
  useAppraisals: () => ({ cycles, loading: false }),
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({ people: PEOPLE }),
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ employeeId: "me" }),
}));
vi.mock("@/lib/permissions", () => ({ useCan: () => true }));

const mount = () => {
  const onSave = vi.fn<(id: string, body: RateBody) => Promise<void>>();
  onSave.mockResolvedValue(undefined);
  render(<RecordLevelDialog open onClose={vi.fn()} onSave={onSave} />);
  return { onSave };
};

const pickPerson = (id = "e-chidi") =>
  userEvent.selectOptions(screen.getByLabelText(/Employee/), id);
const pickSkill = (name: string) =>
  userEvent.selectOptions(screen.getByLabelText(/Which skill/), name);
const save = () =>
  userEvent.click(screen.getByRole("button", { name: "Save it" }));
const sent = (onSave: ReturnType<typeof mount>["onSave"]) => ({
  skill: onSave.mock.calls[0]?.[0],
  body: onSave.mock.calls[0]?.[1],
});

beforeEach(() => {
  cycles = [];
});

describe("a subsection that is rated", () => {
  it("asks for a level and a target, as it always did", async () => {
    mount();
    await pickSkill("Punctuality");
    expect(screen.getByLabelText(/Current level/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Target level/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Answer")).not.toBeInTheDocument();
  });

  it("sends a level and a target, and nothing else of the three", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Punctuality");
    await userEvent.selectOptions(screen.getByLabelText(/Current level/), "4");
    await userEvent.selectOptions(screen.getByLabelText(/Target level/), "5");
    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(sent(onSave)).toEqual({
      skill: "c-punct",
      body: { employeeId: "e-chidi", level: 4, target: 5 },
    });
  });

  it("sends no target when none was chosen", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Punctuality");
    await userEvent.selectOptions(screen.getByLabelText(/Current level/), "3");
    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(sent(onSave).body).toEqual({ employeeId: "e-chidi", level: 3 });
  });

  it("offers the steps of that subsection's own scale", async () => {
    mount();
    await pickSkill("Delivery");
    const steps = within(screen.getByLabelText(/Current level/))
      .getAllByRole("option")
      .map((one) => one.textContent);
    expect(steps).toContain("10 of 10");
    expect(steps).not.toContain("11 of 10");
  });

  it("is what the form shows before any subsection is chosen", () => {
    mount();
    expect(screen.getByLabelText(/Current level/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Target level/)).toBeInTheDocument();
  });

  it("is told a level is needed, in the sentence it always was", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Punctuality");
    await save();
    expect(
      await screen.findByText("Pick the level they are at."),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("a subsection that is a yes or a no", () => {
  it("asks for the answer and has no level, no target and no scale", async () => {
    mount();
    await pickSkill("Follows safety procedures");

    const answer = screen.getByLabelText(/Answer/);
    expect(
      within(answer)
        .getAllByRole("option")
        .map((one) => one.textContent),
    ).toEqual(["Pick yes or no", "Yes", "No"]);
    expect(screen.queryByLabelText(/Current level/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Target level/)).not.toBeInTheDocument();
  });

  it("sends a yes as true and nothing else of the three", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Follows safety procedures");
    await userEvent.selectOptions(screen.getByLabelText(/Answer/), "Yes");
    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(sent(onSave)).toEqual({
      skill: "c-safety",
      body: { employeeId: "e-chidi", boolValue: true },
    });
    expect(sent(onSave).body).not.toHaveProperty("level");
    expect(sent(onSave).body).not.toHaveProperty("target");
    expect(sent(onSave).body).not.toHaveProperty("choiceOptionId");
  });

  it("sends a no as false, which is an answer and not a missing one", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Follows safety procedures");
    await userEvent.selectOptions(screen.getByLabelText(/Answer/), "No");
    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(sent(onSave).body).toEqual({
      employeeId: "e-chidi",
      boolValue: false,
    });
  });

  it("is told to pick one, and nothing is sent, when neither is picked", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Follows safety procedures");
    await save();
    expect(await screen.findByText("Pick yes or no.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("a subsection answered by picking from a list", () => {
  it("offers its own choices in their order, as words and never as scores", async () => {
    mount();
    await pickSkill("Customer feedback");

    const answer = screen.getByLabelText(/Answer/);
    expect(
      within(answer)
        .getAllByRole("option")
        .map((one) => one.textContent),
    ).toEqual(["Pick a choice", "Delighted", "Satisfied"]);
    expect(screen.queryByLabelText(/Current level/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Target level/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/100%|60%/);
  });

  it("sends the id of the choice and nothing else of the three", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Customer feedback");
    await userEvent.selectOptions(screen.getByLabelText(/Answer/), "Satisfied");
    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(sent(onSave)).toEqual({
      skill: "c-feedback",
      body: { employeeId: "e-chidi", choiceOptionId: "o-b" },
    });
  });

  it("is told to pick one, and nothing is sent, when none is picked", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Customer feedback");
    await save();
    expect(
      await screen.findByText("Pick one of the choices."),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("says nothing can be recorded, and does not offer to save, when it has no choices yet", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Site visits");

    expect(
      screen.getByText(
        /Site visits is answered by picking from a list, and the list has no choices yet/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Answer/)).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Save it" });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("changing the skill", () => {
  it("does not carry a level over to a yes or no, or a target with it", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Punctuality");
    await userEvent.selectOptions(screen.getByLabelText(/Current level/), "4");
    await userEvent.selectOptions(screen.getByLabelText(/Target level/), "5");

    await pickSkill("Follows safety procedures");
    await userEvent.selectOptions(screen.getByLabelText(/Answer/), "Yes");
    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    /* Exactly one of the three. A level typed against the last subsection would
       be refused by name on this one. */
    expect(sent(onSave).body).toEqual({
      employeeId: "e-chidi",
      boolValue: true,
    });
  });

  it("forgets the answer given to the last one, so it is asked again", async () => {
    mount();
    await pickSkill("Follows safety procedures");
    await userEvent.selectOptions(screen.getByLabelText(/Answer/), "Yes");
    await pickSkill("Punctuality");
    await userEvent.selectOptions(screen.getByLabelText(/Current level/), "2");
    await pickSkill("Follows safety procedures");

    expect((screen.getByLabelText(/Answer/) as HTMLSelectElement).value).toBe(
      "",
    );
    await pickSkill("Punctuality");
    expect(
      (screen.getByLabelText(/Current level/) as HTMLSelectElement).value,
    ).toBe("");
  });

  it("does not carry a choice over to another list", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Customer feedback");
    await userEvent.selectOptions(screen.getByLabelText(/Answer/), "Delighted");
    await pickSkill("Follows safety procedures");
    await pickSkill("Customer feedback");
    expect((screen.getByLabelText(/Answer/) as HTMLSelectElement).value).toBe(
      "",
    );

    await save();
    expect(
      await screen.findByText("Pick one of the choices."),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("the appraisal period", () => {
  beforeEach(() => {
    cycles = [{ id: "p-1", name: "H2 2026 Appraisal", stage: "SELF" }];
  });

  it("is carried with the answer, whatever the kind", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Follows safety procedures");
    await userEvent.selectOptions(screen.getByLabelText(/Answer/), "Yes");
    await userEvent.selectOptions(
      screen.getByLabelText(/Appraisal period/),
      "p-1",
    );
    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(sent(onSave).body).toEqual({
      employeeId: "e-chidi",
      boolValue: true,
      reviewCycleId: "p-1",
    });
  });

  it("says, with none chosen, that a level fills the gap table and the heatmap", async () => {
    mount();
    await pickSkill("Punctuality");
    expect(
      screen.getByText(/it fills the skills gap table and heatmap/),
    ).toBeInTheDocument();
  });

  it("does not say that for a yes or no or a pick, which are in neither", async () => {
    mount();
    await pickSkill("Follows safety procedures");
    expect(
      screen.queryByText(/it fills the skills gap table and heatmap/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /does not appear in the skills gap table or heatmap, which are about levels/,
      ),
    ).toBeInTheDocument();

    await pickSkill("Customer feedback");
    expect(
      screen.queryByText(/it fills the skills gap table and heatmap/),
    ).not.toBeInTheDocument();
  });

  it("says, once one is chosen, that it counts towards the mark, for every kind", async () => {
    mount();
    await pickSkill("Customer feedback");
    await userEvent.selectOptions(
      screen.getByLabelText(/Appraisal period/),
      "p-1",
    );
    expect(
      screen.getByText(/Counts towards this person's mark for that period/),
    ).toBeInTheDocument();
  });
});

describe("the note", () => {
  it("goes with a yes or no as it does with a level", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Follows safety procedures");
    await userEvent.selectOptions(screen.getByLabelText(/Answer/), "No");
    await userEvent.type(
      screen.getByLabelText(/Anything to add/),
      "Missed the briefing",
    );
    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(sent(onSave).body).toEqual({
      employeeId: "e-chidi",
      boolValue: false,
      note: "Missed the briefing",
    });
  });
});

describe("the form's name", () => {
  it("is still Record a level", () => {
    mount();
    expect(
      screen.getByRole("dialog", { name: "Record a level" }),
    ).toBeInTheDocument();
  });
});
