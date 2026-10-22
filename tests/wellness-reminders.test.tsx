import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { PermissionKey } from "@/lib/permission-keys";
import { reminders, settings } from "./wellness-fixtures";

/**
 * Reminders: your own policy replaces the company's, as a whole.
 *
 * What is pinned is the shape of that promise: saving writes a whole policy
 * (never a patch), going back to the company default is its own act and only
 * offered to somebody who has their own, and the company default is something
 * only the person who runs the programme is shown a card for.
 */

const api = vi.hoisted(() => ({
  myReminders: vi.fn(),
  setMyReminders: vi.fn(),
  clearMyReminders: vi.fn(),
  setOrganisationReminders: vi.fn(),
  settings: vi.fn(),
}));

vi.mock("@/lib/api/wellness", async (original) => ({
  ...(await original<typeof import("@/lib/api/wellness")>()),
  wellnessApi: api,
}));

vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({ isConnected: true, employeeId: "e-me" }),
}));

let held = new Set<PermissionKey>();
vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  useCan: (permission: PermissionKey) => held.has(permission),
}));

import { RemindersScreen } from "@/app/(app)/wellness/reminders-screen";

beforeEach(() => {
  vi.resetAllMocks();
  held = new Set();
  api.myReminders.mockResolvedValue(reminders());
  api.settings.mockResolvedValue(settings());
});

/* "Edit" once something is saved, "Set up ..." while nothing is: the card's one
   button, whichever it says. */
const EDIT = /^(Edit|Set up reminders|Set up the default)$/;

const edit = async (which = 0) => {
  render(<RemindersScreen />);
  const buttons = await screen.findAllByRole("button", { name: EDIT });
  await userEvent.click(buttons[which]!);
  return screen.findByRole("dialog");
};

describe("what applies to you", () => {
  it("says whose it is, how often, and which breaks are named", async () => {
    api.myReminders.mockResolvedValue(
      reminders({
        source: "PERSONAL",
        intervals: [20, 45],
        breaks: [{ name: "Lunch", startsAt: "13:00", durationMinutes: 60 }],
      }),
    );
    render(<RemindersScreen />);

    expect(await screen.findByText("Your own settings")).toBeInTheDocument();
    expect(screen.getByText("20 and 45 minutes")).toBeInTheDocument();
    expect(screen.getByText("Lunch, 13:00, 60 min")).toBeInTheDocument();
  });

  it("says it is the company's when you have not set your own", async () => {
    render(<RemindersScreen />);
    expect(await screen.findByText("The built-in default")).toBeInTheDocument();
    expect(screen.getByText("15 and 30 minutes")).toBeInTheDocument();
    expect(screen.getByText("None")).toBeInTheDocument();
  });

  it("shows the company default only to whoever may set it", async () => {
    render(<RemindersScreen />);
    await screen.findByText("The built-in default");
    expect(
      screen.queryByRole("heading", { name: /Company default/ }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: EDIT })).toHaveLength(1);
  });

  it("says it did not load, and does not show a policy it does not have", async () => {
    api.myReminders.mockRejectedValue(new ApiError(500, "internal", "Broke."));
    render(<RemindersScreen />);
    expect(
      await screen.findByText("Your reminders did not load"),
    ).toBeInTheDocument();
    expect(screen.queryByText("15 and 30 minutes")).not.toBeInTheDocument();
  });
});

describe("changing your own", () => {
  it("writes a whole policy, with the new interval and the new break", async () => {
    api.setMyReminders.mockResolvedValue(reminders({ source: "PERSONAL" }));
    const dialog = await edit();

    const every = within(dialog).getByLabelText(/Remind every/);
    await userEvent.clear(every);
    await userEvent.type(every, "20, 45");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Add a break" }),
    );
    await userEvent.type(within(dialog).getByLabelText("Name"), "Lunch");
    const length = within(dialog).getByLabelText("Length");
    await userEvent.clear(length);
    await userEvent.type(length, "60");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(api.setMyReminders).toHaveBeenCalledWith({
      enabled: true,
      intervals: [20, 45],
      breaks: [{ name: "Lunch", startsAt: "13:00", durationMinutes: 60 }],
    });
    expect(api.setOrganisationReminders).not.toHaveBeenCalled();
  });

  it("can switch reminders off", async () => {
    api.setMyReminders.mockResolvedValue(
      reminders({ source: "PERSONAL", enabled: false }),
    );
    const dialog = await edit();

    await userEvent.click(
      within(dialog).getByRole("switch", { name: "Reminders" }),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(api.setMyReminders).toHaveBeenCalledWith({
      enabled: false,
      intervals: [15, 30],
      breaks: [],
    });
  });

  it("says what is wrong and sends nothing when an interval is not a number", async () => {
    const dialog = await edit();

    const every = within(dialog).getByLabelText(/Remind every/);
    await userEvent.clear(every);
    await userEvent.type(every, "often");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /whole numbers/,
    );
    expect(api.setMyReminders).not.toHaveBeenCalled();
  });

  it("needs a name on every break before it sends", async () => {
    const dialog = await edit();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Add a break" }),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/name/);
    expect(api.setMyReminders).not.toHaveBeenCalled();
  });

  it("shows the API's sentence when two breaks overlap", async () => {
    api.setMyReminders.mockRejectedValue(
      new ApiError(
        422,
        "unprocessable",
        '"Lunch" and "Walk" overlap. Move one of them.',
      ),
    );
    const dialog = await edit();

    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /overlap/,
    );
  });

  it("offers the way back to the company default only when you have your own", async () => {
    const without = await edit();
    expect(
      within(without).queryByRole("button", { name: "Use company default" }),
    ).not.toBeInTheDocument();
  });

  it("goes back to the company default as its own act", async () => {
    api.myReminders.mockResolvedValue(reminders({ source: "PERSONAL" }));
    api.clearMyReminders.mockResolvedValue(
      reminders({ source: "ORGANISATION" }),
    );
    const dialog = await edit();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Use company default" }),
    );

    expect(api.clearMyReminders).toHaveBeenCalledTimes(1);
    expect(api.setMyReminders).not.toHaveBeenCalled();
  });
});

describe("the company default", () => {
  beforeEach(() => {
    held = new Set<PermissionKey>(["MANAGE_SETTINGS"]);
  });

  it("is a second card for an administrator, and saves to the company, not the person", async () => {
    api.setOrganisationReminders.mockResolvedValue(
      reminders({ source: "ORGANISATION" }),
    );
    const dialog = await edit(1);

    expect(
      within(dialog).getByText(
        /Applies to everybody who has not set their own\./,
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Use company default" }),
    ).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(api.setOrganisationReminders).toHaveBeenCalledWith({
      enabled: true,
      intervals: [15, 30],
      breaks: [],
    });
    expect(api.setMyReminders).not.toHaveBeenCalled();
  });
});
