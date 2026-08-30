"use client";

import { useEffect } from "react";

/**
 * Whether `router.back()` would land somewhere that is actually part of this
 * visit, rather than wherever the browser's history happened to hold before
 * the app was ever opened.
 *
 * ## Why this exists
 *
 * `PageHeader`'s "Back to X" link points at a fixed parent route, and used to
 * do that unconditionally, deliberately never at browser history — see the
 * comment it replaced in `components/portal/shell.tsx`. That was the right
 * call for a reader who arrives from a notification, a search result, or a
 * bookmark: `router.back()` for them goes to whatever they had open before
 * ApproveHR, or nowhere at all.
 *
 * It was the wrong call for the far more common case of clicking *into* a
 * screen from somewhere else in the product. A payroll exception's "Add
 * account number" link lands on an employee record, and that record's own
 * breadcrumb has no way to say "Back to Run payroll" instead of "Back to
 * Employees" — a breadcrumb is fixed per page and cannot see where the click
 * that arrived here came from. Only real navigation history knows that.
 *
 * ## The distinction this makes, and why a `useRef` cannot make it
 *
 * `PageHeader` remounts on every navigation — every page renders its own —
 * so a ref reset to nothing on each mount could never tell "this is the
 * first page of the visit" apart from "we have navigated at least once".
 * What has to persist across that is module state: one variable, read and
 * written across every `PageHeader` this tab ever renders, for as long as
 * the tab stays open.
 *
 * A hard reload clears it, which is the conservative direction to be wrong
 * in — it only ever causes a genuine in-app back-step to be reported as
 * unavailable (falling back to the deterministic parent link), never the
 * reverse. Never reported "available" for a page reached from outside the
 * app, which is the case the original design was written to protect.
 */
let lastPathname: string | null = null;

export function useCanGoBack(pathname: string): boolean {
  const canGoBack = lastPathname !== null && lastPathname !== pathname;

  /* Written in an effect, never during render — the read above is what
     decides this render's answer, and the write must only land once this
     render has actually committed. */
  useEffect(() => {
    lastPathname = pathname;
  }, [pathname]);

  return canGoBack;
}

/** For tests only — a fresh tab, as far as this module is concerned. */
export function resetNavHistoryForTests(): void {
  lastPathname = null;
}
