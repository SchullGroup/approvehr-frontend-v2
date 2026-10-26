"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * One value kept in the address bar, so it can be shared and survives a reload.
 *
 * The project screen keeps its view (`?view=`), its open issue (`?issue=`) and
 * the board's swimlanes (`?lanes=`) this way. Setting a value to `null` or to the
 * fallback removes it, so a default view is a clean URL. `push` adds a history
 * entry (the back button undoes it); `replace` does not.
 */
export function useQueryParam(
  name: string,
  fallback: string,
): [string, (next: string | null, mode?: "push" | "replace") => void] {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const value = params.get(name) ?? fallback;

  const set = useCallback(
    (next: string | null, mode: "push" | "replace" = "replace") => {
      const query = new URLSearchParams(params.toString());
      if (next === null || next === fallback) query.delete(name);
      else query.set(name, next);
      const qs = query.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (mode === "push") router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [params, pathname, router, name, fallback],
  );

  return [value, set];
}
