import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiCompetency,
  ApiCompetencyRow,
  ApiEmployeeCompetencies,
  RateBody,
} from "@/lib/api/performance";
import { RecordLevelDialog } from "@/app/(app)/performance/rating-dialog";

/**
 * Recording an answer on a pick-a-list subsection opens on the choice the person
 * already has.
 *
 * Rating somebody again corrects their answer, and the form used to open blank, so
 * correcting one meant finding the current pick in the list by eye. Their skills
 * row now carries the pick's **id**, and the form matches on that:
 *
 * - not on the label, because two choices can share one, and picking the first
 *   "Meets" for somebody who had the second would silently change their score;
 * - not when the choice has been taken off the list since, in which case nothing is
 *   chosen and the form says what their answer was instead of offering a choice
 *   that is not there;
 * - and not for a server that does not send the id, which claims nothing.
 */

const PEOPLE = [
  {
    id: "e-chidi",
    fullName: "Chidi Nwosu",
    jobTitle: "Engineer",
    department: "Eng",
    managerId: "me",
  },
  {
    id: "e-emeka",
    fullName: "Emeka Anyanwu",
    jobTitle: "Analyst",
    department: "Eng",
    managerId: "me",
  },
];

const FEEDBACK: ApiCompetency = {
  id: "c-fb",
  name: "Customer feedback",
  sectionId: "s-core",
  sectionName: "Core competency",
  description: null,
  isCore: false,
  scaleMax: 5,
  active: true,
  archived: false,
  ratingCount: 0,
  answerKind: "CHOICE",
  choiceOptions: [
    /* Two choices with one name and different scores, and a third. */
    { id: "o-a", label: "Meets", scoreBp: 6000, sortOrder: 0 },
    { id: "o-b", label: "Meets", scoreBp: 8000, sortOrder: 1 },
    { id: "o-c", label: "Exceeds", scoreBp: 10000, sortOrder: 2 },
  ],
};

const skillRow = (over: Partial<ApiCompetencyRow>): ApiCompetencyRow => ({
  competencyId: "c-fb",
  name: "Customer feedback",
  sectionId: "s-core",
  sectionName: "Core competency",
  isCore: false,
  scaleMax: 5,
  answerKind: "CHOICE",
  level: null,
  boolValue: null,
  target: null,
  gap: null,
  note: null,
  ratedAt: "2026-10-01T00:00:00.000Z",
  ...over,
});

/* What each person's skills say, by id. Chidi has an answer on record. */
let rowsOf: Record<string, ApiCompetencyRow[]>;

vi.mock("@/lib/store/performance", () => ({
  useFramework: () => ({
    competencies: [FEEDBACK],
    groups: [
      {
        sectionId: "s-core",
        sectionName: "Core competency",
        competencies: [FEEDBACK],
      },
    ],
    loading: false,
    error: null,
  }),
  useAppraisals: () => ({ cycles: [], loading: false }),
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

const pick = async (person = "e-chidi") => {
  await userEvent.selectOptions(screen.getByLabelText(/Employee/), person);
  await userEvent.selectOptions(
    screen.getByLabelText(/Which skill/),
    "Customer feedback",
  );
};
const answer = () => screen.getByLabelText(/^Answer/) as HTMLSelectElement;
const save = () =>
  userEvent.click(screen.getByRole("button", { name: "Save it" }));

beforeEach(() => {
  rowsOf = {};
});

describe("opening on the answer they already have", () => {
  it("chooses their current pick, and saving without a change sends it", async () => {
    rowsOf = {
      "e-chidi": [
        skillRow({ choiceOptionId: "o-c", choiceOptionLabel: "Exceeds" }),
      ],
    };
    const { onSave } = mount();
    await pick();

    expect(answer().value).toBe("o-c");
    await save();
    expect(onSave).toHaveBeenCalledWith("c-fb", {
      employeeId: "e-chidi",
      choiceOptionId: "o-c",
    });
  });

  it("finds it by id and not by name, where two choices share one", async () => {
    rowsOf = {
      "e-chidi": [
        skillRow({ choiceOptionId: "o-b", choiceOptionLabel: "Meets" }),
      ],
    };
    mount();
    await pick();

    /* The second "Meets", not the first. */
    expect(answer().value).toBe("o-b");
  });

  it("chooses nothing for a server that does not send the id", async () => {
    rowsOf = { "e-chidi": [skillRow({ choiceOptionLabel: "Exceeds" })] };
    mount();
    await pick();

    expect(answer().value).toBe("");
    expect(
      screen.queryByText(/Their current answer is/),
    ).not.toBeInTheDocument();
  });

  it("chooses nothing for somebody with no answer on record", async () => {
    rowsOf = {
      "e-chidi": [
        skillRow({
          choiceOptionId: null,
          choiceOptionLabel: null,
          ratedAt: null,
        }),
      ],
    };
    mount();
    await pick();

    expect(answer().value).toBe("");
    expect(
      screen.queryByText(/Their current answer is/),
    ).not.toBeInTheDocument();
  });
});

describe("when the choice they picked is no longer on the list", () => {
  it("does not offer it, and says what their answer was", async () => {
    rowsOf = {
      "e-chidi": [
        skillRow({
          choiceOptionId: "o-gone",
          choiceOptionLabel: "Retired choice",
        }),
      ],
    };
    const { onSave } = mount();
    await pick();

    expect(answer().value).toBe("");
    expect(
      screen.getByText(
        /Their current answer is .Retired choice., which is no longer on the list/,
      ),
    ).toBeVisible();

    /* And it is not saved on their behalf: a choice is still asked for. */
    await save();
    expect(screen.getByText("Pick one of the choices.")).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("a different answer, and a different person", () => {
  it("keeps what somebody picks over the default", async () => {
    rowsOf = {
      "e-chidi": [
        skillRow({ choiceOptionId: "o-c", choiceOptionLabel: "Exceeds" }),
      ],
    };
    const { onSave } = mount();
    await pick();
    await userEvent.selectOptions(answer(), "o-a");

    await save();
    expect(onSave).toHaveBeenCalledWith("c-fb", {
      employeeId: "e-chidi",
      choiceOptionId: "o-a",
    });
  });

  it("drops that default for somebody else, who has nothing on record", async () => {
    rowsOf = {
      "e-chidi": [
        skillRow({ choiceOptionId: "o-c", choiceOptionLabel: "Exceeds" }),
      ],
    };
    mount();
    await pick("e-chidi");
    expect(answer().value).toBe("o-c");

    await userEvent.selectOptions(screen.getByLabelText(/Employee/), "e-emeka");
    expect(answer().value).toBe("");
  });

  it("does not carry a pick over to another person either", async () => {
    mount();
    await pick("e-chidi");
    await userEvent.selectOptions(answer(), "o-a");
    expect(answer().value).toBe("o-a");

    await userEvent.selectOptions(screen.getByLabelText(/Employee/), "e-emeka");
    expect(answer().value).toBe("");
  });
});
