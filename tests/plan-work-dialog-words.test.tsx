import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { ApiGoal } from "@/lib/api/performance";

/**
 * What the plan-work dialog calls things, and how much of it there is.
 *
 * This is the dialog that drafts a project's tasks from an objective. It used
 * to say "epic", "stories", "points" and "sub-tasks" in sixty places; it now
 * speaks the Projects module's own words. The source guard
 * (`projects-friendly-words`) keeps the old ones out of the file; this reads
 * the dialog as a person does, with a draft in front of it, including the one
 * and the several of each count.
 *
 * It is also one row to a task (a title, who takes it, a pencil) and not a
 * project-planning screen: no effort, labels, steps or "moves the target"
 * field, one control for who takes it, and a row with no title is left out
 * without a word.
 */

const api = vi.hoisted(() => ({
  list: vi.fn(),
  draft: vi.fn(),
  commit: vi.fn(),
}));

vi.mock("@/lib/api/projects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/projects")>()),
  projectsApi: { list: api.list },
  commitObjectivePlan: api.commit,
}));
vi.mock("@/lib/api/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/ai")>()),
  draftObjectivePlan: api.draft,
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

const withPeople = (titles: string[]) => {
  const base = outcome(titles);
  return {
    ...base,
    stories: titles.map((title) => ({
      ...story(title),
      labels: ["design"],
      candidates: [
        { employeeId: "e-ada", reasons: ["Has capacity"] },
        { employeeId: "e-bo", reasons: ["On the project"] },
      ],
    })),
    people: [
      person("e-ada", "Ada Eze", "k-1"),
      person("e-bo", "Bo Ike", null),
      person("e-cy", "Cy Ojo", "k-3"),
    ],
  };
};

const person = (id: string, name: string, ownKpiId: string | null) => ({
  employeeId: id,
  name,
  jobTitle: "Analyst",
  led: true,
  openIssues: 0,
  openPoints: 0,
  leave: null,
  ownKpiId,
});

describe("the plan-work dialog's words", () => {
  it("counts the tasks to create, in the singular for one", async () => {
    const { dialog } = await draftWith(["Brief the agency"]);
    expect(
      within(dialog).getByRole("button", { name: "Create 1 task" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Add a task" }),
    ).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent("1 tasks");
  });

  it("counts several the same way, and names each one a task", async () => {
    const { dialog } = await draftWith(["Brief the agency", "Book venue"]);
    expect(
      within(dialog).getByRole("button", { name: "Create 2 tasks" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Task 1 title")).toHaveValue(
      "Brief the agency",
    );
    expect(within(dialog).getByLabelText("Task 2 title")).toHaveValue(
      "Book venue",
    );
    expect(within(dialog).getByLabelText("Remove task 1")).toBeInTheDocument();
  });
});

describe("one row to a task", () => {
  it("is a title, who takes it, a pencil and a bin, and no project-planning fields", async () => {
    const { dialog } = await draftWith(["Brief the agency", "Book venue"]);
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(2);
    expect(within(dialog).queryByText("Effort")).toBeNull();
    expect(within(dialog).queryByText("Labels")).toBeNull();
    expect(within(dialog).queryByText(/Moves the target/)).toBeNull();
    expect(within(dialog).queryByText(/Steps, created/)).toBeNull();
    expect(within(dialog).queryByText(/unassigned subtasks/)).toBeNull();
    expect(within(dialog).queryByText(/under the initiative/)).toBeNull();
    expect(within(dialog).queryByText(/What this was based on/)).toBeNull();
    expect(within(dialog).queryByText(/Everyone on the project/)).toBeNull();
    expect(within(dialog).queryByText(/Nothing is created until/)).toBeNull();
    expect(
      within(dialog).getByRole("button", {
        name: "Write what done looks like for task 1",
      }),
    ).toBeInTheDocument();
  });

  it("opens what done looks like from the pencil, and only from the pencil", async () => {
    const { user, dialog } = await draftWith(["Brief the agency"]);
    expect(within(dialog).queryByLabelText("Task 1 detail")).toBeNull();
    await user.click(
      within(dialog).getByRole("button", {
        name: "Write what done looks like for task 1",
      }),
    );
    expect(within(dialog).getByLabelText("Task 1 detail")).toBeVisible();
  });

  it("asks who takes it once, with the first suggestion already chosen", async () => {
    api.list.mockResolvedValue([
      { id: "pj1", key: "CHK", name: "Checkout Revamp", canManage: true },
    ]);
    api.draft.mockResolvedValue(withPeople(["Brief the agency"]));
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
    const dialog = within(await screen.findByRole("dialog"));

    const who = dialog.getByRole("combobox", { name: "Task 1 assignee" });
    expect(who).toHaveValue("e-ada");
    expect(
      within(who)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      "Nobody yet",
      "Ada Eze (suggested)",
      "Bo Ike (suggested)",
      "Cy Ojo",
    ]);
    /* No second control for the same choice, and no reasons printed. */
    expect(dialog.queryByRole("button", { name: /Has capacity/ })).toBeNull();
    expect(dialog.queryByText(/Has capacity/)).toBeNull();
    /* Ada has an agreed objective under this one, so there is nothing to mark. */
    expect(
      dialog.queryByRole("button", { name: /no agreed objective/ }),
    ).toBeNull();

    await user.selectOptions(who, "e-bo");
    expect(
      dialog.getByRole("button", { name: /Bo Ike has no agreed objective/ }),
    ).toBeInTheDocument();
    expect(dialog.queryByText(/This work would not count/)).toBeNull();
  });
});

describe("a row with no title", () => {
  it("is left out of the plan without a word, and the count follows", async () => {
    const { user, dialog } = await draftWith([
      "Brief the agency",
      "Book venue",
    ]);
    await user.clear(within(dialog).getByLabelText("Task 2 title"));
    expect(
      within(dialog).getByRole("button", { name: "Create 1 task" }),
    ).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent(/give every task a title/i);
    expect(dialog).not.toHaveTextContent(/untitled/i);
  });

  it("leaves no Create button, and no line about it, when there is nothing to create", async () => {
    const { user, dialog } = await draftWith(["Brief the agency"]);
    await user.click(
      within(dialog).getByRole("button", { name: "Remove task 1" }),
    );
    expect(
      within(dialog).queryByRole("button", { name: /^Create/ }),
    ).toBeNull();
    expect(dialog).not.toHaveTextContent("Keep at least one task.");
    expect(
      within(dialog).getByRole("button", { name: "Add a task" }),
    ).toBeInTheDocument();
  });
});

describe("creating the plan", () => {
  it("sends the named tasks as drafted, with no steps, and drops the untitled one", async () => {
    api.commit.mockResolvedValue({
      issues: [{}],
      epic: { key: "CHK-1" },
      linked: false,
    });
    const { user, dialog } = await draftWith([
      "Brief the agency",
      "Book venue",
    ]);
    await user.clear(within(dialog).getByLabelText("Task 2 title"));
    await user.click(
      within(dialog).getByRole("button", { name: "Create 1 task" }),
    );

    await waitFor(() => expect(api.commit).toHaveBeenCalledTimes(1));
    const [projectId, body] = api.commit.mock.calls[0] as [
      string,
      { stories: Record<string, unknown>[]; linkProject: boolean },
    ];
    expect(projectId).toBe("pj1");
    expect(body.linkProject).toBe(true);
    expect(body.stories).toEqual([
      { title: "Brief the agency", points: 5, assigneeId: null },
    ]);
    expect(body.stories[0]).not.toHaveProperty("subtasks");
  });

  it("links the project with a single plain checkbox, and no help beneath it", async () => {
    const { dialog } = await draftWith(["Brief the agency"]);
    expect(
      within(dialog).getByRole("checkbox", {
        name: /Link Checkout Revamp to this objective/,
      }),
    ).toBeChecked();
    expect(within(dialog).queryByText(/\(optional\)/)).toBeNull();
    expect(within(dialog).queryByText(/finished tasks then show/)).toBeNull();
  });
});
