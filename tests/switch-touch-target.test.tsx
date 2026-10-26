import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "@/components/ui";
import { isLeaveTab } from "@/app/(app)/settings/leave/tabs";

/**
 * A toggle is 44 by 24, and on a phone the 24 is the height a thumb has to hit.
 * The fix is a transparent label over the control that reaches 44 each way, so
 * what is pinned is that it exists, that it drives the same input, that it is
 * invisible to a screen reader (the real label is already there) and that it is
 * not offered for a switch that cannot be changed.
 */
describe("Switch touch target", () => {
  it("has one named control, however many things can be pressed", () => {
    render(<Switch label="Allow negative balances" onChange={vi.fn()} />);
    expect(
      screen.getAllByRole("switch", { name: "Allow negative balances" }),
    ).toHaveLength(1);
  });

  it("toggles the switch when the extended area is pressed", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <Switch label="Allow negative balances" onChange={onChange} />,
    );
    const area = container.querySelector('label[aria-hidden="true"]');
    expect(area).not.toBeNull();
    expect(area?.className).toContain("sm:hidden");
    await userEvent.click(area as Element);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("is not offered on a switch that is disabled", () => {
    const { container } = render(
      <Switch label="Locked" disabled onChange={vi.fn()} />,
    );
    expect(container.querySelector('label[aria-hidden="true"]')).toBeNull();
  });
});

describe("the leave policy tabs", () => {
  it("accepts the three sections and nothing else", () => {
    expect(isLeaveTab("types")).toBe(true);
    expect(isLeaveTab("approval")).toBe(true);
    expect(isLeaveTab("holidays")).toBe(true);
    expect(isLeaveTab("rules")).toBe(false);
    expect(isLeaveTab(undefined)).toBe(false);
  });
});
