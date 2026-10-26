import { act, render, screen, within } from "@testing-library/react";
import { ToastProvider } from "@/components/ui";

/**
 * Shared furniture for the pipeline screens' tests: the demo's book, a column by
 * its name, a card by the person's, and the pointer drag `useDragInto` listens for.
 *
 * Not a test file (no `.test.`): vitest only runs `*.test.*`.
 */

export function renderInToasts(node: React.ReactNode) {
  return render(<ToastProvider>{node}</ToastProvider>);
}

/** A column, by its heading. */
export const column = (name: RegExp | string) =>
  screen.getByRole("region", {
    name: typeof name === "string" ? new RegExp(`^${name},`) : name,
  });

/** The people in a column, in the order shown. */
export const peopleIn = (name: RegExp | string): string[] =>
  within(column(name))
    .queryAllByRole("article")
    .map((card) => within(card).getAllByRole("link")[0]?.textContent ?? "");

/** The card for somebody, wherever it is. */
export const cardOf = (person: string): HTMLElement => {
  const card = screen
    .getAllByRole("article")
    .find((a) => within(a).queryByRole("link", { name: person }));
  if (!card) throw new Error(`No card for ${person}`);
  return card;
};

/**
 * Grab a card by its grip and let go over a column.
 *
 * `document.elementFromPoint` is not implemented in jsdom, and the hook uses it on
 * purpose: the browser's own hit test is the only thing that agrees with what a
 * person can see. So it is defined here to return the column the test means to be
 * over, which leaves everything after the hit test running for real.
 */
export function dragTo(
  person: string,
  target: HTMLElement | null,
  options: { release?: boolean } = {},
) {
  const grip = cardOf(person).querySelector<HTMLElement>("button[aria-hidden]");
  if (!grip) throw new Error(`${person} has no grip`);
  (grip as HTMLElement & { setPointerCapture: () => void }).setPointerCapture =
    () => undefined;

  /* Each dispatch in its own `act`: pick-up sets state, and the effect that
     subscribes the window listeners only runs when React flushes it. */
  act(() => {
    grip.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
    );
  });
  const doc = document as unknown as Record<string, unknown>;
  doc["elementFromPoint"] = () => target ?? document.body;
  act(() => {
    window.dispatchEvent(
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 300,
        clientY: 200,
      }),
    );
  });
  if (options.release !== false) {
    act(() => {
      window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    });
    Reflect.deleteProperty(doc, "elementFromPoint");
  }
}

export function escapeDrag() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  Reflect.deleteProperty(
    document as unknown as Record<string, unknown>,
    "elementFromPoint",
  );
}
