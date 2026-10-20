"use client";

import { useEffect } from "react";

/**
 * Stop somebody leaving a page with unsaved work, unless they mean to.
 *
 * Two doors out, and a guard on each:
 *
 * - **The browser's own** — closing the tab, reloading, typing another address —
 *   asks through `beforeunload`, which is the only way a page is allowed to.
 * - **A link inside the app** — the sidebar, a breadcrumb, a "Back" button that is
 *   an anchor — is caught in the capture phase, before the router sees the click,
 *   and put to the person in a confirm. Cancelling the click cancels the move.
 *
 * Only while `dirty`. It adds nothing when there is nothing to lose, which is
 * what keeps it from becoming a prompt people click through without reading.
 *
 * It does not catch the browser's Back button, which gives a page no way to ask;
 * the "Unsaved changes" note on the screen is what covers that.
 */
export const UNSAVED_PROMPT =
  "You have unsaved changes. Leave without saving them?";

export function useUnsavedGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;

    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      /* Required by older browsers for the prompt to appear at all. */
      event.returnValue = "";
    };

    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      /* Same page, different hash: nothing is left behind. */
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      )
        return;
      if (!window.confirm(UNSAVED_PROMPT)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);
}
