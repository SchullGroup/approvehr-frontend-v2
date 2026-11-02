import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type {
  LeaveFile,
  LeaveFileList,
  LeaveFileLimits,
} from "@/lib/api/leave-files";

/**
 * The files on a leave request, in its panel.
 *
 * What the API says about the reader decides everything drawn: whether there is
 * a list to ask for at all, whether a file can be removed, whether more can be
 * added, whether the request is missing a file it needs. A control the API would
 * refuse is absent, not disabled. A file is opened from a click and from nowhere
 * else. And no sentence the panel writes carries a file's name: the name is a
 * row in the list, and that is the only place it is.
 */

const mocks = vi.hoisted(() => ({
  useLeaveFiles: vi.fn(),
  reload: vi.fn(),
  open: vi.fn(),
  record: vi.fn(),
  remove: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("@/lib/store/leave-files", () => ({
  useLeaveFiles: (id: string | null) => mocks.useLeaveFiles(id),
}));
vi.mock("@/lib/api/leave-files", async (original) => ({
  ...(await original<typeof import("@/lib/api/leave-files")>()),
  openLeaveFile: (...args: unknown[]) => mocks.open(...args),
  uploadLeaveFile: (...args: unknown[]) => mocks.upload(...args),
  leaveFilesApi: {
    record: (...args: unknown[]) => mocks.record(...args),
    remove: (...args: unknown[]) => mocks.remove(...args),
  },
}));

const { LeaveRequestFiles } =
  await import("@/components/leave/leave-request-files");

const LIMITS: LeaveFileLimits = {
  maxFiles: 5,
  maxBytes: 5 * 1024 * 1024,
  storage: true,
  types: [
    { contentType: "application/pdf", label: "PDF", extensions: ["pdf"] },
    { contentType: "image/heic", label: "HEIC", extensions: ["heic"] },
  ],
};

const file = (over: Partial<LeaveFile> = {}): LeaveFile => ({
  id: "f1",
  filename: "certificate.pdf",
  contentType: "application/pdf",
  sizeBytes: 2048,
  createdAt: "2026-10-18T09:00:00Z",
  scanStatus: "NOT_SCANNED",
  flagged: false,
  viewable: true,
  uploadedByYou: true,
  canRemove: true,
  ...over,
});

const listOf = (
  files: LeaveFile[],
  over: Partial<LeaveFileList> = {},
): LeaveFileList => ({
  files,
  access: { role: "owner", canView: true, canAdd: true },
  requirement: {
    policy: "OPTIONAL",
    requiredOverDays: null,
    required: false,
    met: true,
  },
  limits: LIMITS,
  ...over,
});

const state = (list: LeaveFileList | null, over = {}) => ({
  list,
  loading: false,
  error: null,
  reload: mocks.reload,
  ...over,
});

const OWNER = { isOwner: true, isHr: false, reduced: false };

function mount(
  reader = OWNER,
  attachmentCount = 1,
  onChanged: () => void = vi.fn(),
) {
  render(
    <LeaveRequestFiles
      requestId="req-1"
      employeeId="emp-1"
      attachmentCount={attachmentCount}
      reader={reader}
      onChanged={onChanged}
    />,
  );
  return { onChanged };
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.useLeaveFiles.mockReturnValue(state(listOf([file()])));
  mocks.open.mockResolvedValue("opened");
  mocks.record.mockResolvedValue(file());
  mocks.remove.mockResolvedValue(undefined);
  mocks.upload.mockImplementation(async (f: File) => ({
    storageKey: `k-${f.name}`,
    filename: f.name,
    contentType: "application/pdf",
  }));
});

describe("who is asked for a list", () => {
  it("asks for one for the person the leave is for, for HR, and for a manager reading the reduced view", () => {
    for (const reader of [
      OWNER,
      { isOwner: false, isHr: true, reduced: false },
      { isOwner: false, isHr: false, reduced: true },
    ]) {
      mocks.useLeaveFiles.mockClear();
      const { unmount } = render(
        <LeaveRequestFiles
          requestId="req-1"
          employeeId="emp-1"
          attachmentCount={1}
          reader={reader}
        />,
      );
      expect(mocks.useLeaveFiles).toHaveBeenCalledWith("req-1");
      unmount();
    }
  });

  it("asks for none for anybody else, because it would be a 403, and says only how many", () => {
    mocks.useLeaveFiles.mockReturnValue(state(null));
    mount({ isOwner: false, isHr: false, reduced: false }, 2);
    expect(mocks.useLeaveFiles).toHaveBeenCalledWith(null);
    expect(
      screen.getByText(
        "2 supporting files are attached. You cannot open them.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open|Download/ })).toBeNull();
  });

  it("draws nothing at all for somebody who cannot open files on a request with none", () => {
    mocks.useLeaveFiles.mockReturnValue(state(null));
    const { container } = render(
      <LeaveRequestFiles
        requestId="req-1"
        employeeId="emp-1"
        attachmentCount={0}
        reader={{ isOwner: false, isHr: false, reduced: false }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("draws nothing when the API refuses the reader, rather than a failure about a thing they were never meant to see", () => {
    mocks.useLeaveFiles.mockReturnValue(
      state(null, { error: new ApiError(403, "forbidden", "No") }),
    );
    const { container } = render(
      <LeaveRequestFiles
        requestId="req-1"
        employeeId="emp-1"
        attachmentCount={1}
        reader={OWNER}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("says the files did not load, with a way to ask again, for a real failure", () => {
    mocks.useLeaveFiles.mockReturnValue(
      state(null, { error: new ApiError(500, "server", "x") }),
    );
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.reload).toHaveBeenCalled();
  });
});

describe("the files", () => {
  it("lists each with its size, and offers to open one a browser can show and to download one it cannot", () => {
    mocks.useLeaveFiles.mockReturnValue(
      state(
        listOf([
          file(),
          file({
            id: "f2",
            filename: "scan.heic",
            contentType: "image/heic",
            sizeBytes: 3 * 1024 * 1024,
            viewable: false,
          }),
        ]),
      ),
    );
    mount();
    const list = screen.getByRole("list", { name: "Supporting files" });
    expect(within(list).getByText("certificate.pdf")).toBeInTheDocument();
    expect(within(list).getByText("2 KB")).toBeInTheDocument();
    expect(
      within(list).getByRole("button", { name: "Open certificate.pdf" }),
    ).toHaveTextContent("Open");
    expect(
      within(list).getByRole("button", { name: "Download scan.heic" }),
    ).toHaveTextContent("Download");
  });

  it("says a flagged file cannot be opened, and gives no way to try", () => {
    mocks.useLeaveFiles.mockReturnValue(
      state(listOf([file({ flagged: true })])),
    );
    mount();
    expect(screen.getByText("Cannot be opened")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Open certificate/ }),
    ).toBeNull();
  });

  it("draws a remove control only for the files the API says can be removed", () => {
    mocks.useLeaveFiles.mockReturnValue(
      state(
        listOf([
          file({ canRemove: false }),
          file({ id: "f2", filename: "second.pdf", canRemove: true }),
        ]),
      ),
    );
    mount();
    expect(
      screen.queryByRole("button", { name: "Remove certificate.pdf" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Remove second.pdf" }),
    ).toBeInTheDocument();
  });

  it("asks for no link until somebody presses open, and then asks once", async () => {
    mount();
    /* Rendering a list is not opening a file: nothing was asked for. */
    expect(mocks.open).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Open certificate.pdf" }),
    );
    await waitFor(() => expect(mocks.open).toHaveBeenCalledTimes(1));
    expect(mocks.open).toHaveBeenCalledWith(
      "req-1",
      expect.objectContaining({ id: "f1", viewable: true }),
    );
  });

  it("says the browser stopped it, without the file's name", async () => {
    mocks.open.mockResolvedValue("blocked");
    mount();
    fireEvent.click(
      screen.getByRole("button", { name: "Open certificate.pdf" }),
    );
    const sentence = await screen.findByText(
      /Your browser stopped the file opening/,
    );
    expect(sentence.textContent).not.toMatch(/certificate/);
  });

  it("says why when the API will not give a link, in words that carry no name", async () => {
    mocks.open.mockRejectedValue(
      new ApiError(
        409,
        "attachment_flagged",
        "That file did not pass our virus check, so it cannot be opened.",
      ),
    );
    mount();
    fireEvent.click(
      screen.getByRole("button", { name: "Open certificate.pdf" }),
    );
    const sentence = await screen.findByText(/did not pass our virus check/);
    expect(sentence.textContent).not.toMatch(/certificate/);
  });
});

describe("a request with no files", () => {
  it("draws nothing when there is none and nobody who may add one", () => {
    mocks.useLeaveFiles.mockReturnValue(
      state(
        listOf([], {
          access: { role: "approver", canView: true, canAdd: false },
        }),
      ),
    );
    const { container } = render(
      <LeaveRequestFiles
        requestId="req-1"
        employeeId="emp-1"
        attachmentCount={0}
        reader={{ isOwner: false, isHr: false, reduced: true }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers to add one to somebody who may, saying what it takes", () => {
    mocks.useLeaveFiles.mockReturnValue(state(listOf([])));
    mount(OWNER, 0);
    expect(screen.getByText("No files yet.")).toBeInTheDocument();
    expect(screen.getByLabelText("Add files")).toBeInTheDocument();
    expect(
      screen.getByText("PDF and HEIC, up to 5 files of 5 MB each."),
    ).toBeInTheDocument();
  });

  it("flags a file the request needs and does not have, as a mark and not a banner", () => {
    mocks.useLeaveFiles.mockReturnValue(
      state(
        listOf([], {
          requirement: {
            policy: "REQUIRED",
            requiredOverDays: 2,
            required: true,
            met: false,
          },
        }),
      ),
    );
    mount(OWNER, 0);
    expect(
      screen.getByRole("button", {
        name: "A supporting file is required for this request, and none is attached yet.",
      }),
    ).toBeInTheDocument();
  });
});

describe("what an approver may do", () => {
  it("can open files and cannot add or remove them", () => {
    mocks.useLeaveFiles.mockReturnValue(
      state(
        listOf([file({ canRemove: false })], {
          access: { role: "approver", canView: true, canAdd: false },
        }),
      ),
    );
    mount({ isOwner: false, isHr: false, reduced: true });
    expect(
      screen.getByRole("button", { name: "Open certificate.pdf" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Add files")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
  });
});

describe("removing a file", () => {
  it("asks first, in words that carry no name, then removes it and says so", async () => {
    const { onChanged } = mount();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove certificate.pdf" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Remove this file?")).toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(/certificate/);

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove file" }),
    );
    await waitFor(() =>
      expect(mocks.remove).toHaveBeenCalledWith("req-1", "f1"),
    );
    await waitFor(() => expect(mocks.reload).toHaveBeenCalled());
    expect(onChanged).toHaveBeenCalled();
  });

  it("says the API's reason when it will not, for the last file a required type needs", async () => {
    mocks.remove.mockRejectedValue(
      new ApiError(
        422,
        "attachment_required",
        "Sick over 2 days needs a supporting file. Attach the replacement first.",
      ),
    );
    mount();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove certificate.pdf" }),
    );
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Remove file",
      }),
    );
    expect(
      await screen.findByText(/Attach the replacement first/),
    ).toBeInTheDocument();
  });
});

describe("adding a file to a request that is open", () => {
  const pdf = new File([new Uint8Array(100)], "note.pdf", {
    type: "application/pdf",
  });

  it("uploads it for the person the leave is for, then records it, then reloads", async () => {
    const { onChanged } = mount();
    fireEvent.change(screen.getByLabelText("Add files"), {
      target: { files: [pdf] },
    });

    await waitFor(() => expect(mocks.record).toHaveBeenCalledTimes(1));
    expect(mocks.upload.mock.calls[0]![2]).toMatchObject({
      employeeId: "emp-1",
    });
    /* Recorded only once it is in storage. */
    expect(mocks.upload.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.record.mock.invocationCallOrder[0]!,
    );
    expect(mocks.record).toHaveBeenCalledWith("req-1", {
      storageKey: "k-note.pdf",
      filename: "note.pdf",
      contentType: "application/pdf",
    });
    await waitFor(() => expect(mocks.reload).toHaveBeenCalled());
    expect(onChanged).toHaveBeenCalled();
  });

  it("says the reason under the file when it is refused, and does not reload for nothing", async () => {
    mocks.record.mockRejectedValue(
      new ApiError(
        422,
        "attachment_type_refused",
        "That file came through empty. Upload it again.",
      ),
    );
    mount();
    fireEvent.change(screen.getByLabelText("Add files"), {
      target: { files: [pdf] },
    });
    expect(
      await screen.findByText("That file came through empty. Upload it again."),
    ).toBeInTheDocument();
    expect(mocks.reload).not.toHaveBeenCalled();
  });

  it("offers no way to add at the limit, because the API says the request cannot take another", () => {
    mocks.useLeaveFiles.mockReturnValue(
      state(
        listOf(
          [1, 2, 3, 4, 5].map((n) =>
            file({ id: `f${String(n)}`, filename: `n${String(n)}.pdf` }),
          ),
          { access: { role: "owner", canView: true, canAdd: false } },
        ),
      ),
    );
    mount();
    /* At the limit the API says it cannot be added to: no control to try. */
    expect(screen.queryByLabelText("Add files")).toBeNull();
  });
});
