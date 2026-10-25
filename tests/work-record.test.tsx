import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiWorkRecord } from "@/lib/api/performance";

/**
 * The Work record: what somebody finished on the boards, per period.
 *
 * `tsc` cannot see what these pin: which `period`/`date` each control asks the
 * API for, the exact tile wording, and the sentence a grade or a hidden link
 * turns into.
 */

vi.mock("@/lib/store/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/session")>()),
  useSession: () => ({ isConnected: true }),
}));

const workRecord = vi.fn();
const myWorkRecord = vi.fn();
vi.mock("@/lib/api/performance", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api/performance")>();
  return {
    ...real,
    performanceApi: {
      ...real.performanceApi,
      workRecord: (...args: unknown[]) => workRecord(...args),
      myWorkRecord: (...args: unknown[]) => myWorkRecord(...args),
    },
  };
});

const { WorkRecordPanel } =
  await import("@/components/performance/work-record");

const record = (over: Partial<ApiWorkRecord> = {}): ApiWorkRecord => ({
  employee: {
    id: "emp-1",
    name: "Ada Obi",
    jobTitle: "Engineer",
    departmentName: "Product",
  },
  period: {
    kind: "week",
    start: "2026-10-18T23:00:00.000Z",
    end: "2026-10-25T23:00:00.000Z",
    label: "Week of 19 Oct 2026",
  },
  summary: {
    finished: 4,
    withDueDate: 3,
    onTime: 2,
    completionRate: 75,
    graded: 2,
    linkedToObjective: 3,
  },
  byObjective: [
    {
      goalId: "g-1",
      title: "Grow pipeline",
      keyResultTitle: "Qualified leads",
      finished: 2,
      completionRate: 100,
    },
    {
      goalId: "g-1",
      title: "Grow pipeline",
      keyResultTitle: "Demos booked",
      finished: 1,
      completionRate: null,
    },
    {
      goalId: null,
      title: "Not linked to an objective",
      finished: 1,
      completionRate: null,
    },
  ],
  days: [
    {
      date: "2026-10-21",
      issues: [
        {
          id: "i-1",
          key: "PAY-1",
          title: "Fix payslip rounding",
          projectId: "p-1",
          projectName: "Payroll",
          type: "BUG",
          labels: ["urgent"],
          doneAt: "2026-10-21T09:00:00.000Z",
          dueDate: "2026-10-21",
          onTime: true,
          grade: "COMPLETED",
          gradedByName: "Bola",
          waitingForGrade: false,
          links: [{ label: "Blocks", otherKey: "PAY-2" }],
        },
        {
          id: "i-2",
          key: "PAY-3",
          title: "Write release notes",
          projectId: "p-1",
          projectName: "Payroll",
          type: "TASK",
          labels: [],
          doneAt: "2026-10-21T08:00:00.000Z",
          dueDate: null,
          onTime: null,
          grade: null,
          gradedByName: null,
          waitingForGrade: true,
          links: [{ label: "Is blocked by", otherKey: null }],
        },
        {
          id: "i-3",
          key: "PAY-4",
          title: "Tidy board",
          projectId: "p-1",
          projectName: "Payroll",
          type: "TASK",
          labels: [],
          doneAt: "2026-10-21T07:00:00.000Z",
          dueDate: null,
          onTime: null,
          grade: null,
          gradedByName: null,
          waitingForGrade: false,
          links: [],
        },
      ],
    },
  ],
  ...over,
});

beforeEach(() => {
  workRecord.mockReset();
  myWorkRecord.mockReset();
  workRecord.mockResolvedValue(record());
  myWorkRecord.mockResolvedValue(record());
});

describe("the Work record panel", () => {
  it("opens on Week for the person and asks for no date", async () => {
    render(<WorkRecordPanel employeeId="emp-1" />);
    expect(await screen.findByText("Week of 19 Oct 2026")).toBeTruthy();
    expect(
      screen.getByRole("radio", { name: "Week" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(workRecord).toHaveBeenCalledWith(
      "emp-1",
      { period: "week", date: undefined },
      expect.anything(),
    );
  });

  it("shows a personal task as Personal, with no link to a project page", async () => {
    const base = record();
    const day = base.days[0]!;
    workRecord.mockResolvedValue(
      record({
        days: [
          {
            ...day,
            issues: [
              {
                ...day.issues[0]!,
                id: "i-9",
                key: "MY-4",
                title: "Book the training room",
                projectId: "p-mine",
                projectName: "Personal",
              },
            ],
          },
        ],
      }),
    );
    render(<WorkRecordPanel employeeId="emp-1" />);
    expect(await screen.findByText("Book the training room")).toBeTruthy();
    expect(screen.getByText("MY-4").closest("a")).toBeNull();
    expect(screen.getByText("Personal")).toBeTruthy();
    expect(document.querySelector('a[href*="p-mine"]')).toBeNull();
  });

  it("uses the my-record route when there is no employee id", async () => {
    render(<WorkRecordPanel />);
    await screen.findByText("Week of 19 Oct 2026");
    expect(myWorkRecord).toHaveBeenCalledWith(
      { period: "week", date: undefined },
      expect.anything(),
    );
    expect(workRecord).not.toHaveBeenCalled();
  });

  it("re-fetches with the chosen period", async () => {
    const user = userEvent.setup();
    render(<WorkRecordPanel employeeId="emp-1" />);
    await screen.findByText("Week of 19 Oct 2026");
    await user.click(screen.getByRole("radio", { name: "Month" }));
    await waitFor(() =>
      expect(workRecord).toHaveBeenLastCalledWith(
        "emp-1",
        { period: "month", date: undefined },
        expect.anything(),
      ),
    );
  });

  it("moves back and forward one period by a date inside it", async () => {
    const user = userEvent.setup();
    render(<WorkRecordPanel employeeId="emp-1" />);
    await screen.findByText("Week of 19 Oct 2026");

    await user.click(screen.getByRole("button", { name: "Previous period" }));
    await waitFor(() =>
      expect(workRecord).toHaveBeenLastCalledWith(
        "emp-1",
        { period: "week", date: "2026-10-18" },
        expect.anything(),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Next period" }));
    await waitFor(() =>
      expect(workRecord).toHaveBeenLastCalledWith(
        "emp-1",
        { period: "week", date: "2026-10-26" },
        expect.anything(),
      ),
    );
  });

  it("shows the four tiles", async () => {
    render(<WorkRecordPanel employeeId="emp-1" />);
    await screen.findByText("Week of 19 Oct 2026");
    const tile = (label: string) =>
      screen.getByText(label).closest("div.rounded-lg") as HTMLElement;
    expect(within(tile("Tasks finished")).getByText("4")).toBeTruthy();
    expect(within(tile("Done by due date")).getByText("2 of 3")).toBeTruthy();
    expect(within(tile("Completion rate")).getByText("75%")).toBeTruthy();
    expect(
      within(tile("Count toward an objective")).getByText("3 of 4"),
    ).toBeTruthy();
  });

  it("shows a dash when nothing is graded", async () => {
    workRecord.mockResolvedValue(
      record({
        summary: {
          finished: 1,
          withDueDate: 0,
          onTime: 0,
          completionRate: null,
          graded: 0,
          linkedToObjective: 0,
        },
      }),
    );
    render(<WorkRecordPanel employeeId="emp-1" />);
    await screen.findByText("Week of 19 Oct 2026");
    const tile = screen
      .getByText("Completion rate")
      .closest("div.rounded-lg") as HTMLElement;
    expect(within(tile).getByText("—")).toBeTruthy();
  });

  it("does not say 0 of 0 when none of the finished tasks had a due date", async () => {
    workRecord.mockResolvedValue(
      record({
        summary: {
          finished: 2,
          withDueDate: 0,
          onTime: 0,
          completionRate: 50,
          graded: 2,
          linkedToObjective: 1,
        },
      }),
    );
    render(<WorkRecordPanel employeeId="emp-1" />);
    await screen.findByText("Week of 19 Oct 2026");
    const tile = screen
      .getByText("Done by due date")
      .closest("div.rounded-lg") as HTMLElement;
    expect(within(tile).getByText("—")).toBeTruthy();
    expect(within(tile).getByText("None of these had a due date")).toBeTruthy();
    expect(screen.queryByText("0 of 0")).toBeNull();
  });

  it("lists objectives with their counts, and the unlinked row", async () => {
    render(<WorkRecordPanel employeeId="emp-1" />);
    await screen.findByText("Week of 19 Oct 2026");
    expect(
      screen.getByText(/Grow pipeline · KPI: Qualified leads/),
    ).toBeTruthy();
    expect(screen.getByText(/Grow pipeline · KPI: Demos booked/)).toBeTruthy();
    expect(screen.getByText("Not linked to an objective")).toBeTruthy();
    expect(screen.getByText("2 finished · 100% complete")).toBeTruthy();
  });

  it("lists each day's issues with project, labels and grade wording", async () => {
    render(<WorkRecordPanel employeeId="emp-1" />);
    await screen.findByText("Week of 19 Oct 2026");
    expect(screen.getByText("21 Oct 2026")).toBeTruthy();
    const link = screen.getByRole("link", { name: "PAY-1" });
    expect(link.getAttribute("href")).toBe("/projects/p-1?issue=PAY-1");
    expect(screen.getByText("Fix payslip rounding")).toBeTruthy();
    expect(screen.getAllByText("Payroll").length).toBeGreaterThan(0);
    expect(screen.getByText("urgent")).toBeTruthy();
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.getByText("Waiting for a grade")).toBeTruthy();
  });

  it("says nothing about a grade for an issue with no weekly task", async () => {
    render(<WorkRecordPanel employeeId="emp-1" />);
    await screen.findByText("Tidy board");
    const row = screen.getByText("Tidy board").closest("li") as HTMLElement;
    expect(
      within(row).queryByText(/grade|Completed|completed|Rejected/),
    ).toBeNull();
  });

  it("words the other grades", async () => {
    const base = record();
    const issue = base.days[0]!.issues[0]!;
    workRecord.mockResolvedValue(
      record({
        days: [
          {
            date: "2026-10-21",
            issues: (
              ["PARTIALLY_COMPLETED", "NOT_COMPLETED", "REJECTED"] as const
            ).map((grade, n) => ({
              ...issue,
              id: `x${n}`,
              key: `K-${n}`,
              grade,
              links: [],
            })),
          },
        ],
      }),
    );
    render(<WorkRecordPanel employeeId="emp-1" />);
    expect(await screen.findByText("Partly completed")).toBeTruthy();
    expect(screen.getByText("Not completed")).toBeTruthy();
    expect(screen.getByText("Rejected")).toBeTruthy();
  });

  it("words a link, including one the viewer cannot open", async () => {
    render(<WorkRecordPanel employeeId="emp-1" />);
    await screen.findByText("Week of 19 Oct 2026");
    expect(screen.getByText("Blocks PAY-2")).toBeTruthy();
    expect(
      screen.getByText("Is blocked by a task you can't open"),
    ).toBeTruthy();
  });

  it("says so when nothing was finished", async () => {
    workRecord.mockResolvedValue(
      record({
        period: { kind: "month", start: "", end: "", label: "October 2026" },
        summary: {
          finished: 0,
          withDueDate: 0,
          onTime: 0,
          completionRate: null,
          graded: 0,
          linkedToObjective: 0,
        },
        byObjective: [],
        days: [],
      }),
    );
    render(<WorkRecordPanel employeeId="emp-1" />);
    expect(
      await screen.findByText("Nothing finished on the board in this month."),
    ).toBeTruthy();
  });

  it("says the per-person record cannot be opened on a 404", async () => {
    workRecord.mockRejectedValue(
      new ApiError(404, "not_found", "That employee was not found."),
    );
    render(<WorkRecordPanel employeeId="emp-1" />);
    expect(
      await screen.findByText("You can't open this person's work record."),
    ).toBeTruthy();
    expect(screen.queryByText(/may have been removed/i)).toBeNull();
  });

  it("says there is no staff record for my own view on a 404", async () => {
    myWorkRecord.mockRejectedValue(
      new ApiError(404, "not_found", "No employee."),
    );
    render(<WorkRecordPanel />);
    expect(
      await screen.findByText(
        "This sign-in has no staff record, so there is no work record to show.",
      ),
    ).toBeTruthy();
  });

  it("keeps the load failure for other errors", async () => {
    workRecord.mockRejectedValue(new ApiError(500, "boom", "Server broke."));
    render(<WorkRecordPanel employeeId="emp-1" />);
    expect(
      await screen.findByRole("button", { name: /try again|retry/i }),
    ).toBeTruthy();
    expect(
      screen.queryByText("You can't open this person's work record."),
    ).toBeNull();
  });
});
