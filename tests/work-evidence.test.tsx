import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiEvidenceTask, ApiWorkEvidence } from "@/lib/api/work-trackers";

/**
 * What the evidence card says when there is nothing to say.
 *
 * Four of its figures can be absent for an ordinary reason: nothing finished
 * had a due date, so there is no on-time rate; nothing finished at all, so
 * there is no median. Absent is not nil — "—" says nobody can tell, "0%" says
 * everything finished late — and these pin the two apart, along with the three
 * states in which the whole card has nothing to show.
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

/** The figure printed in the stat whose label is `label`. */
const figure = (label: string) => {
  const stat = screen.getByText(label).closest("div")?.parentElement;
  if (!stat) throw new Error(`No stat labelled ${label}`);
  return within(stat);
};

beforeEach(() => {
  reload.mockClear();
  read = { evidence: null, loading: false, error: null };
});

describe("a figure that cannot be worked out", () => {
  it("shows a dash, not 0%, when nothing finished had a due date", () => {
    read.evidence = evidence({ completed: 3, completedWithDueDate: 0 });
    renderCard();
    expect(figure("On time").getByText("—")).toBeTruthy();
    expect(figure("On time").getByText("None had a due date")).toBeTruthy();
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("shows a dash, not 0, when there is no median", () => {
    read.evidence = evidence({ medianDaysToClose: null });
    renderCard();
    expect(figure("Median days to finish").getByText("—")).toBeTruthy();
  });

  it("still shows 0% when everything with a due date finished late", () => {
    read.evidence = evidence({
      completed: 3,
      completedWithDueDate: 3,
      completedOnTime: 0,
      onTimeRate: 0,
    });
    renderCard();
    expect(figure("On time").getByText("0%")).toBeTruthy();
    expect(figure("On time").getByText("0 of 3 with a due date")).toBeTruthy();
  });

  it("still shows 0 when tickets are finished the day they are opened", () => {
    read.evidence = evidence({ medianDaysToClose: 0 });
    renderCard();
    expect(figure("Median days to finish").getByText("0")).toBeTruthy();
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
    expect(screen.queryByText("On time")).toBeNull();
  });
});

describe("what became of each ticket", () => {
  it("tells a ticket that was never a weekly task from one awaiting a grade", () => {
    read.evidence = evidence({}, [
      task({ id: "a", key: "PAY-1", statusName: "Shipped" }),
      task({
        id: "b",
        key: "PAY-2",
        statusName: "Shipped",
        objectiveTask: { id: "o1", goalId: "g1", grade: null },
      }),
      task({
        id: "c",
        key: "PAY-3",
        statusName: "Shipped",
        objectiveTask: { id: "o2", goalId: "g1", grade: "COMPLETED" },
      }),
    ]);
    renderCard();
    expect(screen.getByText("Not counted")).toBeTruthy();
    expect(screen.getByText("Waiting on a grade")).toBeTruthy();
    expect(screen.getAllByText("Done")).toHaveLength(1);
  });
});
