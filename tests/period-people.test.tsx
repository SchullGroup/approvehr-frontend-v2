import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({
    flat: [
      { id: "d1", name: "Engineering" },
      { id: "d2", name: "Finance" },
    ],
  }),
}));

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
  departmentId: name === "Musa Ibrahim" ? "d2" : "d1",
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
  it("opens on a card for each department that still has people waiting", async () => {
    const user = userEvent.setup();
    render(<PeriodPeople rows={ROWS} onRemind={null} />);
    expect(
      screen.getByRole("button", { name: /Engineering/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Finance/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: /Everyone/ }));
    expect(screen.getByRole("button", { name: /Finance/ })).toBeInTheDocument();
  });

  it("shows a person once, with the reviewers under them once opened", async () => {
    const user = userEvent.setup();
    render(<PeriodPeople rows={ROWS} onRemind={null} />);
    await user.click(screen.getByRole("button", { name: /Engineering/ }));
    expect(screen.getAllByText("Grace Effiong")).toHaveLength(1);
    expect(screen.queryByText("Their own review")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Grace Effiong/ }));
    const card = screen
      .getByText("Their own review")
      .closest("li")!
      .closest("ul")!
      .closest("li") as HTMLElement;
    expect(
      within(card).getByText("Review by Tunde Bakare"),
    ).toBeInTheDocument();
    expect(within(card).getByText("Review by Halima Sani")).toBeInTheDocument();
    expect(within(card).getByText("1 of 3 in")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /All departments/ }));
    expect(
      screen.getByRole("button", { name: /Engineering/ }),
    ).toBeInTheDocument();
  });

  it("finds a person across departments, and offers a reminder only when it can send one", async () => {
    const remind = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<PeriodPeople rows={ROWS} onRemind={remind} />);
    await user.click(screen.getByRole("button", { name: "Send a reminder" }));
    expect(remind).toHaveBeenCalledTimes(1);
    await user.type(screen.getByLabelText("Find a person"), "grace");
    expect(screen.getByText("Grace Effiong")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Find a person"));
    await user.type(screen.getByLabelText("Find a person"), "zzz");
    expect(screen.getByText("Nobody matches")).toBeInTheDocument();
    rerender(<PeriodPeople rows={ROWS} onRemind={null} />);
    expect(
      screen.queryByRole("button", { name: "Send a reminder" }),
    ).toBeNull();
  });
});
