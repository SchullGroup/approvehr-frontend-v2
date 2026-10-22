import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import {
  CONSENT_VERSION,
  TODAY,
  consents,
  paged,
  settings,
} from "./wellness-fixtures";

/**
 * Overview: the consent comes first, and what follows is the person's own.
 *
 * The API client is replaced, so what is asserted is what the screen asks for
 * and what it says with the answers. The rules worth pinning are the ones that
 * hold the privacy argument up on this side of the wire: nothing about a log is
 * requested before the person agrees, withdrawing makes them choose whether the
 * log goes, and a day with nothing logged is never drawn or written as zero.
 */

const api = vi.hoisted(() => ({
  settings: vi.fn(),
  consents: vi.fn(),
  grantConsent: vi.fn(),
  withdrawConsent: vi.fn(),
  summary: vi.fn(),
  logs: vi.fn(),
  addLog: vi.fn(),
  deleteLog: vi.fn(),
  eraseLogs: vi.fn(),
}));

vi.mock("@/lib/api/wellness", async (original) => ({
  ...(await original<typeof import("@/lib/api/wellness")>()),
  wellnessApi: api,
}));

vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({ isConnected: true, employeeId: "e-me" }),
  useOrgTimezone: () => "Africa/Lagos",
}));

vi.mock("@/lib/use-today", () => ({ useToday: () => "2026-10-21" }));

import { OverviewScreen } from "@/app/(app)/wellness/overview-screen";

const summary = (days: { day: string; metric: string; total: number }[]) => ({
  from: "2026-10-15",
  to: TODAY,
  days,
});

const entry = (over: Record<string, unknown> = {}) => ({
  id: "log-1",
  metric: "WATER_ML",
  value: 250,
  day: TODAY,
  source: "MANUAL",
  createdAt: "2026-10-21T09:00:00.000Z",
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  api.settings.mockResolvedValue(settings());
  api.consents.mockResolvedValue(consents(true));
  api.summary.mockResolvedValue(summary([]));
  api.logs.mockResolvedValue(paged([]));
});

describe("before the person has agreed", () => {
  beforeEach(() => {
    api.consents.mockResolvedValue(consents(false));
  });

  it("shows the API's wording and the floor, and nothing to log into", async () => {
    render(<OverviewScreen />);

    expect(
      await screen.findByText("Keep a private record of your water and steps"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Nobody at your company can see these entries/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/totals only once at least 3 people take part/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Add water")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Add steps")).not.toBeInTheDocument();
  });

  it("does not ask for a single entry or total until they agree", async () => {
    render(<OverviewScreen />);
    await screen.findByRole("button", { name: "Turn on tracking" });

    expect(api.summary).not.toHaveBeenCalled();
    expect(api.logs).not.toHaveBeenCalled();
  });

  it("agrees to the wording version it showed, then shows the log", async () => {
    api.grantConsent.mockResolvedValue(consents(true));
    api.consents
      .mockResolvedValueOnce(consents(false))
      .mockResolvedValue(consents(true));
    render(<OverviewScreen />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Turn on tracking" }),
    );

    expect(api.grantConsent).toHaveBeenCalledWith(
      "SELF_TRACKING",
      CONSENT_VERSION,
    );
    expect(
      await screen.findByRole("heading", { name: "Water" }),
    ).toBeInTheDocument();
  });

  it("shows the new wording again when the API says it has moved on", async () => {
    api.grantConsent.mockRejectedValue(
      new ApiError(409, "conflict", "The wording has changed.", {
        reason: "consent_stale",
        currentVersion: "2026-10-21.1",
      }),
    );
    render(<OverviewScreen />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Turn on tracking" }),
    );

    /* It asked again, and it did not retry the grant with the old version. */
    await waitFor(() => expect(api.consents).toHaveBeenCalledTimes(2));
    expect(api.grantConsent).toHaveBeenCalledTimes(1);
  });

  it("does not offer the agreement while it cannot say what the floor is", async () => {
    api.settings.mockRejectedValue(new ApiError(500, "internal", "Broke."));
    render(<OverviewScreen />);

    expect(
      await screen.findByText("The privacy floor did not load"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Turn on tracking" }),
    ).not.toBeInTheDocument();
  });

  it("says when they last turned it off", async () => {
    api.consents.mockResolvedValue(
      consents(false, { withdrawnAt: "2026-10-10T08:00:00.000Z" }),
    );
    render(<OverviewScreen />);
    expect(
      await screen.findByText(/You turned this off on 10 Oct 2026/),
    ).toBeInTheDocument();
  });
});

describe("while tracking", () => {
  it("does not need the floor setting to show somebody their own week", async () => {
    api.settings.mockRejectedValue(new ApiError(500, "internal", "Broke."));
    render(<OverviewScreen />);

    expect(
      await screen.findByRole("heading", { name: "Water" }),
    ).toBeInTheDocument();
    expect(api.settings).not.toHaveBeenCalled();
  });

  it("never writes a day with nothing logged as zero", async () => {
    api.summary.mockResolvedValue(
      summary([
        { day: "2026-10-19", metric: "STEPS", total: 8000 },
        { day: TODAY, metric: "STEPS", total: 4000 },
      ]),
    );
    render(<OverviewScreen />);

    expect(await screen.findByText("Today, 4,000 steps")).toBeInTheDocument();
    expect(screen.getByText("Nothing logged today")).toBeInTheDocument();
    expect(
      screen.getByText("Last 7 days, 12,000 steps over 2 days"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Nothing logged in the last 7 days"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\b0 ml/)).not.toBeInTheDocument();
  });

  it("adds an entry for today and asks again", async () => {
    api.addLog.mockResolvedValue(entry());
    render(<OverviewScreen />);
    const water = await screen.findByLabelText("Add water");

    await userEvent.type(water, "250{Enter}");

    expect(api.addLog).toHaveBeenCalledWith({ metric: "WATER_ML", value: 250 });
    await waitFor(() => expect(api.summary).toHaveBeenCalledTimes(2));
  });

  it("adds the quick amount without typing", async () => {
    api.addLog.mockResolvedValue(entry({ value: 500 }));
    render(<OverviewScreen />);

    await userEvent.click(
      await screen.findByRole("button", { name: "+500 ml" }),
    );

    expect(api.addLog).toHaveBeenCalledWith({ metric: "WATER_ML", value: 500 });
  });

  it("says what is wrong with an entry and sends nothing", async () => {
    render(<OverviewScreen />);
    const steps = await screen.findByLabelText("Add steps");

    await userEvent.type(steps, "lots{Enter}");

    expect(await screen.findByText("Use a whole number.")).toBeInTheDocument();
    expect(api.addLog).not.toHaveBeenCalled();
  });

  it("shows the API's own refusal in the form", async () => {
    api.addLog.mockRejectedValue(
      new ApiError(
        422,
        "unprocessable",
        "That would take the day's water past 10,000 ml, the most one day can hold.",
      ),
    );
    render(<OverviewScreen />);

    await userEvent.type(
      await screen.findByLabelText("Add water"),
      "3000{Enter}",
    );

    expect(
      await screen.findByText(/the most one day can hold/),
    ).toBeInTheDocument();
  });

  it("goes back to asking for consent if it was taken away elsewhere", async () => {
    api.addLog.mockRejectedValue(
      new ApiError(422, "consent_required", "Turn on tracking first.", {
        reason: "consent_required",
        purpose: "SELF_TRACKING",
        state: "withdrawn",
      }),
    );
    render(<OverviewScreen />);

    await userEvent.type(
      await screen.findByLabelText("Add water"),
      "250{Enter}",
    );

    await waitFor(() => expect(api.consents).toHaveBeenCalledTimes(2));
  });

  it("lists the entries and deletes one", async () => {
    api.logs.mockResolvedValue(paged([entry()]));
    api.deleteLog.mockResolvedValue({ id: "log-1", deleted: true });
    render(<OverviewScreen />);

    await userEvent.click(
      await screen.findByRole("button", { name: /Your entries/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Delete 250 ml, Today" }),
    );

    expect(api.deleteLog).toHaveBeenCalledWith("log-1");
  });

  it("marks a total from the phone, and says it counts instead of typed steps", async () => {
    api.logs.mockResolvedValue(
      paged([
        entry({ id: "d1", metric: "STEPS", value: 9000, source: "DEVICE" }),
      ]),
    );
    render(<OverviewScreen />);

    await userEvent.click(
      await screen.findByRole("button", { name: /Your entries/ }),
    );
    expect(screen.getByText("From phone")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "About steps from your phone" }),
    ).toBeInTheDocument();
  });
});

describe("stopping", () => {
  const openStop = async () => {
    render(<OverviewScreen />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Your data" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Stop tracking" }),
    );
  };

  it("makes them choose whether the log goes, and chooses nothing for them", async () => {
    await openStop();

    const confirm = await screen.findByRole("button", {
      name: "Stop tracking",
    });
    expect(confirm).toBeDisabled();
    expect(screen.getByLabelText(/Keep it/)).not.toBeChecked();
    expect(screen.getByLabelText(/Delete it/)).not.toBeChecked();
    expect(api.withdrawConsent).not.toHaveBeenCalled();
  });

  it("keeps the log when they say keep it", async () => {
    api.withdrawConsent.mockResolvedValue(consents(false));
    await openStop();

    await userEvent.click(await screen.findByLabelText(/Keep it/));
    await userEvent.click(
      screen.getByRole("button", { name: "Stop tracking" }),
    );

    expect(api.withdrawConsent).toHaveBeenCalledWith("SELF_TRACKING", false);
  });

  it("deletes the log when they say delete it", async () => {
    api.withdrawConsent.mockResolvedValue(consents(false));
    await openStop();

    await userEvent.click(await screen.findByLabelText(/Delete it/));
    await userEvent.click(
      screen.getByRole("button", { name: "Stop tracking" }),
    );

    expect(api.withdrawConsent).toHaveBeenCalledWith("SELF_TRACKING", true);
  });

  it("asks before deleting everything, and then deletes it", async () => {
    api.eraseLogs.mockResolvedValue({ deleted: 4 });
    render(<OverviewScreen />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Your data" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Delete everything I logged" }),
    );

    expect(api.eraseLogs).not.toHaveBeenCalled();
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete everything" }),
    );
    expect(api.eraseLogs).toHaveBeenCalledTimes(1);
  });

  it("offers to stop syncing from the phone only when that is on", async () => {
    api.consents.mockResolvedValue(consents(true, { deviceSync: true }));
    render(<OverviewScreen />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Your data" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "Stop syncing from my phone" }),
    ).toBeInTheDocument();
  });
});

describe("when it cannot load", () => {
  it("says so, and does not say there is nothing logged", async () => {
    api.summary.mockRejectedValue(
      new ApiError(500, "internal", "Something broke."),
    );
    render(<OverviewScreen />);

    expect(
      await screen.findByText("Your week did not load"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Nothing logged today")).not.toBeInTheDocument();
    expect(screen.queryByText("Nothing logged yet.")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Try again/ }),
    ).toBeInTheDocument();
  });

  it("shows the API's sentence when a staff record is missing", async () => {
    api.consents.mockRejectedValue(
      new ApiError(
        422,
        "unprocessable",
        "This sign-in is not linked to a staff record, so it cannot keep a wellness record.",
      ),
    );
    render(<OverviewScreen />);
    expect(
      await screen.findByText(/not linked to a staff record/),
    ).toBeInTheDocument();
  });
});
