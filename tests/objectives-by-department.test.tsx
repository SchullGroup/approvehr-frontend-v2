import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiGoal } from "@/lib/api/performance";
import {
  COMPANY_KEY,
  NO_DEPARTMENT_KEY,
  departmentCards,
  departmentKeyOf,
  goalsForDepartment,
} from "@/lib/performance/objectives-by-department";

/**
 * "Whole company" opens on one card per department (owner request, 24 Nov).
 *
 * It listed every objective up front. Now each department is a card with how
 * many objectives it has; a card opens that department's objectives, grouped
 * under the company objective, with "All departments" to go back and the
 * department in the address. A search on the cards shows matches across all
 * departments. "My objectives" and "My team" are unchanged.
 */

const goal = (over: Partial<ApiGoal> & { id: string }): ApiGoal =>
  ({
    title: over.id,
    description: null,
    ownerId: null,
    ownerName: null,
    departmentId: null,
    departmentName: null,
    level: "personal",
    companyWide: false,
    parentId: null,
    parentTitle: null,
    status: "ON_TRACK",
    progress: 0,
    measuredProgress: null,
    keyResults: [],
    approval: "AGREED",
    approvalLabel: "Agreed",
    reviewCycleId: null,
    reviewCycleName: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...over,
  }) as ApiGoal;

const GOALS: ApiGoal[] = [
  goal({
    id: "grow",
    title: "Grow revenue",
    level: "company",
    companyWide: true,
  }),
  goal({
    id: "fin-close",
    title: "Close the books in five days",
    level: "department",
    departmentId: "fin",
    departmentName: "Finance",
    parentId: "grow",
    parentTitle: "Grow revenue",
  }),
  goal({
    id: "ada-recon",
    title: "Reconcile the bank daily",
    ownerId: "ada",
    ownerName: "Ada Eze",
    parentId: "fin-close",
    parentTitle: "Close the books in five days",
    status: "AT_RISK",
  }),
  goal({
    id: "tunde-calls",
    title: "Call twenty customers",
    ownerId: "tunde",
    status: "OFF_TRACK",
  }),
  goal({ id: "nobody-dept", title: "Tidy the shared drive", ownerId: "musa" }),
  goal({ id: "gone", title: "An old one", ownerId: "left-the-company" }),
];

const OWNERS = new Map<string, string | null>([
  ["ada", "fin"],
  ["tunde", "sales"],
  ["musa", null],
]);

const DEPARTMENTS = [
  { id: "sales", name: "Sales" },
  { id: "fin", name: "Finance" },
  { id: "eng", name: "Engineering" },
];

describe("which card an objective is on", () => {
  it("puts a company objective on its own card, a department's on its department, and a personal one on its owner's", () => {
    const of = (id: string) =>
      departmentKeyOf(
        GOALS.find((g) => g.id === id)!,
        OWNERS,
      );
    expect(of("grow")).toBe(COMPANY_KEY);
    expect(of("fin-close")).toBe("fin");
    expect(of("ada-recon")).toBe("fin");
    expect(of("tunde-calls")).toBe("sales");
  });

  it("puts one with no department, or an owner the staff list does not have, under No department", () => {
    expect(
      departmentKeyOf(
        GOALS.find((g) => g.id === "nobody-dept")!,
        OWNERS,
      ),
    ).toBe(NO_DEPARTMENT_KEY);
    expect(
      departmentKeyOf(
        GOALS.find((g) => g.id === "gone")!,
        OWNERS,
      ),
    ).toBe(NO_DEPARTMENT_KEY);
  });
});

describe("the cards", () => {
  const cards = departmentCards(GOALS, DEPARTMENTS, OWNERS);

  it("are the company's first, then every department by name, then No department", () => {
    expect(cards.map((c) => c.name)).toEqual([
      "Whole company",
      "Engineering",
      "Finance",
      "Sales",
      "No department",
    ]);
  });

  it("count each objective once, and how many are behind", () => {
    const by = Object.fromEntries(
      cards.map((c) => [c.name, [c.count, c.attention]]),
    );
    expect(by["Finance"]).toEqual([2, 1]);
    expect(by["Sales"]).toEqual([1, 1]);
    expect(by["Engineering"]).toEqual([0, 0]);
    expect(by["No department"]).toEqual([2, 0]);
    expect(cards.reduce((sum, c) => sum + c.count, 0)).toBe(GOALS.length);
  });

  it("have no No department card when nothing is on it", () => {
    const tidy = departmentCards(
      GOALS.filter((g) => g.id !== "nobody-dept" && g.id !== "gone"),
      DEPARTMENTS,
      OWNERS,
    );
    expect(tidy.map((c) => c.name)).not.toContain("No department");
  });
});

describe("one department's list", () => {
  it("is its objectives with the ones they sit under, so it groups under the company objective", () => {
    expect(goalsForDepartment(GOALS, "fin", OWNERS).map((g) => g.id)).toEqual([
      "grow",
      "fin-close",
      "ada-recon",
    ]);
  });

  it("is the company's own for the company card", () => {
    expect(
      goalsForDepartment(GOALS, COMPANY_KEY, OWNERS).map((g) => g.id),
    ).toEqual(["grow"]);
  });
});

/* ------------------------------------------------------------- the screen */

const state = vi.hoisted(() => ({ goals: [] as unknown[] }));

let reads = true;
vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  useCan: () => reads,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/performance/kpis",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/store/employees-api", async (original) => ({
  ...(await original<typeof import("@/lib/store/employees-api")>()),
  useEmployeeDirectory: () => ({
    employees: [],
    people: [
      {
        id: "ada",
        fullName: "Ada Eze",
        jobTitle: "Accountant",
        department: "Finance",
        departmentId: "fin",
      },
      {
        id: "tunde",
        fullName: "Tunde Bakare",
        jobTitle: "Sales",
        department: "Sales",
        departmentId: "sales",
      },
      {
        id: "musa",
        fullName: "Musa Ibrahim",
        jobTitle: "Clerk",
        department: null,
        departmentId: null,
      },
    ],
    loading: false,
    error: null,
    archivedIds: new Set(),
  }),
}));
vi.mock("@/lib/store/departments", async (original) => ({
  ...(await original<typeof import("@/lib/store/departments")>()),
  useDepartments: () => ({
    tree: [],
    flat: DEPARTMENTS.map((d) => ({ ...d, archived: false })),
    loading: false,
    error: null,
  }),
}));
vi.mock("@/lib/store/performance", async (original) => {
  const real = await original<typeof import("@/lib/store/performance")>();
  return {
    ...real,
    useKpis: () => ({
      goals: state.goals,
      cascade: real.toCascade(state.goals as ApiGoal[]),
      loading: false,
      error: null,
      source: "api",
      reload: vi.fn(),
    }),
  };
});

const { KpisTab } = await import("@/app/(app)/performance/kpis");
const { ToastProvider } = await import("@/components/ui");

const href = (key: string | null) =>
  key === null
    ? "/performance/kpis?scope=company"
    : `/performance/kpis?scope=company&department=${key}`;

const mount = (
  props: {
    scope?: "mine" | "team" | "company";
    department?: string | null;
  } = {},
) =>
  render(
    <ToastProvider>
      <KpisTab
        scope={props.scope ?? "company"}
        department={props.department ?? null}
        departmentHref={href}
      />
    </ToastProvider>,
  );

beforeEach(() => {
  state.goals = GOALS;
});

describe("Whole company", () => {
  it("opens on a card per department, each a link that says how many objectives it has, and lists no objective", () => {
    mount();
    const finance = screen.getByRole("link", { name: /Finance/ });
    expect(finance).toHaveAttribute(
      "href",
      "/performance/kpis?scope=company&department=fin",
    );
    expect(within(finance).getByText("2 objectives")).toBeInTheDocument();
    expect(within(finance).queryByText(/need.* attention/)).toBeNull();
    expect(
      within(screen.getByRole("link", { name: /Engineering/ })).getByText(
        "No objectives yet",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Whole company/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /No department/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Reconcile the bank daily")).toBeNull();
  });

  it("has no number tiles, no waiting-to-be-agreed line, no header sentence and no order dropdown", () => {
    state.goals = [
      ...GOALS,
      goal({
        id: "w",
        ownerId: "ada",
        approval: "AWAITING_APPROVAL",
        approvalLabel: "Waiting",
      }),
    ];
    mount();
    expect(
      screen.queryByText("Objectives being tracked"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Average progress")).not.toBeInTheDocument();
    expect(screen.queryByText(/waiting to be agreed/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /see what is waiting/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /order|grouped/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Search objectives by title or detail"),
    ).not.toBeInTheDocument();
  });

  it("opens a department in two sections: its own objectives, then Team members, with the way back", () => {
    mount({ department: "fin" });
    expect(
      screen.getByRole("heading", { name: "Finance" }),
    ).toBeInTheDocument();
    const own = screen.getByRole("heading", { name: "Department objectives" });
    const team = screen.getByRole("heading", { name: "Team members" });
    expect(
      own.compareDocumentPosition(team) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      within(own.closest("section") as HTMLElement).getByText(
        "Close the books in five days",
      ),
    ).toBeInTheDocument();
    expect(
      within(team.closest("section") as HTMLElement).getByText(
        "Reconcile the bank daily",
      ),
    ).toBeInTheDocument();
    /* Not the company objective above it, nor another department's. */
    expect(screen.queryByText("Grow revenue")).toBeNull();
    expect(screen.queryByText("Call twenty customers")).toBeNull();
    expect(
      screen.getByRole("link", { name: /All departments/ }),
    ).toHaveAttribute("href", "/performance/kpis?scope=company");
  });

  it("leaves out the department section when it has none, and Team members leads", () => {
    state.goals = GOALS.filter((g) => g.id !== "fin-close");
    mount({ department: "fin" });
    expect(
      screen.queryByRole("heading", { name: "Department objectives" }),
    ).toBeNull();
    expect(screen.getByRole("heading", { name: "Team members" })).toBeVisible();
  });

  it("makes every department card the same size, led by a coloured tile with its initial", () => {
    mount();
    const grid = screen
      .getByRole("link", { name: /Finance/ })
      .closest("ul") as HTMLElement;
    expect(grid.className).toMatch(/auto-rows-fr/);
    for (const link of within(grid).getAllByRole("link")) {
      expect(link.className).toMatch(/\bh-full\b/);
      expect(link.className).toMatch(/min-h-44/);
    }
    const finance = within(grid).getByRole("link", { name: /Finance/ });
    expect(finance.querySelector("span[aria-hidden]")?.textContent).toBe("F");
  });

  it("shows a department's own objectives as cards at the normal size, and its members' in a table", () => {
    mount({ department: "fin" });
    const own = screen.getByText("Close the books in five days");
    expect(own.className).toMatch(/text-body-sm/);
    expect(own.className).not.toMatch(/text-h4/);
    const member = screen.getByText("Reconcile the bank daily");
    expect(member.closest("table")).not.toBeNull();
    expect(own.closest("table")).toBeNull();
  });

  it("puts the way back on the left, above the department's name", () => {
    mount({ department: "fin" });
    const back = screen.getByRole("link", { name: /All departments/ });
    const name = screen.getByRole("heading", { name: "Finance" });
    expect(
      back.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(back.closest("div")?.className).not.toMatch(/justify-between/);
  });

  it("always has Whole company first, even with nothing on it", () => {
    const none = departmentCards(
      GOALS.filter((g) => g.level !== "company"),
      DEPARTMENTS,
      OWNERS,
    );
    expect(none[0]).toMatchObject({ name: "Whole company", count: 0 });
  });

  it("has no search or filter on the department cards, and has them again inside a department", () => {
    mount();
    expect(
      screen.queryByLabelText("Search objectives by title or detail"),
    ).toBeNull();
    expect(screen.getByRole("link", { name: /Finance/ })).toBeInTheDocument();
  });
});

describe("My objectives and My team", () => {
  it("are the list, as before", () => {
    mount({ scope: "mine" });
    expect(screen.queryByRole("link", { name: /Finance/ })).toBeNull();
    expect(screen.getByText("Reconcile the bank daily")).toBeInTheDocument();
  });
});

describe("who sees which departments", () => {
  it("shows somebody who cannot read across the company the whole company and their own department only", () => {
    reads = false;
    try {
      mount();
      expect(
        screen.getByRole("link", { name: /Whole company/ }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Finance/ })).toBeNull();
      expect(screen.queryByRole("link", { name: /Engineering/ })).toBeNull();
    } finally {
      reads = true;
    }
  });
});
