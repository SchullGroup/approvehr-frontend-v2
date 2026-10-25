import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProjectProvider,
  type ProjectContextValue,
} from "@/components/projects/project-context";
import { ApiError } from "@/lib/api/client";
import type { IssueThread, ProjectData } from "@/lib/projects/types";
import { contextFor, sampleData } from "./projects-fixture";

/**
 * Watchers in the issue drawer: watch and stop watching yourself, add somebody
 * else through a picker that offers only people allowed to watch, the API's
 * refusal shown as it is worded, and who may take somebody else off.
 *
 * The API client is stubbed; what is proved is the drawer's own handling.
 */

let thread: IssueThread = { comments: [], activity: [] };
const reloadThread = vi.hoisted(() => vi.fn());
const pushToast = vi.hoisted(() => vi.fn());
const api = vi.hoisted(() => ({
  watch: vi.fn(),
  unwatch: vi.fn(),
  addWatcher: vi.fn(),
  removeWatcher: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/ui", async (original) => ({
  ...(await original<typeof import("@/components/ui")>()),
  useToast: () => ({ push: pushToast }),
}));

vi.mock("@/lib/api/projects", async (original) => ({
  ...(await original<typeof import("@/lib/api/projects")>()),
  projectsApi: {
    links: vi.fn().mockResolvedValue([]),
    attachmentUrl: vi.fn().mockResolvedValue({ url: "blob:x", expiresAt: "" }),
    ...api,
  },
}));

vi.mock("@/lib/store/projects", () => ({
  useIssueThread: () => ({ thread, status: "ready", reload: reloadThread }),
}));

vi.mock("@/lib/store/project-session", () => ({
  useProjectActor: () => ({
    employeeId: "p-01",
    editRecords: false,
    leadsPeople: false,
    headsDepartment: false,
  }),
}));

const { IssueDrawer } = await import("@/components/projects/issue-drawer");

function renderDrawer(
  overrides: Partial<ProjectContextValue> = {},
  data: ProjectData = sampleData(),
  key = "CHK-10",
) {
  const ctx = contextFor(data, { connected: true, ...overrides });
  const issue = data.issues.find((i) => i.key === key)!;
  render(
    <ProjectProvider value={ctx}>
      <IssueDrawer issue={issue} onClose={vi.fn()} />
    </ProjectProvider>,
  );
  return { ctx, issue, data };
}

const section = () => screen.getByRole("region", { name: "Watchers" });

beforeEach(() => {
  vi.clearAllMocks();
  thread = {
    comments: [],
    activity: [],
    watchers: [{ id: "p-03", name: "Chidi Nwosu" }],
    watching: false,
    attachments: [],
  };
});

describe("watching a task yourself", () => {
  it("shows who is watching, and Watch adds you", async () => {
    api.watch.mockResolvedValue({
      watchers: [
        { id: "p-03", name: "Chidi Nwosu" },
        { id: "p-01", name: "Adaeze Okonkwo" },
      ],
      watching: true,
    });
    const { issue } = renderDrawer();
    const box = within(section());
    expect(box.getByText("1 watching")).toBeInTheDocument();
    expect(box.getByText("Chidi Nwosu")).toBeInTheDocument();

    await userEvent.click(box.getByRole("button", { name: "Watch" }));
    expect(api.watch).toHaveBeenCalledWith(issue.id);
    expect(
      await box.findByRole("button", { name: "Stop watching" }),
    ).toBeInTheDocument();
    expect(box.getByText("2 watching")).toBeInTheDocument();
    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "You're watching this task" }),
    );
  });

  it("Stop watching takes you off", async () => {
    thread = {
      ...thread,
      watchers: [{ id: "p-01", name: "Adaeze Okonkwo" }],
      watching: true,
    };
    api.unwatch.mockResolvedValue({ watchers: [], watching: false });
    const { issue } = renderDrawer();
    await userEvent.click(
      within(section()).getByRole("button", { name: "Stop watching" }),
    );
    expect(api.unwatch).toHaveBeenCalledWith(issue.id);
    expect(
      await within(section()).findByRole("button", { name: "Watch" }),
    ).toBeInTheDocument();
    expect(
      within(section()).getByText("Nobody is watching"),
    ).toBeInTheDocument();
  });
});

describe("adding somebody else", () => {
  it("offers only the project's members who are not watching yet", async () => {
    const data = sampleData();
    data.project.memberIds = ["p-01", "p-03", "p-09"];
    renderDrawer({}, data);
    await userEvent.click(
      within(section()).getByRole("combobox", { name: "Add a watcher" }),
    );
    const names = screen.getAllByRole("option").map((o) => o.textContent);
    expect(names.some((n) => n?.includes("Emeka Anyanwu"))).toBe(true);
    expect(names.some((n) => n?.includes("Chidi Nwosu"))).toBe(false);
    expect(names.some((n) => n?.includes("Ngozi Eze"))).toBe(false);
  });

  it("adds the person chosen", async () => {
    const data = sampleData();
    data.project.memberIds = ["p-01", "p-03", "p-09"];
    api.addWatcher.mockResolvedValue({
      watchers: [
        { id: "p-03", name: "Chidi Nwosu" },
        { id: "p-09", name: "Emeka Anyanwu" },
      ],
      watching: false,
    });
    const { issue } = renderDrawer({}, data);
    await userEvent.click(
      within(section()).getByRole("combobox", { name: "Add a watcher" }),
    );
    await userEvent.click(screen.getByRole("option", { name: /Emeka/ }));
    expect(api.addWatcher).toHaveBeenCalledWith(issue.id, "p-09");
    expect(
      await within(section()).findByText("Emeka Anyanwu"),
    ).toBeInTheDocument();
  });

  it("shows the API's refusal as it is worded", async () => {
    const data = sampleData();
    data.project.memberIds = ["p-01", "p-03", "p-09"];
    api.addWatcher.mockRejectedValue(
      new ApiError(
        422,
        "unprocessable",
        "They can't see this task, so they can't watch it.",
        { reason: "cannot_see" },
      ),
    );
    renderDrawer({}, data);
    await userEvent.click(
      within(section()).getByRole("combobox", { name: "Add a watcher" }),
    );
    await userEvent.click(screen.getByRole("option", { name: /Emeka/ }));
    expect(await within(section()).findByRole("alert")).toHaveTextContent(
      "They can't see this task, so they can't watch it.",
    );
  });

  it("offers anybody in the company on a personal task its owner opens", async () => {
    const data = sampleData();
    const issue = data.issues.find((i) => i.key === "CHK-10")!;
    issue.assigneeId = "p-01";
    issue.reporterId = "p-01";
    data.project.memberIds = ["p-01"];
    renderDrawer({ personal: { setByName: null }, canManage: false }, data);
    await userEvent.click(
      within(section()).getByRole("combobox", { name: "Add a watcher" }),
    );
    const names = screen.getAllByRole("option").map((o) => o.textContent);
    expect(names.some((n) => n?.includes("Emeka Anyanwu"))).toBe(true);
    expect(names.some((n) => n?.includes("Ngozi Eze"))).toBe(true);
  });

  it("has no picker on somebody else's personal task you only watch", () => {
    const data = sampleData();
    const issue = data.issues.find((i) => i.key === "CHK-10")!;
    issue.assigneeId = "p-04";
    issue.reporterId = "p-04";
    renderDrawer(
      { personal: { setByName: null }, canWork: false, canManage: false },
      data,
    );
    expect(
      within(section()).queryByRole("combobox", { name: "Add a watcher" }),
    ).toBeNull();
    expect(
      within(section()).queryByRole("button", { name: /Remove Chidi/ }),
    ).toBeNull();
    expect(
      within(section()).getByRole("button", { name: "Watch" }),
    ).toBeInTheDocument();
  });
});

describe("taking somebody else off", () => {
  it("the lead can, and the list follows the answer", async () => {
    api.removeWatcher.mockResolvedValue({ watchers: [], watching: false });
    const { issue } = renderDrawer({ canManage: true });
    await userEvent.click(
      within(section()).getByRole("button", {
        name: "Remove Chidi Nwosu as a watcher",
      }),
    );
    expect(api.removeWatcher).toHaveBeenCalledWith(issue.id, "p-03");
    await waitFor(() =>
      expect(within(section()).queryByText("Chidi Nwosu")).toBeNull(),
    );
  });

  it("a member who is not the lead cannot", () => {
    renderDrawer({ canManage: false });
    expect(
      within(section()).queryByRole("button", {
        name: "Remove Chidi Nwosu as a watcher",
      }),
    ).toBeNull();
  });
});

describe("the demo", () => {
  it("has no watchers section, since only the API keeps them", () => {
    renderDrawer({ connected: false });
    expect(screen.queryByRole("region", { name: "Watchers" })).toBeNull();
  });
});
