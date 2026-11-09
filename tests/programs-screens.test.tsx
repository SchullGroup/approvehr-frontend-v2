import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { programRollup } from "@/lib/projects/programs";
import {
  NOW,
  WHO,
  actorOf,
  fakeProgramActions,
  people,
  programHooks,
  scene,
  viewerOf,
  type Who,
} from "./programs-fixture";

/**
 * The program screens, for the people the rules are about.
 *
 * What is proved is what each person is *shown* and which call a control makes:
 * tabs and buttons that exist only for the people the API lets use them (absent,
 * not greyed out), a plain sentence for somebody who can only read, and the
 * choices on the New program form. The rules behind the numbers are in
 * `projects-programs-engine.test.ts`.
 */

let who: Who = WHO.hr;
let search = new URLSearchParams();
const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => search,
  usePathname: () => "/projects/programs",
  useRouter: () => ({ push, replace, back: vi.fn() }),
}));

const pushToast = vi.fn();
vi.mock("@/components/ui", async (original) => ({
  ...(await original<typeof import("@/components/ui")>()),
  useToast: () => ({ push: pushToast }),
}));

let actions = fakeProgramActions();
/** A program with this many people on its list, instead of the engine's three. */
let crowd = 0;
vi.mock("@/lib/store/programs", async () => {
  const fixture = await import("./programs-fixture");
  const hooks = fixture.programHooks(() => who);
  return {
    ...hooks,
    useProgramActions: () => actions,
    useProgramPeople: (id: string, enabled: boolean) => {
      if (crowd === 0) return hooks.useProgramPeople(id, enabled);
      return {
        status: "ready" as const,
        error: null,
        reload: vi.fn(),
        data: {
          lead: { id: "lead", name: "Halima Sani" },
          total: crowd,
          capped: false,
          people: Array.from({ length: crowd }, (_, i) => ({
            employeeId: `e${i}`,
            name: `Person ${String(i + 1).padStart(3, "0")}`,
            jobTitle: i % 2 === 0 ? "Analyst" : "Driver",
            departmentId: null,
            departmentName: null,
            level: "READ" as const,
          })),
        },
      };
    },
  };
});

vi.mock("@/lib/store/projects", () => ({
  useCreateProject: () => vi.fn(),
}));

vi.mock("@/lib/store/project-session", async () => {
  const fixture = await import("./programs-fixture");
  return {
    useProjectsGate: () => ({ enabled: true, loading: false }),
    usePeople: () => fixture.people,
    useProjectActor: () => fixture.actorOf(who),
  };
});

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: false, actingId: who.id }),
  useOrgTimezone: () => "Africa/Lagos",
}));

vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({
    flat: [
      { id: "d-eng", name: "Engineering", archived: false },
      { id: "d-fin", name: "Finance", archived: false },
    ],
  }),
}));

/* The department field has its own tests; here it is a plain select. */
vi.mock("@/components/projects/department-field", () => ({
  DepartmentField: ({
    value,
    onChange,
    error,
  }: {
    value: string;
    onChange: (id: string) => void;
    error?: string;
  }) => (
    <label>
      Department
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose a department</option>
        <option value="d-eng">Engineering</option>
        <option value="d-fin">Finance</option>
      </select>
      {error ? <span>{error}</span> : null}
    </label>
  ),
}));

/* The picker has its own tests; here it is a plain select, so a person can be chosen. */
vi.mock("@/components/projects/person", () => ({
  PersonPicker: ({
    value,
    onChange,
    exclude = [],
    "aria-label": label,
  }: {
    value: string;
    onChange: (id: string) => void;
    exclude?: string[];
    "aria-label"?: string;
  }) => (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Choose a person</option>
      {people.people
        .filter((p) => !exclude.includes(p.id))
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
    </select>
  ),
}));

const { ProgramsScreen } =
  await import("@/app/(app)/projects/programs/programs-screen");
const { ProgramScreen } =
  await import("@/app/(app)/projects/programs/[id]/program-screen");

beforeEach(() => {
  crowd = 0;
  who = WHO.hr;
  search = new URLSearchParams();
  actions = fakeProgramActions();
  push.mockClear();
  replace.mockClear();
  pushToast.mockClear();
});

const tabs = () =>
  Array.from(document.querySelectorAll("nav.scroll-x a")).map(
    (a) => a.textContent,
  );

/* ------------------------------------------------------------ the index -- */

describe("the Programs index", () => {
  it("shows HR a card per program, the Unassigned bucket, and a way to start one", () => {
    render(<ProgramsScreen />);
    expect(screen.getByText("Operations")).toBeInTheDocument();
    expect(screen.getByText("Technology")).toBeInTheDocument();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "New program" }),
    ).toBeInTheDocument();
  });

  it("says who leads each program and how many projects and people it has", () => {
    render(<ProgramsScreen />);
    const card = screen.getByText("Operations").closest("a")!;
    expect(within(card).getByText("Halima Sani")).toBeInTheDocument();
    expect(card).toHaveTextContent("2 projects");
    expect(card).toHaveTextContent("3 people");
    expect(card).toHaveAttribute("href", "/projects/programs/pg-ops");
  });

  it("shows a reader only the program they have, with no button to start one and no Unassigned", () => {
    who = WHO.read;
    render(<ProgramsScreen />);
    expect(screen.getByText("Operations")).toBeInTheDocument();
    expect(screen.queryByText("Technology")).not.toBeInTheDocument();
    expect(screen.queryByText("Unassigned")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "New program" }),
    ).not.toBeInTheDocument();
  });

  it("does not tell a reader how many people are on the list, which is not theirs to see", () => {
    who = WHO.read;
    render(<ProgramsScreen />);
    const card = screen.getByText("Operations").closest("a")!;
    expect(card).not.toHaveTextContent(/\d+ (people|person)/);
  });

  it("tells somebody with no programs so, plainly, and does not offer to start one", () => {
    who = WHO.outsider;
    render(<ProgramsScreen />);
    expect(screen.getByText("No programs yet")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "New program" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to all projects" }),
    ).toHaveAttribute("href", "/projects");
  });

  it("searches by program or lead", async () => {
    render(<ProgramsScreen />);
    await userEvent.type(screen.getByLabelText(/search programs/i), "adaeze");
    /* The search lives in the address bar; the stub keeps it, so ask again. */
    expect(replace).toHaveBeenCalled();
  });
});

/* ------------------------------------------------- the New program form -- */

describe("New program", () => {
  async function open() {
    render(<ProgramsScreen />);
    await userEvent.click(screen.getByRole("button", { name: "New program" }));
    return screen.getByRole("dialog");
  }

  it("asks for a name before it does anything", async () => {
    const dialog = await open();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Create program" }),
    );
    expect(
      within(dialog).getByText("Give the program a name."),
    ).toBeInTheDocument();
    expect(actions.createProgram).not.toHaveBeenCalled();
  });

  it("starts with the creator as lead and the department's people as nobody", async () => {
    const dialog = await open();
    expect(within(dialog).getByLabelText("Lead")).toHaveValue("p-05");
    /* The level is asked only once a department is chosen, and starts at nobody. */
    expect(
      within(dialog).queryByLabelText("Add this department's people as"),
    ).toBeNull();
    await userEvent.selectOptions(
      within(dialog).getByLabelText(/^Department/),
      "d-eng",
    );
    expect(
      within(dialog).getByLabelText("Add this department's people as"),
    ).toHaveValue("none");
  });

  it("will not make a program without a department", async () => {
    const dialog = await open();
    await userEvent.type(within(dialog).getByLabelText(/^Name/), "Finance");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Create program" }),
    );
    expect(
      within(dialog).getByText("Choose a department."),
    ).toBeInTheDocument();
    expect(actions.createProgram).not.toHaveBeenCalled();
  });

  it("says that linking a department gives nobody access, and how many a level would add", async () => {
    const dialog = await open();
    await userEvent.selectOptions(
      within(dialog).getByLabelText(/^Department/),
      "d-eng",
    );
    expect(dialog).toHaveTextContent(
      "Linking Engineering gives nobody access by itself",
    );
    await userEvent.selectOptions(
      within(dialog).getByLabelText("Add this department's people as"),
      "WRITE",
    );
    expect(dialog).toHaveTextContent(
      "3 people in Engineering will be added now, once, with read and write access",
    );
    expect(dialog).toHaveTextContent(
      "People who join the department later are not added",
    );
  });

  it("makes the program and adds nobody when no level is chosen", async () => {
    const dialog = await open();
    await userEvent.type(within(dialog).getByLabelText(/^Name/), "Finance");
    await userEvent.selectOptions(
      within(dialog).getByLabelText(/^Department/),
      "d-fin",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Create program" }),
    );
    await waitFor(() => expect(actions.createProgram).toHaveBeenCalled());
    expect(actions.createProgram.mock.calls[0]![0]).toMatchObject({
      name: "Finance",
      departmentId: "d-fin",
      leadId: "p-05",
    });
    expect(actions.addDepartment).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/projects/programs/pg-new"),
    );
  });

  it("adds the department at the chosen level, once, and names it in the call", async () => {
    const dialog = await open();
    await userEvent.type(
      within(dialog).getByLabelText(/^Name/),
      "Engineering ops",
    );
    await userEvent.selectOptions(
      within(dialog).getByLabelText(/^Department/),
      "d-eng",
    );
    await userEvent.selectOptions(
      within(dialog).getByLabelText("Add this department's people as"),
      "READ",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Create program" }),
    );
    await waitFor(() => expect(actions.addDepartment).toHaveBeenCalled());
    const [program, department, level, ids] = actions.addDepartment.mock
      .calls[0]! as unknown as [
      { id: string },
      { id: string },
      string,
      string[],
    ];
    expect(program.id).toBe("pg-new");
    expect(department.id).toBe("d-eng");
    expect(level).toBe("READ");
    /* The lead is p-05, who is not in Engineering; all three of its people are added. */
    expect([...ids].sort()).toEqual(["p-01", "p-03", "p-09"]);
  });

  it("shows a name somebody has beside the name, not in a toast", async () => {
    actions.createProgram.mockResolvedValueOnce({
      ok: false,
      message: "Another program is already called Operations.",
      error: new Error("x"),
    } as never);
    const dialog = await open();
    await userEvent.type(within(dialog).getByLabelText(/^Name/), "Operations");
    await userEvent.selectOptions(
      within(dialog).getByLabelText(/^Department/),
      "d-eng",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Create program" }),
    );
    expect(
      await within(dialog).findByText(
        "Another program is already called Operations.",
      ),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------ the page -- */

describe("a program's page", () => {
  it("names the row of tabs, so it is not a second unnamed navigation", () => {
    who = WHO.lead;
    render(<ProgramScreen id="pg-ops" />);
    const named = screen.getByRole("navigation", {
      name: "Operations sections",
    });
    expect(
      within(named).getByRole("link", { name: "Board" }),
    ).toBeInTheDocument();
    /* Every navigation on the page has a name. */
    for (const nav of screen.getAllByRole("navigation")) {
      expect(nav).toHaveAccessibleName();
    }
  });

  it("keeps the way back, and the colour swatches, 40px or more on a phone", () => {
    who = WHO.lead;
    search = new URLSearchParams("view=settings");
    render(<ProgramScreen id="pg-ops" />);
    expect(screen.getByRole("link", { name: /^Back to / }).className).toContain(
      "min-h-10",
    );
    const swatch = screen.getAllByRole("radio")[0]!;
    expect(swatch.className).toContain("max-sm:size-10");
  });

  it("offers its lead every tab", () => {
    who = WHO.lead;
    render(<ProgramScreen id="pg-ops" />);
    expect(tabs()).toEqual([
      "Overview",
      "Projects",
      "Board",
      "Tasks",
      "Workload",
      "Timeline",
      "People & access",
      "Settings",
    ]);
  });

  it("leaves People & access and Settings off for a reader, and says what they have", () => {
    who = WHO.read;
    render(<ProgramScreen id="pg-ops" />);
    expect(tabs()).not.toContain("People & access");
    expect(tabs()).not.toContain("Settings");
    expect(
      screen.getByText(
        "You can read this program, but you can't change it. Ask its lead for read and write access.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "New project" }),
    ).not.toBeInTheDocument();
  });

  it("gives read and write people the work tabs but not the management ones", () => {
    who = WHO.write;
    render(<ProgramScreen id="pg-ops" />);
    expect(tabs()).toEqual([
      "Overview",
      "Projects",
      "Board",
      "Tasks",
      "Workload",
      "Timeline",
    ]);
    expect(
      screen.queryByText(/but you can't change it/),
    ).not.toBeInTheDocument();
  });

  it("says a project-only member sees what they are on and no more", () => {
    who = WHO.projectOnly;
    render(<ProgramScreen id="pg-ops" />);
    expect(
      screen.getByText(
        /You can see the tasks and projects you are on in this program/,
      ),
    ).toBeInTheDocument();
  });

  it("shows the four tiles from the rollup", () => {
    who = WHO.lead;
    render(<ProgramScreen id="pg-ops" />);
    for (const label of [
      "Open",
      "Overdue",
      "Due this week",
      "Done this week",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    /* However many tasks the demo's two Operations projects hold. */
    const total = programRollup(scene, viewerOf(WHO.lead), "pg-ops", NOW)!
      .totals.total;
    expect(
      screen.getByText(new RegExp(`of ${total} tasks`)),
    ).toBeInTheDocument();
  });

  it("lists a project-only member's one project, and not its sibling", () => {
    who = WHO.projectOnly;
    render(<ProgramScreen id="pg-ops" />);
    expect(screen.getByText("Content calendar")).toBeInTheDocument();
    expect(screen.queryByText("HR onboarding")).not.toBeInTheDocument();
  });

  it("falls back to the Overview for a tab the person is not offered", () => {
    who = WHO.read;
    search = new URLSearchParams("view=people");
    render(<ProgramScreen id="pg-ops" />);
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(
      screen.queryByText("What each level can do"),
    ).not.toBeInTheDocument();
  });

  it("opens the tab the address names, for somebody who is offered it", () => {
    who = WHO.lead;
    search = new URLSearchParams("view=board");
    render(<ProgramScreen id="pg-ops" />);
    expect(
      screen.getByRole("region", { name: "Not started" }),
    ).toBeInTheDocument();
  });

  it("says a program is not here for somebody who cannot see it, as for one that is gone", () => {
    who = WHO.outsider;
    render(<ProgramScreen id="pg-ops" />);
    expect(screen.getByText("This program is not here")).toBeInTheDocument();
  });

  it("opens the bucket of projects in no program for a manager of one", () => {
    who = WHO.hr;
    render(<ProgramScreen id="unassigned" />);
    expect(
      screen.getByRole("heading", { name: "Unassigned" }),
    ).toBeInTheDocument();
    expect(tabs()).not.toContain("People & access");
    expect(tabs()).not.toContain("Settings");
    expect(screen.getByText("Office move")).toBeInTheDocument();
    expect(screen.queryByText("Content calendar")).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------- people & access -- */

describe("People & access", () => {
  const open = () => {
    who = WHO.lead;
    search = new URLSearchParams("view=people");
    render(<ProgramScreen id="pg-ops" />);
  };

  it("draws fifty people at a time, with a search over all of them", async () => {
    crowd = 400;
    open();
    const rows = () =>
      screen.getAllByRole("combobox", { name: /^Access for / });
    expect(rows()).toHaveLength(50);
    expect(screen.getByText("Showing 50 of 400 people")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(rows()).toHaveLength(100);
    /* The search looks through everybody, not only who is drawn. */
    await userEvent.type(
      screen.getByLabelText("Search the people with access"),
      "Person 399",
    );
    expect(rows()).toHaveLength(1);
    expect(
      screen.getByRole("combobox", { name: "Access for Person 399" }),
    ).toBeInTheDocument();
    await userEvent.clear(
      screen.getByLabelText("Search the people with access"),
    );
    await userEvent.type(
      screen.getByLabelText("Search the people with access"),
      "nobody called this",
    );
    expect(screen.getByText("Nobody matches that search.")).toBeInTheDocument();
  });

  it("keeps Remove 40px tall on a phone", () => {
    open();
    const remove = screen.getAllByRole("button", { name: /^Remove / })[0]!;
    expect(remove.className).toContain("max-sm:h-10");
  });

  it("offers no search and no footer for a small list", () => {
    crowd = 12;
    open();
    expect(
      screen.getAllByRole("combobox", { name: /^Access for / }),
    ).toHaveLength(12);
    expect(
      screen.queryByLabelText("Search the people with access"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
  });

  it("says what each level can do, in one plain sentence each", () => {
    open();
    expect(screen.getByText("What each level can do")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Can see every project, task and comment in it\. Cannot change anything\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Manages the program/)).toBeInTheDocument();
  });

  it("lists the lead and everybody with a level", () => {
    open();
    const list = screen
      .getByText("People with access")
      .closest("section, div")!;
    expect(screen.getByLabelText("Access for Grace Effiong")).toHaveValue(
      "WRITE",
    );
    expect(screen.getByLabelText("Access for Musa Ibrahim")).toHaveValue(
      "READ",
    );
    expect(list).toBeInTheDocument();
    expect(screen.getByText("Leads this program")).toBeInTheDocument();
  });

  it("changes a level at once, naming the person and the program", async () => {
    open();
    await userEvent.selectOptions(
      screen.getByLabelText("Access for Musa Ibrahim"),
      "WRITE",
    );
    expect(actions.setLevel).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pg-ops" }),
      { employeeId: "p-07", name: "Musa Ibrahim" },
      "WRITE",
    );
  });

  it("asks before it removes somebody, and says what that means", async () => {
    open();
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Musa Ibrahim" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Remove Musa Ibrahim?");
    expect(dialog).toHaveTextContent("unless they are a member of one");
    expect(actions.removePerson).not.toHaveBeenCalled();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Remove" }),
    );
    await waitFor(() =>
      expect(actions.removePerson).toHaveBeenCalledWith(
        expect.objectContaining({ id: "pg-ops" }),
        { employeeId: "p-07", name: "Musa Ibrahim" },
      ),
    );
  });

  it("adds a person at the level chosen, and leaves the lead and people already on it out of the choices", async () => {
    open();
    const picker = screen.getByLabelText("Person to add");
    const choices = within(picker)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(choices).not.toContain("Halima Sani");
    expect(choices).not.toContain("Musa Ibrahim");
    await userEvent.selectOptions(picker, "p-03");
    await userEvent.click(screen.getByRole("button", { name: "Add person" }));
    await waitFor(() =>
      expect(actions.addPeople).toHaveBeenCalledWith(
        expect.objectContaining({ id: "pg-ops" }),
        ["p-03"],
        "READ",
      ),
    );
  });

  it("adds a whole department with a level, and says who is not added later", async () => {
    open();
    expect(
      screen.getByText(
        /People who join the department later are not added automatically/,
      ),
    ).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Department"), "d-eng");
    await userEvent.selectOptions(
      screen.getAllByLabelText("Access")[1]!,
      "WRITE",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Add department" }),
    );
    await waitFor(() => expect(actions.addDepartment).toHaveBeenCalled());
    const call = actions.addDepartment.mock.calls[0]! as unknown as [
      { id: string },
      { id: string },
      string,
      string[],
    ];
    expect(call[1].id).toBe("d-eng");
    expect(call[2]).toBe("WRITE");
    expect([...call[3]].sort()).toEqual(["p-01", "p-03", "p-09"]);
  });
});

/* ---------------------------------------------------------------- settings -- */

describe("Program settings", () => {
  const open = () => {
    who = WHO.lead;
    search = new URLSearchParams("view=settings");
    render(<ProgramScreen id="pg-ops" />);
  };

  it("has nothing to save until something changes, then saves only what changed", async () => {
    open();
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();
    const name = screen.getByLabelText(/^Name/);
    await userEvent.clear(name);
    await userEvent.type(name, "Ops and people");
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await waitFor(() => expect(actions.updateProgram).toHaveBeenCalled());
    expect(actions.updateProgram.mock.calls[0]![1]).toEqual({
      name: "Ops and people",
    });
  });

  it("says the department link grants nothing", () => {
    open();
    expect(
      screen.getByText(/It gives nobody access by itself/),
    ).toBeInTheDocument();
  });

  it("asks before archiving, and says everybody keeps their access", async () => {
    open();
    await userEvent.click(
      screen.getByRole("button", { name: "Archive program" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Archive Operations?");
    expect(dialog).toHaveTextContent("Everybody keeps the access they have");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Archive program" }),
    );
    await waitFor(() =>
      expect(actions.archiveProgram).toHaveBeenCalledWith(
        expect.objectContaining({ id: "pg-ops" }),
        true,
      ),
    );
  });
});

void actorOf;
void programHooks;
