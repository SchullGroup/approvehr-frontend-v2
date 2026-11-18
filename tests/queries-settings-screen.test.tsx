import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiQuerySettings } from "@/lib/api/queries";

/**
 * Queries in Settings: the switch and the three rules beside it.
 *
 * What is proved: the switch is off for a company that has not chosen, and turning it on asks
 * first, says what it does and **ends with the two things nobody should skip** (tell staff, and
 * have counsel review the wording and the privacy line); nothing is saved until it is confirmed;
 * turning it off is one press and says nothing was deleted; a server that did not say (one deploy
 * behind) gets no switch rather than "off"; somebody without the permission can read and not
 * change; the rules refuse a warning time longer than the reply time before anything is sent, and
 * show the server's own sentence when it refuses.
 */

const setFeature = vi.fn(async () => ({}));
let features: {
  flags: { queries: boolean };
  queriesSaid: boolean;
  editable: boolean;
  loading: boolean;
  saving: string | null;
  error: unknown;
  source: "api" | "demo";
};
vi.mock("@/lib/store/features", async (original) => ({
  ...(await original<typeof import("@/lib/store/features")>()),
  useFeatureSettings: () => ({ ...features, setFeature }),
}));

const updateSettings = vi.fn();
let settingsState: {
  data: ApiQuerySettings | null;
  loading: boolean;
  error: unknown;
  unavailable: boolean;
};
vi.mock("@/lib/store/queries", async (original) => ({
  ...(await original<typeof import("@/lib/store/queries")>()),
  useQuerySettings: () => ({ ...settingsState, reload: vi.fn() }),
  useQueriesSwitch: () => ({
    on: features.flags.queries,
    known: true,
    said: features.queriesSaid,
    editable: features.editable,
    error: null,
  }),
  useQueryActions: () => ({ updateSettings }),
}));

const { QueriesSettingsScreen } =
  await import("@/app/(app)/settings/queries/queries-settings-screen");

const mount = () =>
  render(
    <ToastProvider>
      <QueriesSettingsScreen />
    </ToastProvider>,
  );

const THE_SWITCH = /Use queries in this company/;

beforeEach(() => {
  vi.clearAllMocks();
  features = {
    flags: { queries: false },
    queriesSaid: true,
    editable: true,
    loading: false,
    saving: null,
    error: null,
    source: "api",
  };
  settingsState = {
    data: {
      replyHours: 48,
      warnHours: 24,
      issuerMayDecideIfSole: true,
      retention: "archive_only",
    },
    loading: false,
    error: null,
    unavailable: false,
  };
});

describe("the switch", () => {
  it("is off for a company that has not chosen", () => {
    mount();
    expect(screen.getByRole("switch", { name: THE_SWITCH })).not.toBeChecked();
  });

  it("asks first, and saves nothing until it is confirmed", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("switch", { name: THE_SWITCH }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Turn queries on?")).toBeInTheDocument();
    expect(setFeature).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(setFeature).not.toHaveBeenCalled();
  });

  it("says what it does, and ends with tell staff and have counsel review the wording and the privacy line", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("switch", { name: THE_SWITCH }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(
        /changes no pay, no employment status and no exit/,
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/never what it is about/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Turning it off later deletes nothing/),
    ).toBeInTheDocument();
    /* The last paragraph, in the order the dialog says it. */
    const paragraphs = Array.from(dialog.querySelectorAll("p")).map(
      (p) => p.textContent ?? "",
    );
    expect(paragraphs[paragraphs.length - 1]).toBe(
      "Tell your staff before you use it, and have your counsel review the letter wording and the privacy line before this is switched on for real staff.",
    );
  });

  it("switches it on once confirmed", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("switch", { name: THE_SWITCH }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Switch it on",
      }),
    );
    await waitFor(() =>
      expect(setFeature).toHaveBeenCalledWith("queries", true),
    );
  });

  it("turns it off in one press, without asking", async () => {
    const user = userEvent.setup();
    features.flags.queries = true;
    mount();
    await user.click(screen.getByRole("switch", { name: THE_SWITCH }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(setFeature).toHaveBeenCalledWith("queries", false),
    );
  });

  it("shows the server's own sentence when it refuses", async () => {
    const user = userEvent.setup();
    setFeature.mockRejectedValueOnce(
      new ApiError(403, "forbidden", "You need Manage settings to do that."),
    );
    mount();
    await user.click(screen.getByRole("switch", { name: THE_SWITCH }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Switch it on",
      }),
    );
    expect(
      await screen.findByText("You need Manage settings to do that."),
    ).toBeInTheDocument();
  });

  it("is read-only for somebody without the permission, and says why", () => {
    features.editable = false;
    mount();
    expect(screen.getByRole("switch", { name: THE_SWITCH })).toBeDisabled();
    expect(screen.getAllByText(/Manage settings/).length).toBeGreaterThan(0);
  });

  it("offers no switch where the server did not say, rather than 'off'", () => {
    features.queriesSaid = false;
    mount();
    expect(
      screen.queryByRole("switch", { name: THE_SWITCH }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/has not been updated to offer queries yet/),
    ).toBeInTheDocument();
  });

  it("offers no switch while the setting is still being read", () => {
    features.queriesSaid = false;
    features.loading = true;
    mount();
    expect(
      screen.queryByRole("switch", { name: THE_SWITCH }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Reading the setting")).toBeInTheDocument();
  });

  it("offers no switch when the setting could not be read, and says so", () => {
    features.queriesSaid = false;
    features.error = new ApiError(500, "server_error", "x");
    mount();
    expect(
      screen.queryByRole("switch", { name: THE_SWITCH }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/could not be read/)).toBeInTheDocument();
  });

  it("has no demo: it says the server is needed", () => {
    settingsState = {
      data: null,
      loading: false,
      error: null,
      unavailable: true,
    };
    mount();
    expect(screen.getByText("Queries need the API")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });
});

describe("the rules", () => {
  it("start from the server's figures and save only when something changed", () => {
    mount();
    expect(
      screen.getByRole("textbox", { name: /Usual time to reply/ }),
    ).toHaveValue("48");
    expect(screen.getByRole("textbox", { name: /Warn below/ })).toHaveValue(
      "24",
    );
    expect(
      screen.getByRole("button", { name: "Save the rules" }),
    ).toBeDisabled();
  });

  it("refuse a warning time longer than the reply time before anything is sent", async () => {
    const user = userEvent.setup();
    mount();
    const warn = screen.getByRole("textbox", { name: /Warn below/ });
    await user.clear(warn);
    await user.type(warn, "72");
    expect(
      screen.getByText(/cannot be longer than the usual reply time/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save the rules" }),
    ).toBeDisabled();
  });

  it("send all three figures and say saved", async () => {
    const user = userEvent.setup();
    updateSettings.mockResolvedValue({});
    mount();
    const reply = screen.getByRole("textbox", { name: /Usual time to reply/ });
    await user.clear(reply);
    await user.type(reply, "72");
    await user.click(
      screen.getByRole("switch", { name: /may decide it if nobody else can/ }),
    );
    await user.click(screen.getByRole("button", { name: "Save the rules" }));
    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({
        replyHours: 72,
        warnHours: 24,
        issuerMayDecideIfSole: false,
      }),
    );
  });

  it("say, as text, that a closed query is archived and never deleted", () => {
    mount();
    expect(screen.getByText(/archived and never deleted/)).toBeInTheDocument();
  });

  it("say nothing about retention when the server did not", () => {
    settingsState.data = {
      replyHours: 48,
      warnHours: 24,
      issuerMayDecideIfSole: true,
      retention: null,
    };
    mount();
    expect(
      screen.queryByText(/archived and never deleted/),
    ).not.toBeInTheDocument();
  });

  it("are read-only for somebody who may not change them", () => {
    features.editable = false;
    mount();
    expect(
      screen.getByRole("textbox", { name: /Usual time to reply/ }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Save the rules" }),
    ).not.toBeInTheDocument();
  });

  it("show the server's refusal as it came", async () => {
    const user = userEvent.setup();
    updateSettings.mockRejectedValueOnce(
      new ApiError(
        422,
        "unprocessable",
        "The warning threshold cannot be longer than the default reply time.",
      ),
    );
    mount();
    const reply = screen.getByRole("textbox", { name: /Usual time to reply/ });
    await user.clear(reply);
    await user.type(reply, "30");
    await user.click(screen.getByRole("button", { name: "Save the rules" }));
    expect(
      await screen.findByText(/cannot be longer than the default reply time/),
    ).toBeInTheDocument();
  });
});
