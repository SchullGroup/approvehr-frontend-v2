import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiTaskForGrading } from "@/lib/api/performance";

/**
 * "Mark N synced tasks done" grades every synced task on the page Completed in
 * one click. It asks first, says how many and for whom, and only then sends.
 */

let queue: ApiTaskForGrading[] = [];
const confirm = vi.fn<
  (ids: string[]) => Promise<{
    graded: string[];
    skipped: { id: string; reason: string }[];
  }>
>();

vi.mock("@/lib/store/performance", () => ({
  useTasksForGrading: () => ({
    tasks: queue,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useTaskActions: () => ({ editable: true, gradeTask: vi.fn() }),
}));
vi.mock("@/lib/api/work-trackers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/work-trackers")>()),
  workTrackersApi: { confirm: (ids: string[]) => confirm(ids) },
}));

const { ReviewTasksTab } = await import("@/app/(app)/performance/review-tasks");

const synced = (id: string, employeeId: string): ApiTaskForGrading => ({
  id,
  employeeId,
  employeeName: `Person ${employeeId}`,
  goalId: "g1",
  goalTitle: "Ship the ingestion agent",
  description: "PAY-1 Retry the payment",
  source: { provider: "JIRA", key: "PAY-1", url: "https://example.com/PAY-1" },
  createdAt: "2026-10-08T09:00:00.000Z",
});

beforeEach(() => {
  confirm.mockReset();
  confirm.mockImplementation((ids) =>
    Promise.resolve({ graded: ids, skipped: [] }),
  );
  queue = [synced("t1", "e1"), synced("t2", "e1"), synced("t3", "e2")];
});

describe("the bulk confirm button", () => {
  it("asks first, and says how many tasks and how many people", async () => {
    const user = userEvent.setup();
    render(<ReviewTasksTab />);

    await user.click(
      screen.getByRole("button", { name: "Mark 3 synced tasks done" }),
    );

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("Mark 3 synced tasks done?"),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent(/for 2 people/);
    expect(dialog).toHaveTextContent(/recorded as graded by you/);
    /* Nothing has been sent by opening it. */
    expect(confirm).not.toHaveBeenCalled();
  });

  it("sends nothing if it is cancelled", async () => {
    const user = userEvent.setup();
    render(<ReviewTasksTab />);
    await user.click(
      screen.getByRole("button", { name: "Mark 3 synced tasks done" }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).not.toHaveBeenCalled();
  });

  it("sends every synced task once it is confirmed", async () => {
    const user = userEvent.setup();
    render(<ReviewTasksTab />);
    await user.click(
      screen.getByRole("button", { name: "Mark 3 synced tasks done" }),
    );
    await user.click(screen.getByRole("button", { name: "Mark done" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm).toHaveBeenCalledWith(["t1", "t2", "t3"]);
  });
});
