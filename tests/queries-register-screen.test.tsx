import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { QueryPage } from "@/lib/api/queries";
import { summary, SUBJECT_LINE } from "./queries-fixtures";

/**
 * The register, for the people who write or decide queries.
 *
 * What is proved: somebody with neither permission is told they cannot open it; a company with
 * queries off is told so (with the way to Settings only for somebody who may change it); there is
 * no demo, only the refusal; the server's own sentence for where a reply stands is shown as it
 * came, with "No reply in time" a neutral label and never an accusation; the filter reaches the
 * server as the state it names; and there is no number anywhere on the page, which is what keeps
 * a count from being compared, ranked or worked back to a person.
 */

let held = new Set<string>();
vi.mock("@/lib/permissions", () => ({
  useCan: (key: string) => held.has(key),
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: true, employeeId: "e-self" }),
  useOrgTimezone: () => "Africa/Lagos",
}));

let on = true;
let known = true;
const registerHook = vi.fn();
let registerState: {
  data: QueryPage | null;
  loading: boolean;
  error: unknown;
  unavailable: boolean;
};
vi.mock("@/lib/store/queries", async (original) => ({
  ...(await original<typeof import("@/lib/store/queries")>()),
  useQueriesSwitch: () => ({
    on,
    known,
    said: true,
    editable: true,
    error: null,
  }),
  useQueryRegister: (...args: unknown[]) => {
    registerHook(...args);
    return { ...registerState, reload: vi.fn() };
  },
}));

const { QueriesScreen } =
  await import("@/app/(app)/people/queries/queries-screen");

const page = (rows = [summary()]): QueryPage => ({
  rows,
  meta: {
    page: 1,
    pageSize: 50,
    total: rows.length,
    totalPages: 1,
    hasMore: false,
  },
  waiting: null,
});

const mount = (props: { subjectId?: string } = {}) =>
  render(
    <ToastProvider>
      <QueriesScreen {...props} />
    </ToastProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  held = new Set(["ISSUE_QUERIES"]);
  on = true;
  known = true;
  registerState = {
    data: page(),
    loading: false,
    error: null,
    unavailable: false,
  };
});

describe("who may open it", () => {
  it("tells somebody with neither permission that they cannot", () => {
    held = new Set();
    mount();
    expect(
      screen.getByText("You cannot open the queries register"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("opens for somebody who may only decide", () => {
    held = new Set(["DECIDE_QUERIES"]);
    mount();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("asks for nothing while the person cannot work queries", () => {
    held = new Set();
    mount();
    expect(registerHook).toHaveBeenLastCalledWith(expect.anything(), false);
  });
});

describe("a company that has not turned queries on", () => {
  it("is told so, with nothing deleted", () => {
    on = false;
    mount();
    expect(
      screen.getByText("Queries are switched off for your company"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Nothing has been deleted/)).toBeInTheDocument();
  });

  it("is sent to Settings only if the person may change it", () => {
    on = false;
    mount();
    expect(
      screen.queryByRole("link", { name: "Open Queries settings" }),
    ).not.toBeInTheDocument();
  });

  it("offers the way to Settings to somebody who holds the permission", () => {
    on = false;
    held = new Set(["ISSUE_QUERIES", "MANAGE_SETTINGS"]);
    mount();
    expect(
      screen.getByRole("link", { name: "Open Queries settings" }),
    ).toHaveAttribute("href", "/settings/queries");
  });

  it("believes the server's refusal over a flag that has not arrived", () => {
    on = true;
    registerState = {
      data: null,
      loading: false,
      error: new ApiError(422, "unprocessable", "Queries are switched off", {
        reason: "module_off",
      }),
      unavailable: false,
    };
    mount();
    expect(
      screen.getByText("Queries are switched off for your company"),
    ).toBeInTheDocument();
  });
});

describe("no demo", () => {
  it("shows the refusal and nothing invented", () => {
    registerState = {
      data: null,
      loading: false,
      error: null,
      unavailable: true,
    };
    mount();
    expect(screen.getByText("Queries need the API")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("the rows", () => {
  it("shows the person, the subject line and the reference, with a link to the query", () => {
    mount();
    expect(screen.getByRole("link", { name: "Chidi Nwosu" })).toHaveAttribute(
      "href",
      "/people/queries/q-1",
    );
    expect(screen.getByText(SUBJECT_LINE)).toBeInTheDocument();
    expect(screen.getByText("Q-2026-014")).toBeInTheDocument();
  });

  it("shows the server's own sentence for where the reply stands, and a neutral label for no reply", () => {
    registerState = {
      data: page([
        summary({
          replyState: "no_reply_by_deadline",
          replyStateLabel: "No reply by 14 Nov 2026, 5:00 pm.",
        }),
      ]),
      loading: false,
      error: null,
      unavailable: false,
    };
    mount();
    expect(
      screen.getByText("No reply by 14 Nov 2026, 5:00 pm."),
    ).toBeInTheDocument();
    const label = screen
      .getAllByText("No reply in time")
      .find((node) => node.tagName === "SPAN");
    expect(label).toBeDefined();
    /* Never the danger colour: a missing reply is a fact about a clock. */
    expect(label?.className ?? "").not.toMatch(/danger/);
    const text = (document.body.textContent ?? "").toLowerCase();
    for (const word of ["refus", "ignored", "failed to reply", "overdue"]) {
      expect(text).not.toContain(word);
    }
  });

  it("says an outcome in words and none when there is none", () => {
    registerState = {
      data: page([
        summary({ outcome: "NO_FURTHER_ACTION", status: "CLOSED" }),
        summary({ id: "q-2", reference: "Q-2026-015" }),
      ]),
      loading: false,
      error: null,
      unavailable: false,
    };
    mount();
    expect(screen.getByText("No further action")).toBeInTheDocument();
    expect(screen.getByText("None")).toBeInTheDocument();
  });

  it("is empty in words, and says which filter it is empty under", async () => {
    registerState = {
      data: page([]),
      loading: false,
      error: null,
      unavailable: false,
    };
    mount();
    expect(screen.getByText("No queries yet")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("tab", { name: "Replied" }));
    expect(screen.getByText("No queries match")).toBeInTheDocument();
  });
});

describe("the filter", () => {
  it("reaches the server as the state it names", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("tab", { name: "No reply in time" }));
    expect(registerHook).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: "no_reply_by_deadline" }),
      true,
    );
  });

  it("narrows to one person when the record linked here", () => {
    mount({ subjectId: "6a3e2a30-1111-4222-8333-444455556666" });
    expect(registerHook).toHaveBeenLastCalledWith(
      expect.objectContaining({
        subjectId: "6a3e2a30-1111-4222-8333-444455556666",
        includeArchived: true,
      }),
      true,
    );
    expect(
      screen.getByRole("link", { name: "Show all queries" }),
    ).toBeInTheDocument();
  });
});

describe("no figures to compare", () => {
  it("prints no count on a tab, on the page, or beside a person", () => {
    registerState = {
      data: page([
        summary(),
        summary({ id: "q-2", reference: "Q-2026-015" }),
        summary({ id: "q-3", reference: "Q-2026-016" }),
      ]),
      loading: false,
      error: null,
      unavailable: false,
    };
    mount();
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab.textContent ?? "").not.toMatch(/\d/);
    }
    expect(
      screen.queryByText(/\b\d+ (queries|people|letters)\b/i),
    ).not.toBeInTheDocument();
  });
});
