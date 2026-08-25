"use client";

import { useSyncExternalStore } from "react";

import { createPersistedState } from "./persisted";

/**
 * Whether money figures are hidden on screen.
 *
 * ## One preference, not one per figure
 *
 * The request was an eye icon beside salaries so they can be hidden when
 * somebody is standing behind you. The obvious reading — a toggle per cell —
 * is the wrong one: a directory of two hundred people would need two hundred
 * clicks to become private, and the one row you forgot is the one that matters.
 * So the icon appears wherever money does, and every one of them drives this
 * single flag.
 *
 * ## Persisted, and that is the point
 *
 * Somebody who hides salaries before a screen share should not have them come
 * back when they open another page or refresh. It survives a reload for the
 * same reason a privacy setting always should: the failure is one-directional.
 * Forgetting that you hid them costs a click; forgetting that you revealed them
 * costs somebody their privacy.
 *
 * ## It hides, it does not protect
 *
 * The figures are in the page either way — this is a screen-privacy control,
 * not a permission. What decides whether somebody may *know* a salary is
 * `VIEW_SALARIES` on the server, which never sends the number at all. Nothing
 * here should ever be mistaken for that, which is why the label says "Hide"
 * rather than anything about access.
 */
const store = createPersistedState<{ hidden: boolean }>({
  key: "approvehr.money.privacy",
  empty: { hidden: false },
});

/** True when figures should be masked. Re-renders every `Money` on the page. */
export function useMoneyHidden(): boolean {
  return useSyncExternalStore(
    store.subscribe,
    // read-for-render: getSnapshot must return `.hidden` itself, so `store.read` cannot be passed bare here.
    () => store.read().hidden,
    /* The server never knows the preference, so it renders visible and the
       client corrects on its first subscribe — the hydration rule the whole of
       `persisted.ts` is arranged around. Masking is the safe direction to
       arrive at late: a figure that flashes visible for one frame on your own
       machine is not the leak this control is for. */
    () => store.getServerSnapshot().hidden,
  );
}

/** The flag plus its toggle, for the eye button. */
export function useMoneyPrivacy(): {
  hidden: boolean;
  toggle: () => void;
} {
  const hidden = useMoneyHidden();
  return {
    hidden,
    /* Reads through `current()` rather than `read()`: the toggle is a write and
       `read()` returns the seed until something has subscribed. See the header
       of `persisted.ts` — a write from a screen that never reads is what
       destroyed the offboarding store. */
    toggle: () => store.commit({ hidden: !store.current().hidden }),
  };
}
