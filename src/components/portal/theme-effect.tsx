"use client";

import { useLayoutEffect } from "react";
import { applyTheme, themeStore } from "@/lib/store/theme";

/**
 * The live half of the theme mechanism — mounted alongside the blocking init
 * script (`lib/theme-init-script.ts`) in every app-side layout, never the
 * shared root layout. Renders nothing.
 *
 * The init script alone only fires on a hard page load: a `<script>` inserted
 * via `dangerouslySetInnerHTML` never executes when React mounts it through
 * client-side reconciliation rather than parsing fresh HTML, which is a DOM
 * behaviour, not a Next quirk. This closes that gap unconditionally, at
 * negligible cost, and also carries the two things that can only happen after
 * mount: reapplying live when the Appearance screen changes the choice, and
 * tracking a live OS-level change while "system" is selected.
 */
export function ThemeEffect() {
  useLayoutEffect(() => {
    applyTheme(themeStore.current().choice);

    const unsubscribe = themeStore.subscribe(() => {
      applyTheme(themeStore.current().choice);
    });

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
      if (themeStore.current().choice === "system") applyTheme("system");
    };
    media.addEventListener("change", onSystemChange);

    return () => {
      unsubscribe();
      media.removeEventListener("change", onSystemChange);
      document.documentElement.removeAttribute("data-theme");
    };
  }, []);

  return null;
}
