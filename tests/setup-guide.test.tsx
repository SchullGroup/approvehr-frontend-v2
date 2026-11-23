import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SetupFacts } from "@/lib/store/setup-checklist";

/**
 * What is still to set up, as a dashboard card that can be hidden.
 *
 * UAT 23 Nov (U43, NC-17): a new owner met the setup wizard, the tour, and
 * then a "Setting up your company" modal that opened again on every visit to
 * the dashboard. It is a card now, never a modal, and "Hide" keeps it hidden.
 */

let facts: SetupFacts | null = null;
let loading = false;
let canManage = true;

vi.mock("@/lib/permissions", () => ({ useCan: () => canManage }));
vi.mock("@/lib/store/setup-checklist", () => ({
  useSetupChecklist: () => ({ facts, loading }),
}));

const NEARLY_DONE: SetupFacts = {
  setupCompletedAt: "2026-09-01T09:00:00.000Z",
  company: {
    logo: true,
    rcNumber: true,
    tin: true,
    addressLine: true,
    taxState: true,
    entities: 1,
  },
  locations: { total: 2, withGeofence: 1, enforcing: 1 },
  recordFields: { taxSetup: true, pensionSetup: true, bankDetails: true },
  leave: {
    types: 3,
    biggestEntitlement: 20,
    year: 2026,
    holidays: 13,
    awaitingProclamation: 0,
  },
  pay: {
    settings: true,
    components: 2,
    grades: 1,
    bankAccounts: 1,
    hasPrimaryBankAccount: true,
  },
  access: {
    roles: 4,
    users: 10,
    usersWithoutRole: 0,
    canApprovePayroll: 2,
    unlinkedAccounts: 0,
  },
  payrollChecks: {
    employees: 10,
    requireBankAccount: true,
    requirePensionPin: false,
    missingBankAccount: 1,
    missingPensionPin: 0,
  },
};

/**
 * jsdom's `localStorage` in this environment has no `clear`, so the store is
 * given a real one. It is also the only way to reset between tests: the
 * persisted store hydrates once per module and holds its cache, so a fresh
 * backing object per test is what stops one case reading the last one's
 * dismissal.
 */
function freshStorage() {
  let held: Record<string, string> = {};
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => held[k] ?? null,
      setItem: (k: string, v: string) => {
        held[k] = v;
      },
      removeItem: (k: string) => {
        delete held[k];
      },
      clear: () => {
        held = {};
      },
    },
  });
}

beforeEach(() => {
  vi.resetModules();
  freshStorage();
  facts = NEARLY_DONE;
  loading = false;
  canManage = true;
});

async function mount() {
  const { SetupCard } = await import("@/app/(app)/dashboard/setup-guide");
  return render(<SetupCard />);
}

describe("the setup card", () => {
  it("is a card on the page, not a dialog", async () => {
    await mount();
    expect(
      screen.getByRole("heading", { name: "Setting up your company" }),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lists what is left, with where it stands, as plain words", async () => {
    await mount();
    expect(screen.getByText("Payroll checks")).toBeTruthy();
    expect(screen.getByText("Needs attention")).toBeTruthy();
    /* Done steps are counted, not listed. */
    expect(screen.queryByText("Company profile")).toBeNull();
    expect(screen.getByText("5 of 6 done")).toBeTruthy();
  });

  it("links what is left to the page that sets it", async () => {
    await mount();
    const link = screen.getByRole("link", { name: /Payroll checks/ });
    expect(link.getAttribute("href")).toMatch(/^\//);
  });

  it("stays hidden once hidden", async () => {
    const view = await mount();
    await userEvent.click(
      screen.getByRole("button", { name: /Hide setting up your company/ }),
    );
    expect(screen.queryByText("Setting up your company")).toBeNull();
    view.unmount();
    await mount();
    expect(screen.queryByText("Setting up your company")).toBeNull();
  });

  it("is not shown to somebody who cannot change settings", async () => {
    canManage = false;
    await mount();
    expect(screen.queryByText("Setting up your company")).toBeNull();
  });

  it("is not shown once everything is done", async () => {
    facts = {
      ...NEARLY_DONE,
      payrollChecks: { ...NEARLY_DONE.payrollChecks, missingBankAccount: 0 },
    };
    await mount();
    expect(screen.queryByText("Setting up your company")).toBeNull();
  });

  it("draws nothing while the checklist is being read", async () => {
    loading = true;
    await mount();
    expect(screen.queryByText("Setting up your company")).toBeNull();
  });
});
