import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ManagerPreview } from "@/app/(app)/performance/appraisal-preview/manager/manager-preview";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/performance/appraisal-preview/manager",
  useSearchParams: () => new URLSearchParams(),
}));

const mount = () =>
  render(
    <ToastProvider>
      <ManagerPreview />
    </ToastProvider>,
  );

describe("the manager's team list (mock-up)", () => {
  it("shows overall progress and the people grouped by department, with a bar only on the one in progress", () => {
    mount();
    expect(screen.getByText("2 of 6 people done")).toBeVisible();
    for (const department of ["Sales", "Finance", "Operations"]) {
      expect(screen.getByRole("heading", { name: department })).toBeVisible();
    }
    /* The overall bar, and Team member C's. */
    expect(screen.getAllByRole("progressbar")).toHaveLength(2);
  });

  it("locks a row until the self review is sent, says why and offers a Remind that goes once used", async () => {
    mount();
    const row = screen.getByText("Team member E").closest("li") as HTMLElement;
    expect(within(row).getByText("Waiting on their self review")).toBeVisible();
    expect(within(row).queryByRole("button", { name: "Start" })).toBeNull();
    await userEvent.click(within(row).getByRole("button", { name: "Remind" }));
    await vi.waitFor(() =>
      expect(within(row).queryByRole("button", { name: "Remind" })).toBeNull(),
    );
    expect(within(row).queryByRole("button")).toBeNull();
  });

  it("has no filter: a manager's own team is a short list", () => {
    mount();
    expect(screen.queryByRole("button", { name: /^Filters/ })).toBeNull();
    expect(screen.queryByLabelText("Status")).toBeNull();
    expect(screen.getByText("Team member A")).toBeVisible();
    expect(screen.getByText("Team member E")).toBeVisible();
  });

  it("walks one person: self review first, their rating beside the self rating", async () => {
    mount();
    await userEvent.click(
      within(
        screen.getByText("Team member D").closest("li") as HTMLElement,
      ).getByRole("button", { name: "Start" }),
    );
    expect(
      screen.getByRole("heading", { name: "Read Team member D's self review" }),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { name: "Core competencies" }),
    ).toBeVisible();
    expect(screen.getAllByText(/Their own rating:/).length).toBe(2);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("has a small HR view of the period", async () => {
    mount();
    await userEvent.click(screen.getByRole("tab", { name: "HR view" }));
    expect(screen.getByText("Self reviews")).toBeVisible();
    expect(screen.getByText("7 of 9")).toBeVisible();
  });
});
