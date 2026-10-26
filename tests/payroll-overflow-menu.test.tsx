import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OverflowMenu } from "../src/app/(app)/payroll/runs/new/overflow-menu";

/**
 * The header menu that holds "Cancel this payroll".
 *
 * It exists because a destructive action must not sit beside navigation, and a
 * menu that traps a keyboard user or leaves its list floating after they have
 * moved on would be a worse place for it than the stepper row it left. So the
 * behaviour a keyboard and a screen reader depend on is asserted by pressing it.
 */

const items = (onSelect = vi.fn()) => [
  { key: "a", label: "Cancel this payroll", tone: "danger" as const, onSelect },
  { key: "b", label: "Another action", onSelect: vi.fn() },
];

describe("the overflow menu", () => {
  it("is closed to begin with, and says what it opens", () => {
    render(
      <OverflowMenu label="More actions for this payroll" items={items()} />,
    );
    const trigger = screen.getByRole("button", {
      name: "More actions for this payroll",
    });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens onto its first item, so a keyboard user is already inside it", async () => {
    const user = userEvent.setup();
    render(<OverflowMenu label="More" items={items()} />);
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Cancel this payroll" }),
    ).toHaveFocus();
  });

  it("moves between items with the arrow keys and wraps at the ends", async () => {
    const user = userEvent.setup();
    render(<OverflowMenu label="More" items={items()} />);
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("menuitem", { name: "Another action" }),
    ).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("menuitem", { name: "Cancel this payroll" }),
    ).toHaveFocus();
    await user.keyboard("{End}");
    expect(
      screen.getByRole("menuitem", { name: "Another action" }),
    ).toHaveFocus();
  });

  it("closes on Escape and hands focus back to the button", async () => {
    const user = userEvent.setup();
    render(<OverflowMenu label="More" items={items()} />);
    const trigger = screen.getByRole("button", { name: "More" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes when somebody presses outside it, rather than floating over the page", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <OverflowMenu label="More" items={items()} />
        <p>elsewhere</p>
      </div>,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(screen.getByText("elsewhere"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("runs the chosen action once and closes, and does not run the others", async () => {
    const user = userEvent.setup();
    const cancel = vi.fn();
    const other = vi.fn();
    render(
      <OverflowMenu
        label="More"
        items={[
          { key: "a", label: "Cancel this payroll", onSelect: cancel },
          { key: "b", label: "Another action", onSelect: other },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(
      screen.getByRole("menuitem", { name: "Cancel this payroll" }),
    );
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("renders nothing at all when there is nothing to offer", () => {
    const { container } = render(<OverflowMenu label="More" items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
