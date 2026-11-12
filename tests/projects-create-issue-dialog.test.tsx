import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import {
  ProjectProvider,
  type ProjectContextValue,
} from "@/components/projects/project-context";
import { EMPTY_FILTER } from "@/lib/projects/filters";
import type { Issue, NewIssueInput, ProjectData } from "@/lib/projects/types";
import { contextFor, sampleData } from "./projects-fixture";

/**
 * The project's New task dialog: the field names, the cycle it starts in, what
 * happens when that cycle closes while it is open, and the line under "created"
 * that says where a task went when it is not on the view behind the dialog.
 */

const pushToast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui", async (original) => ({
  ...(await original<typeof import("@/components/ui")>()),
  useToast: () => ({ push: pushToast }),
}));

const { CreateIssueDialog } =
  await import("@/components/projects/create-issue-dialog");

const ACTIVE = "sp-chk-3";

/** The task the API hands back: a real-shaped one, built from what was sent. */
function made(data: ProjectData, input: NewIssueInput): Issue {
  const base = data.issues.find((i) => i.type === "TASK")!;
  const assignees = input.assigneeIds ?? [];
  return {
    ...base,
    id: "i-new",
    key: "CHK-99",
    type: input.type,
    title: input.title,
    sprintId: input.sprintId ?? null,
    parentId: null,
    epicId: input.epicId ?? null,
    statusId: data.project.statuses[0]!.id,
    doneAt: null,
    labels: [],
    assigneeId: assignees[0] ?? null,
    assigneeIds: assignees,
  };
}

function renderDialog(
  overrides: Partial<ProjectContextValue> = {},
  defaults: Partial<NewIssueInput> = {},
  data: ProjectData = sampleData(),
) {
  const ctx = contextFor(data, { view: "board", ...overrides });
  const createIssue = ctx.actions.createIssue as unknown as ReturnType<
    typeof vi.fn
  >;
  createIssue.mockImplementation((input: NewIssueInput) =>
    Promise.resolve({ ok: true, value: made(data, input) }),
  );
  render(
    <ProjectProvider value={ctx}>
      <CreateIssueDialog open onClose={vi.fn()} defaults={defaults} />
    </ProjectProvider>,
  );
  return { ctx, createIssue };
}

async function create(title = "Book the movers") {
  await userEvent.type(screen.getByLabelText(/^Title/), title);
  await userEvent.click(screen.getByRole("button", { name: "Create" }));
}

const lastToast = () => pushToast.mock.calls.at(-1)![0];

beforeEach(() => {
  pushToast.mockReset();
});

describe("the form", () => {
  it("asks for a Title, and says so when it is empty", async () => {
    const { createIssue } = renderDialog();
    expect(screen.getByLabelText(/^Title/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Summary/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByText("Add a title first.")).toBeInTheDocument();
    expect(createIssue).not.toHaveBeenCalled();
  });
});

describe("the cycle it starts in", () => {
  it("sends the running cycle it was opened with", async () => {
    const { createIssue } = renderDialog({}, { sprintId: ACTIVE });
    await create();
    expect(createIssue.mock.calls[0]![0]).toMatchObject({ sprintId: ACTIVE });
  });

  it("goes to Later, once, when that cycle closed while the dialog was open", async () => {
    const data = sampleData();
    const { createIssue } = renderDialog({}, { sprintId: ACTIVE }, data);
    createIssue.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        message:
          "Cycle 3 is closed. Tasks cannot be moved into a closed cycle.",
        error: new ApiError(
          422,
          "unprocessable",
          "Cycle 3 is closed. Tasks cannot be moved into a closed cycle.",
        ),
      }),
    );
    await create();
    expect(createIssue).toHaveBeenCalledTimes(2);
    expect(createIssue.mock.calls[1]![0]).toMatchObject({ sprintId: null });
    expect(lastToast()).toEqual({
      tone: "success",
      title: "CHK-99 created",
      detail: "The cycle ended, so it went to Later",
    });
  });

  it("does not retry a refusal that is about something else", async () => {
    const { createIssue } = renderDialog({}, { sprintId: ACTIVE });
    createIssue.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        message: "Ngozi is not on this project.",
        error: new ApiError(
          422,
          "unprocessable",
          "Ngozi is not on this project.",
        ),
      }),
    );
    await create();
    expect(createIssue).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Ngozi is not on this project.",
    );
    expect(pushToast).not.toHaveBeenCalled();
  });
});

describe("where the new task went", () => {
  it("says nothing more when the task is on the board behind the dialog", async () => {
    renderDialog({}, { sprintId: ACTIVE });
    await create();
    expect(lastToast()).toEqual({ tone: "success", title: "CHK-99 created" });
  });

  it("says it went to Later when a board with cycles will not show it", async () => {
    renderDialog();
    await create();
    expect(lastToast()).toMatchObject({
      title: "CHK-99 created",
      detail: "Added to Later on the Plan tab",
    });
  });

  it("names the planned cycle it went into", async () => {
    renderDialog({}, { sprintId: "sp-chk-4" });
    await create();
    expect(lastToast()).toMatchObject({
      detail: "Added to Cycle 4 on the Plan tab",
    });
  });

  it("says a filter hides it, Only my tasks included", async () => {
    renderDialog(
      { filter: { ...EMPTY_FILTER, mine: true } },
      { sprintId: ACTIVE },
    );
    await create();
    expect(lastToast()).toMatchObject({ detail: "Hidden by your filters" });
  });

  it("says Later, not the filter, when both are true", async () => {
    renderDialog({ filter: { ...EMPTY_FILTER, mine: true } });
    await create();
    expect(lastToast()).toMatchObject({
      detail: "Added to Later on the Plan tab",
    });
  });

  it("finds it on the Plan tab and the List, wherever it went", async () => {
    renderDialog({ view: "backlog" });
    await create();
    expect(lastToast()).toEqual({ tone: "success", title: "CHK-99 created" });
  });

  it("is on a simple board straight away", async () => {
    const data = sampleData();
    data.project = { ...data.project, type: "KANBAN" };
    renderDialog({}, {}, data);
    await create();
    expect(lastToast()).toEqual({ tone: "success", title: "CHK-99 created" });
  });

  it("judges nothing outside a project screen", async () => {
    renderDialog({ view: undefined });
    await create();
    expect(lastToast()).toEqual({ tone: "success", title: "CHK-99 created" });
  });
});
