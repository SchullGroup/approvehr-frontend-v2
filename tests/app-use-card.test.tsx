import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiWeeklyActive } from "@/lib/api/engagement";

/**
 * How the team used the app, as HR sees it.
 *
 * The API is faked at its edge. What is held here is what the card makes of each
 * kind of answer, and above all the three things a number on this card can get
 * wrong without a type error: a figure shown for a group too small to describe, a
 * share rounded up across the bar it is held against, and a card drawn for a
 * company that never switched the measure on.
 */

const api = vi.hoisted(() => ({ weeklyActive: vi.fn() }));
const session = vi.hoisted(() => ({ connected: true }));

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: session.connected }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/use-today", () => ({ useToday: () => "2026-10-21" }));
vi.mock("@/lib/api/engagement", async (original) => ({
  ...(await original<typeof import("@/lib/api/engagement")>()),
  engagementApi: { weeklyActive: api.weeklyActive },
}));

const { AppUseCard, recentWeeks } =
  await import("@/app/(app)/dashboard/app-use-card");

const week = (over: Partial<ApiWeeklyActive["week"]> = {}) => ({
  start: "2026-10-19",
  end: "2026-10-25",
  complete: false,
  daysElapsed: 3,
  ...over,
});

const figures = (
  over: Partial<Extract<ApiWeeklyActive, { withheld: false }>> = {},
): ApiWeeklyActive => ({
  week: week(),
  floor: 3,
  withheld: false,
  peopleCounted: 28,
  weeklyActive: { people: 23, share: 0.8214 },
  threeOrMoreDays: { people: 18, share: 0.6429 },
  medianDaysPerPerson: 3,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  session.connected = true;
});

describe("recentWeeks", () => {
  it("starts from the Monday of the company's week, newest first", () => {
    /* 21 October 2026 is a Wednesday. */
    const weeks = recentWeeks("2026-10-21");
    expect(weeks).toHaveLength(8);
    expect(weeks.slice(0, 3)).toEqual([
      { value: "2026-10-19", label: "This week" },
      { value: "2026-10-12", label: "Last week" },
      { value: "2026-10-05", label: "Week of 5 Oct" },
    ]);
  });

  it("puts Monday and Sunday in the same week, the way the API does", () => {
    expect(recentWeeks("2026-10-19")[0]?.value).toBe("2026-10-19");
    expect(recentWeeks("2026-10-25")[0]?.value).toBe("2026-10-19");
    expect(recentWeeks("2026-10-26")[0]?.value).toBe("2026-10-26");
  });

  it("goes back across a month and a year without a day lost", () => {
    /* 1 January 2027 is a Friday. */
    const weeks = recentWeeks("2027-01-01");
    expect(weeks[0]?.value).toBe("2026-12-28");
    expect(weeks[1]?.value).toBe("2026-12-21");
    /* 29 February is real in 2028, and the Monday before it is the 28th. */
    expect(recentWeeks("2028-03-01")[0]?.value).toBe("2028-02-28");
  });

  it("is an empty list, not a guess, for a day that is not one", () => {
    expect(recentWeeks("soon")).toEqual([]);
  });
});

describe("the figures", () => {
  it("shows the share and the head count beside it, for the week asked", async () => {
    api.weeklyActive.mockResolvedValue(figures());
    render(<AppUseCard />);
    expect(await screen.findByText("82.1%")).toBeInTheDocument();
    expect(screen.getByText("23 of 28 people")).toBeInTheDocument();
    expect(screen.getByText("64.2%")).toBeInTheDocument();
    expect(screen.getByText("18 of 28 people")).toBeInTheDocument();
    expect(screen.getByText("Median days")).toBeInTheDocument();
    expect(screen.getByText("19 Oct to 25 Oct")).toBeInTheDocument();
    /* This week by default, as the Monday that starts it. */
    expect(api.weeklyActive).toHaveBeenCalledWith("2026-10-19");
  });

  it("never rounds a share up across the bar it is held against", async () => {
    api.weeklyActive.mockResolvedValue(
      figures({ weeklyActive: { people: 399, share: 0.7996 } }),
    );
    render(<AppUseCard />);
    expect(await screen.findByText("79.9%")).toBeInTheDocument();
    expect(screen.queryByText("80.0%")).not.toBeInTheDocument();
  });

  it("says a week that is not over is not over, and does not say so of one that is", async () => {
    api.weeklyActive.mockResolvedValue(figures());
    const { unmount } = render(<AppUseCard />);
    expect(
      await screen.findByText("In progress, day 3 of 7"),
    ).toBeInTheDocument();
    unmount();

    api.weeklyActive.mockResolvedValue(
      figures({ week: week({ complete: true, daysElapsed: 7 }) }),
    );
    render(<AppUseCard />);
    await screen.findByText("82.1%");
    expect(screen.queryByText(/In progress/)).not.toBeInTheDocument();
  });

  it("does not hold the team against a bar: no verdict, no pass and no fail", async () => {
    api.weeklyActive.mockResolvedValue(figures());
    render(<AppUseCard />);
    await screen.findByText("82.1%");
    expect(document.body.textContent).not.toMatch(
      /pass|fail|target|goal|on track|behind/i,
    );
  });
});

describe("below the privacy floor", () => {
  const withheld: ApiWeeklyActive = {
    week: week(),
    floor: 3,
    withheld: true,
    reason: "below_floor",
    note: "Weekly activity appears once 3 or more people are counted. Below that, any figure would describe individuals.",
  };

  it("shows no figure at all, not a zero and not a percentage", async () => {
    api.weeklyActive.mockResolvedValue(withheld);
    render(<AppUseCard />);
    expect(
      await screen.findByText("Not shown: fewer than 3 people counted."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Opened the app")).not.toBeInTheDocument();
    expect(screen.queryByText("Median days")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/%/);
    expect(document.body.textContent).not.toMatch(/\bof \d+ people/);
  });

  it("keeps the API's own sentence behind an info icon", async () => {
    api.weeklyActive.mockResolvedValue(withheld);
    render(<AppUseCard />);
    await screen.findByText(/Not shown/);
    expect(
      screen.getByText(/any figure would describe individuals/),
    ).toBeInTheDocument();
  });
});

describe("a card with nothing to say draws nothing", () => {
  it.each([
    [
      "tracking is switched off for the company",
      new ApiError(422, "unprocessable", "Switched off.", {
        reason: "module_off",
        module: "app_open_tracking",
      }),
    ],
    ["the caller may not read it", new ApiError(403, "forbidden", "No.")],
    ["the API has no such route yet", new ApiError(404, "not_found", "No.")],
  ])("when %s", async (_why, failure) => {
    api.weeklyActive.mockRejectedValue(failure);
    const { container } = render(<AppUseCard />);
    await waitFor(() => expect(api.weeklyActive).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("when nobody is connected, and asks nothing", () => {
    session.connected = false;
    const { container } = render(<AppUseCard />);
    expect(api.weeklyActive).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it("but a real failure is still a failure, with a way to try again", async () => {
    const user = userEvent.setup();
    api.weeklyActive.mockRejectedValueOnce(
      new ApiError(500, "internal", "Something went wrong."),
    );
    render(<AppUseCard />);
    expect(await screen.findByText(/App use did not load/)).toBeVisible();
    api.weeklyActive.mockResolvedValueOnce(figures());
    await user.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText("82.1%")).toBeInTheDocument();
  });
});

describe("choosing a week", () => {
  it("asks for that week and names it as an applied filter", async () => {
    const user = userEvent.setup();
    api.weeklyActive.mockResolvedValue(figures());
    render(<AppUseCard />);
    await screen.findByText("82.1%");

    api.weeklyActive.mockResolvedValue(
      figures({
        week: week({
          start: "2026-10-12",
          end: "2026-10-18",
          complete: true,
          daysElapsed: 7,
        }),
        weeklyActive: { people: 25, share: 0.8929 },
      }),
    );
    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.selectOptions(screen.getByLabelText("Week"), "Last week");

    await waitFor(() =>
      expect(api.weeklyActive).toHaveBeenLastCalledWith("2026-10-12"),
    );
    expect(await screen.findByText("89.2%")).toBeInTheDocument();
    expect(screen.getByText("12 Oct to 18 Oct")).toBeInTheDocument();
    /* The week on screen is never a secret: it is a chip, outside the popover. */
    expect(
      screen.getByText("Last week", { selector: "span" }),
    ).toBeInTheDocument();
  });
});

describe("the copy", () => {
  it("has no em dash", async () => {
    api.weeklyActive.mockResolvedValue(figures());
    render(<AppUseCard />);
    await screen.findByText("82.1%");
    expect(document.body.textContent).not.toContain("—");
  });
});
