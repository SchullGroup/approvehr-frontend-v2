"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * One request per answer, however many components ask for it.
 *
 * ## The bug this exists to stop
 *
 * `usePermissions` kept its answer in component-local `useState` and fetched it
 * from its own `useEffect`. That is the obvious shape and it is correct in
 * isolation — every component that calls it gets the right set. What it is not
 * is *shared*: twenty-two components on one screen each mounted their own copy
 * of that state and each fired its own `GET /permissions/users/:id/permissions`,
 * for the same user, at the same moment, and threw away twenty-one of the
 * answers.
 *
 * Measured on the running app with **ten employees** in the directory:
 *
 * | Screen | Requests to render it | Of which that one endpoint |
 * |---|---|---|
 * | `/people/leave` | 60 | 22 |
 * | `/people` | 39 | 14 |
 * | `/payroll` | 38 | 14 |
 *
 * The count does not grow with the company — it grows with how many components
 * on the page ask a question about the reader — so it is the same twenty-two at
 * ten employees and at ten thousand. What *does* grow with the company is what
 * sits beside it, and the two together are what pushed a page load past the
 * three-second fuse on `ping()` in `lib/api/client.ts` and had a live,
 * authenticated session decide the API was down.
 *
 * ## What this is
 *
 * A keyed, module-level cache with in-flight de-duplication, on
 * `useSyncExternalStore` — the same primitive `lib/store/persisted.ts` uses, and
 * for the same reason: it is the one hook that can hand render a value out of a
 * module without React tearing between two components that read it in the same
 * pass.
 *
 * ```ts
 * const userAccess = createSharedResource((userId, signal) =>
 *   permissionsApi.userAccess(userId, signal),
 * );
 *
 * // In any number of components, in any order:
 * const access = userAccess.use(userId); // one request, one answer
 * ```
 *
 * ## Three decisions worth not undoing
 *
 * **The fetch is kicked from `subscribe`, never from render or an effect.**
 * `persisted.ts`'s header records the hydration rule this follows: the server
 * has no cache, so `getSnapshot` has to answer `null` on the first client render
 * too or React throws a mismatch. `subscribe` runs after hydration, which makes
 * it the one place a fetch can start without either lying to the server pass or
 * cascading a render.
 *
 * **An unmount does not abort the request.** The version this replaces aborted
 * on cleanup, which is right for state nobody else wants and wrong for a shared
 * answer: navigating between two screens that both need the permission set
 * cancelled the first request and started a second, so the fast path — the
 * answer is already on its way — was the one path that never happened. Worse,
 * an abort is indistinguishable from a failure at the `catch`, which is the same
 * confusion that made `ping()` report a healthy server as unreachable. A
 * resolved request lands in the cache and the next reader gets it for free.
 *
 * **A failure is not retried in a loop.** `RETRY_AFTER_MS` holds a failed key
 * closed for ten seconds. Without it, a screen whose components remount on every
 * keystroke would turn one refused request into a retry storm against a server
 * that has just told us it is struggling.
 *
 * ## What it deliberately does not do
 *
 * No revalidation on window focus. `lib/revalidate.ts` is the right answer for a
 * list somebody is looking at; this holds facts that change when an
 * administrator edits a role, not while a page is open, and re-asking on every
 * tab switch would trade one storm for a slower one. If a screen needs the set
 * to be current after it has changed it, call `refresh` — `/settings/roles` is
 * the only screen that can, and it is the only caller that should.
 */

/** How long a key stays closed after a failed fetch, so a refusal is not retried in a loop. */
const RETRY_AFTER_MS = 10_000;

/**
 * Every resource ever created, so signing out can empty all of them.
 *
 * A registry rather than each caller wiring its own teardown into the session
 * store, for two reasons. The session store would otherwise have to import
 * `lib/permissions.ts`, which imports the session store — a cycle that happens
 * to resolve today because both uses are deferred to runtime, and that this
 * repo has already been bitten by once when Turbopack declined to propagate a
 * constant across a module boundary. And the next shared resource somebody adds
 * is cleared on sign-out without anybody remembering to add it here.
 */
const created = new Set<{ clear: () => void }>();

/**
 * Empty every shared cache. Called by the session store on sign-out.
 *
 * Not "forget the previous user's answers" — the caches are keyed by id, so a
 * new session cannot read an old one's entry. It is for the component still
 * mounted at the moment of sign-out, which would otherwise keep rendering the
 * access it had until something unmounted it.
 */
export function clearSharedResources() {
  for (const resource of created) resource.clear();
}

type Entry<T> = {
  /**
   * Whether a value has landed, kept apart from the value itself.
   *
   * A resolved `0` is a real answer — `useIsManager` fetches a direct-report
   * count, and nobody reporting to you is a fact, not a missing one. Guarding
   * on `value !== null` would read that as "not loaded yet" and re-fetch it on
   * every mount, which is the storm this file exists to stop, reintroduced for
   * exactly the people it answers fastest for.
   */
  loaded: boolean;
  /** The resolved value, or `null` until one lands. Referentially stable between deliveries. */
  value: T | null;
  /** In flight, so a second reader waits on the first request rather than starting a second. */
  pending: Promise<void> | null;
  /** When the last attempt failed, so `RETRY_AFTER_MS` can be measured from it. */
  failedAt: number | null;
  /** Everybody currently rendering this key. */
  listeners: Set<() => void>;
};

export type SharedResource<T> = {
  /**
   * The value for `key`, or `null` while it is unknown — loading and genuinely
   * absent are the same on purpose, because a caller that must tell them apart
   * has a `loading` flag of its own to read (the session's, usually) and one
   * that does not should treat both as "do not offer this yet".
   *
   * A `null` key is the signed-out case: nothing is fetched and `null` comes
   * back, so a caller never has to guard the hook itself.
   */
  use: (key: string | null) => T | null;
  /** Drop a key and re-fetch it for everybody currently rendering it. */
  refresh: (key: string) => void;
  /**
   * Publish an answer somebody already has, to everybody rendering that key.
   *
   * For a mutation whose response **is** the new value — a PATCH that returns
   * the row it just wrote. `refresh` would be wrong there twice over: it blanks
   * the value first, so the screen that just saved flashes a loading state at
   * the person who pressed the button, and it spends a round trip re-reading
   * something the server has already handed over.
   *
   * Only ever call this with a server's own response. Writing a locally
   * assembled object here would put a guess in front of every other screen
   * reading the same key, which is the failure the shared cache exists to
   * prevent rather than to spread.
   */
  set: (key: string, value: T) => void;
  /** Forget everything. Called on sign-out so the next account starts clean. */
  clear: () => void;
};

export function createSharedResource<T>(
  fetcher: (key: string, signal?: AbortSignal) => Promise<T>,
): SharedResource<T> {
  const entries = new Map<string, Entry<T>>();

  function entryFor(key: string): Entry<T> {
    let entry = entries.get(key);
    if (!entry) {
      entry = {
        loaded: false,
        value: null,
        pending: null,
        failedAt: null,
        listeners: new Set(),
      };
      entries.set(key, entry);
    }
    return entry;
  }

  function emit(entry: Entry<T>) {
    for (const listener of entry.listeners) listener();
  }

  function load(key: string) {
    const entry = entryFor(key);
    if (entry.loaded || entry.pending) return;
    if (entry.failedAt !== null && Date.now() - entry.failedAt < RETRY_AFTER_MS)
      return;

    entry.pending = (async () => {
      try {
        const value = await fetcher(key);
        entry.value = value;
        entry.loaded = true;
        entry.failedAt = null;
      } catch {
        /* Left `null`. Every caller already has a fallback for "not known yet"
           — `usePermissions` keeps the access token's own claims — and blanking
           an interface because one read failed is the larger failure. */
        entry.failedAt = Date.now();
      } finally {
        entry.pending = null;
        emit(entry);
      }
    })();
  }

  const resource: SharedResource<T> = {
    use(key: string | null): T | null {
      const subscribe = useCallback(
        (onChange: () => void) => {
          if (key === null) return () => {};
          const entry = entryFor(key);
          entry.listeners.add(onChange);
          /* After hydration, which is what makes this the right place — see the
             header. Synchronous is fine: `load` starts a promise and returns. */
          load(key);
          return () => {
            entry.listeners.delete(onChange);
          };
        },
        [key],
      );

      const getSnapshot = useCallback(() => {
        if (key === null) return null;
        const entry = entries.get(key);
        return entry && entry.loaded ? entry.value : null;
      }, [key]);

      /* The server has no cache and must not pretend to: rendering a value here
         that the client's first pass cannot match is the hydration mismatch
         `persisted.ts` was restructured to remove. */
      const getServerSnapshot = useCallback(() => null, []);

      return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    },

    set(key: string, value: T) {
      const entry = entryFor(key);
      entry.loaded = true;
      entry.value = value;
      entry.failedAt = null;
      /* Any request still in flight will overwrite this when it lands, which is
         correct: it was issued later than whatever produced this value only if
         it also finishes later, and a read that finishes after a write reflects
         the write. */
      emit(entry);
    },

    refresh(key: string) {
      const entry = entries.get(key);
      if (!entry) return;
      entry.loaded = false;
      entry.value = null;
      entry.failedAt = null;
      emit(entry);
      load(key);
    },

    clear() {
      /* Listeners are kept and told, rather than dropped: a component still on
         screen at sign-out has to re-render to empty, and a cache that quietly
         held the previous account's answers is how somebody sees a colleague's
         permissions for one frame after switching. */
      for (const entry of entries.values()) {
        entry.loaded = false;
        entry.value = null;
        entry.pending = null;
        entry.failedAt = null;
        emit(entry);
      }
      for (const [key, entry] of entries) {
        if (entry.listeners.size === 0) entries.delete(key);
      }
    },
  };

  created.add(resource);
  return resource;
}
