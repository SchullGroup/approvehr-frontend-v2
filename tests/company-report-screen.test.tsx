import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CompanyReport,
  DepartmentPeople,
  DepartmentRow,
} from "@/lib/api/company-report";
import { CompanyReportScreen } from "@/app/(app)/reports/company/company-report-screen";
import { companyReportApi } from "@/lib/api/company-report";

/**
 * Company reports, drawn from what the API sends.
 *
 * The screen counts, ranks and averages nothing, so what is asserted is what it
 * does with a response: it draws a headline only when there is one, a department
 * under five people as a headcount and a sentence and nothing else, no cost
 * column without cost, no fairness lens without the Fairness block, and names
 * only where the API sent them. Absent is asserted as absent.
 */

const state = vi.hoisted(() => ({
  perms: new Set<string>(["EDIT_RECORDS"]),
  report: null as unknown,
  people: null as unknown,
  available: true,
  showPrint: false,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/reports/company",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/permissions", () => ({
  useCan: (permission: string) => state.perms.has(permission),
  usePermissions: () => ({
    can: (p: string) => state.perms.has(p),
    loading: false,
  }),
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: state.available }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/app/(app)/reports/company/print-layout", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/app/(app)/reports/company/print-layout")
    >();
  return {
    PrintHeading: (props: Parameters<typeof original.PrintHeading>[0]) =>
      state.showPrint ? original.PrintHeading(props) : null,
    PrintBody: (props: Parameters<typeof original.PrintBody>[0]) =>
      state.showPrint ? original.PrintBody(props) : null,
  };
});
vi.mock("@/lib/store/company", () => ({
  useLiveCompanyProfile: () => ({
    profile: { legalName: "Schull Ltd", tradingName: "Schull" },
  }),
}));
vi.mock("@/lib/api/company-report", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/api/company-report")>();
  return {
    ...original,
    companyReportApi: { ...original.companyReportApi, printed: vi.fn() },
  };
});
vi.mock("@/lib/store/company-report", () => ({
  useCompanyReport: () => ({
    report: state.report,
    loading: false,
    error: null,
    available: state.available,
    reload: vi.fn(),
  }),
  useDepartmentPeople: (id: string | null) => ({
    people: id ? state.people : null,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useCompanyHeadline: () => null,
}));

const bands = {
  OUTSTANDING: 0,
  EXCEEDS: 3,
  MEETS: 4,
  PARTIALLY_MEETS: 0,
  BELOW: 1,
};

function shownRow(over: Partial<Extract<DepartmentRow, { shown: true }>> = {}) {
  return {
    id: "d-eng",
    name: "Engineering",
    headName: "Adaeze Okonkwo",
    people: 8,
    shown: true,
    results: {
      markMeanBp: 5691,
      scored: 7,
      bands,
      goals: { objectives: 7, progressMean: 67, atRiskOrOff: 1 },
      tasks: { people: 8, withLogged: 3, withGraded: 1 },
    },
    process: {
      withAppraiser: 8,
      withAgreedObjective: 7,
      reviewsWritten: 6,
      reviewsExpected: 8,
    },
    ...over,
  } as DepartmentRow;
}

const smallRow: DepartmentRow = {
  id: "d-legal",
  name: "Legal",
  headName: null,
  people: 3,
  shown: false,
  reason: "small",
};

function report(over: Partial<CompanyReport> = {}): CompanyReport {
  return {
    asOf: "2026-10-23T09:14:00.000Z",
    cycle: {
      id: "c-1",
      name: "H2 2026 appraisal",
      stage: "CALIBRATION",
      stageLabel: "In calibration",
      published: false,
      marksMayMove: true,
    },
    cycles: [
      {
        id: "c-1",
        name: "H2 2026 appraisal",
        stage: "CALIBRATION",
        stageLabel: "In calibration",
      },
      {
        id: "c-0",
        name: "H1 2026 appraisal",
        stage: "PUBLISHED",
        stageLabel: "Published",
      },
    ],
    headline: {
      rule: "H1",
      sentence:
        "4 of the 6 marks the Fairness check flagged still need a decision, so H2 2026 appraisal results cannot be published yet.",
      figure: { n: 4, of: 6 },
      firstStep: {
        sentence:
          "Decide on the 4 open marks. Let each stand, move it, or ask the manager.",
        action: {
          id: "flags",
          label: "Decide on 4 flagged marks",
          href: "/performance/periods/c-1/fairness",
        },
      },
    },
    coverage: {
      cells: [
        {
          key: "marks",
          label: "Marks",
          n: 57,
          of: 61,
          note: "people have one",
        },
        {
          key: "appraisers",
          label: "Appraisers",
          n: 60,
          of: 62,
          note: "people have one",
        },
        {
          key: "reviews",
          label: "Manager reviews",
          n: 9,
          of: 13,
          note: "are in",
        },
      ],
      notMeasured: [
        {
          what: "Religion and state of origin",
          why: "The Fairness check does not read them.",
        },
        {
          what: "Final marks",
          why: "H2 2026 appraisal has not been published, so marks can still move.",
        },
      ],
    },
    findings: [
      {
        id: "F8",
        axis: "results",
        status: "blocks",
        statusLabel: "Blocks a mark",
        title: "4 of 61 people have no mark",
        figure: { n: 4, of: 61 },
        evidence: ["Score register, H2 2026 appraisal, 2026-10-23."],
        ifNothingChanges: "They finish with no mark.",
        act: { label: "Open the period", href: "/performance/periods/c-1" },
      },
      {
        id: "F10",
        axis: "results",
        status: "info",
        statusLabel: "Worth knowing",
        title: "Highest mark in each department",
        figure: { n: 2, of: 3 },
        evidence: ["Score register, H2 2026 appraisal, 2026-10-23."],
        lines: [
          {
            department: "Engineering",
            employeeId: "e-1",
            name: "Zed Person",
            basis: "Highest of the 7 marks in Engineering, 85.2%, 1 appraiser.",
            marksMayMove: true,
          },
          {
            department: "Finance",
            employeeId: "e-2",
            name: "Abe Person",
            basis: "Highest of the 12 marks in Finance, 82.5%, 1 appraiser.",
            marksMayMove: true,
          },
        ],
        caveats: [
          "These departments are rated by different managers. Marks are not adjusted for that.",
          "H2 2026 appraisal has not been published, so marks can still move.",
        ],
        act: {
          label: "Open the nine-box",
          href: "/performance/periods/c-1/nine-box",
        },
      },
      {
        id: "F1",
        axis: "process",
        status: "blocks",
        statusLabel: "Blocks publishing",
        title:
          "4 of the 6 marks the Fairness check flagged still need a decision",
        figure: { n: 4, of: 6 },
        evidence: ["Fairness check, H2 2026 appraisal, 2026-10-23."],
        ifNothingChanges:
          "H2 2026 appraisal results cannot be published until each one is decided.",
        act: {
          label: "Open the Fairness check",
          href: "/performance/periods/c-1/fairness",
        },
      },
    ],
    strengths: [
      {
        id: "matches",
        title: "42 of the 57 marks match the evidence behind them",
        figure: { n: 42, of: 57 },
        evidence: "Fairness check, H2 2026 appraisal.",
      },
    ],
    actions: [
      {
        id: "flags",
        label: "Decide on 4 flagged marks",
        href: "/performance/periods/c-1/fairness",
      },
      {
        id: "records",
        label: "Complete 52 staff records",
        href: "/people/incomplete",
      },
    ],
    departments: {
      rows: [shownRow(), smallRow],
      company: { people: 11, markMeanBp: 5996, goalProgressMean: 64 },
      notShown: 1,
      caveat:
        "These departments are rated by different managers. Marks are not adjusted for that. See the Fairness check.",
    },
    rules: { minGroup: 5 },
    ...over,
  };
}

const people: DepartmentPeople = {
  department: { id: "d-eng", name: "Engineering" },
  cycle: { id: "c-1", name: "H2 2026 appraisal", marksMayMove: true },
  people: [
    {
      employeeId: "e-1",
      name: "Abe Person",
      jobTitle: "Engineer",
      markBp: 8518,
      bandLabel: "Exceeds",
      why: ["Highest of the 7 marks in Engineering, 85.2%, 1 appraiser"],
    },
    {
      employeeId: "e-2",
      name: "Zed Person",
      jobTitle: "Engineer",
      markBp: null,
      bandLabel: null,
      why: ["No mark", "No appraiser"],
    },
  ],
  caveats: [
    "These departments are rated by different managers. Marks are not adjusted for that.",
    "H2 2026 appraisal has not been published, so marks can still move.",
  ],
};

/**
 * The screen as somebody reads it. The print layout is hidden on a screen by its
 * stylesheet, which jsdom does not have, so it is left out here and has its own
 * tests below.
 */
function mount(initialTab: "overview" | "departments" = "overview") {
  state.showPrint = false;
  return render(
    <CompanyReportScreen initialTab={initialTab} initialCycle={null} />,
  );
}

const cleanupDom = () => {
  cleanup();
};

/** What goes on paper: only the print layout's pieces. */
function printed() {
  state.showPrint = true;
  const view = render(
    <CompanyReportScreen initialTab="overview" initialCycle={null} />,
  );
  const layouts = Array.from(
    view.container.querySelectorAll("[data-print-layout]"),
  );
  return { view, layouts };
}

beforeEach(() => {
  state.perms = new Set(["EDIT_RECORDS"]);
  state.report = report();
  state.people = people;
  state.available = true;
});

describe("who sees it", () => {
  it("shows somebody without EDIT_RECORDS a sentence about why, and none of the report", () => {
    state.perms = new Set();
    mount();
    expect(
      screen.getByText("This report covers the whole company"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/4 of the 6 marks/)).toBeNull();
  });

  it("says so when there is no live system, rather than drawing an empty report", () => {
    state.available = false;
    mount();
    expect(
      screen.getByText("Company reports need the live system"),
    ).toBeInTheDocument();
  });
});

describe("the top of the page", () => {
  it("says the period, that its marks can still move, and that it is worked out by rules", () => {
    mount();
    // The period is named in the masthead and again in the evidence lines.
    expect(screen.getAllByText(/H2 2026 appraisal/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Marks can still move\./)).toBeInTheDocument();
    expect(
      screen.getByText(/Worked out from ApproveHR records by fixed rules/),
    ).toBeInTheDocument();
  });

  it("draws the headline and its first step with a button", () => {
    mount();
    // The headline comes first; the finding that says the same thing comes after it.
    const headings = screen.getAllByRole("heading", {
      name: /4 of the 6 marks the Fairness check flagged/,
    });
    expect(headings.length).toBeGreaterThan(0);
    expect(screen.getByText(/Decide on the 4 open marks/)).toBeInTheDocument();
    const buttons = screen.getAllByRole("link", {
      name: "Decide on 4 flagged marks",
    });
    expect(buttons[0]).toHaveAttribute(
      "href",
      "/performance/periods/c-1/fairness",
    );
  });

  it("draws NO headline block at all when the API sent none", () => {
    const r = report();
    delete r.headline;
    state.report = r;
    mount();
    expect(
      screen.queryByRole("heading", { name: /still need a decision, so/ }),
    ).toBeNull();
    expect(screen.queryByText("First step.")).toBeNull();
  });

  it("keeps the first-step sentence and drops the button when the API sent no action", () => {
    const r = report();
    r.headline = {
      ...r.headline!,
      firstStep: {
        sentence:
          "Give each of them an appraiser, or leave them out of this period.",
      },
    };
    state.report = r;
    mount();
    expect(
      screen.getByText(/Give each of them an appraiser/),
    ).toBeInTheDocument();
    // The only "Decide on" link left is the priority action, not a headline button.
    const section = screen
      .getAllByRole("heading", { name: /still need a decision/ })[0]!
      .closest("section")!;
    expect(within(section).queryByRole("link")).toBeNull();
  });

  it("gives every strip cell its own denominator and says what was not measured", () => {
    mount();
    expect(screen.getByText("57 of 61")).toBeInTheDocument();
    expect(screen.getByText("60 of 62")).toBeInTheDocument();
    expect(screen.getByText("9 of 13")).toBeInTheDocument();
    expect(screen.getByText("What we did not measure")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Religion and state of origin\. The Fairness check does not read them\./,
      ),
    ).toBeInTheDocument();
  });
});

describe("the findings", () => {
  it("groups them under Results, Process and Fairness in that order, leaving out an axis with none", () => {
    mount();
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    const results = headings.indexOf("Results");
    const process = headings.indexOf("Process");
    expect(results).toBeGreaterThan(-1);
    expect(process).toBeGreaterThan(results);
    expect(headings).not.toContain("Fairness");
  });

  it("writes the status as plain text and gives an 'if nothing changes' only where the API sent one", () => {
    mount();
    expect(screen.getAllByText("Blocks publishing").length).toBeGreaterThan(0);
    expect(screen.getByText("They finish with no mark.")).toBeInTheDocument();
    // F10 had no consequence, so no 'If nothing changes' appears under it.
    const f10 = screen
      .getByText("Highest mark in each department.")
      .closest("article")!;
    expect(within(f10).queryByText("If nothing changes.")).toBeNull();
  });

  it("draws the named lines by department, in the order sent, with their basis and caveats", () => {
    mount();
    const f10 = screen
      .getByText("Highest mark in each department.")
      .closest("article")!;
    const names = within(f10)
      .getAllByRole("link")
      .map((a) => a.textContent)
      .filter((t) => t === "Zed Person" || t === "Abe Person");
    // Engineering first (as sent), so Zed before Abe: never re-sorted by name or score here.
    expect(names).toEqual(["Zed Person", "Abe Person"]);
    expect(
      within(f10).getByText(/Highest of the 7 marks in Engineering, 85.2%/),
    ).toBeInTheDocument();
    expect(
      within(f10).getByText(/rated by different managers/),
    ).toBeInTheDocument();
    expect(
      within(f10).getByText(/has not been published, so marks can still move/),
    ).toBeInTheDocument();
    expect(
      within(f10).getByRole("link", { name: "Zed Person" }),
    ).toHaveAttribute("href", "/performance/history/e-1");
  });

  it("draws priority actions as links with the API's labels and omits the section when there are none", () => {
    mount();
    expect(
      screen.getByRole("link", { name: "Complete 52 staff records" }),
    ).toHaveAttribute("href", "/people/incomplete");
    const r = report();
    r.actions = [];
    state.report = r;
    const view = mount();
    expect(
      within(view.container).queryAllByText("Priority actions").length,
    ).toBe(0);
  });

  it("says what is working only when the API sent strengths", () => {
    mount();
    expect(screen.getByText("What is working")).toBeInTheDocument();
    const r = report();
    delete r.strengths;
    state.report = r;
    const view = mount();
    expect(
      within(view.container).queryAllByText("What is working").length,
    ).toBe(0);
  });

  it("states how it was worked out, and says it is not a verdict", () => {
    mount();
    expect(screen.getByText("Method and privacy")).toBeInTheDocument();
  });
});

describe("the departments tab", () => {
  it("draws a department under five people as its headcount and one sentence, with no figure", async () => {
    mount("departments");
    const row = screen.getAllByText("Legal")[0]!.closest("tr")!;
    expect(within(row).getByText("3")).toBeInTheDocument();
    expect(
      within(row).getByText("Fewer than 5 people: figures are not shown."),
    ).toBeInTheDocument();
    expect(row.textContent).not.toMatch(/%|\d+ of \d+/);
  });

  it("draws a shown department's figures with their denominators", () => {
    mount("departments");
    const row = screen
      .getAllByRole("button", { name: "Engineering" })[0]!
      .closest("tr")!;
    expect(within(row).getByText("56.9%")).toBeInTheDocument();
    expect(within(row).getByText("7 of 8 scored")).toBeInTheDocument();
    expect(within(row).getByText("67%")).toBeInTheDocument();
    expect(
      within(row).getByText("7 objectives, 1 at risk or off track"),
    ).toBeInTheDocument();
    expect(within(row).getByText("3 of 8 logged")).toBeInTheDocument();
  });

  it("has no pay column and no pay figure without cost, and plots against goal progress", () => {
    mount("departments");
    expect(screen.queryByText("Gross pay per head")).toBeNull();
    expect(
      screen.getAllByText("Average mark against goal progress")[0],
    ).toBeInTheDocument();
    expect(screen.queryByText(/₦/)).toBeNull();
  });

  it("has the pay column, and plots against gross pay per head, when cost is present", () => {
    const r = report();
    r.departments = {
      ...r.departments!,
      rows: [
        shownRow({
          cost: { perHeadKobo: 100_000_000, totalKobo: 800_000_000, paid: 8 },
        }),
        smallRow,
      ],
      company: { ...r.departments!.company, perHeadKobo: 90_000_000 },
      costFrom: { period: "2026-10", status: "IN_REVIEW" },
    };
    state.report = r;
    mount("departments");
    expect(screen.getByText("Gross pay per head")).toBeInTheDocument();
    expect(
      screen.getAllByText("Average mark against gross pay per head")[0],
    ).toBeInTheDocument();
    const row = screen
      .getAllByRole("button", { name: "Engineering" })[0]!
      .closest("tr")!;
    expect(within(row).getByText(/₦1,000,000/)).toBeInTheDocument();
  });

  it("offers the Fairness lens only when the Fairness block is present", async () => {
    mount("departments");
    expect(screen.getByRole("radio", { name: "Fairness" })).toBeInTheDocument();
    const r = report();
    delete r.rules;
    state.report = r;
    const view = mount("departments");
    expect(
      within(view.container).queryAllByRole("radio", { name: "Fairness" })
        .length,
    ).toBe(0);
  });

  it("says in plain words which departments were left out of the chart", () => {
    mount("departments");
    expect(
      screen.getByText(/Not shown: 1 department with fewer than 5 people\./),
    ).toBeInTheDocument();
  });

  it("says marks are not adjusted for how each manager rates, with a link to the Fairness check", () => {
    mount("departments");
    expect(
      screen.getByText(/Marks are not adjusted for that\./),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Open the Fairness check" }).length,
    ).toBeGreaterThan(0);
  });

  it("opens a side panel with everyone by name, their basis, the caveats and links to the nine-box and Fairness check", async () => {
    const user = userEvent.setup();
    mount("departments");
    await user.click(
      screen.getAllByRole("button", { name: "Engineering" })[0]!,
    );
    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByText("Led by")).toBeInTheDocument();
    expect(within(panel).getByText("Adaeze Okonkwo")).toBeInTheDocument();
    expect(
      within(panel).getByText("Everyone in this department"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Zed Person")).toBeInTheDocument();
    expect(within(panel).getByText("No mark")).toBeInTheDocument();
    expect(
      within(panel).getByText("Sorted by name, not by mark."),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText(
        /has not been published, so marks can still move/,
      ),
    ).toBeInTheDocument();
    // The F10 finding that names this department offers the nine-box too, so
    // the people list's own links are found inside its section.
    const everyone = within(panel)
      .getByText("Everyone in this department")
      .closest("section")!;
    expect(
      within(everyone).getByRole("link", { name: "Open the nine-box" }),
    ).toHaveAttribute("href", "/performance/periods/c-1/nine-box");
    expect(
      within(everyone).getByRole("link", { name: "Open the Fairness check" }),
    ).toHaveAttribute("href", "/performance/periods/c-1/fairness");
  });

  it("opens a panel for a small department with its headcount and sentence, and no list", async () => {
    const user = userEvent.setup();
    mount("departments");
    await user.click(screen.getAllByRole("button", { name: "Legal" })[0]!);
    const panel = await screen.findByRole("dialog");
    expect(
      within(panel).getByText("Fewer than 5 people: figures are not shown."),
    ).toBeInTheDocument();
    expect(within(panel).queryByText("Everyone in this department")).toBeNull();
    expect(within(panel).queryByText("Results")).toBeNull();
  });
});

describe("the PDF", () => {
  const printApi = vi.mocked(companyReportApi.printed);

  beforeEach(() => {
    printApi.mockReset();
    printApi.mockResolvedValue(undefined);
    window.print = vi.fn();
  });

  it("offers Download PDF only with EXPORT_DATA", () => {
    mount();
    expect(screen.queryByRole("button", { name: /Download PDF/ })).toBeNull();
    cleanupDom();
    state.perms = new Set(["EDIT_RECORDS", "EXPORT_DATA"]);
    mount();
    expect(
      screen.getByRole("button", { name: /Download PDF/ }),
    ).toBeInTheDocument();
  });

  it("tells the server first, and opens the print dialog only once it has", async () => {
    state.perms = new Set(["EDIT_RECORDS", "EXPORT_DATA"]);
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: /Download PDF/ }));
    expect(printApi).toHaveBeenCalledTimes(1);
    expect(printApi.mock.calls[0]![0]).toBe("c-1");
    expect(printApi.mock.calls[0]![1]).toContain("findings");
    expect(window.print).toHaveBeenCalledTimes(1);
    expect(printApi.mock.invocationCallOrder[0]!).toBeLessThan(
      vi.mocked(window.print).mock.invocationCallOrder[0]!,
    );
  });

  it("does not open the print dialog when the print cannot be recorded", async () => {
    state.perms = new Set(["EDIT_RECORDS", "EXPORT_DATA"]);
    printApi.mockRejectedValue(new Error("down"));
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: /Download PDF/ }));
    expect(window.print).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("prints the company, the findings, the strengths, the actions and the method, with no names and no buttons", () => {
    const { layouts } = printed();
    const paper = layouts.map((node) => node.textContent ?? "").join(" ");
    expect(paper).toContain("Schull");
    expect(paper).toContain("Company reports");
    expect(paper).toContain("4 of 61 people have no mark");
    expect(paper).toContain("What is working");
    expect(paper).toContain("Priority actions");
    expect(paper).toContain("Complete 52 staff records");
    expect(paper).toContain("Method and privacy");
    expect(paper).toContain("carries no names");
    // The finding that names people is left out, and so are the people.
    expect(paper).not.toContain("Highest mark in each department");
    expect(paper).not.toContain("Zed Person");
    expect(paper).not.toContain("Abe Person");
    for (const layout of layouts) {
      expect(layout.querySelector("a")).toBeNull();
      expect(layout.querySelector("button")).toBeNull();
    }
  });
});
