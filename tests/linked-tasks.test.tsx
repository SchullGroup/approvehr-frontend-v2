import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import {
  ProjectProvider,
  type ProjectContextValue,
} from "@/components/projects/project-context";
import { contextFor, sampleData } from "./projects-fixture";

const api = vi.hoisted(() => ({
  links: vi.fn(),
  addLink: vi.fn(),
  removeLink: vi.fn(),
  searchIssues: vi.fn(),
}));

vi.mock("@/lib/api/projects", async (original) => ({
  ...(await original<typeof import("@/lib/api/projects")>()),
  projectsApi: api,
}));

const { LinkedTasks } = await import("@/components/projects/linked-tasks");

const visible = (over: Record<string, unknown> = {}) => ({
  id: "l1",
  type: "BLOCKS",
  direction: "incoming",
  label: "blocked by",
  note: null,
  createdAt: "2026-10-20T09:00:00Z",
  createdBy: { id: "p-01", name: "Ada" },
  other: {
    id: "i2",
    key: "PAY-120",
    title: "Payslip PDF template",
    projectId: "p2",
    projectName: "Payroll",
    statusName: "In Progress",
    statusCategory: "IN_PROGRESS",
    assigneeName: null,
  },
  ...over,
});

function renderLinks(overrides: Partial<ProjectContextValue> = {}) {
  const ctx = contextFor(sampleData(), overrides);
  render(
    <ProjectProvider value={ctx}>
      <LinkedTasks issueId="i1" />
    </ProjectProvider>,
  );
  return ctx;
}

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset());
  api.links.mockResolvedValue([]);
  api.searchIssues.mockResolvedValue([]);
});

describe("the linked tasks list", () => {
  it("shows each link as label, key and title, with the note in italics", async () => {
    api.links.mockResolvedValue([
      visible({ note: "Needs the template first" }),
    ]);
    renderLinks();
    const row = (await screen.findByText("PAY-120")).closest("li")!;
    expect(row).toHaveTextContent("Blocked by");
    expect(row).toHaveTextContent("Payslip PDF template");
    const note = within(row).getByText("Needs the template first");
    expect(note.tagName).toBe("EM");
  });

  it("shows a task the reader cannot open, and still lets them remove the link", async () => {
    api.links.mockResolvedValue([
      visible({
        id: "l2",
        note: null,
        createdBy: null,
        other: { hidden: true },
      }),
    ]);
    renderLinks();
    const row = (await screen.findByText("A task you can't open")).closest(
      "li",
    )!;
    expect(row).toHaveTextContent("Blocked by");
    expect(
      within(row).getByRole("button", { name: /Remove/ }),
    ).toBeInTheDocument();
  });

  it("opens the other task when its key is clicked", async () => {
    api.links.mockResolvedValue([visible()]);
    const ctx = renderLinks();
    await userEvent.click(
      await screen.findByRole("button", { name: "PAY-120" }),
    );
    expect(ctx.openIssue).toHaveBeenCalledWith({ key: "PAY-120" });
  });

  it("removes a link and drops the row", async () => {
    api.links.mockResolvedValue([visible()]);
    api.removeLink.mockResolvedValue(undefined);
    renderLinks();
    await userEvent.click(
      await screen.findByRole("button", { name: /Remove/ }),
    );
    expect(api.removeLink).toHaveBeenCalledWith("l1");
    await waitFor(() =>
      expect(screen.queryByText("PAY-120")).not.toBeInTheDocument(),
    );
  });
});

describe("adding a link", () => {
  async function pick(typeLabel: string) {
    await userEvent.selectOptions(
      await screen.findByLabelText("Link type"),
      typeLabel,
    );
    await userEvent.type(screen.getByLabelText("Find a task"), "payslip");
    await userEvent.click(
      await screen.findByRole("button", { name: /PAY-120/ }),
    );
  }

  it("offers the seven types in order", async () => {
    renderLinks();
    const select = await screen.findByLabelText("Link type");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      "Relates to",
      "Blocks",
      "Blocked by",
      "Front end for",
      "Back end for",
      "Duplicates",
      "Duplicated by",
    ]);
  });

  it("searches, picks a match, and sends the type, key and reason", async () => {
    api.searchIssues.mockResolvedValue([
      {
        id: "i2",
        key: "PAY-120",
        title: "Payslip PDF template",
        projectName: "Payroll",
      },
    ]);
    api.addLink.mockResolvedValue(visible({ note: "Waiting on it" }));
    renderLinks();
    await pick("Blocked by");
    await userEvent.type(screen.getByLabelText("Reason"), "Waiting on it");
    await userEvent.click(screen.getByRole("button", { name: "Link" }));
    expect(api.addLink).toHaveBeenCalledWith("i1", {
      toIssueKey: "PAY-120",
      type: "BLOCKED_BY",
      note: "Waiting on it",
    });
    expect(await screen.findByText("Waiting on it")).toBeInTheDocument();
    expect(screen.getByText("Payslip PDF template")).toBeInTheDocument();
  });

  it.each([
    [404, "No task with that key that you can open"],
    [409, "These tasks are already linked that way"],
  ])("explains a %i", async (status, copy) => {
    api.searchIssues.mockResolvedValue([
      {
        id: "i2",
        key: "PAY-120",
        title: "Payslip PDF template",
        projectName: "Payroll",
      },
    ]);
    api.addLink.mockRejectedValue(new ApiError(status, "x", "server words"));
    renderLinks();
    await pick("Blocks");
    await userEvent.click(screen.getByRole("button", { name: "Link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(copy);
  });

  it("shows the server's message for a self-link", async () => {
    api.searchIssues.mockResolvedValue([
      {
        id: "i2",
        key: "PAY-120",
        title: "Payslip PDF template",
        projectName: "Payroll",
      },
    ]);
    api.addLink.mockRejectedValue(
      new ApiError(422, "x", "A task can't be linked to itself"),
    );
    renderLinks();
    await pick("Blocks");
    await userEvent.click(screen.getByRole("button", { name: "Link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A task can't be linked to itself",
    );
  });
});

describe("history rows for links", () => {
  it("words a link, and a task the reader cannot open", async () => {
    const { describeActivity } = await import("@/lib/projects/history");
    const lookup = {
      statusName: () => null,
      personName: () => "",
      sprintName: () => null,
      issueKey: () => null,
    };
    const row = (other: unknown, action = "linked") => ({
      field: "link",
      from: null,
      to: {
        action,
        type: "BLOCKS",
        direction: "incoming",
        label: "blocked by",
        other,
      },
    });
    expect(
      describeActivity(
        row({ key: "PAY-120", title: "Payslip PDF template" }),
        lookup,
      ).verb,
    ).toBe("linked this task: blocked by PAY-120 Payslip PDF template");
    expect(describeActivity(row({ hidden: true }), lookup).verb).toBe(
      "linked this task: blocked by a task you can't open",
    );
    expect(
      describeActivity(row({ hidden: true }, "unlinked"), lookup).verb,
    ).toBe("removed a link: blocked by a task you can't open");
  });
});
