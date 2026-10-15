import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { ApiExit, ApiExitReadiness } from "@/lib/api/offboarding";

/**
 * Taking an exit request back, from the button to the confirmation.
 *
 * The 2026-10-08 rename made the opening button "Withdraw exit request" and left
 * the rest of the flow in the old vocabulary: a dialog titled "Withdraw my
 * notice" (or "Cancel Emeka's exit"), a confirm button reading "Withdraw it" (or
 * "Cancel the exit"), a toast saying "Your notice has been withdrawn" (or
 * "Emeka is staying"), and a banner saying "Emeka is staying". Five names for
 * one act, and the person pressing the button met three of them.
 *
 * One act, one name, from the button to the toast to the banner left behind.
 */

type Held = ReadonlySet<string>;

let held: Held;
let signedInAs: string;
let exit: ApiExit;
let withdraw: (reason?: string) => Promise<void>;

vi.mock("@/lib/permissions", () => ({
  useCan: (permission: string) => held.has(permission),
}));

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ employeeId: signedInAs, displayName: "Somebody" }),
}));

vi.mock("@/lib/store/assets", () => ({
  useEquipment: () => ({ takeBack: vi.fn() }),
}));

vi.mock("@/lib/store/offboarding", () => ({
  useExit: () => ({
    exit,
    readiness: READINESS,
    loading: false,
    error: null,
    source: "api",
    reload: vi.fn(),
    withdraw: (reason?: string) => withdraw(reason),
    managerApprove: vi.fn(),
    hrApprove: vi.fn(),
    decline: vi.fn(),
    complete: vi.fn(),
    updateTask: vi.fn(),
    verifyTask: vi.fn(),
    saveInterview: vi.fn(),
  }),
}));

/* The page chrome, the checklist and the interview are other files' business. */
vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => (
    <header>
      <h1>{title}</h1>
    </header>
  ),
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/app/(app)/people/offboarding/[id]/checklist", () => ({
  Checklist: () => null,
}));
vi.mock("@/app/(app)/people/offboarding/[id]/interview-panel", () => ({
  InterviewPanel: () => null,
}));

const { ExitDetailScreen } =
  await import("@/app/(app)/people/offboarding/[id]/exit-detail-screen");

const PROGRESS = {
  total: 5,
  done: 1,
  mandatory: 3,
  mandatoryDone: 1,
  percent: 20,
};

const IN_PROGRESS: ApiExit = {
  id: "x1",
  employee: {
    id: "e1",
    name: "Emeka Anyanwu",
    employeeNo: "AHR-0007",
    jobTitle: "Analyst",
    departmentName: null,
  },
  manager: { id: "m1", name: "Adaeze Okonkwo" },
  kind: "RESIGNATION",
  kindLabel: "Resignation",
  reason: "Moving abroad",
  lastWorkingDay: "2026-11-30",
  noticeGivenOn: "2026-10-01",
  noticeDays: 60,
  status: "IN_PROGRESS",
  statusLabel: "Checklist open",
  managerApprovedByName: "Adaeze Okonkwo",
  managerApprovedAt: "2026-10-02T09:00:00.000Z",
  hrApprovedByName: "Fatima Bello",
  hrApprovedAt: "2026-10-03T09:00:00.000Z",
  declinedReason: null,
  completedAt: null,
  createdAt: "2026-10-01T09:00:00.000Z",
  progress: PROGRESS,
  groups: [],
  interview: null,
};

const READINESS: ApiExitReadiness = {
  exitId: "x1",
  status: "IN_PROGRESS",
  statusLabel: "Checklist open",
  lastWorkingDay: "2026-11-30",
  daysToLastWorkingDay: 52,
  progress: PROGRESS,
  approvals: {
    manager: {
      required: true,
      done: true,
      byName: "Adaeze Okonkwo",
      at: "2026-10-02T09:00:00.000Z",
    },
    hr: { done: true, byName: "Fatima Bello", at: "2026-10-03T09:00:00.000Z" },
  },
  canComplete: false,
  blockers: ["Final pay is not agreed"],
  outstanding: [],
  awaitingConfirmation: [],
  assetsStillHeld: [],
  finalPay: {
    lastWorkingDay: "2026-11-30",
    outstandingLoanKobo: 0,
    untakenLeave: [],
    heldValueKobo: 0,
    agreed: false,
  },
};

const mount = () =>
  render(
    <ToastProvider>
      <ExitDetailScreen id="x1" />
    </ToastProvider>,
  );

beforeEach(() => {
  held = new Set();
  signedInAs = "e1";
  exit = IN_PROGRESS;
  withdraw = vi.fn().mockResolvedValue(undefined);
});

describe("somebody taking back their own exit request", () => {
  it("is asked in the same words as the button that opened it, and told in them", async () => {
    mount();

    await userEvent.click(
      screen.getByRole("button", { name: "Withdraw exit request" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Withdraw exit request" }),
    ).toBeInTheDocument();
    /* The old confirm button, which said "Withdraw it" over a dialog titled
       "Withdraw my notice" opened from a button that said neither. */
    expect(
      within(dialog).queryByRole("button", { name: "Withdraw it" }),
    ).toBeNull();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Withdraw exit request" }),
    );

    await waitFor(() => expect(withdraw).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText("Your exit request has been withdrawn"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Your notice has been withdrawn")).toBeNull();
  });
});

describe("HR taking back somebody else's", () => {
  beforeEach(() => {
    held = new Set(["EDIT_RECORDS"]);
    signedInAs = "hr1";
  });

  it("names the person and the request, and says so again afterwards", async () => {
    mount();

    await userEvent.click(
      screen.getByRole("button", { name: "Withdraw exit request" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", {
        name: "Withdraw Emeka's exit request",
      }),
    ).toBeInTheDocument();
    /* Not "Cancel the exit": nothing is cancelled here that was not asked for,
       and the other half of this flow, "Not going ahead", is somebody refusing. */
    expect(
      within(dialog).queryByRole("button", { name: "Cancel the exit" }),
    ).toBeNull();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Withdraw exit request" }),
    );

    expect(
      await screen.findByText("Emeka's exit request has been withdrawn"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Emeka is staying")).toBeNull();
  });
});

describe("an exit request that has been withdrawn", () => {
  it("says so in the banner, in the same words", () => {
    exit = { ...IN_PROGRESS, status: "CANCELLED", statusLabel: "Cancelled" };
    mount();

    expect(screen.getByText("Exit request withdrawn")).toBeInTheDocument();
    expect(screen.queryByText("Emeka is staying")).toBeNull();
    /* Closed: there is nothing left to withdraw. */
    expect(
      screen.queryByRole("button", { name: "Withdraw exit request" }),
    ).toBeNull();
  });
});
