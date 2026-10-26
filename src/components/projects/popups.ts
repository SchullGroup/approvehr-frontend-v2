/**
 * Closing a popup before the panel around it.
 *
 * `Drawer` and `Modal` close on Escape from a listener on the document, in the
 * capture phase — which runs before anything inside gets the key. So Escape with
 * a dropdown open would close the whole drawer and take the half-made choice with
 * it. The drawer asks `closeTopPopup()` first: if something inside is open it is
 * closed and the drawer stays.
 *
 * Two kinds of popup are understood: ones that register themselves here (the
 * @mention list), and an open `Picker`, found by its `aria-expanded` and closed
 * by moving focus out of it, which is how it closes itself.
 */

const open: (() => void)[] = [];

/** Register an open popup. Returns the function that unregisters it. */
export function registerPopup(close: () => void): () => void {
  open.push(close);
  return () => {
    const at = open.lastIndexOf(close);
    if (at >= 0) open.splice(at, 1);
  };
}

/** Closes the innermost open popup, if any. True when it closed one. */
export function closeTopPopup(): boolean {
  const close = open[open.length - 1];
  if (close) {
    close();
    return true;
  }
  const trigger = document.querySelector<HTMLElement>(
    '[role="combobox"][aria-expanded="true"]',
  );
  if (trigger) {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    trigger.focus();
    return true;
  }
  return false;
}
