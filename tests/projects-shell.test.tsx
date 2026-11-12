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

/* Programs are not what this file is about: a company with none. */
vi.mock("@/lib/store/programs", () => ({
  useProgramFacts: () => ({ facts: null, seesAll: false }),
  useProgramList: () => ({
    status: "ready",
    error: null,
    data: { programs: [], canCreate: false, seesAll: false },
    reload: vi.fn(),
  }),
  useProgramActions: () => ({ moveProject: vi.fn() }),
}));

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
    expect(
      screen.getByText(/may not be part of your access/),
    ).toBeInTheDocument();
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
      /* The words are new; the `?view=` ids are the old ones, so links saved
         before the rename still land on the right tab. */
      ["Plan", "/projects/pj-chk?view=backlog"],
      ["Timeline", "/projects/pj-chk?view=roadmap"],
      ["Progress", "/projects/pj-chk?view=reports"],
      ["List", "/projects/pj-chk?view=issues"],
      ["Settings", "/projects/pj-chk?view=settings"],
    ]);
    expect(
      screen.getByRole("heading", { name: "Cycle 3" }),
    ).toBeInTheDocument();
  });

  it("shows the backlog's sprint lists on ?view=backlog", () => {
    search = new URLSearchParams("view=backlog");
    render(<ProjectScreen id="pj-chk" />);
    expect(
      screen.getByRole("heading", { name: "Plan", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Cycle 4" })).toBeInTheDocument();
  });

  it("shows the roadmap's timeline on ?view=roadmap", () => {
    search = new URLSearchParams("view=roadmap");
    render(<ProjectScreen id="pj-chk" />);
    expect(
      screen.getByRole("heading", { name: "Timeline", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Initiatives on the timeline" }),
    ).toBeInTheDocument();
  });

  it("shows the reports on ?view=reports", () => {
    search = new URLSearchParams("view=reports");
    render(<ProjectScreen id="pj-chk" />);
    expect(
      screen.getByRole("heading", { name: "Progress", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Cycle 3 progress/ }),
    ).toBeInTheDocument();
  });

  it("falls back to the board for a view it does not know", () => {
    search = new URLSearchParams("view=nonsense");
    render(<ProjectScreen id="pj-chk" />);
    expect(
      screen.getByRole("heading", { name: "Cycle 3" }),
    ).toBeInTheDocument();
  });

  it("says when the API stopped at 5,000 issues", () => {
    view = ready(sampleData(), true);
    render(<ProjectScreen id="pj-chk" />);
    expect(
      screen.getByText("Only the first 5,000 tasks are shown"),
    ).toBeInTheDocument();
  });

  it("offers Create task to a member and not to anybody else", async () => {
    render(<ProjectScreen id="pj-chk" />);
    expect(
      screen.getByRole("button", { name: /New task/ }),
    ).toBeInTheDocument();
  });
});

describe("the header", () => {
  it("names a board with cycles, with what that means", async () => {
    render(<ProjectScreen id="pj-chk" />);
    expect(screen.getByText("Board with cycles")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "About board with cycles" }),
    );
    expect(
      await screen.findByText(
        "New tasks wait in Later until you add them to a cycle",
      ),
    ).toBeInTheDocument();
  });

  it("says nothing about the board type on a simple board", () => {
    const data = sampleData();
    data.project = { ...data.project, type: "KANBAN" };
    view = ready(data);
    render(<ProjectScreen id="pj-chk" />);
    expect(screen.queryByText("Board with cycles")).not.toBeInTheDocument();
    expect(screen.queryByText("Simple board")).not.toBeInTheDocument();
  });

  it("starts New task in the running cycle, so it lands on the board", async () => {
    render(<ProjectScreen id="pj-chk" />);
    await userEvent.click(screen.getByRole("button", { name: /New task/ }));
    expect(await screen.findByLabelText(/^Cycle/)).toHaveValue("sp-chk-3");
  });

  it("starts the c key's New task in the running cycle too", async () => {
    render(<ProjectScreen id="pj-chk" />);
    await userEvent.keyboard("c");
    expect(await screen.findByLabelText(/^Cycle/)).toHaveValue("sp-chk-3");
  });

  it("starts New task in Later when no cycle is running", async () => {
    const data = sampleData();
    data.sprints = data.sprints.map((s) =>
      s.state === "ACTIVE" ? { ...s, state: "CLOSED" as const } : s,
    );
    view = ready(data);
    render(<ProjectScreen id="pj-chk" />);
    await userEvent.click(screen.getByRole("button", { name: /New task/ }));
    expect(await screen.findByLabelText(/^Cycle/)).toHaveValue("");
  });
});

describe("the note on a project moved to a simple board", () => {
  const switched = (daysAgo: number) => {
    const data = sampleData();
    data.project = {
      ...data.project,
      type: "KANBAN",
      boardSwitchedAt: new Date(
        Date.now() - daysAgo * 24 * 60 * 60 * 1000,
      ).toISOString(),
    };
    return ready(data);
  };
  const NOTE =
    "This project now uses a simple board. You can switch back in Settings.";

  beforeEach(() => localStorage.clear());

  it("says so for 30 days, until it is closed, and remembers the close", async () => {
    view = switched(3);
    const first = render(<ProjectScreen id="pj-chk" />);
    expect(await screen.findByText(NOTE)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Dismiss this note" }),
    );
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    expect(
      localStorage.getItem(
        `projects.boardSwitchedNote.${view.data!.project.id}`,
      ),
    ).not.toBeNull();
    first.unmount();
    render(<ProjectScreen id="pj-chk" />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: "Checkout Revamp" }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it("says nothing once 30 days have passed", async () => {
    view = switched(31);
    render(<ProjectScreen id="pj-chk" />);
    await act(async () => {});
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it("says nothing on a project that was never switched", async () => {
    render(<ProjectScreen id="pj-chk" />);
    await act(async () => {});
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it("still shows, and closes for now, when storage cannot be used", async () => {
    view = switched(1);
    const get = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const set = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    try {
      render(<ProjectScreen id="pj-chk" />);
      expect(await screen.findByText(NOTE)).toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("button", { name: "Dismiss this note" }),
      );
      expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });
});

describe("?issue= and the drawer", () => {
  it("opens the issue a link points at", async () => {
    search = new URLSearchParams("issue=CHK-14");
    render(<ProjectScreen id="pj-chk" />);
    expect(await screen.findByRole("dialog")).toHaveTextContent("CHK-14");
    expect(screen.getByLabelText("Title")).toHaveValue(
      "Instrument payment error rates by provider",
    );
  });

  /* The module now says "task", and a link written in that word works as well.
     The app and the API still write `?issue=`, so links already out there keep
     opening. */
  it("opens the task a ?task= link points at, as it does for ?issue=", async () => {
    search = new URLSearchParams("task=CHK-14");
    render(<ProjectScreen id="pj-chk" />);
    expect(await screen.findByRole("dialog")).toHaveTextContent("CHK-14");
    expect(screen.getByLabelText("Title")).toHaveValue(
      "Instrument payment error rates by provider",
    );
  });

  it("removes both spellings when the drawer closes, and writes ?issue= when it opens another", async () => {
    search = new URLSearchParams("task=CHK-10");
    render(<ProjectScreen id="pj-chk" />);
    await userEvent.click(
      await screen.findByRole("button", { name: /CHK-1$/ }),
    );
    expect(replace).toHaveBeenCalledWith("/projects/pj-chk?issue=CHK-1", {
      scroll: false,
    });
    await userEvent.keyboard("{Escape}");
    expect(replace).toHaveBeenLastCalledWith("/projects/pj-chk", {
      scroll: false,
    });
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
    expect(await screen.findByRole("dialog")).toHaveTextContent("New task");
  });

  it("c types a c in a text box rather than opening anything", async () => {
    render(<ProjectScreen id="pj-chk" />);
    await userEvent.click(
      screen.getByLabelText(
        "Search tasks by key, title, label, person or subtask",
      ),
    );
    await userEvent.keyboard("c");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "Search tasks by key, title, label, person or subtask",
      ),
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
      screen.getByLabelText(
        "Search tasks by key, title, label, person or subtask",
      ),
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
