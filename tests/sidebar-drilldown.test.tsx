import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarNav } from "@/components/portal/sidebar";
import type { BadgeSource, NavGroup } from "@/components/portal/nav";
import { TOUR_STEPS } from "@/components/portal/tour/guided-tour";
import {
  NO_BADGES,
  PERSONAS,
  groupsFor,
  type Persona,
} from "./sidebar-personas";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/profile",
}));

/**
 * The sidebar as a person uses it: look at the top level, open a section, go
 * back, find something by typing. Rendered for real and pressed, because the
 * ways this can go wrong are all about *state* — which level is showing, where
 * focus went, what Esc did — and none of that is visible in the source.
 */

const persona = (name: string): Persona => {
  const found = PERSONAS.find((p) => p.name === name);
  if (!found) throw new Error(`no persona ${name}`);
  return found;
};
const admin = persona("administrator");
const hr = persona("HR manager");
const employee = persona("employee");
const panelist = persona("panelist");

type Options = {
  pathname?: string;
  badges?: Partial<Record<BadgeSource, number>>;
  variant?: "desktop" | "drawer";
  groups?: NavGroup[];
};

function setup(who: Persona, options: Options = {}) {
  const groups = options.groups ?? groupsFor(who);
  const badges = { ...NO_BADGES, ...options.badges };
  const onNavigate = vi.fn();
  const onSearchPeople = vi.fn();
  const onClose = vi.fn();
  const ui = (pathname: string) => (
    <SidebarNav
      groups={groups}
      pathname={pathname}
      badges={badges}
      onNavigate={onNavigate}
      onSearchPeople={onSearchPeople}
      onClose={onClose}
      variant={options.variant ?? "desktop"}
    />
  );
  const utils = render(ui(options.pathname ?? "/profile"));
  return {
    ...utils,
    onNavigate,
    onSearchPeople,
    onClose,
    user: userEvent.setup(),
    go: (pathname: string) => utils.rerender(ui(pathname)),
  };
}

const nav = () => screen.getByRole("navigation", { name: "Main" });
const labels = () =>
  Array.from(nav().querySelectorAll("[data-nav-label]")).map(
    (node) => node.textContent,
  );
const findBox = () => screen.getByRole("combobox", { name: "Find a page" });
const row = (id: string) =>
  nav().querySelector<HTMLElement>(`button[data-nav-row="${id}"]`)!;
/* The section title is the label on the back row (one button, not a button and a
   heading), so "which section am I in" reads that row's text. */
const heading = () =>
  nav().querySelector("[data-nav-back]")?.textContent ?? null;
const current = () =>
  Array.from(nav().querySelectorAll('[aria-current="page"]')).map(
    (node) => node.querySelector("[data-nav-label]")?.textContent,
  );
const options = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).map(
    (node) => node.getAttribute("aria-label") ?? node.textContent ?? "",
  );

function stubMedia(reduce: boolean, desktop = true) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion")
        ? reduce
        : query.includes("min-width")
          ? desktop
          : false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

afterEach(() => {
  push.mockClear();
  // @ts-expect-error -- jsdom has no matchMedia; remove the stub again.
  delete window.matchMedia;
});

/* -------------------------------------------------------------------------- */

describe("the top level", () => {
  it("is short, with the module rows in the site's own order", () => {
    setup(admin);
    expect(labels()).toEqual([
      "Home",
      "My approvals",
      "Assistant",
      "Projects",
      "My tasks",
      "Wellness",
      "Core HR",
      "Payroll",
      "Recruitment",
      "Time & Leave",
      "Performance",
      "Employee Support",
      "Reports",
      "Settings",
    ]);
  });

  it("puts a chevron on the rows that open and none on the ones that go", () => {
    setup(admin);
    const buttons = Array.from(
      nav().querySelectorAll("button[data-nav-row]"),
    ).map((b) => b.querySelector("[data-nav-label]")?.textContent);
    expect(buttons).toEqual([
      "Core HR",
      "Payroll",
      "Recruitment",
      "Time & Leave",
      "Performance",
      "Employee Support",
      "Reports",
      "Settings",
    ]);
    const links = Array.from(nav().querySelectorAll("a[href]")).map(
      (a) => a.querySelector("[data-nav-label]")?.textContent,
    );
    expect(links).toEqual([
      "Home",
      "My approvals",
      "Assistant",
      "Projects",
      "My tasks",
      "Wellness",
    ]);
    /* A row that opens is a button and is never also a link. */
    expect(
      nav().querySelectorAll("a[href] svg.lucide-chevron-right"),
    ).toHaveLength(0);
  });

  it("makes a group with one visible item a plain link, named for the item", () => {
    setup(panelist);
    const names = labels();
    expect(names).toContain("My interviews");
    expect(names).not.toContain("Recruitment");
    const link = screen.getByRole("link", { name: "My interviews" });
    expect(link).toHaveAttribute("href", "/hiring/my-interviews");
    expect(row("hiring")).toBeNull();
  });

  it("shows an employee no Reports at all: Company reports is absent, not refused", () => {
    setup(employee);
    expect(screen.queryByRole("link", { name: "Company reports" })).toBeNull();
    expect(row("reports")).toBeNull();
  });

  it("gives an administrator Company reports under a Reports row", () => {
    setup(admin);
    expect(row("reports")).not.toBeNull();
  });

  it("keeps the blocks apart with a hairline: yours, the modules, the company's", () => {
    setup(admin);
    const blocks = nav().querySelectorAll(":scope > div > div");
    expect(blocks).toHaveLength(3);
    expect(blocks[1]!.className).toContain("border-t");
    expect(blocks[0]!.className).not.toContain("border-t");
  });

  it("is a labelled navigation landmark with Find in its own search landmark", () => {
    setup(admin);
    expect(
      screen.getByRole("navigation", { name: "Main" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("search")).toContainElement(findBox());
  });
});

/* -------------------------------------------------------------------------- */

describe("drilling in and back", () => {
  it("replaces the whole list with the section's, under a back control", async () => {
    const { user } = setup(admin);
    await user.click(row("payroll"));
    expect(heading()).toBe("Payroll");
    expect(labels()).toEqual([
      "Monthly payroll",
      "Pay setup",
      "Statutory filings",
      "Payslips",
      "Loans",
      "Pay early",
      "Expenses",
      "Wallet",
      "Payment history",
    ]);
    expect(
      screen.getByRole("button", { name: /back to main menu/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Home" })).toBeNull();
  });

  it("files a long level under small headings, and a short one under none", async () => {
    const { user } = setup(admin);
    await user.click(row("core-hr"));
    expect(
      Array.from(nav().querySelectorAll("h3")).map((h) => h.textContent),
    ).toEqual(["People", "Lifecycle", "Engagement", "Records"]);
    await user.click(
      screen.getByRole("button", { name: /back to main menu/i }),
    );
    await user.click(row("desk"));
    expect(nav().querySelectorAll("h3")).toHaveLength(0);
  });

  it("goes back without going anywhere", async () => {
    const { user, onNavigate } = setup(admin);
    await user.click(row("payroll"));
    await user.click(
      screen.getByRole("button", { name: /back to main menu/i }),
    );
    expect(heading()).toBeNull();
    expect(labels()[0]).toBe("Home");
    expect(push).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("moves focus into the new level, and back onto the row it came from", async () => {
    const { user } = setup(admin);
    row("performance").focus();
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("button", { name: /back to main menu/i }),
    ).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(row("performance")).toHaveFocus();
  });

  it("goes back one level on Escape when focus is in the nav", async () => {
    const { user } = setup(admin);
    await user.click(row("time"));
    expect(heading()).toBe("Time & Leave");
    await user.keyboard("{Escape}");
    expect(heading()).toBeNull();
    expect(row("time")).toHaveFocus();
  });

  it("announces the level it is on", async () => {
    const { user } = setup(admin);
    const live = () => document.querySelector("[aria-live]")?.textContent;
    expect(live()).toBe("Main menu");
    await user.click(row("hiring"));
    expect(live()).toBe("Recruitment menu");
    await user.click(
      screen.getByRole("button", { name: /back to main menu/i }),
    );
    expect(live()).toBe("Main menu");
  });

  it("is a button with no destination of its own", async () => {
    setup(admin);
    const button = row("payroll");
    expect(button.tagName).toBe("BUTTON");
    expect(button).not.toHaveAttribute("href");
    expect(button).toHaveAccessibleName(/^Payroll/);
  });
});

/* -------------------------------------------------------------------------- */

describe("knowing where you are", () => {
  it("opens a deep link on the right level with the right row lit", () => {
    setup(admin, { pathname: "/hiring/offers" });
    expect(heading()).toBe("Recruitment");
    expect(current()).toEqual(["Offers"]);
  });

  it("lights the longest match, not every ancestor", () => {
    setup(admin, { pathname: "/hiring/postings/applications" });
    expect(current()).toEqual(["Applications"]);
  });

  it("opens a record page on the directory it belongs to", () => {
    setup(admin, { pathname: "/people/p-01" });
    expect(heading()).toBe("Core HR");
    expect(current()).toEqual(["Employees"]);
  });

  it("opens on the top level for a page that belongs to no row", () => {
    setup(admin, { pathname: "/profile" });
    expect(heading()).toBeNull();
    expect(current()).toEqual([]);
    setup(admin, { pathname: "/notifications" });
  });

  it("lights a top-level link when the page is one", () => {
    setup(admin, { pathname: "/approvals" });
    expect(heading()).toBeNull();
    expect(current()).toEqual(["My approvals"]);
  });

  it("marks the row the page is inside, once you are back at the top", async () => {
    const { user } = setup(admin, { pathname: "/payroll/loans" });
    expect(heading()).toBe("Payroll");
    await user.click(
      screen.getByRole("button", { name: /back to main menu/i }),
    );
    expect(row("payroll")).toHaveAttribute("aria-current", "true");
    expect(row("payroll")).toHaveAttribute("data-current", "true");
    expect(row("hiring")).not.toHaveAttribute("aria-current");
    /* Never two pages at once. */
    expect(current()).toEqual([]);
  });

  it("follows the route when it changes: a link, back, forward", () => {
    const { go } = setup(admin, { pathname: "/payroll/loans" });
    expect(heading()).toBe("Payroll");
    go("/people/leave");
    expect(heading()).toBe("Time & Leave");
    expect(current()).toEqual(["Leave"]);
    go("/dashboard");
    expect(heading()).toBeNull();
    expect(current()).toEqual(["Home"]);
    go("/payroll/loans");
    expect(heading()).toBe("Payroll");
    expect(current()).toEqual(["Loans"]);
  });

  it("keeps your own choice for the page you made it on, and lets the route win after", async () => {
    const { user, go } = setup(admin, { pathname: "/people/leave" });
    await user.click(
      screen.getByRole("button", { name: /back to main menu/i }),
    );
    go("/people/leave");
    expect(heading()).toBeNull();
    go("/payroll");
    expect(heading()).toBe("Payroll");
  });

  it("lets you open a section other than the one the page is in", async () => {
    const { user } = setup(admin, { pathname: "/people/leave" });
    await user.click(
      screen.getByRole("button", { name: /back to main menu/i }),
    );
    await user.click(row("payroll"));
    expect(heading()).toBe("Payroll");
    expect(current()).toEqual([]);
  });

  it("never lights a locked row, though they all point at the same page", () => {
    setup(persona("billing-locked company"), { pathname: "/billing/pay" });
    expect(heading()).toBeNull();
    expect(current()).toEqual([]);
  });

  it("falls back to the top level if the section it was in has gone", () => {
    const groups = groupsFor(admin);
    const { rerender } = render(
      <SidebarNav
        groups={groups}
        pathname="/hiring/offers"
        badges={NO_BADGES}
        onNavigate={() => undefined}
      />,
    );
    expect(heading()).toBe("Recruitment");
    rerender(
      <SidebarNav
        groups={groups.filter((g) => g.id !== "hiring")}
        pathname="/hiring/offers"
        badges={NO_BADGES}
        onNavigate={() => undefined}
      />,
    );
    expect(heading()).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

describe("Find", () => {
  it("matches a label, with the match marked and the group it lives in", async () => {
    const { user } = setup(hr);
    await user.type(findBox(), "loan");
    const first = screen.getAllByRole("option")[0]!;
    expect(first).toHaveAccessibleName("Payroll › Loans");
    expect(first.querySelector("mark")?.textContent).toBe("Loan");
    expect(first).toHaveAttribute("href", "/payroll/loans");
  });

  it("knows other names for a door: time off is Leave, payslip is Payslips", async () => {
    const { user } = setup(hr);
    await user.type(findBox(), "time off");
    expect(options()[0]).toBe("Time & Leave › Leave");
    await user.clear(findBox());
    await user.type(findBox(), "payslip");
    expect(options()[0]).toBe("Payroll › Payslips");
    await user.clear(findBox());
    await user.type(findBox(), "resign");
    expect(options()[0]).toBe("Core HR › Exit management");
  });

  it("finds a whole module by what it is called in the trade: hire finds Recruitment first", async () => {
    const { user } = setup(hr);
    await user.type(findBox(), "hire");
    const found = options();
    expect(found).toContain("Recruitment › Overview");
    expect(found).toContain("Recruitment › Offers");
    /* Every Recruitment door ahead of the one Core HR screen that says "new hire". */
    const lastRecruitment = found
      .map((n) => n.startsWith("Recruitment ›"))
      .lastIndexOf(true);
    const firstOther = found.findIndex((n) => !n.startsWith("Recruitment ›"));
    expect(lastRecruitment).toBeLessThan(firstOther);
  });

  it("matches on a module's name, and every door in it comes back", async () => {
    const { user } = setup(admin);
    await user.type(findBox(), "payroll");
    const found = options().filter((name) => name.startsWith("Payroll ›"));
    expect(found).toHaveLength(9);
  });

  it("puts a label that starts with the word before one that merely has it", async () => {
    const { user } = setup(admin);
    await user.type(findBox(), "pay");
    const found = options();
    expect(found.indexOf("Payroll › Payslips")).toBeLessThan(
      found.indexOf("Payroll › Wallet"),
    );
  });

  it("never offers a door the person does not have", async () => {
    const { user } = setup(employee);
    await user.type(findBox(), "wallet");
    expect(screen.queryByRole("option", { name: /Wallet/ })).toBeNull();
    await user.clear(findBox());
    await user.type(findBox(), "monthly payroll");
    expect(
      screen.queryByRole("option", { name: /Monthly payroll/ }),
    ).toBeNull();
    await user.clear(findBox());
    await user.type(findBox(), "hire");
    expect(screen.queryByRole("option", { name: /Recruitment/ })).toBeNull();
  });

  it("says so, and offers the next thing to try, when nothing matches", async () => {
    const { user, onSearchPeople } = setup(employee);
    await user.type(findBox(), "zzqx");
    expect(screen.getByText(/Nothing here matches/)).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: /Search people for/ }));
    expect(onSearchPeople).toHaveBeenCalledWith("zzqx");
    expect(findBox()).toHaveValue("");
  });

  it("is not a listbox, and points at nothing, when there is nothing to list", async () => {
    const { user, onSearchPeople } = setup(employee);
    await user.type(findBox(), "zzqx");
    expect(findBox()).toHaveAttribute("aria-expanded", "false");
    expect(findBox()).not.toHaveAttribute("aria-controls");
    expect(findBox()).not.toHaveAttribute("aria-activedescendant");
    expect(screen.queryByRole("listbox")).toBeNull();
    /* Enter is still never a dead key: it takes the same words to people. */
    await user.keyboard("{Enter}");
    expect(onSearchPeople).toHaveBeenCalledWith("zzqx");
  });

  it("ends the list with a way to search people for the same words", async () => {
    const { user, onSearchPeople } = setup(hr);
    await user.type(findBox(), "pay");
    const all = screen.getAllByRole("option");
    expect(all[all.length - 1]).toHaveTextContent("Search people for “pay”");
    await user.click(all[all.length - 1]!);
    expect(onSearchPeople).toHaveBeenCalledWith("pay");
  });

  it("opens the first result on Enter", async () => {
    const { user, onNavigate } = setup(hr);
    await user.type(findBox(), "loans{Enter}");
    expect(push).toHaveBeenCalledWith("/payroll/loans");
    expect(onNavigate).toHaveBeenCalled();
    expect(findBox()).toHaveValue("");
  });

  it("moves through the results with the arrow keys, wrapping, and opens the one it is on", async () => {
    const { user } = setup(hr);
    await user.type(findBox(), "pay");
    const all = screen.getAllByRole("option");
    expect(findBox()).toHaveAttribute("aria-activedescendant", all[0]!.id);
    await user.keyboard("{ArrowDown}");
    expect(findBox()).toHaveAttribute("aria-activedescendant", all[1]!.id);
    expect(all[1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(findBox()).toHaveAttribute(
      "aria-activedescendant",
      all[all.length - 1]!.id,
    );
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(push).toHaveBeenCalledWith(all[1]!.getAttribute("href"));
  });

  it("clears on Escape and returns to the level it was on", async () => {
    const { user } = setup(admin, { pathname: "/payroll/loans" });
    expect(heading()).toBe("Payroll");
    await user.type(findBox(), "leave");
    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    expect(heading()).toBeNull();
    await user.keyboard("{Escape}");
    expect(findBox()).toHaveValue("");
    expect(heading()).toBe("Payroll");
    /* A second press is the ordinary one: up a level. */
    await user.keyboard("{Escape}");
    expect(heading()).toBeNull();
  });

  it("has a clear button, and says how many it found", async () => {
    const { user } = setup(admin);
    await user.type(findBox(), "leave");
    expect(document.querySelector("[aria-live]")?.textContent).toMatch(
      /results?$/,
    );
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(findBox()).toHaveValue("");
    expect(document.querySelector("[aria-live]")?.textContent).toBe(
      "Main menu",
    );
  });

  it("is a combobox over a listbox", async () => {
    const { user } = setup(admin);
    expect(findBox()).toHaveAttribute("aria-expanded", "false");
    await user.type(findBox(), "pay");
    expect(findBox()).toHaveAttribute("aria-expanded", "true");
    const listbox = screen.getByRole("listbox");
    expect(findBox()).toHaveAttribute("aria-controls", listbox.id);
  });

  it("is quick with every module on", () => {
    setup(admin);
    const started = performance.now();
    for (const word of [
      "p",
      "pa",
      "pay",
      "payr",
      "payro",
      "payrol",
      "payroll",
    ]) {
      fireEvent.change(findBox(), { target: { value: word } });
    }
    expect(performance.now() - started).toBeLessThan(1500);
  });
});

/* -------------------------------------------------------------------------- */

describe("the F shortcut", () => {
  it("focuses Find from the page", async () => {
    const { user } = setup(admin);
    await user.keyboard("f");
    expect(findBox()).toHaveFocus();
    /* And is not typed into it. */
    expect(findBox()).toHaveValue("");
  });

  it("leaves the letter alone while somebody is typing, or a dialog is open", async () => {
    const { user } = setup(admin);
    const other = document.createElement("input");
    document.body.appendChild(other);
    other.focus();
    await user.keyboard("f");
    expect(other).toHaveFocus();
    expect(other).toHaveValue("f");
    other.remove();

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard("f");
    expect(findBox()).not.toHaveFocus();
    dialog.remove();
  });

  it("is not claimed by the drawer, which sits on a screen with no keyboard", async () => {
    const { user } = setup(admin, { variant: "drawer" });
    await user.keyboard("f");
    expect(findBox()).not.toHaveFocus();
    expect(screen.queryByText("F")).toBeNull();
  });

  it("shows the F chip on the desktop sidebar only", () => {
    setup(admin);
    expect(document.querySelector("kbd")?.textContent).toBe("F");
  });
});

/* -------------------------------------------------------------------------- */

describe("counters", () => {
  it("shows a quiet dot on a row when something inside it has a count", () => {
    setup(hr, { badges: { pendingLeave: 3 } });
    expect(row("time").querySelector("[data-attention]")).not.toBeNull();
    expect(row("time")).toHaveAccessibleName(/needs attention/);
    expect(row("payroll").querySelector("[data-attention]")).toBeNull();
  });

  it("shows no dot when every count is zero", () => {
    setup(hr, { badges: { pendingLeave: 0, notClockedIn: 0 } });
    expect(nav().querySelectorAll("[data-attention]")).toHaveLength(0);
  });

  it("keeps the count on the item inside the level", async () => {
    const { user } = setup(hr, { badges: { pendingLeave: 3 } });
    await user.click(row("time"));
    const leave = screen.getByRole("link", { name: /^Leave/ });
    expect(within(leave).getByText("3")).toBeInTheDocument();
  });

  it("keeps the count on a top-level link", () => {
    setup(hr, { badges: { approvals: 5 } });
    const link = screen.getByRole("link", { name: /^My approvals/ });
    expect(within(link).getByText("5")).toBeInTheDocument();
  });

  it("shows it in Find, too", async () => {
    const { user } = setup(hr, { badges: { pendingLeave: 4 } });
    await user.type(findBox(), "leave");
    const leave = screen
      .getAllByRole("option")
      .find((o) => o.getAttribute("aria-label") === "Time & Leave › Leave")!;
    expect(within(leave).getByText("4")).toBeInTheDocument();
  });
});

describe("locks and Coming soon", () => {
  it("marks a group that is outside the plan on its row, and its items inside", async () => {
    const { user } = setup(persona("billing-locked company"));
    const locked = row("hiring");
    expect(locked).toHaveAccessibleName("Recruitment (not in your plan)");
    expect(locked.querySelector("svg.lucide-lock")).not.toBeNull();
    expect(row("core-hr")).not.toHaveAccessibleName(/not in your plan/);
    await user.click(locked);
    const offers = screen.getByRole("link", {
      name: "Offers (not in your plan)",
    });
    expect(offers).toHaveAttribute("href", "/billing/pay");
    expect(offers.querySelector("svg.lucide-lock")).not.toBeNull();
  });

  it("does not show a count on a locked item", async () => {
    const { user } = setup(persona("billing-locked company"), {
      badges: { pendingLeave: 7 },
    });
    await user.click(row("time"));
    expect(screen.queryByText("7")).toBeNull();
  });

  it("keeps Coming soon on an unbuilt screen and shows no count on it", async () => {
    const groups: NavGroup[] = [
      {
        id: "preview",
        heading: "Preview",
        billingModule: "PERFORMANCE",
        items: [
          { href: "/a", label: "Built", icon: null, always: true },
          {
            href: "/b",
            label: "Unbuilt",
            icon: null,
            soon: true,
            always: true,
            badge: 9,
          },
        ],
      },
    ];
    const { user } = setup(admin, { groups });
    await user.click(row("preview"));
    const unbuilt = screen.getByRole("link", { name: /Unbuilt/ });
    expect(within(unbuilt).getByText("Coming soon")).toBeInTheDocument();
    expect(within(unbuilt).queryByText("9")).toBeNull();
    expect(
      within(screen.getByRole("link", { name: /Built$/ })).queryByText(
        "Coming soon",
      ),
    ).toBeNull();
  });
});

describe("absent, not disabled", () => {
  it("has no row for a module the company has switched off", () => {
    setup(persona("company with modules off"));
    expect(row("hiring")).toBeNull();
    expect(labels()).not.toContain("Recruitment");
  });

  it("drops an item whose feature is off from its level and from Find", async () => {
    const { user } = setup(persona("company with modules off"));
    await user.click(row("payroll"));
    expect(labels()).not.toContain("Loans");
    expect(labels()).not.toContain("Expenses");
    await user.click(
      screen.getByRole("button", { name: /back to main menu/i }),
    );
    await user.type(findBox(), "loan");
    expect(
      screen.queryByRole("option", { name: /Payroll › Loans/ }),
    ).toBeNull();
  });

  it("never renders a disabled control", () => {
    for (const who of PERSONAS) {
      const { unmount } = setup(who);
      expect(
        nav().querySelectorAll("[disabled], [aria-disabled='true']"),
      ).toHaveLength(0);
      unmount();
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("on a phone, in the drawer", () => {
  it("gives every row a 44px target and the Find box the same", async () => {
    const { user } = setup(admin, { variant: "drawer" });
    for (const node of nav().querySelectorAll(
      "a[href], button[data-nav-row]",
    )) {
      expect(node.className).toContain("min-h-11");
    }
    expect(findBox().className).toContain("h-11");
    await user.click(row("payroll"));
    for (const node of nav().querySelectorAll("a[href]")) {
      expect(node.className).toContain("min-h-11");
    }
    /* The back row is one full-width button, 44px tall, with the 44px chevron
       cell inside it; it is no longer a square icon button. */
    expect(
      screen.getByRole("button", { name: /back to main menu/i }).className,
    ).toContain("min-h-11");
  });

  it("closes on navigation", async () => {
    const { user, onNavigate } = setup(admin, { variant: "drawer" });
    await user.click(screen.getByRole("link", { name: "Home" }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("closes when a Find result is used", async () => {
    const { user, onNavigate } = setup(admin, { variant: "drawer" });
    await user.type(findBox(), "loans{Enter}");
    expect(onNavigate).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/payroll/loans");
  });

  it("closes on Escape from the top level, and goes up a level first", async () => {
    const { user, onClose } = setup(admin, {
      variant: "drawer",
      pathname: "/payroll/loans",
    });
    await user.keyboard("{Escape}");
    expect(heading()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("has its own close button, and takes focus when it opens", async () => {
    const { user, onClose, container } = setup(admin, { variant: "drawer" });
    expect(container.querySelector("[data-sidebar='drawer']")).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Close navigation" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("uses the shared Input, which can always be narrower than its row", () => {
    setup(admin, { variant: "drawer" });
    expect(findBox().className).toContain("min-w-0");
    expect(findBox().className).toContain("max-w-full");
  });

  it("lets a long label shrink instead of widening the drawer", () => {
    setup(admin, { variant: "drawer" });
    for (const label of nav().querySelectorAll("[data-nav-label]")) {
      expect(label.className).toContain("min-w-0");
      expect(label.className).toContain("truncate");
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("motion", () => {
  const panel = () => nav().firstElementChild as HTMLElement;

  it("does not animate on first render", () => {
    stubMedia(false);
    setup(admin, { pathname: "/payroll/loans" });
    expect(panel().className).not.toContain("animate-drill");
  });

  it("slides in on the way in and back on the way back", async () => {
    stubMedia(false);
    const { user } = setup(admin);
    await user.click(row("payroll"));
    expect(panel().className).toContain("animate-drill-in");
    await user.click(
      screen.getByRole("button", { name: /back to main menu/i }),
    );
    expect(panel().className).toContain("animate-drill-back");
  });

  it("puts no animation class on at all when the person asked for no motion", async () => {
    stubMedia(true);
    const { user } = setup(admin);
    await user.click(row("payroll"));
    expect(panel().className).not.toContain("animate-drill");
    await user.click(
      screen.getByRole("button", { name: /back to main menu/i }),
    );
    expect(panel().className).not.toContain("animate-drill");
  });

  it("clips sideways overflow, so the slide never flashes a scrollbar", () => {
    setup(admin);
    expect(nav().className).toContain("overflow-x-hidden");
  });

  it("does not animate a change the route made", () => {
    stubMedia(false);
    const { go } = setup(admin, { pathname: "/dashboard" });
    go("/payroll/loans");
    expect(heading()).toBe("Payroll");
    expect(panel().className).not.toContain("animate-drill");
  });
});

/* -------------------------------------------------------------------------- */

describe("the guided tour still has something to point at", () => {
  const SIDEBAR_TARGET = /^\[data-tour="nav-(item|group):/;
  const found = (selector: string) => document.querySelector(selector) !== null;

  it("every step that points into the sidebar resolves on the top level", () => {
    setup(admin);
    const steps = TOUR_STEPS.filter((step) =>
      step.target.some((selector) => SIDEBAR_TARGET.test(selector)),
    );
    expect(steps.map((s) => s.id)).toEqual(["yours", "approvals", "settings"]);
    for (const step of steps) {
      expect(
        step.target.some(found),
        `${step.id} points at nothing in the sidebar`,
      ).toBe(true);
    }
  });

  it("points Attendance and Leave at the Time & Leave row until you are inside it, then at the items", async () => {
    const { user } = setup(employee);
    expect(found('[data-tour="nav-item:/people/attendance"]')).toBe(false);
    expect(found('[data-tour="nav-group:time"]')).toBe(true);
    await user.click(row("time"));
    expect(found('[data-tour="nav-item:/people/attendance"]')).toBe(true);
    expect(found('[data-tour="nav-item:/people/leave"]')).toBe(true);
  });

  it("points Settings at the link when it is all there is, and the row when there is Roles too", () => {
    const only = groupsFor({
      ...admin,
      permissions: new Set(["MANAGE_SETTINGS"]),
    });
    const { unmount } = render(
      <SidebarNav
        groups={only}
        pathname="/profile"
        badges={NO_BADGES}
        onNavigate={() => undefined}
      />,
    );
    expect(found('[data-tour="nav-item:/settings"]')).toBe(true);
    unmount();
    setup(admin);
    expect(found('[data-tour="nav-group:settings"]')).toBe(true);
  });

  it("keeps the Approvals link a top-level, tourable link for everybody", () => {
    for (const who of PERSONAS) {
      const { unmount } = setup(who);
      expect(found('[data-tour="nav-item:/approvals"]')).toBe(true);
      unmount();
    }
  });
});

describe("a person with no doors at all", () => {
  it("gets an empty list rather than an error", () => {
    act(() => {
      render(
        <SidebarNav
          groups={[]}
          pathname="/"
          badges={NO_BADGES}
          onNavigate={() => undefined}
        />,
      );
    });
    expect(labels()).toEqual([]);
  });
});
