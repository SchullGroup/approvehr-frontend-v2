import { describe, expect, it } from "vitest";
import {
  NAV,
  moduleBlock,
  visibleNav,
  type NavGroup,
  type NavItem,
} from "@/components/portal/nav";
import {
  KEYWORD_KEYS,
  ROOT,
  SECTION_KEYS,
  buildSidebar,
  destinations,
  findDestinations,
  highlight,
  locate,
  tokensOf,
} from "@/components/portal/sidebar-model";
import { withPrograms } from "@/components/portal/programs-nav";
import { RETIRED_WORDS } from "@/lib/projects/retired-words";
import { PERSONAS, groupsFor } from "./sidebar-personas";

/**
 * The sidebar's shape and its search, as plain functions: no rendering, no
 * hooks. The behaviour tests press the real component; these hold the rules
 * it is built from, and the two lists that are written by hand.
 */

const item = (label: string, extra: Partial<NavItem> = {}): NavItem => ({
  href: `/${label.toLowerCase().replace(/\W+/g, "-")}`,
  label,
  icon: null,
  ...extra,
});

const moduleGroup = (
  id: string,
  heading: string,
  items: NavItem[],
): NavGroup => ({
  id,
  heading,
  billingModule: "CORE_HR",
  items,
});

describe("the model's own groups", () => {
  it("gives every group a unique id, and every headed group an icon for its row", () => {
    const ids = NAV.map((group) => group.id);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const group of NAV) {
      if (group.heading) expect(group.icon, group.heading).toBeTruthy();
    }
  });

  it("files every company-wide door under Reports or Settings, and none under neither", () => {
    const company = NAV.filter(
      (g) => g.heading && !g.billingModule && g.zone !== "modules",
    );
    expect(company.map((g) => g.id)).toEqual(["reports", "settings"]);
    expect(company.flatMap((g) => g.items.map((i) => i.href))).toEqual([
      "/reports",
      "/reports/company",
      "/settings",
      "/settings/roles",
    ]);
  });

  it("files Projects and Wellness with the modules, after every module that works and before the company's", () => {
    expect(NAV.map((group) => group.id)).toEqual([
      "home",
      "core-hr",
      "payroll",
      "hiring",
      "time",
      "performance",
      "desk",
      "projects",
      "wellness",
      "reports",
      "settings",
    ]);
    for (const id of ["projects", "wellness"]) {
      const group = NAV.find((g) => g.id === id)!;
      expect(group.zone, id).toBe("modules");
      expect(group.billingModule, id).toBeUndefined();
    }
  });

  it("keeps Wellness to one door, so it draws as a plain link and Projects as a row that opens", () => {
    expect(NAV.find((g) => g.id === "wellness")!.items).toHaveLength(1);
    expect(NAV.find((g) => g.id === "projects")!.items.length).toBeGreaterThan(
      1,
    );
  });

  it("lists each destination once, so two rows can never light up together", () => {
    const hrefs = NAV.flatMap((g) => g.items.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("holds every synonym key to a group or door that exists", () => {
    /* The program rows are made at run time, so the doors are the static ones
       plus what a company with programs adds. */
    const doors = new Set(
      withPrograms(
        NAV,
        {
          programs: [
            {
              id: "p1",
              name: "Operations",
              color: "#000000",
              openTaskCount: 1,
            },
          ],
          canCreate: true,
          seesAll: true,
          unassigned: true,
          loaded: true,
        },
        { programId: null, hint: null },
      ).flatMap((g) => [g.id!, ...g.items.map((i) => `${g.id}/${i.label}`)]),
    );
    for (const key of KEYWORD_KEYS) {
      expect(doors.has(key), `synonyms for "${key}" point at nothing`).toBe(
        true,
      );
    }
  });

  it("holds every section key to a door that exists", () => {
    const doors = new Set(
      NAV.flatMap((g) => g.items.map((i) => `${g.id}/${i.label}`)),
    );
    for (const key of SECTION_KEYS) {
      expect(doors.has(key), `section for "${key}" points at nothing`).toBe(
        true,
      );
    }
  });
});

describe("buildSidebar", () => {
  it("makes unheaded items links, a lone item a link, and several items a row that opens", () => {
    const tree = buildSidebar([
      { id: "home", items: [item("Home"), item("Inbox")] },
      moduleGroup("one", "One", [item("Only")]),
      moduleGroup("many", "Many", [item("A"), item("B")]),
    ]);
    expect(tree.map((block) => block.map((e) => `${e.kind}:${e.key}`))).toEqual(
      [
        ["link:link:home/Home", "link:link:home/Inbox"],
        ["link:link:one/Only", "drill:drill:many"],
      ],
    );
  });

  it("names a lone item's link for the item and remembers the group for Find", () => {
    const [block] = buildSidebar([
      moduleGroup("hiring", "Recruitment", [item("My interviews")]),
    ]);
    const entry = block![0]!;
    expect(entry.kind).toBe("link");
    if (entry.kind === "link") {
      expect(entry.item.label).toBe("My interviews");
      expect(entry.groupLabel).toBe("Recruitment");
    }
  });

  it("separates the modules from the company's groups by whether they are sold", () => {
    const tree = buildSidebar([
      moduleGroup("a", "A", [item("A1"), item("A2")]),
      { id: "settings", heading: "Settings", items: [item("S1"), item("S2")] },
    ]);
    expect(tree).toHaveLength(2);
  });

  it("files a group that says zone modules with the modules, though nothing sells it", () => {
    const tree = buildSidebar([
      { id: "home", items: [item("Home")] },
      moduleGroup("a", "A", [item("A1"), item("A2")]),
      { id: "extra", heading: "Extra", zone: "modules", items: [item("X")] },
      { id: "settings", heading: "Settings", items: [item("S1"), item("S2")] },
    ]);
    expect(tree.map((block) => block.map((e) => e.key))).toEqual([
      ["link:home/Home"],
      ["drill:a", "link:extra/X"],
      ["drill:settings"],
    ]);
  });

  it("gives a lone door named like its group no context line for Find to repeat", () => {
    const [block] = buildSidebar([
      {
        id: "wellness",
        heading: "Wellness",
        zone: "modules",
        items: [item("Wellness")],
      },
    ]);
    const entry = block![0]!;
    expect(entry.kind === "link" && entry.groupLabel).toBeNull();
    const found = findDestinations([block!], "well");
    expect(found.map((f) => f.groupLabel)).toEqual([null]);
  });

  it("skips a group with nothing in it rather than drawing an empty row", () => {
    expect(buildSidebar([moduleGroup("a", "A", [])])).toEqual([]);
  });

  it("calls a group locked only when every item in it is", () => {
    const [block] = buildSidebar([
      moduleGroup("a", "A", [
        item("A1", { locked: true }),
        item("A2", { locked: true }),
      ]),
      moduleGroup("b", "B", [item("B1", { locked: true }), item("B2")]),
    ]);
    const drills = block!.flatMap((e) => (e.kind === "drill" ? [e] : []));
    expect(drills.map((d) => d.locked)).toEqual([true, false]);
  });

  it("falls back to a slug of the heading when a group has no id", () => {
    const [block] = buildSidebar([
      { heading: "Time & Leave", items: [item("A"), item("B")] },
    ]);
    expect(block![0]!.key).toBe("drill:time-leave");
  });
});

describe("sections", () => {
  const core = (labels: string[]) =>
    buildSidebar([
      moduleGroup(
        "core-hr",
        "Core HR",
        labels.map((label) => item(label)),
      ),
    ])[0]![0]!;

  it("labels a long level that falls under more than one heading", () => {
    const entry = core([
      "Employees",
      "Departments",
      "Org chart",
      "Onboarding",
      "Probation",
      "Promotions",
      "Exit management",
      "Documents",
    ]);
    expect(
      entry.kind === "drill" && entry.sections.map((s) => s.label),
    ).toEqual(["People", "Lifecycle", "Records"]);
  });

  it("leaves a short level unlabelled", () => {
    const entry = core(["Employees", "Onboarding", "Documents"]);
    expect(entry.kind === "drill" && entry.sections).toHaveLength(1);
    expect(entry.kind === "drill" && entry.sections[0]!.label).toBeNull();
  });

  it("files a screen nobody has classified under the heading before it, and never loses it", () => {
    const labels = [
      "Employees",
      "Departments",
      "Org chart",
      "Onboarding",
      "Probation",
      "Promotions",
      "Exit management",
      "Documents",
      "Brand new screen",
    ];
    const entry = core(labels);
    if (entry.kind !== "drill") throw new Error("expected a row that opens");
    const records = entry.sections.find((s) => s.label === "Records")!;
    expect(records.items.map((i) => i.label)).toContain("Brand new screen");
    expect(
      entry.sections
        .flatMap((s) => s.items)
        .map((i) => i.label)
        .sort(),
    ).toEqual([...labels].sort());
  });
});

/**
 * Projects and Wellness are in the modules block, not the personal one at the top.
 *
 * Written from the top level as a person sees it: the rows of each block, a row
 * that opens marked with a plus. Each expectation is typed by hand, so a reorder
 * in `NAV` shows up as a failing list rather than being read back from itself.
 */
describe("Projects and Wellness among the modules", () => {
  const persona = (name: string) => PERSONAS.find((p) => p.name === name)!;
  const rowsOf = (groups: NavGroup[]) =>
    buildSidebar(groups).map((block) =>
      block.map((e) => (e.kind === "link" ? e.item.label : `${e.label}+`)),
    );
  const MODULES_ROWS = [
    "Core HR+",
    "Payroll+",
    "Time & Leave+",
    "Performance+",
    "Employee Support+",
    "Projects+",
    "Wellness",
  ];

  it("keeps the first block to Home, My approvals and Assistant, for everybody who has them", () => {
    for (const who of PERSONAS) {
      const [first] = rowsOf(groupsFor(who));
      expect(first, who.name).not.toContain("Projects+");
      expect(first, who.name).not.toContain("Wellness");
      expect(
        first!.every((label) =>
          ["Home", "My approvals", "Assistant"].includes(label),
        ),
        who.name,
      ).toBe(true);
    }
  });

  it("draws a plain employee's top level in one stable order", () => {
    expect(rowsOf(groupsFor(persona("employee")))).toEqual([
      ["Home", "My approvals", "Assistant"],
      MODULES_ROWS,
    ]);
  });

  it("draws a line manager's the same way, with Recruitment between Payroll and Time & Leave", () => {
    expect(rowsOf(groupsFor(persona("line manager")))).toEqual([
      ["Home", "My approvals", "Assistant"],
      [
        "Core HR+",
        "Payroll+",
        "Recruitment+",
        "Time & Leave+",
        "Performance+",
        "Employee Support+",
        "Projects+",
        "Wellness",
      ],
    ]);
  });

  it("draws HR's with Projects and Wellness after the last module and above Reports and Settings", () => {
    expect(rowsOf(groupsFor(persona("HR manager")))).toEqual([
      ["Home", "My approvals", "Assistant"],
      [
        "Core HR+",
        "Payroll+",
        "Recruitment+",
        "Time & Leave+",
        "Performance+",
        "Employee Support+",
        "Projects+",
        "Wellness",
      ],
      ["Reports+", "Settings"],
    ]);
  });

  it("opens Projects and goes straight to Wellness", () => {
    const [, block] = buildSidebar(groupsFor(persona("employee")));
    const kinds = Object.fromEntries(
      block!.map((e) => [e.kind === "link" ? e.item.label : e.label, e.kind]),
    );
    expect(kinds["Projects"]).toBe("drill");
    expect(kinds["Wellness"]).toBe("link");
  });

  it("is the same order whoever is looking: Projects, then Wellness, last of the modules", () => {
    const company = new Set(["Reports+", "Reports", "Settings+", "Settings"]);
    for (const who of PERSONAS) {
      const flat = rowsOf(groupsFor(who)).flat();
      const own: string[] = flat.filter(
        (l) => l === "Projects+" || l === "Wellness",
      );
      /* Projects before Wellness, whichever of the two is there. */
      expect(own, who.name).toEqual(
        ["Projects+", "Wellness"].filter((l) => own.includes(l)),
      );
      /* Take away the company's rows and they are the last rows left. */
      const modules = flat.filter((l) => !company.has(l));
      expect(modules.slice(modules.length - own.length), who.name).toEqual(own);
    }
  });

  it("drops Wellness, and nothing else, while the company has it off", () => {
    const base = persona("employee");
    const off = groupsFor({ ...base, features: { wellness: false } });
    const rows = rowsOf(off);
    expect(rows.flat()).not.toContain("Wellness");
    expect(rows).toEqual([
      ["Home", "My approvals", "Assistant"],
      MODULES_ROWS.filter((label) => label !== "Wellness"),
    ]);
    expect(off.some((g) => g.id === "wellness")).toBe(false);
    expect(
      destinations(buildSidebar(off)).some((d) => d.item.href === "/wellness"),
    ).toBe(false);
  });

  it("drops Projects, and nothing else, while the company has it off", () => {
    const base = persona("employee");
    const off = groupsFor({ ...base, features: { projects: false } });
    const rows = rowsOf(off);
    expect(rows.flat()).not.toContain("Projects+");
    expect(rows).toEqual([
      ["Home", "My approvals", "Assistant"],
      MODULES_ROWS.filter((label) => label !== "Projects+"),
    ]);
    expect(
      destinations(buildSidebar(off)).some((d) =>
        d.item.href.startsWith("/projects"),
      ),
    ).toBe(false);
  });

  it("leaves Wellness with no permission to ask for: a person with none sees it when the flag is on", () => {
    const wellness = NAV.find((g) => g.id === "wellness")!.items[0]!;
    expect(wellness.always).toBe(true);
    expect(wellness.permission).toBeUndefined();
    expect(wellness.feature).toBe("wellness");
    const none = visibleNav(NAV, new Set(), { wellness: true });
    expect(none.some((g) => g.id === "wellness")).toBe(true);
  });

  it("finds Wellness by the words people use for it, with no group line under it", () => {
    const tree = buildSidebar(groupsFor(persona("employee")));
    for (const word of ["water", "steps", "kudos", "challenge", "health"]) {
      const [first] = findDestinations(tree, word);
      expect(first?.item.href, word).toBe("/wellness");
      expect(first?.groupLabel, word).toBeNull();
    }
  });
});

describe("moduleBlock", () => {
  const live = (id: string) => moduleGroup(id, id, [item(`${id} one`)]);
  const unbuilt = (id: string) =>
    moduleGroup(id, id, [item(`${id} one`, { soon: true })]);
  const extra: NavGroup = {
    id: "x",
    heading: "X",
    zone: "modules",
    items: [item("X")],
  };

  it("puts the extras after the last module that works and before one that does not", () => {
    const ids = moduleBlock(
      [live("a"), unbuilt("desk"), live("b"), unbuilt("hiring"), live("c")],
      [extra],
    ).map((g) => g.id);
    expect(ids).toEqual(["a", "b", "c", "x", "desk", "hiring"]);
  });

  it("keeps the site's order on both sides", () => {
    const ids = moduleBlock([live("a"), live("b")], [extra]).map((g) => g.id);
    expect(ids).toEqual(["a", "b", "x"]);
  });

  it("does not sink a module with one unbuilt screen among real ones", () => {
    const mixed = moduleGroup("m", "M", [
      item("one"),
      item("two", { soon: true }),
    ]);
    expect(moduleBlock([mixed, live("b")], [extra]).map((g) => g.id)).toEqual([
      "m",
      "b",
      "x",
    ]);
  });
});

describe("locate", () => {
  const groups: NavGroup[] = [
    { id: "home", items: [item("Home", { href: "/dashboard" })] },
    moduleGroup("pay", "Payroll", [
      item("Pay", { href: "/payroll" }),
      item("Loans", { href: "/payroll/loans" }),
    ]),
  ];
  const tree = buildSidebar(groups);

  it("puts a page in the level of the row it belongs to, longest match first", () => {
    expect(locate(tree, groups, "/payroll/loans/abc").level).toBe("pay");
    expect(locate(tree, groups, "/payroll/loans/abc").activeHref).toBe(
      "/payroll/loans",
    );
    expect(locate(tree, groups, "/payroll").activeHref).toBe("/payroll");
  });

  it("lights the one row that owns the page, by its activePrefix when it has one", () => {
    const hiring: NavGroup[] = [
      moduleGroup("hiring", "Recruitment", [
        item("Overview", {
          href: "/hiring",
          activeExcept: ["/hiring/requisitions"],
        }),
        item("New role", { href: "/hiring/requisitions/new" }),
        item("Hiring settings", {
          href: "/hiring/settings/pipelines",
          activePrefix: "/hiring/settings",
        }),
      ]),
    ];
    const t = buildSidebar(hiring);
    const at = (path: string) => locate(t, hiring, path).activeHref;
    expect(at("/hiring/settings/tags")).toBe("/hiring/settings/pipelines");
    expect(at("/hiring/settings/pipelines")).toBe("/hiring/settings/pipelines");
    expect(at("/hiring/requisitions/new")).toBe("/hiring/requisitions/new");
    /* An existing role has no row of its own: nothing lit, not New role. */
    expect(at("/hiring/requisitions/r-1")).toBeNull();
    /* ...but the Recruitment section stays open while reading it. */
    const here = locate(t, hiring, "/hiring/requisitions/r-1");
    expect(here.level).toBe("hiring");
    expect(here.activeHref).toBeNull();
    expect(locate(t, hiring, "/hiring/requisitions/new").level).toBe("hiring");
    expect(at("/hiring")).toBe("/hiring");
    expect(at("/hiring/talent-pool/x")).toBe("/hiring");
  });

  it("lights only Appraisal periods on a period's fairness page", () => {
    const perf: NavGroup[] = [
      moduleGroup("performance", "Performance", [
        item("Overview", { href: "/performance" }),
        item("Appraisal periods", { href: "/performance/periods" }),
      ]),
    ];
    const t = buildSidebar(perf);
    expect(locate(t, perf, "/performance/periods/p1/fairness").activeHref).toBe(
      "/performance/periods",
    );
  });

  it("puts a top-level link at the top level", () => {
    const here = locate(tree, groups, "/dashboard");
    expect(here.level).toBe(ROOT);
    expect(here.entryKey).toBe("link:home/Home");
  });

  it("puts a page that belongs to nothing at the top level, with nothing lit", () => {
    expect(locate(tree, groups, "/profile")).toEqual({
      level: ROOT,
      entryKey: null,
      activeHref: null,
    });
  });

  it("does not let /dashboard claim everything under it", () => {
    expect(locate(tree, groups, "/dashboard/anything").level).toBe(ROOT);
    expect(locate(tree, groups, "/dashboard/anything").activeHref).toBeNull();
  });
});

describe("Find", () => {
  const admin = PERSONAS.find((p) => p.name === "administrator")!;
  const tree = buildSidebar(groupsFor(admin));
  const names = (query: string) =>
    findDestinations(tree, query).map(
      (r) => `${r.groupLabel ?? "Home"} › ${r.item.label}`,
    );

  it("returns nothing for nothing", () => {
    expect(findDestinations(tree, "")).toEqual([]);
    expect(findDestinations(tree, "   ")).toEqual([]);
    expect(findDestinations(tree, "--")).toEqual([]);
  });

  it("ignores case and accents", () => {
    expect(names("PAYSLIPS")[0]).toBe("Payroll › Payslips");
    expect(names("pàyslips")[0]).toBe("Payroll › Payslips");
  });

  it("needs every word to match somewhere on the door", () => {
    expect(names("loans payroll")).toContain("Payroll › Loans");
    expect(names("loans recruitment")).toEqual([]);
  });

  it("ranks an exact label first", () => {
    expect(names("leave")[0]).toBe("Time & Leave › Leave");
    expect(names("kpis")[0]).toBe("Performance › KPIs");
  });

  it("answers the synonyms the brief names", () => {
    expect(names("payslip")[0]).toBe("Payroll › Payslips");
    expect(names("time off")[0]).toBe("Time & Leave › Leave");
    expect(names("hire")[0]).toMatch(/^Recruitment ›/);
    expect(names("laptop")[0]).toBe("Core HR › Equipment");
    expect(names("paye")[0]).toBe("Payroll › Statutory filings");
    expect(names("permissions")[0]).toBe("Settings › Roles");
  });

  it("still finds Projects by the words the module used to speak", () => {
    /* The module says task, cycle, Later and initiative now. Somebody who has
       used a ticket tracker types the old word, and Find still lands on it. */
    for (const old of RETIRED_WORDS) {
      expect(names(old), `"${old}"`).toContain("Projects › All projects");
    }
    expect(names("sprint")[0]).toBe("Projects › All projects");
    expect(names("backlog")[0]).toBe("Projects › All projects");
    expect(names("epic")[0]).toBe("Projects › All projects");
    expect(names("story points")[0]).toBe("Projects › All projects");
  });

  it("finds Projects by the words it speaks now", () => {
    for (const word of ["cycle", "initiative", "problem", "timeline", "task"]) {
      expect(names(word), `"${word}"`).toContain("Projects › All projects");
    }
  });

  it("finds My tasks by the old word for a task", () => {
    expect(names("issues")).toContain("Projects › My tasks");
  });

  it("finds every door in a group by the group's name, label matches first", () => {
    const found = names("recruitment");
    /* Eight doors, and Hired (where an accepted offer lands) is the ninth. */
    expect(found.filter((n) => n.startsWith("Recruitment ›")).length).toBe(9);
  });

  it("finds a door added to a group tomorrow, with no change here", () => {
    const groups = groupsFor(admin).map((g) =>
      g.id === "hiring"
        ? {
            ...g,
            items: [...g.items, item("Hired", { href: "/hiring/hired" })],
          }
        : g,
    );
    const next = buildSidebar(groups);
    expect(destinations(next).some((d) => d.item.label === "Hired")).toBe(true);
    expect(
      findDestinations(next, "hired").some((r) => r.item.label === "Hired"),
    ).toBe(true);
  });

  it("splits what was typed into words, keeping a 1:1", () => {
    expect(tokensOf("  Time-off, please ")).toEqual(["time", "off", "please"]);
    expect(tokensOf("1:1")).toEqual(["1:1"]);
  });
});

describe("highlight", () => {
  it("marks each word that matched, and nothing else", () => {
    expect(highlight("Appraisal periods", ["period"])).toEqual([
      { text: "Appraisal ", hit: false },
      { text: "period", hit: true },
      { text: "s", hit: false },
    ]);
    expect(
      highlight("Time & Leave", ["time", "leave"])
        .filter((r) => r.hit)
        .map((r) => r.text),
    ).toEqual(["Time", "Leave"]);
  });

  it("returns the label whole when nothing matched", () => {
    expect(highlight("Loans", ["zz"])).toEqual([{ text: "Loans", hit: false }]);
    expect(highlight("Loans", [])).toEqual([{ text: "Loans", hit: false }]);
  });
});
