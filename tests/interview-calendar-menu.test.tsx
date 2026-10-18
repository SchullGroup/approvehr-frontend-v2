import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { CalendarMenu } from "@/components/hiring/interviews/calendar-menu";
import { ApiError } from "@/lib/api/client";
import type { InterviewView } from "@/lib/hiring/interviews/model";

/**
 * "Add to calendar" for one interview: two addresses and a file.
 *
 * Google and Outlook open the person's own calendar with the entry filled in; the file
 * comes from whichever side is in use and the screen only saves it. A refusal is shown
 * as the sentence the API wrote, and a cancelled interview has nothing to add.
 */

const download = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/download", () => ({
  downloadBlob: (...args: unknown[]) => download(...args),
}));

const interview: InterviewView = {
  id: "iv-1",
  applicationId: "pa-1",
  candidateName: "Chioma Aduba",
  role: "Payroll Analyst",
  kind: "PANEL",
  scheduledFor: "2026-10-20T09:00:00.000Z",
  durationMins: 45,
  status: "SCHEDULED",
  location: "Boardroom",
  joinUrl: "https://meet.google.com/abc-defg-hij",
  timeZone: "Africa/Lagos",
  stageName: null,
  panelists: [],
  sequence: 1,
  notices: null,
  cancelReason: null,
};

const FILE = {
  filename: "interview-chioma-aduba-2026-10-20.ics",
  blob: new Blob(["BEGIN:VCALENDAR"], { type: "text/calendar" }),
  note: null,
};

function open(over: Partial<React.ComponentProps<typeof CalendarMenu>> = {}) {
  const getFile = vi.fn(async () => FILE);
  render(
    <ToastProvider>
      <CalendarMenu
        interview={interview}
        who="staff"
        getFile={getFile}
        {...over}
      />
    </ToastProvider>,
  );
  return getFile;
}

beforeEach(() => {
  download.mockReset();
});

describe("the calendar menu", () => {
  it("offers Google Calendar, Outlook and a calendar file", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: /Add to calendar/ }));
    const menu = screen.getByRole("menu");
    const google = within(menu).getByRole("menuitem", {
      name: "Google Calendar",
    });
    const outlook = within(menu).getByRole("menuitem", { name: "Outlook" });
    expect(
      within(menu).getByRole("menuitem", { name: /Download \.ics/ }),
    ).toBeInTheDocument();

    const g = new URL(google.getAttribute("href") ?? "");
    expect(g.origin + g.pathname).toBe(
      "https://calendar.google.com/calendar/render",
    );
    expect(g.searchParams.get("text")).toBe("Panel interview: Chioma Aduba");
    expect(g.searchParams.get("dates")).toBe(
      "20261020T090000Z/20261020T094500Z",
    );
    expect(g.searchParams.get("location")).toBe("Boardroom");

    const o = new URL(outlook.getAttribute("href") ?? "");
    expect(o.origin + o.pathname).toBe(
      "https://outlook.live.com/calendar/0/deeplink/compose",
    );
    expect(o.searchParams.get("startdt")).toBe("2026-10-20T09:00:00.000Z");
    expect(o.searchParams.get("enddt")).toBe("2026-10-20T09:45:00.000Z");
  });

  it("opens the two addresses in a new tab that cannot reach back to this page", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: /Add to calendar/ }));
    for (const name of ["Google Calendar", "Outlook"]) {
      const link = screen.getByRole("menuitem", { name });
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
      expect(link.getAttribute("rel")).toContain("noreferrer");
    }
  });

  it("downloads the file the gateway made, under its own name, and says so", async () => {
    const user = userEvent.setup();
    const getFile = open();
    await user.click(screen.getByRole("button", { name: /Add to calendar/ }));
    await user.click(screen.getByRole("menuitem", { name: /Download \.ics/ }));
    await waitFor(() => expect(getFile).toHaveBeenCalled());
    await waitFor(() =>
      expect(download).toHaveBeenCalledWith(
        "interview-chioma-aduba-2026-10-20.ics",
        FILE.blob,
      ),
    );
    expect(
      await screen.findByText(
        "Downloaded interview-chioma-aduba-2026-10-20.ics",
      ),
    ).toBeInTheDocument();
  });

  it("says what a practice copy of the file is, when the gateway says so", async () => {
    const user = userEvent.setup();
    open({
      getFile: async () => ({
        ...FILE,
        note: "This file was made in this browser.",
      }),
    });
    await user.click(screen.getByRole("button", { name: /Add to calendar/ }));
    await user.click(screen.getByRole("menuitem", { name: /Download \.ics/ }));
    expect(
      await screen.findByText("This file was made in this browser."),
    ).toBeInTheDocument();
  });

  it("shows the API's sentence when the file is refused, and downloads nothing", async () => {
    const user = userEvent.setup();
    open({
      getFile: async () => {
        throw new ApiError(404, "not_found", "That interview was not found.");
      },
    });
    await user.click(screen.getByRole("button", { name: /Add to calendar/ }));
    await user.click(screen.getByRole("menuitem", { name: /Download \.ics/ }));
    expect(
      await screen.findByText("That interview was not found."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The calendar file was not downloaded"),
    ).toBeInTheDocument();
    expect(download).not.toHaveBeenCalled();
  });

  it("says something plain when the failure is not the API's", async () => {
    const user = userEvent.setup();
    open({
      getFile: async () => {
        throw new Error("boom");
      },
    });
    await user.click(screen.getByRole("button", { name: /Add to calendar/ }));
    await user.click(screen.getByRole("menuitem", { name: /Download \.ics/ }));
    expect(
      await screen.findByText("Something went wrong. Try again."),
    ).toBeInTheDocument();
  });

  it("copies the join link", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    open();
    await user.click(screen.getByRole("button", { name: /Add to calendar/ }));
    await user.click(screen.getByRole("menuitem", { name: "Copy join link" }));
    expect(writeText).toHaveBeenCalledWith(
      "https://meet.google.com/abc-defg-hij",
    );
    expect(await screen.findByText("Join link copied")).toBeInTheDocument();
  });

  it("offers no copy when there is no link, or when the caller has its own", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <ToastProvider>
        <CalendarMenu
          interview={{ ...interview, joinUrl: null }}
          who="staff"
          getFile={async () => FILE}
        />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: /Add to calendar/ }));
    expect(
      screen.queryByRole("menuitem", { name: "Copy join link" }),
    ).toBeNull();
    unmount();
    open({ copyLink: false });
    await user.click(screen.getByRole("button", { name: /Add to calendar/ }));
    expect(
      screen.queryByRole("menuitem", { name: "Copy join link" }),
    ).toBeNull();
  });

  it("closes on Escape and gives focus back to the button", async () => {
    const user = userEvent.setup();
    open();
    const button = screen.getByRole("button", { name: /Add to calendar/ });
    await user.click(button);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button).toHaveFocus();
  });

  it("is not there for an interview that is cancelled or has happened", () => {
    for (const status of ["CANCELLED", "COMPLETED", "NO_SHOW"] as const) {
      const { unmount } = render(
        <ToastProvider>
          <CalendarMenu
            interview={{ ...interview, status }}
            who="staff"
            getFile={async () => FILE}
          />
        </ToastProvider>,
      );
      expect(
        screen.queryByRole("button", { name: /Add to calendar/ }),
        status,
      ).toBeNull();
      unmount();
    }
  });

  it("builds a panelist's entry with the note about the scorecard, and from nothing but what it was given", async () => {
    const user = userEvent.setup();
    open({ who: "panelist" });
    await user.click(screen.getByRole("button", { name: /Add to calendar/ }));
    const g = new URL(
      screen
        .getByRole("menuitem", { name: "Google Calendar" })
        .getAttribute("href") ?? "",
    );
    expect(g.searchParams.get("details")).toContain("My interviews");
    expect(g.searchParams.get("details")).not.toMatch(/@|salary|phone/i);
  });
});
