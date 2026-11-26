import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryPage } from "@/lib/api/queries";
import { summary, SUBJECT_LINE } from "./queries-fixtures";

/**
 * The two small entries: "Letters from HR" on the person's own profile, and a link on a record.
 *
 * What is proved: the profile entry says only that a letter exists, where it stands and when to
 * reply by, and **never the subject line**; it is absent unless the company runs queries and one
 * has been issued; a failed read draws nothing; the waiting figure is the server's and absent when
 * the server did not send one; and the record's link carries no number at all.
 */

let held = new Set<string>();
vi.mock("@/lib/permissions", () => ({
  useCan: (key: string) => held.has(key),
}));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
}));

let on = true;
const mineHook = vi.fn();
const registerHook = vi.fn();
let mineState: { data: QueryPage | null };
let registerState: { data: QueryPage | null };
vi.mock("@/lib/store/queries", async (original) => ({
  ...(await original<typeof import("@/lib/store/queries")>()),
  useQueriesSwitch: () => ({
    on,
    known: true,
    said: true,
    editable: false,
    error: null,
  }),
  useMyQueries: (enabled: boolean) => {
    mineHook(enabled);
    return mineState;
  },
  useQueryRegister: (...args: unknown[]) => {
    registerHook(...args);
    return registerState;
  },
}));

const { LettersFromHr, QueriesAboutPerson } =
  await import("@/app/(app)/people/queries/entries");

const page = (
  rows: ReturnType<typeof summary>[],
  waiting: number | null = null,
  total = rows.length,
): QueryPage => ({
  rows,
  meta: { page: 1, pageSize: 50, total, totalPages: 1, hasMore: false },
  waiting,
});

beforeEach(() => {
  vi.clearAllMocks();
  held = new Set();
  on = true;
  mineState = { data: page([summary()], 1) };
  registerState = { data: page([summary()]) };
});

describe("Letters from HR, on the person's own profile", () => {
  it("says a letter exists and when to reply by, and never what it is about", () => {
    render(<LettersFromHr />);
    expect(screen.getByText("Letters from HR")).toBeInTheDocument();
    expect(screen.getByText("Letter Q-2026-014")).toBeInTheDocument();
    expect(screen.getByText(/Issued, reply by/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open it" })).toHaveAttribute(
      "href",
      "/people/queries/q-1",
    );
    expect(document.body.textContent).not.toContain(SUBJECT_LINE);
    expect(document.body.textContent ?? "").not.toMatch(/absence|query/i);
  });

  it("says how many are waiting, in the server's words", () => {
    mineState = { data: page([summary(), summary({ id: "q-2" })], 2) };
    render(<LettersFromHr />);
    expect(
      screen.getByText("2 are waiting for your reply."),
    ).toBeInTheDocument();
  });

  it("says one is waiting in the singular", () => {
    render(<LettersFromHr />);
    expect(
      screen.getByText("One is waiting for your reply."),
    ).toBeInTheDocument();
  });

  it("says where the rest are when there are more than five, instead of cutting the list off", () => {
    const six = Array.from({ length: 6 }, (_, i) =>
      summary({ id: `q-${i}`, reference: `Q-2026-00${i}` }),
    );
    mineState = { data: page(six, 0) };
    render(<LettersFromHr />);
    expect(screen.getAllByRole("link", { name: "Open it" })).toHaveLength(5);
    expect(
      screen.getByRole("link", { name: "All your letters" }),
    ).toHaveAttribute("href", "/people/queries");
  });

  it("has no 'all' link when there are five letters or fewer", () => {
    const five = Array.from({ length: 5 }, (_, i) =>
      summary({ id: `q-${i}`, reference: `Q-2026-00${i}` }),
    );
    mineState = { data: page(five, 0) };
    render(<LettersFromHr />);
    expect(
      screen.queryByRole("link", { name: "All your letters" }),
    ).not.toBeInTheDocument();
  });

  it("makes no claim about how many wait when the server did not say", () => {
    mineState = { data: page([summary()], null) };
    render(<LettersFromHr />);
    expect(
      screen.queryByText(/waiting for your reply/),
    ).not.toBeInTheDocument();
  });

  it("is absent when the company has not turned queries on, and asks for nothing", () => {
    on = false;
    const { container } = render(<LettersFromHr />);
    expect(container).toBeEmptyDOMElement();
    expect(mineHook).toHaveBeenLastCalledWith(false);
  });

  it("is absent when nothing has been issued to the person, with no 'no letters' claim", () => {
    mineState = { data: page([], 0) };
    const { container } = render(<LettersFromHr />);
    expect(container).toBeEmptyDOMElement();
  });

  it("draws nothing for a read that failed, rather than an error on a profile page", () => {
    mineState = { data: null };
    const { container } = render(<LettersFromHr />);
    expect(container).toBeEmptyDOMElement();
  });

  it("does not show a reply-by time for a letter that has been answered", () => {
    mineState = { data: page([summary({ status: "REPLIED" })], 0) };
    render(<LettersFromHr />);
    expect(screen.getByText("Replied")).toBeInTheDocument();
    expect(screen.queryByText(/reply by/)).not.toBeInTheDocument();
  });
});

describe("the link on a person's record", () => {
  it("is for somebody who works queries, and carries no number", () => {
    held = new Set(["ISSUE_QUERIES"]);
    registerState = { data: page([summary()], null, 7) };
    render(<QueriesAboutPerson employeeId="e-1" />);
    const link = screen.getByRole("link", {
      name: "See the queries about them",
    });
    expect(link).toHaveAttribute("href", "/people/queries?subject=e-1");
    expect(document.body.textContent ?? "").not.toMatch(/\d/);
  });

  it("is absent for anybody else, and asks for nothing", () => {
    const { container } = render(<QueriesAboutPerson employeeId="e-1" />);
    expect(container).toBeEmptyDOMElement();
    expect(registerHook).toHaveBeenLastCalledWith(expect.anything(), false);
  });

  it("is absent when there are none, with no claim that there are none", () => {
    held = new Set(["DECIDE_QUERIES"]);
    registerState = { data: page([], null, 0) };
    const { container } = render(<QueriesAboutPerson employeeId="e-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is absent when queries are off", () => {
    held = new Set(["ISSUE_QUERIES"]);
    on = false;
    const { container } = render(<QueriesAboutPerson employeeId="e-1" />);
    expect(container).toBeEmptyDOMElement();
  });
});
