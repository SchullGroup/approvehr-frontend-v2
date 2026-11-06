import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiCompetency,
  ApiCompetencyRow,
  ApiEmployeeCompetencies,
  RateBody,
} from "@/lib/api/performance";
import { RecordLevelDialog } from "@/app/(app)/performance/rating-dialog";
import { WRITTEN_NEVER_COUNTS } from "@/lib/performance/answer-kind";

/**
 * Recording a written answer on a subsection, under Record a level.
 *
 * A subsection answered in the person's own words is the one kind that is never
 * scored, and the API refuses a level, a yes or no, a pick or a target sent to it by
 * name. `RateBody` types all four answers as optional fields, so `tsc` is satisfied
 * by a body that sends them all. What goes in the body, what the box says about
 * itself and what the period's help promises are the things to test, and the last of
 * them is the easiest to get wrong: copy written for a level says an answer "counts
 * towards the mark", which for words is false.
 */

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
    id: "c-comm",
    name: "Communication",
    answerKind: "TEXT",
    /* A subsection switched to words before its first rating keeps the choices it
       had, and the API still lists them. */
    choiceOptions: [
      { id: "o-a", label: "Meets", scoreBp: 6000, sortOrder: 0 },
      { id: "o-b", label: "Exceeds", scoreBp: 10000, sortOrder: 1 },
    ],
  }),
];

const GROUPS = [
  {
    sectionId: "s-core",
    sectionName: "Core competency",
    competencies: COMPETENCIES,
  },
];

const row = (over: Partial<ApiCompetencyRow>): ApiCompetencyRow => ({
  competencyId: "c-comm",
  name: "Communication",
  sectionId: "s-core",
  sectionName: "Core competency",
  isCore: false,
  scaleMax: 5,
  answerKind: "TEXT",
  level: null,
  target: null,
  gap: null,
  note: null,
  ratedAt: "2026-10-01T00:00:00.000Z",
  ...over,
});

/* What each person's skills say, by id. */
let rowsOf: Record<string, ApiCompetencyRow[]>;
let cycles: { id: string; name: string; stage: string }[];

vi.mock("@/lib/store/performance", () => ({
  useFramework: () => ({
    competencies: COMPETENCIES,
    groups: GROUPS,
    loading: false,
    error: null,
  }),
  useAppraisals: () => ({ cycles, loading: false }),
  useSkills: (employeeId: string | null) => {
    const rows = employeeId ? (rowsOf[employeeId] ?? []) : [];
    const skills: ApiEmployeeCompetencies | null = employeeId
      ? {
          employeeId,
          employeeName: "Somebody",
          rows,
          summary: { total: rows.length, rated: rows.length, gaps: 0 },
        }
      : null;
    return {
      skills,
      loading: false,
      error: null,
      source: "api",
      reload: () => {},
    };
  },
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({ employees: [], people: PEOPLE }),
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
const words = () => screen.getByLabelText(/Answer/) as HTMLTextAreaElement;
const write = (text: string) => userEvent.type(words(), text);
/** Pasted, because typing four thousand characters one key at a time is not a test. */
const paste = async (text: string) => {
  await userEvent.click(words());
  await userEvent.paste(text);
};
const save = () =>
  userEvent.click(screen.getByRole("button", { name: "Save it" }));
const sent = (onSave: ReturnType<typeof mount>["onSave"]) => ({
  skill: onSave.mock.calls[0]?.[0],
  body: onSave.mock.calls[0]?.[1],
});

beforeEach(() => {
  rowsOf = {};
  cycles = [];
});

describe("a subsection answered in the person's own words", () => {
  it("asks for a box to write in, and has no level, no target and no scale", async () => {
    mount();
    await pickSkill("Communication");

    expect(words().tagName).toBe("TEXTAREA");
    expect(screen.queryByLabelText(/Current level/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Target level/)).not.toBeInTheDocument();
  });

  it("does not offer the choices it was once given, however many the API still lists", async () => {
    mount();
    await pickSkill("Communication");
    expect(
      screen.queryByRole("option", { name: "Meets" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Pick a choice" }),
    ).not.toBeInTheDocument();
  });

  it("says once, in the one sentence every screen uses, that it is read by people and never counts", async () => {
    mount();
    await pickSkill("Communication");
    expect(screen.getAllByText(WRITTEN_NEVER_COUNTS)).toHaveLength(1);
  });

  it("says it on the page, not behind an icon, and not for a kind it is not true of", async () => {
    mount();
    await pickSkill("Punctuality");
    expect(screen.queryByText(WRITTEN_NEVER_COUNTS)).not.toBeInTheDocument();
    await pickSkill("Follows safety procedures");
    expect(screen.queryByText(WRITTEN_NEVER_COUNTS)).not.toBeInTheDocument();
    await pickSkill("Communication");
    expect(screen.getByText(WRITTEN_NEVER_COUNTS)).toBeVisible();
  });

  it("sends the words, trimmed, in `textValue` and in none of the other three", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Communication");
    await write("  Clear and early, and kind with it.  ");
    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(sent(onSave)).toEqual({
      skill: "c-comm",
      body: {
        employeeId: "e-chidi",
        textValue: "Clear and early, and kind with it.",
      },
    });
    for (const wrong of ["level", "boolValue", "choiceOptionId", "target"]) {
      expect(sent(onSave).body).not.toHaveProperty(wrong);
    }
  });

  it("keeps the paragraphs it was given", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Communication");
    await paste("First point.\n\nSecond point.");
    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(sent(onSave).body).toEqual({
      employeeId: "e-chidi",
      textValue: "First point.\n\nSecond point.",
    });
  });

  it("sends the note with the words, as it does with any other answer", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Communication");
    await write("Clear and early.");
    await userEvent.type(
      screen.getByLabelText(/Anything to add/),
      "Said so in the standup",
    );
    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(sent(onSave).body).toEqual({
      employeeId: "e-chidi",
      textValue: "Clear and early.",
      note: "Said so in the standup",
    });
  });
});

describe("a written answer that cannot be sent", () => {
  it("is told to write, in the form's own words, and nothing is sent, when the box is blank", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Communication");
    await save();

    expect(
      await screen.findByText("Write the answer in words."),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("is told the same for a box of spaces, which is not an answer", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Communication");
    await write("     ");
    await save();

    expect(
      await screen.findByText("Write the answer in words."),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("is told, in the server's own sentence, when it is past 4,000 characters, and nothing is sent", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Communication");
    await paste("w".repeat(4001));
    await save();

    expect(
      await screen.findByText("Keep it to 4000 characters."),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("sends exactly 4,000 characters, which is the most the server takes", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Communication");
    await paste("w".repeat(4000));
    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect((sent(onSave).body as RateBody).textValue).toHaveLength(4000);
  });

  it("has no maxLength, so a longer paste is kept whole to be shortened, and the count says by how much", async () => {
    mount();
    await pickSkill("Communication");
    await paste("w".repeat(4021));
    expect(words().value).toHaveLength(4021);
  });

  it("takes the complaint away the moment the box is fixed, without another press", async () => {
    mount();
    await pickPerson();
    await pickSkill("Communication");
    await save();
    await screen.findByText("Write the answer in words.");

    await write("Now it says something.");
    expect(
      screen.queryByText("Write the answer in words."),
    ).not.toBeInTheDocument();
  });

  it("follows the fault: blank, then too long, then neither", async () => {
    mount();
    await pickPerson();
    await pickSkill("Communication");
    await save();
    await screen.findByText("Write the answer in words.");

    await paste("w".repeat(4001));
    expect(screen.getByText("Keep it to 4000 characters.")).toBeInTheDocument();
    expect(
      screen.queryByText("Write the answer in words."),
    ).not.toBeInTheDocument();
  });

  it("says nothing before the first press of Save, because a blank box is where it starts", async () => {
    mount();
    await pickSkill("Communication");
    expect(
      screen.queryByText("Write the answer in words."),
    ).not.toBeInTheDocument();
  });
});

describe("the count under the box", () => {
  it("is not there until the answer is getting long", async () => {
    mount();
    await pickSkill("Communication");
    await paste("w".repeat(3499));
    expect(screen.queryByText(/of 4,000 characters/)).not.toBeInTheDocument();
  });

  it("is there from 3,500, and muted", async () => {
    mount();
    await pickSkill("Communication");
    await paste("w".repeat(3500));
    const count = screen.getByText("3,500 of 4,000 characters");
    expect(count).toHaveClass("text-muted");
    expect(count).not.toHaveClass("text-danger-text");
  });

  it("keeps counting past the limit, in danger text, which is the clearest way to say by how much", async () => {
    mount();
    await pickSkill("Communication");
    await paste("w".repeat(4021));
    const count = screen.getByText("4,021 of 4,000 characters");
    expect(count).toHaveClass("text-danger-text");
    expect(count).not.toHaveClass("text-muted");
  });

  it("is not danger at exactly the limit", async () => {
    mount();
    await pickSkill("Communication");
    await paste("w".repeat(4000));
    expect(screen.getByText("4,000 of 4,000 characters")).toHaveClass(
      "text-muted",
    );
  });
});

describe("the words already on record", () => {
  beforeEach(() => {
    rowsOf = {
      "e-chidi": [row({ textValue: "Said on Monday." })],
      "e-emeka": [row({ textValue: "Emeka's words." })],
    };
  });

  it("are already in the box, so recording again corrects them instead of starting from nothing", async () => {
    mount();
    await pickPerson();
    await pickSkill("Communication");
    expect(words().value).toBe("Said on Monday.");
  });

  it("are what is sent when nothing is changed", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Communication");
    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(sent(onSave).body).toEqual({
      employeeId: "e-chidi",
      textValue: "Said on Monday.",
    });
  });

  it("are replaced by what is typed over them, which is what is sent", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Communication");
    await userEvent.clear(words());
    await write("Said on Friday.");
    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect((sent(onSave).body as RateBody).textValue).toBe("Said on Friday.");
  });

  it("are not brought back by clearing the box: blank is blank, and is refused as such", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Communication");
    await userEvent.clear(words());
    expect(words().value).toBe("");
    await save();

    expect(
      await screen.findByText("Write the answer in words."),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("are the other person's when the person changes, and what was typed for the last one is dropped", async () => {
    mount();
    await pickPerson("e-chidi");
    await pickSkill("Communication");
    await userEvent.clear(words());
    await write("Typed for Chidi.");

    await pickPerson("e-emeka");
    expect(words().value).toBe("Emeka's words.");
  });

  it("are found once the person is chosen, even when the skill was chosen first", async () => {
    mount();
    await pickSkill("Communication");
    expect(words().value).toBe("");
    await pickPerson("e-chidi");
    expect(words().value).toBe("Said on Monday.");
  });

  it("are nothing when the person has none on record, and when the server does not send the field", async () => {
    rowsOf = {
      "e-chidi": [row({ ratedAt: null, textValue: null })],
      "e-emeka": [row({})],
    };
    mount();
    await pickPerson("e-chidi");
    await pickSkill("Communication");
    expect(words().value).toBe("");
    await pickPerson("e-emeka");
    expect(words().value).toBe("");
  });

  it("are not sent to a subsection answered another way", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Communication");
    await pickSkill("Follows safety procedures");
    await userEvent.selectOptions(screen.getByLabelText(/Answer/), "Yes");
    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(sent(onSave).body).toEqual({
      employeeId: "e-chidi",
      boolValue: true,
    });
  });

  it("forget what was typed when the skill changes, so the box starts from the record again", async () => {
    mount();
    await pickPerson();
    await pickSkill("Communication");
    await userEvent.clear(words());
    await write("Half a thought");
    await pickSkill("Punctuality");
    await pickSkill("Communication");
    expect(words().value).toBe("Said on Monday.");
  });
});

describe("the appraisal period", () => {
  beforeEach(() => {
    cycles = [{ id: "p-1", name: "H2 2026 Appraisal", stage: "SELF" }];
  });

  it("is carried with the words", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Communication");
    await write("Clear and early.");
    await userEvent.selectOptions(
      screen.getByLabelText(/Appraisal period/),
      "p-1",
    );
    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(sent(onSave).body).toEqual({
      employeeId: "e-chidi",
      textValue: "Clear and early.",
      reviewCycleId: "p-1",
    });
  });

  it("says, with none chosen, that it is a snapshot, and promises nothing about a mark", async () => {
    mount();
    await pickSkill("Communication");
    expect(
      screen.getByText("A snapshot of where they are now."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/This will not affect any appraisal mark/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Counts towards/)).not.toBeInTheDocument();
  });

  it("says, with one chosen, that it is filed there and replaces the last, and never that it counts", async () => {
    mount();
    await pickSkill("Communication");
    await userEvent.selectOptions(
      screen.getByLabelText(/Appraisal period/),
      "p-1",
    );
    expect(
      screen.getByText(
        "Filed under that period. Each person has one answer per period, so writing it again replaces this one.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Counts towards this person's mark/),
    ).not.toBeInTheDocument();
  });

  it("keeps saying it counts for a level, which does", async () => {
    mount();
    await pickSkill("Punctuality");
    await userEvent.selectOptions(
      screen.getByLabelText(/Appraisal period/),
      "p-1",
    );
    expect(
      screen.getByText(/Counts towards this person's mark for that period/),
    ).toBeInTheDocument();
  });

  it("says the whole of it only once: the sentence under the box is the one place a written answer is said not to count", async () => {
    mount();
    await pickSkill("Communication");
    await userEvent.selectOptions(
      screen.getByLabelText(/Appraisal period/),
      "p-1",
    );
    const sayings = screen.queryAllByText(/never counts|not affect any/);
    expect(sayings).toHaveLength(1);
  });
});

describe("the language check on what a manager writes about somebody", () => {
  it("quotes the exact words, with the person's name caught as well as a pronoun", async () => {
    mount();
    await pickPerson("e-chidi");
    await pickSkill("Communication");
    await write("Chidi is quite disorganised.");

    expect(
      screen.getByText("One phrase here is worth a second look"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Chidi is quite disorganised", { selector: "q" }),
    ).toBeInTheDocument();
  });

  it("catches a pronoun before anybody has been chosen", async () => {
    mount();
    await pickSkill("Communication");
    await write("She is quite disorganised.");
    expect(
      screen.getByText("She is quite disorganised", { selector: "q" }),
    ).toBeInTheDocument();
  });

  it("has nothing to say about words that describe the work", async () => {
    mount();
    await pickPerson();
    await pickSkill("Communication");
    await write("Moved three deadlines in October without notice.");
    expect(screen.queryByText(/worth a second look/)).not.toBeInTheDocument();
  });

  it("never stops the save: the words go as they were written", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Communication");
    await write("Chidi is quite disorganised.");
    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect((sent(onSave).body as RateBody).textValue).toBe(
      "Chidi is quite disorganised.",
    );
  });

  it("says that it never stops the save, beside what it found", async () => {
    mount();
    await pickPerson();
    await pickSkill("Communication");
    await write("Chidi is quite disorganised.");
    expect(
      screen.getByText(/Nothing here stops you saving it/),
    ).toBeInTheDocument();
    /* There is no review in this dialog to be sent. */
    expect(screen.queryByText(/sending the review/)).not.toBeInTheDocument();
  });

  it("is not drawn for the kinds that are not words", async () => {
    mount();
    await pickPerson();
    await pickSkill("Follows safety procedures");
    expect(screen.queryByText(/worth a second look/)).not.toBeInTheDocument();
  });
});

describe("changing the skill", () => {
  it("forgets the words, and sends exactly one of the four for the skill that is left", async () => {
    const { onSave } = mount();
    await pickPerson();
    await pickSkill("Communication");
    await write("Typed for the written one.");
    await pickSkill("Punctuality");
    await userEvent.selectOptions(screen.getByLabelText(/Current level/), "4");
    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(sent(onSave).body).toEqual({ employeeId: "e-chidi", level: 4 });
    expect(sent(onSave).body).not.toHaveProperty("textValue");
  });
});

describe("the form's name", () => {
  it("is still Record a level, whatever the subsection is answered in", async () => {
    mount();
    await pickSkill("Communication");
    expect(
      screen.getByRole("dialog", { name: "Record a level" }),
    ).toBeInTheDocument();
  });
});
