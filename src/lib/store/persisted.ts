"use client";

/**
 * The localStorage-backed store pattern, extracted once.
 *
 * `lib/store/employees.ts` established this shape and got it right the hard
 * way. The subtle part is the hydration rule below, and it has to be identical
 * in every store or one screen renders a mismatch nobody traces back here — so
 * new stores call this factory rather than re-implementing it. (The employee
 * store predates the factory and still holds its own copy; it is load-bearing,
 * verified code and was left alone deliberately. If you touch it, moving it
 * onto this is the right change.)
 *
 * ## The hydration rule
 *
 * `getSnapshot` must return the **empty** state until after hydration. Reading
 * `localStorage` in `getSnapshot` works in the browser but the server has no
 * storage, so the server renders the default state, the client's *first* render
 * reads the real stored state, and React throws a hydration mismatch because
 * the two HTML trees disagree.
 *
 * So: `read()` always returns an in-memory `cache` that starts at `empty`, and
 * storage is loaded inside `subscribe()` — which React only calls after
 * hydration — deferred one more turn with `queueMicrotask`. That produces a
 * correct second render instead of a broken first one.
 *
 * Do not reach for `useEffect` + `useState` instead. It has the same problem
 * one layer down, plus a render you cannot see.
 *
 * ## Versioning
 *
 * Payloads are wrapped as `{ v, data }`. A stored payload whose version does
 * not match is discarded rather than merged — a partially-migrated shape is
 * harder to debug than a reset, and this is a prototype where losing local
 * edits costs nothing. Bump `version` whenever the state shape changes
 * incompatibly, and the next load drops the stale payload cleanly instead of
 * stranding it (which is exactly what happened when the employee store grew
 * its `created`/`archived` arrays).
 */

export type PersistedState<T> = {
  /** Current value. Always safe to call, on server or client. */
  read: () => T;
  /** Replace the value, persist it, and notify subscribers. */
  commit: (next: T) => void;
  /** For `useSyncExternalStore`. */
  subscribe: (listener: () => void) => () => void;
  /** For `useSyncExternalStore`'s server snapshot. Always the empty state. */
  getServerSnapshot: () => T;
  /** Back to the seed state, and clear storage. */
  reset: () => void;
};

export function createPersistedState<T extends object>({
  key,
  empty,
  version = 1,
}: {
  /** localStorage key. Namespace it: `approvehr.<thing>.store`. */
  key: string;
  /** The state before anything local has happened. Must be a stable object. */
  empty: T;
  version?: number;
}): PersistedState<T> {
  let cache: T = empty;
  let hydrated = false;
  const listeners = new Set<() => void>();

  const notify = () => listeners.forEach((l) => l());

  function load(): T {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return empty;
      const parsed = JSON.parse(raw) as { v?: number; data?: T };
      if (parsed.v !== version || !parsed.data) return empty;
      /* Spread over `empty` so a payload written before a *compatible* field
         was added still arrives with that field present. */
      return { ...empty, ...parsed.data };
    } catch {
      return empty;
    }
  }

  return {
    read: () => cache,

    commit(next: T) {
      cache = next;
      try {
        window.localStorage.setItem(key, JSON.stringify({ v: version, data: next }));
      } catch {
        /* Private browsing, or storage full. The in-memory cache still holds
           for this session, so the UI stays consistent — it just will not
           survive a reload. Failing silently is right here: there is nothing
           the user could usefully do about it mid-approval. */
      }
      notify();
    },

    subscribe(listener: () => void) {
      listeners.add(listener);

      if (!hydrated) {
        hydrated = true;
        queueMicrotask(() => {
          const stored = load();
          if (stored !== empty) {
            cache = stored;
            notify();
          }
        });
      }

      return () => {
        listeners.delete(listener);
      };
    },

    getServerSnapshot: () => empty,

    reset() {
      cache = empty;
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* As above. */
      }
      notify();
    },
  };
}

/** Merge a seed record with a sparse patch. The shape every override store uses. */
export function patched<T extends { id: string }>(
  base: T,
  overrides: Record<string, Partial<T>>,
): T {
  const patch = overrides[base.id];
  return patch ? { ...base, ...patch } : base;
}
