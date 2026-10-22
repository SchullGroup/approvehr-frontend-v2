import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiMyTask,
  ApiProjectSource,
  ApiTask,
  ApiTaskForGrading,
} from "@/lib/api/performance";

/**
 * "From project CHK-2", on a weekly task a finished issue filed.
 *
 * It is on the employee's own weeks, in an objective's task log and in the
 * grading queue. What matters most is when it is a link: the API says which
 * project a task came from and nothing about whether the reader may open it, and
 * a reviewer is not necessarily on the project. A link that lands on "this
 * project is not here" is worse than text.
 */

let gate = { enabled: true, loading: false };
let actor = { employeeId: "e-reader", editRecords: false };
let myProjects: { id: string }[] = [];
const listRequested = vi.fn();

vi.mock("@/lib/store/project-session", () => ({
  useProjectsGate: () => gate,
  useProjectActor: () => actor,
}));
vi.mock("@/lib/store/projects", () => ({
  useProjectList: (scope: string) => {
    listRequested(scope);
    return {
      status: "ready",
      error: null,
      projects: myProjects,
      reload: vi.fn(),
    };
  },
}));

let queue: ApiTaskForGrading[] = [];
let mine: ApiMyTask[] = [];
let logged: ApiTask[] = [];

vi.mock("@/lib/store/performance", () => ({
  useTasksForGrading: () => ({
    tasks: queue,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useMyTasks: () => ({
    tasks: mine,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useGoalTasks: () => ({
    tasks: logged,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useKpis: () => ({ goals: [], loading: false }),
  useTaskActions: () => ({
    editable: true,
    submitTask: vi.fn(),
    gradeTask: vi.fn(),
  }),
}));

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ actingId: "e-reader", isConnected: true }),
}));

const { ProjectSourceTag } =
  await import("@/components/projects/project-source-tag");
const { ReviewTasksTab } = await import("@/app/(app)/performance/review-tasks");
const { MyTasksPanel } = await import("@/app/(app)/performance/my-tasks");
const { TaskLogPanel } = await import("@/app/(app)/performance/task-log");

const SOURCE: ApiProjectSource = { key: "CHK-2", projectId: "p-chk" };
const HREF = "/projects/p-chk?issue=CHK-2";

beforeEach(() => {
  gate = { enabled: true, loading: false };
  actor = { employeeId: "e-reader", editRecords: false };
  myProjects = [];
  queue = [];
  mine = [];
  logged = [];
  listRequested.mockClear();
});

describe("the tag", () => {
  it("says which issue the task came from", () => {
    render(<ProjectSourceTag source={SOURCE} />);
    expect(screen.getByText("From project CHK-2")).toBeInTheDocument();
  });

  it("is absent for a task nobody filed from a project", () => {
    const { container } = render(<ProjectSourceTag source={null} />);
    expect(container).toBeEmptyDOMElement();
    const { container: older } = render(
      <ProjectSourceTag source={undefined} />,
    );
    expect(older).toBeEmptyDOMElement();
  });

  it("is absent when what came back is not a key", () => {
    const { container } = render(
      <ProjectSourceTag source={{ key: "", projectId: "p-chk" }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  describe("when it is a link", () => {
    it("links for a member or the lead, who have the project in their own list", () => {
      myProjects = [{ id: "p-chk" }];
      render(<ProjectSourceTag source={SOURCE} />);
      expect(
        screen.getByRole("link", { name: "From project CHK-2" }),
      ).toHaveAttribute("href", HREF);
    });

    it("links for somebody who manages records, who can open every project", () => {
      actor = { employeeId: "e-hr", editRecords: true };
      render(<ProjectSourceTag source={SOURCE} />);
      expect(
        screen.getByRole("link", { name: "From project CHK-2" }),
      ).toHaveAttribute("href", HREF);
    });

    it("is text for a reviewer who is not on the project", () => {
      myProjects = [{ id: "p-other" }];
      render(<ProjectSourceTag source={SOURCE} />);
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.getByText("From project CHK-2")).toBeInTheDocument();
    });

    it("is text once the project or the issue is deleted, whoever is looking", () => {
      actor = { employeeId: "e-hr", editRecords: true };
      render(<ProjectSourceTag source={{ key: "CHK-2", projectId: null }} />);
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.getByText("From project CHK-2")).toBeInTheDocument();
    });

    it("is text when the company has Projects switched off, and asks for no list", () => {
      gate = { enabled: false, loading: false };
      myProjects = [{ id: "p-chk" }];
      render(<ProjectSourceTag source={SOURCE} />);
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(listRequested).not.toHaveBeenCalled();
    });

    it("is text until the flags have answered", () => {
      gate = { enabled: false, loading: true };
      render(<ProjectSourceTag source={SOURCE} />);
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("asks for the viewer's own projects, not the company's", () => {
      render(<ProjectSourceTag source={SOURCE} />);
      expect(listRequested).toHaveBeenCalledWith("mine");
    });

    it("asks for nothing when there is no project to ask about", () => {
      render(<ProjectSourceTag source={{ key: "CHK-2", projectId: null }} />);
      render(<ProjectSourceTag source={null} />);
      expect(listRequested).not.toHaveBeenCalled();
    });
  });

  it("carries its meaning in text, not in the icon", () => {
    myProjects = [{ id: "p-chk" }];
    render(<ProjectSourceTag source={SOURCE} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAccessibleName("From project CHK-2");
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("where the tag shows", () => {
  beforeEach(() => {
    myProjects = [{ id: "p-chk" }];
  });

  const forGrading = (
    id: string,
    projectSource?: ApiProjectSource | null,
  ): ApiTaskForGrading => ({
    id,
    employeeId: "e2",
    employeeName: "Chidi Nwosu",
    goalId: "g1",
    goalTitle: "Lift checkout conversion",
    description: `Task ${id}`,
    createdAt: "2026-10-14T09:00:00.000Z",
    ...(projectSource !== undefined ? { projectSource } : {}),
  });

  it("is on a task in the grading table and in the phone list", () => {
    queue = [forGrading("t1", SOURCE), forGrading("t2")];
    render(<ReviewTasksTab />);
    const table = screen.getByRole("table");
    expect(
      within(table).getByRole("link", { name: "From project CHK-2" }),
    ).toHaveAttribute("href", HREF);
    /* Only the one task has it. The phone list renders beside the table. */
    expect(
      screen.getAllByRole("link", { name: "From project CHK-2" }),
    ).toHaveLength(2);
    expect(screen.getAllByText("Task t2")).toHaveLength(2);
  });

  it("is on the employee's own weeks, beside the objective", () => {
    mine = [
      {
        id: "t1",
        goalId: "g1",
        goalTitle: "Lift checkout conversion",
        keyResultId: null,
        description: "CHK-2 3-D Secure, from project Checkout Revamp",
        grade: null,
        gradeNote: null,
        gradedAt: null,
        weekStart: "2026-10-12T00:00:00.000Z",
        weekEnd: "2026-10-18T00:00:00.000Z",
        createdAt: "2026-10-14T09:00:00.000Z",
        projectSource: SOURCE,
      },
      {
        id: "t2",
        goalId: "g1",
        goalTitle: "Lift checkout conversion",
        keyResultId: null,
        description: "Wrote the runbook",
        grade: null,
        gradeNote: null,
        gradedAt: null,
        weekStart: "2026-10-12T00:00:00.000Z",
        weekEnd: "2026-10-18T00:00:00.000Z",
        createdAt: "2026-10-14T10:00:00.000Z",
        projectSource: null,
      },
    ];
    render(<MyTasksPanel />);
    expect(screen.getAllByText(/^From project/)).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "From project CHK-2" }),
    ).toHaveAttribute("href", HREF);
  });

  it("is in an objective's task log", () => {
    logged = [
      {
        id: "t1",
        periodId: "p1",
        goalId: "g1",
        keyResultId: null,
        employeeId: "e1",
        description: "CHK-2 3-D Secure, from project Checkout Revamp",
        grade: null,
        gradeNote: null,
        gradedById: null,
        gradedAt: null,
        createdAt: "2026-10-14T09:00:00.000Z",
        projectSource: SOURCE,
      },
    ];
    render(<TaskLogPanel goalId="g1" keyResults={[]} />);
    expect(
      screen.getByRole("link", { name: "From project CHK-2" }),
    ).toHaveAttribute("href", HREF);
  });

  it("is plain text for a reviewer who is not on the project", () => {
    myProjects = [];
    queue = [forGrading("t1", SOURCE)];
    render(<ReviewTasksTab />);
    expect(screen.queryByRole("link", { name: /From project/ })).toBeNull();
    expect(screen.getAllByText("From project CHK-2").length).toBeGreaterThan(0);
  });
});
