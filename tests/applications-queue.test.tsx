import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiApplication } from "@/lib/api/careers";

/**
 * The applications queue, as a recruiter works it.
 *
 * It used to load the newest hundred and filter, search and count them in the
 * browser, so the hundred-and-first applicant did not exist as far as the screen
 * was concerned. These tests stand in for the API — a list of 120 applicants
 * served fifty at a time behind a cursor — and read what the screen asks for and
 * what it shows: the server's count, "Load more", every filter sent as a question
 * rather than applied to what it had, a search that waits for the typing to pause,
 * and an Open CV that asks the API for the file.
 */

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => search,
  usePathname: () => "/hiring/postings/applications",
}));

/* jsdom's storage is not usable under this runner, so "signed in" is stated
   rather than stored. */
vi.mock("@/lib/api/client", async (original) => {
  const real = await original<typeof import("@/lib/api/client")>();
  return { ...real, tokens: { ...real.tokens, has: () => true } };
});

vi.mock("@/lib/permissions", () => ({
  usePermissions: () => ({ can: () => true, loading: false }),
  useCan: () => true,
}));

vi.mock("@/lib/store/recruitment", () => ({
  useRequisitions: () => ({
    requisitions: [],
    total: 0,
    loading: false,
    error: null,
    connected: true,
    reload: () => {},
  }),
}));

vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
  useSession: () => ({ isConnected: true, isLoading: false }),
}));

const listApplications = vi.fn();
const listPostings = vi.fn();
const analytics = vi.fn();
const openCv = vi.fn();

vi.mock("@/lib/api/careers", async (original) => {
  const real = await original<typeof import("@/lib/api/careers")>();
  return {
    ...real,
    careersApi: {
      ...real.careersApi,
      listApplications: (...args: unknown[]) => listApplications(...args),
      listPostings: (...args: unknown[]) => listPostings(...args),
      analytics: (...args: unknown[]) => analytics(...args),
      openCv: (...args: unknown[]) => openCv(...args),
    },
  };
});

const { ApplicationsScreen } =
  await import("@/app/(app)/hiring/postings/applications/applications-screen");

const application = (n: number, over: Partial<ApiApplication> = {}) =>
  ({
    id: `app-${String(n).padStart(3, "0")}`,
    postingId: "post-1",
    postingTitle: "Payroll Analyst",
    firstName: "Applicant",
    lastName: String(n),
    name: `Applicant ${String(n)}`,
    email: `applicant${String(n)}@example.com`,
    phone: null,
    coverNote: null,
    source: null,
    status: "RECEIVED",
    screenedAt: null,
    declineReason: null,
    candidateId: null,
    cv: { key: `k/${String(n)}`, url: null, expiresAt: null, note: null },
    appliedAt: "2026-10-01T09:00:00.000Z",
    ...over,
  }) as ApiApplication;

/** A fake API holding `count` applicants, newest first, `size` to a page. */
function serve(count: number, size = 50) {
  const all = Array.from({ length: count }, (_, i) => application(count - i));
  listApplications.mockImplementation(
    async (params: { cursor?: string; pageSize?: number }) => {
      const start = params.cursor ? Number.parseInt(params.cursor, 10) : 0;
      const end = start + (params.pageSize ?? size);
      return {
        data: all.slice(start, end),
        meta: {
          total: count,
          nextCursor: end < count ? String(end) : null,
          page: 1,
          pageSize: size,
          totalPages: 1,
          hasMore: end < count,
        },
      };
    },
  );
  return all;
}

const sentParams = (call = -1): Record<string, unknown> =>
  (listApplications.mock.calls.at(call)?.[0] ?? {}) as Record<string, unknown>;

const open = () => render(<ApplicationsScreen initialStatus="ALL" />);

beforeEach(() => {
  search = new URLSearchParams();
  listApplications.mockReset();
  listPostings.mockReset();
  analytics.mockReset();
  openCv.mockReset();
  listPostings.mockResolvedValue({
    data: [
      {
        id: "post-1",
        title: "Payroll Analyst",
        requisitionId: "req-1",
        requisitionReference: "REQ-1",
        requisitionStatus: "OPEN",
      },
      {
        id: "post-2",
        title: "HR Officer",
        requisitionId: "req-2",
        requisitionReference: "REQ-2",
        requisitionStatus: "OPEN",
      },
    ],
    meta: { total: 2 },
  });
  analytics.mockResolvedValue({
    totals: {},
    perPosting: [],
    perSource: [
      { source: "LinkedIn", applications: 5, share: 50 },
      { source: "Not given", applications: 5, share: 50 },
    ],
    cvNote: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a long queue", () => {
  it("shows the first fifty of the server's count, not the count of what it holds", async () => {
    serve(120);
    open();

    await screen.findByText("Applicant 120");
    expect(screen.getAllByText(/^Applicant \d+$/)).toHaveLength(50);
    expect(
      screen.getByText("Showing 50 of 120 applications"),
    ).toBeInTheDocument();
    /* The bar's count is the server's 120, whatever is on screen. */
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(sentParams()).toMatchObject({ pageSize: 50 });
  });

  it("loads the next fifty on request, behind the cursor the API gave, until it runs out", async () => {
    serve(120);
    const user = userEvent.setup();
    open();
    await screen.findByText("Applicant 120");

    await user.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Applicant 70");
    expect(screen.getAllByText(/^Applicant \d+$/)).toHaveLength(100);
    expect(sentParams()).toMatchObject({ cursor: "50" });

    await user.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Applicant 1");
    expect(screen.getAllByText(/^Applicant \d+$/)).toHaveLength(120);
    expect(sentParams()).toMatchObject({ cursor: "100" });

    expect(screen.getByText("All 120 applications shown")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
  });

  it("shows no footer at all for a queue that fits on one screen and has one person in it", async () => {
    serve(1);
    open();
    await screen.findByText("Applicant 1");
    expect(screen.queryByText(/shown$/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
  });

  it("keeps what is on screen, says why, and offers to try again when a page fails", async () => {
    serve(120);
    const user = userEvent.setup();
    open();
    await screen.findByText("Applicant 120");

    const normal = listApplications.getMockImplementation()!;
    listApplications.mockImplementation(async (params: { cursor?: string }) => {
      if (params.cursor) throw new ApiError(500, "internal", "Boom.");
      return normal(params);
    });
    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong on our side",
    );
    expect(screen.getAllByText(/^Applicant \d+$/)).toHaveLength(50);

    listApplications.mockImplementation(normal);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Applicant 70");
    expect(screen.getAllByText(/^Applicant \d+$/)).toHaveLength(100);
  });
});

describe("filters are questions to the server", () => {
  it("asks for the Waiting tab by default, and starts a new list when the tab changes", async () => {
    serve(120);
    const user = userEvent.setup();
    render(<ApplicationsScreen />);
    await screen.findByText("Applicant 120");
    expect(sentParams()).toMatchObject({ status: "RECEIVED" });

    await user.click(screen.getByRole("radio", { name: "Screened in" }));
    await waitFor(() =>
      expect(sentParams()).toMatchObject({ status: "ADVANCED" }),
    );
    expect(sentParams()).not.toHaveProperty("cursor");
  });

  it("sends the advert, the source and the dates, and shows each as a chip that can be removed", async () => {
    serve(120);
    const user = userEvent.setup();
    open();
    await screen.findByText("Applicant 120");

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.selectOptions(screen.getByLabelText("Advert"), "post-2");
    await user.selectOptions(screen.getByLabelText("Heard via"), "LinkedIn");
    await user.type(screen.getByLabelText(/Applied from/), "2026-09-01");
    await user.type(screen.getByLabelText(/Applied to/), "2026-09-30");

    await waitFor(() =>
      expect(sentParams()).toMatchObject({
        postingId: "post-2",
        source: "LinkedIn",
        from: "2026-09-01",
        to: "2026-09-30",
      }),
    );
    /* "Not given" is a bucket the tally invents; it is not a source the API can
       filter on, so it is not offered. */
    expect(
      within(screen.getByLabelText("Heard via")).queryByRole("option", {
        name: "Not given",
      }),
    ).not.toBeInTheDocument();

    const chip = screen.getByRole("button", { name: /Advert:.*HR Officer/ });
    await user.click(chip);
    await waitFor(() => expect(sentParams()).not.toHaveProperty("postingId"));
  });

  it("does not send a date range that runs backwards, and says so", async () => {
    serve(10);
    const user = userEvent.setup();
    open();
    await screen.findByText("Applicant 10");

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.type(screen.getByLabelText(/Applied from/), "2026-09-30");
    await user.type(screen.getByLabelText(/Applied to/), "2026-09-01");

    expect(
      await screen.findByText(/That is before the start date/),
    ).toBeInTheDocument();
    expect(sentParams()).not.toHaveProperty("from");
    expect(sentParams()).not.toHaveProperty("to");
  });

  it("says nobody matches, and clears everything in one press", async () => {
    serve(10);
    const user = userEvent.setup();
    open();
    await screen.findByText("Applicant 10");

    listApplications.mockResolvedValueOnce({
      data: [],
      meta: {
        total: 0,
        nextCursor: null,
        page: 1,
        pageSize: 50,
        totalPages: 0,
        hasMore: false,
      },
    });
    await user.type(
      screen.getByRole("textbox", { name: /Find an applicant/ }),
      "zzz",
    );

    expect(await screen.findByText("Nobody matches")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Clear the search and filters" }),
    );
    await screen.findByText("Applicant 10");
    expect(sentParams()).not.toHaveProperty("q");
  });
});

describe("the search", () => {
  it("waits for the typing to pause, then asks the server, and does not filter what it already had", async () => {
    serve(120);
    const user = userEvent.setup();
    open();
    await screen.findByText("Applicant 120");
    const before = listApplications.mock.calls.length;

    await user.type(
      screen.getByRole("textbox", { name: /Find an applicant/ }),
      "ada",
    );

    /* Typed, not yet sent: the rows on screen answer the old question, and the
       screen says so rather than dressing them up as the answer. */
    expect(
      screen.getByText("Applicant 120").closest("[aria-busy]"),
    ).toHaveAttribute("aria-busy", "true");

    await waitFor(() => expect(sentParams()).toMatchObject({ q: "ada" }));
    /* One request for the whole word, not one per letter. */
    const asked = listApplications.mock.calls
      .slice(before)
      .map((call) => (call[0] as { q?: string }).q);
    expect(asked).toEqual(["ada"]);
  });
});

describe("opening a CV", () => {
  it("is offered only on a row whose applicant attached one", async () => {
    const all = serve(2);
    listApplications.mockResolvedValue({
      data: [all[0]!, { ...all[1]!, cv: null }],
      meta: {
        total: 2,
        nextCursor: null,
        page: 1,
        pageSize: 50,
        totalPages: 1,
        hasMore: false,
      },
    });
    open();
    await screen.findByText("Applicant 2");

    expect(screen.getAllByRole("button", { name: "Open CV" })).toHaveLength(1);
  });

  it("asks the API for that person's file, opens it in a tab, and never puts a link in the list", async () => {
    serve(2);
    openCv.mockResolvedValue({
      url: "https://files.example/cv.pdf?sig=1",
      expiresAt: null,
      filename: "CV - Applicant 2.pdf",
      note: null,
    });
    const tab = { opener: {}, location: { href: "" }, close: vi.fn() };
    const openWindow = vi.fn(() => tab);
    vi.stubGlobal("open", openWindow);
    const user = userEvent.setup();
    open();
    await screen.findByText("Applicant 2");

    await user.click(screen.getAllByRole("button", { name: "Open CV" })[0]!);

    await waitFor(() =>
      expect(tab.location.href).toBe("https://files.example/cv.pdf?sig=1"),
    );
    expect(openCv).toHaveBeenCalledWith("app-002");
    /* Opened inside the click and cut loose from this page. */
    expect(openWindow).toHaveBeenCalledWith("", "_blank");
    expect(tab.opener).toBeNull();
    expect(document.querySelector('a[href*="files.example"]')).toBeNull();
    vi.unstubAllGlobals();
  });

  it("says why when the API refuses, closes the tab it opened, and lets somebody try again", async () => {
    serve(2);
    openCv.mockRejectedValue(
      new ApiError(403, "forbidden", "You cannot open CVs for this advert."),
    );
    const tab = { opener: {}, location: { href: "" }, close: vi.fn() };
    vi.stubGlobal(
      "open",
      vi.fn(() => tab),
    );
    const user = userEvent.setup();
    open();
    await screen.findByText("Applicant 2");

    await user.click(screen.getAllByRole("button", { name: "Open CV" })[0]!);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You cannot open CVs for this advert.",
    );
    expect(tab.close).toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: "Open CV" })[0]).toBeEnabled();
    vi.unstubAllGlobals();
  });

  it("shows the API's own sentence, and opens nothing, when there is no file to open", async () => {
    serve(2);
    openCv.mockResolvedValue({
      url: null,
      expiresAt: null,
      filename: "CV - Applicant 2",
      note: "This application names a CV, and no file was ever uploaded against it.",
    });
    const tab = { opener: {}, location: { href: "" }, close: vi.fn() };
    vi.stubGlobal(
      "open",
      vi.fn(() => tab),
    );
    const user = userEvent.setup();
    open();
    await screen.findByText("Applicant 2");

    await user.click(screen.getAllByRole("button", { name: "Open CV" })[0]!);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "no file was ever uploaded against it",
    );
    expect(tab.close).toHaveBeenCalled();
    expect(tab.location.href).toBe("");
    /* An answer, not a failure: no alert, and the button is back. */
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Open CV" })[0]).toBeEnabled();
    vi.unstubAllGlobals();
  });

  it("shows the API's own sentence when storage is down, not a generic one", async () => {
    serve(2);
    openCv.mockRejectedValue(
      new ApiError(
        503,
        "storage_unavailable",
        "We could not check that file just now. Wait a minute and try again.",
      ),
    );
    vi.stubGlobal(
      "open",
      vi.fn(() => ({ opener: {}, location: { href: "" }, close: vi.fn() })),
    );
    const user = userEvent.setup();
    open();
    await screen.findByText("Applicant 2");

    await user.click(screen.getAllByRole("button", { name: "Open CV" })[0]!);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not check that file just now. Wait a minute and try again.",
    );
    vi.unstubAllGlobals();
  });

  it("offers a link to press when the browser refused the new tab", async () => {
    serve(2);
    openCv.mockResolvedValue({
      url: "https://files.example/cv.pdf?sig=1",
      expiresAt: null,
      filename: "CV - Applicant 2.pdf",
      note: null,
    });
    vi.stubGlobal(
      "open",
      vi.fn(() => null),
    );
    const user = userEvent.setup();
    open();
    await screen.findByText("Applicant 2");

    await user.click(screen.getAllByRole("button", { name: "Open CV" })[0]!);

    const link = await screen.findByRole("link", { name: "Open the file" });
    expect(link).toHaveAttribute("href", "https://files.example/cv.pdf?sig=1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    vi.unstubAllGlobals();
  });
});

describe("a refresh while somebody is reading", () => {
  it("does not blank or collapse the list", async () => {
    serve(120);
    const user = userEvent.setup();
    open();
    await screen.findByText("Applicant 120");
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Applicant 70");

    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("focus"));
    });
    /* Whatever the window-focus signal does, the hundred rows stay put. */
    expect(screen.getAllByText(/^Applicant \d+$/)).toHaveLength(100);
    expect(screen.queryByText("Loading the queue")).not.toBeInTheDocument();
  });
});
