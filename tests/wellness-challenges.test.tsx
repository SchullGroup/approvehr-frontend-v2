import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { PermissionKey } from "@/lib/permission-keys";
import {
  CONSENT_VERSION,
  challenge,
  consents,
  detail,
  paged,
} from "./wellness-fixtures";

/**
 * Challenges: joining is a consent, the board is for people who joined, and the
 * results are counts above a floor.
 *
 * The three things pinned hardest are the ones a privacy review would ask about.
 * A join sends back the wording it showed and a team the person named. Nothing a
 * row says counts anybody. And what an administrator opens is a results dialog
 * with held-back figures and no person in it, however the API's answer is shaped.
 */

const api = vi.hoisted(() => ({
  challenges: vi.fn(),
  challenge: vi.fn(),
  createChallenge: vi.fn(),
  updateChallenge: vi.fn(),
  cancelChallenge: vi.fn(),
  joinChallenge: vi.fn(),
  leaveChallenge: vi.fn(),
  board: vi.fn(),
  results: vi.fn(),
  consents: vi.fn(),
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

let held = new Set<PermissionKey>();
vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  useCan: (permission: PermissionKey) => held.has(permission),
}));

import { ChallengesScreen } from "@/app/(app)/wellness/challenges-screen";

const OPEN = challenge();
const JOINED = challenge({
  id: "c3",
  title: "Water week",
  metric: "WATER_ML",
  joined: true,
});
const ENDED = challenge({
  id: "c4",
  title: "September steps",
  status: "ENDED",
  startsOn: "2026-09-01",
  endsOn: "2026-09-30",
});
const CANCELLED = challenge({
  id: "c5",
  title: "Cancelled one",
  status: "CANCELLED",
  cancelledAt: "2026-10-19T09:00:00.000Z",
});

const rowOf = (title: string) =>
  screen.getByText(title).closest("li") as HTMLElement;

beforeEach(() => {
  vi.resetAllMocks();
  held = new Set();
  api.challenges.mockResolvedValue(paged([OPEN, JOINED, ENDED, CANCELLED]));
  api.consents.mockResolvedValue(consents(true));
  api.challenge.mockResolvedValue(detail());
});

describe("the list", () => {
  it("says what each challenge is and whether you joined, and counts nobody", async () => {
    render(<ChallengesScreen />);

    await screen.findByText("October steps");
    const open = rowOf("October steps");
    expect(within(open).getByText("Active")).toBeInTheDocument();
    expect(
      within(open).getByText(/Steps, Individual, 19 Oct to 1 Nov/),
    ).toBeInTheDocument();
    expect(within(open).queryByText("Joined")).not.toBeInTheDocument();

    const joined = rowOf("Water week");
    expect(within(joined).getByText("Joined")).toBeInTheDocument();
    expect(within(joined).getByText(/Water, Individual/)).toBeInTheDocument();

    expect(rowOf("Cancelled one")).toHaveTextContent("Cancelled");
    /* No row carries a number of people. */
    expect(
      screen.queryByText(/taking part|participants|joined this/i),
    ).not.toBeInTheDocument();
  });

  it("offers Join on an open challenge you are not in, Board on one you are, and neither on one that ended", async () => {
    render(<ChallengesScreen />);
    await screen.findByText("October steps");

    expect(
      within(rowOf("October steps")).getByRole("button", {
        name: "Join October steps",
      }),
    ).toBeInTheDocument();
    expect(
      within(rowOf("Water week")).getByRole("button", {
        name: "Board for Water week",
      }),
    ).toBeInTheDocument();
    expect(
      within(rowOf("September steps")).queryByRole("button"),
    ).not.toBeInTheDocument();
    expect(
      within(rowOf("Cancelled one")).queryByRole("button"),
    ).not.toBeInTheDocument();
  });

  it("filters by status behind the filter icon and shows what is applied", async () => {
    render(<ChallengesScreen />);
    await screen.findByText("October steps");

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.selectOptions(screen.getByLabelText("Status"), "CANCELLED");

    expect(screen.getByText("Cancelled one")).toBeInTheDocument();
    expect(screen.queryByText("October steps")).not.toBeInTheDocument();
    expect(screen.getByText("Status:")).toBeInTheDocument();
  });

  it("says nothing matches rather than that there are none", async () => {
    api.challenges.mockResolvedValue(paged([OPEN]));
    render(<ChallengesScreen />);
    await screen.findByText("October steps");

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.selectOptions(screen.getByLabelText("Status"), "ENDED");

    expect(screen.getByText("No challenge matches")).toBeInTheDocument();
    expect(screen.queryByText("No challenges yet")).not.toBeInTheDocument();
  });

  it("says it did not load, and not that there are no challenges", async () => {
    api.challenges.mockRejectedValue(new ApiError(500, "internal", "Broke."));
    render(<ChallengesScreen />);

    expect(
      await screen.findByText("The challenges did not load"),
    ).toBeInTheDocument();
    expect(screen.queryByText("No challenges yet")).not.toBeInTheDocument();
  });
});

describe("joining", () => {
  const openJoin = async () => {
    render(<ChallengesScreen />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Join October steps" }),
    );
  };

  it("shows the whole statement the API wrote and sends back the version it showed", async () => {
    api.joinChallenge.mockResolvedValue({ ...OPEN, joined: true, team: null });
    await openJoin();

    expect(
      await screen.findByText(
        /Everybody who joins this challenge sees your name/,
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Join challenge" }),
    );

    expect(api.joinChallenge).toHaveBeenCalledWith(
      "c1",
      CONSENT_VERSION,
      undefined,
    );
  });

  it("will not let somebody join before they have turned tracking on, and says where to", async () => {
    api.consents.mockResolvedValue(consents(false));
    await openJoin();

    expect(
      await screen.findByText(/Turn on tracking first/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to Overview" }),
    ).toHaveAttribute("href", "/wellness");
    expect(
      screen.getByRole("button", { name: "Join challenge" }),
    ).toBeDisabled();
  });

  it("asks for the wording again when it has changed under them", async () => {
    api.joinChallenge.mockRejectedValue(
      new ApiError(409, "conflict", "The wording has changed.", {
        reason: "consent_stale",
      }),
    );
    await openJoin();

    await userEvent.click(
      await screen.findByRole("button", { name: "Join challenge" }),
    );

    await waitFor(() => expect(api.challenge).toHaveBeenCalledTimes(2));
  });

  it("shows the API's refusal in the dialog", async () => {
    api.joinChallenge.mockRejectedValue(
      new ApiError(422, "unprocessable", "That challenge has ended."),
    );
    await openJoin();

    await userEvent.click(
      await screen.findByRole("button", { name: "Join challenge" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That challenge has ended.",
    );
  });

  describe("a team challenge", () => {
    const team = challenge({ id: "c2", title: "Team steps", mode: "TEAM" });

    beforeEach(() => {
      api.challenges.mockResolvedValue(paged([team]));
    });

    it("makes the person name their team, even when they are on only one", async () => {
      api.challenge.mockResolvedValue(
        detail({
          ...team,
          myTeams: [{ id: "t1", name: "Squad", members: 4 }],
          joinStatement: "Your total counts toward the team you choose.",
        }),
      );
      api.joinChallenge.mockResolvedValue({
        ...team,
        joined: true,
        team: null,
      });
      render(<ChallengesScreen />);
      await userEvent.click(
        await screen.findByRole("button", { name: "Join Team steps" }),
      );

      const join = await screen.findByRole("button", {
        name: "Join challenge",
      });
      expect(join).toBeDisabled();

      await userEvent.selectOptions(
        screen.getByLabelText(/The team you compete for/),
        "t1",
      );
      await userEvent.click(join);

      expect(api.joinChallenge).toHaveBeenCalledWith(
        "c2",
        CONSENT_VERSION,
        "t1",
      );
    });

    it("says so when they are on no team, and does not offer a join", async () => {
      api.challenge.mockResolvedValue(detail({ ...team, myTeams: [] }));
      render(<ChallengesScreen />);
      await userEvent.click(
        await screen.findByRole("button", { name: "Join Team steps" }),
      );

      expect(
        await screen.findByText(/You are not on a team/),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Join challenge" }),
      ).toBeDisabled();
    });
  });
});

describe("the board", () => {
  it("shows people who joined to each other, with a mark on yourself", async () => {
    api.board.mockResolvedValue({
      challengeId: "c3",
      status: "ACTIVE",
      mode: "INDIVIDUAL",
      metric: "WATER_ML",
      participants: 3,
      entries: [
        { rank: 1, name: "Ada Obi", total: 4500, mine: false },
        { rank: 2, name: "Me Myself", total: 3000, mine: true },
        { rank: 3, name: "Tunde Bello", total: 500, mine: false },
      ],
      me: { rank: 2, total: 3000 },
    });
    render(<ChallengesScreen />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Board for Water week" }),
    );

    expect(await screen.findByText("Ada Obi")).toBeInTheDocument();
    expect(screen.getByText("4,500 ml")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("3 taking part")).toBeInTheDocument();
  });

  it("holds a small team's number back and gives the reason", async () => {
    api.board.mockResolvedValue({
      challengeId: "c3",
      status: "ACTIVE",
      mode: "TEAM",
      metric: "WATER_ML",
      floor: 3,
      teams: [
        {
          teamId: "t1",
          name: "Squad",
          mine: true,
          withheld: true,
          note: "Results appear once 3 people have joined.",
        },
        {
          teamId: "t2",
          name: "Platform",
          mine: false,
          withheld: false,
          participants: 4,
          total: 8000,
          average: 2000,
        },
      ],
      mine: { total: 1200 },
    });
    render(<ChallengesScreen />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Board for Water week" }),
    );

    expect(
      await screen.findByText("Results appear once 3 people have joined."),
    ).toBeInTheDocument();
    expect(screen.getByText("Your team")).toBeInTheDocument();
    expect(screen.getByText("8,000 ml")).toBeInTheDocument();
    expect(screen.getByText(/Your total, 1,200 ml/)).toBeInTheDocument();
  });

  it("shows the API's refusal to somebody who is not on it", async () => {
    api.board.mockRejectedValue(
      new ApiError(
        403,
        "forbidden",
        "Only people taking part can see this board.",
      ),
    );
    render(<ChallengesScreen />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Board for Water week" }),
    );

    expect(
      await screen.findByText(/Only people taking part can see this board/),
    ).toBeInTheDocument();
  });
});

describe("leaving", () => {
  it("asks, and says what is kept", async () => {
    api.leaveChallenge.mockResolvedValue({
      ...JOINED,
      joined: false,
      team: null,
    });
    render(<ChallengesScreen />);
    await screen.findByText("Water week");

    await userEvent.click(
      within(rowOf("Water week")).getByRole("button", {
        name: "Actions for Water week",
      }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Leave challenge" }),
    );

    expect(
      await screen.findByText(/What you logged stays yours/),
    ).toBeInTheDocument();
    expect(api.leaveChallenge).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(api.leaveChallenge).toHaveBeenCalledWith("c3");
  });
});

describe("running them", () => {
  it("is for whoever holds MANAGE_SETTINGS and nobody else", async () => {
    render(<ChallengesScreen />);
    await screen.findByText("October steps");

    expect(
      screen.queryByRole("button", { name: /New challenge/ }),
    ).not.toBeInTheDocument();
    /* An employee who has not joined has no menu on that row at all. */
    expect(
      within(rowOf("October steps")).queryByRole("button", {
        name: /Actions for/,
      }),
    ).not.toBeInTheDocument();
  });

  it("gives an administrator results, edit and cancel in the row menu", async () => {
    held = new Set<PermissionKey>(["MANAGE_SETTINGS"]);
    render(<ChallengesScreen />);
    await screen.findByText("October steps");

    expect(
      screen.getByRole("button", { name: /New challenge/ }),
    ).toBeInTheDocument();
    await userEvent.click(
      within(rowOf("October steps")).getByRole("button", {
        name: "Actions for October steps",
      }),
    );
    expect(screen.getAllByRole("menuitem").map((el) => el.textContent)).toEqual(
      ["Results", "Edit", "Cancel challenge"],
    );
  });

  it("does not offer to edit or cancel one that is already cancelled", async () => {
    held = new Set<PermissionKey>(["MANAGE_SETTINGS"]);
    render(<ChallengesScreen />);
    await screen.findByText("Cancelled one");

    await userEvent.click(
      within(rowOf("Cancelled one")).getByRole("button", {
        name: "Actions for Cancelled one",
      }),
    );
    expect(screen.getAllByRole("menuitem").map((el) => el.textContent)).toEqual(
      ["Results"],
    );
  });

  it("cancels only after saying that it cannot be undone", async () => {
    held = new Set<PermissionKey>(["MANAGE_SETTINGS"]);
    api.cancelChallenge.mockResolvedValue({
      ...OPEN,
      status: "CANCELLED",
      team: null,
    });
    render(<ChallengesScreen />);
    await screen.findByText("October steps");

    await userEvent.click(
      within(rowOf("October steps")).getByRole("button", {
        name: "Actions for October steps",
      }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Cancel challenge" }),
    );

    expect(
      await screen.findByText(/This cannot be undone/),
    ).toBeInTheDocument();
    expect(api.cancelChallenge).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getAllByRole("button", { name: "Cancel challenge" }).at(-1)!,
    );
    expect(api.cancelChallenge).toHaveBeenCalledWith("c1");
  });

  describe("starting one", () => {
    beforeEach(() => {
      held = new Set<PermissionKey>(["MANAGE_SETTINGS"]);
    });

    const open = async () => {
      render(<ChallengesScreen />);
      await userEvent.click(
        await screen.findByRole("button", { name: /New challenge/ }),
      );
      return screen.findByRole("dialog");
    };

    it("sends what was filled in, with dates as plain days", async () => {
      api.createChallenge.mockResolvedValue(detail());
      const dialog = await open();

      await userEvent.type(
        within(dialog).getByLabelText(/Name/),
        "Autumn walk",
      );
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Create challenge" }),
      );

      expect(api.createChallenge).toHaveBeenCalledWith({
        title: "Autumn walk",
        metric: "STEPS",
        mode: "INDIVIDUAL",
        startsOn: "2026-10-21",
        endsOn: "2026-10-27",
      });
    });

    it("wants a name, and a window the API would accept", async () => {
      const dialog = await open();

      await userEvent.click(
        within(dialog).getByRole("button", { name: "Create challenge" }),
      );
      expect(
        await within(dialog).findByText("Give it a name."),
      ).toBeInTheDocument();

      await userEvent.type(within(dialog).getByLabelText(/Name/), "Long one");
      const ends = within(dialog).getByLabelText(/Ends on/);
      await userEvent.clear(ends);
      await userEvent.type(ends, "2027-03-01");
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Create challenge" }),
      );

      expect(
        await within(dialog).findByText(/at most 90 days/),
      ).toBeInTheDocument();
      expect(api.createChallenge).not.toHaveBeenCalled();
    });
  });
});

describe("results", () => {
  const openResults = async () => {
    held = new Set<PermissionKey>(["MANAGE_SETTINGS"]);
    render(<ChallengesScreen />);
    await screen.findByText("October steps");
    await userEvent.click(
      within(rowOf("October steps")).getByRole("button", {
        name: "Actions for October steps",
      }),
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Results" }));
    return screen.findByRole("dialog");
  };

  const header = {
    id: "c1",
    title: "October steps",
    mode: "INDIVIDUAL" as const,
    metric: "STEPS" as const,
    status: "ACTIVE" as const,
    startsOn: "2026-10-19",
    endsOn: "2026-11-01",
  };

  it("holds back a count below the floor and gives the reason, not a number", async () => {
    api.results.mockResolvedValue({
      challenge: header,
      floor: 3,
      participation: {
        withheld: true,
        participants: null,
        note: "Results appear once 3 people have joined.",
      },
      totals: {
        released: false,
        withheld: false,
        total: null,
        average: null,
        note: "Totals are released 7 days after the challenge ends.",
      },
    });
    const dialog = await openResults();

    expect(await within(dialog).findByText("Held back")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Results appear once 3 people have joined."),
    ).toBeInTheDocument();
    expect(within(dialog).getAllByText("Not yet").length).toBeGreaterThan(0);
    expect(within(dialog).queryByText(/\d steps/)).not.toBeInTheDocument();
  });

  it("shows the total and average once they are released, and no person", async () => {
    api.results.mockResolvedValue({
      challenge: { ...header, status: "ENDED" },
      floor: 3,
      participation: { withheld: false, participants: 7, note: null },
      totals: {
        released: true,
        withheld: false,
        total: 91000,
        average: 13000,
        note: null,
      },
    });
    const dialog = await openResults();

    expect(await within(dialog).findByText("7")).toBeInTheDocument();
    expect(within(dialog).getByText("91,000 steps")).toBeInTheDocument();
    expect(within(dialog).getByText("13,000 steps")).toBeInTheDocument();
    expect(within(dialog).queryByRole("table")).not.toBeInTheDocument();
  });

  it("says a released total was held back when too few logged anything", async () => {
    api.results.mockResolvedValue({
      challenge: { ...header, status: "ENDED" },
      floor: 3,
      participation: { withheld: false, participants: 4, note: null },
      totals: {
        released: true,
        withheld: true,
        total: null,
        average: null,
        note: "Totals appear once at least 3 people have logged something.",
      },
    });
    const dialog = await openResults();

    expect((await within(dialog).findAllByText("Held back")).length).toBe(2);
    expect(
      within(dialog).getByText(/at least 3 people have logged something/),
    ).toBeInTheDocument();
  });

  it("lists teams with no overall count, and holds a thin team's figures back", async () => {
    api.results.mockResolvedValue({
      challenge: { ...header, mode: "TEAM", status: "ENDED" },
      floor: 3,
      participation: null,
      totals: {
        released: true,
        note: "Teams with fewer than 3 participants are not shown.",
        teams: [
          {
            teamId: "t1",
            name: "Platform",
            participants: 4,
            withheld: false,
            total: 40000,
            average: 10000,
          },
          {
            teamId: "t2",
            name: "Support",
            participants: 3,
            withheld: true,
            total: null,
            average: null,
          },
        ],
      },
    });
    const dialog = await openResults();

    expect(await within(dialog).findByText("Platform")).toBeInTheDocument();
    expect(within(dialog).getByText("40,000 steps")).toBeInTheDocument();
    expect(within(dialog).getAllByText("Held back")).toHaveLength(2);
    /* Two teams of 4 and 3 would sum to a participant count; there is none. */
    expect(within(dialog).queryByText("7")).not.toBeInTheDocument();
  });

  it("shows the API's refusal if somebody without the right opens it", async () => {
    api.results.mockRejectedValue(
      new ApiError(
        403,
        "forbidden",
        "Only an administrator can see a challenge's results.",
      ),
    );
    const dialog = await openResults();

    expect(
      await within(dialog).findByText(/Only an administrator can see/),
    ).toBeInTheDocument();
  });
});
