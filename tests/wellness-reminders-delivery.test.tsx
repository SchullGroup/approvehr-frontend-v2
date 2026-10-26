import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionKey } from "@/lib/permission-keys";
import type { PushState } from "@/lib/store/push";
import { reminders, settings } from "./wellness-fixtures";

/**
 * What the Reminders tab says about delivery, and what it must not claim.
 *
 * The API now sends reminders (a scheduler, from a saved policy) and says what
 * the screen may promise: nothing is sent until somebody saves, only while at
 * work, once each, your own settings first, and nobody can see whether you
 * received one. The failure this pins is the one that was on the screen: the
 * built-in 15 and 30 minutes drawn as if they were switched on.
 *
 * Every assertion here is a wrong claim that type-checks.
 */

const api = vi.hoisted(() => ({
  myReminders: vi.fn(),
  setMyReminders: vi.fn(),
  clearMyReminders: vi.fn(),
  setOrganisationReminders: vi.fn(),
  settings: vi.fn(),
}));
const push = vi.hoisted(() => ({
  state: "off" as PushState,
  error: null as string | null,
  busy: false,
  enable: vi.fn(),
}));

vi.mock("@/lib/api/wellness", async (original) => ({
  ...(await original<typeof import("@/lib/api/wellness")>()),
  wellnessApi: api,
}));
vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({ isConnected: true, employeeId: "e-me" }),
}));
vi.mock("@/lib/store/push", () => ({
  usePush: () => ({
    state: push.state,
    devices: [],
    error: push.error,
    busy: push.busy,
    enable: push.enable,
    disable: vi.fn(),
    reload: vi.fn(),
  }),
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
  push.state = "off";
  push.error = null;
  push.busy = false;
  api.myReminders.mockResolvedValue(reminders());
  api.settings.mockResolvedValue(settings());
});

/** The whole screen's words, for the checks about what must never appear. */
async function screenText(): Promise<string> {
  const { container } = render(<RemindersScreen />);
  await screen.findByText("How reminders reach you");
  return container.textContent ?? "";
}

/* ----------------------------------------------- nothing is sent until saved */

describe("before anything is saved", () => {
  it("does not draw the built-in default as if it were switched on", async () => {
    render(<RemindersScreen />);
    await screen.findByText("The built-in default");
    const card = screen
      .getByRole("heading", { name: /Your reminders/ })
      .closest("section, article, div[class*='rounded']") as HTMLElement;
    /* Not "On", and not a plain "Every": these are suggestions. */
    expect(within(card).getByText("Not set up")).toBeInTheDocument();
    expect(within(card).queryByText("On")).toBeNull();
    expect(within(card).getByText("Suggested")).toBeInTheDocument();
    expect(within(card).queryByText("Every")).toBeNull();
  });

  it("says in plain words that nothing is sent, and makes setting up the call to action", async () => {
    render(<RemindersScreen />);
    expect(
      await screen.findByText(
        "Nothing is sent to you until you save reminders. These are the suggested times.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Set up reminders" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("makes Save the way through, and says so in the dialog", async () => {
    render(<RemindersScreen />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Set up reminders" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        "These are suggestions. Nothing is sent until you press Save.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Save" }),
    ).toBeInTheDocument();
  });

  it("says the same about the company default to the person who can save it", async () => {
    held = new Set<PermissionKey>(["MANAGE_SETTINGS"]);
    render(<RemindersScreen />);
    expect(
      await screen.findByText(
        "Nothing is sent to anybody until a default is saved. These are the suggested times.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Set up the default" }),
    ).toBeInTheDocument();
  });

  it("does not say it to somebody who may not save a company default", async () => {
    render(<RemindersScreen />);
    await screen.findByText("The built-in default");
    expect(screen.queryByText(/until a default is saved/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Set up the default" }),
    ).toBeNull();
  });
});

describe("once something is saved", () => {
  it("draws it as the policy it is, with no warning", async () => {
    api.myReminders.mockResolvedValue(
      reminders({ source: "PERSONAL", intervals: [20, 45] }),
    );
    render(<RemindersScreen />);
    await screen.findByText("Your own settings");
    expect(screen.getByText("On")).toBeInTheDocument();
    expect(screen.getByText("Every")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing is sent/)).toBeNull();
    expect(screen.queryByText("Not set up")).toBeNull();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("is a saved policy too when the company's default is the one that applies", async () => {
    api.myReminders.mockResolvedValue(reminders({ source: "ORGANISATION" }));
    render(<RemindersScreen />);
    await screen.findByText("The company default");
    expect(screen.getByText("On")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing is sent to you/)).toBeNull();
  });

  it("says off when it is saved and switched off, not that it is not set up", async () => {
    api.myReminders.mockResolvedValue(
      reminders({ source: "PERSONAL", enabled: false }),
    );
    render(<RemindersScreen />);
    await screen.findByText("Your own settings");
    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(screen.queryByText("Not set up")).toBeNull();
  });
});

/* ------------------------------------------------------------- the delivery card */

describe("how reminders reach you", () => {
  it("says each of the five things, in plain words", async () => {
    const text = await screenText();
    expect(text).toMatch(
      /Sent as notifications to your phone and browser, where you have allowed them\./,
    );
    expect(text).toMatch(/Only while you are at work/);
    expect(text).toMatch(
      /if your company records attendance, only while you are clocked in/,
    );
    expect(text).toMatch(
      /Not on rest days, public holidays or approved leave\./,
    );
    expect(text).toMatch(/Your own settings win\./);
    expect(text).toMatch(
      /Switching reminders off for yourself stops yours, even if your company has them on\./,
    );
    expect(text).toMatch(
      /Each one comes once, at the minute marks of the clock\./,
    );
    expect(text).toMatch(/15-minute reminder arrives at :00, :15, :30 and :45/);
    expect(text).toMatch(/a named break arrives when it starts/);
    expect(text).toMatch(/A missed one is not sent again\./);
    expect(text).toMatch(
      /Nobody at your company can see whether you received or opened a reminder/,
    );
    expect(text).toMatch(/never says anything about your health/);
  });

  it("never uses the words the API says to keep out", async () => {
    const text = await screenText();
    /* The API cannot tell the screen whether a device rang, and records no act. */
    expect(text).not.toMatch(/deliver/i);
    expect(text).not.toMatch(/\bread\b/i);
    expect(text).not.toMatch(/snooze/i);
    /* And no count of reminders sent, received or acted on. */
    expect(text).not.toMatch(/\d+\s+(reminders?\s+)?(sent|received|opened)/i);
  });

  it("has no em dash", async () => {
    expect(await screenText()).not.toMatch(/—/);
  });
});

/* ---------------------------------------------------- this browser, as a fact */

describe("this browser", () => {
  it("offers to turn notifications on when it has none, and does it from here", async () => {
    push.state = "off";
    render(<RemindersScreen />);
    expect(
      await screen.findByText("This browser is not set up for them yet."),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Turn on in this browser" }),
    );
    expect(push.enable).toHaveBeenCalledTimes(1);
  });

  it("says a failure to turn them on in the browser's own words", async () => {
    push.state = "off";
    push.error = "This browser refused to subscribe. Nothing has changed.";
    render(<RemindersScreen />);
    expect(
      await screen.findByText(
        "This browser refused to subscribe. Nothing has changed.",
      ),
    ).toBeInTheDocument();
  });

  it("says it is set up, as a fact about the browser and not about any reminder", async () => {
    push.state = "on";
    render(<RemindersScreen />);
    expect(
      await screen.findByText("This browser is set up for them."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Turn on in this browser" }),
    ).toBeNull();
  });

  it("does not offer a button that cannot work when the browser has blocked them", async () => {
    push.state = "blocked";
    render(<RemindersScreen />);
    expect(
      await screen.findByText(
        /Only the browser.s own site settings can change that\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Turn on in this browser" }),
    ).toBeNull();
  });

  it("says a browser that cannot show notifications cannot, and offers nothing", async () => {
    push.state = "unsupported";
    render(<RemindersScreen />);
    expect(
      await screen.findByText("This browser cannot show notifications."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Turn on in this browser" }),
    ).toBeNull();
  });

  it("says nothing while it is still working out which of those it is", async () => {
    push.state = "loading";
    render(<RemindersScreen />);
    await screen.findByText("How reminders reach you");
    expect(screen.queryByText(/This browser/)).toBeNull();
  });
});
