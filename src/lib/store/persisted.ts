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
 * ## `read` is for rendering. `current` is for writing. This is not a style
 * ## preference — reading the wrong one destroys data.
 *
 * The rule above has a consequence that cost a real bug: until something
 * subscribes, `read()` returns the **seed**, not what is in storage. A screen
 * that only ever *writes* to a store therefore computes its write from the seed
 * and `commit` persists that — silently discarding everything the store already
 * held.
 *
 * Found on `/people/[id]`, which grew a "Record their exit" button. That page
 * reads no exits, so nothing subscribed to the offboarding store: recording an
 * exit there overwrote the previously recorded one and the duplicate refusal
 * ("already has an exit in progress") never fired, because as far as the store
 * knew there were no exits. Two clicks, two exits for one person, the first one
 * gone.
 *
 * So: **`read()` from render, `current()` from anywhere that is about to
 * write.** `current()` hydrates on first call, which is why it must never be
 * reached during render — doing so would put the stored state into the client's
 * first paint and bring back the mismatch this whole section exists to avoid.
 * Every write path is an event handler or an async action, which is well after
 * hydration, so there is no case where the right answer is `read()` followed by
 * `commit()`.
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
  /**
   * The value to **render**. Safe on server and client, and deliberately the
   * seed until something subscribes — see the hydration rule above.
   */
  read: () => T;
  /**
   * The value to compute a **write** from. Loads storage on first call.
   *
   * Never call this during render: it is the one function here that can put
   * stored state into the first client paint, which is the hydration mismatch
   * the whole file is arranged to avoid. Anything that writes runs from a click
   * or an async action, long after hydration, so this is always available there.
   */
  current: () => T;
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

  /**
   * Pull storage into the cache, once.
   *
   * Separate from `subscribe` because a write path needs it too and may run
   * first — see the note at the top of this file about the exit that overwrote
   * another exit.
   */
  function hydrate(): T {
    /* The window check comes before the flag, so a server render that somehow
       reaches this does not mark the module hydrated and stop the browser from
       ever loading storage. */
    if (hydrated || typeof window === "undefined") return cache;
    hydrated = true;
    const stored = load();
    if (stored !== empty) cache = stored;
    return cache;
  }

  return {
    read: () => cache,

    current: hydrate,

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
        /* Still deferred a turn, and still only from `subscribe` — React calls
           it after hydration, and the microtask puts the storage read after
           that. `hydrate` is idempotent, so a second subscriber in the same
           tick queues a no-op rather than a second notify. */
        queueMicrotask(() => {
          const before = cache;
          hydrate();
          if (cache !== before) notify();
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
