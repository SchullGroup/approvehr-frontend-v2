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
 * The Objective choice on the project's New task dialog (owner, 24 Nov 2026):
 * optional, offered only when there is an objective to choose, and sent as the
 * task's objective when chosen.
 */

const state = vi.hoisted(() => ({ goals: [] as unknown[] }));
vi.mock("@/lib/store/project-session", () => ({
  useProjectActor: () => ({
    employeeId: "p-03",
    editRecords: false,
    leadsPeople: false,
    headsDepartment: false,
  }),
}));
vi.mock("@/lib/store/performance", async (original) => ({
  ...(await original<typeof import("@/lib/store/performance")>()),
  useKpis: () => ({
    goals: state.goals,
    cascade: [],
    loading: false,
    error: null,
    source: "api",
    reload: vi.fn(),
  }),
}));

const pushToast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui", async (original) => ({
  ...(await original<typeof import("@/components/ui")>()),
  useToast: () => ({ push: pushToast }),
}));

const { CreateIssueDialog } =
  await import("@/components/projects/create-issue-dialog");

const goal = (id: string, title: string) => ({
  id,
  title,
  level: "company",
  ownerId: null,
  ownerName: null,
  departmentId: null,
  departmentName: null,
  approval: "AGREED",
  status: "ON_TRACK",
  keyResults: [],
});

function renderDialog() {
  const data = sampleData();
  const ctx = contextFor(data, { view: "board" });
  const createIssue = ctx.actions.createIssue as unknown as ReturnType<
    typeof vi.fn
  >;
  createIssue.mockImplementation((input: NewIssueInput) =>
    Promise.resolve({
      ok: true,
      value: {
        ...data.issues.find((i) => i.type === "TASK")!,
        id: "i-new",
        key: "CHK-99",
        title: input.title,
      } as Issue,
    }),
  );
  render(
    <ProjectProvider value={ctx}>
      <CreateIssueDialog open onClose={vi.fn()} defaults={{}} />
    </ProjectProvider>,
  );
  return { createIssue };
}

beforeEach(() => {
  state.goals = [goal("g1", "Grow revenue"), goal("g2", "Cut costs")];
});

describe("Objective on a new task", () => {
  it("is optional: a task made without one sends none", async () => {
    const { createIssue } = renderDialog();
    await userEvent.type(screen.getByLabelText(/^Title/), "Book the movers");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(createIssue.mock.calls[0]![0]).not.toHaveProperty("goalId");
  });

  it("sends the objective that was chosen", async () => {
    const { createIssue } = renderDialog();
    await userEvent.selectOptions(screen.getByLabelText(/^Objective/), "g2");
    await userEvent.type(screen.getByLabelText(/^Title/), "Book the movers");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(createIssue.mock.calls[0]![0]).toMatchObject({ goalId: "g2" });
  });

  it("is not drawn when there is no objective to choose", () => {
    state.goals = [];
    renderDialog();
    expect(screen.queryByLabelText(/^Objective/)).toBeNull();
  });
});
