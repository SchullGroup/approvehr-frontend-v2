import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PeriodPeople } from "@/app/(app)/performance/periods/[id]/period-people";
import type { ApiParticipant } from "@/lib/api/performance";

/**
 * The People tab lists each person once, with their own review and each reviewer
 * under them, so a name is never repeated down the page.
 */
const row = (
  name: string,
  self: boolean | null,
  managers: [string, boolean][],
): ApiParticipant => ({
  employeeId: name,
  employeeName: name,
  departmentId: null,
  self: self === null ? null : { reviewId: `self-${name}`, submitted: self },
  managers: managers.map(([managerName, submitted]) => ({
    reviewId: `m-${name}-${managerName}`,
    submitted,
    finalised: false,
    managerName,
    rating: null,
  })),
  peers: { asked: 0, answered: 0 },
});

const ROWS = [
  row("Grace Effiong", false, [
    ["Tunde Bakare", false],
    ["Halima Sani", true],
  ]),
  row("Musa Ibrahim", true, [["Tunde Bakare", true]]),
];

describe("the people tab", () => {
  it("shows a person once, with the reviewers under them", () => {
    render(<PeriodPeople rows={ROWS} onRemind={null} />);
    expect(screen.getAllByText("Grace Effiong")).toHaveLength(1);
    const card = screen.getByText("Grace Effiong").closest("li") as HTMLElement;
    expect(within(card).getByText("Their own review")).toBeInTheDocument();
    expect(
      within(card).getByText("Review by Tunde Bakare"),
    ).toBeInTheDocument();
    expect(within(card).getByText("Review by Halima Sani")).toBeInTheDocument();
    expect(within(card).getByText("1 of 3 in")).toBeInTheDocument();
  });

  it("starts with who is still waiting, and can show everyone", async () => {
    const user = userEvent.setup();
    render(<PeriodPeople rows={ROWS} onRemind={null} />);
    expect(screen.queryByText("Musa Ibrahim")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Everyone/ }));
    expect(screen.getByText("Musa Ibrahim")).toBeInTheDocument();
    expect(screen.getByText("All in")).toBeInTheDocument();
  });

  it("finds a person, and offers a reminder only when it can send one", async () => {
    const remind = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<PeriodPeople rows={ROWS} onRemind={remind} />);
    await user.click(screen.getByRole("button", { name: "Send a reminder" }));
    expect(remind).toHaveBeenCalledTimes(1);
    await user.type(screen.getByLabelText("Find a person"), "zzz");
    expect(screen.getByText("Nobody matches")).toBeInTheDocument();
    rerender(<PeriodPeople rows={ROWS} onRemind={null} />);
    expect(
      screen.queryByRole("button", { name: "Send a reminder" }),
    ).toBeNull();
  });
});
