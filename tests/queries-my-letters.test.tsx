import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { QueryPage } from "@/lib/api/queries";
import { DEMO_QUERY_HEADING } from "@/lib/store/queries";
import { summary, SUBJECT_LINE } from "./queries-fixtures";

/**
 * The page behind the **Queries** row for everybody who does not write or decide queries.
 *
 * What is proved: a person sees the letters addressed to them, one line each, with a reference,
 * where it stands and the reply-by time, and never a subject line or a name; an empty list says
 * so in words but only once the read has worked, and a read that failed or is still going never
 * says it; a switched-off company is sent home and a demo is told it needs the server; the same
 * list is drawn above the register or the drafts only when there is a letter and says nothing
 * otherwise; and the title row has a way back to the directory only for the people who can open it.
 */

const replaceRoute = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceRoute, push: vi.fn() }),
  usePathname: () => "/people/queries",
  useSearchParams: () => new URLSearchParams(),
}));
let held = new Set<string>();
vi.mock("@/lib/permissions", () => ({
  useCan: (key: string) => held.has(key),
}));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
  useSession: () => ({ isConnected: true, employeeId: "e-self" }),
}));

let on = true;
let known = true;
let switchError: unknown = null;
type Mine = {
  data: QueryPage | null;
  loading: boolean;
  error: unknown;
  unavailable: boolean;
};
let mine: Mine;
const mineHook = vi.fn();
vi.mock("@/lib/store/queries", async (original) => ({
  ...(await original<typeof import("@/lib/store/queries")>()),
  useQueriesSwitch: () => ({
    on,
    known,
    said: true,
    editable: false,
    error: switchError,
  }),
  useMyQueries: (enabled: boolean) => {
    mineHook(enabled);
    return { ...mine, reload: vi.fn() };
  },
  useQueryRegister: () => ({
    data: null,
    loading: false,
    error: null,
    unavailable: false,
    reload: vi.fn(),
  }),
  useMyDrafts: () => ({
    data: null,
    loading: false,
    error: null,
    unavailable: false,
    reload: vi.fn(),
  }),
}));

const { MyLetters } = await import("@/app/(app)/people/queries/my-letters");
const { QueriesHeader, QueriesScreen } =
  await import("@/app/(app)/people/queries/queries-screen");

const page = (
  rows: ReturnType<typeof summary>[],
  waiting: number | null = null,
): QueryPage => ({
  rows,
  meta: {
    page: 1,
    pageSize: 50,
    total: rows.length,
    totalPages: 1,
    hasMore: false,
  },
  waiting,
});

beforeEach(() => {
  vi.clearAllMocks();
  held = new Set();
  on = true;
  known = true;
  switchError = null;
  mine = {
    data: page([summary()], 1),
    loading: false,
    error: null,
    unavailable: false,
  };
});

describe("the person a letter was issued to", () => {
  it("sees their letters, one line each, with the way in", () => {
    render(<MyLetters />);
    expect(screen.getByText("Letters addressed to you")).toBeInTheDocument();
    expect(screen.getByText("Letter Q-2026-014")).toBeInTheDocument();
    expect(screen.getByText(/Issued, reply by/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open it" })).toHaveAttribute(
      "href",
      "/people/queries/q-1",
    );
    expect(
      screen.getByText("One is waiting for your reply."),
    ).toBeInTheDocument();
  });

  it("has a link big enough to press with a finger", () => {
    render(<MyLetters />);
    expect(screen.getByRole("link", { name: "Open it" }).className).toContain(
      "pointer-coarse:min-h-11",
    );
  });

  it("is told nothing about what a letter is about, or who it is addressed to, in the list", () => {
    render(<MyLetters />);
    expect(document.body.textContent).not.toContain(SUBJECT_LINE);
    expect(document.body.textContent).not.toContain("Chidi Nwosu");
  });

  it("sees every letter, however many, and not only the first five", () => {
    mine = {
      ...mine,
      data: page(
        Array.from({ length: 8 }, (_, i) =>
          summary({ id: `q-${i}`, reference: `Q-2026-0${i}` }),
        ),
        0,
      ),
    };
    render(<MyLetters />);
    expect(screen.getAllByRole("link", { name: "Open it" })).toHaveLength(8);
  });

  it("does not show a reply-by time for a letter that has been answered", () => {
    mine = { ...mine, data: page([summary({ status: "REPLIED" })], 0) };
    render(<MyLetters />);
    expect(screen.queryByText(/reply by/)).not.toBeInTheDocument();
  });

  it("makes no claim about how many wait when the server did not say", () => {
    mine = { ...mine, data: page([summary()], null) };
    render(<MyLetters />);
    expect(
      screen.queryByText(/waiting for your reply/),
    ).not.toBeInTheDocument();
  });

  it("asks for its letters only while the company has queries on", () => {
    render(<MyLetters />);
    expect(mineHook).toHaveBeenLastCalledWith(true);
  });
});

describe("a list with nothing in it", () => {
  it("says so in words, and where a letter would come from, once the read has worked", () => {
    mine = { ...mine, data: page([], 0) };
    render(<MyLetters />);
    expect(
      screen.getByText("Nothing has been sent to you"),
    ).toBeInTheDocument();
    expect(screen.getByText(/in your notifications/)).toBeInTheDocument();
    expect(
      screen.queryByText("Letters addressed to you"),
    ).not.toBeInTheDocument();
  });

  it("does not say it while the read is still going", () => {
    mine = { ...mine, data: null, loading: true };
    render(<MyLetters />);
    expect(
      screen.queryByText("Nothing has been sent to you"),
    ).not.toBeInTheDocument();
  });

  it("does not say it while the company's settings are still loading, when the letters have not even been asked for", () => {
    /* What the real hook reports for a read that is not enabled yet: no data, no error, not loading. */
    on = false;
    known = false;
    mine = { data: null, loading: false, error: null, unavailable: false };
    const { container } = render(<MyLetters />);
    expect(
      screen.queryByText("Nothing has been sent to you"),
    ).not.toBeInTheDocument();
    /* It is still waiting, so it says so with the loading shapes rather than a blank card. */
    expect(
      container.querySelector('[class*="animate-shimmer"]'),
    ).not.toBeNull();
    expect(replaceRoute).not.toHaveBeenCalled();
  });

  it("says the settings could not be read, and never that nothing was sent, when they fail", () => {
    on = false;
    known = false;
    switchError = new ApiError(500, "server_error", "Boom");
    mine = { data: null, loading: false, error: null, unavailable: false };
    const { container } = render(<MyLetters />);
    expect(
      screen.queryByText("Nothing has been sent to you"),
    ).not.toBeInTheDocument();
    /* The failure is shown, not a blank card and not loading shapes. */
    expect(screen.getAllByText(/your letters/i).length).toBeGreaterThan(0);
    expect(container.querySelector('[class*="animate-shimmer"]')).toBeNull();
    /* And there is no button that could not work: the letters are not being asked for. */
    expect(
      screen.queryByRole("button", { name: /try again/i }),
    ).not.toBeInTheDocument();
    expect(replaceRoute).not.toHaveBeenCalled();
  });

  it("says the read failed, with a way to try again, and never that nothing was sent", () => {
    mine = {
      ...mine,
      data: null,
      error: new ApiError(500, "server_error", "Boom"),
    };
    render(<MyLetters />);
    expect(
      screen.queryByText("Nothing has been sent to you"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
  });
});

describe("a company that has not turned queries on", () => {
  it("sends the person to the dashboard, not a page that can only say no", () => {
    on = false;
    render(<MyLetters />);
    expect(replaceRoute).toHaveBeenCalledWith("/dashboard");
    expect(mineHook).toHaveBeenLastCalledWith(false);
  });

  it("does the same when the server says the module is off", () => {
    mine = {
      ...mine,
      data: null,
      error: Object.assign(new ApiError(422, "unprocessable", "Off"), {
        details: { reason: "module_off" },
      }),
    };
    render(<MyLetters />);
    expect(replaceRoute).toHaveBeenCalledWith("/dashboard");
  });

  it("is told it needs the server when there is none, and is not shown a list", () => {
    mine = { ...mine, data: null, unavailable: true };
    render(<MyLetters />);
    expect(screen.queryByText("Letters addressed to you")).toBeNull();
    expect(screen.getByText(DEMO_QUERY_HEADING)).toBeInTheDocument();
  });
});

describe("alongside the register or the drafts", () => {
  it("draws the letters when there is one", () => {
    render(<MyLetters alongside />);
    expect(screen.getByText("Letters addressed to you")).toBeInTheDocument();
  });

  it.each([
    ["no letter", { data: page([], 0) }],
    ["a read that failed", { data: null, error: new ApiError(500, "x", "x") }],
    ["a read still going", { data: null, loading: true }],
  ])("draws nothing at all for %s", (_label, over) => {
    mine = { ...mine, ...over };
    const { container } = render(<MyLetters alongside />);
    expect(container).toBeEmptyDOMElement();
  });

  it("draws nothing when the company has queries off", () => {
    on = false;
    const { container } = render(<MyLetters alongside />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("what the Queries page gives each reader", () => {
  it("gives an employee their letters and no register", () => {
    render(<QueriesScreen />);
    expect(screen.getByText("Letters addressed to you")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("gives a manager who holds nothing about queries the same page", () => {
    held = new Set(["APPROVE_LEAVE", "EDIT_RECORDS_DEPARTMENT"]);
    render(<QueriesScreen />);
    expect(screen.getByText("Letters addressed to you")).toBeInTheDocument();
  });

  it("gives a person with nothing sent to them the plain empty state, not a refusal", () => {
    mine = { ...mine, data: page([], 0) };
    render(<QueriesScreen />);
    expect(
      screen.getByText("Nothing has been sent to you"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("You cannot open the queries register"),
    ).not.toBeInTheDocument();
  });
});

describe("the title row", () => {
  it("has no way back to the directory for a person reading their own letters", () => {
    render(<QueriesHeader />);
    expect(
      screen.getByRole("heading", { name: "Queries" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Employees/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Letters from HR that ask you to explain something/),
    ).toBeInTheDocument();
  });

  it("keeps the way back to the directory for the people who work queries", () => {
    held = new Set(["ISSUE_QUERIES"]);
    render(<QueriesHeader />);
    expect(screen.getByRole("link", { name: /Employees/ })).toHaveAttribute(
      "href",
      "/people",
    );
    expect(
      screen.queryByText(/ask you to explain something/),
    ).not.toBeInTheDocument();
  });
});
