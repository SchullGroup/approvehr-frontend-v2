import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { Issue } from "@/lib/projects/types";
import { people, sampleData } from "./projects-fixture";

/**
 * Won't do and acceptance on a task on somebody's own list, opened from My tasks.
 *
 * What is proved: the list behind the drawer (which is where the count "1 finished, 1 won't do" and the
 * row's tag are drawn) is told to read again after a finish mark is written, accepted or refused, the
 * way it already is after any other save; and it is not told when the task could not be read again,
 * because then nothing is known to have changed.
 */

const reloadThread = vi.hoisted(() => vi.fn());
const api = vi.hoisted(() => ({
  personalTask: vi.fn(),
  getIssue: vi.fn(),
  markWontDo: vi.fn(),
  acceptTask: vi.fn(),
  updateIssue: vi.fn(),
}));
const thread = vi.hoisted(() => ({
  canMarkWontDo: true,
  canAccept: false,
}));
const actor = vi.hoisted(() => ({
  employeeId: "p-01" as string | null,
  editRecords: false,
  leadsPeople: false,
  headsDepartment: false,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/components/ui", async (original) => ({
  ...(await original<typeof import("@/components/ui")>()),
  useToast: () => ({ push: vi.fn() }),
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
  useIssueThread: () => ({
    thread: { comments: [], activity: [], ...thread },
    status: "ready",
    reload: reloadThread,
  }),
}));
vi.mock("@/lib/store/project-session", () => ({
  useProjectActor: () => actor,
  usePeople: () => people,
}));

const { PersonalIssueDrawer } =
  await import("@/components/projects/personal-issue-drawer");

const board = sampleData();
const statuses = board.project.statuses;
const done = statuses.find((s) => s.category === "DONE")!;

const finished = (): Issue => ({
  ...board.issues.find((i) => i.key === "CHK-10")!,
  id: "t-1",
  key: "MY-4",
  title: "Book the dentist",
  description: "",
  statusId: done.id,
  doneAt: "2026-11-10T10:00:00.000Z",
  labels: [],
  assigneeId: "p-01",
  reporterId: "p-01",
  parentId: null,
  epicId: null,
  sprintId: null,
});

const WONT_DO = {
  at: "2026-11-11T09:00:00.000Z",
  byId: "p-01",
  byName: "Ada",
  reason: "Replaced by the new import",
};
const ACCEPTED = {
  at: "2026-11-11T09:00:00.000Z",
  byId: "p-09",
  byName: "Emeka",
};

const mount = () => {
  const onChanged = vi.fn();
  render(
    <PersonalIssueDrawer
      issueId="t-1"
      issues={[finished()]}
      onClose={vi.fn()}
      onChanged={onChanged}
    />,
  );
  return { onChanged };
};

const closeAsWontDo = async () => {
  await userEvent.click(
    await screen.findByRole("button", { name: "Won't do…" }),
  );
  await userEvent.type(
    await screen.findByLabelText(/Why is it not being done/),
    "Replaced by the new import",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Close as won't do" }),
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  thread.canMarkWontDo = true;
  thread.canAccept = false;
  api.personalTask.mockResolvedValue({
    issue: finished(),
    statusName: "Done",
    statusCategory: "DONE",
    statuses,
    canEditDetails: true,
  });
  api.markWontDo.mockResolvedValue({
    issue: { ...finished(), wontDo: WONT_DO },
    canMarkWontDo: true,
    canAccept: false,
  });
  api.acceptTask.mockResolvedValue({
    issue: { ...finished(), accepted: ACCEPTED },
    canMarkWontDo: false,
    canAccept: true,
  });
  api.getIssue.mockResolvedValue({ ...finished(), wontDo: WONT_DO });
});

describe("the list behind a personal task's drawer", () => {
  it("is told to read again after the task is closed as won't do", async () => {
    const { onChanged } = mount();
    await closeAsWontDo();
    await waitFor(() => expect(api.markWontDo).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(api.getIssue).toHaveBeenCalledWith("t-1");
  });

  it("is told after an acceptance too", async () => {
    thread.canMarkWontDo = false;
    thread.canAccept = true;
    api.getIssue.mockResolvedValue({ ...finished(), accepted: ACCEPTED });
    const { onChanged } = mount();
    await userEvent.click(
      await screen.findByRole("button", { name: "Accept" }),
    );
    await waitFor(() => expect(api.acceptTask).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("is told after a refusal as well, because a refusal usually means the list was out of date", async () => {
    api.markWontDo.mockRejectedValue(
      new ApiError(409, "conflict", "It was reopened a moment ago."),
    );
    const { onChanged } = mount();
    await closeAsWontDo();
    expect(
      await screen.findByText("It was reopened a moment ago."),
    ).toBeInTheDocument();
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("is not told when the task could not be read again: nothing is known to have changed", async () => {
    api.getIssue.mockRejectedValue(new Error("offline"));
    const { onChanged } = mount();
    await closeAsWontDo();
    await waitFor(() => expect(api.getIssue).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onChanged).not.toHaveBeenCalled();
  });
});
