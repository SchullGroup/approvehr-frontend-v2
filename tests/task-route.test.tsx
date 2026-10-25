import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { TaskTarget } from "@/lib/api/projects";
import { people, sampleData } from "./projects-fixture";

/**
 * `/projects/tasks/:id`: any task, opened by id — where a notification about a
 * personal task points. A personal task opens in its drawer over the page, a
 * board task goes to its board, a task the reader only leads somebody on opens
 * read-only, and a task they cannot see is the app's not-found.
 */

const openTask = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects/tasks/x",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn() }),
}));

vi.mock("@/lib/api/projects", async (original) => {
  const real = await original<typeof import("@/lib/api/projects")>();
  return {
    ...real,
    projectsApi: {
      ...real.projectsApi,
      openTask: (...a: unknown[]) => openTask(...a),
    },
  };
});

vi.mock("@/components/projects/personal-issue-drawer", () => ({
  PersonalIssueDrawer: ({ issueId }: { issueId: string | null }) =>
    issueId ? <div role="dialog" aria-label={`Personal ${issueId}`} /> : null,
}));
vi.mock("@/components/projects/reduced-issue-drawer", () => ({
  ReducedIssueDrawer: ({
    detail,
    assigneeName,
  }: {
    detail: { issue: { key: string } } | null;
    assigneeName: string;
  }) =>
    detail ? (
      <div
        role="dialog"
        aria-label={`Reduced ${detail.issue.key} for ${assigneeName}`}
      />
    ) : null,
}));

vi.mock("@/lib/store/project-session", () => ({
  useProjectsGate: () => ({ enabled: true, loading: false }),
  usePeople: () => people,
}));

const { TaskScreen } =
  await import("@/app/(app)/projects/tasks/[id]/task-screen");

const issue = () => sampleData().issues.find((i) => i.key === "CHK-10")!;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("opening a task by id", () => {
  it("opens a personal task in its drawer", async () => {
    openTask.mockResolvedValue({
      kind: "personal",
      issue: { ...issue(), id: "t-1", key: "MY-4" },
    } satisfies TaskTarget);
    render(<TaskScreen id="t-1" />);
    expect(
      await screen.findByRole("dialog", { name: "Personal t-1" }),
    ).toBeInTheDocument();
    expect(openTask).toHaveBeenCalledWith("t-1", expect.anything());
  });

  it("sends a board task to its board", async () => {
    openTask.mockResolvedValue({
      kind: "board",
      projectId: "proj-1",
      key: "PAYV-12",
    } satisfies TaskTarget);
    render(<TaskScreen id="t-2" />);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/projects/proj-1?issue=PAYV-12"),
    );
  });

  it("opens a task the reader only leads somebody on, read-only", async () => {
    const row = { ...issue(), assigneeId: "p-03" };
    openTask.mockResolvedValue({
      kind: "reduced",
      issue: row,
      projectName: "Checkout",
      statusName: "In progress",
      statusCategory: "IN_PROGRESS",
      subtasks: [],
    } satisfies TaskTarget);
    render(<TaskScreen id="t-3" />);
    expect(
      await screen.findByRole("dialog", {
        name: "Reduced CHK-10 for Chidi Nwosu",
      }),
    ).toBeInTheDocument();
  });

  it("is the app's not-found when the task is not there for this reader", async () => {
    openTask.mockRejectedValue(
      new ApiError(404, "not_found", "That issue was not found."),
    );
    render(<TaskScreen id="nope" />);
    expect(
      await screen.findByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
  });
});
