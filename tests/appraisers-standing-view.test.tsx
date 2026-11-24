import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import type {
  ApiAppraiser,
  ApiAppraiserMap,
  ApiAppraiserMapRow,
} from "@/lib/api/performance";

/**
 * Who appraises whom, with the reporting line as the default (owner request,
 * 24 Nov 2026).
 *
 * - No number cards and no "Fill in from the reporting line".
 * - It opens on "All appraisal periods": everybody with the appraiser the
 *   reporting line gives them (manager, else department head, else nobody).
 * - The people with no appraiser are one line and a filter, not a card.
 * - A chosen period is the override view; on one that has not started, an
 *   unmapped person shows the appraiser its start will give them.
 */

const state = vi.hoisted(() => ({
  search: "",
  maps: {} as Record<string, ApiAppraiserMap>,
  asked: [] as (string | null)[],
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(state.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/performance/appraisers",
}));
vi.mock("@/lib/store/performance", () => ({
  useAppraisals: () => ({
    cycles: [
      { id: "q4", name: "Q4 Appraisal", stage: "DRAFT", stageLabel: "Draft" },
      { id: "h2", name: "H2 2026", stage: "SELF", stageLabel: "Self-review" },
    ],
    loading: false,
  }),
  useAppraiserMap: (cycleId: string | null) => {
    state.asked.push(cycleId);
    return {
      map: cycleId ? (state.maps[cycleId] ?? null) : null,
      loading: false,
      error: null,
      editable: true,
      refusal: "",
      reload: vi.fn(),
    };
  },
  useAppraiserMutations: () => ({
    editable: true,
    refusal: "",
    autoAssign: vi.fn(),
    setAppraisers: vi.fn(),
  }),
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({
    employees: [],
    people: [
      lookup("ada", "Ada Eze", "chidi", "fin"),
      lookup("chidi", "Chidi Obi", null, "fin"),
      lookup("fola", "Fola Ade", null, "fin"),
      lookup("musa", "Musa Bello", null, null),
    ],
  }),
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({
    flat: [{ id: "fin", name: "Finance", headId: "chidi" }],
  }),
  useHeadedDepartmentIds: () => new Set<string>(),
}));
vi.mock("@/lib/store/features", () => ({
  useFeatureSettings: () => ({ workInAnswers: false }),
}));

function lookup(
  id: string,
  fullName: string,
  managerId: string | null,
  departmentId: string | null,
) {
  return {
    id,
    fullName,
    jobTitle: "Analyst",
    department: departmentId ? "Finance" : null,
    departmentId,
    managerId,
  };
}

const appraiser = (id: string, name: string): ApiAppraiser =>
  ({
    assignmentId: `a-${id}`,
    appraiserId: id,
    appraiserName: name,
    role: "LINE_MANAGER",
    weightBp: 10_000,
  }) as ApiAppraiser;

const row = (
  id: string,
  name: string,
  over: Partial<ApiAppraiserMapRow> = {},
): ApiAppraiserMapRow =>
  ({
    employeeId: id,
    employeeName: name,
    jobTitle: "Analyst",
    departmentId: "fin",
    departmentName: "Finance",
    lineManagerId: null,
    lineManagerName: null,
    appraisers: [],
    totalWeightBp: 0,
    submittedWeightBp: 0,
    weightedRating: null,
    exceptions: [],
    ...over,
  }) as ApiAppraiserMapRow;

const map = (cycleId: string, rows: ApiAppraiserMapRow[]): ApiAppraiserMap =>
  ({
    cycleId,
    rows,
    counts: {
      people: rows.length,
      simple: 0,
      multiAppraiser: 0,
      unassigned: 0,
      blockers: 0,
      warnings: 0,
    },
  }) as unknown as ApiAppraiserMap;

/* The count is a number and a noun in two elements. */
const countLine = () =>
  screen.getByText(
    (_, element) =>
      element?.tagName === "P" &&
      /^\d+ (person|people)( match)?$/.test(element.textContent ?? ""),
  ).textContent;

const { AppraiserMapTab } =
  await import("@/app/(app)/performance/appraiser-map");

beforeEach(() => {
  state.search = "";
  state.asked = [];
  state.maps = {
    q4: map("q4", [
      row("ada", "Ada Eze", {
        lineManagerId: "chidi",
        lineManagerName: "Chidi Obi",
      }),
      row("musa", "Musa Bello", { departmentId: null, departmentName: null }),
    ]),
    h2: map("h2", [
      row("ada", "Ada Eze", {
        lineManagerId: "chidi",
        lineManagerName: "Chidi Obi",
        appraisers: [appraiser("chidi", "Chidi Obi")],
      }),
    ]),
  };
});

const show = () => {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <AppraiserMapTab />
    </ToastProvider>,
  );
  return user;
};

describe("the page", () => {
  it("has no number cards and no Fill in from the reporting line", () => {
    show();
    for (const card of [
      "People in the period",
      "One manager, 100%",
      "Nobody appraising",
    ]) {
      expect(screen.queryByText(card)).not.toBeInTheDocument();
    }
    expect(
      screen.queryByRole("button", {
        name: /fill in from the reporting line/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("opens on All appraisal periods, and asks for no period's map", () => {
    show();
    expect(
      screen.getByRole("combobox", { name: "Appraisal period" }),
    ).toHaveValue("");
    expect(
      screen.getByRole("option", { name: "All appraisal periods" }),
    ).toBeInTheDocument();
    expect(state.asked.every((id) => id === null)).toBe(true);
  });
});

describe("All appraisal periods", () => {
  it("shows the reporting line for everybody: the manager, else the department's head", () => {
    show();
    const rowOf = (name: string) =>
      screen.getByText(name).closest("tr") as HTMLElement;
    expect(
      within(rowOf("Ada Eze")).getByText("Chidi Obi, their line manager"),
    ).toBeInTheDocument();
    expect(
      within(rowOf("Fola Ade")).getByText(
        "Chidi Obi, head of their department (no manager recorded)",
      ),
    ).toBeInTheDocument();
    expect(
      within(rowOf("Musa Bello")).getByText("No appraiser"),
    ).toBeInTheDocument();
    expect(countLine()).toBe("4 people");
  });

  it("says who has no appraiser in a line, and narrows to them", async () => {
    const user = show();
    expect(
      screen.getByText(
        /2 people have no appraiser: Chidi Obi and Musa Bello\./,
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show only them" }));
    expect(screen.queryByText("Ada Eze")).not.toBeInTheDocument();
    expect(countLine()).toBe("2 people match");
  });
});

describe("one period chosen", () => {
  it("on one that has not started, shows the appraiser its start will give somebody", () => {
    state.search = "period=q4";
    show();
    const ada = screen.getByRole("combobox", { name: "Appraiser for Ada Eze" });
    expect(ada).toHaveDisplayValue("Chidi Obi");
    expect(screen.getByText("From the reporting line")).toBeInTheDocument();
    /* Ada will have her manager; only Musa has nobody. */
    expect(
      screen.getByText(/1 person has no appraiser: Musa Bello\./),
    ).toBeInTheDocument();
  });

  it("says there are no exceptions, with a figure, when everybody has their line manager", async () => {
    state.search = "period=h2";
    const user = show();
    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Show" }),
      "exceptions",
    );
    expect(
      screen.getByRole("heading", { name: "No exceptions" }),
    ).toBeInTheDocument();
  });
});
