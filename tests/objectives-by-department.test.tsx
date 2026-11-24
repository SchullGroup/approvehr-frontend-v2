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
      "Company objectives",
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
        scopes={["mine", "team", "company"]}
        onScopeChange={vi.fn()}
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
    expect(within(finance).getByText("1 needs attention")).toBeInTheDocument();
    expect(
      within(screen.getByRole("link", { name: /Engineering/ })).getByText(
        "No objectives yet",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Company objectives/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /No department/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Reconcile the bank daily")).toBeNull();
  });

  /* The four figures stay; the "waiting to be agreed" line went (owner, 24
     Nov 2026: "we shouldn't have this again"). The To agree tab carries the
     count, so this fails if the line or its link comes back. */
  it("keeps the four figures, and no waiting-to-be-agreed line, above the cards", () => {
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
    expect(screen.getByText("Objectives being tracked")).toBeInTheDocument();
    expect(screen.getByText("Average progress")).toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("Targets met")).toBeInTheDocument();
    expect(screen.queryByText(/waiting to be agreed/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /see what is waiting/i }),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('a[href="/performance/approvals"]'),
    ).toBeNull();
  });

  it("draws no header sentence and no order dropdown over the department cards", () => {
    mount();
    expect(
      screen.getByRole("heading", { name: "By department" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Open a department to see its objectives/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Order the list" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Search objectives by title or detail"),
    ).toBeInTheDocument();
  });

  it("still offers the order inside an opened department", () => {
    mount({ department: "fin" });
    expect(
      screen.getByRole("combobox", { name: "Order the list" }),
    ).toBeInTheDocument();
  });

  it("opens one department's objectives under the company objective, with the way back", () => {
    mount({ department: "fin" });
    expect(
      screen.getByRole("heading", { name: "Finance" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Reconcile the bank daily")).toBeInTheDocument();
    expect(
      screen.getByText("Close the books in five days"),
    ).toBeInTheDocument();
    expect(screen.getByText("Grow revenue")).toBeInTheDocument();
    expect(screen.queryByText("Call twenty customers")).toBeNull();
    expect(
      screen.getByRole("link", { name: /All departments/ }),
    ).toHaveAttribute("href", "/performance/kpis?scope=company");
  });

  it("shows matching objectives across departments, not cards, while something is searched", async () => {
    const user = userEvent.setup();
    mount();
    await user.type(
      screen.getByLabelText("Search objectives by title or detail"),
      "call",
    );
    expect(screen.getByText("Call twenty customers")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Finance/ })).toBeNull();
  });
});

describe("My objectives and My team", () => {
  it("are the list, as before", () => {
    mount({ scope: "mine" });
    expect(screen.queryByRole("link", { name: /Finance/ })).toBeNull();
    expect(screen.getByText("Reconcile the bank daily")).toBeInTheDocument();
  });
});
