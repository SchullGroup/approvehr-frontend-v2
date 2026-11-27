import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiEvidenceTask, ApiWorkEvidence } from "@/lib/api/work-trackers";

/**
 * Tickets from a connected tool, as one list with no heading.
 *
 * What is proved: a ticket reads as its key (a link to the tool, in a new tab), its title and one small
 * line (when it was finished, or where it stands if it was not); the card says how many finished in one
 * small line and carries every rule behind one info mark; there is no row of stat tiles, no heading that
 * names the card, and no weekly-task column, whatever the API says the ticket became; and the card has
 * nothing to show when there are no tickets, when the reader may not see them, and while it loads.
 */

const reload = vi.fn();

let read: {
  evidence: ApiWorkEvidence | null;
  loading: boolean;
  error: ApiError | null;
};

vi.mock("@/lib/store/work-trackers", () => ({
  useWorkEvidence: () => ({ ...read, reload }),
}));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
}));

const { WorkEvidence } = await import("@/components/performance/work-evidence");

const task = (over: Partial<ApiEvidenceTask> = {}): ApiEvidenceTask => ({
  id: "t1",
  provider: "JIRA",
  key: "PAY-142",
  title: "Retry failed transfers",
  url: "https://acme.atlassian.net/browse/PAY-142",
  projectKey: "PAY",
  status: "DONE",
  statusName: "Done",
  dueAt: null,
  completedAt: "2026-10-06T10:00:00.000Z",
  objectiveTask: null,
  ...over,
});

const evidence = (
  summary: Partial<ApiWorkEvidence["summary"]> = {},
  tasks: ApiEvidenceTask[] = [task()],
): ApiWorkEvidence => ({
  employeeId: "e1",
  from: "2026-10-01",
  to: "2026-10-31",
  summary: {
    completed: 1,
    completedWithDueDate: 0,
    completedOnTime: 0,
    onTimeRate: null,
    openOverdue: 0,
    medianDaysToClose: null,
    ...summary,
  },
  tasks,
});

const renderCard = () =>
  render(<WorkEvidence employeeId="e1" range={{ cycleId: "c1" }} />);

beforeEach(() => {
  reload.mockClear();
  read = { evidence: null, loading: false, error: null };
});

describe("the list", () => {
  it("has no heading and no table, only the card named for a screen reader", () => {
    read.evidence = evidence({ completed: 1 });
    renderCard();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(
      screen.getByRole("region", { name: "Work from connected tools" }),
    ).toBeTruthy();
  });

  it("says how many finished, in one small line, and no figure beside it", () => {
    read.evidence = evidence({
      completed: 12,
      completedWithDueDate: 9,
      completedOnTime: 7,
      onTimeRate: 78,
      openOverdue: 2,
      medianDaysToClose: 3,
    });
    renderCard();
    expect(screen.getByText("12 finished")).toBeTruthy();
    for (const gone of [
      "On time",
      "Open and overdue",
      "Median days to finish",
      "78%",
    ]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
  });

  it("says none finished, not zero, when only open tickets are there", () => {
    read.evidence = evidence({ completed: 0 }, [
      task({ completedAt: null, status: "TODO", statusName: "Backlog" }),
    ]);
    renderCard();
    expect(screen.getByText("None finished")).toBeTruthy();
  });

  it("reads a ticket as its key, its title and when it was finished", () => {
    read.evidence = evidence({}, [task()]);
    renderCard();
    const link = screen.getByRole("link", { name: /PAY-142/ });
    expect(link.getAttribute("href")).toBe(
      "https://acme.atlassian.net/browse/PAY-142",
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.getByText("Retry failed transfers")).toBeTruthy();
    expect(screen.getByText("Finished 6 Oct 2026")).toBeTruthy();
  });

  it("says where an unfinished ticket stands, in the tool's own word", () => {
    read.evidence = evidence({}, [
      task({
        completedAt: null,
        status: "IN_PROGRESS",
        statusName: "In review",
      }),
    ]);
    renderCard();
    expect(screen.getByText("In review")).toBeTruthy();
    expect(screen.queryByText(/^Finished/)).toBeNull();
  });

  it("has no weekly-task column: nothing says a ticket is counted or waiting on a grade", () => {
    read.evidence = evidence({}, [
      task({ id: "a", key: "PAY-1" }),
      task({
        id: "b",
        key: "PAY-2",
        objectiveTask: { id: "o1", goalId: "g1", grade: null },
      }),
      task({
        id: "c",
        key: "PAY-3",
        objectiveTask: { id: "o2", goalId: "g1", grade: "COMPLETED" },
      }),
    ]);
    renderCard();
    expect(screen.queryByText("Not counted")).toBeNull();
    expect(screen.queryByText("Waiting on a grade")).toBeNull();
    expect(screen.queryByText("Completed")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("keeps the rules behind one info mark, not in a paragraph", async () => {
    read.evidence = evidence({}, [task()]);
    renderCard();
    expect(screen.queryByText(/not part of the score/)).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "About this list" }),
    );
    expect(
      screen.getByText(/Tickets from Jira, 1 Oct 2026 to 31 Oct 2026/),
    ).toBeTruthy();
    expect(screen.getByText(/not part of the score/)).toBeTruthy();
  });

  it("shows the first ten and the rest on request", async () => {
    read.evidence = evidence(
      { completed: 12 },
      Array.from({ length: 12 }, (_, i) =>
        task({ id: `t${String(i)}`, key: `PAY-${String(i)}` }),
      ),
    );
    renderCard();
    expect(screen.getAllByRole("link")).toHaveLength(10);
    await userEvent.click(screen.getByRole("button", { name: "Show all 12" }));
    expect(screen.getAllByRole("link")).toHaveLength(12);
  });
});

describe("when the card has nothing to show", () => {
  it("renders nothing when there are no tickets", () => {
    read.evidence = evidence({ completed: 0 }, []);
    const { container } = renderCard();
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the reader is not allowed to see them", () => {
    read.error = new ApiError(403, "forbidden", "Not yours to see.");
    const { container } = renderCard();
    expect(container.firstChild).toBeNull();
  });

  it("says it could not load, with a retry, on any other failure", async () => {
    read.error = new ApiError(500, "internal", "Something went wrong.");
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("holds its place with a skeleton, and no figures, while it waits", () => {
    read.loading = true;
    const { container } = renderCard();
    /* Nothing at all is what an answered "no tickets" looks like, so a
       placeholder here is the only thing telling the two apart. */
    expect(container.firstChild).not.toBeNull();
    expect(screen.queryByText(/finished/)).toBeNull();
  });
});
