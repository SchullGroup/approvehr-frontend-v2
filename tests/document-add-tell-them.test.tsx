import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NewDocument } from "@/app/(app)/people/documents/dialogs";
import { renderInToasts } from "./pipeline-workspace-helpers";

/**
 * "Tell them" on Add a document.
 *
 * HR adds a contract to somebody's file; whether that person is told is HR's
 * decision, and the tick is the decision. What is said afterwards follows the
 * API's own answer and nothing else, because a sentence claiming somebody was
 * told is a claim about a notification, and the wrong one is worse than none:
 * HR stops chasing a person who was never reached, or chases one who was.
 */

const state = vi.hoisted(() => ({
  can: new Set<string>(),
  editable: true,
  me: "somebody-else" as string | null,
  add: vi.fn(),
}));

vi.mock("@/lib/permissions", async () => ({
  ...(await vi.importActual<typeof import("@/lib/permissions")>(
    "@/lib/permissions",
  )),
  useCan: (permission: string) => state.can.has(permission),
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ employeeId: state.me, isConnected: state.editable }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/store/signatures", () => ({
  useSignatures: () => ({ data: [] }),
}));
vi.mock("@/app/(app)/people/signatures/signatures-screen", () => ({
  TONE: {},
  overdueBy: () => null,
}));
vi.mock("@/lib/store/documents", async () => ({
  ...(await vi.importActual<typeof import("@/lib/store/documents")>(
    "@/lib/store/documents",
  )),
  useEmployeeFile: () => ({
    file: {
      employeeId: "emp-1",
      employeeName: "Ada Okafor",
      employeeNo: "EMP-001",
      documents: [],
      outstandingRequests: [],
    },
    loading: false,
    error: null,
    editable: state.editable,
    reload: vi.fn(),
    add: state.add,
    remind: vi.fn(),
    fulfil: vi.fn(),
    waive: vi.fn(),
    remove: vi.fn(),
    verify: vi.fn(),
  }),
}));

const { AddDocumentModal } =
  await import("@/app/(app)/people/documents/dialogs");
const { EmployeeFileDrawer } =
  await import("@/app/(app)/people/documents/employee-file");
const { addedNotice } = await import("@/lib/store/documents");

const gone = () =>
  waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
const fileInput = () =>
  document.querySelector('input[type="file"]') as HTMLInputElement;
const pdf = (name = "contract.pdf") =>
  new File(["%PDF-1.4"], name, { type: "application/pdf" });
const tick = () => screen.queryByRole("checkbox", { name: /Tell them/ });

/* ------------------------------------------------------------ the sentence */

describe("what is said after a document is added", () => {
  const ada = "Ada Okafor";

  it("says they were told only when the API says so", () => {
    expect(
      addedNotice({ asked: true, notifiedEmployee: true, employeeName: ada }),
    ).toEqual({
      title: "Added to the file",
      tone: "success",
      detail: "Ada was told, and can open it under Documents.",
    });
  });

  it("says plainly that nobody was told when they have no sign-in, as a warning", () => {
    expect(
      addedNotice({ asked: true, notifiedEmployee: false, employeeName: ada }),
    ).toEqual({
      title: "Added to the file",
      tone: "warning",
      detail: "Ada has no sign-in yet, so nobody was told.",
    });
  });

  it("says nothing about telling when the tick was on and the answer is silent", () => {
    /* An older server dropped a field it did not know. Whether they were told
       is not known, so neither sentence is true to write. */
    expect(
      addedNotice({
        asked: true,
        notifiedEmployee: undefined,
        employeeName: ada,
      }),
    ).toEqual({ title: "Added to the file", tone: "success" });
  });

  it("says nothing about telling when the tick was off, whatever came back", () => {
    for (const answer of [true, false, undefined]) {
      expect(
        addedNotice({
          asked: false,
          notifiedEmployee: answer,
          employeeName: ada,
        }),
      ).toEqual({ title: "Added to the file", tone: "success" });
    }
  });

  it("still reads when the person's name is not to hand", () => {
    expect(addedNotice({ asked: true, notifiedEmployee: true }).detail).toBe(
      "They were told, and can open it under Documents.",
    );
    expect(
      addedNotice({ asked: true, notifiedEmployee: false, employeeName: " " })
        .detail,
    ).toBe("They have no sign-in yet, so nobody was told.");
  });
});

/* -------------------------------------------------------------- the dialog */

function Harness({
  canNotify,
  onAdd,
}: {
  canNotify?: boolean;
  onAdd: (body: NewDocument) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open it
      </button>
      <AddDocumentModal
        open={open}
        whose="Ada’s"
        {...(canNotify === undefined ? {} : { canNotify })}
        onClose={() => setOpen(false)}
        onAdd={async (body) => {
          onAdd(body);
          setOpen(false);
        }}
      />
    </>
  );
}

async function fillAndAdd(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Name it/), "Employment contract");
  await user.upload(fileInput(), pdf());
  await screen.findByText("contract.pdf");
  await user.click(screen.getByRole("button", { name: "Add it" }));
}

describe("the tick in the dialog", () => {
  it("is unticked by default, and says in a line what it does", async () => {
    const user = userEvent.setup();
    renderInToasts(<Harness canNotify onAdd={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Open it" }));

    expect(tick()).toBeInTheDocument();
    expect(tick()).not.toBeChecked();
    /* In words on the page, not behind an icon. */
    expect(
      screen.getByText(
        "Sends them a notification that a document was added to their file. They can open it under Documents.",
      ),
    ).toBeVisible();
  });

  it("sends notifyEmployee: true only when it was ticked", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderInToasts(<Harness canNotify onAdd={onAdd} />);
    await user.click(screen.getByRole("button", { name: "Open it" }));
    await user.click(tick() as HTMLElement);
    await fillAndAdd(user);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0]?.[0]).toMatchObject({ notifyEmployee: true });
  });

  it("sends no key at all when it was not ticked", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderInToasts(<Harness canNotify onAdd={onAdd} />);
    await user.click(screen.getByRole("button", { name: "Open it" }));
    await fillAndAdd(user);

    const body = onAdd.mock.calls[0]?.[0] as NewDocument;
    expect(body).not.toHaveProperty("notifyEmployee");
  });

  it("is not there, and nothing is sent, when the caller does not offer it", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderInToasts(<Harness onAdd={onAdd} />);
    await user.click(screen.getByRole("button", { name: "Open it" }));
    expect(tick()).toBeNull();
    await fillAndAdd(user);

    expect(onAdd.mock.calls[0]?.[0]).not.toHaveProperty("notifyEmployee");
  });

  it("comes back unticked the next time it opens, however it was left", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderInToasts(<Harness canNotify onAdd={onAdd} />);

    /* Ticked, then cancelled. */
    await user.click(screen.getByRole("button", { name: "Open it" }));
    await user.click(tick() as HTMLElement);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await gone();
    await user.click(screen.getByRole("button", { name: "Open it" }));
    expect(tick()).not.toBeChecked();

    /* Ticked, then used: the next document is not one anybody chose to tell
       them about. */
    await user.click(tick() as HTMLElement);
    await fillAndAdd(user);
    await gone();
    await user.click(screen.getByRole("button", { name: "Open it" }));
    expect(tick()).not.toBeChecked();
    await fillAndAdd(user);
    expect(onAdd).toHaveBeenCalledTimes(2);
    expect(onAdd.mock.calls[1]?.[0]).not.toHaveProperty("notifyEmployee");
  });
});

/* ------------------------------------------------------------ the drawer */

const drawer = () =>
  renderInToasts(
    <EmployeeFileDrawer
      employeeId="emp-1"
      onClose={() => {}}
      onChanged={() => {}}
    />,
  );

async function openAdd(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add a document" }));
}

beforeEach(() => {
  state.can = new Set(["EDIT_RECORDS"]);
  state.editable = true;
  state.me = "somebody-else";
  state.add.mockReset();
  state.add.mockResolvedValue({ id: "doc-9" });
});

describe("who is offered the tick on a person's file", () => {
  it("is offered to somebody who may edit records, connected, on somebody else's file", async () => {
    const user = userEvent.setup();
    drawer();
    await openAdd(user);
    expect(tick()).toBeInTheDocument();
  });

  it("is not offered without EDIT_RECORDS", async () => {
    const user = userEvent.setup();
    state.can = new Set(["MANAGE_SETTINGS", "VIEW_SALARIES"]);
    drawer();
    await openAdd(user);
    expect(
      screen.getByRole("dialog", { name: /Add a document to Ada/ }),
    ).toBeInTheDocument();
    expect(tick()).toBeNull();
  });

  it("is not offered when adding to your own file", async () => {
    const user = userEvent.setup();
    state.me = "emp-1";
    drawer();
    await openAdd(user);
    expect(
      screen.getByRole("dialog", { name: /Add a document to Ada/ }),
    ).toBeInTheDocument();
    expect(tick()).toBeNull();
  });

  it("is not offered with no API: there is no way to add at all", async () => {
    state.editable = false;
    drawer();
    expect(screen.queryByRole("button", { name: "Add a document" })).toBeNull();
    expect(tick()).toBeNull();
  });
});

describe("what the drawer says after adding with the tick on", () => {
  async function addTicked(user: ReturnType<typeof userEvent.setup>) {
    await openAdd(user);
    await user.click(tick() as HTMLElement);
    await fillAndAdd(user);
  }

  it("says they were told when the API says it told them", async () => {
    const user = userEvent.setup();
    state.add.mockResolvedValue({ id: "doc-9", notifiedEmployee: true });
    drawer();
    await addTicked(user);

    expect(
      await screen.findByText("Ada was told, and can open it under Documents."),
    ).toBeInTheDocument();
    expect(state.add.mock.calls[0]?.[0]).toMatchObject({
      notifyEmployee: true,
    });
  });

  it("says nobody was told when the API says they have no sign-in", async () => {
    const user = userEvent.setup();
    state.add.mockResolvedValue({ id: "doc-9", notifiedEmployee: false });
    drawer();
    await addTicked(user);

    expect(
      await screen.findByText("Ada has no sign-in yet, so nobody was told."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/was told, and can open/)).toBeNull();
  });

  it("says nothing about telling when the answer carries no word on it", async () => {
    const user = userEvent.setup();
    state.add.mockResolvedValue({ id: "doc-9" });
    drawer();
    await addTicked(user);

    expect(await screen.findByText("Added to the file")).toBeInTheDocument();
    expect(screen.queryByText(/told/)).toBeNull();
    expect(screen.queryByText(/sign-in/)).toBeNull();
  });
});

describe("what the drawer says after adding with the tick off", () => {
  it("is as it always was, and sends no key, even if an answer carries one", async () => {
    const user = userEvent.setup();
    state.add.mockResolvedValue({ id: "doc-9", notifiedEmployee: true });
    drawer();
    await openAdd(user);
    await fillAndAdd(user);

    expect(await screen.findByText("Added to the file")).toBeInTheDocument();
    expect(screen.queryByText(/told/)).toBeNull();
    expect(state.add.mock.calls[0]?.[0]).not.toHaveProperty("notifyEmployee");
  });
});
