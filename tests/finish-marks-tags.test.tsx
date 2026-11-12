import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WHO, people, scene, type Who } from "./programs-fixture";
import { sampleData } from "./projects-fixture";
import { finishedMeta, finishedSplit } from "@/lib/projects/finish-marks";
import { toWorkRow } from "@/lib/api/programs";
import type { WorkRow } from "@/lib/projects/programs";
import type { Issue } from "@/lib/projects/types";

/**
 * "Won't do" and "Accepted", where a task is shown with its stage: the board's card, the backlog's row,
 * and the Master list's row and Archive.
 *
 * What is proved: a task closed as won't do says so wherever it sits in a Done column, so it is never
 * read as work somebody finished; a task nobody marked says nothing; the Archive does not call a won't-do
 * task completed; the Master list's marker is read only when the API said `true`; and a count of finished
 * tasks never includes a task nobody did.
 */

let who: Who = WHO.master;
let rows: WorkRow[] = [];
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/projects/master",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/components/ui", async (original) => ({
  ...(await original<typeof import("@/components/ui")>()),
  useToast: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => true,
  hasAnyPermission: () => true,
  usePermissions: () => ({
    permissions: new Set(["SEE_ALL_WORK"]),
    loading: false,
    can: () => true,
  }),
}));
vi.mock("@/lib/store/programs", async () => {
  const fixture = await import("./programs-fixture");
  const hooks = fixture.programHooks(() => who);
  return {
    ...hooks,
    useProgramActions: () => fixture.fakeProgramActions(),
    useWorkList: (...args: unknown[]) => ({
      ...(hooks.useWorkList as (...a: unknown[]) => Record<string, unknown>)(
        ...args,
      ),
      rows,
      total: rows.length,
      hasMore: false,
      capped: false,
      error: null,
    }),
  };
});
vi.mock("@/lib/store/projects", async () => {
  const fixture = await import("./programs-fixture");
  return {
    useCreateProject: () => vi.fn(),
    useProjectList: () => ({
      status: "ready",
      error: null,
      projects: fixture.scene.projects.map((d) => d.project),
      reload: vi.fn(),
    }),
    useArchivedProjects: () => ({
      status: "ready",
      error: null,
      projects: [],
      reload: vi.fn(),
    }),
  };
});
vi.mock("@/lib/store/project-session", async () => {
  const fixture = await import("./programs-fixture");
  return {
    useProjectsGate: () => ({ enabled: true, loading: false }),
    usePeople: () => fixture.people,
    useProjectActor: () => fixture.actorOf(who),
  };
});
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: false, actingId: who.id }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ flat: [] }),
}));

const { WorkTasks } = await import("@/components/projects/work-list");
const { IssueCard } = await import("@/components/projects/issue-card");
const { BacklogRow } = await import("@/components/projects/backlog-row");
const { FinishTag } = await import("@/components/projects/finish-tag");

const WONT_DO = {
  at: "2026-11-10T09:00:00.000Z",
  byId: "p-05",
  byName: "Adaeze Okonkwo",
  reason: "The customer changed their mind",
};
const ACCEPTED = {
  at: "2026-11-11T14:30:00.000Z",
  byId: "p-05",
  byName: "Adaeze Okonkwo",
};

const row = (n: number, over: Partial<WorkRow> = {}): WorkRow => ({
  id: `t${n}`,
  key: `CNT-${n}`,
  number: n,
  type: "TASK",
  title: `Task ${n}`,
  projectId: scene.projects[0]!.project.id,
  projectKey: "CNT",
  projectName: "Content",
  projectColor: "#000000",
  programId: null,
  programName: null,
  statusId: "s",
  statusName: "Done",
  statusCategory: "DONE",
  priority: "MEDIUM",
  assigneeId: null,
  assignees: [],
  parentId: null,
  epicId: null,
  labels: [],
  dueDate: null,
  dueTime: null,
  overdue: false,
  doneAt: "2026-11-09T10:00:00.000Z",
  createdAt: "",
  updatedAt: "",
  ...over,
});

beforeEach(() => {
  who = WHO.master;
  rows = [];
});

describe("the tag", () => {
  it("says Won't do for a whole mark, with who and when on hover", () => {
    render(<FinishTag wontDo={WONT_DO} />);
    const tag = screen.getByText("Won't do");
    expect(tag).toHaveAttribute(
      "title",
      expect.stringMatching(/^Closed as won't do by Adaeze Okonkwo on /),
    );
  });

  it("says Won't do for a bare marker, which carries no who or when to hover", () => {
    render(<FinishTag wontDo />);
    const tag = screen.getByText("Won't do");
    expect(tag).not.toHaveAttribute("title");
  });

  it("says Accepted, with who and when on hover", () => {
    render(<FinishTag accepted={ACCEPTED} />);
    expect(screen.getByText("Accepted")).toHaveAttribute(
      "title",
      expect.stringMatching(/^Accepted by Adaeze Okonkwo on /),
    );
  });

  it.each([
    ["nothing", {}],
    ["null marks", { wontDo: null, accepted: null }],
    ["a false marker", { wontDo: false }],
  ])("draws nothing for %s", (_name, props) => {
    const { container } = render(<FinishTag {...props} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the board's card", () => {
  const issueWith = (patch: Partial<Issue>): Issue => ({
    ...sampleData().issues.find((i) => i.key === "CHK-10")!,
    ...patch,
  });
  const card = (issue: Issue) =>
    render(
      <IssueCard
        issue={issue}
        epic={null}
        people={people as never}
        statuses={[]}
        today="2026-11-12"
        done
        subtasks={null}
        dragging={false}
        canMove={false}
        onGrab={vi.fn()}
        onOpen={vi.fn()}
        onMove={vi.fn()}
      />,
    );

  it("says a task in the Done column was closed as won't do", () => {
    card(issueWith({ wontDo: WONT_DO }));
    expect(screen.getByText("Won't do")).toBeInTheDocument();
  });

  it("says a task was accepted", () => {
    card(issueWith({ accepted: ACCEPTED }));
    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });

  it("says nothing for a task nobody marked", () => {
    card(issueWith({}));
    expect(screen.queryByText("Won't do")).toBeNull();
    expect(screen.queryByText("Accepted")).toBeNull();
  });
});

describe("the backlog's row", () => {
  const backlog = (issue: Issue) =>
    render(
      <ul>
        <BacklogRow
          issue={issue}
          epic={null}
          status={{
            id: "s",
            name: "Done",
            category: "DONE",
            wipLimit: null,
            position: 2,
          }}
          people={people as never}
          done
          dragging={false}
          canMove={false}
          hasSprints={false}
          options={[]}
          onGrab={vi.fn()}
          onOpen={vi.fn()}
          onChoose={vi.fn()}
        />
      </ul>,
    );
  const issueWith = (patch: Partial<Issue>): Issue => ({
    ...sampleData().issues.find((i) => i.key === "CHK-10")!,
    ...patch,
  });

  it("says a task was closed as won't do, beside its stage", () => {
    backlog(issueWith({ wontDo: WONT_DO }));
    expect(screen.getByText("Won't do")).toBeInTheDocument();
  });

  it("says nothing for a task nobody marked", () => {
    backlog(issueWith({}));
    expect(screen.queryByText("Won't do")).toBeNull();
  });
});

describe("the Master list", () => {
  it("says which rows were closed as won't do, and only those", () => {
    rows = [row(1, { wontDo: true }), row(2)];
    render(<WorkTasks showProgram />);
    const closed = screen.getByText("Task 1").closest("li")!;
    expect(within(closed).getByText("Won't do")).toBeInTheDocument();
    const finished = screen.getByText("Task 2").closest("li")!;
    expect(within(finished).queryByText("Won't do")).toBeNull();
  });

  it("does not call a won't-do task finished in the Archive", () => {
    rows = [
      row(1, { wontDo: true, archivedBecause: "done" }),
      row(2, { archivedBecause: "done" }),
    ];
    render(<WorkTasks showProgram archive />);
    const closed = screen.getByText("Task 1").closest("li")!;
    expect(within(closed).getByText("Closed as won't do")).toBeInTheDocument();
    expect(within(closed).queryByText(/^Finished /)).toBeNull();
    const finished = screen.getByText("Task 2").closest("li")!;
    expect(within(finished).getByText(/^Finished /)).toBeInTheDocument();
  });
});

describe("reading a Master list row", () => {
  const wire = (over: Record<string, unknown> = {}) => ({
    id: "t1",
    key: "CNT-1",
    number: 1,
    type: "TASK",
    title: "Task 1",
    ...over,
  });

  it("reads the marker only when the API said true", () => {
    expect(toWorkRow(wire({ wontDo: true })).wontDo).toBe(true);
    expect(toWorkRow(wire({ wontDo: false })).wontDo).toBeUndefined();
    expect(toWorkRow(wire({ wontDo: "true" })).wontDo).toBeUndefined();
    expect(toWorkRow(wire()).wontDo).toBeUndefined();
  });
});

describe("counting finished tasks", () => {
  it("never counts a task closed as won't do as finished", () => {
    const list = [{ wontDo: WONT_DO }, {}, { wontDo: null }, { wontDo: true }];
    expect(finishedSplit(list)).toEqual({ finished: 2, wontDo: 2 });
  });

  it("is a plain number when nothing was closed as won't do, and words when something was", () => {
    expect(finishedMeta([{}, {}, {}])).toBe("3");
    expect(finishedMeta([])).toBe("0");
    expect(finishedMeta([{}, { wontDo: WONT_DO }])).toBe(
      "1 finished, 1 won't do",
    );
  });
});
