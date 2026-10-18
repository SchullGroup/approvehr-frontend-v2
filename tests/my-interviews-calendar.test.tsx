import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoInterviews } from "@/lib/hiring/interviews/demo-store";
import { demoPipeline } from "@/lib/hiring/pipeline/demo-store";
import { renderInToasts } from "./pipeline-workspace-helpers";

/**
 * "My interviews", in a practice workspace: the link to join and the calendar.
 *
 * A panelist can add an interview they were invited to into their own calendar, or copy
 * the link. What goes into the entry is only what a panelist is given: the candidate's
 * name, the role, the time, the place and the link, and the note about the scorecard.
 */

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({
    isConnected: false,
    isLoading: false,
    user: null,
    organization: undefined,
    employeeId: null,
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => false,
  usePermissions: () => ({ can: () => false, loading: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/hiring/my-interviews",
  useSearchParams: () => new URLSearchParams(),
}));
const download = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/download", () => ({
  downloadBlob: (...args: unknown[]) => download(...args),
}));

const { MyInterviewsScreen } =
  await import("@/app/(app)/hiring/my-interviews/my-interviews-screen");
const { MyApplicationScreen } =
  await import("@/app/(app)/hiring/my-interviews/[id]/my-application-screen");

beforeEach(() => {
  window.localStorage?.clear?.();
  demoPipeline.reset();
  demoInterviews.reset();
  download.mockReset();
});

describe("my interviews: join and calendar", () => {
  it("shows the link to join and an Add to calendar menu for an interview still to come", async () => {
    const user = userEvent.setup();
    renderInToasts(<MyInterviewsScreen />);
    await user.click(await screen.findByRole("radio", { name: "All of mine" }));
    const rows = await screen.findAllByRole("listitem");
    const coming = rows.find((row) => within(row).queryByText("Coming up"));
    expect(coming).toBeDefined();
    const row = coming as HTMLElement;
    expect(
      within(row).getByRole("link", { name: /Join the call/ }),
    ).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");
    await user.click(
      within(row).getByRole("button", { name: /Add to calendar/ }),
    );
    const google = await screen.findByRole("menuitem", {
      name: "Google Calendar",
    });
    const query = new URL(google.getAttribute("href") ?? "").searchParams;
    expect(query.get("text")).toContain("Technical interview:");
    expect(query.get("details")).toContain("My interviews");
    expect(query.get("details")).not.toMatch(/@|\+234|salary/i);
  });

  it("offers no calendar for an interview that already took place", async () => {
    const user = userEvent.setup();
    renderInToasts(<MyInterviewsScreen />);
    await user.click(await screen.findByRole("radio", { name: "All of mine" }));
    const rows = await screen.findAllByRole("listitem");
    const happened = rows.find((row) => within(row).queryByText("Took place"));
    expect(happened).toBeDefined();
    expect(
      within(happened as HTMLElement).queryByRole("button", {
        name: /Add to calendar/,
      }),
    ).toBeNull();
  });

  it("downloads a calendar file made for a panelist, labelled as a practice copy", async () => {
    const user = userEvent.setup();
    renderInToasts(<MyInterviewsScreen />);
    await user.click(await screen.findByRole("radio", { name: "All of mine" }));
    const rows = await screen.findAllByRole("listitem");
    const row = rows.find((r) =>
      within(r).queryByText("Coming up"),
    ) as HTMLElement;
    await user.click(
      within(row).getByRole("button", { name: /Add to calendar/ }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: /Download \.ics/ }),
    );
    await waitFor(() => expect(download).toHaveBeenCalled());
    const [filename, blob] = download.mock.calls[0] as [string, Blob];
    expect(filename).toMatch(/^interview-.*\.ics$/);
    const text = (await blob.text()).replace(/\r\n /g, "");
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toContain("My interviews");
    expect(text).toContain("X-APPROVEHR-DEMO:TRUE");
    expect(text).not.toMatch(/@mail\.com|\+234/);
  });

  it("is the same on a candidate's own page: the link and the calendar, above the scorecard", async () => {
    const user = userEvent.setup();
    renderInToasts(<MyApplicationScreen id="app-01" />);
    expect(
      await screen.findByRole("link", { name: /Join the call/ }),
    ).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");
    await user.click(screen.getByRole("button", { name: /Add to calendar/ }));
    expect(
      await screen.findByRole("menuitem", { name: "Google Calendar" }),
    ).toBeInTheDocument();
  });
});

describe("my interviews: a scorecard that is due", () => {
  it("says Scorecard due for an interview that took place, and nothing about reminders it cannot know", async () => {
    const user = userEvent.setup();
    renderInToasts(<MyInterviewsScreen />);
    await user.click(await screen.findByRole("radio", { name: "All of mine" }));
    const due = await screen.findByText("Scorecard due");
    const row = due.closest("li") as HTMLElement;
    expect(within(row).getByText("Took place")).toBeInTheDocument();
    /* The API tells a panelist nothing of what has been sent to them, so nothing here says. */
    expect(row).not.toHaveTextContent(/reminder|nudge/i);
    expect(
      within(row).queryByRole("button", { name: /Add to calendar/ }),
    ).toBeNull();
  });

  it("keeps 'owed' for an interview still to come: nothing is due before it happens", async () => {
    const user = userEvent.setup();
    renderInToasts(<MyInterviewsScreen />);
    await user.click(await screen.findByRole("radio", { name: "All of mine" }));
    const owed = await screen.findByText("Your scorecard is owed");
    const row = owed.closest("li") as HTMLElement;
    expect(within(row).getByText("Coming up")).toBeInTheDocument();
    expect(row).not.toHaveTextContent("Reminder");
  });

  it("says Scorecard due on the candidate's own page too, in the same words", async () => {
    renderInToasts(<MyApplicationScreen id="app-11" />);
    const due = await screen.findByText(/Scorecard due\./);
    expect(due.parentElement).toHaveTextContent(
      "Scorecard due. The interview is over and yours is not in.",
    );
    expect(due.parentElement).not.toHaveTextContent(/reminder|nudge/i);
  });

  it("says nothing about a scorecard being due for an interview whose scorecard is in", async () => {
    const user = userEvent.setup();
    renderInToasts(<MyInterviewsScreen />);
    await user.click(await screen.findByRole("radio", { name: "All of mine" }));
    const inRow = (await screen.findByText("Your scorecard is in")).closest(
      "li",
    ) as HTMLElement;
    expect(inRow).not.toHaveTextContent("Reminder");
    expect(inRow).not.toHaveTextContent("Scorecard due");
  });
});

describe("my interviews: an interview whose time has passed", () => {
  const passed = () => {
    const book = demoInterviews.current();
    demoInterviews.commit({
      ...book,
      interviews: book.interviews.map((i) =>
        i.id === "int-02"
          ? {
              ...i,
              scheduledFor: "2026-08-17T09:00:00.000Z",
              status: "SCHEDULED" as const,
            }
          : i,
      ),
    });
  };

  it("is not called 'Coming up', says its scorecard is due, and offers no link or calendar for it", async () => {
    passed();
    const user = userEvent.setup();
    renderInToasts(<MyInterviewsScreen />);
    await user.click(await screen.findByRole("radio", { name: "All of mine" }));
    const over = (await screen.findByText("Time has passed")).closest(
      "li",
    ) as HTMLElement;
    expect(within(over).getByText("Scorecard due")).toBeInTheDocument();
    expect(within(over).queryByText("Coming up")).toBeNull();
    expect(
      within(over).queryByRole("link", { name: /Join the call/ }),
    ).toBeNull();
    expect(
      within(over).queryByRole("button", { name: /Add to calendar/ }),
    ).toBeNull();
  });

  it("is the same on the candidate's own page", async () => {
    passed();
    renderInToasts(<MyApplicationScreen id="app-01" />);
    expect(await screen.findByText("Time has passed")).toBeInTheDocument();
    expect(screen.queryByText("Coming up")).toBeNull();
    expect(screen.queryByRole("link", { name: /Join the call/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Add to calendar/ }),
    ).toBeNull();
  });
});
