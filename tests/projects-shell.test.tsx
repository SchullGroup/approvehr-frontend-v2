import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectData } from "@/lib/projects/types";
import { fakeActions, people, sampleData } from "./projects-fixture";

/**
 * The project screen around the views: what it shows before it has a project, how
 * `?issue=` opens and closes the drawer, and the two global keys.
 *
 * The store is stubbed, so each test says what the store would answer. What is
 * proved is the screen's own handling: a link to an issue that does not exist says
 * so once; an issue that was open and then deleted says nothing; Escape on a deep
 * link removes the parameter without adding a history entry.
 */

let search = new URLSearchParams();
const replace = vi.fn();
const push = vi.fn();
const back = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => search,
  usePathname: () => "/projects/pj-chk",
  useRouter: () => ({ push, replace, back }),
}));

const pushToast = vi.fn();
vi.mock("@/components/ui", async (original) => ({
  ...(await original<typeof import("@/components/ui")>()),
  useToast: () => ({ push: pushToast }),
}));

type Gate = { enabled: boolean; loading: boolean };
let gate: Gate = { enabled: true, loading: false };
type View = {
  status: "loading" | "ready" | "error" | "notFound";
  error: unknown;
  data: ProjectData | null;
  capped: boolean;
  reload: () => void;
};
let view: View;

vi.mock("@/lib/store/projects", () => ({
  useProjectData: () => view,
  useProjectActions: () => fakeActions(),
  useIssueThread: () => ({
    thread: { comments: [], activity: [] },
    status: "ready",
    reload: vi.fn(),
  }),
}));

vi.mock("@/lib/store/project-session", () => ({
  useProjectsGate: () => gate,
  usePeople: () => people,
  useProjectActor: () => ({
    employeeId: "p-01",
    editRecords: false,
    leadsPeople: true,
    headsDepartment: false,
  }),
}));

vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
  /* The demo: no objectives and no weekly-task bridge to draw controls for. */
  useSession: () => ({ isConnected: false }),
}));

vi.mock("@/lib/permissions", () => ({
  useCan: () => false,
  usePermissions: () => ({ can: () => false }),
}));

const { ProjectScreen } =
  await import("@/app/(app)/projects/[id]/project-screen");

const ready = (data: ProjectData = sampleData(), capped = false): View => ({
  status: "ready",
  error: null,
  data,
  capped,
  reload: vi.fn(),
});

beforeEach(() => {
  search = new URLSearchParams();
  gate = { enabled: true, loading: false };
  view = ready();
  replace.mockClear();
  push.mockClear();
  back.mockClear();
  pushToast.mockClear();
});

describe("before there is a project", () => {
  it("says Projects is not switched on, with nothing else", () => {
    gate = { enabled: false, loading: false };
    render(<ProjectScreen id="pj-chk" />);
    expect(screen.getByText("Projects is not switched on")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("waits for the flags rather than deciding the module is off", () => {
    gate = { enabled: false, loading: true };
    render(<ProjectScreen id="pj-chk" />);
    expect(
      screen.queryByText("Projects is not switched on"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Loading the project")).toBeInTheDocument();
  });

  it("shows a skeleton while the project loads", () => {
    view = { ...ready(), status: "loading", data: null };
    render(<ProjectScreen id="pj-chk" />);
    expect(screen.getByLabelText("Loading the project")).toBeInTheDocument();
  });

  it("says a project is not here, whether it is gone or just not yours", () => {
    view = { ...ready(), status: "notFound", data: null };
    render(<ProjectScreen id="pj-chk" />);
    expect(screen.getByText("This project is not here")).toBeInTheDocument();
    expect(screen.getByText(/may not be a member/)).toBeInTheDocument();
  });

  it("treats the API's module_off refusal as the module being off", async () => {
    const { ApiError } = await import("@/lib/api/client");
    view = {
      ...ready(),
      status: "error",
      data: null,
      error: new ApiError(422, "unprocessable", "off", {
        reason: "module_off",
        module: "projects",
      }),
    };
    render(<ProjectScreen id="pj-chk" />);
    expect(screen.getByText("Projects is not switched on")).toBeInTheDocument();
  });

  it("offers a retry for any other failure", async () => {
    const { ApiError } = await import("@/lib/api/client");
    view = {
      ...ready(),
      status: "error",
      data: null,
      error: new ApiError(500, "server_error", "Something went wrong."),
    };
    render(<ProjectScreen id="pj-chk" />);
    expect(
      screen.getByRole("button", { name: /Try again/i }),
    ).toBeInTheDocument();
  });
});

describe("the project", () => {
  it("shows the header, the six tabs and the board", () => {
    render(<ProjectScreen id="pj-chk" />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Checkout Revamp" }),
    ).toBeInTheDocument();
    const tabs = screen
      .getAllByRole("link")
      .filter((l) => l.getAttribute("href")?.startsWith("/projects/pj-chk"))
      .map((l) => [l.textContent, l.getAttribute("href")]);
    expect(tabs).toEqual([
      ["Board", "/projects/pj-chk"],
      ["Backlog", "/projects/pj-chk?view=backlog"],
      ["Roadmap", "/projects/pj-chk?view=roadmap"],
      ["Reports", "/projects/pj-chk?view=reports"],
      ["All issues", "/projects/pj-chk?view=issues"],
      ["Settings", "/projects/pj-chk?view=settings"],
    ]);
    expect(
      screen.getByRole("heading", { name: "CHK Sprint 3" }),
    ).toBeInTheDocument();
  });

  it("shows the backlog's sprint lists on ?view=backlog", () => {
    search = new URLSearchParams("view=backlog");
    render(<ProjectScreen id="pj-chk" />);
    expect(
      screen.getByRole("heading", { name: "Backlog", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "CHK Sprint 4" }),
    ).toBeInTheDocument();
  });

  it("shows the roadmap's timeline on ?view=roadmap", () => {
    search = new URLSearchParams("view=roadmap");
    render(<ProjectScreen id="pj-chk" />);
    expect(
      screen.getByRole("heading", { name: "Roadmap", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Epics on the timeline" }),
    ).toBeInTheDocument();
  });

  it("shows the reports on ?view=reports", () => {
    search = new URLSearchParams("view=reports");
    render(<ProjectScreen id="pj-chk" />);
    expect(
      screen.getByRole("heading", { name: "Reports", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /CHK Sprint 3 burndown/ }),
    ).toBeInTheDocument();
  });

  it("falls back to the board for a view it does not know", () => {
    search = new URLSearchParams("view=nonsense");
    render(<ProjectScreen id="pj-chk" />);
    expect(
      screen.getByRole("heading", { name: "CHK Sprint 3" }),
    ).toBeInTheDocument();
  });

  it("says when the API stopped at 5,000 issues", () => {
    view = ready(sampleData(), true);
    render(<ProjectScreen id="pj-chk" />);
    expect(
      screen.getByText("Only the first 5,000 issues are shown"),
    ).toBeInTheDocument();
  });

  it("offers Create issue to a member and not to anybody else", async () => {
    render(<ProjectScreen id="pj-chk" />);
    expect(
      screen.getByRole("button", { name: /Create issue/ }),
    ).toBeInTheDocument();
  });
});

describe("?issue= and the drawer", () => {
  it("opens the issue a link points at", async () => {
    search = new URLSearchParams("issue=CHK-14");
    render(<ProjectScreen id="pj-chk" />);
    expect(await screen.findByRole("dialog")).toHaveTextContent("CHK-14");
    expect(screen.getByLabelText("Summary")).toHaveValue(
      "Instrument payment error rates by provider",
    );
  });

  it("accepts the key in lower case", async () => {
    search = new URLSearchParams("issue=chk-14");
    render(<ProjectScreen id="pj-chk" />);
    expect(await screen.findByRole("dialog")).toHaveTextContent("CHK-14");
  });

  it("puts the issue in the address when a card is opened, adding a history entry", async () => {
    render(<ProjectScreen id="pj-chk" />);
    await userEvent.click(
      screen.getByRole("button", { name: /Instrument payment error rates/ }),
    );
    expect(push).toHaveBeenCalledWith("/projects/pj-chk?issue=CHK-14", {
      scroll: false,
    });
  });

  it("swaps rather than stacks when an issue is opened from inside the drawer", async () => {
    search = new URLSearchParams("issue=CHK-10");
    render(<ProjectScreen id="pj-chk" />);
    await userEvent.click(
      await screen.findByRole("button", { name: /CHK-1$/ }),
    );
    expect(replace).toHaveBeenCalledWith("/projects/pj-chk?issue=CHK-1", {
      scroll: false,
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("removes the parameter on Escape for a link that was followed, without going back", async () => {
    search = new URLSearchParams("issue=CHK-14");
    render(<ProjectScreen id="pj-chk" />);
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    expect(replace).toHaveBeenCalledWith("/projects/pj-chk", { scroll: false });
    expect(back).not.toHaveBeenCalled();
  });

  it("goes back on Escape when the drawer was opened by a click here", async () => {
    const { rerender } = render(<ProjectScreen id="pj-chk" />);
    await userEvent.click(
      screen.getByRole("button", { name: /Instrument payment error rates/ }),
    );
    search = new URLSearchParams("issue=CHK-14");
    rerender(<ProjectScreen id="pj-chk" />);
    await screen.findByRole("dialog");
    search = new URLSearchParams("issue=CHK-14");
    await userEvent.keyboard("{Escape}");
    /* The address without the issue is where it was opened from. */
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("says once that a linked issue is not in this project, and drops the link", async () => {
    search = new URLSearchParams("issue=NOPE-99");
    const { rerender } = render(<ProjectScreen id="pj-chk" />);
    await waitFor(() => expect(pushToast).toHaveBeenCalledTimes(1));
    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "NOPE-99 is not in this project" }),
    );
    expect(replace).toHaveBeenCalledWith("/projects/pj-chk", { scroll: false });
    /* Re-rendering with the same address (the URL has not updated yet) must not
       say it again. */
    for (let i = 0; i < 5; i += 1) rerender(<ProjectScreen id="pj-chk" />);
    expect(pushToast).toHaveBeenCalledTimes(1);
  });

  it("says nothing when the open issue is deleted under the drawer", async () => {
    search = new URLSearchParams("issue=CHK-14");
    const data = sampleData();
    view = ready(data);
    const { rerender } = render(<ProjectScreen id="pj-chk" />);
    await screen.findByRole("dialog");
    pushToast.mockClear();
    /* The issue is gone from the project; the address still names it. */
    view = ready({
      ...data,
      issues: data.issues.filter((i) => i.key !== "CHK-14"),
    });
    rerender(<ProjectScreen id="pj-chk" />);
    for (let i = 0; i < 5; i += 1) rerender(<ProjectScreen id="pj-chk" />);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/projects/pj-chk", {
        scroll: false,
      }),
    );
    expect(pushToast).not.toHaveBeenCalled();
  });
});

describe("the keys", () => {
  it("c opens the create dialog", async () => {
    render(<ProjectScreen id="pj-chk" />);
    await userEvent.keyboard("c");
    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Create an issue",
    );
  });

  it("c types a c in a text box rather than opening anything", async () => {
    render(<ProjectScreen id="pj-chk" />);
    await userEvent.click(
      screen.getByLabelText("Filter issues by key, title or label"),
    );
    await userEvent.keyboard("c");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Filter issues by key, title or label"),
    ).toHaveValue("c");
  });

  it("c does nothing while a dialog is already open", async () => {
    search = new URLSearchParams("issue=CHK-14");
    render(<ProjectScreen id="pj-chk" />);
    await screen.findByRole("dialog");
    await userEvent.keyboard("c");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("/ moves to the filter", async () => {
    render(<ProjectScreen id="pj-chk" />);
    await userEvent.keyboard("/");
    expect(
      screen.getByLabelText("Filter issues by key, title or label"),
    ).toHaveFocus();
  });

  it("does not react to a key with a modifier held", async () => {
    render(<ProjectScreen id="pj-chk" />);
    await act(async () => {
      await userEvent.keyboard("{Control>}c{/Control}");
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
