import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const state = vi.hoisted(() => ({
  loading: false,
  billing: null as null | { status: string },
  assistant: false,
  smsSends: false,
  trackers: [] as {
    available: boolean;
    configured: boolean;
    connections: unknown[];
  }[],
  departments: true,
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

vi.mock("@/lib/store/features", () => ({
  useFeatures: () => ({ departments: state.departments }),
}));
vi.mock("@/lib/store/ai", () => ({
  useAssistantAvailable: () => ({ available: state.assistant }),
}));
vi.mock("@/lib/store/sms", () => ({
  useSmsStatus: () => ({
    data: { transport: { sends: state.smsSends } },
  }),
}));
vi.mock("@/lib/store/work-trackers", () => ({
  useWorkTrackerProviders: () => ({ providers: state.trackers }),
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
      href: "/settings/payroll",
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
  state.assistant = false;
  state.smsSends = false;
  state.trackers = [];
  state.departments = true;
});

async function type(text: string) {
  await userEvent.type(screen.getByLabelText("Search settings"), text);
}

const group = (title: string) =>
  screen.getByRole("heading", { name: title, level: 2 }).closest("section")!;

describe("one Settings page in six groups (U43)", () => {
  it("has the six groups, in order", () => {
    render(<SettingsScreen />);
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      "Company",
      "People",
      "Time and leave",
      "Pay",
      "Access",
      "System",
    ]);
  });

  it("lists the setup pages by their real titles, not behind a chip", () => {
    render(<SettingsScreen />);
    for (const [where, title, href] of [
      ["Company", "Company profile", "/settings/company"],
      ["Company", "Work locations", "/settings/locations"],
      ["Time and leave", "Leave policies", "/settings/leave"],
      ["Pay", "Payroll settings", "/settings/payroll"],
      ["Pay", "Bank accounts", "/settings/bank-accounts"],
      ["Access", "Access", "/settings/roles"],
    ] as const) {
      const link = within(group(where)).getByRole("link", {
        name: new RegExp(title),
      });
      expect(link.getAttribute("href")).toBe(href);
    }
    expect(screen.queryByText(/Setting up/)).toBeNull();
  });

  it("lists every page once", () => {
    render(<SettingsScreen />);
    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("says beside a setup page where it stands, in plain words", () => {
    render(<SettingsScreen />);
    const leave = within(group("Time and leave")).getByRole("link", {
      name: /Leave policies/,
    });
    expect(leave.textContent).toContain("Not set up");
    const pay = within(group("Pay")).getByRole("link", {
      name: /Payroll settings/,
    });
    expect(pay.textContent).toContain("Done");
  });

  it("leaves out departments while the company has them off", () => {
    state.departments = false;
    render(<SettingsScreen />);
    expect(screen.queryByText("Departments and teams")).toBeNull();
  });
});

describe("pages that cannot be used on this server yet (U52)", () => {
  it("are not listed until they can be", () => {
    render(<SettingsScreen />);
    expect(screen.queryByText("Assistant settings")).toBeNull();
    expect(screen.queryByText("Text messages")).toBeNull();
    expect(screen.queryByText("Integrations")).toBeNull();
    expect(screen.queryByText("Webhooks")).toBeNull();
  });

  it("are listed once the server can do them", () => {
    state.assistant = true;
    state.smsSends = true;
    state.trackers = [{ available: true, configured: true, connections: [] }];
    render(<SettingsScreen />);
    expect(screen.getByText("Assistant settings")).toBeTruthy();
    expect(screen.getByText("Text messages")).toBeTruthy();
    expect(screen.getByText("Integrations")).toBeTruthy();
  });
});

describe("settings filter box", () => {
  it("narrows the pages by a synonym", async () => {
    render(<SettingsScreen />);
    await type("weekend");
    expect(screen.getByText("Overtime policy")).toBeTruthy();
    expect(screen.queryByText("Audit log")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("1 match");
  });

  it("finds a setup page by what it holds", async () => {
    render(<SettingsScreen />);
    await type("holidays");
    expect(screen.getByText("Leave policies")).toBeTruthy();
    expect(screen.queryByText("Payroll settings")).toBeNull();
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
    expect(screen.getByText("Overtime policy")).toBeTruthy();
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
