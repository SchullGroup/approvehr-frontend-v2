import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";

/**
 * Exit management answers for whoever opens it.
 *
 * The row is in everybody's sidebar now (`employee-door.test.tsx`), so the
 * screen has to be worth arriving at for somebody who is not HR: an employee
 * who came to hand in their notice, a manager who came to see their team's.
 * Before this the page was HR's register for everybody — an employee who found
 * it by URL was told "Nobody is leaving" with nothing to press, which is a
 * claim about the company from somebody who can see one row of it.
 */

type Row = {
  id: string;
  status: "AWAITING_MANAGER" | "COMPLETED";
  statusLabel: string;
  kindLabel: string;
  lastWorkingDay: string;
  employee: { name: string; jobTitle: string; departmentName: string | null };
  progress: { done: number; total: number; percent: number };
};

let held: ReadonlySet<string>;
let rows: Row[];
let reloadRegister: () => void;
let mine: {
  available: boolean;
  exit: null;
  start: () => Promise<string>;
  reload: () => void;
};

vi.mock("@/lib/permissions", () => ({
  useCan: (permission: string) => held.has(permission),
  Can: ({
    permission,
    children,
  }: {
    permission: string;
    children: React.ReactNode;
  }) => (held.has(permission) ? children : null),
}));

vi.mock("@/lib/store/offboarding", () => ({
  useExits: () => ({
    rows,
    loading: false,
    error: null,
    reload: () => reloadRegister(),
    source: "api",
  }),
  useMyExit: () => mine,
}));

/* The page chrome and the HR-only start dialog are other files' business. */
vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({
    title,
    action,
  }: {
    title: string;
    action?: React.ReactNode;
  }) => (
    <header>
      <h1>{title}</h1>
      {action}
    </header>
  ),
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/app/(app)/people/offboarding/start-exit", () => ({
  StartExitDialog: () => null,
}));

const { OffboardingScreen } =
  await import("@/app/(app)/people/offboarding/offboarding-screen");

const ONE_ROW: Row = {
  id: "x1",
  status: "AWAITING_MANAGER",
  statusLabel: "Waiting for their manager",
  kindLabel: "Resignation",
  lastWorkingDay: "2026-11-30",
  employee: {
    name: "Emeka Anyanwu",
    jobTitle: "Analyst",
    departmentName: null,
  },
  progress: { done: 0, total: 5, percent: 0 },
};

beforeEach(() => {
  held = new Set();
  rows = [];
  reloadRegister = vi.fn();
  mine = {
    available: true,
    exit: null,
    start: () => Promise.resolve("x1"),
    reload: () => {},
  };
});

describe("an employee, who holds nothing", () => {
  it("sees the register catch up once their notice is sent", async () => {
    /* Found by looking at a screenshot, not by a type: the card above said
       "You are leaving" while the register under it still said "No exits to
       show". The door refreshed its own copy of the exit and nobody told the
       list. Two contradicting claims on one screen is the defect this product
       is sold against, so the screen must re-ask the register when the door
       reports that something was started. */
    render(
      <ToastProvider>
        <OffboardingScreen />
      </ToastProvider>,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Resignation request" }),
    );
    fireEvent.change(screen.getByLabelText(/My last day/), {
      target: { value: "2026-11-30" },
    });
    fireEvent.change(screen.getByLabelText(/Why I am leaving/), {
      target: { value: "Moving abroad" },
    });
    const send = screen.getByRole("button", {
      name: "Send resignation request",
    });
    await userEvent.click(send);

    await waitFor(() => expect(reloadRegister).toHaveBeenCalled());
  });

  it("is offered the way to hand in their notice, already open", () => {
    render(<OffboardingScreen />);

    /* Open, not behind a second click: this is the page they came to. */
    expect(
      screen.getByRole("button", { name: "Resignation request" }),
    ).toBeVisible();
  });

  it("is not told nobody in the company is leaving", () => {
    render(<OffboardingScreen />);

    /* They can see their own exit and their reports'. A sentence about the
       company is not theirs to make, and "0 leaving" tiles over an empty list
       are the same claim in a smaller font. */
    expect(screen.queryByText("Nobody is leaving")).not.toBeInTheDocument();
    expect(screen.getByText("No exits to show")).toBeInTheDocument();
    /* Keyed on the tile's hint, not its label: the employee's own door is also
       headed "Leaving", and asserting on that word would be asserting on the
       wrong thing. */
    expect(screen.queryByText("still open")).not.toBeInTheDocument();
    expect(screen.queryByText("Waiting on a decision")).not.toBeInTheDocument();
  });

  it("is not pointed at a Profile page they are not on, nor given HR's controls", () => {
    render(<OffboardingScreen />);

    expect(screen.queryByText(/Staff hand in their own notice/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Start an exit/ }),
    ).not.toBeInTheDocument();
  });

  it("sees the figures once there is something to count", () => {
    rows = [ONE_ROW];
    render(<OffboardingScreen />);

    expect(screen.getByText("Emeka Anyanwu")).toBeInTheDocument();
    expect(screen.getByText("Waiting on a decision")).toBeInTheDocument();
  });

  it("gets nothing at all for a sign-in with no staff record behind it", () => {
    mine = { ...mine, available: false };
    render(<OffboardingScreen />);

    /* `Resign` already renders nothing there, because there is nobody to
       resign. The page must not invent a door for them. */
    expect(
      screen.queryByRole("button", { name: "Resignation request" }),
    ).not.toBeInTheDocument();
  });
});

describe("HR, who holds EDIT_RECORDS", () => {
  beforeEach(() => {
    held = new Set(["EDIT_RECORDS"]);
  });

  it("still gets the register exactly as it was", () => {
    render(<OffboardingScreen />);

    expect(screen.getByText("Nobody is leaving")).toBeInTheDocument();
    expect(screen.getByText("still open")).toBeInTheDocument();
    expect(screen.getByText("Waiting on a decision")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Start an exit/ }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/Staff hand in their own notice/)).toBeVisible();
  });

  it("is not handed the employee's door on top of the register", () => {
    render(<OffboardingScreen />);

    /* HR's own notice is on their Profile like anybody's; a second door above
       the thing they came to administer is noise. */
    expect(
      screen.queryByRole("button", { name: "Resignation request" }),
    ).not.toBeInTheDocument();
  });
});
