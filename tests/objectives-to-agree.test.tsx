import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiGoal } from "@/lib/api/performance";
import { ApiError } from "@/lib/api/client";
import {
  NO_FILTERS,
  approvalWords,
  filterQueue,
  groupQueue,
  queueOptions,
  targetLine,
} from "@/lib/performance/objective-queue";

/**
 * "Objectives to agree", redone in the rhythm of My approvals (owner request,
 * 24 Nov 2026).
 *
 * - No number cards above the list.
 * - One line a row (title and target, whose, period), opened for the rest.
 * - Two answers, Agree and Decline. Decline needs feedback, and is the API's
 *   send-back, so the owner can change it and send it again; the terminal
 *   refusal is not offered.
 * - Filters by person, department, period and level, with a search box and
 *   chips, and an optional grouping.
 */

const state = vi.hoisted(() => ({
  queue: [] as ApiGoal[],
  loading: false,
  couldHaveQueue: true,
  agree: vi.fn(),
  sendBack: vi.fn(),
  reject: vi.fn(),
  reload: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/performance/kpis",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/store/performance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/performance")>()),
  useObjectiveApprovals: () => ({
    queue: state.queue,
    loading: state.loading,
    error: null,
    source: "api",
    couldHaveQueue: state.couldHaveQueue,
    reload: state.reload,
  }),
  useObjectiveMutations: () => ({
    agree: state.agree,
    sendBack: state.sendBack,
    reject: state.reject,
  }),
}));
vi.mock("@/lib/store/features", () => ({
  useFeatures: () => ({ appraisals: true, loading: false, projects: false }),
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({
    employees: [],
    people: [
      { id: "ada", fullName: "Ada Eze", departmentId: "fin" },
      { id: "tunde", fullName: "Tunde Bello", departmentId: "sales" },
    ],
    loading: false,
  }),
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({
    flat: [
      { id: "fin", name: "Finance" },
      { id: "sales", name: "Sales" },
    ],
  }),
  useHeadedDepartmentIds: () => new Set<string>(),
}));
vi.mock("@/lib/store/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/session")>()),
  useSession: () => ({ employeeId: "me", actingId: "me", isConnected: true }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/components/performance/completed-work", () => ({
  CompletedWork: () => null,
}));

const { ObjectivesToAgree } =
  await import("@/app/(app)/performance/kpis/to-agree");

const goal = (over: Partial<ApiGoal> & { id: string }): ApiGoal =>
  ({
    title: over.id,
    description: null,
    ownerId: null,
    ownerName: null,
    departmentId: null,
    departmentName: null,
    level: "personal",
    companyWide: false,
    parentId: null,
    parentTitle: null,
    status: "ON_TRACK",
    progress: 0,
    measuredProgress: null,
    keyResults: [],
    approval: "AWAITING_APPROVAL",
    approvalLabel: "Waiting to be agreed",
    approvalNote: null,
    revisionCount: 0,
    submittedAt: "2026-11-20T09:00:00.000Z",
    reviewCycleId: "c-q4",
    reviewCycleName: "Q4 Appraisal",
    dueQuarter: "2026-Q4",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...over,
  }) as ApiGoal;

const RECON = goal({
  id: "recon",
  title: "Reconcile the bank daily",
  description: "Every account, every working day.",
  ownerId: "ada",
  ownerName: "Ada Eze",
  keyResults: [
    {
      id: "kr-1",
      label: "Days reconciled",
      kind: "NUMBER",
      unit: "days",
      startValue: "0",
      targetValue: "20",
      currentValue: "4",
      lowerIsBetter: false,
      met: false,
      lastReadAt: "2026-11-18T00:00:00.000Z",
    } as unknown as ApiGoal["keyResults"][number],
  ],
});
const CALLS = goal({
  id: "calls",
  title: "Call twenty customers",
  ownerId: "tunde",
  ownerName: "Tunde Bello",
  reviewCycleId: null,
  reviewCycleName: null,
  dueQuarter: "2027-Q1",
});
const CLOSE = goal({
  id: "close",
  title: "Close the books in five days",
  level: "department",
  departmentId: "fin",
  departmentName: "Finance",
});

beforeEach(() => {
  state.queue = [RECON, CALLS, CLOSE];
  state.loading = false;
  state.couldHaveQueue = true;
  state.agree = vi.fn().mockResolvedValue({});
  state.sendBack = vi.fn().mockResolvedValue({});
  state.reject = vi.fn().mockResolvedValue({});
  state.reload = vi.fn();
});

const show = () => {
  const user = userEvent.setup();
  render(
    <ObjectivesToAgree
      approvals={{
        queue: state.queue,
        loading: state.loading,
        error: null,
        source: "api",
        couldHaveQueue: state.couldHaveQueue,
        reload: state.reload,
      }}
    />,
  );
  return user;
};
/* The row's own toggle: its name starts with the title, where Agree's and
   Decline's start with the act. */
const toggleOf = (title: string) =>
  screen.getByRole("button", { name: new RegExp(`^${title}`) });
const row = (title: string) => toggleOf(title).closest("li")!;

describe("the queue", () => {
  it("has no number cards above it, and no New appraisal period", () => {
    show();
    expect(screen.queryByText("Waiting on you")).not.toBeInTheDocument();
    expect(screen.queryByText("With a target on them")).not.toBeInTheDocument();
    expect(screen.queryByText(/new appraisal period/i)).not.toBeInTheDocument();
  });

  it("puts one objective on one line, with its target, whose it is and the period, closed", () => {
    show();
    const recon = row("Reconcile the bank daily");
    expect(
      within(recon).getByText(/Days reconciled: 0 days to 20 days/),
    ).toBeInTheDocument();
    expect(
      within(recon).getByText(/Ada Eze · Q4 Appraisal/),
    ).toBeInTheDocument();
    expect(
      within(recon).getByRole("button", { name: /^Reconcile the bank daily/ }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByText("Every account, every working day."),
    ).not.toBeInTheDocument();
    expect(
      within(row("Close the books in five days")).getByText(
        /Finance, the department/,
      ),
    ).toBeInTheDocument();
    expect(
      within(row("Call twenty customers")).getByText(/No target/),
    ).toBeInTheDocument();
  });

  it("opens a row to what it says, every target with where it stands, and its history", async () => {
    const user = show();
    await user.click(toggleOf("Reconcile the bank daily"));
    const recon = row("Reconcile the bank daily");
    expect(
      within(recon).getByRole("button", { name: /^Reconcile the bank daily/ }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      within(recon).getByText("Every account, every working day."),
    ).toBeInTheDocument();
    expect(
      within(recon).getByText(/from 0 days to 20 days/),
    ).toBeInTheDocument();
    expect(within(recon).getByText(/now 4 days/)).toBeInTheDocument();
    expect(within(recon).getByText(/Sent to be agreed on/)).toBeInTheDocument();
  });

  it("offers two answers, Agree and Decline, and nothing else", () => {
    show();
    const recon = row("Reconcile the bank daily");
    const buttons = within(recon)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(buttons.slice(1)).toEqual(["Agree", "Decline"]);
    expect(screen.queryByRole("button", { name: /send it back/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /refuse/i })).toBeNull();
  });

  it("agrees after asking", async () => {
    const user = show();
    await user.click(
      within(row("Reconcile the bank daily")).getByRole("button", {
        name: /^Agree, /,
      }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Agree" }),
    );
    expect(state.agree).toHaveBeenCalledWith("recon");
  });
});

describe("Decline", () => {
  it("needs written feedback, and sends it back rather than refusing it", async () => {
    const user = show();
    await user.click(
      within(row("Reconcile the bank daily")).getByRole("button", {
        name: /^Decline, /,
      }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", {
        name: 'Decline "Reconcile the bank daily"?',
      }),
    ).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Decline" });
    expect(confirm).toBeDisabled();
    await user.type(
      within(dialog).getByRole("textbox", { name: /feedback/i }),
      "Twenty is every working day; make it eighteen.",
    );
    await user.click(confirm);
    expect(state.sendBack).toHaveBeenCalledWith(
      "recon",
      "Twenty is every working day; make it eighteen.",
    );
    expect(state.reject).not.toHaveBeenCalled();
  });

  it("keeps the dialog and the feedback when the server refuses, with its sentence", async () => {
    state.sendBack = vi
      .fn()
      .mockRejectedValue(
        new ApiError(
          409,
          "conflict",
          '"Reconcile the bank daily" is not waiting to be agreed — it is agreed.',
        ),
      );
    const user = show();
    await user.click(
      within(row("Reconcile the bank daily")).getByRole("button", {
        name: /^Decline, /,
      }),
    );
    const dialog = screen.getByRole("dialog");
    await user.type(
      within(dialog).getByRole("textbox", { name: /feedback/i }),
      "Too vague.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Decline" }));
    expect(
      within(screen.getByRole("dialog")).getByText(/it is agreed\./),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).getByRole("textbox", {
        name: /feedback/i,
      }),
    ).toHaveValue("Too vague.");
  });
});

describe("finding one", () => {
  it("has no search, filter or sentence of rules above the list", () => {
    show();
    expect(
      screen.queryByLabelText(/search the objectives waiting/i),
    ).toBeNull();
    expect(screen.queryByText(/Nobody agrees their own/)).toBeNull();
  });

  it("groups by department, a personal objective under its owner's, with no dropdown to say so", () => {
    show();
    expect(
      screen.queryByRole("combobox", { name: "Group the list" }),
    ).toBeNull();
    const finance = screen.getByRole("region", { name: "Finance" });
    expect(
      within(finance).getByRole("button", {
        name: /^Reconcile the bank daily/,
      }),
    ).toBeInTheDocument();
    expect(
      within(finance).getByRole("button", {
        name: /^Close the books in five days/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Sales" })).toBeInTheDocument();
  });
});

describe("an empty queue", () => {
  it("says nothing is waiting, with a figure", () => {
    state.queue = [];
    show();
    expect(
      screen.getByRole("heading", { name: "Nothing waiting to be agreed" }),
    ).toBeInTheDocument();
    expect(document.querySelector("img")).not.toBeNull();
  });

  it("tells somebody who agrees nobody's that it is not part of their role", () => {
    state.queue = [];
    state.couldHaveQueue = false;
    show();
    expect(
      screen.getByRole("heading", { name: "You agree nobody's objectives" }),
    ).toBeInTheDocument();
  });
});

describe("the rules, as data", () => {
  const owners = new Map<string, string | null>([
    ["ada", "fin"],
    ["tunde", "sales"],
  ]);

  it("calls a sent-back objective Declined, in one word", () => {
    expect(
      approvalWords({ approval: "NEEDS_REVISION", approvalLabel: "Sent back" }),
    ).toBe("Declined");
    expect(approvalWords({ approval: "AGREED", approvalLabel: "Agreed" })).toBe(
      "Agreed",
    );
  });

  it("puts the first target on the line and counts the rest", () => {
    expect(targetLine(CALLS)).toBe("No target");
    expect(
      targetLine({
        keyResults: [...RECON.keyResults, ...RECON.keyResults],
      }),
    ).toBe("Days reconciled: 0 days to 20 days, and 1 more");
  });

  it("filters by person, department, period and level", () => {
    const all = [RECON, CALLS, CLOSE];
    const by = (over: Partial<typeof NO_FILTERS>) =>
      filterQueue(all, { ...NO_FILTERS, ...over }, owners).map((g) => g.id);
    expect(by({ person: "tunde" })).toEqual(["calls"]);
    expect(by({ department: "fin" })).toEqual(["recon", "close"]);
    expect(by({ period: "quarter:2027-Q1" })).toEqual(["calls"]);
    expect(by({ level: "department" })).toEqual(["close"]);
    expect(
      queueOptions(all, owners, [{ id: "fin", name: "Finance" }]).levels,
    ).toEqual(["department", "personal"]);
  });

  it("groups by person, keeping a department's own objective apart", () => {
    const groups = groupQueue(
      [RECON, CALLS, CLOSE],
      "person",
      owners,
      new Map(),
    );
    expect(groups.map((group) => group.name)).toEqual([
      "Ada Eze",
      "Tunde Bello",
      "Finance, the department",
    ]);
  });
});
