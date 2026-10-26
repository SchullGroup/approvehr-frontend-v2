import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Field, FieldSet, Input, Modal } from "@/components/ui";

/**
 * The help icon beside a label, as somebody holding a phone meets it.
 *
 * It was shown by `group-hover` and `group-focus-within` and nothing else, on
 * the reasoning that tapping a button focuses it. Safari does not focus a
 * button that is pressed, so on an iPhone — which cannot hover either — it
 * could not be opened. And the panel was an absolutely positioned child of the
 * icon, so for the first field in any dialog it opened upward into the dialog's
 * own clipped scroll area and 55 of its 71 pixels were cut off.
 *
 * jsdom has no layout, so where a pixel matters these stub the two things the
 * component reads (the icon's rectangle and the panel's size) and let the real
 * component decide; `place-tooltip.test.ts` holds the arithmetic itself. What
 * is checked here is the behaviour a layout cannot show: what opens it, what
 * closes it, and that closing it is not also closing the dialog around it.
 */

const HELP = "Twelve characters, starting PEN. It is on the RSA statement.";

/** The visible panel: the one `aria-hidden` presentation span there is. */
const panel = () =>
  document.querySelector<HTMLElement>(
    '[role="presentation"][aria-hidden="true"]',
  );
const icon = () =>
  screen.getByRole("button", { name: "More about this field" });

function renderField() {
  return render(
    <Field label="Pension PIN" help={HELP}>
      <Input />
    </Field>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("opening it", () => {
  it("shows nothing until it is used", () => {
    renderField();
    expect(panel()).toBeNull();
  });

  it("opens when a mouse presses it, and stays open after the mouse leaves", async () => {
    const user = userEvent.setup();
    renderField();
    /* Closed first, so "open" below is something that happened. */
    expect(panel()).toBeNull();
    await user.click(icon());
    expect(panel()).toHaveTextContent(HELP);
    await user.unhover(icon());
    expect(panel()).not.toBeNull();
  });

  it("is only peeked at while a mouse rests on it", async () => {
    const user = userEvent.setup();
    renderField();
    await user.hover(icon());
    expect(panel()).toHaveTextContent(HELP);
    await user.unhover(icon());
    expect(panel()).toBeNull();
  });

  it("closes on the second press", async () => {
    const user = userEvent.setup();
    renderField();
    await user.click(icon());
    await user.click(icon());
    expect(panel()).toBeNull();
  });

  it("opens for a finger on a tap, which is the press Safari does not turn into a focus", () => {
    renderField();
    /* A finger has no "over": arriving on the icon opens nothing... */
    fireEvent.pointerEnter(icon(), { pointerType: "touch" });
    expect(panel()).toBeNull();
    /* ...and the tap is what does. */
    fireEvent.click(icon());
    expect(panel()).toHaveTextContent(HELP);
    /* Lifting the finger is a pointer leaving, and must not take it away. */
    fireEvent.pointerLeave(icon(), { pointerType: "touch" });
    expect(panel()).not.toBeNull();
  });

  describe("by keyboard", () => {
    /* jsdom answers `:focus-visible` with false for everything, so the two
       answers a browser would give are stated. */
    const focusVisible = (answer: boolean) => {
      const real = Element.prototype.matches;
      vi.spyOn(Element.prototype, "matches").mockImplementation(function (
        this: Element,
        selector: string,
      ) {
        return selector === ":focus-visible"
          ? answer
          : real.call(this, selector);
      });
    };

    it("opens when it is tabbed to and closes when focus moves on", async () => {
      focusVisible(true);
      const user = userEvent.setup();
      renderField();
      await user.tab();
      expect(icon()).toHaveFocus();
      expect(panel()).toHaveTextContent(HELP);
      await user.tab();
      expect(panel()).toBeNull();
    });

    it("is not opened by a click that merely happened to focus it", () => {
      focusVisible(false);
      renderField();
      act(() => icon().focus());
      expect(panel()).toBeNull();
    });

    it("opens on Enter, which is a click, and closes on Escape", async () => {
      focusVisible(true);
      const user = userEvent.setup();
      renderField();
      await user.tab();
      await user.keyboard("{Enter}");
      expect(panel()).not.toBeNull();
      await user.keyboard("{Escape}");
      expect(panel()).toBeNull();
    });
  });

  it("is on a field set's legend as well", async () => {
    const user = userEvent.setup();
    render(
      <FieldSet legend="Pay frequency" help={HELP}>
        <Input aria-label="x" />
      </FieldSet>,
    );
    expect(panel()).toBeNull();
    await user.click(icon());
    expect(panel()).toHaveTextContent(HELP);
  });
});

describe("closing it", () => {
  it("closes on a press anywhere else", async () => {
    const user = userEvent.setup();
    renderField();
    await user.click(icon());
    await user.click(document.body);
    expect(panel()).toBeNull();
  });

  it("does not close under a press on the panel itself, that press is the start of a click", async () => {
    const user = userEvent.setup();
    renderField();
    await user.click(icon());
    const open = panel() as HTMLElement;
    fireEvent.pointerDown(open);
    /* Unmounted here, the click that follows would land on nothing, or on
       whatever the panel was covering. */
    expect(panel()).toBe(open);
    fireEvent.click(open);
    expect(panel()).toBeNull();
  });

  it("is still there when a press on it ends, though a press takes focus off the icon", async () => {
    const user = userEvent.setup();
    renderField();
    await user.click(icon());
    expect(icon()).toHaveFocus();
    const open = panel() as HTMLElement;
    /* Held down, not clicked: the press has not finished. Chrome moves focus to
       the page when a press lands on nothing focusable, the icon closes the
       panel when it loses focus, and the click that ends the press would then
       land on whatever the panel was covering. */
    await user.pointer({ keys: "[MouseLeft>]", target: open });
    expect(panel()).toBe(open);
    expect(icon()).toHaveFocus();
    await user.pointer({ keys: "[/MouseLeft]" });
    expect(panel()).toBeNull();
  });

  it("does not let a click on the panel reach what the field is inside", async () => {
    const user = userEvent.setup();
    const outer = vi.fn();
    render(
      <div onClick={outer}>
        <Field label="Pension PIN" help={HELP}>
          <Input />
        </Field>
      </div>,
    );
    await user.click(icon());
    outer.mockClear();
    /* A portal's events bubble through the React tree it was opened from, which
       is the tree that has the clickable card in it. */
    fireEvent.click(panel() as HTMLElement);
    expect(outer).not.toHaveBeenCalled();
  });
});

describe("what it leaves alone", () => {
  it("keeps the description for assistive technology where it was, whether or not the panel is open", async () => {
    const user = userEvent.setup();
    renderField();
    const input = screen.getByLabelText("Pension PIN");
    expect(input).toHaveAccessibleDescription(HELP);
    await user.click(icon());
    expect(input).toHaveAccessibleDescription(HELP);
    /* The panel is the sighted copy. Heard as well, the sentence would be read
       twice. */
    expect(panel()).toHaveAttribute("aria-hidden", "true");
  });

  it("is a bigger target than its icon, without making any label row taller", () => {
    renderField();
    const classes = Array.from(icon().classList);
    expect(classes).toEqual(expect.arrayContaining(["p-1.5", "-m-1.5"]));
  });
});

describe("where it opens", () => {
  /* The component reads two things from the page: the icon's rectangle and the
     panel's size. Everything else is the real thing. */
  function stubLayout(iconTop: number) {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      top: iconTop,
      bottom: iconTop + 14,
      left: 40,
      right: 54,
      width: 14,
      height: 14,
      x: 40,
      y: iconTop,
      toJSON: () => ({}),
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(71);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(256);
  }

  it("is in the body, outside the field and whatever scrolls around it", async () => {
    const user = userEvent.setup();
    renderField();
    await user.click(icon());
    expect((panel() as HTMLElement).parentElement).toBe(document.body);
  });

  it("opens below the first field in a dialog, where above is cut off", async () => {
    stubLayout(20);
    const user = userEvent.setup();
    renderField();
    await user.click(icon());
    const open = panel() as HTMLElement;
    // 34 (the icon's bottom) + 8.
    expect(open.style.top).toBe("42px");
    expect(open.style.left).toBe("40px");
  });

  it("opens above a field further down, as it always did", async () => {
    stubLayout(400);
    const user = userEvent.setup();
    renderField();
    await user.click(icon());
    // 400 - 8 - 71.
    expect((panel() as HTMLElement).style.top).toBe("321px");
  });
});

describe("inside a dialog", () => {
  const dialog = (onClose: () => void) =>
    render(
      <Modal open onClose={onClose} title="Add a person">
        <Field label="Pension PIN" help={HELP}>
          <Input />
        </Field>
      </Modal>,
    );

  it("opens outside the dialog, above it, so its scroll area cannot cut it off", async () => {
    const user = userEvent.setup();
    dialog(() => undefined);
    await user.click(icon());
    const open = panel() as HTMLElement;
    expect(screen.getByRole("dialog").contains(open)).toBe(false);
    /* The dialog is z-50; this is the tier above it. */
    expect(open.className).toContain("z-[60]");
  });

  it("takes the first Escape for itself and leaves the dialog open", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    dialog(onClose);
    await user.click(icon());
    await user.keyboard("{Escape}");
    expect(panel()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    /* The second is the dialog's. One keystroke must not dismiss a hint *and*
       discard the form somebody was filling in. */
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("leaves Escape to the dialog when no hint is open", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    dialog(onClose);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
