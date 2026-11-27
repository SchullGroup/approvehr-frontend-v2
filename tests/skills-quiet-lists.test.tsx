import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { ApiCompetencyRow } from "@/lib/api/performance";

/**
 * Competency ratings, below the top of the page, says only what is true.
 *
 * - A person's own list is the competencies somebody has rated. A person with
 *   nothing rated reads one calm "Not recorded", and a company with no framework
 *   reads nothing: no row of "not assessed", no "No framework yet" card.
 * - "Below target" is a tab only while somebody is below target.
 * - In a department, a person is one row, with their gaps as small chips.
 * - "Appraisals are switched off" offers its one button to somebody who can use
 *   it, and sends everybody else back to Performance.
 */

const row = (over: Partial<ApiCompetencyRow>): ApiCompetencyRow => ({
  competencyId: "c",
  name: "Punctuality",
  sectionId: "s-core",
  sectionName: "Core competency",
  isCore: false,
  scaleMax: 5,
  answerKind: "RATING",
  level: null,
  target: null,
  gap: null,
  note: null,
  ratedAt: null,
  ...over,
});

const RATED = "2026-10-20T09:00:00.000Z";

let mineRows: ApiCompetencyRow[];
let gapRows: {
  employeeId: string;
  employeeName: string;
  competencyId: string;
  competencyName: string;
  sectionName: string | null;
  level: number;
  target: number;
  scaleMax: number;
}[];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, back: () => {}, replace: replaceMock }),
  usePathname: () => "/performance",
  useSearchParams: () => new URLSearchParams(),
}));
const replaceMock = vi.fn();

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
  useEmployeeDirectory: () => ({
    employees: [],
    people: [
      { id: "e-chidi", fullName: "Chidi Nwosu", departmentId: "d-eng" },
      { id: "e-emeka", fullName: "Emeka Anyanwu", departmentId: "d-eng" },
    ],
  }),
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ flat: [{ id: "d-eng", name: "Engineering" }] }),
}));
vi.mock("@/lib/store/performance", () => ({
  CATEGORY_ORDER: ["Core competency", "Leadership"],
  useRatingScale: () => ({ scale: { levels: [] } }),
  useFramework: () => ({
    competencies: [],
    groups: [],
    loading: false,
    error: null,
  }),
  useSections: () => ({ sections: [], loading: false, reload: () => {} }),
  useAppraisals: () => ({ cycles: [], loading: false }),
  useSkills: () => ({
    skills: {
      employeeId: "me",
      employeeName: "Me",
      rows: mineRows,
      summary: { total: mineRows.length, rated: 0, gaps: 0 },
    },
    loading: false,
    error: null,
    source: "api",
    reload: () => {},
  }),
  useGaps: () => ({
    gaps: gapRows,
    loading: false,
    error: null,
    reload: () => {},
  }),
  useRating: () => ({ editable: true, rate: vi.fn() }),
}));

const { SkillsTab } = await import("@/app/(app)/performance/skills");

const show = () =>
  render(
    <ToastProvider>
      <SkillsTab canSeeCompany isManager />
    </ToastProvider>,
  );

beforeEach(() => {
  mineRows = [];
  gapRows = [];
  replaceMock.mockClear();
});

describe("a person's own competencies", () => {
  it("lists only what has been rated, under the sections that have something", () => {
    mineRows = [
      row({
        competencyId: "c1",
        name: "Punctuality",
        level: 4,
        target: 5,
        ratedAt: RATED,
      }),
      row({ competencyId: "c2", name: "Teamwork" }),
      row({
        competencyId: "c3",
        name: "Vision",
        sectionName: "Leadership",
      }),
    ];
    show();
    expect(screen.getByText("Punctuality")).toBeInTheDocument();
    expect(screen.getByText("4 of 5")).toBeInTheDocument();
    expect(screen.getByText("Core competency")).toBeInTheDocument();
    expect(screen.queryByText("Teamwork")).not.toBeInTheDocument();
    expect(screen.queryByText("Vision")).not.toBeInTheDocument();
    expect(screen.queryByText("Leadership")).not.toBeInTheDocument();
    expect(screen.queryByText(/Not assessed/)).not.toBeInTheDocument();
    expect(screen.queryByText("Not recorded")).not.toBeInTheDocument();
  });

  it("says Not recorded once, whatever the number of competencies, when nothing is rated", () => {
    mineRows = [
      row({ competencyId: "c1", name: "Punctuality" }),
      row({ competencyId: "c2", name: "Teamwork" }),
      row({ competencyId: "c3", name: "Vision", sectionName: "Leadership" }),
    ];
    show();
    expect(screen.getAllByText("Not recorded")).toHaveLength(1);
    expect(screen.queryByText("Punctuality")).not.toBeInTheDocument();
    expect(screen.queryByText(/Not assessed/)).not.toBeInTheDocument();
  });

  it("says nothing at all when there is no framework", () => {
    mineRows = [];
    show();
    expect(screen.queryByText("Not recorded")).not.toBeInTheDocument();
    expect(screen.queryByText(/No framework yet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Finish setup/)).not.toBeInTheDocument();
  });

  it("has no Managers only badge on Leadership", () => {
    mineRows = [
      row({
        competencyId: "c3",
        name: "Vision",
        sectionName: "Leadership",
        level: 3,
        ratedAt: RATED,
      }),
    ];
    show();
    expect(screen.getByText("Leadership")).toBeInTheDocument();
    expect(screen.queryByText("Managers only")).not.toBeInTheDocument();
  });
});

describe("the Below target tab", () => {
  it("is not there when nobody is below target, and so there is no tab strip", () => {
    show();
    expect(screen.queryByRole("tab", { name: /Below target/ })).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(
      screen.queryByText(/Nobody is below target/),
    ).not.toBeInTheDocument();
  });

  it("is there, with its count, when somebody is", () => {
    gapRows = [
      {
        employeeId: "e-chidi",
        employeeName: "Chidi Nwosu",
        competencyId: "c1",
        competencyName: "Planning",
        sectionName: "Core competency",
        level: 2,
        target: 4,
        scaleMax: 5,
      },
    ];
    show();
    expect(
      screen.getByRole("tab", { name: /Below target/ }),
    ).toBeInTheDocument();
  });

  it("shows a person once, with their gaps as chips", async () => {
    gapRows = [
      {
        employeeId: "e-chidi",
        employeeName: "Chidi Nwosu",
        competencyId: "c1",
        competencyName: "Planning",
        sectionName: "Core competency",
        level: 2,
        target: 4,
        scaleMax: 5,
      },
      {
        employeeId: "e-chidi",
        employeeName: "Chidi Nwosu",
        competencyId: "c2",
        competencyName: "Delegation",
        sectionName: "Leadership",
        level: 1,
        target: 3,
        scaleMax: 5,
      },
      {
        employeeId: "e-emeka",
        employeeName: "Emeka Anyanwu",
        competencyId: "c1",
        competencyName: "Planning",
        sectionName: "Core competency",
        level: 3,
        target: 4,
        scaleMax: 5,
      },
    ];
    show();
    await userEvent.click(screen.getByRole("tab", { name: /Below target/ }));
    /* The card counts people, not gaps: two people, three gaps. */
    expect(screen.getByText("2 below target")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Engineering/ }));

    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    const chidi = rows.find((one) => /Chidi Nwosu/.test(one.textContent ?? ""));
    expect(chidi).toBeDefined();
    expect(
      within(chidi as HTMLElement).getByText("Planning"),
    ).toBeInTheDocument();
    expect(within(chidi as HTMLElement).getByText("2/4")).toBeInTheDocument();
    expect(
      within(chidi as HTMLElement).getByText("Delegation"),
    ).toBeInTheDocument();
    expect(within(chidi as HTMLElement).getByText("1/3")).toBeInTheDocument();
  });
});
