import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ProjectProvider,
  type ProjectContextValue,
} from "@/components/projects/project-context";
import type { ProjectData } from "@/lib/projects/types";
import { CYCLE, EFFORT } from "@/lib/projects/terms";
import { contextFor, sampleData } from "./projects-fixture";

/**
 * A simple board asks for no effort and has no cycles (UAT 23 Nov, U104 /
 * PERF-25). A simple board shows Board and List only; the New task form still
 * asked for effort points, and the List still had Effort and Cycle columns.
 * A value a task already carries is still shown.
 */

vi.mock("@/components/ui", async (original) => ({
  ...(await original<typeof import("@/components/ui")>()),
  useToast: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/store/project-session", () => ({
  useProjectActor: () => ({
    employeeId: "p-01",
    editRecords: false,
    leadsPeople: false,
    headsDepartment: false,
  }),
}));
vi.mock("@/lib/store/completions", () => ({ useBulkLink: () => vi.fn() }));
vi.mock("@/lib/store/performance", () => ({
  useDemoObjectives: () => [],
  useKpis: () => ({
    goals: [],
    cascade: [],
    loading: false,
    error: null,
    source: "api",
    reload: vi.fn(),
  }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/projects/pj-chk",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ flat: [] }),
}));

const { CreateIssueDialog } =
  await import("@/components/projects/create-issue-dialog");
const { IssuesView } = await import("@/app/(app)/projects/[id]/issues-view");

function simple(withPoints = false): ProjectData {
  const data = sampleData();
  data.project = { ...data.project, type: "KANBAN" };
  data.issues = data.issues.map((issue) => ({
    ...issue,
    points: withPoints && issue.type === "TASK" ? (issue.points ?? 3) : null,
    sprintId: null,
  }));
  return data;
}

const ctxFor = (data: ProjectData): ProjectContextValue =>
  contextFor(data, {
    connected: true,
    meId: "p-01",
    canManage: true,
    canWork: true,
  });

const columns = () =>
  screen.getAllByRole("columnheader").map((th) => th.textContent?.trim());

describe("a simple board", () => {
  it("asks for no effort when a task is made", () => {
    const data = simple();
    render(
      <ProjectProvider value={ctxFor(data)}>
        <CreateIssueDialog open onClose={vi.fn()} defaults={{}} />
      </ProjectProvider>,
    );
    expect(screen.queryByLabelText(new RegExp(`^${EFFORT.One}`))).toBeNull();
  });

  it("has no Effort or Cycle column in its list", () => {
    render(
      <ProjectProvider value={ctxFor(simple())}>
        <IssuesView />
      </ProjectProvider>,
    );
    expect(columns()).not.toContain(EFFORT.One);
    expect(columns()).not.toContain(CYCLE.One);
  });

  it("still shows effort a task already carries", () => {
    render(
      <ProjectProvider value={ctxFor(simple(true))}>
        <IssuesView />
      </ProjectProvider>,
    );
    expect(columns()).toContain(EFFORT.One);
  });
});

describe("a board with cycles", () => {
  it("still asks for effort", () => {
    render(
      <ProjectProvider value={ctxFor(sampleData())}>
        <CreateIssueDialog open onClose={vi.fn()} defaults={{}} />
      </ProjectProvider>,
    );
    expect(screen.getByLabelText(new RegExp(`^${EFFORT.One}`))).toBeTruthy();
  });
});
