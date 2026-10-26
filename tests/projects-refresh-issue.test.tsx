import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { Issue, ProjectData } from "@/lib/projects/types";
import { sampleData } from "./projects-fixture";

/**
 * Re-reading one issue after a write. The save returns the issue as it was
 * before the weekly-task bridge ran, so the store asks the server again and
 * lays the answer over its cached copy; and it does not do that while another
 * write is in flight, or the older answer would roll that write back.
 */

const data: { current: ProjectData } = { current: sampleData() };
const load = vi.fn();
const getIssue = vi.fn();
const updateIssue = vi.fn();

vi.mock("@/lib/api/projects", async (original) => {
  const real = await original<typeof import("@/lib/api/projects")>();
  return {
    ...real,
    projectsApi: {
      ...real.projectsApi,
      load: (...a: unknown[]) => load(...a),
      getIssue: (...a: unknown[]) => getIssue(...a),
      updateIssue: (...a: unknown[]) => updateIssue(...a),
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

const NOT_COUNTED: Issue["weeklyTask"] = {
  state: "NOT_COUNTED",
  reason: "NO_OBJECTIVE",
  message: "Not counted toward a weekly task",
};
const FILED: Issue["weeklyTask"] = {
  state: "FILED",
  taskId: "t1",
  graded: false,
};

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

beforeEach(() => {
  data.current = sampleData();
  for (const fn of [load, getIssue, updateIssue]) fn.mockReset();
});

describe("refreshIssue", () => {
  it("lays the server's issue over the cached one, weekly-task line included", async () => {
    const base = data.current.issues.find((i) => i.type === "TASK")!;
    data.current = {
      ...data.current,
      issues: data.current.issues.map((i) =>
        i.id === base.id ? { ...i, weeklyTask: NOT_COUNTED } : i,
      ),
    };
    load.mockResolvedValue(data.current);
    getIssue.mockResolvedValue({ ...base, goalId: "g1", weeklyTask: FILED });

    const { result } = mount();
    await waitFor(() => expect(result.current.view.data).not.toBeNull());
    expect(cached(result, base.id)?.weeklyTask).toEqual(NOT_COUNTED);

    await act(async () => {
      await result.current.actions.refreshIssue(base);
    });

    expect(getIssue).toHaveBeenCalledWith(base.id);
    expect(cached(result, base.id)?.weeklyTask).toEqual(FILED);
    expect(cached(result, base.id)?.goalId).toBe("g1");
  });

  it("leaves the cache alone while a write is still in flight", async () => {
    const base = data.current.issues.find((i) => i.type === "TASK")!;
    load.mockResolvedValue(data.current);
    getIssue.mockResolvedValue({ ...base, weeklyTask: FILED });
    let finish: (issue: Issue) => void = () => undefined;
    updateIssue.mockReturnValue(
      new Promise<Issue>((resolve) => {
        finish = resolve;
      }),
    );

    const { result } = mount();
    await waitFor(() => expect(result.current.view.data).not.toBeNull());

    let write: Promise<unknown> = Promise.resolve();
    act(() => {
      write = result.current.actions.patchIssue(base, { title: "Renamed" });
    });
    await act(async () => {
      await result.current.actions.refreshIssue(base);
    });
    expect(cached(result, base.id)?.weeklyTask).not.toEqual(FILED);
    expect(cached(result, base.id)?.title).toBe("Renamed");

    await act(async () => {
      finish({ ...base, title: "Renamed" });
      await write;
    });
  });
});
