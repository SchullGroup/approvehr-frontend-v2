import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProjectProvider,
  type ProjectContextValue,
} from "@/components/projects/project-context";
import type { Issue, ProjectData } from "@/lib/projects/types";
import { contextFor, sampleData } from "./projects-fixture";

/**
 * Reports, as a person meets them. The figures are the sample project's, counted
 * by hand in `projects-reports.test.ts`; here they are checked on the page, along
 * with the words that stand in for a chart that has nothing to draw.
 *
 * `next/navigation` is stubbed because the chosen sprint lives in the address.
 */

let search = new URLSearchParams();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => search,
  usePathname: () => "/projects/pj-chk",
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn() }),
}));

const { ReportsView } = await import("@/app/(app)/projects/[id]/reports-view");

function renderReports(
  data: ProjectData = sampleData(),
  overrides: Partial<ProjectContextValue> = {},
) {
  const ctx = contextFor(data, overrides);
  render(
    <ProjectProvider value={ctx}>
      <ReportsView />
    </ProjectProvider>,
  );
  return { ctx };
}

beforeEach(() => {
  search = new URLSearchParams();
  replace.mockClear();
});

/** The tile with this label: its figure and its line of detail. */
function tile(label: string) {
  const el = screen.getByText(label).closest(".rounded-lg") as HTMLElement;
  const [value, hint] = [...el.querySelectorAll(":scope > p")].map(
    (p) => p.textContent,
  );
  return { value, hint, el };
}

const panel = (title: string) =>
  screen
    .getByRole("heading", { name: title })
    .closest(".rounded-lg") as HTMLElement;

describe("the view's place in the project", () => {
  it("is what ?view=reports shows", async () => {
    const { viewById } = await import("@/app/(app)/projects/[id]/views");
    expect(viewById("reports").Component).toBe(ReportsView);
  });
});

describe("the tiles", () => {
  it("shows open issues and the points left", () => {
    renderReports();
    expect(tile("Open issues")).toMatchObject({
      value: "13",
      hint: "46 points left",
    });
  });

  it("shows what was done in 7 days and the points shipped", () => {
    renderReports();
    expect(tile("Done in 7 days")).toMatchObject({
      value: "4",
      hint: "9 points shipped",
    });
  });

  it("shows open bugs and how many are high priority, in the warning colour while there are any", () => {
    renderReports();
    const bugs = tile("Open bugs");
    expect(bugs).toMatchObject({ value: "2", hint: "1 high priority" });
    expect(within(bugs.el).getByText("2")).toHaveClass("text-warning-text");
  });

  it("shows what is overdue, in the warning colour while there is any", () => {
    renderReports();
    const overdue = tile("Overdue");
    expect(overdue.value).toBe("1");
    expect(within(overdue.el).getByText("1")).toHaveClass("text-warning-text");
  });

  it("is calm when nothing is wrong, and says one point as one point", () => {
    const data = sampleData();
    renderReports({
      ...data,
      issues: data.issues.filter((i) => i.type !== "BUG" && i.dueDate === null),
    });
    const bugs = tile("Open bugs");
    expect(bugs.value).toBe("0");
    expect(within(bugs.el).getByText("0")).not.toHaveClass("text-warning-text");
    expect(tile("Overdue").value).toBe("0");
  });

  it("writes a single point in the singular", () => {
    const data = sampleData();
    const lone = {
      ...data.issues.find((i) => i.key === "CHK-22")!,
      points: 1,
    };
    renderReports({ ...data, issues: [lone] });
    expect(tile("Open issues").hint).toBe("1 point left");
  });
});

describe("the sprint burndown", () => {
  it("draws the running sprint, with its figures in words and in a table", () => {
    renderReports();
    const chart = screen.getByRole("img", {
      name: "CHK Sprint 3 burndown: 18 of 27 points left today",
    });
    expect(chart).toBeInTheDocument();
    expect(within(chart).getByText("18 left")).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === "P" &&
          /^18 of 27 points left\./.test(el.textContent ?? ""),
      ),
    ).toHaveTextContent("18 of 27 points left. 7 days left in the sprint.");
    const table = screen.getByRole("table", {
      name: /CHK Sprint 3: points left at the end of each day/,
    });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(7);
    expect(rows[0]).toHaveTextContent("9 Oct2727");
    /* The even pace on the 11th is 27 x 11/13, to a tenth. */
    expect(rows[2]).toHaveTextContent("11 Oct2422.8");
    expect(rows[6]).toHaveTextContent("15 Oct18");
  });

  it("lists the sprints that have begun, newest first, and starts on the running one", () => {
    renderReports();
    const select = screen.getByRole("combobox", { name: "Sprint" });
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["CHK Sprint 3 (active)", "CHK Sprint 2", "CHK Sprint 1"]);
    expect(select).toHaveValue("sp-chk-3");
  });

  it("writes the choice of sprint to the address", async () => {
    renderReports();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Sprint" }),
      "sp-chk-2",
    );
    expect(replace).toHaveBeenCalledWith("/projects/pj-chk?sprint=sp-chk-2", {
      scroll: false,
    });
  });

  it("draws a closed sprint against what it committed", () => {
    search = new URLSearchParams("sprint=sp-chk-2");
    renderReports();
    expect(
      screen.getByRole("img", {
        name: /CHK Sprint 2 burndown: \d+ of 24 points left at the end/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/committed were left when it closed/),
    ).toBeInTheDocument();
    /* A closed sprint has no today. */
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
  });

  it("falls back to the running sprint when the address names one that is not there", () => {
    search = new URLSearchParams("sprint=gone");
    renderReports();
    expect(
      screen.getByRole("img", { name: /CHK Sprint 3 burndown/ }),
    ).toBeInTheDocument();
  });

  it("says when a sprint has no dates", () => {
    const data = sampleData();
    renderReports({
      ...data,
      sprints: data.sprints.map((s) =>
        s.state === "ACTIVE" ? { ...s, startDate: null, endDate: null } : s,
      ),
    });
    expect(screen.getByText(/has no start and end dates/)).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /burndown/ }),
    ).not.toBeInTheDocument();
  });

  it("says when a sprint has no points", () => {
    const data = sampleData();
    renderReports({
      ...data,
      issues: data.issues.map((i) =>
        i.sprintId === "sp-chk-3" ? { ...i, points: null } : i,
      ),
    });
    expect(screen.getByText(/have no points yet/)).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /burndown/ }),
    ).not.toBeInTheDocument();
  });

  it("says to start a sprint when none has begun", () => {
    const data = sampleData();
    renderReports({
      ...data,
      sprints: data.sprints.filter((s) => s.state === "PLANNED"),
    });
    expect(
      screen.getByText("Start a sprint to see its burndown."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Sprint" }),
    ).not.toBeInTheDocument();
  });

  it("offers no choice of sprint when there is only one to see", () => {
    const data = sampleData();
    renderReports({
      ...data,
      sprints: data.sprints.filter((s) => s.id === "sp-chk-3"),
    });
    expect(
      screen.queryByRole("combobox", { name: "Sprint" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /CHK Sprint 3 burndown/ }),
    ).toBeInTheDocument();
  });

  it("says how far over a sprint ran, and that it ends today", () => {
    renderReports(sampleData(), { today: "2026-10-22" });
    expect(screen.getByText(/It ends today\./)).toBeInTheDocument();
  });
});

describe("velocity", () => {
  it("shows each closed sprint's completed points of those committed, and the average", () => {
    renderReports();
    const velocity = panel("Velocity");
    expect(within(velocity).getByText("Sprint 1")).toBeInTheDocument();
    expect(within(velocity).getByText("18 of 21")).toBeInTheDocument();
    expect(within(velocity).getByText("22 of 24")).toBeInTheDocument();
    expect(within(velocity).getByText("Average 20 points")).toBeInTheDocument();
    const table = within(velocity).getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(table).toHaveAccessibleName(
      /last 2 closed sprints, averaging 20 points completed/,
    );
  });

  it("says to complete a sprint when none has closed", () => {
    const data = sampleData();
    renderReports({
      ...data,
      sprints: data.sprints.filter((s) => s.state !== "CLOSED"),
    });
    expect(
      screen.getByText("Complete a sprint to start tracking velocity."),
    ).toBeInTheDocument();
  });

  it("says when a closed sprint has no figure, rather than showing zero", () => {
    const data = sampleData();
    renderReports({
      ...data,
      sprints: data.sprints.map((s) =>
        s.id === "sp-chk-1"
          ? { ...s, committedPoints: null, completedPoints: null }
          : s,
      ),
    });
    const velocity = panel("Velocity");
    /* Once in the list and once in each of the table's two cells. */
    expect(within(velocity).getAllByText("Not recorded")).toHaveLength(3);
    expect(within(velocity).getByText("Average 22 points")).toBeInTheDocument();
  });
});

describe("workload", () => {
  it("lists each person's open points and issues, unassigned included, most points first", () => {
    renderReports();
    const rows = within(panel("Workload")).getAllByRole("listitem");
    /* The avatar's initials are decorative and come first in the text. */
    const texts = rows.map((r) => r.textContent ?? "");
    expect(texts[0]).toMatch(/Unassigned26 points · 5 issues$/);
    expect(texts[1]).toMatch(/Adaeze Okonkwo11 points · 3 issues$/);
    expect(texts[2]).toMatch(/Emeka Anyanwu7 points · 3 issues$/);
    expect(texts[3]).toMatch(/Ngozi Eze2 points · 2 issues$/);
    expect(rows).toHaveLength(4);
  });

  it("scales the bars to the busiest person", () => {
    renderReports();
    const bars = within(panel("Workload"))
      .getAllByRole("listitem")
      .map(
        (row) =>
          (row.querySelector(".h-2.bg-sunken > span") as HTMLElement).style
            .width,
      );
    expect(bars[0]).toBe("100%");
    expect(parseFloat(bars[1]!)).toBeCloseTo((11 / 26) * 100, 5);
  });

  it("counts issues instead when nothing open has points", () => {
    const data = sampleData();
    renderReports({
      ...data,
      issues: data.issues.map((i) => ({ ...i, points: null })),
    });
    expect(
      screen.getByText("Open issues by person. None has points yet."),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/0 points/).length).toBeGreaterThan(0);
  });

  it("says nothing is open when it is not", () => {
    const data = sampleData();
    renderReports({ ...data, issues: [] });
    expect(
      screen.getByText("Nothing is open, so nobody has any work on."),
    ).toBeInTheDocument();
  });
});

describe("the issue breakdown", () => {
  it("counts issues by status category and by type, and says how many there are", () => {
    renderReports();
    const breakdown = panel("Issue breakdown");
    expect(
      within(breakdown).getByText(
        "22 issues in this project, epics not counted",
      ),
    ).toBeInTheDocument();
    for (const legend of [
      "To do 9",
      "In progress 4",
      "Done 9",
      "Story 9",
      "Task 5",
      "Bug 4",
      "Sub-task 4",
    ]) {
      expect(within(breakdown).getByText(legend)).toBeInTheDocument();
    }
  });

  it("carries the same numbers in a table for a screen reader", () => {
    renderReports();
    const table = screen.getByRole("table", {
      name: "Issues by status category",
    });
    expect(
      within(table).getByRole("row", { name: /To do\s*9/ }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("table", { name: "Issues by type" })).getByRole(
        "row",
        {
          name: /Bug\s*4/,
        },
      ),
    ).toBeInTheDocument();
  });

  it("says so when there is nothing to count", () => {
    const data = sampleData();
    renderReports({ ...data, issues: [] });
    expect(
      within(panel("Issue breakdown")).getByText("No issues yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Create an issue and its status and type are counted here.",
      ),
    ).toBeInTheDocument();
  });
});

describe("a Kanban project", () => {
  function kanban(): ProjectData {
    const data = sampleData();
    return {
      project: { ...data.project, type: "KANBAN" },
      issues: data.issues.map((i: Issue) => ({ ...i, sprintId: null })),
      sprints: [],
    };
  }

  it("leaves out the burndown and the velocity, and says why in a line", () => {
    renderReports(kanban());
    expect(
      screen.getByText(
        "Burndown and velocity measure sprints, and a Kanban project has none.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Sprint burndown")).not.toBeInTheDocument();
    expect(screen.queryByText("Velocity")).not.toBeInTheDocument();
  });

  it("still shows the tiles, the workload and the breakdown", () => {
    renderReports(kanban());
    expect(tile("Open issues").value).toBe("13");
    expect(screen.getByText("Workload")).toBeInTheDocument();
    expect(screen.getByText("Issue breakdown")).toBeInTheDocument();
  });

  it("says nothing about sprints on a Scrum project", () => {
    renderReports();
    expect(
      screen.queryByText(/a Kanban project has none/),
    ).not.toBeInTheDocument();
  });
});

describe("the burndown's size", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** A box whose width the test sets, and a way to tell the chart it changed. */
  function box(initial: number) {
    let notify: () => void = () => undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          notify = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const state = { width: initial };
    vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(
      () => state.width,
    );
    return {
      resize: (width: number) => {
        state.width = width;
        act(() => notify());
      },
    };
  }

  const chart = () => screen.getByRole("img", { name: /burndown/ });

  it("draws at the width of the box it is in, so its text is never scaled", () => {
    box(333);
    renderReports();
    expect(chart()).toHaveAttribute("width", "333");
    expect(chart()).toHaveAttribute(
      "viewBox",
      expect.stringMatching(/^0 0 333 /),
    );
  });

  it("draws again when the box changes", () => {
    const b = box(640);
    renderReports();
    expect(chart()).toHaveAttribute("width", "640");
    b.resize(300);
    expect(chart()).toHaveAttribute("width", "300");
    b.resize(520);
    expect(chart()).toHaveAttribute("width", "520");
  });

  it("does not draw narrower than a chart can be read", () => {
    box(120);
    renderReports();
    expect(chart()).toHaveAttribute("width", "260");
  });

  it("keeps every label at the 14px floor at any width", () => {
    const b = box(900);
    renderReports();
    for (const width of [900, 360, 260]) {
      b.resize(width);
      const sizes = [...chart().querySelectorAll("text")].map((t) =>
        t.getAttribute("font-size"),
      );
      expect(sizes.length).toBeGreaterThan(4);
      expect(new Set(sizes)).toEqual(new Set(["14"]));
    }
  });

  it("keeps every label inside the drawing", () => {
    const b = box(300);
    renderReports();
    for (const width of [300, 260, 900]) {
      b.resize(width);
      for (const t of chart().querySelectorAll("text")) {
        const x = Number(t.getAttribute("x"));
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(width < 260 ? 260 : width);
      }
    }
  });
});

describe("what a screen reader is given", () => {
  it("has a named image and a table for the burndown, and no figure that is only a picture", () => {
    renderReports();
    const chart = screen.getByRole("img", { name: /burndown/ });
    expect(chart.tagName.toLowerCase()).toBe("svg");
    const figure = chart.closest("figure")!;
    expect(within(figure).getByRole("table")).toBeInTheDocument();
    /* The hidden table is clipped from sight, not removed from the page. */
    expect(within(figure).getByRole("table").parentElement).toHaveClass(
      "sr-only-focusable",
    );
  });

  it("writes every chart's legend as text", () => {
    renderReports();
    for (const text of ["Points left", "Even pace", "Committed", "Completed"]) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
  });
});
