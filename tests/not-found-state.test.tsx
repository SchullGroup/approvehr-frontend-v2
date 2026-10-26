import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotFoundState } from "@/components/portal/not-found-state";

/**
 * One calm answer to "that is not here" — and never the marketing site's.
 */

const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push: vi.fn(), replace: vi.fn() }),
}));

describe("NotFoundState", () => {
  it("says what was not found and that nothing was changed", () => {
    render(<NotFoundState />);
    expect(screen.getByText("We could not find that page")).toBeInTheDocument();
    expect(screen.getByText(/Nothing has been changed/)).toBeInTheDocument();
  });

  it("names a record when it is given one", () => {
    render(<NotFoundState subject="this payslip" />);
    expect(
      screen.getByText("We could not find this payslip"),
    ).toBeInTheDocument();
  });

  it("offers the two ways out and no sales pitch", async () => {
    render(<NotFoundState />);
    expect(
      screen.getByRole("link", { name: "Go to your home" }),
    ).toHaveAttribute("href", "/dashboard");
    await userEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/demo/i)).not.toBeInTheDocument();
  });
});
