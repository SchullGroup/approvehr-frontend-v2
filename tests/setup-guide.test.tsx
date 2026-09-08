import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SetupGuide } from "@/app/(app)/dashboard/setup-guide";
import type { SetupFacts } from "@/lib/store/setup-checklist";

/**
 * The guided walk through setting a company up, and the two things about it
 * that no type can see.
 *
 * 1. **The offer is spent by a person, not by a render.** Signing in with an
 *    unfinished company redirects to the setup wizard, so the dashboard mounts
 *    for a frame on the way past. The first version marked itself offered in
 *    that frame and the reader never saw the modal — a once-only prompt,
 *    consumed by a redirect. Found by looking at it.
 *
 * 2. **It opens on the step that is not done.** A company four-fifths set up
 *    was shown step one — finished last week — and had to press Next four
 *    times to reach the one thing left, which is the shape of thing the
 *    feedback was complaining about in the first place.
 *
 * Both were live, both passed `tsc`, lint and the build.
 */

const KEY = "approvehr.setup.guide";

let facts: SetupFacts | null = null;
let loading = false;

vi.mock("@/lib/permissions", () => ({ useCan: () => true }));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ tourSeen: true }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/store/setup-checklist", () => ({
  useSetupChecklist: () => ({ facts, loading }),
}));

/**
 * Rows are not built here. `checklistRows` is the real one — the same function
 * `/settings` and the dashboard prompt call — so this asserts what a reader
 * actually sees rather than a fixture's idea of it.
 */
vi.mock("@/app/(app)/settings/checklist", async () => {
  const real = await vi.importActual<
    typeof import("@/app/(app)/settings/checklist")
  >("@/app/(app)/settings/checklist");
  return real;
});

/**
 * Everything done except the payroll checks, which is the ordinary shape of a
 * company halfway through: the settings are filled in and one person's bank
 * details are not.
 *
 * The real `SetupFacts`, field for field — not a loose fixture — so that
 * `checklistRows` runs against it exactly as it does on `/settings`. A partial
 * one would test this component against a checklist nobody has.
 */
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
});

const mount = (open: boolean, onOpen = vi.fn()) => {
  const onClose = vi.fn();
  const view = render(
    <SetupGuide open={open} onOpen={onOpen} onClose={onClose} />,
  );
  return { view, onOpen, onClose };
};

describe("the offer is spent by a person", () => {
  it("asks to open without recording that it did", async () => {
    const { onOpen } = mount(false);
    await waitFor(() => expect(onOpen).toHaveBeenCalled());
    /* Nothing written. A reader who is redirected past this screen before the
       modal paints has still not been offered anything. */
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("records it on the first press, whatever the press was", async () => {
    mount(true);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(window.localStorage.getItem(KEY)).toContain('"offered":true');
  });

  it("does not ask again once it has been shut", async () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ v: 1, data: { offered: true, dismissed: true } }),
    );
    const { onOpen } = mount(false);
    /* Read through `current()`, which hydrates. The subscribed snapshot is the
       seed for a microtask after a reload, and deciding from that is how the
       first version reopened itself on every single load. */
    await new Promise((r) => setTimeout(r, 20));
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe("it opens on the work that is left", () => {
  it("shows the step that is not done, not the first one", () => {
    mount(true);
    expect(screen.getByText("Payroll checks")).toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
  });

  it("counts progress, and does not also count the step number", () => {
    mount(true);
    /* Two counts sharing a denominator and meaning different axes — "Step 1 of
       5" beside "4 of 5 done" — is the claim-under-the-wrong-label mistake this
       codebase keeps a helper for one module along. The dots say the position. */
    expect(screen.getByText("5 of 6 set up so far.")).toBeInTheDocument();
    expect(screen.queryByText(/Step \d+ of/)).not.toBeInTheDocument();
  });

  it("takes its status from the checklist, never from pressing Next", async () => {
    mount(true);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    /* Four presses later the same step is still the one that needs attention.
       A tour that ticked what it walked past would tell a company its payroll
       was set up when it was not. */
    expect(screen.getByText("Payroll checks")).toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("5 of 6 set up so far.")).toBeInTheDocument();
  });
});

describe("it stays out of the way", () => {
  it("never asks to open when there is nothing outstanding", async () => {
    facts = {
      ...NEARLY_DONE,
      payrollChecks: { ...NEARLY_DONE.payrollChecks, missingBankAccount: 0 },
    };
    const { onOpen } = mount(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("renders nothing at all while it is shut", () => {
    const { view } = mount(false);
    expect(view.container).toBeEmptyDOMElement();
  });
});
