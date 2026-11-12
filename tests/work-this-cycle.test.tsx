import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { Completion, WorkThisCycle } from "@/lib/projects/completions";
import { UNLINKED } from "@/lib/projects/types";
import { linkedTo } from "./support/objective-fixtures";

/**
 * "Work this cycle", inside a review.
 *
 * What is proved: it reads as totals, projects, on time, the share linked and the
 * list, with no number that looks like a score and no grade; it is collapsed on a
 * phone and open on a wide screen; it draws nothing until its read has answered;
 * and for everybody the API will not answer (an outsider, a Program reader, a
 * holder of the company-wide grant) it draws nothing at all, not a refusal.
 */

const hook = vi.hoisted(() => ({
  read: null as unknown,
  args: [] as unknown[],
  phone: false,
  projects: { enabled: true, loading: false },
}));
vi.mock("@/lib/store/completions", () => ({
  useWorkThisCycle: (args: unknown) => {
    hook.args.push(args);
    return hook.read;
  },
}));
vi.mock("@/lib/store/project-session", () => ({
  useProjectsGate: () => hook.projects,
}));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
}));
/* The panels read the person's flags through their own hook. Flags are not what this file is
   about, so the server never says they are on; tests/work-flags-panels.test.tsx covers them. */
vi.mock("@/lib/store/work-flags", () => ({
  useWorkFlags: () => ({
    on: false,
    flags: null,
    flag: vi.fn(),
    unflag: vi.fn(),
  }),
}));
vi.mock("@/app/(app)/hiring/requisitions/[id]/use-phone", () => ({
  usePhone: () => hook.phone,
}));

const { WorkThisCycle } =
  await import("@/components/performance/work-this-cycle");

const done = (over: Partial<Completion> = {}): Completion => ({
  id: "i1",
  key: "PRF-1",
  title: "Run the October payroll",
  projectId: "p1",
  projectName: "Payroll v2",
  personal: false,
  personId: "bola",
  personName: "Bola Projects",
  doneAt: "2026-10-12T10:00:00.000Z",
  doneDay: "2026-10-12",
  dueDate: "2026-10-12",
  onTime: true,
  objective: linkedTo("Grow revenue", { level: "company" }),
  canOpen: true,
  ...over,
});

const work = (over: Partial<WorkThisCycle> = {}): WorkThisCycle => ({
  summary: { finished: 4, withDueDate: 3, onTime: 2, late: 1, linked: 3 },
  byProject: [
    { projectId: "p1", projectName: "Payroll v2", finished: 3 },
    { projectId: "p2", projectName: "Office move", finished: 1 },
  ],
  byObjective: [
    {
      goalId: "g1",
      title: "Grow revenue",
      keyResultTitle: null,
      unlinked: false,
      visible: true,
      finished: 3,
    },
    {
      goalId: null,
      title: null,
      keyResultTitle: null,
      unlinked: true,
      visible: true,
      finished: 1,
    },
  ],
  items: [
    done(),
    done({ id: "i2", key: "PRF-2", title: "Close the books", onTime: false }),
    done({
      id: "i3",
      key: "OFF-1",
      title: "Sign the lease",
      projectId: "p2",
      projectName: "Office move",
      objective: UNLINKED,
      dueDate: null,
      onTime: null,
    }),
    done({ id: "i4", key: "PRF-4", title: "Fourth thing" }),
  ],
  total: 4,
  capped: false,
  ...over,
});

const ok = (data: WorkThisCycle | null) => ({
  data,
  loading: false,
  error: null,
  reload: vi.fn(),
});

const props = {
  subjectId: "bola",
  cycleId: "c1",
  periodStart: "2026-07-01",
  periodEnd: "2026-12-31",
  subjectName: "Bola Projects",
  own: false,
};

beforeEach(() => {
  hook.read = ok(work());
  hook.args = [];
  hook.phone = false;
  hook.projects = { enabled: true, loading: false };
});

describe("what it says", () => {
  it("reads as counts: finished, by the due date, linked, and projects", () => {
    render(<WorkThisCycle {...props} />);
    expect(screen.getByText("4 tasks finished")).toBeInTheDocument();
    const dl = screen.getByText("Finished").closest("dl")!;
    expect(within(dl).getByText("2 of 3")).toBeInTheDocument();
    expect(within(dl).getByText("3 of 4")).toBeInTheDocument();
    expect(within(dl).getByText("2")).toBeInTheDocument();
  });

  it("lists by project and by objective, and says a task with no link is not linked", () => {
    render(<WorkThisCycle {...props} />);
    const byProject = screen
      .getByRole("heading", { name: "By project" })
      .closest("section")!;
    expect(within(byProject).getByText("Payroll v2")).toBeInTheDocument();
    expect(within(byProject).getByText("3 finished")).toBeInTheDocument();
    const byObjective = screen
      .getByRole("heading", { name: "By objective" })
      .closest("section")!;
    expect(within(byObjective).getByText("Grow revenue")).toBeInTheDocument();
    expect(
      within(byObjective).getByText("Not linked to an objective"),
    ).toBeInTheDocument();
  });

  it("lists the finished tasks with the project and the day", () => {
    render(<WorkThisCycle {...props} />);
    const row = screen.getByText("Close the books").closest("li")!;
    expect(within(row).getByText("Payroll v2")).toBeInTheDocument();
    expect(within(row).getByText("Finished 12 Oct 2026")).toBeInTheDocument();
    expect(within(row).getByText("Late")).toBeInTheDocument();
  });

  it("states what the period is and that it does not change the mark", () => {
    render(<WorkThisCycle {...props} />);
    expect(
      screen.getByText(
        /1 Jul 2026 to 31 Dec 2026\. For reading beside the answers; it does not change the mark\./,
      ),
    ).toBeInTheDocument();
  });

  it("has no number that looks like a score: no percentage, rate, rating or grade", () => {
    render(<WorkThisCycle {...props} />);
    expect(document.body.textContent).not.toMatch(
      /%|rate|rating|score|grade|waiting|points|effort/i,
    );
    expect(document.body.textContent).not.toMatch(/!/);
  });

  it("does not say a low share linked is a shortfall", () => {
    hook.read = ok(
      work({
        summary: { finished: 4, withDueDate: 0, onTime: 0, late: 0, linked: 0 },
        byObjective: [
          {
            goalId: null,
            title: null,
            keyResultTitle: null,
            unlinked: true,
            visible: true,
            finished: 4,
          },
        ],
      }),
    );
    render(<WorkThisCycle {...props} />);
    expect(screen.getByText("0 of 4")).toBeInTheDocument();
    expect(screen.getByText("None had one")).toBeInTheDocument();
    expect(
      screen.queryByText(
        /not counted|missing|no objective|should|low|warning/i,
      ),
    ).toBeNull();
    /* Nothing is linked, so there is no "By objective" heading over a blank. */
    expect(screen.queryByRole("heading", { name: "By objective" })).toBeNull();
    expect(document.querySelector("[class*=danger]")).toBeNull();
  });

  it("speaks to you in your own review and names the person in theirs", () => {
    hook.read = ok(
      work({
        summary: { finished: 0, withDueDate: 0, onTime: 0, late: 0, linked: 0 },
        items: [],
        byProject: [],
        byObjective: [],
        total: 0,
      }),
    );
    const { unmount } = render(<WorkThisCycle {...props} own />);
    expect(
      screen.getByText(
        "No finished tasks were recorded for you on the project boards in this period.",
      ),
    ).toBeInTheDocument();
    unmount();
    render(<WorkThisCycle {...props} />);
    expect(
      screen.getByText(
        "No finished tasks were recorded for Bola Projects on the project boards in this period.",
      ),
    ).toBeInTheDocument();
  });

  it("does not read an empty list as low output: it says nothing was recorded, and what it cannot show", () => {
    hook.read = ok(
      work({
        summary: { finished: 0, withDueDate: 0, onTime: 0, late: 0, linked: 0 },
        items: [],
        byProject: [],
        byObjective: [],
        total: 0,
      }),
    );
    render(<WorkThisCycle {...props} />);
    expect(screen.queryByText(/finished no tasks/i)).toBeNull();
    expect(screen.getByText(/It does not show meetings/)).toBeInTheDocument();
  });

  /* It has to be true against whichever server answers, so it says nothing that server alone
     decides: not which tasks the list leaves out, only that it is what was tracked in Projects. */
  it("says what it cannot show beside the list: meetings, mentoring and work outside Projects, and nothing the server alone decides", () => {
    const sentence =
      "This is only what was tracked in Projects. It does not show meetings, mentoring or anything done outside Projects, so a short list is not a short record of work.";
    const { unmount } = render(<WorkThisCycle {...props} />);
    expect(screen.getByText(/It does not show meetings/)).toHaveTextContent(
      sentence,
    );
    unmount();
    render(<WorkThisCycle {...props} own />);
    expect(screen.getByText(/It does not show meetings/)).toHaveTextContent(
      sentence,
    );
    /* Not a claim about which tasks the list leaves out: an older server still lists them. */
    expect(screen.queryByText(/to-do list/i)).toBeNull();
  });

  it("says who set a task only when somebody else did", () => {
    hook.read = ok(
      work({
        items: [
          done({
            id: "a",
            key: "PRF-1",
            title: "Pat asked for this one",
            setBy: { id: "pat", name: "Pat Projects" },
          }),
          done({ id: "b", key: "PRF-2", title: "Bola's own idea" }),
        ],
        summary: { finished: 2, withDueDate: 2, onTime: 2, late: 0, linked: 2 },
        total: 2,
      }),
    );
    render(<WorkThisCycle {...props} />);
    expect(screen.getAllByText("Set by Pat Projects")).toHaveLength(1);
    expect(screen.queryAllByText(/^Set by /)).toHaveLength(1);
  });

  it("shows ten, then all of them on request, and says when the list is capped", async () => {
    const many = Array.from({ length: 12 }, (_, n) =>
      done({ id: `m${n}`, key: `M-${n}`, title: `Many ${n}` }),
    );
    hook.read = ok(
      work({
        items: many,
        total: 90,
        capped: true,
        summary: {
          finished: 90,
          withDueDate: 0,
          onTime: 0,
          late: 0,
          linked: 0,
        },
      }),
    );
    render(<WorkThisCycle {...props} />);
    expect(screen.getAllByRole("link", { name: /^M-/ })).toHaveLength(10);
    await userEvent.click(screen.getByRole("button", { name: "Show all 12" }));
    expect(screen.getAllByRole("link", { name: /^M-/ })).toHaveLength(12);
    expect(
      screen.getByText(/Showing the latest 12 of 90\./),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open the work record" }),
    ).toHaveAttribute("href", "/performance/history/bola");
  });

  it("points your own review at your own work record", () => {
    hook.read = ok(work({ capped: true, total: 90 }));
    render(<WorkThisCycle {...props} own />);
    expect(
      screen.getByRole("link", { name: "Open the work record" }),
    ).toHaveAttribute("href", "/performance/work-record");
  });

  it("asks for the right person, cycle and dates, once", () => {
    render(<WorkThisCycle {...props} />);
    expect(hook.args.at(-1)).toEqual({
      subjectId: "bola",
      cycleId: "c1",
      periodStart: "2026-07-01",
      periodEnd: "2026-12-31",
      enabled: true,
    });
  });
});

describe("collapsed on a phone", () => {
  it("is open on a wide screen", () => {
    render(<WorkThisCycle {...props} />);
    expect(
      screen.getByRole("button", { name: /Work this cycle/ }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Close the books")).toBeVisible();
  });

  it("is closed on a phone, and opens on press", async () => {
    hook.phone = true;
    render(<WorkThisCycle {...props} />);
    const button = screen.getByRole("button", { name: /Work this cycle/ });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Close the books")).toBeNull();
    /* The count is on the closed line, so it can be decided not to open. */
    expect(screen.getByText("4 tasks finished")).toBeInTheDocument();
    await userEvent.click(button);
    expect(screen.getByText("Close the books")).toBeInTheDocument();
  });

  it("opens on arrival when it was asked for (a drawer opened to see the work)", () => {
    hook.phone = true;
    render(<WorkThisCycle {...props} startOpen />);
    expect(screen.getByText("Close the books")).toBeInTheDocument();
  });
});

describe("before the read has answered, and for people it will not answer", () => {
  it("draws a placeholder and no data while loading", () => {
    hook.read = { data: null, loading: true, error: null, reload: vi.fn() };
    render(<WorkThisCycle {...props} />);
    expect(screen.queryByText(/finished/)).toBeNull();
    expect(screen.queryByText("Run the October payroll")).toBeNull();
    expect(screen.getByLabelText("Loading work")).toBeInTheDocument();
  });

  it("draws nothing when the review is not one it is for (peer feedback)", () => {
    const { container } = render(<WorkThisCycle {...props} enabled={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  /* A company without Projects has no boards, so "no tasks finished" would be a claim about
     work nobody tracks, read as low output. Not offered, and not asked for either. */
  it("draws nothing, and asks for nothing, when the company has not switched Projects on", () => {
    hook.projects = { enabled: false, loading: false };
    const { container } = render(<WorkThisCycle {...props} />);
    expect(container).toBeEmptyDOMElement();
    expect(hook.args.at(-1)).toMatchObject({ enabled: false });
    expect(screen.queryByText(/finished/)).toBeNull();
    expect(screen.queryByLabelText("Loading work")).toBeNull();
  });

  it("draws nothing while the company's switches are still on their way, so it never flashes up and goes", () => {
    hook.projects = { enabled: false, loading: true };
    const { container } = render(<WorkThisCycle {...props} />);
    expect(container).toBeEmptyDOMElement();
    expect(hook.args.at(-1)).toMatchObject({ enabled: false });
  });

  it("is there when Projects is on", () => {
    hook.projects = { enabled: true, loading: false };
    render(<WorkThisCycle {...props} />);
    expect(screen.getByText("Work this cycle")).toBeInTheDocument();
    expect(hook.args.at(-1)).toMatchObject({ enabled: true });
  });

  it("draws nothing for a cycle that states no dates", () => {
    hook.read = ok(null);
    const { container } = render(<WorkThisCycle {...props} />);
    expect(container).toBeEmptyDOMElement();
  });

  /* The API answers an outsider, a plain project member, a Program reader and a
     holder of the company-wide grant with the 404 a missing person gets (403 where
     it says so). None of them gets a panel, a heading or a refusal. */
  it.each([
    ["an outsider", 404],
    ["a Program Read person", 404],
    ["a holder of the company-wide grant", 404],
    ["somebody refused outright", 403],
  ])("draws nothing at all for %s", (_who, status) => {
    hook.read = {
      data: null,
      loading: false,
      error: new ApiError(status, "x", "That employee could not be found."),
      reload: vi.fn(),
    };
    const { container } = render(<WorkThisCycle {...props} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["the person themselves", true],
    ["their manager", false],
    ["their department head", false],
    ["HR", false],
  ])("draws the panel for %s, whom the API answers", (_who, own) => {
    render(<WorkThisCycle {...props} own={own} />);
    expect(
      screen.getByRole("button", { name: /Work this cycle/ }),
    ).toBeInTheDocument();
  });

  it("says a real failure, in the usual way, with another try", () => {
    hook.read = {
      data: null,
      loading: false,
      error: new ApiError(500, "boom", "It broke."),
      reload: vi.fn(),
    };
    render(<WorkThisCycle {...props} />);
    expect(
      screen.getByRole("button", { name: /try again|retry/i }),
    ).toBeInTheDocument();
  });
});
