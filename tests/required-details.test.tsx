import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Employee } from "@/lib/types";
import { renderInToasts } from "./pipeline-workspace-helpers";

/**
 * My profile with details HR requires.
 *
 * Pinned here: religion is a choice on My profile; a required detail is marked;
 * Save waits while one is blank and says which; and once it is filled in the
 * save goes through.
 */

const store = vi.hoisted(() => ({
  required: new Set<string>(),
  save: vi.fn(),
}));

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: true, isLoading: false }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/store/my-record", () => ({
  SELF_SERVICE_OFFLINE: "Offline.",
  useMyPendingChanges: () => ({
    changes: [],
    loading: false,
    error: null,
    editable: true,
    reload: vi.fn(),
  }),
  useMyRecordMutations: () => ({ save: store.save, editable: true }),
  useMyRequiredDetails: () => ({
    required: store.required,
    missing: [],
    reload: vi.fn(),
  }),
}));

const { MyDetails } = await import("@/app/(app)/profile/my-details");

const me = {
  id: "emp-1",
  firstName: "Ngozi",
  lastName: "Eze",
  phone: "08030000000",
  religion: null,
} as unknown as Employee;

beforeEach(() => {
  store.required = new Set<string>();
  store.save.mockReset();
  store.save.mockResolvedValue({
    ok: true,
    outcome: { applied: ["religion"], pending: [], refused: [] },
  });
});

async function openGroup(name: string) {
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: new RegExp(name) }));
}

const religionSelect = () => screen.getByRole("combobox", { name: /Religion/ });

describe("religion and required details on My profile", () => {
  it("offers religion as a choice and saves it", async () => {
    const user = userEvent.setup();
    renderInToasts(<MyDetails me={me} only="immediate" />);
    await openGroup("Religion");
    await user.selectOptions(religionSelect(), "Islam");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(store.save).toHaveBeenCalledWith({ religion: "Islam" });
  });

  it("holds the save while a required detail is blank, and says which", async () => {
    store.required = new Set(["religion"]);
    const user = userEvent.setup();
    renderInToasts(<MyDetails me={me} only="immediate" />);

    expect(screen.getByText("Needs filling in")).toBeInTheDocument();
    /* "How to reach you" is the group open to begin with. */
    await user.clear(screen.getByLabelText("Address"));
    await user.type(screen.getByLabelText("Address"), "12 Marina, Lagos");

    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.getByText(/Fill in Religion first/)).toBeInTheDocument();

    await openGroup("Religion");
    await user.selectOptions(religionSelect(), "Christianity");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });
});
