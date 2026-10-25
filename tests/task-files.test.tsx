import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProjectProvider,
  type ProjectContextValue,
} from "@/components/projects/project-context";
import { ApiError } from "@/lib/api/client";
import type {
  IssueAttachment,
  IssueThread,
  ProjectData,
} from "@/lib/projects/types";
import { contextFor, sampleData } from "./projects-fixture";

/**
 * Files on a task: the drawer's Files section, files on a comment, and files
 * chosen while creating a task.
 *
 * The API client and the PUT to storage are stubbed. What is proved is the
 * order of the three steps (ask for an upload URL, PUT, record), the refusals in
 * the UI notes' words, and who sees which control.
 */

let thread: IssueThread = { comments: [], activity: [] };
const reloadThread = vi.hoisted(() => vi.fn());
const pushToast = vi.hoisted(() => vi.fn());
const putToStorage = vi.hoisted(() => vi.fn());
const api = vi.hoisted(() => ({
  attachmentUploadUrl: vi.fn(),
  recordAttachment: vi.fn(),
  attachmentUrl: vi.fn(),
  removeAttachment: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/ui", async (original) => ({
  ...(await original<typeof import("@/components/ui")>()),
  useToast: () => ({ push: pushToast }),
}));

vi.mock("@/lib/api/uploads", async (original) => ({
  ...(await original<typeof import("@/lib/api/uploads")>()),
  putToStorage: (...a: unknown[]) => putToStorage(...a),
}));

vi.mock("@/lib/api/projects", async (original) => ({
  ...(await original<typeof import("@/lib/api/projects")>()),
  projectsApi: {
    links: vi.fn().mockResolvedValue([]),
    watch: vi.fn(),
    unwatch: vi.fn(),
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

vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useOrgTimezone: () => "Africa/Lagos",
}));

const { IssueDrawer } = await import("@/components/projects/issue-drawer");
const { CreateIssueDialog } =
  await import("@/components/projects/create-issue-dialog");
const { ReducedIssueDrawer } =
  await import("@/components/projects/reduced-issue-drawer");

const file = (name: string, type: string, size = 2048) => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

const attachment = (over: Partial<IssueAttachment> = {}): IssueAttachment => ({
  id: "att-1",
  filename: "spec.pdf",
  contentType: "application/pdf",
  sizeBytes: 250_000,
  uploadedBy: "p-03",
  createdAt: "2026-10-20T09:00:00.000Z",
  ...over,
});

function renderDrawer(
  overrides: Partial<ProjectContextValue> = {},
  data: ProjectData = sampleData(),
) {
  const ctx = contextFor(data, { connected: true, ...overrides });
  const issue = data.issues.find((i) => i.key === "CHK-10")!;
  render(
    <ProjectProvider value={ctx}>
      <IssueDrawer issue={issue} onClose={vi.fn()} />
    </ProjectProvider>,
  );
  return { ctx, issue, data };
}

const files = () => screen.getByRole("region", { name: "Files" });

let keys = 0;
beforeEach(() => {
  vi.clearAllMocks();
  thread = {
    comments: [],
    activity: [],
    watchers: [],
    watching: false,
    attachments: [],
    canManageWatchers: true,
    canAttachToTask: true,
  };
  api.attachmentUploadUrl.mockImplementation(async () => {
    keys += 1;
    return {
      storageKey: `org/issues/i/${keys}.pdf`,
      url: `https://bucket.test/${keys}`,
      headers: { "Content-Type": "application/pdf" },
      expiresAt: "2026-10-25T10:00:00.000Z",
    };
  });
  putToStorage.mockResolvedValue(undefined);
  api.recordAttachment.mockImplementation(
    async (_id: string, ref: { filename: string; contentType: string }) =>
      attachment({
        id: `att-${ref.filename}`,
        filename: ref.filename,
        contentType: ref.contentType,
        uploadedBy: "p-01",
      }),
  );
  api.attachmentUrl.mockResolvedValue({
    url: "https://bucket.test/read",
    expiresAt: "2026-10-25T10:00:00.000Z",
  });
  api.removeAttachment.mockResolvedValue(undefined);
});

describe("the Files section", () => {
  it("shows an image as a thumbnail and anything else as a name and size", async () => {
    thread = {
      ...thread,
      attachments: [
        attachment(),
        attachment({
          id: "att-2",
          filename: "screen.png",
          contentType: "image/png",
        }),
      ],
    };
    renderDrawer();
    const box = within(files());
    expect(box.getByText("spec.pdf")).toBeInTheDocument();
    expect(box.getByText("244 KB")).toBeInTheDocument();
    const thumb = await box.findByRole("img", { name: "screen.png" });
    expect(thumb).toHaveAttribute("src", "https://bucket.test/read");
    expect(api.attachmentUrl).toHaveBeenCalledWith("att-2", expect.anything());
  });

  it("asks for an upload URL, PUTs the file, then records it", async () => {
    const { issue } = renderDrawer();
    const input = within(files()).getByLabelText("Attach files", {
      selector: "input",
    });
    await userEvent.upload(input, file("plan.pdf", "application/pdf"));
    await waitFor(() => expect(api.recordAttachment).toHaveBeenCalled());
    expect(api.attachmentUploadUrl).toHaveBeenCalledWith(issue.id, {
      filename: "plan.pdf",
      contentType: "application/pdf",
      sizeBytes: 2048,
    });
    expect(putToStorage).toHaveBeenCalled();
    expect(api.attachmentUploadUrl.mock.invocationCallOrder[0]!).toBeLessThan(
      putToStorage.mock.invocationCallOrder[0]!,
    );
    expect(putToStorage.mock.invocationCallOrder[0]!).toBeLessThan(
      api.recordAttachment.mock.invocationCallOrder[0]!,
    );
    expect(api.recordAttachment).toHaveBeenCalledWith(issue.id, {
      storageKey: expect.stringContaining("org/issues/i/"),
      filename: "plan.pdf",
      contentType: "application/pdf",
    });
    expect(await within(files()).findByText("plan.pdf")).toBeInTheDocument();
    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "File attached" }),
    );
    expect(reloadThread).toHaveBeenCalled();
  });

  it("takes files dropped onto it", async () => {
    renderDrawer();
    fireEvent.drop(files(), {
      dataTransfer: { files: [file("dropped.pdf", "application/pdf")] },
    });
    await waitFor(() =>
      expect(api.recordAttachment).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ filename: "dropped.pdf" }),
      ),
    );
  });

  it("lights up only for a drag carrying files, and clears on drop", () => {
    renderDrawer();
    const box = files();
    fireEvent.dragOver(box, { dataTransfer: { types: ["text/plain"] } });
    expect(box.className).not.toContain("outline-dashed");
    fireEvent.dragOver(box, { dataTransfer: { types: ["Files"] } });
    expect(box.className).toContain("outline-dashed");
    fireEvent.drop(box, { dataTransfer: { types: ["Files"], files: [] } });
    expect(box.className).not.toContain("outline-dashed");
  });

  it("refuses a file over 10 MB before uploading it", async () => {
    renderDrawer();
    await userEvent.upload(
      within(files()).getByLabelText("Attach files", { selector: "input" }),
      file("huge.pdf", "application/pdf", 11 * 1024 * 1024),
    );
    expect(
      await within(files()).findByText(
        "That file is over 10 MB. Attach a smaller one.",
      ),
    ).toBeInTheDocument();
    expect(api.attachmentUploadUrl).not.toHaveBeenCalled();
  });

  it("refuses a kind of file that can't be attached", async () => {
    renderDrawer();
    const input = within(files()).getByLabelText("Attach files", {
      selector: "input",
    });
    /* The picker's own filter is a hint; a drop goes around it. */
    fireEvent.drop(files(), {
      dataTransfer: { files: [file("tool.exe", "application/x-msdownload")] },
    });
    expect(input).toBeInTheDocument();
    expect(
      await within(files()).findByText(
        "That kind of file can't be attached. Use an image, PDF or Office document.",
      ),
    ).toBeInTheDocument();
    expect(api.attachmentUploadUrl).not.toHaveBeenCalled();
  });

  it("says so when the server has no file storage", async () => {
    api.attachmentUploadUrl.mockRejectedValue(
      new ApiError(
        422,
        "unprocessable",
        "File uploads aren't set up on this server.",
      ),
    );
    renderDrawer();
    await userEvent.upload(
      within(files()).getByLabelText("Attach files", { selector: "input" }),
      file("plan.pdf", "application/pdf"),
    );
    expect(
      await within(files()).findByText(
        "File uploads aren't set up on this server.",
      ),
    ).toBeInTheDocument();
    expect(api.recordAttachment).not.toHaveBeenCalled();
  });

  it("lets whoever attached a file remove it, and nobody else who is not the lead", async () => {
    thread = {
      ...thread,
      attachments: [
        attachment({ id: "mine", filename: "mine.pdf", uploadedBy: "p-01" }),
        attachment({
          id: "theirs",
          filename: "theirs.pdf",
          uploadedBy: "p-03",
        }),
      ],
    };
    renderDrawer({ canManage: false });
    const box = within(files());
    expect(box.queryByRole("button", { name: "Remove theirs.pdf" })).toBeNull();
    await userEvent.click(box.getByRole("button", { name: "Remove mine.pdf" }));
    expect(api.removeAttachment).toHaveBeenCalledWith("mine");
    await waitFor(() => expect(box.queryByText("mine.pdf")).toBeNull());
  });

  it("the lead may remove anybody's file", () => {
    thread = {
      ...thread,
      attachments: [attachment({ filename: "theirs.pdf", uploadedBy: "p-03" })],
    };
    renderDrawer({ canManage: true });
    expect(
      within(files()).getByRole("button", { name: "Remove theirs.pdf" }),
    ).toBeInTheDocument();
  });

  it("on somebody's personal task, a reader who did not set it cannot attach to the task", () => {
    const data = sampleData();
    const issue = data.issues.find((i) => i.key === "CHK-10")!;
    issue.assigneeId = "p-04";
    issue.reporterId = "p-04";
    thread = {
      ...thread,
      attachments: [attachment()],
      canAttachToTask: false,
    };
    renderDrawer(
      { personal: { setByName: null }, canWork: false, canManage: false },
      data,
    );
    expect(within(files()).getByText("spec.pdf")).toBeInTheDocument();
    expect(
      within(files()).queryByRole("button", { name: "Attach files" }),
    ).toBeNull();
  });

  it("hides Attach files whenever the API says the reader may not", () => {
    thread = { ...thread, canAttachToTask: false };
    renderDrawer();
    expect(
      within(files()).queryByRole("button", { name: "Attach files" }),
    ).toBeNull();
  });

  it("the leader who set a personal task may attach to it", () => {
    const data = sampleData();
    const issue = data.issues.find((i) => i.key === "CHK-10")!;
    issue.assigneeId = "p-04";
    issue.reporterId = "p-01";
    renderDrawer(
      {
        personal: { setByName: "Adaeze Okonkwo" },
        canWork: false,
        canManage: false,
      },
      data,
    );
    expect(
      within(files()).getByRole("button", { name: "Attach files" }),
    ).toBeInTheDocument();
  });
});

describe("files on a comment", () => {
  it("posts a comment with files and no words: uploads first, then sends", async () => {
    const { ctx, issue } = renderDrawer();
    const actions = ctx.actions as unknown as {
      addComment: ReturnType<typeof vi.fn>;
    };
    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();
    await userEvent.upload(
      screen.getByLabelText("Attach files to your comment", {
        selector: "input",
      }),
      file("photo.png", "image/png"),
    );
    expect(
      within(
        screen.getByRole("list", { name: "Files to send with your comment" }),
      ).getByText("photo.png"),
    ).toBeInTheDocument();
    expect(send).toBeEnabled();
    await userEvent.click(send);
    await waitFor(() => expect(actions.addComment).toHaveBeenCalled());
    expect(api.recordAttachment).not.toHaveBeenCalled();
    expect(putToStorage.mock.invocationCallOrder[0]!).toBeLessThan(
      actions.addComment.mock.invocationCallOrder[0]!,
    );
    expect(actions.addComment).toHaveBeenCalledWith(issue.id, "", {
      attachments: [
        {
          storageKey: expect.stringContaining("org/issues/i/"),
          filename: "photo.png",
          contentType: "image/png",
        },
      ],
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("list", {
          name: "Files to send with your comment",
        }),
      ).toBeNull(),
    );
  });

  it("does not send when a file fails to upload, and keeps the words", async () => {
    putToStorage.mockRejectedValue(
      new Error(
        "The upload did not finish. Check your connection and try again.",
      ),
    );
    const { ctx } = renderDrawer();
    const actions = ctx.actions as unknown as {
      addComment: ReturnType<typeof vi.fn>;
    };
    await userEvent.type(
      screen.getByRole("combobox", { name: "Add a comment" }),
      "see attached",
    );
    await userEvent.upload(
      screen.getByLabelText("Attach files to your comment", {
        selector: "input",
      }),
      file("photo.png", "image/png"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByText(
        "The upload did not finish. Check your connection and try again.",
      ),
    ).toBeInTheDocument();
    expect(actions.addComment).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Add a comment" })).toHaveValue(
      "see attached",
    );
  });

  it("shows a comment's files under it", () => {
    thread = {
      ...thread,
      comments: [
        {
          id: "c-1",
          issueId: "x",
          authorId: "p-03",
          body: "",
          editedAt: null,
          createdAt: "2026-10-20T09:00:00.000Z",
          attachments: [attachment({ filename: "notes.pdf" })],
        },
      ],
    };
    renderDrawer();
    expect(
      screen.getByRole("button", { name: /notes\.pdf/ }),
    ).toBeInTheDocument();
  });
});

describe("files while creating a task", () => {
  function renderCreate(overrides: Partial<ProjectContextValue> = {}) {
    const ctx = contextFor(sampleData(), { connected: true, ...overrides });
    const actions = ctx.actions as unknown as {
      createIssue: ReturnType<typeof vi.fn>;
    };
    actions.createIssue.mockResolvedValue({
      ok: true,
      value: { id: "new-1", key: "CHK-99" },
    });
    const onClose = vi.fn();
    render(
      <ProjectProvider value={ctx}>
        <CreateIssueDialog open onClose={onClose} defaults={{}} />
      </ProjectProvider>,
    );
    return { actions, onClose };
  }

  it("creates the task, then uploads and records each file on it", async () => {
    const { actions, onClose } = renderCreate();
    await userEvent.type(screen.getByLabelText(/Summary/), "Refund flow");
    await userEvent.upload(
      screen.getByLabelText("Attach files", { selector: "input" }),
      [file("a.pdf", "application/pdf"), file("b.png", "image/png")],
    );
    expect(screen.getByText("a.pdf")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.recordAttachment).toHaveBeenCalledTimes(2);
    expect(api.recordAttachment).toHaveBeenCalledWith(
      "new-1",
      expect.objectContaining({ filename: "a.pdf" }),
    );
    expect(actions.createIssue.mock.invocationCallOrder[0]!).toBeLessThan(
      api.attachmentUploadUrl.mock.invocationCallOrder[0]!,
    );
  });

  it("keeps the task when a file fails, says which, and does not create it twice", async () => {
    api.recordAttachment.mockImplementation(
      async (_id: string, ref: { filename: string }) => {
        if (ref.filename === "b.png") {
          throw new ApiError(
            422,
            "unprocessable",
            "We couldn't find that upload. Upload the file again.",
          );
        }
        return attachment({ filename: ref.filename });
      },
    );
    const { actions, onClose } = renderCreate();
    await userEvent.type(screen.getByLabelText(/Summary/), "Refund flow");
    await userEvent.upload(
      screen.getByLabelText("Attach files", { selector: "input" }),
      [file("a.pdf", "application/pdf"), file("b.png", "image/png")],
    );
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(
      await screen.findByText(
        "We couldn't find that upload. Upload the file again.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/CHK-99 was created/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
    api.recordAttachment.mockResolvedValue(attachment({ filename: "b.png" }));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(actions.createIssue).toHaveBeenCalledTimes(1);
  });

  it("offers no files in the demo", () => {
    renderCreate({ connected: false });
    expect(screen.queryByRole("button", { name: "Attach files" })).toBeNull();
  });
});

describe("the leader's reduced view", () => {
  it("has no files or watchers", () => {
    const data = sampleData();
    const issue = data.issues.find((i) => i.key === "CHK-10")!;
    render(
      <ReducedIssueDrawer
        detail={{
          issue,
          projectName: "Checkout",
          statusName: "In progress",
          statusCategory: "IN_PROGRESS",
          subtasks: [],
        }}
        assigneeName="Chidi Nwosu"
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("region", { name: "Files" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Watchers" })).toBeNull();
    expect(screen.queryByText("Attach files")).toBeNull();
    expect(screen.queryByText("Add a watcher")).toBeNull();
  });
});
