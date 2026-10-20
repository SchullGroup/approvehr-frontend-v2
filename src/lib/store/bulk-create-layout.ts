"use client";

import { useCallback, useSyncExternalStore } from "react";
import { createPersistedState } from "./persisted";

/**
 * Which way the "add several" window lays its items out, remembered.
 *
 * The one thing the window keeps in the browser, and it is a preference rather
 * than work: somebody who likes the table should not have to pick it every time.
 * What they typed is **not** kept here or anywhere — closing the window asks
 * whether to discard it, and the way to keep it is the download. A draft that
 * saved itself to browser storage would be one the person could not see, could
 * not take to another computer, and might leave on a shared one.
 */
export type BulkLayout = "stacked" | "pages" | "table";

export const BULK_LAYOUTS: readonly { value: BulkLayout; label: string }[] = [
  { value: "stacked", label: "Stacked" },
  { value: "pages", label: "Page by page" },
  { value: "table", label: "Table" },
];

type State = { layout: BulkLayout };

const store = createPersistedState<State>({
  key: "approvehr.bulk-create.layout",
  empty: { layout: "stacked" },
});

export function useBulkLayout(): [BulkLayout, (layout: BulkLayout) => void] {
  const state = useSyncExternalStore(
    store.subscribe,
    store.read,
    store.getServerSnapshot,
  );
  const choose = useCallback(
    (layout: BulkLayout) => store.commit({ layout }),
    [],
  );
  return [state.layout, choose];
}
