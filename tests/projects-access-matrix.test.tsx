import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProjectProvider,
  type ProjectContextValue,
} from "@/components/projects/project-context";
import type { IssueThread, ProjectData } from "@/lib/projects/types";
import {
  contextFor,
  fakeActions,
  people,
  sampleData,
} from "./projects-fixture";

/**
 * What each level of access sees across the project screen, enumerated.
 *
 * READ (a program's read access, or the Master grant) reads everything and
 * changes nothing: so every control that makes a change is **absent**, not
 * greyed out: no new task, no drag or move, no composer, no comment edit or
 * delete, no follow, no sub-task or link, no cycle buttons, no Settings tab. WRITE
 * (a member, or a program's read and write) works the tasks but not the
 * project's settings. MANAGE has it all.
 *
 * Each view is rendered at each level and its interactive controls are listed, so
 * a mutator added later without a gate shows up here by name.
 */

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => search,
  usePathname: () => "/projects/pj-chk",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ flat: [] }),
}));
vi.mock("@/lib/api/projects", async (original) => ({
  ...(await original<typeof import("@/lib/api/projects")>()),
  projectsApi: {
    links: vi.fn().mockResolvedValue([]),
    removeLink: vi.fn().mockResolvedValue(undefined),
  },
}));

const thread: IssueThread = {
  comments: [
    {
      id: "c1",
      issueId: "x",
      authorId: "p-01",
      body: "Looks right to me.",
      editedAt: null,
      createdAt: "2026-10-14T10:00:00.000Z",
    },
  ],
  activity: [],
  watchers: [{ id: "p-03", name: "Chidi Nwosu" }],
  watching: false,
  canManageWatchers: false,
  canAttachToTask: false,
};
vi.mock("@/lib/store/projects", () => ({
  useIssueThread: () => ({ thread, status: "ready", reload: vi.fn() }),
}));
vi.mock("@/lib/store/project-session", () => ({
  useProjectActor: () => ({
    employeeId: "p-01",
    editRecords: false,
    leadsPeople: true,
    headsDepartment: false,
  }),
  usePeople: () => people,
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: true, actingId: "p-01" }),
  useOrgTimezone: () => "Africa/Lagos",
}));

const { BoardView } = await import("@/app/(app)/projects/[id]/board-view");
const { BacklogView } = await import("@/app/(app)/projects/[id]/backlog-view");
const { IssuesView } = await import("@/app/(app)/projects/[id]/issues-view");
const { RoadmapView } = await import("@/app/(app)/projects/[id]/roadmap-view");
const { IssueDrawer } = await import("@/components/projects/issue-drawer");

type Level = "READ" | "WRITE" | "MANAGE";
const level = (access: Level): Partial<ProjectContextValue> => ({
  canWork: access !== "READ",
  canManage: access === "MANAGE",
});

/** What a control is called, to a person or to a screen reader. */
function nameOf(el: Element): string {
  return (
    el.getAttribute("aria-label") ||
    (el as HTMLInputElement).placeholder ||
    el.textContent?.trim() ||
    ""
  );
}

/** Everything in a view that can be pressed, typed into or picked from. */
function controls(root: ParentNode) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      "button, input, select, textarea, [draggable=true], [role=menuitem], [contenteditable=true]",
    ),
  ).map((el) => ({
    tag: el.tagName.toLowerCase(),
    name: nameOf(el),
    disabled: el.hasAttribute("disabled"),
  }));
}

/**
 * A control that opens a task is named for the task ("Add 3DS test cards to the QA
 * plan"), and a task's title may start with any word. Those are not controls that
 * change anything.
 */
const isTask = (name: string) =>
  sampleData().issues.some((i) => name.includes(i.title.slice(0, 24))) ||
  /^[A-Z]+-\d+/.test(name);

/** The names of controls that change something. None may exist at READ. */
const MUTATES =
  /^(new |create |add |move |start |complete |edit |delete |remove |send$|link$|follow$|unfollow$|take |save |attach|plan |drag)/i;

describe("READ: every view draws no control that changes anything", () => {
  const views = {
    Board: BoardView,
    Plan: BacklogView,
    Tasks: IssuesView,
    Timeline: RoadmapView,
  } as const;

  it.each(Object.entries(views))("%s", (_name, View) => {
    const ctx = contextFor(sampleData(), level("READ"));
    const { container } = render(
      <ProjectProvider value={ctx}>
        <View />
      </ProjectProvider>,
    );
    const found = controls(container).filter(
      (c) => MUTATES.test(c.name) && !isTask(c.name),
    );
    expect(found).toEqual([]);
    expect(container.querySelectorAll("[draggable=true]")).toHaveLength(0);
  });

  it("the task drawer: fields are shown, never offered", () => {
    const data = sampleData();
    const ctx = contextFor(data, level("READ"));
    render(
      <ProjectProvider value={ctx}>
        <IssueDrawer
          issue={data.issues.find((i) => i.key === "CHK-10")!}
          onClose={vi.fn()}
        />
      </ProjectProvider>,
    );
    const dialog = screen.getByRole("dialog");
    const all = controls(dialog);
    expect(
      all.filter((c) => MUTATES.test(c.name) && !isTask(c.name) && !c.disabled),
    ).toEqual([]);
    /* Every field is there to read, and none is an editor, not even a switched-off
       one: a person without the right is shown values, never a greyed control. */
    expect(
      all.filter((c) => ["input", "select", "textarea"].includes(c.tag)),
    ).toEqual([]);
    expect(all.filter((c) => c.disabled)).toEqual([]);
    /* The comment is readable, and neither its author nor anybody can edit it. */
    expect(
      within(dialog).getByRole("tab", { name: /Comments/ }),
    ).toBeInTheDocument();
  });

  it("a comment's own author cannot edit or delete it, and cannot follow", async () => {
    const data = sampleData();
    const ctx = { ...contextFor(data, level("READ")), connected: true };
    render(
      <ProjectProvider value={ctx}>
        <IssueDrawer
          issue={data.issues.find((i) => i.key === "CHK-10")!}
          onClose={vi.fn()}
        />
      </ProjectProvider>,
    );
    await userEvent.click(screen.getByRole("tab", { name: /Comments/ }));
    expect(screen.getByText("Looks right to me.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Follow" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Unfollow" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Add a comment")).not.toBeInTheDocument();
  });
});

describe("WRITE: works the tasks, not the project", () => {
  it("offers a task's controls", async () => {
    const data = sampleData();
    const ctx = { ...contextFor(data, level("WRITE")), connected: true };
    render(
      <ProjectProvider value={ctx}>
        <IssueDrawer
          issue={data.issues.find((i) => i.key === "CHK-10")!}
          onClose={vi.fn()}
        />
      </ProjectProvider>,
    );
    await userEvent.click(screen.getByRole("tab", { name: /Comments/ }));
    expect(screen.getByLabelText("Add a comment")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Follow" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete this task" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add subtask" }),
    ).toBeInTheDocument();
  });

  it("moves cards on the board, and can plan a cycle, but starts and completes none", () => {
    const ctx = contextFor(sampleData(), level("WRITE"));
    const { container } = render(
      <ProjectProvider value={ctx}>
        <BoardView />
      </ProjectProvider>,
    );
    expect(controls(container).some((c) => /^Move CHK-/.test(c.name))).toBe(
      true,
    );
    const plan = render(
      <ProjectProvider value={ctx}>
        <BacklogView />
      </ProjectProvider>,
    );
    const names = controls(plan.container).map((c) => c.name);
    /* Making a cycle is open to anybody who can work in the project (the API's
       door is "write"); starting, completing, editing and deleting one are the
       lead's. */
    expect(names.some((n) => /start cycle|complete cycle/i.test(n))).toBe(
      false,
    );
    expect(names.some((n) => /^new cycle/i.test(n))).toBe(true);
  });
});

describe("MANAGE: has it all", () => {
  it("can start a cycle from Plan", () => {
    const ctx = contextFor(sampleData(), level("MANAGE"));
    const { container } = render(
      <ProjectProvider value={ctx}>
        <BacklogView />
      </ProjectProvider>,
    );
    const names = controls(container).map((c) => c.name);
    expect(names.some((n) => /start cycle|complete cycle/i.test(n))).toBe(true);
  });
});

/* ---------------------------------------------------- the project screen -- */

describe("the project screen around the views", () => {
  const view = vi.hoisted(() => ({ data: null as unknown as ProjectData }));
  const programs = vi.hoisted(() => ({
    list: [] as { id: string; name: string }[],
  }));

  beforeEach(() => {
    search = new URLSearchParams();
  });

  async function screenFor(
    access: Level | null,
    over: Partial<ProjectData["project"]> = {},
    programList: { id: string; name: string }[] = [],
  ) {
    vi.resetModules();
    view.data = sampleData();
    view.data.project = {
      ...view.data.project,
      programId: "pg-ops",
      programName: "Operations",
      access,
      ...over,
    };
    programs.list = programList;
    vi.doMock("@/lib/store/projects", () => ({
      useProjectData: () => ({
        status: "ready",
        error: null,
        data: view.data,
        capped: false,
        reload: vi.fn(),
      }),
      useProjectActions: () => fakeActions(),
      useIssueThread: () => ({ thread, status: "ready", reload: vi.fn() }),
    }));
    vi.doMock("@/lib/store/project-session", () => ({
      useProjectsGate: () => ({ enabled: true, loading: false }),
      usePeople: () => people,
      useProjectActor: () => ({
        employeeId: "p-01",
        editRecords: false,
        leadsPeople: true,
        headsDepartment: false,
      }),
    }));
    vi.doMock("@/lib/store/programs", () => ({
      useProgramFacts: () => ({ facts: null, seesAll: false }),
      useProgramList: () => ({
        status: "ready",
        error: null,
        data: { programs: programs.list, canCreate: false, seesAll: false },
        reload: vi.fn(),
      }),
    }));
    const { ProjectScreen } =
      await import("@/app/(app)/projects/[id]/project-screen");
    return render(<ProjectScreen id="pj-chk" />);
  }

  const tabs = () =>
    Array.from(document.querySelectorAll("nav.scroll-x a")).map(
      (a) => a.textContent,
    );

  it("READ: a quiet line, no New task, no Settings tab", async () => {
    await screenFor("READ");
    expect(
      screen.getByText(
        "You can view this project. Ask its lead for write access.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "New task" }),
    ).not.toBeInTheDocument();
    expect(tabs()).toEqual(["Board", "Plan", "Timeline", "Progress", "Tasks"]);
  });

  it("WRITE: New task, no banner, no Settings tab", async () => {
    await screenFor("WRITE");
    expect(
      screen.getByRole("button", { name: "New task" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Ask its lead for write access/),
    ).not.toBeInTheDocument();
    expect(tabs()).not.toContain("Settings");
  });

  it("MANAGE: the Settings tab too", async () => {
    await screenFor("MANAGE");
    expect(tabs()).toContain("Settings");
  });

  it("opens the board for a link to Settings that the person may not have", async () => {
    search = new URLSearchParams("view=settings");
    await screenFor("WRITE");
    expect(screen.queryByText("Workflow")).not.toBeInTheDocument();
    expect(document.querySelector("[aria-current=page]")?.textContent).toBe(
      "Board",
    );
  });

  it("names the program above the project, as a link", async () => {
    await screenFor("MANAGE");
    const crumb = screen.getAllByRole("link", { name: /Operations/ })[0]!;
    expect(crumb).toHaveAttribute("href", "/projects/programs/pg-ops");
  });

  it("says Unassigned above a project in no program, when the company has programs", async () => {
    await screenFor("MANAGE", { programId: null, programName: null }, [
      { id: "pg-ops", name: "Operations" },
    ]);
    const crumb = screen.getAllByRole("link", { name: /Unassigned/ })[0]!;
    expect(crumb).toHaveAttribute("href", "/projects/programs/unassigned");
  });

  it("says nothing about programs in a company with none", async () => {
    await screenFor("MANAGE", { programId: null, programName: null }, []);
    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: /Unassigned/ }),
      ).not.toBeInTheDocument(),
    );
  });
});
