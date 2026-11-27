import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { Completion, WorkThisCycle } from "@/lib/projects/completions";
import { UNLINKED } from "@/lib/projects/types";
import { linkedTo } from "./support/objective-fixtures";

/**
 * The work done in a review's period, inside a review.
 *
 * What is proved: it is one list with no heading, a small line that says how many finished, every rule
 * behind one info mark, and a row per task with the project and the day; there is no fact grid, no
 * by-project or by-objective list and no number that looks like a score or a grade; nothing recorded is
 * "Not recorded"; it draws nothing until its read has answered; and for everybody the API will not
 * answer (an outsider, a Program reader, a holder of the company-wide grant) it draws nothing at all,
 * not a refusal.
 */

const hook = vi.hoisted(() => ({
  read: null as unknown,
  args: [] as unknown[],
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
  hook.projects = { enabled: true, loading: false };
});

/** Opens the one tooltip and says what it says. */
const readNote = async () => {
  await userEvent.click(
    screen.getByRole("button", { name: "About this list" }),
  );
};

describe("what it says", () => {
  it("says how many finished in one small line, and nothing else about the totals", () => {
    render(<WorkThisCycle {...props} />);
    expect(screen.getByText("4 finished")).toBeInTheDocument();
    for (const gone of [
      "By the due date",
      "Linked to an objective",
      "Projects",
      "By project",
      "By objective",
      "Finished tasks",
      "None had one",
      "2 of 3",
      "3 of 4",
    ]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
    expect(document.querySelector("dl")).toBeNull();
  });

  it("has no heading, whatever page it sits on", () => {
    render(<WorkThisCycle {...props} />);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByText("Work this cycle")).toBeNull();
  });

  it("lists the finished tasks with one small line: the project, the day and whether it was on time", () => {
    render(<WorkThisCycle {...props} />);
    const row = screen.getByText("Close the books").closest("li")!;
    expect(
      within(row).getByText("Payroll v2 · Finished 12 Oct 2026 · Late"),
    ).toBeInTheDocument();
    const first = screen.getByText("Run the October payroll").closest("li")!;
    expect(
      within(first).getByText("Payroll v2 · Finished 12 Oct 2026 · On time"),
    ).toBeInTheDocument();
    /* No due date: neither on time nor late. */
    const lease = screen.getByText("Sign the lease").closest("li")!;
    expect(
      within(lease).getByText("Office move · Finished 12 Oct 2026"),
    ).toBeInTheDocument();
  });

  it("keeps every rule behind one info mark: the period, that it does not change the score, and what it leaves out", async () => {
    render(<WorkThisCycle {...props} />);
    expect(screen.queryByText(/For reading beside the answers/)).toBeNull();
    await readNote();
    expect(
      screen.getByText(
        /1 Jul 2026 to 31 Dec 2026\. For reading beside the answers; it does not change the score\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/not meetings, mentoring/)).toHaveTextContent(
      "Only what was tracked in Projects is here, not meetings, mentoring or work done elsewhere, so a short list is not a short record of work.",
    );
  });

  it("names the last 90 days when the cycle states no dates of its own", async () => {
    render(<WorkThisCycle {...props} periodStart={null} periodEnd={null} />);
    await readNote();
    expect(screen.getByText(/the last 90 days\./)).toBeInTheDocument();
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
        items: [
          done({ id: "a", objective: UNLINKED, dueDate: null, onTime: null }),
          done({
            id: "b",
            key: "PRF-2",
            objective: UNLINKED,
            dueDate: null,
            onTime: null,
          }),
        ],
      }),
    );
    render(<WorkThisCycle {...props} />);
    expect(
      screen.queryByText(
        /not counted|missing|no objective|should|low|warning/i,
      ),
    ).toBeNull();
    expect(screen.queryByText(/Linked to/)).toBeNull();
    expect(document.querySelector("[class*=danger]")).toBeNull();
  });

  it("says nothing was recorded, the same way to you and about somebody else, and never reads it as low output", async () => {
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
    expect(screen.getByText("Not recorded")).toBeInTheDocument();
    unmount();
    render(<WorkThisCycle {...props} />);
    expect(screen.getByText("Not recorded")).toBeInTheDocument();
    expect(screen.queryByText(/finished no tasks/i)).toBeNull();
    expect(screen.queryByText(/No finished tasks/)).toBeNull();
    /* What it cannot show is still one press away: a short list is not a short record. */
    await readNote();
    expect(screen.getByText(/not meetings, mentoring/)).toBeInTheDocument();
  });

  /* It has to be true against whichever server answers, so it says nothing that server alone
     decides: not which tasks the list leaves out, only that it is what was tracked in Projects. */
  it("says what it cannot show, to you and to a reader: meetings, mentoring and work outside Projects, and nothing the server alone decides", async () => {
    const sentence =
      "Only what was tracked in Projects is here, not meetings, mentoring or work done elsewhere, so a short list is not a short record of work.";
    const { unmount } = render(<WorkThisCycle {...props} />);
    await readNote();
    expect(screen.getByText(/not meetings, mentoring/)).toHaveTextContent(
      sentence,
    );
    unmount();
    render(<WorkThisCycle {...props} own />);
    await readNote();
    expect(screen.getByText(/not meetings, mentoring/)).toHaveTextContent(
      sentence,
    );
    /* Not a claim about which tasks the list leaves out: an older server still lists them. */
    expect(screen.queryByText(/to-do list/i)).toBeNull();
  });

  it("adds what the caller says to the one tooltip, and only there", async () => {
    render(
      <WorkThisCycle
        {...props}
        note="Nothing was kept of this list when the rating was made final."
      />,
    );
    expect(screen.queryByText(/Nothing was kept/)).toBeNull();
    await readNote();
    expect(
      screen.getByText(/Nothing was kept of this list/),
    ).toBeInTheDocument();
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
    expect(screen.getAllByText(/Set by Pat Projects$/)).toHaveLength(1);
    expect(screen.queryAllByText(/Set by /)).toHaveLength(1);
  });

  it("shows ten, then all of them on request, and says in the small line when the list is capped", async () => {
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
      screen.getByText("90 finished · latest 12 shown"),
    ).toBeInTheDocument();
    /* The history page it used to point at does not show the work any more. */
    expect(screen.queryByRole("link", { name: /work record/i })).toBeNull();
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

describe("where it sits", () => {
  it("is always open: there is nothing to press to read it, on a wide screen or a phone", () => {
    render(<WorkThisCycle {...props} />);
    expect(screen.queryByRole("button", { name: /work/i })).toBeNull();
    expect(screen.getByText("Close the books")).toBeVisible();
  });

  it("is in a card of its own on a page, and bare in a drawer", () => {
    const { container, unmount } = render(<WorkThisCycle {...props} framed />);
    expect(container.querySelector("[data-card]")).not.toBeNull();
    unmount();
    const bare = render(<WorkThisCycle {...props} />);
    expect(bare.container.querySelector("[data-card]")).toBeNull();
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
    expect(screen.getByText("4 finished")).toBeInTheDocument();
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
  ])("draws the list for %s, whom the API answers", (_who, own) => {
    render(<WorkThisCycle {...props} own={own} />);
    expect(screen.getByText("4 finished")).toBeInTheDocument();
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
