import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { ToastProvider } from "@/components/ui";
import type { LeaveFileLimits } from "@/lib/api/leave-files";

/**
 * Adding a leave type, and what it asks of the person who wants that leave.
 *
 * Two switches, **both on**. What matters is what is *sent*: always both answers,
 * explicitly, so that what was on screen is what is stored and not whatever the
 * API happens to default to this year; never a number of days (that is set in
 * the table afterwards, and the dialog says so). Where no file could be kept the
 * file switch is off and cannot be turned on, with the reason as text beside
 * it. Every open is a fresh form. A refusal stays on screen in the server's own
 * words, with what was typed still there.
 */

const mocks = vi.hoisted(() => ({
  types: vi.fn(),
  createType: vi.fn(),
  limits: null as unknown,
}));

vi.mock("@/lib/api/leave", async (original) => ({
  ...(await original<typeof import("@/lib/api/leave")>()),
  leaveApi: {
    types: (...args: unknown[]) => mocks.types(...args),
    createType: (...args: unknown[]) => mocks.createType(...args),
  },
}));
vi.mock("@/lib/store/leave-files", () => ({
  useLeaveFileLimits: () => ({ limits: mocks.limits, storage: null }),
}));
vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  usePermissions: () => ({ can: () => true, loading: false, permissions: [] }),
}));
vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({ isConnected: true, user: null, employeeId: null }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/settings/leave",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/components/portal/shell", () => ({
  PageHeader: () => null,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/app/(app)/settings/leave/holidays-panel", () => ({
  HolidaysPanel: () => null,
}));

const { LeavePolicyForm } = await import("@/app/(app)/settings/leave/form");

const limits = (over: Partial<LeaveFileLimits> = {}): LeaveFileLimits => ({
  maxFiles: 5,
  maxBytes: 5 * 1024 * 1024,
  storage: true,
  types: [
    { contentType: "application/pdf", label: "PDF", extensions: [".pdf"] },
  ],
  ...over,
});

const Screen = () => (
  <ToastProvider>
    <LeavePolicyForm />
  </ToastProvider>
);

async function openDialog() {
  render(<Screen />);
  /* The header button; the dialog's own confirm button has the same name. */
  fireEvent.click(
    await screen.findByRole("button", { name: "Add leave type" }),
  );
  return screen.findByRole("dialog");
}

const reasonSwitch = (dialog: HTMLElement) =>
  within(dialog).getByRole("switch", {
    name: "Ask for a reason",
  }) as HTMLInputElement;
const fileSwitch = (dialog: HTMLElement) =>
  within(dialog).getByRole("switch", {
    name: "Ask for a supporting file",
  }) as HTMLInputElement;

function nameIt(dialog: HTMLElement, text = "Study leave") {
  fireEvent.change(within(dialog).getByPlaceholderText("Study leave"), {
    target: { value: text },
  });
}

const confirm = (dialog: HTMLElement) =>
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Add leave type" }),
  );

beforeEach(() => {
  mocks.types.mockReset().mockResolvedValue([]);
  mocks.createType.mockReset().mockResolvedValue({});
  mocks.limits = limits();
});

afterEach(() => vi.unstubAllEnvs());

describe("the two switches", () => {
  it("are both on to begin with, each saying what it does in a line of text", async () => {
    const dialog = await openDialog();
    expect(reasonSwitch(dialog).checked).toBe(true);
    expect(fileSwitch(dialog).checked).toBe(true);
    expect(
      within(dialog).getByText(
        "People must say why when they ask for this leave.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "People must attach a file (a medical certificate, say) to ask for this leave.",
      ),
    ).toBeInTheDocument();
  });

  it("say the plain opposite when they are switched off", async () => {
    const dialog = await openDialog();
    fireEvent.click(reasonSwitch(dialog));
    fireEvent.click(fileSwitch(dialog));
    expect(
      within(dialog).getByText(
        "People can ask for this leave without saying why.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "People can ask for this leave without attaching a file.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByText(/People must say why/),
    ).not.toBeInTheDocument();
  });

  it("say, while a file is asked for, that a number of days is set in the table afterwards", async () => {
    const dialog = await openDialog();
    const note =
      "To ask for one only after a number of days, set that in the table once the type is added.";
    expect(within(dialog).getByText(note)).toBeInTheDocument();
    fireEvent.click(fileSwitch(dialog));
    expect(within(dialog).queryByText(note)).toBeNull();
  });
});

describe("what is sent", () => {
  const cases: [string, boolean, boolean, boolean, string][] = [
    ["both on", false, false, true, "REQUIRED"],
    ["no reason, file asked for", true, false, false, "REQUIRED"],
    ["reason asked for, no file", false, true, true, "OPTIONAL"],
    ["neither", true, true, false, "OPTIONAL"],
  ];

  it.each(cases)(
    "%s: both answers, explicitly, and no number of days",
    async (_name, flipReason, flipFile, reasonRequired, attachmentPolicy) => {
      const dialog = await openDialog();
      nameIt(dialog);
      if (flipReason) fireEvent.click(reasonSwitch(dialog));
      if (flipFile) fireEvent.click(fileSwitch(dialog));
      confirm(dialog);
      await waitFor(() => expect(mocks.createType).toHaveBeenCalledTimes(1));
      const sent = mocks.createType.mock.calls[0]![0] as Record<
        string,
        unknown
      >;
      expect(sent).toEqual({
        name: "Study leave",
        entitledDays: 5,
        reasonRequired,
        attachmentPolicy,
      });
      expect(sent).not.toHaveProperty("attachmentRequiredOverDays");
    },
  );

  it("closes and says it was added when the API accepts it", async () => {
    const dialog = await openDialog();
    nameIt(dialog);
    confirm(dialog);
    expect(await screen.findByText("Study leave added")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("where no file could be kept", () => {
  it("starts the file switch off and disabled, says why in words, and sends OPTIONAL", async () => {
    mocks.limits = limits({ storage: false });
    const dialog = await openDialog();
    expect(fileSwitch(dialog).checked).toBe(false);
    expect(fileSwitch(dialog).disabled).toBe(true);
    expect(
      within(dialog).getByText(
        "This server cannot store files yet, so a file cannot be required.",
      ),
    ).toBeInTheDocument();
    /* Nothing about days either: no file is being asked for. */
    expect(within(dialog).queryByText(/number of days/)).toBeNull();
    /* The reason switch is not affected. */
    expect(reasonSwitch(dialog).checked).toBe(true);

    nameIt(dialog);
    confirm(dialog);
    await waitFor(() => expect(mocks.createType).toHaveBeenCalledTimes(1));
    expect(mocks.createType.mock.calls[0]![0]).toMatchObject({
      reasonRequired: true,
      attachmentPolicy: "OPTIONAL",
    });
  });

  it("does not block while it is not known, and follows the answer when it arrives", async () => {
    mocks.limits = null;
    const view = render(<Screen />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Add leave type" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(fileSwitch(dialog).checked).toBe(true);
    expect(fileSwitch(dialog).disabled).toBe(false);

    /* The read lands after the dialog is open: it says nothing could be kept. */
    mocks.limits = limits({ storage: false });
    view.rerender(<Screen />);
    expect(fileSwitch(dialog).checked).toBe(false);
    expect(fileSwitch(dialog).disabled).toBe(true);
  });

  it("allows it where the server takes links and this build can send them", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_LINKED_UPLOAD_URL",
      "https://uploader.example.test/prod",
    );
    mocks.limits = limits({ storage: false, links: true });
    const dialog = await openDialog();
    expect(fileSwitch(dialog).checked).toBe(true);
    expect(fileSwitch(dialog).disabled).toBe(false);
  });
});

describe("every open is a new form", () => {
  it("comes up blank, with both switches on, after one that was filled in and cancelled", async () => {
    const dialog = await openDialog();
    nameIt(dialog, "Half typed");
    fireEvent.click(reasonSwitch(dialog));
    fireEvent.click(fileSwitch(dialog));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Add leave type" }));
    const again = await screen.findByRole("dialog");
    expect(
      (within(again).getByPlaceholderText("Study leave") as HTMLInputElement)
        .value,
    ).toBe("");
    expect(reasonSwitch(again).checked).toBe(true);
    expect(fileSwitch(again).checked).toBe(true);
  });

  it("does not change what is on screen while it closes", async () => {
    const dialog = await openDialog();
    nameIt(dialog, "Still here");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    /* Mid-exit the form is the one that was open, not a blank one. */
    expect(
      (within(dialog).getByPlaceholderText("Study leave") as HTMLInputElement)
        .value,
    ).toBe("Still here");
  });
});

describe("a refusal", () => {
  it("stays on screen in the server's own words, under what it is about, with everything typed kept", async () => {
    mocks.createType.mockRejectedValue(
      new ApiError(422, "validation_failed", "Invalid", [
        {
          field: "attachmentPolicy",
          message:
            "A supporting file cannot be required on a server with no file storage.",
        },
      ]),
    );
    const dialog = await openDialog();
    nameIt(dialog, "Study leave");
    fireEvent.click(reasonSwitch(dialog));
    confirm(dialog);

    expect(
      await within(dialog).findByText(
        "A supporting file cannot be required on a server with no file storage.",
      ),
    ).toBeInTheDocument();
    expect(
      (within(dialog).getByPlaceholderText("Study leave") as HTMLInputElement)
        .value,
    ).toBe("Study leave");
    expect(reasonSwitch(dialog).checked).toBe(false);
    expect(fileSwitch(dialog).checked).toBe(true);
    /* Not blamed on the name. */
    expect(
      within(dialog).queryByText(/Name/i, { selector: "[id$=error]" }),
    ).toBeNull();
  });

  it("puts a duplicate name under the name", async () => {
    mocks.createType.mockRejectedValue(
      new ApiError(
        409,
        "conflict",
        "There is already a leave type called Study leave.",
      ),
    );
    const dialog = await openDialog();
    nameIt(dialog);
    confirm(dialog);
    const sentence = await within(dialog).findByText(
      "There is already a leave type called Study leave.",
    );
    expect(sentence.closest("[id$=error]")).not.toBeNull();
  });

  it("says anything else under the form, not under a field", async () => {
    mocks.createType.mockRejectedValue(
      new ApiError(403, "forbidden", "You cannot change leave settings."),
    );
    const dialog = await openDialog();
    nameIt(dialog);
    confirm(dialog);
    const sentence = await within(dialog).findByText(
      "You cannot change leave settings.",
    );
    expect(sentence.closest("[id$=error]")).toBeNull();
    expect(sentence).toHaveAttribute("role", "alert");
  });

  it("is a plain sentence, with no status code, for something that was not the API", async () => {
    mocks.createType.mockRejectedValue(new Error("boom 500"));
    const dialog = await openDialog();
    nameIt(dialog);
    confirm(dialog);
    expect(
      await within(dialog).findByText("That did not save. Try again."),
    ).toBeInTheDocument();
  });
});
