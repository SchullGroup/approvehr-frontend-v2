import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Modal, SearchPicker, type PickerOption } from "@/components/ui";

/**
 * The type-ahead picker, apart from where its options come from.
 *
 * What is pinned is the control's own contract: the combobox roles a screen
 * reader needs, the keys, that a list which does not answer the box cannot be
 * chosen from by Enter, that failure is not "nobody matches", and that Escape
 * inside a dialog closes the list before it closes the dialog. The search itself
 * (debounce, the stale answer, the name that works) is `employee-search.test.tsx`.
 */

const ADA: PickerOption = { value: "a", label: "Ada Obi", hint: "Designer" };
const BOLA: PickerOption = { value: "b", label: "Bola Eze", hint: "Analyst" };
const CHI: PickerOption = { value: "c", label: "Chidi Bello" };

type Over = Partial<{
  options: PickerOption[];
  pending: boolean;
  failed: boolean;
  more: boolean;
  initial: PickerOption | null;
}>;

function Harness({
  options = [ADA, BOLA, CHI],
  pending = false,
  failed = false,
  more = false,
  initial = null,
  onQueryChange = () => {},
  onRetry,
}: Over & {
  onQueryChange?: (text: string) => void;
  onRetry?: () => void;
}) {
  const [chosen, setChosen] = useState<PickerOption | null>(initial);
  return (
    <>
      <SearchPicker
        selected={chosen}
        onSelect={setChosen}
        onQueryChange={onQueryChange}
        options={options}
        pending={pending}
        failed={failed}
        more={more}
        {...(onRetry ? { onRetry } : {})}
        aria-label="Who"
      />
      <output data-testid="chosen">{chosen?.value ?? "none"}</output>
    </>
  );
}

const box = () => screen.getByRole("combobox", { name: "Who" });
const active = () => box().getAttribute("aria-activedescendant");
const nameOfActive = () =>
  active() ? document.getElementById(active()!)?.textContent : null;

describe("the roles a screen reader needs", () => {
  it("is a collapsed combobox until it is opened, and then names its list", async () => {
    render(<Harness />);
    expect(box()).toHaveAttribute("aria-expanded", "false");
    expect(box()).toHaveAttribute("aria-autocomplete", "list");
    expect(box()).not.toHaveAttribute("aria-controls");
    expect(screen.queryByRole("listbox")).toBeNull();

    await userEvent.click(box());
    expect(box()).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("listbox", { name: "Who" });
    expect(box().getAttribute("aria-controls")).toBe(list.id);
    expect(within(list).getAllByRole("option")).toHaveLength(3);
  });

  it("marks the chosen row as selected, not only ticked", async () => {
    render(<Harness initial={BOLA} />);
    await userEvent.click(box());
    expect(screen.getByRole("option", { name: /Bola Eze/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("option", { name: /Ada Obi/ })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("says how many matched, politely, once there is an answer", async () => {
    const { rerender } = render(<Harness />);
    await userEvent.click(box());
    const live = () => document.querySelector("[aria-live=polite]");
    expect(live()).toHaveTextContent("3 matches.");

    rerender(<Harness options={[ADA]} more />);
    expect(live()).toHaveTextContent("1 match, and more.");

    rerender(<Harness options={[ADA]} pending />);
    /* Nothing while it is still searching: not one announcement per letter. */
    expect(live()).toHaveTextContent("");
  });
});

describe("opening", () => {
  it("does not open just because focus arrived, which is how a dialog opens", async () => {
    render(<Harness />);
    await userEvent.tab();
    expect(box()).toHaveFocus();
    expect(box()).toHaveAttribute("aria-expanded", "false");

    await userEvent.keyboard("{ArrowDown}");
    expect(box()).toHaveAttribute("aria-expanded", "true");
  });

  it("opens on typing, and reports each change as it is typed", async () => {
    const onQueryChange = vi.fn();
    render(<Harness onQueryChange={onQueryChange} />);
    await userEvent.type(box(), "ad");

    expect(box()).toHaveAttribute("aria-expanded", "true");
    expect(onQueryChange.mock.calls.map(([text]) => text)).toEqual(["a", "ad"]);
  });
});

describe("the keys", () => {
  it("moves with the arrows, wraps at both ends, and names the row it is on", async () => {
    render(<Harness />);
    await userEvent.click(box());
    expect(nameOfActive()).toContain("Ada Obi");

    await userEvent.keyboard("{ArrowDown}");
    expect(nameOfActive()).toContain("Bola Eze");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(nameOfActive()).toContain("Ada Obi");
    await userEvent.keyboard("{ArrowUp}");
    expect(nameOfActive()).toContain("Chidi Bello");
  });

  it("chooses on Enter, closes, shows the name, and puts the query back to empty", async () => {
    const onQueryChange = vi.fn();
    render(<Harness onQueryChange={onQueryChange} />);
    await userEvent.type(box(), "bo");
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(screen.getByTestId("chosen")).toHaveTextContent("b");
    expect(box()).toHaveValue("Bola Eze");
    expect(box()).toHaveAttribute("aria-expanded", "false");
    expect(onQueryChange).toHaveBeenLastCalledWith("");
  });

  it("chooses on a click, without the box losing focus first", async () => {
    render(<Harness />);
    await userEvent.click(box());
    await userEvent.click(screen.getByRole("option", { name: /Chidi Bello/ }));

    expect(screen.getByTestId("chosen")).toHaveTextContent("c");
    expect(box()).toHaveValue("Chidi Bello");
  });

  it("closes on Escape and puts the chosen name back over a half-typed one", async () => {
    const onQueryChange = vi.fn();
    render(<Harness initial={ADA} onQueryChange={onQueryChange} />);
    expect(box()).toHaveValue("Ada Obi");

    await userEvent.click(box());
    await userEvent.keyboard("zzz");
    expect(box()).toHaveValue("zzz");
    await userEvent.keyboard("{Escape}");

    expect(box()).toHaveValue("Ada Obi");
    expect(box()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("chosen")).toHaveTextContent("a");
    expect(onQueryChange).toHaveBeenLastCalledWith("");
  });

  it("leaves on Tab without choosing anything, and is not trapped", async () => {
    render(
      <>
        <Harness />
        <button type="button">After</button>
      </>,
    );
    await userEvent.type(box(), "a");
    await userEvent.tab();

    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
    expect(screen.getByTestId("chosen")).toHaveTextContent("none");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("selects the chosen name when the box is clicked, so typing replaces it", async () => {
    render(<Harness initial={ADA} />);
    await userEvent.click(box());
    await userEvent.keyboard("bo");
    expect(box()).toHaveValue("bo");
  });
});

describe("a list that does not answer the box", () => {
  it("is dimmed and busy, shows nothing highlighted, and cannot be chosen from by Enter", async () => {
    render(<Harness pending />);
    await userEvent.click(box());

    expect(screen.getByRole("listbox")).toHaveAttribute("aria-busy", "true");
    expect(active()).toBeNull();
    expect(screen.getByText("Searching…")).toBeVisible();

    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByTestId("chosen")).toHaveTextContent("none");
    /* Enter was swallowed, not left to submit whatever sits behind the list. */
    expect(box()).toHaveAttribute("aria-expanded", "true");
  });

  it("still takes a click on a row the person is looking at", async () => {
    render(<Harness pending />);
    await userEvent.click(box());
    await userEvent.click(screen.getByRole("option", { name: /Ada Obi/ }));
    expect(screen.getByTestId("chosen")).toHaveTextContent("a");
  });
});

describe("what it says when there is nothing to choose", () => {
  it("says nobody matches what was typed, in the person's own words", async () => {
    render(<Harness options={[]} />);
    await userEvent.type(box(), "  Qwerty ");
    expect(screen.getByText("Nobody matches “Qwerty”.")).toBeVisible();
  });

  it("says there is nobody to choose from, when nothing was typed", async () => {
    render(<Harness options={[]} />);
    await userEvent.click(box());
    expect(screen.getByText("Nobody to choose from yet.")).toBeVisible();
  });

  it("says the search did not work, which is not the same sentence, and offers a retry", async () => {
    const onRetry = vi.fn();
    render(<Harness options={[]} failed onRetry={onRetry} />);
    await userEvent.type(box(), "ada");

    expect(screen.queryByText(/Nobody matches/)).toBeNull();
    expect(screen.getAllByText("The search did not work.")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("says there are more when the list is only the first of them", async () => {
    render(<Harness more />);
    await userEvent.click(box());
    expect(screen.getByText("Keep typing to narrow the list.")).toBeVisible();
  });
});

describe("the chosen person", () => {
  it("stays in the box when the list no longer holds them", async () => {
    const { rerender } = render(<Harness initial={BOLA} />);
    expect(box()).toHaveValue("Bola Eze");

    rerender(<Harness initial={BOLA} options={[CHI]} />);
    expect(box()).toHaveValue("Bola Eze");
    await userEvent.click(box());
    expect(screen.queryByRole("option", { name: /Bola Eze/ })).toBeNull();
    expect(box()).toHaveValue("Bola Eze");
  });
});

describe("inside a dialog", () => {
  function InADialog({ onClose }: { onClose: () => void }) {
    return (
      <Modal open onClose={onClose} title="Give kudos">
        <Harness />
      </Modal>
    );
  }

  it("takes the first Escape for the list and leaves the dialog open, then lets the next close it", async () => {
    const onClose = vi.fn();
    render(<InADialog onClose={onClose} />);
    await userEvent.click(box());
    expect(box()).toHaveAttribute("aria-expanded", "true");

    await userEvent.keyboard("{Escape}");
    expect(box()).toHaveAttribute("aria-expanded", "false");
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not change what Escape does anywhere else in the dialog", async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Other">
        <input aria-label="Other field" />
      </Modal>,
    );
    await userEvent.click(screen.getByLabelText("Other field"));
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
