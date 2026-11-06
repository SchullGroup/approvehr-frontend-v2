import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectProvider } from "@/components/projects/project-context";
import type { Program } from "@/lib/projects/programs";
import { contextFor, sampleData } from "./projects-fixture";
import { fakeProgramActions } from "./programs-fixture";

/**
 * Moving a project between programs, from its settings.
 *
 * Only the people who manage the project see the picker, and only programs that
 * will take a new project are offered (the API says which). Moving asks first and
 * says what changes for who can see the project; nothing else about it changes.
 */

const card = (over: Partial<Program>): Program => ({
  id: "pg-x",
  name: "X",
  description: "",
  color: "#2B3990",
  departmentId: null,
  departmentName: null,
  leadId: "p-10",
  leadName: "Halima Sani",
  archived: false,
  archivedAt: null,
  access: "MANAGE",
  canManage: true,
  canCreateProject: true,
  projectCount: 1,
  openTaskCount: 1,
  accessCount: 0,
  createdAt: "",
  updatedAt: "",
  ...over,
});

let programs: Program[] = [];
let actions = fakeProgramActions();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/projects/pj-chk",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ flat: [] }),
}));
vi.mock("@/lib/store/programs", () => ({
  useProgramList: () => ({
    status: "ready",
    error: null,
    data: { programs, canCreate: true, seesAll: false },
    reload: vi.fn(),
  }),
  useProgramActions: () => actions,
}));

const { SettingsView } =
  await import("@/app/(app)/projects/[id]/settings-view");

function open(
  projectOver: Record<string, unknown> = {},
  ctxOver: Record<string, unknown> = {},
) {
  const data = sampleData();
  data.project = {
    ...data.project,
    programId: "pg-ops",
    programName: "Operations",
    ...projectOver,
  };
  return render(
    <ProjectProvider value={contextFor(data, ctxOver)}>
      <SettingsView />
    </ProjectProvider>,
  );
}

beforeEach(() => {
  actions = fakeProgramActions();
  programs = [
    card({ id: "pg-ops", name: "Operations" }),
    card({ id: "pg-tech", name: "Technology" }),
    card({ id: "pg-read", name: "Finance", canCreateProject: false }),
    card({ id: "pg-old", name: "Closed", archived: true }),
  ];
});

const picker = () => screen.getByLabelText(/^Program/);

describe("the program picker", () => {
  it("offers only programs that will take a project, and none that are archived", () => {
    open();
    const names = within(picker())
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(names).toEqual(["Operations", "No program", "Technology"]);
  });

  it("offers No program only to somebody who manages the project's own program", () => {
    programs[0] = card({ id: "pg-ops", name: "Operations", canManage: false });
    open();
    const names = within(picker())
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(names).not.toContain("No program");
  });

  it("is absent for somebody who cannot change settings", () => {
    open({}, { canManage: false });
    expect(screen.queryByLabelText(/^Program/)).not.toBeInTheDocument();
  });

  it("is absent in a company with no programs", () => {
    programs = [];
    open({ programId: null, programName: null });
    expect(screen.queryByLabelText(/^Program/)).not.toBeInTheDocument();
  });
});

describe("moving", () => {
  it("asks first, and says what changes for who can see it", async () => {
    open();
    await userEvent.selectOptions(picker(), "pg-tech");
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Move Checkout Revamp to Technology?");
    expect(dialog).toHaveTextContent(
      "People with access to Technology will be able to see it",
    );
    expect(dialog).toHaveTextContent(
      "People who see it only through Operations will no longer see it, unless they are members",
    );
    expect(dialog).toHaveTextContent(
      "Its members, tasks and key stay as they are",
    );
    expect(actions.moveProject).not.toHaveBeenCalled();
  });

  it("moves it when confirmed, naming the project and the program", async () => {
    open();
    await userEvent.selectOptions(picker(), "pg-tech");
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Move project",
      }),
    );
    await waitFor(() => expect(actions.moveProject).toHaveBeenCalled());
    const [project, programId] = actions.moveProject.mock
      .calls[0]! as unknown as [{ id: string; name: string }, string | null];
    expect(project.name).toBe("Checkout Revamp");
    expect(programId).toBe("pg-tech");
  });

  it("takes a project out of its program when No program is chosen", async () => {
    open();
    await userEvent.selectOptions(picker(), "");
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Move Checkout Revamp to no program?");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Move project" }),
    );
    await waitFor(() => expect(actions.moveProject).toHaveBeenCalled());
    expect(
      (actions.moveProject.mock.calls[0]! as unknown as unknown[])[1],
    ).toBeNull();
  });

  it("changes nothing when it is cancelled", async () => {
    open();
    await userEvent.selectOptions(picker(), "pg-tech");
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cancel",
      }),
    );
    expect(actions.moveProject).not.toHaveBeenCalled();
  });
});
