import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ProjectProvider,
  type ProjectContextValue,
} from "@/components/projects/project-context";
import { contextFor, sampleData } from "./projects-fixture";

/**
 * "Won't do" and "Accepted" on the List tab of a project.
 *
 * A browser walk of the work-assists change found that every place that shows a task with its stage said
 * a task was closed as won't do, except this table, which drew a plain Done. What is proved: a task closed
 * as won't do and a task a leader accepted say so in their own row of the table, beside their stage, and
 * only in theirs; a task nobody marked says nothing; and a server that sent neither field is read as no
 * mark, not as a mark.
 */

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

const { IssuesView } = await import("@/app/(app)/projects/[id]/issues-view");

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

/** The first three ordinary tasks of the sample project, so a row can be found by its key. */
function mount(marks: {
  wontDo?: typeof WONT_DO | null;
  accepted?: typeof ACCEPTED | null;
}) {
  const data = sampleData();
  const ordinary = data.issues.filter(
    (i) => i.type !== "EPIC" && i.type !== "SUBTASK",
  );
  const [marked, accepted, plain] = ordinary;
  data.issues = data.issues.map((issue) => {
    if (issue.id === marked!.id && marks.wontDo !== undefined)
      return { ...issue, wontDo: marks.wontDo };
    if (issue.id === accepted!.id && marks.accepted !== undefined)
      return { ...issue, accepted: marks.accepted };
    return issue;
  });
  const ctx: ProjectContextValue = contextFor(data, {
    connected: true,
    meId: "p-01",
    canManage: true,
    canWork: true,
  });
  render(
    <ProjectProvider value={ctx}>
      <IssuesView />
    </ProjectProvider>,
  );
  return {
    marked: marked!,
    accepted: accepted!,
    plain: plain!,
  };
}

const rowOf = (key: string) => {
  const cell = screen.getAllByText(key).find((el) => el.closest("tr"));
  return within(cell!.closest("tr") as HTMLElement);
};

describe("the List tab", () => {
  it("says a task was closed as won't do, in that task's own row", () => {
    const { marked, plain } = mount({ wontDo: WONT_DO });
    expect(rowOf(marked.key).getByText("Won't do")).toBeInTheDocument();
    expect(rowOf(plain.key).queryByText("Won't do")).toBeNull();
  });

  it("says a task was accepted, in that task's own row", () => {
    const { accepted, plain } = mount({ accepted: ACCEPTED });
    expect(rowOf(accepted.key).getByText("Accepted")).toBeInTheDocument();
    expect(rowOf(plain.key).queryByText("Accepted")).toBeNull();
  });

  it("says each once, and says nothing at all when nobody marked anything", () => {
    mount({ wontDo: WONT_DO, accepted: ACCEPTED });
    expect(screen.getAllByText("Won't do")).toHaveLength(1);
    expect(screen.getAllByText("Accepted")).toHaveLength(1);
  });

  it("reads a task with no mark fields as unmarked", () => {
    mount({});
    expect(screen.queryByText("Won't do")).toBeNull();
    expect(screen.queryByText("Accepted")).toBeNull();
  });

  it("does not read a null mark as a mark", () => {
    mount({ wontDo: null, accepted: null });
    expect(screen.queryByText("Won't do")).toBeNull();
    expect(screen.queryByText("Accepted")).toBeNull();
  });
});
