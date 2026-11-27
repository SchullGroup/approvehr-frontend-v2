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

const enter = async (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click(screen.getByRole("button", { name: new RegExp(`^${name}`) }));

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

  it("opens on a card for each department, with no search or filter, and asks for no period's map", () => {
    show();
    expect(
      screen.getByRole("button", { name: /^Finance/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^No department/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Appraisal period" }),
    ).toBeNull();
    expect(screen.queryByPlaceholderText("Search people")).toBeNull();
    expect(state.asked.every((id) => id === null)).toBe(true);
  });
});

describe("All appraisal periods", () => {
  it("shows each department as the appraiser and the people under them", async () => {
    const user = show();
    await enter(user, "Finance");
    expect(
      screen.getByRole("combobox", { name: "Appraisal period" }),
    ).toHaveValue("");
    const rowOf = (name: string) =>
      screen.getByText(name).closest("tr") as HTMLElement;
    expect(
      within(rowOf("Ada Eze")).getByText("Line manager"),
    ).toBeInTheDocument();
    expect(
      within(rowOf("Fola Ade")).getByText("Head of department"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Chidi Obi").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Appraises \d+ (person|people)/).length,
    ).toBeGreaterThan(0);
  });

  it("says it calmly, once, with one fix, and no filter chip or error", () => {
    show();
    expect(
      screen.getByText(
        "2 people have no manager or department head, so HR appraises them.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Set a department head" }),
    ).toHaveAttribute("href", "/people/departments");
    expect(
      screen.queryByRole("button", { name: "Show only them" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/have no appraiser/)).not.toBeInTheDocument();
  });

  it("puts the way back on the left, above the department", async () => {
    const user = show();
    await enter(user, "Finance");
    await user.click(screen.getByRole("button", { name: /All departments/ }));
    expect(
      screen.getByRole("button", { name: /^Finance/ }),
    ).toBeInTheDocument();
  });
});

describe("one period chosen", () => {
  it("on one that has not started, shows the appraiser its start will give somebody", async () => {
    state.search = "period=q4";
    const user = show();
    await enter(user, "Finance");
    const ada = screen.getByRole("combobox", { name: "Appraiser for Ada Eze" });
    expect(ada).toHaveDisplayValue("Chidi Obi");
    expect(screen.getByText("From the reporting line")).toBeInTheDocument();
    /* Ada will have her manager; Musa has nobody above him, so HR. */
    expect(
      screen.getByText(
        "1 person has no manager or department head, so HR appraises them.",
      ),
    ).toBeInTheDocument();
  });
});

describe("one period chosen: the table (F19)", () => {
  it("does not list the default twice: it shows as the choice and is not an option to pick", async () => {
    state.search = "period=q4";
    const user = show();
    await enter(user, "Finance");
    const ada = screen.getByRole("combobox", { name: "Appraiser for Ada Eze" });
    /* A hidden node has no accessible name, so it is found by what it is. */
    const placeholder = ada.querySelector<HTMLOptionElement>("option[hidden]");
    expect(placeholder).not.toBeNull();
    expect(placeholder).toHaveTextContent("Chidi Obi");
    expect(placeholder).toBeDisabled();
    expect(ada).toHaveDisplayValue("Chidi Obi");
  });

  it("has no Rating column on a period that has not started", async () => {
    state.search = "period=q4";
    const user = show();
    await enter(user, "Finance");
    expect(
      screen.queryByRole("columnheader", { name: "Rating" }),
    ).not.toBeInTheDocument();
  });

  it("has one once it has", async () => {
    state.search = "period=h2";
    const user = show();
    await enter(user, "Finance");
    expect(
      screen.getByRole("columnheader", { name: "Rating" }),
    ).toBeInTheDocument();
  });

  it("says which period the table is for, and what the standing view is", async () => {
    state.search = "period=q4";
    const first = show();
    await enter(first, "Finance");
    expect(screen.getByText("Appraisers in Q4 Appraisal")).toBeInTheDocument();
  });

  it("says it is the standing view when no period is chosen", async () => {
    const user = show();
    await enter(user, "Finance");
    expect(
      screen.getByText("Who appraises them unless a period says otherwise"),
    ).toBeInTheDocument();
  });

  it("lets the period select be as wide as the longest name", async () => {
    const user = show();
    await enter(user, "Finance");
    const field = screen
      .getByRole("combobox", { name: "Appraisal period" })
      .closest("div[class*='min-w-64']");
    expect(field).not.toBeNull();
    expect(field?.className).toMatch(/w-auto/);
  });
});
