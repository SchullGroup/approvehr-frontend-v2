import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProjectProvider,
  type ProjectContextValue,
} from "@/components/projects/project-context";
import { ApiError } from "@/lib/api/client";
import type { ApiGoal } from "@/lib/api/performance";
import { toLeaderRead } from "@/lib/api/projects";
import type { Issue, IssueThread } from "@/lib/projects/types";
import { contextFor, sampleData } from "./projects-fixture";
import { linkedTo } from "./support/objective-fixtures";

/**
 * Who is offered the link on a task, person by person.
 *
 * The API says (`canLinkObjective`) and the screen believes it: the assignee,
 * the project's lead, the assignee's manager and department head, and HR are
 * offered the picker; a plain member who is not on the task, a Program reader and
 * a holder of the company-wide grant are drawn the one neutral line and no
 * control at all. A leader who is not on the project reads the reduced view and
 * links from there.
 */

let thread: IssueThread = { comments: [], activity: [] };
const actor = vi.hoisted(() => ({
  employeeId: "p-03" as string | null,
  editRecords: false,
  leadsPeople: false,
  headsDepartment: false,
}));
const setObjective = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());

vi.mock("@/lib/store/project-session", () => ({
  useProjectActor: () => actor,
}));
vi.mock("@/lib/store/projects", () => ({
  useIssueThread: () => ({ thread, status: "ready", reload: vi.fn() }),
}));
vi.mock("@/lib/api/projects", async (original) => ({
  ...(await original<typeof import("@/lib/api/projects")>()),
  projectsApi: {
    links: vi.fn().mockResolvedValue([]),
    setObjective: (...a: unknown[]) => setObjective(...a),
  },
}));
vi.mock("@/components/ui", async (original) => ({
  ...(await original<typeof import("@/components/ui")>()),
  useToast: () => ({ push: toast }),
}));
vi.mock("@/lib/store/performance", () => ({
  useDemoObjectives: () => [],
  useKpis: () => ({
    goals: [
      {
        id: "g1",
        title: "Grow revenue",
        ownerId: null,
        level: "company",
        status: "ON_TRACK",
        keyResults: [],
      },
    ] as unknown as ApiGoal[],
    cascade: [],
    loading: false,
    error: null,
    source: "api",
    reload: vi.fn(),
  }),
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ flat: [] }),
}));
vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const { IssueDrawer } = await import("@/components/projects/issue-drawer");
const { ReducedIssueDrawer } =
  await import("@/components/projects/reduced-issue-drawer");

const LABEL = "Link to an objective (optional)";

const theirs = () => {
  const data = sampleData();
  const issue = data.issues.find(
    (i) => i.assigneeId === "p-03" && i.type === "TASK" && i.goalId === null,
  )!;
  return { data, issue };
};

function drawer(
  persona: Partial<ProjectContextValue>,
  canLinkObjective: boolean | undefined,
  issueOver: Partial<Issue> = {},
) {
  const { data, issue } = theirs();
  thread = {
    comments: [],
    activity: [],
    ...(canLinkObjective === undefined ? {} : { canLinkObjective }),
  };
  const withIssue = { ...issue, ...issueOver };
  const ctx = contextFor(
    {
      ...data,
      issues: data.issues.map((i) => (i.id === issue.id ? withIssue : i)),
    },
    { connected: true, ...persona },
  );
  render(
    <ProjectProvider value={ctx}>
      <IssueDrawer issue={withIssue} onClose={vi.fn()} />
    </ProjectProvider>,
  );
}

beforeEach(() => {
  actor.employeeId = "p-03";
  actor.editRecords = false;
  setObjective.mockReset();
  toast.mockReset();
});

const picker = () => screen.queryByRole("combobox", { name: LABEL });

describe("the task drawer, person by person", () => {
  it.each([
    ["the assignee", { meId: "p-03", canManage: false }, true],
    ["the project's lead", { meId: "p-01", canManage: true }, true],
    [
      "the assignee's manager, on the project",
      { meId: "p-77", canManage: false },
      true,
    ],
    [
      "the assignee's department head, on the project",
      { meId: "p-78", canManage: false },
      true,
    ],
    ["HR", { meId: "p-79", canManage: false }, true],
  ])(
    "%s is offered the picker, because the API says so",
    (_who, persona, may) => {
      drawer(persona, may);
      expect(picker()).toBeInTheDocument();
    },
  );

  it.each([
    [
      "a plain member who is not on the task",
      { meId: "p-09", canManage: false },
    ],
    [
      "a Program Read person",
      { meId: "p-10", canManage: false, canWork: false },
    ],
    [
      "a holder of the company-wide grant",
      { meId: "p-11", canManage: false, canWork: false },
    ],
  ])(
    "%s is offered nothing, not even a switched-off control",
    (_who, persona) => {
      drawer(persona, false);
      expect(picker()).toBeNull();
      expect(screen.queryByText(LABEL)).toBeNull();
    },
  );

  it("a Program reader is told nothing's wrong when the task is not linked, and is not offered it", () => {
    drawer({ meId: "p-10", canManage: false, canWork: false }, undefined);
    expect(picker()).toBeNull();
    expect(
      screen.queryByText(
        /^Linked (to|objective)|not linked to an objective|missing/i,
      ),
    ).toBeNull();
  });

  it("is told the one neutral line when linked, with no control", () => {
    drawer({ meId: "p-09", canManage: false }, false, {
      goalId: "g1",
      objective: linkedTo("Grow revenue"),
    });
    expect(screen.getByText("Linked to Grow revenue")).toBeInTheDocument();
    expect(picker()).toBeNull();
  });

  it("the API's no beats the assignee's own claim, even where the rule would say yes", () => {
    drawer({ meId: "p-03", canManage: false }, false);
    expect(picker()).toBeNull();
  });
});

describe("a leader who is not on the project", () => {
  const read = (canLinkObjective: boolean, objective = {}) =>
    toLeaderRead({
      reduced: true,
      id: "i1",
      key: "OPS-7",
      title: "Sort the rota",
      projectId: "p9",
      projectName: "Operations",
      statusName: "Doing",
      statusCategory: "IN_PROGRESS",
      goalId: null,
      keyResultId: null,
      canLinkObjective,
      objective,
      assigneeId: "p-03",
      assigneeIds: ["p-03"],
      subtasks: [],
    });

  const mount = (canLink: boolean, objective = {}) => {
    const detail = read(canLink, objective);
    if (!detail.reduced) throw new Error("expected the reduced read");
    render(
      <ReducedIssueDrawer
        detail={detail}
        assigneeName="Chidi Nwosu"
        onClose={vi.fn()}
      />,
    );
  };

  it("is offered the picker when the API says they may link it", () => {
    mount(true);
    expect(picker()).toBeInTheDocument();
  });

  it("is offered nothing when the API says they may not", () => {
    mount(false);
    expect(picker()).toBeNull();
  });

  it("links through the objective-only endpoint, and says it only after it answered", async () => {
    setObjective.mockResolvedValue({
      id: "i1",
      key: "OPS-7",
      goalId: "g1",
      keyResultId: null,
      objective: linkedTo("Grow revenue"),
      changed: true,
    });
    mount(true);
    await userEvent.selectOptions(picker()!, "Grow revenue (Company)");
    expect(setObjective).toHaveBeenCalledWith("i1", {
      goalId: "g1",
      keyResultId: null,
    });
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          tone: "success",
          title: "OPS-7 linked to Grow revenue",
        }),
      ),
    );
    expect(screen.getByText("Linked to Grow revenue")).toBeInTheDocument();
  });

  it("says a real refusal in the API's words, and says nothing was linked", async () => {
    setObjective.mockRejectedValue(
      new ApiError(
        403,
        "forbidden",
        "Only the people this task counts for can link it.",
      ),
    );
    mount(true);
    await userEvent.selectOptions(picker()!, "Grow revenue (Company)");
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          tone: "danger",
          title: "Could not update OPS-7",
          detail: "Only the people this task counts for can link it.",
        }),
      ),
    );
    expect(toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ tone: "success" }),
    );
  });

  it("reads the link the API describes, without a picker for somebody who may not change it", () => {
    mount(false, linkedTo("Grow revenue"));
    expect(screen.getByText("Linked to Grow revenue")).toBeInTheDocument();
    expect(picker()).toBeNull();
  });

  it("says nothing about a task that is not linked", () => {
    mount(false, { state: "UNLINKED", message: "Not linked to an objective" });
    expect(
      screen.queryByText(/^Linked (to|objective)|not linked to an objective/i),
    ).toBeNull();
  });
});
