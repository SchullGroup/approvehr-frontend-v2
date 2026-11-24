"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { ObjectiveDraft } from "@/lib/performance/objective-wizard";
import { createPersistedState } from "./persisted";

/**
 * A new objective somebody left part-way, kept in this browser (owner request,
 * 24 Nov 2026: "draft kept if they leave").
 *
 * Kept when they move between steps or leave the wizard, never on a keystroke,
 * and per account, so a shared laptop does not open one person's half-written
 * objective for the next. It does not follow them to another device and
 * clearing site data removes it; the wizard says so beside the way to start
 * again. Sending it, or saving it as a draft on the server, throws it away: an
 * objective that exists is not a draft.
 *
 * Read with `read` for rendering and `current` for writing, see
 * `persisted.ts`.
 */

export type StoredObjectiveDraft = {
  draft: ObjectiveDraft;
  /** The step they were on, so carrying on lands where they left. */
  step: number;
  savedAt: string;
};

type Stored = { drafts: Record<string, StoredObjectiveDraft> };

const EMPTY: Stored = { drafts: {} };

const store = createPersistedState<Stored>({
  key: "approvehr.objective-draft.store",
  empty: EMPTY,
});

/** Test-only: forget everything, in memory as well as storage. */
export function resetObjectiveDrafts() {
  store.commit(EMPTY);
}

/**
 * The draft kept for this account, and the two things that change it.
 *
 * `owner` is the signed-in account's id. Null (nobody signed in yet) keeps and
 * returns nothing.
 */
export function useObjectiveDraft(
  owner: string | null,
  /** Which objective: a new one, or one being changed (`edit:<id>`). */
  slot: "new" | `edit:${string}` = "new",
) {
  /* A new one keeps the account's own key, which is what the first version
     wrote; one being changed has its own beside it. */
  const key =
    owner === null ? null : slot === "new" ? owner : `${owner}|${slot}`;
  const state = useSyncExternalStore(
    store.subscribe,
    store.read,
    store.getServerSnapshot,
  );
  const kept = key ? (state.drafts[key] ?? null) : null;

  const keep = useCallback(
    (draft: ObjectiveDraft, step: number) => {
      if (!key) return;
      const now = store.current();
      store.commit({
        drafts: {
          ...now.drafts,
          [key]: { draft, step, savedAt: new Date().toISOString() },
        },
      });
    },
    [key],
  );

  const discard = useCallback(() => {
    if (!key) return;
    const now = store.current();
    if (!(key in now.drafts)) return;
    const { [key]: _gone, ...rest } = now.drafts;
    void _gone;
    store.commit({ drafts: rest });
  }, [key]);

  return { kept, keep, discard };
}
