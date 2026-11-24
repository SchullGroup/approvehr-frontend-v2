/**
 * L5 (PAY-30): the payroll analyst, who holds View salaries but neither Set up
 * pay nor Edit people, was shown the Benefits tab only to be told in red that
 * she could not see it, with two 403s behind it. The API reads plans for those
 * two permissions alone, so the tab is shown only to somebody holding one.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PermissionKey } from "@/lib/permission-keys";

let held = new Set<PermissionKey>();
vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  useCan: (permission: PermissionKey) => held.has(permission),
}));
vi.mock("@/app/(app)/payroll/pay-setup/components-panel", () => ({
  ComponentsPanel: () => <p>components</p>,
}));
vi.mock("@/app/(app)/payroll/pay-setup/extras-panel", () => ({
  ExtrasPanel: () => <p>settings</p>,
}));
vi.mock("@/app/(app)/payroll/pay-setup/grades-panel", () => ({
  GradesPanel: () => <p>grades</p>,
}));
vi.mock("@/app/(app)/payroll/pay-setup/benefits-panel", () => ({
  BenefitsPanel: () => <p>benefits</p>,
}));
vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { PaySetupScreen } from "@/app/(app)/payroll/pay-setup/pay-setup-screen";

describe("the Benefits tab", () => {
  it("is not offered to somebody who can see salaries but not read plans", () => {
    held = new Set<PermissionKey>(["VIEW_SALARIES"]);
    render(<PaySetupScreen initialTab="allowances" />);
    expect(screen.getByRole("tab", { name: /Allowances/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Benefits/ })).toBeNull();
  });

  it("is offered to somebody who sets up pay", () => {
    held = new Set<PermissionKey>(["VIEW_SALARIES", "MANAGE_PAY_STRUCTURE"]);
    render(<PaySetupScreen initialTab="allowances" />);
    expect(screen.getByRole("tab", { name: /Benefits/ })).toBeInTheDocument();
  });

  it("is the only tab for somebody who only edits people", () => {
    held = new Set<PermissionKey>(["EDIT_RECORDS"]);
    render(<PaySetupScreen initialTab="allowances" />);
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.getByText("benefits")).toBeInTheDocument();
  });
});
