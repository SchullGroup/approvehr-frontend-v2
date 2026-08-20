"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * True once React has hydrated on the client, false during server render.
 *
 * Portals need a real document, so anything rendering into document.body has
 * to wait. Doing that with useState plus useEffect works but causes a
 * cascading render on mount. useSyncExternalStore gives React the server and
 * client answers directly, so there is no extra pass and no hydration warning.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
