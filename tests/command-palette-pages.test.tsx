import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NavGroup } from "@/components/portal/nav";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({ employees: [], loading: false }),
}));
vi.mock("@/lib/store/permissions", () => ({
  useRoles: () => ({ roles: [], loading: false }),
}));
let held = new Set<string>();
vi.mock("@/lib/permissions", () => ({
  usePermissions: () => ({ permissions: held }),
}));

import { CommandPalette } from "@/components/portal/command-palette";

const item = (href: string, label: string) => ({
  href,
  label,
  icon: <span />,
});

const HOME = { items: [item("/dashboard", "Home")] };
const ADMIN: NavGroup[] = [
  HOME,
  { heading: "Payroll", items: [item("/payroll", "Payroll runs")] },
  {
    heading: "People",
    items: [item("/people", "Directory"), item("/people/leave", "Leave")],
  },
  { heading: "Performance", items: [item("/performance", "Performance")] },
  { heading: "Settings", items: [item("/settings", "Settings")] },
];
/* Has the directory but not the leave door, and nothing else. */
const NO_LEAVE: NavGroup[] = [
  HOME,
  { heading: "People", items: [item("/people", "Directory")] },
];
const EMPLOYEE: NavGroup[] = [HOME];

async function search(nav: NavGroup[], text: string) {
  const user = userEvent.setup();
  render(<CommandPalette nav={nav} onClose={() => {}} />);
  await user.type(screen.getByRole("combobox"), text);
}

const none = () => screen.findByText(/No page, person or role matches/);

beforeEach(() => {
  held = new Set();
});

describe("command palette pages", () => {
  it("finds a page that is a door in this person's own sidebar", async () => {
    await search(ADMIN, "payroll");
    expect(await screen.findByText("Payroll runs")).toBeTruthy();
    expect(screen.getByText("Pages")).toBeTruthy();
  });

  it("never offers a page their sidebar does not have", async () => {
    await search(EMPLOYEE, "loans");
    expect(await none()).toBeTruthy();
    expect(screen.queryByRole("option")).toBeNull();
  });

  it("reaches a page that is not a door, through its owner", async () => {
    await search(ADMIN, "leave types");
    expect(
      await screen.findByRole("option", { name: /Leave policies/ }),
    ).toBeTruthy();
  });

  it("reaches a page of a module they have", async () => {
    await search(ADMIN, "how appraisals work");
    expect(
      await screen.findByRole("option", { name: /How appraisals work/ }),
    ).toBeTruthy();
  });

  it("does not reach those pages without the owner", async () => {
    await search(EMPLOYEE, "leave types");
    expect(await none()).toBeTruthy();
  });

  it("does not hand over a hidden door through a shorter owner", async () => {
    /* They have /people, but /people/leave is its own door and is hidden. */
    await search(NO_LEAVE, "absence");
    expect(await none()).toBeTruthy();
    expect(screen.queryByRole("option", { name: /Leave/ })).toBeNull();
  });

  it("offers the account pages to everybody", async () => {
    await search(EMPLOYEE, "profile");
    expect(
      await screen.findByRole("option", { name: /My profile/ }),
    ).toBeTruthy();
  });

  /* The Queries door is in everybody's sidebar, so the page that borrows its visibility has to say
     who it is for: the counts belong to the people who write or decide queries. */
  describe("a page that is narrower than the door it sits behind", () => {
    const WITH_QUERIES: NavGroup[] = [
      HOME,
      { heading: "Core HR", items: [item("/people/queries", "Queries")] },
    ];

    it("is not offered to a person who only reads their own letters", async () => {
      await search(WITH_QUERIES, "counts");
      expect(await none()).toBeTruthy();
      expect(screen.queryByRole("option", { name: /counts/i })).toBeNull();
    });

    it("is not offered to a manager who only drafts", async () => {
      held = new Set(["DRAFT_QUERIES"]);
      await search(WITH_QUERIES, "counts");
      expect(await none()).toBeTruthy();
    });

    it.each(["ISSUE_QUERIES", "DECIDE_QUERIES"])(
      "is offered to somebody who holds %s",
      async (permission) => {
        held = new Set([permission]);
        await search(WITH_QUERIES, "counts");
        expect(
          await screen.findByRole("option", { name: /counts/i }),
        ).toBeTruthy();
      },
    );

    it("still finds the Queries door itself for everybody", async () => {
      await search(WITH_QUERIES, "queries");
      expect(
        await screen.findByRole("option", { name: /Queries/ }),
      ).toBeTruthy();
    });
  });
});
