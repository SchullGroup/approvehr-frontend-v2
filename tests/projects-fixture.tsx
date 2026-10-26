import { vi } from "vitest";
import type { ProjectContextValue } from "@/components/projects/project-context";
import { EMPTY_FILTER } from "@/lib/projects/filters";
import { buildSample } from "@/lib/projects/sample";
import type { Issue, ProjectData } from "@/lib/projects/types";
import type { ProjectActions } from "@/lib/store/projects";
import type { People } from "@/lib/store/project-session";

/**
 * A project to render a view against, without a store.
 *
 * The views read everything from `useProject()`, so a test hands them a context
 * built from the "Checkout Revamp" sample and a set of spies for the actions. What
 * it can prove is the view's own behaviour: what it draws, and which call it makes.
 * The rules behind the call are covered in `projects-rules.test.ts`.
 */

export const TODAY = "2026-10-15";
export const NOW = "2026-10-15T12:00:00.000Z";
export const PEOPLE_IDS = ["p-01", "p-03", "p-09", "p-04"];

const NAMES: Record<string, string> = {
  "p-01": "Adaeze Okonkwo",
  "p-03": "Chidi Nwosu",
  "p-09": "Emeka Anyanwu",
  "p-04": "Ngozi Eze",
};

export const people: People = {
  people: PEOPLE_IDS.map((id) => ({
    id,
    name: NAMES[id]!,
    jobTitle: "Engineer",
    departmentId: null,
    department: null,
  })),
  byId: new Map(
    PEOPLE_IDS.map((id) => [
      id,
      {
        id,
        name: NAMES[id]!,
        jobTitle: "Engineer",
        departmentId: null,
        department: null,
      },
    ]),
  ),
  loading: false,
  nameOf: (id) => (id ? (NAMES[id] ?? "Someone") : "Unassigned"),
};

export function sampleData(): ProjectData {
  const s = buildSample({ today: TODAY, now: NOW, people: PEOPLE_IDS });
  return { project: s.project, issues: s.issues, sprints: s.sprints };
}

export function fakeActions(): {
  [K in keyof ProjectActions]: ReturnType<typeof vi.fn>;
} {
  const resolved = (value: unknown = undefined) =>
    vi.fn(() => Promise.resolve({ ok: true, value }));
  return {
    createIssue: vi.fn((input: { title: string }) =>
      Promise.resolve({ ok: true, value: { key: "CHK-99", ...input } }),
    ),
    patchIssue: resolved(),
    refreshIssue: resolved(),
    deleteIssue: resolved(),
    addComment: resolved(),
    editComment: resolved(),
    deleteComment: resolved(),
    updateProject: resolved(),
    setMembers: resolved(),
    saveWorkflow: resolved([]),
    deleteProject: resolved(),
    createSprint: resolved(),
    updateSprint: resolved(),
    deleteSprint: resolved(),
    startSprint: resolved(),
    completeSprint: resolved(),
  };
}

export function contextFor(
  data: ProjectData,
  overrides: Partial<ProjectContextValue> = {},
): ProjectContextValue {
  const { project, issues, sprints } = data;
  return {
    project,
    issues,
    sprints,
    epics: issues.filter((i: Issue) => i.type === "EPIC"),
    issueById: new Map(issues.map((i) => [i.id, i])),
    issueByKey: new Map(issues.map((i) => [i.key, i])),
    actions: fakeActions() as unknown as ProjectActions,
    people,
    meId: "p-01",
    connected: false,
    canWork: true,
    canManage: true,
    timeZone: "Africa/Lagos",
    today: TODAY,
    dayOf: (instant) => instant.slice(0, 10),
    filter: EMPTY_FILTER,
    setFilter: vi.fn(),
    openIssue: vi.fn(),
    openCreate: vi.fn(),
    ...overrides,
  };
}
