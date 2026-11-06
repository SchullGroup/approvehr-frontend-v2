"use client";

import { useSyncExternalStore } from "react";

/**
 * Which program the open project belongs to, so the sidebar can light its row.
 *
 * The sidebar finds the lit row from the address alone, and a project's address
 * (`/projects/<id>`) says nothing about its program. The project screen knows,
 * once it has loaded the project, and says so here; the shell reads it and gives
 * that program's row the project's path to own. It is a hint about one page: it
 * carries the path it was set for, and is ignored for any other, so it can never
 * light a row on a page it was not about.
 */

export type NavHint = { programId: string; path: string };

let hint: NavHint | null = null;
const listeners = new Set<() => void>();

export function setNavHint(next: NavHint | null): void {
  if (hint?.programId === next?.programId && hint?.path === next?.path) return;
  hint = next;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useNavHint(): NavHint | null {
  return useSyncExternalStore(
    subscribe,
    () => hint,
    () => null,
  );
}
