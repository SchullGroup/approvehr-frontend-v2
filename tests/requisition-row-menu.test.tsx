import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  RowMenu,
  type RowMenuEntry,
} from "@/app/(app)/hiring/requisitions/[id]/row-menu";

/**
 * The one overflow menu a row or a header carries on the requisition screen.
 *
 * It replaces four icon buttons per stage and a run of underlined links per
 * applicant, so what is worth pinning is what those had that a menu can lose: a
 * reason when something is off, a way in from the keyboard, and a dialog that opens
 * with no menu left underneath it.
 */

const items = (over: Partial<Record<string, () => void>> = {}) =>
  [
    { label: "Edit", onSelect: over["edit"] ?? vi.fn() },
    {
      label: "Remove",
      tone: "danger" as const,
      disabled: true,
      hint: "This is where new applicants land.",
      onSelect: over["remove"] ?? vi.fn(),
    },
    "separator" as const,
    { label: "Email", href: "mailto:a@example.com", external: true },
  ] satisfies RowMenuEntry[];

const trigger = () =>
  screen.getByRole("button", { name: "Actions for Applied" });

describe("the row menu", () => {
  it("is closed until it is pressed, and names whose actions it holds", async () => {
    const user = userEvent.setup();
    render(<RowMenu label="Actions for Applied" items={items()} />);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger()).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger());
    expect(
      screen.getByRole("menu", { name: "Actions for Applied" }),
    ).toBeVisible();
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Edit",
      "RemoveThis is where new applicants land.",
      "Email",
    ]);
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("closes before it acts, and hands focus back to the trigger", async () => {
    const user = userEvent.setup();
    const edit = vi.fn(() => {
      /* What a dialog's focus restore would see at the moment it opens. */
      expect(document.activeElement).toBe(trigger());
    });
    render(<RowMenu label="Actions for Applied" items={items({ edit })} />);
    await user.click(trigger());
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(edit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("lists an action that is off, with the reason, and does nothing when pressed", async () => {
    const user = userEvent.setup();
    const remove = vi.fn();
    render(<RowMenu label="Actions for Applied" items={items({ remove })} />);
    await user.click(trigger());
    const row = screen.getByRole("menuitem", { name: /Remove/ });
    expect(row).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText("This is where new applicants land."),
    ).toBeInTheDocument();
    await user.click(row);
    expect(remove).not.toHaveBeenCalled();
    /* Pressing an item that is off does not close the menu on the person. */
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("draws a place as a real link, so it can be opened in a new tab", async () => {
    const user = userEvent.setup();
    render(<RowMenu label="Actions for Applied" items={items()} />);
    await user.click(trigger());
    expect(screen.getByRole("menuitem", { name: "Email" })).toHaveAttribute(
      "href",
      "mailto:a@example.com",
    );
  });

  it("opens from the keyboard on the first item, and moves with the arrows", async () => {
    const user = userEvent.setup();
    render(
      <RowMenu
        label="Actions for Applied"
        items={[
          { label: "One", onSelect: vi.fn() },
          { label: "Two", onSelect: vi.fn() },
          { label: "Three", onSelect: vi.fn() },
        ]}
      />,
    );
    trigger().focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "One" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Two" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Three" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "One" })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Three" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: "One" })).toHaveFocus();
  });

  it("skips an item that is off when moving with the arrows", async () => {
    const user = userEvent.setup();
    render(
      <RowMenu
        label="Actions for Applied"
        items={[
          { label: "One", onSelect: vi.fn() },
          { label: "Two", disabled: true },
          { label: "Three", onSelect: vi.fn() },
        ]}
      />,
    );
    trigger().focus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Three" })).toHaveFocus();
  });

  it("closes on Escape and gives focus back", async () => {
    const user = userEvent.setup();
    render(<RowMenu label="Actions for Applied" items={items()} />);
    trigger().focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it("closes on Tab without trapping the keyboard", async () => {
    const user = userEvent.setup();
    render(
      <>
        <RowMenu label="Actions for Applied" items={items()} />
        <button type="button">After</button>
      </>,
    );
    trigger().focus();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Tab}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes when the press lands anywhere else", async () => {
    const user = userEvent.setup();
    render(
      <>
        <RowMenu label="Actions for Applied" items={items()} />
        <p>Elsewhere</p>
      </>,
    );
    await user.click(trigger());
    fireEvent.pointerDown(screen.getByText("Elsewhere"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("cannot be opened while the row is busy", async () => {
    const user = userEvent.setup();
    render(<RowMenu label="Actions for Applied" items={items()} disabled />);
    expect(trigger()).toBeDisabled();
    await user.click(trigger());
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
