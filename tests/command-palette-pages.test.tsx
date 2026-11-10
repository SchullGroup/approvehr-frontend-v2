import { describe, expect, it, vi } from "vitest";
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

import { CommandPalette } from "@/components/portal/command-palette";

const item = (href: string, label: string) => ({
  href,
  label,
  icon: <span />,
});

const ADMIN: NavGroup[] = [
  { items: [item("/dashboard", "Home")] },
  { heading: "Payroll", items: [item("/payroll", "Payroll runs")] },
  { heading: "Settings", items: [item("/settings", "Settings")] },
];
const EMPLOYEE: NavGroup[] = [{ items: [item("/dashboard", "Home")] }];

async function search(nav: NavGroup[], text: string) {
  const user = userEvent.setup();
  render(<CommandPalette nav={nav} onClose={() => {}} />);
  await user.type(screen.getByRole("combobox"), text);
}

describe("command palette pages", () => {
  it("finds a page that is in this person's own sidebar", async () => {
    await search(ADMIN, "payroll");
    expect(await screen.findByText("Payroll runs")).toBeTruthy();
    expect(screen.getByText("Pages")).toBeTruthy();
  });

  it("never offers a page their sidebar does not have", async () => {
    await search(EMPLOYEE, "payroll");
    expect(
      await screen.findByText(/No page, person or role matches/),
    ).toBeTruthy();
    expect(screen.queryByText("Payroll runs")).toBeNull();
  });

  it("finds a settings page only for somebody who has the Settings row", async () => {
    await search(ADMIN, "overtime");
    expect(
      await screen.findByRole("option", { name: /Overtime/ }),
    ).toBeTruthy();
  });

  it("does not find settings pages without the Settings row", async () => {
    await search(EMPLOYEE, "overtime");
    expect(
      await screen.findByText(/No page, person or role matches/),
    ).toBeTruthy();
    expect(screen.queryByRole("option", { name: /Overtime/ })).toBeNull();
  });
});
