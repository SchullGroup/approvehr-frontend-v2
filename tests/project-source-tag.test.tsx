import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
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
let logged: ApiTask[] = [];

vi.mock("@/lib/store/performance", () => ({
  useTasksForGrading: () => ({
    tasks: queue,
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

const SOURCE: ApiProjectSource = { key: "CHK-2", projectId: "p-chk" };
const HREF = "/projects/p-chk?issue=CHK-2";

beforeEach(() => {
  gate = { enabled: true, loading: false };
  actor = { employeeId: "e-reader", editRecords: false };
  myProjects = [];
  queue = [];
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

  it("says Personal, never a link, for a task on somebody's own list", () => {
    actor = { employeeId: "e-hr", editRecords: true };
    render(<ProjectSourceTag source={{ key: "MY-3", projectId: "p-mine" }} />);
    expect(screen.getByText("Personal")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(listRequested).not.toHaveBeenCalled();
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
