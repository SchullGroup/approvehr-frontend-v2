/**
 * U61 (SELF-14), web part: a refused save on My profile said only "That did
 * not save. Some fields are not valid." in a toast, and the field showed
 * nothing, so a person could not tell which box was wrong. The API's own
 * message now goes under the field it names.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Employee } from "@/lib/types";
import { ApiError } from "@/lib/api/client";
import { renderInToasts } from "./pipeline-workspace-helpers";

const store = vi.hoisted(() => ({ save: vi.fn() }));

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
    required: new Set<string>(),
    missing: [],
    reload: vi.fn(),
  }),
}));

const { MyDetails } = await import("@/app/(app)/profile/my-details");

const me = {
  id: "emp-1",
  firstName: "Chidi",
  lastName: "Nwosu",
  phone: "08030000000",
} as unknown as Employee;

beforeEach(() => {
  store.save.mockReset();
  store.save.mockResolvedValue({
    ok: false,
    error: new ApiError(422, "validation", "Some fields are not valid.", [
      { field: "phone", message: "Enter a Nigerian phone number." },
    ]),
  });
});

describe("a refused save on My profile", () => {
  it("puts the API's message under the field it names", async () => {
    const user = userEvent.setup();
    renderInToasts(<MyDetails me={me} only="immediate" />);
    const phone = screen.getByLabelText("Phone");
    await user.clear(phone);
    await user.type(phone, "call me maybe");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      await screen.findByText("Enter a Nigerian phone number."),
    ).toBeInTheDocument();
    expect(phone).toHaveAttribute("aria-invalid", "true");
  });
});
