import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type {
  ApiCompetency,
  ApiCompetencyRow,
  ApiEmployeeCompetencies,
  RateBody,
} from "@/lib/api/performance";

/**
 * Recording a written answer from the Skills screen, and reading it back there.
 *
 * The dialog and the row are tested on their own. What only the screen can get
 * wrong is the join between them: the toast that follows a save (it said "Level
 * recorded" for every answer, which for words is not true), the three lists that
 * have to be read again, the dialog that has to close on success and stay open on a
 * refusal with what was typed still in it, and a written answer that was just saved
 * showing up on somebody's list as words and not as a level.
 */

const PEOPLE = [
  {
    id: "e-chidi",
    fullName: "Chidi Nwosu",
    jobTitle: "Engineer",
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

const COMPETENCIES = [
  subsection({ id: "c-punct", name: "Punctuality" }),
  subsection({ id: "c-comm", name: "Communication", answerKind: "TEXT" }),
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
  ratedAt: "2026-10-20T09:00:00.000Z",
  ...over,
});

let mineRows: ApiCompetencyRow[];
let rate: Mock<(id: string, body: RateBody) => Promise<unknown>>;
let reloadMine: Mock<() => void>;
let reloadGaps: Mock<() => void>;
let reloadHeatmap: Mock<() => void>;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, back: () => {}, replace: () => {} }),
  usePathname: () => "/performance",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/permissions", () => ({ useCan: () => true }));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({
    isConnected: true,
    isLoading: false,
    mode: "api",
    employeeId: "me",
    actingId: "me",
  }),
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({ employees: [], people: PEOPLE }),
}));
vi.mock("@/lib/store/performance", () => ({
  CATEGORY_ORDER: ["Core competency"],
  useFramework: () => ({
    competencies: COMPETENCIES,
    groups: [
      {
        sectionId: "s-core",
        sectionName: "Core competency",
        competencies: COMPETENCIES,
      },
    ],
    loading: false,
    error: null,
  }),
  useAppraisals: () => ({ cycles: [], loading: false }),
  useSkills: (employeeId: string | null) => {
    /* The signed-in person's own list is the screen's; everybody else's is what the
       dialog reads to show what is already on record. */
    const rows = employeeId === "me" ? mineRows : [];
    const skills: ApiEmployeeCompetencies | null = employeeId
      ? {
          employeeId,
          employeeName: "Somebody",
          rows,
          summary: {
            total: rows.length,
            rated: rows.filter((one) => one.ratedAt !== null).length,
            gaps: 0,
          },
        }
      : null;
    return {
      skills,
      loading: false,
      error: null,
      source: "api",
      reload: employeeId === "me" ? reloadMine : () => {},
    };
  },
  useGaps: () => ({
    gaps: [],
    loading: false,
    error: null,
    reload: reloadGaps,
  }),
  useHeatmap: () => ({
    heatmap: null,
    loading: false,
    error: null,
    reload: reloadHeatmap,
  }),
  useRating: () => ({
    editable: true,
    rate: (id: string, body: RateBody) => rate(id, body),
  }),
}));

const { SkillsTab } = await import("@/app/(app)/performance/skills");

const mount = () =>
  render(
    <ToastProvider>
      <SkillsTab canSeeCompany isManager />
    </ToastProvider>,
  );

const openDialog = () =>
  userEvent.click(screen.getByRole("button", { name: "Record a level" }));
const dialog = () => screen.getByRole("dialog", { name: "Record a level" });
const inDialog = () => within(dialog());
const pickPerson = () =>
  userEvent.selectOptions(inDialog().getByLabelText(/Employee/), "e-chidi");
const pickSkill = (name: string) =>
  userEvent.selectOptions(inDialog().getByLabelText(/Which skill/), name);
const save = () =>
  userEvent.click(inDialog().getByRole("button", { name: "Save it" }));

beforeEach(() => {
  mineRows = [];
  rate = vi.fn().mockResolvedValue({});
  reloadMine = vi.fn();
  reloadGaps = vi.fn();
  reloadHeatmap = vi.fn();
});

describe("a written answer on somebody's own list", () => {
  it("is their words and a Written badge, in the group of its section, with no level", () => {
    mineRows = [
      row({ textValue: "Clear and early, and kind with it." }),
      row({
        competencyId: "c-punct",
        name: "Punctuality",
        answerKind: "RATING",
        level: 4,
        target: 5,
      }),
    ];
    mount();
    expect(
      screen.getByText("Clear and early, and kind with it."),
    ).toBeInTheDocument();
    expect(screen.getByText("Written")).toBeInTheDocument();
    /* The level beside it is still a level. */
    expect(screen.getByText("Level 4 of 5 · target 5")).toBeInTheDocument();
  });

  it("counts as assessed, because it has been answered", () => {
    mineRows = [row({ textValue: "Clear and early." })];
    mount();
    expect(screen.getByText("1 of 1")).toBeInTheDocument();
  });
});

describe("recording a written answer", () => {
  it("sends the words for the skill, says an answer was recorded and not a level, and reads the lists again", async () => {
    mount();
    await openDialog();
    await pickPerson();
    await pickSkill("Communication");
    await userEvent.type(
      inDialog().getByLabelText(/Answer/),
      "Clear and early, and kind with it.",
    );
    await save();

    await waitFor(() => expect(rate).toHaveBeenCalledTimes(1));
    expect(rate).toHaveBeenCalledWith("c-comm", {
      employeeId: "e-chidi",
      textValue: "Clear and early, and kind with it.",
    });
    expect(await screen.findByText("Answer recorded")).toBeInTheDocument();
    expect(screen.queryByText("Level recorded")).not.toBeInTheDocument();
    /* All three: the gap table and the heatmap are what a new answer moves. */
    expect(reloadMine).toHaveBeenCalledTimes(1);
    expect(reloadGaps).toHaveBeenCalledTimes(1);
    expect(reloadHeatmap).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Record a level" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("still says a level was recorded for a level", async () => {
    mount();
    await openDialog();
    await pickPerson();
    await pickSkill("Punctuality");
    await userEvent.selectOptions(
      inDialog().getByLabelText(/Current level/),
      "4",
    );
    await save();

    await waitFor(() => expect(rate).toHaveBeenCalledTimes(1));
    expect(rate).toHaveBeenCalledWith("c-punct", {
      employeeId: "e-chidi",
      level: 4,
    });
    expect(await screen.findByText("Level recorded")).toBeInTheDocument();
  });

  it("shows the API's own sentence when it refuses, keeps the dialog open and keeps the words", async () => {
    const refusal =
      "You can rate the people who report to you. Anything wider needs the records permission.";
    rate.mockRejectedValue(new ApiError(403, "forbidden", refusal));
    mount();
    await openDialog();
    await pickPerson();
    await pickSkill("Communication");
    await userEvent.type(
      inDialog().getByLabelText(/Answer/),
      "Clear and early.",
    );
    await save();

    expect(await screen.findByText(refusal)).toBeInTheDocument();
    expect(screen.getByText("That did not work")).toBeInTheDocument();
    expect(screen.queryByText("Answer recorded")).not.toBeInTheDocument();
    expect(dialog()).toBeInTheDocument();
    expect(
      (inDialog().getByLabelText(/Answer/) as HTMLTextAreaElement).value,
    ).toBe("Clear and early.");
    expect(reloadMine).not.toHaveBeenCalled();
  });

  it("sends nothing for a blank box, and says so on the field, without a toast", async () => {
    mount();
    await openDialog();
    await pickPerson();
    await pickSkill("Communication");
    await save();

    expect(
      await inDialog().findByText("Write the answer in words."),
    ).toBeInTheDocument();
    expect(rate).not.toHaveBeenCalled();
    expect(screen.queryByText("Answer recorded")).not.toBeInTheDocument();
  });
});
