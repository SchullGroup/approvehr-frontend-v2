import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { ApiGoal } from "@/lib/api/performance";

/**
 * What the plan-work dialog calls things.
 *
 * This is the dialog that drafts a project's tasks from an objective. It used
 * to say "epic", "stories", "points" and "sub-tasks" in sixty places; it now
 * speaks the Projects module's own words. The source guard
 * (`projects-friendly-words`) keeps the old ones out of the file; this reads
 * the dialog as a person does, with a draft in front of it, including the one
 * and the several of each count.
 */

const api = vi.hoisted(() => ({
  list: vi.fn(),
  draft: vi.fn(),
  commit: vi.fn(),
}));

vi.mock("@/lib/api/projects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/projects")>()),
  projectsApi: { list: api.list },
}));
vi.mock("@/lib/api/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/ai")>()),
  draftObjectivePlan: api.draft,
  commitObjectivePlan: api.commit,
}));

const { PlanWorkDialog } =
  await import("@/app/(app)/performance/plan-work-dialog");

const goal = {
  id: "g1",
  title: "Grow recurring revenue",
  keyResults: [],
} as unknown as ApiGoal;

const story = (title: string) => ({
  title,
  detail: "",
  keyResultId: null,
  points: 5,
  labels: [],
  subtasks: ["Write the brief"],
  candidates: [],
});

const outcome = (titles: string[]) => ({
  available: true,
  groundedIn: { summary: "the objective", facts: [] },
  project: {
    id: "pj1",
    key: "CHK",
    name: "Checkout Revamp",
    goalLink: "none",
    linkedGoalTitle: null,
  },
  epic: { title: "Grow the checkout", description: "" },
  stories: titles.map(story),
  people: [],
});

async function draftWith(titles: string[]) {
  api.list.mockResolvedValue([
    { id: "pj1", key: "CHK", name: "Checkout Revamp", canManage: true },
  ]);
  api.draft.mockResolvedValue(outcome(titles));
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <PlanWorkDialog goal={goal} open onClose={() => undefined} />
    </ToastProvider>,
  );
  await user.selectOptions(
    await screen.findByRole("combobox", { name: "Project" }),
    "pj1",
  );
  await user.click(screen.getByRole("button", { name: "Draft the work" }));
  return { user, dialog: await screen.findByRole("dialog") };
}

beforeEach(() => {
  api.list.mockReset();
  api.draft.mockReset();
  api.commit.mockReset();
});

describe("the plan-work dialog's words", () => {
  it("counts tasks under an initiative, in the singular for one", async () => {
    const { dialog } = await draftWith(["Brief the agency"]);
    expect(dialog).toHaveTextContent(
      /1 task under the initiative “Grow the checkout”/,
    );
    expect(dialog).not.toHaveTextContent("1 tasks");
    expect(
      within(dialog).getByRole("button", { name: "Create 1 task" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Add a task" }),
    ).toBeInTheDocument();
  });

  it("counts several the same way, and names each one a task", async () => {
    const { dialog } = await draftWith(["Brief the agency", "Book venue"]);
    expect(dialog).toHaveTextContent(
      /2 tasks under the initiative “Grow the checkout”/,
    );
    expect(
      within(dialog).getByRole("button", { name: "Create 2 tasks" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Task 1 title")).toHaveValue(
      "Brief the agency",
    );
    expect(
      within(dialog).getByRole("button", {
        name: /^(Collapse|Expand) task 2$/,
      }),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Task 2 title")).toHaveValue(
      "Book venue",
    );
    // Effort, not points; subtasks, not sub-tasks.
    expect(within(dialog).getAllByText("Effort")).toHaveLength(2);
    expect(dialog).toHaveTextContent("Steps, created as unassigned subtasks");
    expect(within(dialog).getByLabelText("Remove task 1")).toBeInTheDocument();
  });

  it("asks for a task, not a story, when it cannot create the plan yet", async () => {
    const { user, dialog } = await draftWith(["Brief the agency"]);
    await user.click(
      within(dialog).getByRole("button", { name: "Remove task 1" }),
    );
    await waitFor(() =>
      expect(dialog).toHaveTextContent("Keep at least one task."),
    );
  });
});
