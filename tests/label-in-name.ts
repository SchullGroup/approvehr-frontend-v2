import { expect } from "vitest";

/**
 * Label in name (WCAG 2.5.3) for a rendered tree: every button and link that shows words has an
 * accessible name that **starts with those words**.
 *
 * The visible words are read the way a person sees them: text that is only for a screen reader, icons
 * and anything hidden from assistive technology are not counted. A control with no words (an icon
 * button) is not checked here, because its name is all there is.
 */

/** What a sighted person reads on a control. */
export function visibleText(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll(
    '.sr-only, svg, [aria-hidden="true"]',
  )) {
    hidden.remove();
  }
  return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every button and link under `root` that shows words, as [visible words, element]. */
export function controlsWithWords(root: HTMLElement): [string, HTMLElement][] {
  return [...root.querySelectorAll<HTMLElement>("button, a[href]")]
    .map((element): [string, HTMLElement] => [visibleText(element), element])
    .filter(([words]) => words !== "");
}

/** Asserts the rule for each control, and returns the words that were checked, so a test can say which. */
export function expectLabelInName(root: HTMLElement): string[] {
  const found = controlsWithWords(root);
  for (const [words, element] of found) {
    expect(element, `"${words}"`).toHaveAccessibleName(
      new RegExp(`^${escape(words)}`, "i"),
    );
  }
  return found.map(([words]) => words);
}
