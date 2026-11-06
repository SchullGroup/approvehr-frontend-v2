import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SidebarNav } from "@/components/portal/sidebar";
import { NAV, visibleNav } from "@/components/portal/nav";
import {
  PROGRAM_ROWS,
  listedPrograms,
  programIdOfPath,
  withPrograms,
} from "@/components/portal/programs-nav";
import {
  buildSidebar,
  findDestinations,
  locate,
} from "@/components/portal/sidebar-model";
import { NO_PROGRAMS, type ProgramNavRow } from "@/lib/store/programs";
import {
  NO_BADGES,
  PERSONAS,
  groupsFor,
  type Persona,
} from "./sidebar-personas";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/dashboard",
}));

/**
 * The Projects level of the sidebar, row by row, for the people the programs
 * rules are about. Rendered for real and drilled into, because which rows there
 * are is the whole question.
 *
 * Each expectation is written by hand from the access rules, not read back from
 * the code that builds the rows: the Master view for the Master grant alone,
 * a program for everybody who has it or a project in it, Unassigned for people
 * who manage a project in none, and nothing new for a company with no programs.
 */

const persona = (name: string): Persona => {
  const found = PERSONAS.find((p) => p.name === name);
  if (!found) throw new Error(`no persona ${name}`);
  return found;
};

const labels = (container: HTMLElement) =>
  Array.from(
    container.querySelectorAll('nav[aria-label="Main"] [data-nav-label]'),
  ).map((n) => n.textContent);

const hrefs = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('nav[aria-label="Main"] a[href]')).map(
    (a) => a.getAttribute("href"),
  );

function projectsLevel(who: Persona, pathname = "/dashboard") {
  const utils = render(
    <SidebarNav
      groups={groupsFor(who)}
      pathname={pathname}
      badges={NO_BADGES}
      onNavigate={() => undefined}
    />,
  );
  fireEvent.click(
    utils.container.querySelector('button[data-nav-row="projects"]')!,
  );
  return utils;
}

describe("the rows under Projects, by person", () => {
  const cases: [string, string[]][] = [
    [
      "Master-grant holder",
      [
        "Overview",
        "My tasks",
        "All projects",
        "Operations",
        "Technology",
        "All programs",
      ],
    ],
    [
      "program lead",
      ["My tasks", "Team tasks", "All projects", "Operations", "All programs"],
    ],
    [
      "program read",
      ["My tasks", "All projects", "Operations", "All programs"],
    ],
    [
      "program write",
      ["My tasks", "All projects", "Operations", "All programs"],
    ],
    [
      "project-only member",
      ["My tasks", "All projects", "Technology", "All programs"],
    ],
    [
      "HR with programs",
      [
        "My tasks",
        "Team tasks",
        "All projects",
        "Operations",
        "Technology",
        "All programs",
        "Unassigned",
      ],
    ],
  ];

  it.each(cases)("%s", (name, expected) => {
    const { container } = projectsLevel(persona(name));
    expect(labels(container).filter((l) => l !== "Programs")).toEqual(expected);
  });

  it("labels the programs under a Programs heading", () => {
    const { container } = projectsLevel(persona("program read"));
    const headings = Array.from(
      container.querySelectorAll("[data-nav-section]"),
    ).map((h) => h.getAttribute("data-nav-section"));
    expect(headings).toEqual(["Programs"]);
  });

  it("links each program to its own page, and Unassigned to the bucket", () => {
    const { container } = projectsLevel(persona("HR with programs"));
    expect(hrefs(container)).toEqual([
      "/projects/mine",
      "/projects/team",
      "/projects",
      "/projects/programs/pg-ops",
      "/projects/programs/pg-tech",
      "/projects/programs",
      "/projects/programs/unassigned",
    ]);
  });

  it("shows Overview to the Master grant and to nobody else", () => {
    for (const p of PERSONAS) {
      const has = groupsFor(p)
        .flatMap((g) => g.items)
        .some((i) => i.href === "/projects/master");
      expect(has, p.name).toBe(p.name === "Master-grant holder");
    }
  });

  it("never lists a program the person has no reach into", () => {
    /* Musa reads Operations; Technology is not his and he is on none of it. */
    const found = groupsFor(persona("program read")).flatMap((g) => g.items);
    expect(found.some((i) => i.label === "Technology")).toBe(false);
    expect(found.some((i) => i.label === "Unassigned")).toBe(false);
  });
});

describe("a company with no programs", () => {
  const OLD = ["employee", "line manager", "no staff record"];
  /* HR hold the Team tasks row as well: everybody's finished work is theirs to
     read whether or not anybody reports to them. */
  const HR = ["HR manager", "administrator", "billing-locked company"];

  it.each(OLD)("%s reaches the same Projects doors as before", (name) => {
    const p = persona(name);
    const projects = groupsFor(p).find((g) => g.id === "projects");
    expect(projects?.items.map((i) => i.href)).toEqual([
      "/projects/mine",
      "/projects",
    ]);
  });

  it.each(HR)("%s reaches the same Projects doors, and Team tasks", (name) => {
    const p = persona(name);
    const projects = groupsFor(p).find((g) => g.id === "projects");
    expect(projects?.items.map((i) => i.href)).toEqual([
      "/projects/mine",
      "/projects/team",
      "/projects",
    ]);
  });

  it("is identical to the static rows when there is nothing to add", () => {
    const base = visibleNav(NAV, new Set(), {}, undefined);
    const plain = visibleNav(
      withPrograms(NAV, NO_PROGRAMS, { programId: null, hint: null }),
      new Set(),
      {},
      undefined,
    );
    expect(plain.map((g) => g.items.map((i) => i.href))).toEqual(
      base.map((g) => g.items.map((i) => i.href)),
    );
  });

  it("is absent when the company has switched Projects off", () => {
    const p = persona("company with modules off");
    expect(groupsFor(p).find((g) => g.id === "projects")).toBeUndefined();
  });

  it("offers All programs with none only to somebody who may start one", () => {
    const rows = (canCreate: boolean) =>
      withPrograms(
        NAV,
        { ...NO_PROGRAMS, canCreate, loaded: true },
        { programId: null, hint: null },
      )
        .find((g) => g.id === "projects")!
        .items.map((i) => i.label);
    expect(rows(false)).not.toContain("All programs");
    expect(rows(true)).toContain("All programs");
    expect(rows(true)).not.toContain("Unassigned");
  });
});

describe("where you are", () => {
  const lit = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('[aria-current="page"]')).map(
      (n) => n.querySelector("[data-nav-label]")?.textContent,
    );
  const level = (container: HTMLElement) =>
    container.querySelector("[data-nav-back]")?.textContent ?? "main";

  const open = (who: Persona, pathname: string, hint = false) => {
    const where = {
      programId: programIdOfPath(pathname),
      hint: hint ? { programId: "pg-ops", path: pathname } : null,
    };
    return render(
      <SidebarNav
        groups={groupsFor(who, where)}
        pathname={pathname}
        badges={NO_BADGES}
        onNavigate={() => undefined}
      />,
    );
  };
  const hr = persona("HR with programs");

  it("opens the Projects level on a program's page and lights its row", () => {
    const { container } = open(hr, "/projects/programs/pg-ops");
    expect(level(container)).toBe("Projects");
    expect(lit(container)).toEqual(["Operations"]);
  });

  it("lights the program of a project when the project says which it is in", () => {
    const { container } = open(hr, "/projects/pj-cnt", true);
    expect(level(container)).toBe("Projects");
    expect(lit(container)).toEqual(["Operations"]);
  });

  it("lights All projects on a project with no program", () => {
    const { container } = open(hr, "/projects/pj-off");
    expect(lit(container)).toEqual(["All projects"]);
  });

  it("lights each door on its own page and none of its neighbours", () => {
    const sees = persona("Master-grant holder");
    expect(lit(open(sees, "/projects/master").container)).toEqual(["Overview"]);
  });

  it("lights All programs on the index and Unassigned on the bucket", () => {
    expect(lit(open(hr, "/projects/programs").container)).toEqual([
      "All programs",
    ]);
    const bucket = open(hr, "/projects/programs/unassigned");
    expect(lit(bucket.container)).toEqual(["Unassigned"]);
  });

  it("never lets All projects claim the Master or program pages", () => {
    const tree = buildSidebar(groupsFor(persona("employee")));
    const groups = groupsFor(persona("employee"));
    for (const path of ["/projects/master", "/projects/programs/xyz"]) {
      expect(locate(tree, groups, path).activeHref, path).not.toBe("/projects");
    }
  });

  it("reads the program out of the address", () => {
    expect(programIdOfPath("/projects/programs/abc")).toBe("abc");
    expect(programIdOfPath("/projects/programs/abc?view=board")).toBe("abc");
    expect(programIdOfPath("/projects/programs/unassigned")).toBeNull();
    expect(programIdOfPath("/projects/programs")).toBeNull();
    expect(programIdOfPath("/projects/pj-1")).toBeNull();
  });
});

describe("a company with many programs", () => {
  const many: ProgramNavRow[] = Array.from({ length: 12 }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Program ${String(i + 1).padStart(2, "0")}`,
    color: "#2B3990",
    openTaskCount: i === 11 ? 0 : 100 - i,
  }));

  it("lists the busiest eight, in alphabetical order", () => {
    const shown = listedPrograms(many, null);
    expect(shown).toHaveLength(PROGRAM_ROWS);
    expect(shown.map((p) => p.name)).toEqual(
      [...shown.map((p) => p.name)].sort(),
    );
    expect(shown.some((p) => p.id === "p12")).toBe(false);
  });

  it("always lists the program the person is in, whatever its rank", () => {
    const shown = listedPrograms(many, "p12");
    expect(shown).toHaveLength(PROGRAM_ROWS);
    expect(shown.some((p) => p.id === "p12")).toBe(true);
  });

  it("leaves the rest to All programs and to Find, which still names every one", () => {
    const groups = visibleNav(
      withPrograms(
        NAV,
        { ...NO_PROGRAMS, programs: many, canCreate: true, loaded: true },
        { programId: null, hint: null },
      ),
      new Set(),
      {},
    );
    const { container } = render(
      <SidebarNav
        groups={groups}
        pathname="/dashboard"
        badges={NO_BADGES}
        onNavigate={() => undefined}
      />,
    );
    fireEvent.click(
      container.querySelector('button[data-nav-row="projects"]')!,
    );
    const listed = labels(container).filter((l) => l?.startsWith("Program "));
    expect(listed).toHaveLength(PROGRAM_ROWS);
    expect(labels(container)).toContain("All programs");

    const tree = buildSidebar(groups);
    const found = findDestinations(tree, "Program 12").map((r) => r.item.href);
    expect(found).toContain("/projects/programs/p12");
  });
});

describe("Find", () => {
  const tree = buildSidebar(groupsFor(persona("HR with programs")));
  const first = (query: string) =>
    findDestinations(tree, query)[0]?.item.href ?? null;

  it("finds a program by its name", () => {
    expect(first("operations")).toBe("/projects/programs/pg-ops");
    expect(first("tech")).toBe("/projects/programs/pg-tech");
  });

  it("still lands on the projects list by the words the module used to speak", () => {
    for (const old of ["sprint", "backlog", "epic", "story points"]) {
      expect(first(old), old).toBe("/projects");
    }
  });

  it("finds the Master view by what it is, only for the person who has it", () => {
    expect(first("master")).not.toBe("/projects/master");
    const sees = buildSidebar(groupsFor(persona("Master-grant holder")));
    expect(findDestinations(sees, "master")[0]?.item.href).toBe(
      "/projects/master",
    );
  });
});

describe("the doors each person reaches, against what the rules allow", () => {
  const programHrefs = (name: string) =>
    groupsFor(persona(name))
      .flatMap((g) => g.items)
      .map((i) => i.href)
      .filter((h) => h.startsWith("/projects/programs/"))
      .sort();

  it("is exactly the programs the access rules give each person", () => {
    expect(programHrefs("Master-grant holder")).toEqual([
      "/projects/programs/pg-ops",
      "/projects/programs/pg-tech",
    ]);
    expect(programHrefs("program lead")).toEqual(["/projects/programs/pg-ops"]);
    expect(programHrefs("program read")).toEqual(["/projects/programs/pg-ops"]);
    expect(programHrefs("program write")).toEqual([
      "/projects/programs/pg-ops",
    ]);
    expect(programHrefs("project-only member")).toEqual([
      "/projects/programs/pg-tech",
    ]);
    expect(programHrefs("HR with programs")).toEqual([
      "/projects/programs/pg-ops",
      "/projects/programs/pg-tech",
      "/projects/programs/unassigned",
    ]);
  });
});
