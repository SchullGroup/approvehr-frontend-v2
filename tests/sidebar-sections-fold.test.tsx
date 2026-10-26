import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarNav } from "@/components/portal/sidebar";
import type { BadgeSource, NavGroup } from "@/components/portal/nav";
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
 * A level of eight or more items is filed under small headings, and each
 * heading folds its section. Rendered and pressed, because what can go wrong is
 * state: what stays folded across a visit, what a fold hides that it should not,
 * and whether the button says what it is.
 *
 * The folded set lives in a store that outlives a render (and in module memory,
 * which clearing storage does not clear), so every test starts by opening
 * whatever an earlier one folded.
 */

const persona = (name: string): Persona => {
  const found = PERSONAS.find((p) => p.name === name);
  if (!found) throw new Error(`no persona ${name}`);
  return found;
};
const admin = persona("administrator");

const KEY = "approvehr.sidebar.sections";

function setup(options: {
  pathname?: string;
  badges?: Partial<Record<BadgeSource, number>>;
  variant?: "desktop" | "drawer";
  groups?: NavGroup[];
}) {
  const groups = options.groups ?? groupsFor(admin);
  const ui = (pathname: string) => (
    <SidebarNav
      groups={groups}
      pathname={pathname}
      badges={{ ...NO_BADGES, ...options.badges }}
      onNavigate={vi.fn()}
      variant={options.variant ?? "desktop"}
    />
  );
  const utils = render(ui(options.pathname ?? "/profile"));
  return { ...utils, user: userEvent.setup() };
}

const nav = () => screen.getByRole("navigation", { name: "Main" });
const labels = () =>
  Array.from(nav().querySelectorAll("[data-nav-label]")).map(
    (node) => node.textContent,
  );
const sectionButton = (heading: string) =>
  nav().querySelector<HTMLElement>(`button[data-nav-section="${heading}"]`)!;
const headings = () =>
  Array.from(nav().querySelectorAll("button[data-nav-section]")).map((node) =>
    node.getAttribute("data-nav-section"),
  );
const coreHr = () =>
  nav().ownerDocument.querySelector<HTMLElement>(
    'button[data-nav-row="core-hr"]',
  )!;

async function openCoreHr(user: ReturnType<typeof userEvent.setup>) {
  await user.click(coreHr());
}

/** Whatever a previous test folded, opened again. */
async function openEverything(user: ReturnType<typeof userEvent.setup>) {
  for (const heading of headings()) {
    const button = sectionButton(heading!);
    if (button.getAttribute("aria-expanded") === "false")
      await user.click(button);
  }
}

beforeEach(() => {
  window.localStorage.removeItem(KEY);
});
afterEach(() => {
  push.mockClear();
});

/* -------------------------------------------------------------------------- */

describe("the headings in a level", () => {
  it("are buttons, open to begin with, that say what they do", async () => {
    const { user } = setup({});
    await openCoreHr(user);
    await openEverything(user);

    expect(headings()).toEqual(
      expect.arrayContaining(["People", "Lifecycle", "Records"]),
    );
    for (const heading of headings()) {
      const button = sectionButton(heading!);
      expect(button.getAttribute("aria-expanded")).toBe("true");
      expect(button.getAttribute("aria-controls")).toBeTruthy();
      /* Still an h3: the outline a screen reader walks is unchanged. */
      expect(button.closest("h3")).not.toBeNull();
    }
    expect(labels()).toEqual(
      expect.arrayContaining(["Employees", "Onboarding", "Documents"]),
    );
  });

  it("fold their section on a press, and open it on the next", async () => {
    const { user } = setup({});
    await openCoreHr(user);
    await openEverything(user);

    await user.click(sectionButton("Lifecycle"));
    expect(sectionButton("Lifecycle").getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(labels()).not.toContain("Onboarding");
    expect(labels()).not.toContain("Exit management");
    /* Their neighbours are untouched. */
    expect(labels()).toContain("Employees");
    expect(labels()).toContain("Documents");

    await user.click(sectionButton("Lifecycle"));
    expect(labels()).toContain("Onboarding");
    expect(labels()).toContain("Exit management");
  });

  it("keep the button's name as the heading and nothing else when open", async () => {
    const { user } = setup({});
    await openCoreHr(user);
    await openEverything(user);

    expect(
      screen.getByRole("button", { name: "Lifecycle", expanded: true }),
    ).toBeTruthy();
  });

  it("remember a fold for the next visit, in this browser", async () => {
    const { user, unmount } = setup({});
    await openCoreHr(user);
    await openEverything(user);
    await user.click(sectionButton("Records"));

    expect(JSON.parse(window.localStorage.getItem(KEY)!).data.folded).toEqual([
      "core-hr/Records",
    ]);

    unmount();
    const again = setup({});
    await openCoreHr(again.user);
    expect(sectionButton("Records").getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(sectionButton("People").getAttribute("aria-expanded")).toBe("true");
  });

  it("do not fold the same heading in another level", async () => {
    const { user } = setup({});
    await openCoreHr(user);
    await openEverything(user);
    await user.click(sectionButton("People"));

    /* The key is the level and the heading, so a second level that one day has
       a "People" heading keeps its own. */
    expect(JSON.parse(window.localStorage.getItem(KEY)!).data.folded).toContain(
      "core-hr/People",
    );
    await user.click(sectionButton("People"));
  });

  it("stay a 44px target in the drawer", async () => {
    const { user } = setup({ variant: "drawer" });
    await openCoreHr(user);
    await openEverything(user);

    expect(sectionButton("People").className).toContain("min-h-11");
  });
});

describe("a folded section", () => {
  it("shows a dot, and says so, when something inside has a count waiting", async () => {
    const groups = groupsFor(admin).map((group) =>
      group.heading === "Core HR"
        ? {
            ...group,
            items: group.items.map((item) =>
              item.label === "Onboarding"
                ? { ...item, badgeSource: "pendingLeave" as const }
                : item,
            ),
          }
        : group,
    );
    const { user } = setup({ groups, badges: { pendingLeave: 3 } });
    await openCoreHr(user);
    await openEverything(user);
    expect(sectionButton("Lifecycle").querySelector("[data-attention]")).toBe(
      null,
    );

    await user.click(sectionButton("Lifecycle"));

    expect(
      sectionButton("Lifecycle").querySelector("[data-attention]"),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Lifecycle, needs attention" }),
    ).toBeTruthy();
    /* A section with nothing waiting stays quiet when it is folded. */
    await user.click(sectionButton("Records"));
    expect(sectionButton("Records").querySelector("[data-attention]")).toBe(
      null,
    );
  });

  it("says the page you are on is inside it", async () => {
    const { user } = setup({ pathname: "/people" });
    await openCoreHr(user);
    await openEverything(user);

    await user.click(sectionButton("People"));

    expect(
      screen.getByRole("button", {
        name: "People, the page you are on is in here",
      }),
    ).toBeTruthy();
    expect(sectionButton("People").className).toContain("text-accent-text");
  });

  it("is still found by Find, so a fold loses no door", async () => {
    const { user } = setup({});
    await openCoreHr(user);
    await openEverything(user);
    await user.click(sectionButton("Lifecycle"));
    expect(labels()).not.toContain("Onboarding");

    await user.type(
      screen.getByRole("combobox", { name: "Find a page" }),
      "onboarding",
    );

    const found = Array.from(
      document.querySelectorAll<HTMLElement>('[role="option"]'),
    ).map((node) => node.getAttribute("aria-label") ?? node.textContent ?? "");
    expect(found.some((text) => text.includes("Onboarding"))).toBe(true);
  });

  it("leaves the unheaded run at the top of a level where it is", async () => {
    const { user } = setup({});
    await openCoreHr(user);
    await openEverything(user);

    for (const heading of headings()) await user.click(sectionButton(heading!));

    /* Every heading is still there to press, whatever is folded. */
    expect(headings().length).toBeGreaterThanOrEqual(3);
    expect(
      within(nav()).getByRole("button", { name: /back to main menu/i }),
    ).toBeTruthy();
    await openEverything(user);
  });
});

describe("the back button's name", () => {
  it("contains what it shows, so saying its label reaches it (WCAG 2.5.3)", async () => {
    const { user } = setup({});
    await openCoreHr(user);

    const back = within(nav()).getByRole("button", {
      name: /back to main menu/i,
    });
    const shown = back.textContent ?? "";
    expect(shown).toBe("Core HR");
    expect(back.getAttribute("aria-label")).toBe("Core HR, back to main menu");
    expect(back.getAttribute("aria-label")!.startsWith(shown)).toBe(true);
  });
});
