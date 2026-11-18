import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProjectProvider,
  type ProjectContextValue,
} from "@/components/projects/project-context";
import { ApiError } from "@/lib/api/client";
import type { IssueThread, ProjectData } from "@/lib/projects/types";
import { contextFor, sampleData } from "./projects-fixture";

/**
 * Won't do and acceptance in the two drawers that can show them: the board's task drawer (which a
 * personal task's drawer wraps) and the leader's reduced view.
 *
 * What is proved: the section is drawn from what the task's own read says the reader may do and not
 * from anything the screen works out, so a thread that says nothing draws no buttons; a task's marks are
 * shown to anybody who can read it; the demo, which has no server to record anything, offers nothing;
 * the board reads the task and its thread again after a write whether it worked or not; a leader who is
 * not on the board can accept from the reduced view and is offered nothing else about the finish unless
 * the API said so; and none of it changes what the drawer already did.
 */

let thread: IssueThread = { comments: [], activity: [] };
const reloadThread = vi.hoisted(() => vi.fn());
const api = vi.hoisted(() => ({
  acceptTask: vi.fn(),
  withdrawAcceptance: vi.fn(),
  markWontDo: vi.fn(),
  takeBackWontDo: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/api/projects", async (original) => ({
  ...(await original<typeof import("@/lib/api/projects")>()),
  projectsApi: {
    links: vi.fn().mockResolvedValue([]),
    attachmentUrl: vi.fn().mockResolvedValue({ url: "blob:x", expiresAt: "" }),
    ...api,
  },
}));
vi.mock("@/lib/store/projects", () => ({
  useIssueThread: () => ({ thread, status: "ready", reload: reloadThread }),
}));
vi.mock("@/lib/store/project-session", () => ({
  useProjectActor: () => ({
    employeeId: "p-01",
    editRecords: false,
    leadsPeople: false,
    headsDepartment: false,
  }),
}));
vi.mock("@/lib/store/performance", () => ({
  useDemoObjectives: () => [],
  useKpis: () => ({
    goals: [],
    cascade: [],
    loading: false,
    error: null,
    source: "api",
    reload: vi.fn(),
  }),
}));

const { IssueDrawer } = await import("@/components/projects/issue-drawer");
const { ReducedIssueDrawer } =
  await import("@/components/projects/reduced-issue-drawer");
const { ToastProvider } = await import("@/components/ui");

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

function renderDrawer(
  overrides: Partial<ProjectContextValue> = {},
  issuePatch: Record<string, unknown> = {},
  data: ProjectData = sampleData(),
) {
  const ctx = contextFor(data, { connected: true, ...overrides });
  const issue = {
    ...data.issues.find((i) => i.key === "CHK-10")!,
    ...issuePatch,
  };
  render(
    <ToastProvider>
      <ProjectProvider value={ctx}>
        <IssueDrawer issue={issue} onClose={vi.fn()} />
      </ProjectProvider>
    </ToastProvider>,
  );
  return { ctx, issue };
}

const section = () => screen.queryByRole("region", { name: "How it finished" });

beforeEach(() => {
  vi.clearAllMocks();
  thread = { comments: [], activity: [] };
});

describe("the board's drawer", () => {
  it("draws no section for a task with no mark when the task's own read offers the reader nothing", () => {
    thread = { ...thread, canMarkWontDo: false, canAccept: false };
    renderDrawer();
    expect(section()).toBeNull();
  });

  it("draws no section when the thread says nothing at all about what the reader may do", () => {
    renderDrawer();
    expect(section()).toBeNull();
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Won't do…" })).toBeNull();
  });

  it("offers what the task's own read says the reader may do, and no more", () => {
    thread = { ...thread, canMarkWontDo: false, canAccept: true };
    renderDrawer();
    expect(section()).not.toBeNull();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Won't do…" })).toBeNull();
  });

  it("shows the marks a task carries, to a reader who may do nothing about them", () => {
    thread = { ...thread, canMarkWontDo: false, canAccept: false };
    renderDrawer({}, { wontDo: WONT_DO });
    expect(
      screen.getByText(/Closed as won't do by Adaeze Okonkwo on /),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The customer changed their mind"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /won't do/i })).toBeNull();
  });

  it("offers nothing in the demo, which has no server to record it, whatever a thread says", () => {
    thread = { ...thread, canMarkWontDo: true, canAccept: true };
    renderDrawer({ connected: false });
    expect(section()).toBeNull();
  });

  it("reads the task and its thread again after an accept that worked", async () => {
    thread = { ...thread, canAccept: true };
    api.acceptTask.mockResolvedValue({
      issue: { id: "x", key: "CHK-10", accepted: ACCEPTED },
      canMarkWontDo: false,
      canAccept: true,
    });
    const { ctx, issue } = renderDrawer();
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(api.acceptTask).toHaveBeenCalledWith(issue.id);
    await screen.findByText("CHK-10 accepted");
    expect(ctx.actions.refreshIssue).toHaveBeenCalledTimes(1);
    expect(ctx.actions.refreshIssue).toHaveBeenCalledWith(issue);
    expect(reloadThread).toHaveBeenCalledTimes(1);
  });

  it("reads them again after a refusal too, because what is on screen may be what is out of date", async () => {
    thread = { ...thread, canAccept: true };
    api.acceptTask.mockRejectedValue(
      new ApiError(409, "conflict", "It was reopened a moment ago."),
    );
    const { ctx } = renderDrawer();
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    await screen.findByText("It was reopened a moment ago.");
    expect(ctx.actions.refreshIssue).toHaveBeenCalledTimes(1);
    expect(reloadThread).toHaveBeenCalledTimes(1);
  });

  it("still shows the drawer's own parts", () => {
    thread = { ...thread, canAccept: true };
    renderDrawer();
    expect(screen.getByLabelText("Summary")).toBeInTheDocument();
    expect(screen.getByLabelText("Details")).toBeInTheDocument();
  });
});

describe("the facts beside a task that was closed as won't do", () => {
  const dt = (name: string) => screen.queryByText(name, { selector: "dt" });

  it("do not call it Done: it was not finished, so the row says Won't do and when", () => {
    thread = { ...thread, canMarkWontDo: false, canAccept: false };
    renderDrawer({}, { wontDo: WONT_DO, doneAt: "2026-11-10T10:00:00.000Z" });
    expect(dt("Done")).toBeNull();
    const row = dt("Won't do")!.closest("div")!;
    expect(row).toBeInTheDocument();
    expect(row).toHaveTextContent("10 Nov 2026");
  });

  it("still say Done, and when, for a task that was finished", () => {
    thread = { ...thread, canMarkWontDo: false, canAccept: false };
    renderDrawer({}, { doneAt: "2026-11-10T10:00:00.000Z" });
    const row = dt("Done")!.closest("div")!;
    expect(row).toHaveTextContent("10 Nov 2026");
    expect(dt("Won't do")).toBeNull();
  });

  it("say Done for a task whose server sent no won't-do mark at all: absent makes no claim", () => {
    thread = { ...thread, canMarkWontDo: false, canAccept: false };
    renderDrawer({}, { doneAt: "2026-11-10T10:00:00.000Z", wontDo: undefined });
    expect(dt("Done")).not.toBeNull();
  });
});

describe("the leader's reduced view", () => {
  const detail = (over: Record<string, unknown> = {}) => {
    const issue = sampleData().issues.find((i) => i.key === "CHK-10")!;
    return {
      issue,
      projectName: "Checkout",
      statusName: "Done",
      statusCategory: "DONE" as const,
      subtasks: [],
      ...over,
    };
  };
  const mount = (over: Record<string, unknown> = {}) =>
    render(
      <ToastProvider>
        <ReducedIssueDrawer
          detail={detail(over)}
          assigneeName="Chidi Nwosu"
          onClose={vi.fn()}
        />
      </ToastProvider>,
    );

  it("lets a leader off the board accept, when the API says they may", async () => {
    api.acceptTask.mockResolvedValue({
      issue: { id: "x", key: "CHK-10", accepted: ACCEPTED },
      canMarkWontDo: false,
      canAccept: true,
    });
    mount({ canAccept: true, canMarkWontDo: false });
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByText("CHK-10 accepted")).toBeInTheDocument();
    /* Nothing re-reads for them, so it is shown from what the server answered. */
    expect(
      screen.getByText(/Accepted by Adaeze Okonkwo on /),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Take back acceptance" }),
    ).toBeInTheDocument();
  });

  it("offers a leader nothing about the finish when the API did not say they may", () => {
    mount();
    expect(section()).toBeNull();
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Won't do…" })).toBeNull();
  });

  it("says who closed it as won't do and when, and nothing about why: a leader's read carries no reason", () => {
    mount({
      issue: {
        ...detail().issue,
        wontDo: {
          at: WONT_DO.at,
          byId: WONT_DO.byId,
          byName: WONT_DO.byName,
          reason: null,
        },
      },
    });
    expect(
      screen.getByText(/Closed as won't do by Adaeze Okonkwo on /),
    ).toBeInTheDocument();
    expect(screen.queryByText(/changed their mind/)).toBeNull();
    const finish = screen.getByRole("region", { name: "How it finished" });
    expect(finish.querySelectorAll("p")).toHaveLength(1);
  });

  it("shows the marks the task carries, and still says why the leader is seeing it", () => {
    mount({ issue: { ...detail().issue, accepted: ACCEPTED } });
    expect(
      screen.getByText(/Accepted by Adaeze Okonkwo on /),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You can see this because Chidi Nwosu is in your team."),
    ).toBeInTheDocument();
  });
});
