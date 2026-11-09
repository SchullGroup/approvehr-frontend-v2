import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { PermissionKey } from "@/lib/permission-keys";
import { settings } from "./wellness-fixtures";

/**
 * The privacy floor, and the frame the screens sit in.
 *
 * The floor field must not be able to send a number the API would refuse, and
 * must not be there at all for somebody who cannot change it. The frame says the
 * module is off in one place, keeps walking away on offer, and shows a Settings
 * tab only to people who can use it.
 */

const api = vi.hoisted(() => ({
  settings: vi.fn(),
  setPrivacyFloor: vi.fn(),
  eraseLogs: vi.fn(),
  withdrawConsent: vi.fn(),
}));

vi.mock("@/lib/api/wellness", async (original) => ({
  ...(await original<typeof import("@/lib/api/wellness")>()),
  wellnessApi: api,
}));

let connected = true;
vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({ isConnected: connected, employeeId: "e-me" }),
}));

let held = new Set<PermissionKey>();
vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  useCan: (permission: PermissionKey) => held.has(permission),
}));

let features = { loading: false, error: null as unknown, wellness: true };
vi.mock("@/lib/store/features", async (original) => ({
  ...(await original<typeof import("@/lib/store/features")>()),
  useFeatures: () => ({ ...features, reload: vi.fn() }),
}));

vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title, tabs }: { title: string; tabs?: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {tabs}
    </header>
  ),
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));

import { SettingsScreen } from "@/app/(app)/wellness/settings-screen";
import { WellnessShell } from "@/app/(app)/wellness/wellness-shell";

beforeEach(() => {
  vi.resetAllMocks();
  held = new Set<PermissionKey>(["MANAGE_SETTINGS"]);
  connected = true;
  features = { loading: false, error: null, wellness: true };
  api.settings.mockResolvedValue(settings());
});

describe("the privacy floor", () => {
  const field = async () => {
    render(<SettingsScreen />);
    return screen.findByLabelText(/People/);
  };

  it("shows the number in force and the limits the API reads out", async () => {
    const input = await field();
    expect(input).toHaveValue("3");
    expect(screen.getByText("In force now, 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("will not let a number under the minimum be sent", async () => {
    const input = await field();
    await userEvent.clear(input);
    await userEvent.type(input, "2");

    expect(
      await screen.findByText("Use a whole number from 3 to 50."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(api.setPrivacyFloor).not.toHaveBeenCalled();
  });

  it("will not let a number over the maximum, or a word, be sent", async () => {
    const input = await field();
    await userEvent.clear(input);
    await userEvent.type(input, "51");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await userEvent.clear(input);
    await userEvent.type(input, "five");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("raises it, and asks again for the figure in force", async () => {
    api.setPrivacyFloor.mockResolvedValue(settings({ privacyFloor: 5 }));
    api.settings
      .mockResolvedValueOnce(settings())
      .mockResolvedValue(settings({ privacyFloor: 5 }));
    const input = await field();

    await userEvent.clear(input);
    await userEvent.type(input, "5");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(api.setPrivacyFloor).toHaveBeenCalledWith(5);
    expect(await screen.findByText("In force now, 5")).toBeInTheDocument();
  });

  it("raises it without asking first", async () => {
    api.setPrivacyFloor.mockResolvedValue(settings({ privacyFloor: 5 }));
    const input = await field();
    await userEvent.clear(input);
    await userEvent.type(input, "5");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(api.setPrivacyFloor).toHaveBeenCalledWith(5));
  });

  describe("lowering it", () => {
    beforeEach(() => {
      api.settings.mockResolvedValue(settings({ privacyFloor: 6 }));
    });

    const lowerTo = async (to: string) => {
      const input = await field();
      await userEvent.clear(input);
      await userEvent.type(input, to);
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      return screen.findByRole("dialog");
    };

    it("asks first, in plain words, and sends nothing yet", async () => {
      const confirm = await lowerTo("4");

      expect(
        within(confirm).getByText("Lower the floor to 4?"),
      ).toBeInTheDocument();
      expect(
        within(confirm).getByText(
          /Fewer people will be needed before a team result is shown/,
        ),
      ).toBeInTheDocument();
      /* The minimum is said, so nobody thinks it can go lower still. */
      expect(
        within(confirm).getByText(/can never go below 3/),
      ).toBeInTheDocument();
      expect(api.setPrivacyFloor).not.toHaveBeenCalled();
    });

    it("saves once it is agreed", async () => {
      api.setPrivacyFloor.mockResolvedValue(settings({ privacyFloor: 4 }));
      api.settings
        .mockResolvedValueOnce(settings({ privacyFloor: 6 }))
        .mockResolvedValue(settings({ privacyFloor: 4 }));
      const confirm = await lowerTo("4");
      await userEvent.click(
        within(confirm).getByRole("button", { name: "Lower to 4" }),
      );

      expect(api.setPrivacyFloor).toHaveBeenCalledTimes(1);
      expect(api.setPrivacyFloor).toHaveBeenCalledWith(4);
      expect(await screen.findByText("In force now, 4")).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("leaves it alone when it is not agreed", async () => {
      const confirm = await lowerTo("4");
      await userEvent.click(
        within(confirm).getByRole("button", { name: "Cancel" }),
      );

      expect(api.setPrivacyFloor).not.toHaveBeenCalled();
      expect(screen.getByText("In force now, 6")).toBeInTheDocument();
      /* And the number typed is still there to change or to save again. */
      expect(screen.getByLabelText(/People/)).toHaveValue("4");
    });

    it("goes down to the minimum the same way, and no further", async () => {
      api.setPrivacyFloor.mockResolvedValue(settings({ privacyFloor: 3 }));
      const confirm = await lowerTo("3");
      expect(
        within(confirm).getByText("Lower the floor to 3?"),
      ).toBeInTheDocument();
      await userEvent.click(
        within(confirm).getByRole("button", { name: "Lower to 3" }),
      );
      await waitFor(() => expect(api.setPrivacyFloor).toHaveBeenCalledWith(3));
    });

    it("never opens the confirm for a number the API would refuse", async () => {
      const input = await field();
      await userEvent.clear(input);
      await userEvent.type(input, "2");

      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("shows the API's refusal after it was agreed, in the form and not the dialog", async () => {
      api.setPrivacyFloor.mockRejectedValue(
        new ApiError(
          403,
          "forbidden",
          "You do not have permission to change this.",
        ),
      );
      const confirm = await lowerTo("4");
      await userEvent.click(
        within(confirm).getByRole("button", { name: "Lower to 4" }),
      );

      expect(
        await screen.findByText(/do not have permission/),
      ).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("also asks when the form is submitted with Enter", async () => {
      const input = await field();
      await userEvent.clear(input);
      await userEvent.type(input, "5{Enter}");

      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      expect(api.setPrivacyFloor).not.toHaveBeenCalled();
    });
  });

  it("shows the API's refusal if it is refused anyway", async () => {
    api.setPrivacyFloor.mockRejectedValue(
      new ApiError(
        403,
        "forbidden",
        "You do not have permission to change this.",
      ),
    );
    const input = await field();
    await userEvent.clear(input);
    await userEvent.type(input, "4");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(/do not have permission/),
    ).toBeInTheDocument();
  });

  it("is not there for somebody who cannot change it, and asks the API nothing", async () => {
    held = new Set();
    render(<SettingsScreen />);

    expect(
      await screen.findByText("You cannot change these"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/People/)).not.toBeInTheDocument();
    expect(api.settings).not.toHaveBeenCalled();
  });
});

describe("the frame", () => {
  it("has five tabs for everybody and a sixth for whoever can change the floor", () => {
    held = new Set();
    const { unmount } = render(
      <WellnessShell active="/wellness">
        <p>content</p>
      </WellnessShell>,
    );
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Overview",
      "Challenges",
      "Reminders",
      "Recognition",
      "Delivery",
    ]);
    unmount();

    held = new Set<PermissionKey>(["MANAGE_SETTINGS"]);
    render(
      <WellnessShell active="/wellness">
        <p>content</p>
      </WellnessShell>,
    );
    expect(screen.getAllByRole("link").at(-1)).toHaveTextContent("Settings");
  });

  it("keeps Delivery in front of Settings, and points it at its own route", () => {
    held = new Set<PermissionKey>(["MANAGE_SETTINGS"]);
    render(
      <WellnessShell active="/wellness/delivery">
        <p>content</p>
      </WellnessShell>,
    );
    const labels = screen.getAllByRole("link").map((a) => a.textContent);
    expect(labels.slice(-2)).toEqual(["Delivery", "Settings"]);
    expect(screen.getByRole("link", { name: "Delivery" })).toHaveAttribute(
      "href",
      "/wellness/delivery",
    );
    expect(screen.getByRole("link", { name: "Delivery" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("marks the tab that is open", () => {
    render(
      <WellnessShell active="/wellness/recognition">
        <p>content</p>
      </WellnessShell>,
    );
    expect(screen.getByRole("link", { name: "Recognition" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("shows the screen when the company has it on", () => {
    render(
      <WellnessShell active="/wellness">
        <p>content</p>
      </WellnessShell>,
    );
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("says it is off in one place, and sends an administrator to the switch", () => {
    features = { loading: false, error: null, wellness: false };
    render(
      <WellnessShell active="/wellness">
        <p>content</p>
      </WellnessShell>,
    );
    expect(screen.queryByText("content")).not.toBeInTheDocument();
    expect(screen.getByText("Wellness is switched off")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open features" })).toHaveAttribute(
      "href",
      "/settings/features",
    );
  });

  it("tells everybody else to ask, without a link they cannot use", () => {
    held = new Set();
    features = { loading: false, error: null, wellness: false };
    render(
      <WellnessShell active="/wellness">
        <p>content</p>
      </WellnessShell>,
    );
    expect(
      screen.getByText("Ask an administrator to switch it on."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Open features" }),
    ).not.toBeInTheDocument();
  });

  it("keeps walking away on offer while it is off", async () => {
    features = { loading: false, error: null, wellness: false };
    api.eraseLogs.mockResolvedValue({ deleted: 2 });
    render(
      <WellnessShell active="/wellness">
        <p>content</p>
      </WellnessShell>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Your data" }));
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Delete everything I logged" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete everything" }),
    );

    await waitFor(() => expect(api.eraseLogs).toHaveBeenCalledTimes(1));
  });

  it("does not guess while the company's flags are still loading", () => {
    features = { loading: true, error: null, wellness: false };
    render(
      <WellnessShell active="/wellness">
        <p>content</p>
      </WellnessShell>,
    );
    expect(
      screen.queryByText("Wellness is switched off"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("content")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("says why there is no demo, and shows nothing else", () => {
    connected = false;
    render(
      <WellnessShell active="/wellness">
        <p>content</p>
      </WellnessShell>,
    );
    expect(screen.getByText("Wellness needs the API")).toBeInTheDocument();
    expect(screen.queryByText("content")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("main")).queryByText("Wellness is switched off"),
    ).not.toBeInTheDocument();
  });
});
