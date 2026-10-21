import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RowActions, type RowActionItem } from "@/components/ui";

/**
 * One menu for everything a row can do, behind one button.
 *
 * What is pinned here is what a keyboard, a screen reader and a thumb each need:
 * a named trigger, a real menu, and a way out that gives focus back. The
 * positioning is not asserted — jsdom has no layout — and was looked at in a
 * browser.
 */

function items(
  overrides?: Partial<Record<string, () => void>>,
): RowActionItem[] {
  return [
    { label: "Assign a head", onSelect: overrides?.["head"] ?? vi.fn() },
    { label: "Edit", onSelect: overrides?.["edit"] ?? vi.fn() },
    "separator",
    {
      label: "Archive",
      tone: "danger",
      onSelect: overrides?.["archive"] ?? vi.fn(),
    },
  ];
}

const trigger = () =>
  screen.getByRole("button", { name: "More actions for Engineering" });

function mount(list: readonly RowActionItem[] = items()) {
  return render(
    <RowActions label="More actions for Engineering" items={list} />,
  );
}

describe("RowActions", () => {
  it("is one button, named for the row, and the menu is not there until asked for", () => {
    mount();
    expect(trigger()).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens a menu of the actions", async () => {
    mount();
    await userEvent.click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    const names = screen.getAllByRole("menuitem").map((el) => el.textContent);
    expect(names).toEqual(["Assign a head", "Edit", "Archive"]);
  });

  it("puts focus on the first choice when opened from the keyboard, and on the menu itself when opened by a press", async () => {
    mount();
    trigger().focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getAllByRole("menuitem")[0]).toHaveFocus();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(trigger());
    expect(screen.getByRole("menu")).toHaveFocus();
  });

  it("runs the chosen action and closes", async () => {
    const edit = vi.fn();
    mount(items({ edit }));
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(edit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("moves with the arrow keys and wraps", async () => {
    mount();
    trigger().focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Archive" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("menuitem", { name: "Assign a head" }),
    ).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Archive" })).toHaveFocus();
  });

  it("jumps to the ends with Home and End", async () => {
    mount();
    await userEvent.click(trigger());
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Archive" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(
      screen.getByRole("menuitem", { name: "Assign a head" }),
    ).toHaveFocus();
  });

  it("closes on Escape and gives focus back to the trigger", async () => {
    mount();
    await userEvent.click(trigger());
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it("opens from the keyboard", async () => {
    mount();
    trigger().focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("closes when somebody presses outside it", async () => {
    render(
      <div>
        <p>elsewhere</p>
        <RowActions label="More actions for Engineering" items={items()} />
      </div>,
    );
    await userEvent.click(trigger());
    await userEvent.click(screen.getByText("elsewhere"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("marks the destructive action apart from the rest", async () => {
    mount();
    await userEvent.click(trigger());
    expect(screen.getByRole("separator")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Archive" })).toHaveClass(
      "text-danger-text",
    );
  });

  it("renders nothing at all when there is nothing the reader may do", () => {
    mount(["separator"]);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("lists a refused action, says why, and does not run it", async () => {
    const rename = vi.fn();
    mount([
      {
        label: "Remove",
        disabled: true,
        hint: "Somebody is still in this stage.",
        onSelect: rename,
      },
      ...items(),
    ]);
    await userEvent.click(trigger());
    const refused = screen.getByRole("menuitem", { name: /Remove/ });
    expect(refused).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText("Somebody is still in this stage."),
    ).toBeInTheDocument();
    await userEvent.click(refused);
    expect(rename).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("skips a refused action when moving with the keyboard", async () => {
    mount([{ label: "Remove", disabled: true, onSelect: vi.fn() }, ...items()]);
    trigger().focus();
    await userEvent.keyboard("{Enter}");
    expect(
      screen.getByRole("menuitem", { name: "Assign a head" }),
    ).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Archive" })).toHaveFocus();
  });

  it("renders a place as a link, and an external one as a plain anchor", async () => {
    mount([
      { label: "Open the record", href: "/people/p-01" },
      { label: "Email them", href: "mailto:a@example.com", external: true },
    ]);
    await userEvent.click(trigger());
    expect(
      screen.getByRole("menuitem", { name: "Open the record" }),
    ).toHaveAttribute("href", "/people/p-01");
    expect(
      screen.getByRole("menuitem", { name: "Email them" }),
    ).toHaveAttribute("href", "mailto:a@example.com");
  });

  it("dims the whole menu when it is unavailable", () => {
    render(
      <RowActions
        label="More actions for Engineering"
        items={items()}
        disabled
      />,
    );
    expect(trigger()).toBeDisabled();
  });

  it("passes a class to the trigger", () => {
    render(
      <RowActions
        label="More actions for Engineering"
        items={items()}
        triggerClassName="bg-red-500"
      />,
    );
    expect(trigger()).toHaveClass("bg-red-500");
  });

  describe("on a phone", () => {
    const rect = (top: number, bottom: number): DOMRect =>
      ({ top, bottom, left: 0, right: 40, width: 40, height: 40 }) as DOMRect;

    it("stays open through a scroll while its row is still on screen", async () => {
      mount();
      vi.spyOn(trigger(), "getBoundingClientRect").mockReturnValue(
        rect(100, 140),
      );
      await userEvent.click(trigger());
      act(() => {
        window.dispatchEvent(new Event("scroll"));
      });
      expect(screen.getByRole("menu")).toBeInTheDocument();
    });

    it("closes once its row has scrolled off the screen", async () => {
      mount();
      const spy = vi
        .spyOn(trigger(), "getBoundingClientRect")
        .mockReturnValue(rect(100, 140));
      await userEvent.click(trigger());
      spy.mockReturnValue(rect(-200, -160));
      act(() => {
        window.dispatchEvent(new Event("scroll"));
      });
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("ignores a height-only resize — an address bar sliding away — and closes on a rotation", async () => {
      mount();
      await userEvent.click(trigger());
      const width = window.innerWidth;
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: window.innerHeight + 56,
      });
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });
      expect(screen.getByRole("menu")).toBeInTheDocument();

      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width + 300,
      });
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });
});
