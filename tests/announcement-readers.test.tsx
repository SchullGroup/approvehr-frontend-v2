import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiAnnouncement,
  ApiReader,
  ApiReadersMeta,
} from "@/lib/api/announcements";
import { ApiError } from "@/lib/api/client";

/**
 * Who has read a notice, in a drawer beside the list.
 *
 * The API is faked at its edge (`announcementsApi.readers`), so what is held is
 * the translation: which list opens first, what the counts say, what a failure is
 * allowed to claim, and what is never drawn. The rules are the ones `tsc` cannot
 * see, each a wrong claim that type-checks:
 *
 * - **counts are the API's**, never a sum of the rows on screen;
 * - **a rate of nothing is not 0%**: with nobody in the audience it says so;
 * - **a failed read is not an empty list**, and an unread one is not either;
 * - **the other list's rows never sit under this list's heading** while it loads;
 * - **no export, and nothing that promises a nudge**.
 */

const api = vi.hoisted(() => ({ readers: vi.fn() }));
const perm = vi.hoisted(() => ({ manage: true }));

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: true }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => perm.manage,
}));
vi.mock("@/lib/api/announcements", async (original) => ({
  ...(await original<typeof import("@/lib/api/announcements")>()),
  announcementsApi: { readers: api.readers },
}));

const { ReadersDrawer } =
  await import("@/app/(app)/settings/announcements/readers-drawer");

/* ----------------------------------------------------------------- fixtures */

const notice = (over: Partial<ApiAnnouncement> = {}): ApiAnnouncement => ({
  id: "n1",
  title: "Fire drill on Friday",
  body: "At eleven.",
  audience: "EVERYONE",
  departmentIds: [],
  departmentNames: [],
  pinned: false,
  mandatory: false,
  published: true,
  publishedAt: "2026-10-19T09:00:00.000Z",
  expiresOn: null,
  expired: false,
  postedByName: "Ada Obi",
  createdAt: "2026-10-19T09:00:00.000Z",
  updatedAt: "2026-10-19T09:00:00.000Z",
  ...over,
});

const reader = (id: string, over: Partial<ApiReader> = {}): ApiReader => ({
  userId: `u-${id}`,
  name: `Person ${id}`,
  employeeId: `e-${id}`,
  department: "Engineering",
  readAt: null,
  ...over,
});

const meta = (over: Partial<ApiReadersMeta> = {}) => ({
  counts: { reach: 12, read: 7, unread: 5 },
  readRate: 58,
  mandatory: false,
  ...over,
});

const page = (
  rows: ApiReader[],
  over: Partial<ApiReadersMeta> = {},
  paging: { total?: number; hasMore?: boolean } = {},
) => ({
  data: rows,
  meta: {
    page: 1,
    pageSize: 25,
    total: paging.total ?? rows.length,
    totalPages: 1,
    hasMore: paging.hasMore ?? false,
    ...meta(over),
  },
});

const read = (id: string) => reader(id, { readAt: "2026-10-20T08:30:00.000Z" });

/** Answers by `state`, so a test says what each list holds. */
function lists(byState: {
  read?: ReturnType<typeof page>;
  unread?: ReturnType<typeof page>;
}) {
  api.readers.mockImplementation(
    async (_id: string, params: { state: "read" | "unread" }) =>
      byState[params.state] ?? page([]),
  );
}

const open = (n: ApiAnnouncement = notice()) =>
  render(<ReadersDrawer notice={n} onClose={() => undefined} />);

beforeEach(() => {
  vi.clearAllMocks();
  perm.manage = true;
});

/* ------------------------------------------------------------------- opening */

describe("which list opens first", () => {
  it("opens on the chase list for a notice staff must read", async () => {
    lists({
      read: page([read("a")], { mandatory: true }),
      unread: page([reader("b"), reader("c")], { mandatory: true }),
    });
    open(notice({ mandatory: true }));
    expect(await screen.findByText("Person b")).toBeInTheDocument();
    expect(api.readers).toHaveBeenCalledWith(
      "n1",
      expect.objectContaining({ state: "unread" }),
      expect.anything(),
    );
    expect(screen.getByRole("tab", { name: /Still to read/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("opens on the evidence for an ordinary notice", async () => {
    lists({ read: page([read("a")]), unread: page([reader("b")]) });
    open();
    expect(await screen.findByText("Person a")).toBeInTheDocument();
    expect(api.readers).toHaveBeenCalledWith(
      "n1",
      expect.objectContaining({ state: "read" }),
      expect.anything(),
    );
  });
});

/* -------------------------------------------------------------------- counts */

describe("the numbers", () => {
  it("says what the API counted, on the tabs and above them", async () => {
    lists({ read: page([read("a")]) });
    open();
    await screen.findByText("Person a");
    /* 7 of 12 and 58%: the API's, with one row on screen to prove nothing here
       is added up from what is drawn. */
    expect(screen.getByText(/of/, { selector: "p" }).textContent).toMatch(
      /7 of 12 people have read it/,
    );
    expect(screen.getByText("58%")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Read\s*7/ })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Still to read\s*5/ }),
    ).toBeInTheDocument();
  });

  it("says nobody is in the audience, and never 0%, when that is so", async () => {
    lists({
      read: page([], {
        counts: { reach: 0, read: 0, unread: 0 },
        readRate: null,
      }),
    });
    open();
    expect(
      await screen.findByText(/Nobody is in this notice.s audience yet/),
    ).toBeInTheDocument();
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("is a real 0% when people are in the audience and none has read it", async () => {
    lists({
      read: page([], {
        counts: { reach: 11, read: 0, unread: 11 },
        readRate: 0,
      }),
    });
    open();
    expect(await screen.findByText("0%")).toBeInTheDocument();
    expect(screen.getByText("Nobody has opened it yet")).toBeInTheDocument();
  });

  it("puts no count on a tab before anything has answered", async () => {
    let release: (value: unknown) => void = () => undefined;
    api.readers.mockImplementation(
      () => new Promise((resolve) => (release = resolve)),
    );
    open();
    expect(screen.getByRole("tab", { name: "Read" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Still to read" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
    release(page([]));
  });

  it("says how loudly to chase a notice staff must read", async () => {
    lists({
      read: page([read("a")], { mandatory: true }),
      unread: page([reader("b")], { mandatory: true }),
    });
    open(notice({ mandatory: true }));
    await screen.findByText("Person b");
    expect(screen.getByText("Must read")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Staff are expected to open this one. 5 people have not yet/,
      ),
    ).toBeInTheDocument();
  });
});

/* ----------------------------------------------------------------------- rows */

describe("the rows", () => {
  it("dates the reads and not the chase list", async () => {
    const user = userEvent.setup();
    lists({ read: page([read("a")]), unread: page([reader("b")]) });
    open();
    await screen.findByText("Person a");
    expect(screen.getByText(/20 Oct 2026, 09:30/)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Still to read/ }));
    await screen.findByText("Person b");
    expect(screen.queryByText(/Oct 2026/)).toBeNull();
  });

  it("says so for an account with no staff record, instead of a blank", async () => {
    lists({
      read: page([
        reader("owner", {
          employeeId: null,
          department: null,
          readAt: "2026-10-20T08:30:00.000Z",
        }),
      ]),
    });
    open();
    expect(await screen.findByText("Person owner")).toBeInTheDocument();
    expect(screen.getByText("No staff record")).toBeInTheDocument();
  });

  it("never shows the other list's people under this list's heading while it loads", async () => {
    const user = userEvent.setup();
    lists({ read: page([read("a")]) });
    open();
    await screen.findByText("Person a");

    let release: (value: unknown) => void = () => undefined;
    api.readers.mockImplementation(
      () => new Promise((resolve) => (release = resolve)),
    );
    await user.click(screen.getByRole("tab", { name: /Still to read/ }));
    expect(screen.queryByText("Person a")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(/Loading/);
    release(page([reader("z")]));
    expect(await screen.findByText("Person z")).toBeInTheDocument();
  });
});

/* --------------------------------------------------------------------- paging */

describe("paging", () => {
  it("appends the next page and says how many are shown", async () => {
    const user = userEvent.setup();
    const first = Array.from({ length: 25 }, (_, i) => read(`p${i}`));
    api.readers.mockImplementation(
      async (_id: string, params: { state: string; page?: number }) =>
        params.page === 2
          ? page([read("last")], {}, { total: 26, hasMore: false })
          : page(first, {}, { total: 26, hasMore: true }),
    );
    open();
    await screen.findByText("Person p0");
    expect(screen.getByText("Showing 25 of 26 people")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Person last")).toBeInTheDocument();
    expect(screen.getByText("Person p0")).toBeInTheDocument();
    expect(api.readers).toHaveBeenLastCalledWith(
      "n1",
      expect.objectContaining({ state: "read", page: 2 }),
      expect.anything(),
    );
    expect(screen.getByText("All 26 people shown")).toBeInTheDocument();
  });

  it("keeps what was loaded when a later page fails, and offers it again", async () => {
    const user = userEvent.setup();
    const first = Array.from({ length: 25 }, (_, i) => read(`p${i}`));
    api.readers.mockImplementation(
      async (_id: string, params: { page?: number }) => {
        if (params.page === 2) {
          throw new ApiError(500, "internal_error", "boom");
        }
        return page(first, {}, { total: 40, hasMore: true });
      },
    );
    open();
    await screen.findByText("Person p0");
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Person p0")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------- failure */

describe("when it cannot be read", () => {
  it("shows the failure and no empty state and no count", async () => {
    api.readers.mockRejectedValue(
      new ApiError(500, "internal_error", "Something broke."),
    );
    open();
    /* The title and the advice both name what did not arrive. */
    expect(
      (await screen.findAllByText(/who has read this notice did not load/i))
        .length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Nobody has opened it yet")).toBeNull();
    expect(screen.queryByText("Everybody it is for has read it")).toBeNull();
    expect(screen.queryByText(/people have read it/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("says the API's own words for a refusal, with nothing to retry", async () => {
    api.readers.mockRejectedValue(
      new ApiError(409, "conflict", "A draft has not been seen by anybody."),
    );
    open();
    expect(
      await screen.findByText("A draft has not been seen by anybody."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("is a failure and not a blank for something thrown that was not an ApiError", async () => {
    api.readers.mockRejectedValue(new TypeError("x is not a function"));
    open();
    /* The title and the advice both name what did not arrive. */
    expect(
      (await screen.findAllByText(/who has read this notice did not load/i))
        .length,
    ).toBeGreaterThan(0);
  });

  it("asks nothing of the API for somebody without the settings permission", async () => {
    perm.manage = false;
    open();
    await waitFor(() => expect(api.readers).not.toHaveBeenCalled());
  });
});

/* ------------------------------------------------------- what it must not do */

describe("what is not offered", () => {
  it("has no export and nothing that looks like a nudge", async () => {
    lists({ read: page([read("a")]), unread: page([reader("b")]) });
    open(notice({ mandatory: true }));
    await screen.findByText("Person b");
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).queryByRole("button", { name: /export|download|csv/i }),
    ).toBeNull();
    expect(
      within(dialog).queryByRole("button", {
        name: /remind|nudge|chase|send/i,
      }),
    ).toBeNull();
  });
});
