import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiToday, ApiTodaySections } from "@/lib/api/me";
import { ApiError } from "@/lib/api/client";

/**
 * The Today panel, rendered.
 *
 * The API is faked at its edge (`meApi.today`, `announcementsApi.markRead`), so
 * what is held here is the translation: what each section answer becomes on the
 * screen. The rules worth pinning are the ones `tsc` cannot see, and every one of
 * them is a wrong claim that type-checks:
 *
 * - **unavailable is not a zero.** A section the API says does not apply draws
 *   nothing, not "0 days left" and not an empty heading.
 * - **absent is not zero.** No payslip is no row, and no ₦ anywhere.
 * - **pay is covered until asked for**, with a mask that does not give the
 *   magnitude away.
 * - **a failed section is its own quiet line**, with the others carrying on.
 * - **opening a notice is the receipt**, and the row leaves when the server says so.
 */

const api = vi.hoisted(() => ({
  today: vi.fn(),
  markRead: vi.fn(),
}));
const session = vi.hoisted(() => ({ connected: true }));

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: session.connected }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/use-today", () => ({ useToday: () => "2026-10-21" }));
vi.mock("@/lib/api/me", async (original) => ({
  ...(await original<typeof import("@/lib/api/me")>()),
  meApi: { today: api.today, appOpen: vi.fn() },
}));
vi.mock("@/lib/api/announcements", async (original) => ({
  ...(await original<typeof import("@/lib/api/announcements")>()),
  announcementsApi: { markRead: api.markRead },
}));

const { TodayPanel } = await import("@/app/(app)/dashboard/today-panel");

/* ------------------------------------------------------------------ fixtures */

type Sections = ApiTodaySections;

const notice = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: `Notice ${id}`,
  body: `Body of notice ${id}.\nSecond paragraph.`,
  pinned: false,
  publishedAt: "2026-10-19T09:00:00.000Z",
  postedByName: "Ada Obi",
  departmentNames: [],
  read: false,
  readAt: null,
  ...over,
});

const unavailable = (
  reason: "no_staff_record" | "feature_off" | "policy_off" | "not_in_plan",
) => ({ status: "unavailable" as const, reason });

const failed = {
  status: "error" as const,
  code: "section_failed" as const,
  message: "That could not be read just now.",
};

/** Everything in the panel's world, answering and with something in it. */
function everything(): Sections {
  return {
    announcements: {
      status: "ok",
      data: {
        notices: [
          notice("n1", { pinned: true }),
          notice("n2"),
          notice("n3", { read: true, readAt: "2026-10-20T08:00:00.000Z" }),
        ],
        unread: 2,
        total: 3,
      },
    },
    policies: {
      status: "ok",
      data: {
        outstanding: [
          {
            id: "p1",
            title: "Code of conduct",
            category: "Conduct",
            version: 2,
            publishedAt: "2026-10-01T00:00:00.000Z",
            previouslyAcceptedVersion: 1,
          },
        ],
        total: 1,
      },
    },
    pay: {
      status: "ok",
      data: {
        nextPayday: { date: "2026-10-28", period: "2026-10", state: "planned" },
        latestPayslip: {
          id: "slip-1",
          period: "2026-09",
          payDate: "2026-09-28",
          netKobo: 41_250_000,
          paid: true,
        },
      },
    },
    leave: {
      status: "ok",
      data: {
        year: 2026,
        balances: [
          {
            leaveTypeId: "l1",
            leaveType: "Annual leave",
            entitled: 20,
            taken: 5,
            pending: 2,
            remaining: 13,
          },
        ],
      },
    },
    advance: unavailable("policy_off"),
    tasks: unavailable("feature_off"),
    oneOnOne: {
      status: "ok",
      data: {
        activeSeries: 1,
        next: {
          meetingId: "m1",
          seriesId: "s1",
          date: "2026-10-22",
          withEmployeeId: "e2",
          withName: "Chidi Okafor",
          role: "report",
          cadence: "WEEKLY",
          cadenceLabel: "Weekly",
        },
      },
    },
    clockIn: {
      status: "ok",
      data: {
        date: "2026-10-21",
        state: "clocked_in",
        clockInAt: "2026-10-21T07:12:00.000Z",
        clockOutAt: null,
        clockIn: "08:12",
        clockOut: null,
        earlierOpen: null,
      },
    },
  };
}

function answer(over: Partial<Sections> = {}): ApiToday {
  return {
    asOf: "2026-10-21T09:00:00.000Z",
    sections: { ...everything(), ...over },
  };
}

function mountWith(over: Partial<Sections> = {}) {
  api.today.mockResolvedValue(answer(over));
  return render(<TodayPanel />);
}

const glanceTab = () => screen.findByRole("tab", { name: /At a glance/ });

beforeEach(() => {
  vi.clearAllMocks();
  session.connected = true;
});

/* ------------------------------------------------------------------- to do */

describe("To do", () => {
  it("lists the notices they have not read, and counts what is asked of them", async () => {
    mountWith();
    expect(await screen.findByText("Notice n1")).toBeInTheDocument();
    expect(screen.getByText("Notice n2")).toBeInTheDocument();
    /* Read ones are not asked of them. */
    expect(screen.queryByText("Notice n3")).not.toBeInTheDocument();
    /* Two unread notices and one policy. */
    expect(screen.getByRole("tab", { name: /To do\s*3/ })).toBeInTheDocument();
    expect(screen.getByText(/Pinned, Ada Obi/)).toBeInTheDocument();
  });

  it("says a re-asked policy is a re-ask, not a first", async () => {
    mountWith();
    expect(await screen.findByText("Code of conduct")).toBeInTheDocument();
    expect(screen.getByText("Version 2, you accepted 1")).toBeInTheDocument();
  });

  it("says what did not fit rather than dropping it", async () => {
    mountWith({
      announcements: {
        status: "ok",
        data: {
          notices: [notice("n1")],
          unread: 4,
          total: 4,
        },
      },
      policies: {
        status: "ok",
        data: { outstanding: [], total: 0 },
      },
    });
    expect(await screen.findByText(/3 more unread/)).toBeInTheDocument();
  });

  it("opens on At a glance when nothing is asked of them, and says so on To do", async () => {
    const user = userEvent.setup();
    mountWith({
      announcements: {
        status: "ok",
        data: { notices: [], unread: 0, total: 0 },
      },
      policies: { status: "ok", data: { outstanding: [], total: 0 } },
    });
    /* The tab with something in it is the one that is open. */
    expect(await screen.findByText(/Next payday/)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /To do/ }));
    expect(screen.getByText("Nothing needs you today")).toBeInTheDocument();
    /* No count on a tab with nothing in it, and certainly no zero. */
    expect(screen.getByRole("tab", { name: "To do" })).toBeInTheDocument();
  });

  it("puts an unclosed earlier day where it can be seen and fixed", async () => {
    const sections = everything();
    sections.clockIn = {
      status: "ok",
      data: {
        date: "2026-10-21",
        state: "not_clocked_in",
        clockInAt: null,
        clockOutAt: null,
        clockIn: null,
        clockOut: null,
        earlierOpen: { date: "2026-10-20", clockIn: "08:05" },
      },
    };
    mountWith(sections);
    expect(
      await screen.findByText("No clock-out on 20 Oct"),
    ).toBeInTheDocument();
    expect(screen.getByText("Clocked in at 08:05")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /fix the open day/ }),
    ).toHaveAttribute("href", "/people/attendance");
    /* And the header still says today's state, which is a different fact. */
    expect(screen.getByText("Not clocked in")).toBeInTheDocument();
  });

  it("shows a reviewer's note on a task, with the grade in words", async () => {
    mountWith({
      tasks: {
        status: "ok",
        data: {
          week: { start: "2026-10-19", end: "2026-10-25", daysLeft: 5 },
          objectives: 2,
          loggedThisWeek: 3,
          awaitingGrade: 1,
          needsAttention: [
            {
              id: "t1",
              goalTitle: "Ship the importer",
              description: "Wrote the parser",
              grade: "PARTIALLY_COMPLETED",
              gradeNote: "Tests are still missing.",
              gradedAt: "2026-10-20T10:00:00.000Z",
            },
          ],
        },
      },
    });
    expect(await screen.findByText("Ship the importer")).toBeInTheDocument();
    expect(screen.getByText("Tests are still missing.")).toBeInTheDocument();
    expect(screen.getByText("Partly done")).toBeInTheDocument();
  });
});

/* -------------------------------------------------------- unavailable, absent */

describe("a section that does not apply draws nothing", () => {
  it("draws no card at all when nothing applies to this person", async () => {
    const nothing: Partial<Sections> = {
      announcements: unavailable("feature_off"),
      policies: unavailable("no_staff_record"),
      pay: unavailable("no_staff_record"),
      leave: unavailable("no_staff_record"),
      advance: unavailable("no_staff_record"),
      tasks: unavailable("no_staff_record"),
      oneOnOne: unavailable("no_staff_record"),
      clockIn: unavailable("no_staff_record"),
    };
    const { container } = mountWith(nothing);
    await waitFor(() => expect(api.today).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("draws no card for an account where only notices apply and none are up", async () => {
    /* An external administrator: no staff record, so only the board answers, and
       "Nothing needs you today" would be furniture. */
    const { container } = mountWith({
      announcements: {
        status: "ok",
        data: { notices: [], unread: 0, total: 0 },
      },
      policies: unavailable("no_staff_record"),
      pay: unavailable("no_staff_record"),
      leave: unavailable("no_staff_record"),
      advance: unavailable("no_staff_record"),
      tasks: unavailable("no_staff_record"),
      oneOnOne: unavailable("no_staff_record"),
      clockIn: unavailable("no_staff_record"),
    });
    await waitFor(() => expect(api.today).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("does say nothing needs them when there is a clock to report beside it", async () => {
    mountWith({
      announcements: {
        status: "ok",
        data: { notices: [], unread: 0, total: 0 },
      },
      policies: unavailable("no_staff_record"),
      pay: unavailable("no_staff_record"),
      leave: unavailable("no_staff_record"),
      advance: unavailable("no_staff_record"),
      tasks: unavailable("no_staff_record"),
      oneOnOne: unavailable("no_staff_record"),
    });
    expect(await screen.findByText("Nothing needs you today")).toBeVisible();
    expect(screen.getByText("In since 08:12")).toBeInTheDocument();
  });

  it("never turns an unavailable leave section into a balance", async () => {
    const user = userEvent.setup();
    mountWith({ leave: unavailable("no_staff_record") });
    await user.click(await glanceTab());
    expect(screen.queryByText(/left/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Annual leave/)).not.toBeInTheDocument();
  });

  it("draws no figure and no payslip row for somebody with no payslip", async () => {
    const user = userEvent.setup();
    mountWith({
      pay: { status: "ok", data: { nextPayday: null, latestPayslip: null } },
    });
    await user.click(await glanceTab());
    expect(screen.queryByText(/payslip/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Next payday/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/₦/);
  });

  it("draws no tasks summary when there is nothing to log against", async () => {
    const user = userEvent.setup();
    mountWith({
      tasks: {
        status: "ok",
        data: {
          week: { start: "2026-10-19", end: "2026-10-25", daysLeft: 5 },
          objectives: 0,
          loggedThisWeek: 0,
          awaitingGrade: 0,
          needsAttention: [],
        },
      },
    });
    await user.click(await glanceTab());
    expect(screen.queryByText("Weekly tasks")).not.toBeInTheDocument();
  });

  it("says nothing logged is nothing logged, when there is something to log against", async () => {
    const user = userEvent.setup();
    mountWith({
      tasks: {
        status: "ok",
        data: {
          week: { start: "2026-10-19", end: "2026-10-25", daysLeft: 1 },
          objectives: 2,
          loggedThisWeek: 0,
          awaitingGrade: 0,
          needsAttention: [],
        },
      },
    });
    await user.click(await glanceTab());
    expect(
      screen.getByText("Nothing logged yet this week"),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 day\s+left/)).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------- money */

describe("pay is covered until asked for", () => {
  it("masks the payslip figure by default, with a mask that does not give the size away", async () => {
    const user = userEvent.setup();
    mountWith();
    await user.click(await glanceTab());
    expect(screen.getByText("September 2026 payslip")).toBeInTheDocument();
    expect(screen.getByLabelText("Hidden")).toHaveTextContent("••••••");
    expect(document.body.textContent).not.toMatch(/₦/);
    expect(document.body.textContent).not.toMatch(/412,500/);
  });

  it("shows the figure on a tap, and covers it again on the next", async () => {
    const user = userEvent.setup();
    mountWith();
    await user.click(await glanceTab());
    await user.click(screen.getByRole("button", { name: "Show amounts" }));
    expect(document.body.textContent).toMatch(/₦412,500\.00/);
    await user.click(screen.getByRole("button", { name: "Hide amounts" }));
    expect(document.body.textContent).not.toMatch(/₦/);
  });

  it("says when it was paid, or that it is approved and not paid", async () => {
    const user = userEvent.setup();
    const sections = everything();
    sections.pay = {
      status: "ok",
      data: {
        nextPayday: null,
        latestPayslip: {
          id: "slip-2",
          period: "2026-10",
          payDate: "2026-10-28",
          netKobo: 1,
          paid: false,
        },
      },
    };
    mountWith(sections);
    await user.click(await glanceTab());
    expect(screen.getByText("Approved, not yet paid")).toBeInTheDocument();
  });

  it("shows a pay-early figure only when they could draw one, covered, with the estimate beside it", async () => {
    const user = userEvent.setup();
    mountWith({
      advance: {
        status: "ok",
        data: {
          period: "2026-10",
          eligible: true,
          availableKobo: 9_000_000,
          refusal: null,
          minAmountKobo: 500_000,
          feeKobo: 50_000,
          outstandingKobo: 0,
          estimateNotice: "This is an estimate. A bonus can change it.",
        },
      },
    });
    await user.click(await glanceTab());
    expect(screen.getByText("Pay early")).toBeInTheDocument();
    expect(screen.getByText("Estimate")).toBeInTheDocument();
    /* The caveat the API says must go with the figure is reachable, and is read
       out to a screen reader without a hover. */
    expect(
      screen.getByText("This is an estimate. A bonus can change it."),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/₦/);
  });

  it("prints no pay-early figure, and no estimate, when there is no salary on file", async () => {
    const user = userEvent.setup();
    mountWith({
      advance: {
        status: "ok",
        data: {
          period: "2026-10",
          eligible: false,
          availableKobo: null,
          refusal: "There is no salary on your record yet.",
          minAmountKobo: 500_000,
          feeKobo: 50_000,
          outstandingKobo: 0,
          estimateNotice: "This is an estimate.",
        },
      },
    });
    await user.click(await glanceTab());
    expect(
      screen.getByText("There is no salary on your record yet."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Estimate")).not.toBeInTheDocument();
    expect(screen.queryByText("This is an estimate.")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/₦/);
  });
});

/* ----------------------------------------------------------- at a glance */

describe("At a glance", () => {
  it("names the next one-to-one by the day it is on, in the company's calendar", async () => {
    const user = userEvent.setup();
    mountWith();
    await user.click(await glanceTab());
    /* `useToday` is the 21st, the meeting is the 22nd. */
    expect(
      screen.getByText("One-to-one with Chidi Okafor"),
    ).toBeInTheDocument();
    expect(screen.getByText("Tomorrow, weekly")).toBeInTheDocument();
    expect(screen.getByText("Next payday, 28 Oct")).toBeInTheDocument();
    expect(screen.getByText("13")).toBeInTheDocument();
  });

  it("shows four leave types in full: a click to reveal one row is a click for nothing", async () => {
    const user = userEvent.setup();
    const types = ["Annual", "Sick", "Study", "Casual"];
    mountWith({
      leave: {
        status: "ok",
        data: {
          year: 2026,
          balances: types.map((leaveType, index) => ({
            leaveTypeId: `l${index}`,
            leaveType,
            entitled: 10,
            taken: 1,
            pending: 0,
            remaining: 9,
          })),
        },
      },
    });
    await user.click(await glanceTab());
    expect(screen.getByText("Casual")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /More leave types/ }),
    ).not.toBeInTheDocument();
  });

  it("puts leave types past the third behind a click when that hides two or more", async () => {
    const user = userEvent.setup();
    const types = ["Annual", "Sick", "Study", "Casual", "Compassionate"];
    mountWith({
      leave: {
        status: "ok",
        data: {
          year: 2026,
          balances: types.map((leaveType, index) => ({
            leaveTypeId: `l${index}`,
            leaveType,
            entitled: 10,
            taken: 1,
            pending: 0,
            remaining: 9,
          })),
        },
      },
    });
    await user.click(await glanceTab());
    expect(screen.getByText("Study")).toBeInTheDocument();
    expect(screen.queryByText("Casual")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /More leave types/ }));
    expect(screen.getByText("Casual")).toBeInTheDocument();
    expect(screen.getByText("Compassionate")).toBeInTheDocument();
  });
});

describe("the clock in the header", () => {
  it.each([
    ["clocked_in", "08:12", null, "In since 08:12"],
    ["clocked_out", "08:12", "17:03", "Out at 17:03"],
    ["not_clocked_in", null, null, "Not clocked in"],
  ] as const)("says %s in words", async (state, clockIn, clockOut, words) => {
    mountWith({
      clockIn: {
        status: "ok",
        data: {
          date: "2026-10-21",
          state,
          clockInAt: null,
          clockOutAt: null,
          clockIn,
          clockOut,
          earlierOpen: null,
        },
      },
    });
    expect(await screen.findByText(words)).toBeInTheDocument();
  });

  it("is absent when the company has attendance off", async () => {
    mountWith({ clockIn: unavailable("feature_off") });
    await screen.findByText("Notice n1");
    expect(screen.queryByText(/clocked/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/In since/)).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------- failure alone */

describe("a section that failed", () => {
  it("is one quiet line with a retry, and the other sections carry on", async () => {
    const user = userEvent.setup();
    mountWith({ pay: failed });
    await user.click(await glanceTab());
    expect(screen.getByText("Pay could not load.")).toBeInTheDocument();
    /* The rest of the tab is intact. */
    expect(screen.getByText(/One-to-one with Chidi/)).toBeInTheDocument();
    expect(screen.getByText("Annual leave")).toBeInTheDocument();
    /* The server's own words are not printed, and no internals leak. */
    expect(screen.queryByText(/could not be read just now/)).toBeNull();

    api.today.mockResolvedValueOnce({
      asOf: "2026-10-21T09:01:00.000Z",
      sections: {
        pay: {
          status: "ok",
          data: {
            nextPayday: {
              date: "2026-10-28",
              period: "2026-10",
              state: "approved",
            },
            latestPayslip: null,
          },
        },
      },
    });
    await user.click(screen.getByRole("button", { name: "Try again" }));
    /* Asks for that section alone, which is the spec's rule for refreshing one card. */
    await waitFor(() => expect(api.today).toHaveBeenLastCalledWith(["pay"]));
    expect(await screen.findByText("Next payday, 28 Oct")).toBeInTheDocument();
    expect(screen.queryByText("Pay could not load.")).not.toBeInTheDocument();
    /* And did not disturb what was already there. */
    expect(screen.getByText("Annual leave")).toBeInTheDocument();
  });

  it("is never counted as nothing: a failed notices section has no count and no 'nothing to do'", async () => {
    mountWith({
      announcements: failed,
      policies: { status: "ok", data: { outstanding: [], total: 0 } },
    });
    expect(await screen.findByText("Notices could not load.")).toBeVisible();
    expect(
      screen.queryByText("Nothing needs you today"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "To do" })).toBeInTheDocument();
  });
});

describe("the whole request", () => {
  it("shows the failure card, and a way to try again, when it fails", async () => {
    const user = userEvent.setup();
    api.today.mockRejectedValueOnce(
      new ApiError(500, "internal", "Something went wrong."),
    );
    render(<TodayPanel />);
    expect(await screen.findByText(/Your day did not load/)).toBeVisible();
    api.today.mockResolvedValueOnce(answer());
    await user.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText("Notice n1")).toBeInTheDocument();
  });

  it("holds a skeleton, and no empty state, while it loads", async () => {
    api.today.mockReturnValue(new Promise(() => undefined));
    render(<TodayPanel />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(
      screen.queryByText("Nothing needs you today"),
    ).not.toBeInTheDocument();
  });

  it("draws nothing, and no error, on an API that does not have the route yet", async () => {
    api.today.mockRejectedValue(new ApiError(404, "not_found", "Not found."));
    const { container } = render(<TodayPanel />);
    await waitFor(() => expect(api.today).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("asks nothing and draws nothing when nobody is connected", async () => {
    session.connected = false;
    const { container } = render(<TodayPanel />);
    expect(api.today).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
});

/* ---------------------------------------------------------------- the notice */

describe("opening a notice", () => {
  it("records the read, shows the whole wording, and takes the row off the list", async () => {
    const user = userEvent.setup();
    api.markRead.mockResolvedValue({
      id: "n1",
      read: true,
      readAt: "2026-10-21T09:05:00.000Z",
      alreadyRead: false,
    });
    mountWith();
    await screen.findByText("Notice n1");
    api.today.mockResolvedValueOnce({
      asOf: "2026-10-21T09:05:00.000Z",
      sections: {
        announcements: {
          status: "ok",
          data: { notices: [notice("n2")], unread: 1, total: 3 },
        },
      },
    });

    await user.click(screen.getByRole("button", { name: "Read Notice n1" }));

    /* The receipt is for this notice, and for nothing else. */
    expect(api.markRead).toHaveBeenCalledTimes(1);
    expect(api.markRead).toHaveBeenCalledWith("n1");

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Body of notice n1/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Posted by Ada Obi, 19 Oct 2026/),
    ).toBeInTheDocument();

    /* The row has gone and the count has fallen, and the section was read again
       on its own to make the count exact. */
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Read Notice n1" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("tab", { name: /To do\s*2/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(api.today).toHaveBeenLastCalledWith(["announcements"]),
    );
    /* The dialog is still there: leaving the list did not close the wording. */
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("leaves the row in place when the server could not record it, and says why", async () => {
    const user = userEvent.setup();
    api.markRead.mockRejectedValue(
      new ApiError(404, "not_found", "That announcement is not here."),
    );
    mountWith();
    await screen.findByText("Notice n2");
    api.today.mockResolvedValueOnce(answer());

    await user.click(screen.getByRole("button", { name: "Read Notice n2" }));

    await waitFor(() =>
      expect(api.today).toHaveBeenLastCalledWith(["announcements"]),
    );
    /* Nothing was recorded, so nothing is claimed: still unread. */
    expect(
      screen.getByRole("button", { name: "Read Notice n2" }),
    ).toBeInTheDocument();
  });

  it("renders the wording as text, never as markup", async () => {
    const user = userEvent.setup();
    api.markRead.mockResolvedValue({
      id: "x",
      read: true,
      readAt: "2026-10-21T09:05:00.000Z",
      alreadyRead: false,
    });
    mountWith({
      announcements: {
        status: "ok",
        data: {
          notices: [
            notice("x", { body: "<img src=x onerror=alert(1)> Office shut." }),
          ],
          unread: 1,
          total: 1,
        },
      },
    });
    await user.click(
      await screen.findByRole("button", { name: /Read Notice x/ }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector("img")).toBeNull();
    expect(within(dialog).getByText(/<img src=x/)).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------- copy */

describe("the copy", () => {
  it("has no em dash on either tab", async () => {
    const user = userEvent.setup();
    mountWith();
    await screen.findByText("Notice n1");
    expect(document.body.textContent).not.toContain("—");
    await user.click(await glanceTab());
    expect(document.body.textContent).not.toContain("—");
  });
});
