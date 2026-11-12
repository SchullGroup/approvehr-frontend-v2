import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const state = vi.hoisted(() => ({
  loading: false,
  billing: null as null | { status: string },
}));

vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/lib/store/setup-checklist", () => ({
  useSetupChecklist: () => ({
    facts: {},
    loading: state.loading,
    error: null,
    source: "api",
    reload: () => {},
  }),
}));

vi.mock("@/app/(app)/settings/checklist", () => {
  const rows = [
    {
      id: "leave",
      title: "Leave types",
      status: "todo",
      detail: "No leave types yet.",
      affects: "What people can book, and how many days.",
      href: "/settings/leave",
      linkLabel: "Set up leave",
    },
    {
      id: "pay",
      title: "Pay setup",
      status: "done",
      detail: "Set.",
      affects: "How every payslip is worked out.",
      href: "/payroll/pay-setup",
      linkLabel: "Open pay setup",
    },
  ];
  return {
    checklistRows: () => rows,
    checklistProgress: () => ({ total: 2, done: 1, outstanding: [rows[0]] }),
  };
});

vi.mock("@/app/(app)/settings/billing-card", () => ({
  BillingCard: () => <div>Billing card</div>,
  useBillingStatus: () => state.billing,
}));

import { SettingsScreen } from "@/app/(app)/settings/settings-screen";

beforeEach(() => {
  state.loading = false;
  state.billing = null;
});

async function type(text: string) {
  await userEvent.type(screen.getByLabelText("Search settings"), text);
}

describe("settings filter box", () => {
  it("shows the page as it was with nothing typed", () => {
    render(<SettingsScreen />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Overtime")).toBeTruthy();
  });

  it("narrows the settings pages by a synonym", async () => {
    render(<SettingsScreen />);
    await type("weekend");
    expect(screen.getByText("Overtime")).toBeTruthy();
    expect(screen.queryByText("Audit trail")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("1 match");
  });

  it("puts the module first on a result, then a short description", async () => {
    render(<SettingsScreen />);
    await type("weekend");
    const link = screen.getByRole("link", { name: /Overtime/ });
    expect(link.textContent?.startsWith("Time and attendance")).toBe(true);
    expect(link.textContent).toContain(
      "Whether overtime is paid, from how many minutes, and the weekday, weekend and public-holiday rates.",
    );
    expect(link.textContent).not.toContain("Appraisal");
  });

  it("lists matching checklist rows while filtering", async () => {
    render(<SettingsScreen />);
    await type("holidays");
    expect(screen.getByText("Leave types")).toBeTruthy();
    expect(screen.queryByText("Pay setup")).toBeNull();
  });

  it("says nothing matches, and clearing brings the page back", async () => {
    render(<SettingsScreen />);
    await type("zzzz");
    expect(screen.getByRole("status").textContent).toContain(
      "Nothing in settings matches",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Clear the search" }),
    );
    expect(screen.getByText("Overtime")).toBeTruthy();
  });

  it("does not claim a count while the checklist is loading", async () => {
    state.loading = true;
    render(<SettingsScreen />);
    await type("overtime");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the billing card only when it is on this person's screen", async () => {
    state.billing = { status: "ACTIVE" };
    const { unmount } = render(<SettingsScreen />);
    await type("renew");
    expect(screen.getByText("Billing card")).toBeTruthy();
    unmount();

    state.billing = null;
    render(<SettingsScreen />);
    await type("renew");
    expect(screen.queryByText("Billing card")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain(
      "Nothing in settings matches",
    );
  });
});
