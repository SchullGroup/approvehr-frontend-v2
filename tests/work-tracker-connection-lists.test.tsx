import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type {
  ApiSyncRun,
  ApiTrackerIdentity,
  ApiWorkTrackerConnectionDetail,
} from "@/lib/api/work-trackers";
import type { ListRead } from "@/lib/store/work-trackers";

/**
 * A list that did not load is not an empty list.
 *
 * The connection screen reads four things — the connection, who is who, the
 * rules and the sync history — and each can fail or still be on its way on its
 * own. Shown as "Nobody yet" or "No syncs yet", a failed read tells somebody
 * the tool has nobody in it, which is a claim about their company rather than
 * about a request. These pin the three states apart: not answered, failed, and
 * answered with nothing.
 */

const reload = vi.fn();
const waiting = <T,>(): ListRead<T> => ({
  items: null,
  loading: true,
  error: null,
  reload,
});
const failed = <T,>(): ListRead<T> => ({
  items: null,
  loading: false,
  error: new ApiError(500, "internal", "Something went wrong on our side."),
  reload,
});
const answered = <T,>(items: T[]): ListRead<T> => ({
  items,
  loading: false,
  error: null,
  reload,
});

const connection: ApiWorkTrackerConnectionDetail = {
  id: "c1",
  provider: "JIRA",
  status: "ACTIVE",
  site: { id: "s1", name: "Acme", url: "https://acme.atlassian.net" },
  selectedProjects: [],
  lastSyncedAt: null,
  lastSyncError: null,
  connectedById: "u1",
  createdAt: "2026-10-01T09:00:00.000Z",
  unmatchedPeople: 0,
  lastRun: null,
};

let lists: {
  identities: ListRead<ApiTrackerIdentity>;
  rules: ListRead<never>;
  runs: ListRead<ApiSyncRun>;
};

vi.mock("@/lib/store/work-trackers", () => ({
  useWorkTrackerConnection: () => ({
    connection,
    ...lists,
    loading: false,
    error: null,
    reload,
    reloadIdentities: reload,
    reloadRules: reload,
  }),
  useRemoteProjects: () => ({
    projects: [],
    loading: false,
    error: null,
    reload,
  }),
}));
vi.mock("@/lib/permissions", () => ({
  usePermissions: () => ({ can: () => true, loading: false }),
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({ people: [], loading: false }),
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: true }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/api/performance", () => ({
  performanceApi: {
    goals: () =>
      Promise.resolve({ data: [], page: 1, pageSize: 100, total: 0 }),
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const { ConnectionScreen } =
  await import("@/app/(app)/settings/integrations/work-trackers/[id]/connection-screen");

const identity = (
  over: Partial<ApiTrackerIdentity> = {},
): ApiTrackerIdentity => ({
  id: "i1",
  externalUserId: "x1",
  externalEmail: null,
  displayName: "Ada Obi",
  employeeId: null,
  matchedBy: null,
  ignored: false,
  employee: null,
  ...over,
});

beforeEach(() => {
  /* jsdom has no layout; the tab strip scrolls its selected tab into view. */
  Element.prototype.scrollIntoView = vi.fn();
  reload.mockReset();
  lists = {
    identities: answered([]),
    rules: answered([]),
    runs: answered([]),
  };
});

const open = async (tab: RegExp) => {
  const user = userEvent.setup();
  render(<ConnectionScreen id="c1" />);
  await user.click(screen.getByRole("tab", { name: tab }));
};

describe("who is who", () => {
  it("does not say nobody is there while the list is still on its way", async () => {
    lists.identities = waiting();
    await open(/People/);
    expect(screen.queryByText("Nobody yet")).not.toBeInTheDocument();
  });

  it("says it did not load, with a way to try again, when the read failed", async () => {
    lists.identities = failed();
    await open(/People/);
    expect(screen.queryByText("Nobody yet")).not.toBeInTheDocument();
    expect(
      screen.getAllByText(/the people in this tool/i).length,
    ).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reload).toHaveBeenCalled();
  });

  it("does say nobody is there when the read answered with nothing", async () => {
    await open(/People/);
    expect(screen.getByText("Nobody yet")).toBeInTheDocument();
  });

  it("puts a count on the tab only for a list that has answered", () => {
    lists.identities = failed();
    const { unmount } = render(<ConnectionScreen id="c1" />);
    expect(screen.getByRole("tab", { name: "People" })).toBeInTheDocument();
    unmount();

    lists.identities = answered([identity()]);
    render(<ConnectionScreen id="c1" />);
    expect(screen.getByRole("tab", { name: /People\s*1/ })).toBeInTheDocument();
  });
});

describe("sync history", () => {
  it("does not say there have been no syncs when the read failed", async () => {
    lists.runs = failed();
    await open(/Sync history/);
    expect(screen.queryByText("No syncs yet")).not.toBeInTheDocument();
    expect(screen.getAllByText(/the sync history/i).length).toBeGreaterThan(0);
  });

  it("does say so when it answered with none", async () => {
    await open(/Sync history/);
    expect(screen.getByText("No syncs yet")).toBeInTheDocument();
  });
});

describe("objectives", () => {
  it("says the rules did not load, rather than showing none", async () => {
    lists.rules = failed();
    await open(/Objectives/);
    expect(screen.getAllByText(/the rules/i).length).toBeGreaterThan(0);
  });

  it("leaves the count off the tab until the rules have answered", () => {
    lists.rules = waiting();
    render(<ConnectionScreen id="c1" />);
    expect(screen.getByRole("tab", { name: "Objectives" })).toBeInTheDocument();
  });
});
