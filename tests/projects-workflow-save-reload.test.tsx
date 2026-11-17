import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import type {
  ProjectData,
  ProjectStatus,
  StatusInput,
} from "@/lib/projects/types";
import { sampleData } from "./projects-fixture";

/**
 * Saving a project's workflow when it moves a stage into or out of Done.
 *
 * The server answers a stage that leaves Done by clearing the finish time and both finish marks (won't
 * do and accepted) on every task in it, and one that enters Done by setting the finish time. A review
 * of the Stage 4 web work said the store only held the new stages and so went on saying "Won't do" and
 * "Accepted" about a task that is open again. It does not: `apiSaveWorkflow` runs the save inside
 * `tracked`, which asks the server for the whole project again (tasks included) when the last mutation
 * on it settles, and what comes back replaces what was held. So nothing was added to the store; this
 * file holds that behaviour, because the marks are the thing that would be wrong if it stopped.
 *
 * What is proved: after a save that takes a stage out of Done the held tasks are the server's, with
 * both marks gone; and the same after a save that brings a stage into Done.
 */

const data: { current: ProjectData } = { current: sampleData() };
const load = vi.fn();
const setStatuses = vi.fn();

vi.mock("@/lib/api/projects", async (original) => {
  const real = await original<typeof import("@/lib/api/projects")>();
  return {
    ...real,
    projectsApi: {
      ...real.projectsApi,
      load: (...a: unknown[]) => load(...a),
      setStatuses: (...a: unknown[]) => setStatuses(...a),
    },
  };
});

vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({
    isConnected: true,
    isLoading: false,
    user: { organizationId: "org-1" },
    actingId: "p-03",
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));

const { useProjectActions, useProjectData } =
  await import("@/lib/store/projects");

const wrapper = ({ children }: { children: ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
);

const WONT_DO = {
  at: "2026-11-10T09:00:00.000Z",
  byId: "p-05",
  byName: "Adaeze Okonkwo",
  reason: "The customer changed their mind",
};
const ACCEPTED = {
  at: "2026-11-11T14:30:00.000Z",
  byId: "p-05",
  byName: "Adaeze Okonkwo",
};

const asInput = (s: ProjectStatus): StatusInput => ({
  id: s.id,
  name: s.name,
  category: s.category,
  wipLimit: s.wipLimit,
});

/** The project as it is held, with both marks on tasks in its Done column. */
function marked(): { held: ProjectData; closed: string; accepted: string } {
  const base = sampleData();
  const doneIds = new Set(
    base.project.statuses.filter((s) => s.category === "DONE").map((s) => s.id),
  );
  const inDone = base.issues.filter(
    (i) => doneIds.has(i.statusId) && i.type !== "EPIC",
  );
  const closed = inDone[0]!;
  const accepted = inDone[1] ?? inDone[0]!;
  return {
    held: {
      ...base,
      issues: base.issues.map((i) =>
        i.id === closed.id
          ? { ...i, wontDo: WONT_DO }
          : i.id === accepted.id
            ? { ...i, accepted: ACCEPTED }
            : i,
      ),
    },
    closed: closed.id,
    accepted: accepted.id,
  };
}

function mount() {
  const projectId = data.current.project.id;
  return renderHook(
    () => ({
      view: useProjectData(projectId),
      actions: useProjectActions(projectId),
    }),
    { wrapper },
  );
}

const cached = (
  result: { current: { view: { data: ProjectData | null } } },
  id: string,
) => result.current.view.data?.issues.find((i) => i.id === id);

/** What the server holds after a re-categorised save: the stages as sent, and the tasks without marks. */
const serverAfter = (
  held: ProjectData,
  statuses: ProjectStatus[],
): ProjectData => ({
  ...held,
  project: { ...held.project, statuses },
  issues: held.issues.map((i) => ({ ...i, wontDo: null, accepted: null })),
});

beforeEach(() => {
  data.current = sampleData();
  load.mockReset();
  setStatuses.mockReset();
});

describe("saving a workflow that moves a stage across the line into or out of Done", () => {
  it("reads the tasks again, so a task whose marks the server cleared stops saying it was closed or accepted", async () => {
    const { held } = marked();
    data.current = held;
    const done = held.project.statuses.find((s) => s.category === "DONE")!;
    const drafts: StatusInput[] = [
      ...held.project.statuses.map((s) =>
        s.id === done.id
          ? { ...asInput(s), category: "IN_PROGRESS" as const }
          : asInput(s),
      ),
      { name: "Shipped", category: "DONE", wipLimit: null },
    ];
    const saved: ProjectStatus[] = [
      ...held.project.statuses.map((s) =>
        s.id === done.id ? { ...s, category: "IN_PROGRESS" as const } : s,
      ),
      {
        id: "s-shipped",
        name: "Shipped",
        category: "DONE",
        wipLimit: null,
        position: held.project.statuses.length,
      },
    ];
    setStatuses.mockResolvedValue(saved);
    load.mockResolvedValueOnce(held);
    load.mockResolvedValue(serverAfter(held, saved));

    const { result } = mount();
    await waitFor(() => expect(result.current.view.data).not.toBeNull());
    expect(load).toHaveBeenCalledTimes(1);
    const { closed, accepted } = marked();
    expect(cached(result, closed)?.wontDo).toEqual(WONT_DO);

    await act(async () => {
      await result.current.actions.saveWorkflow(drafts);
    });

    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(cached(result, closed)?.wontDo).toBeNull());
    expect(cached(result, accepted)?.accepted).toBeNull();
  });

  it("does so for a stage that enters Done too, where the server sets the finish time", async () => {
    const { held } = marked();
    data.current = held;
    const review = held.project.statuses.find(
      (s) => s.category === "IN_PROGRESS",
    )!;
    const drafts = held.project.statuses.map((s) =>
      s.id === review.id
        ? { ...asInput(s), category: "DONE" as const }
        : asInput(s),
    );
    const saved = held.project.statuses.map((s) =>
      s.id === review.id ? { ...s, category: "DONE" as const } : s,
    );
    setStatuses.mockResolvedValue(saved);
    load.mockResolvedValue(held);

    const { result } = mount();
    await waitFor(() => expect(result.current.view.data).not.toBeNull());
    await act(async () => {
      await result.current.actions.saveWorkflow(drafts);
    });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });
});
