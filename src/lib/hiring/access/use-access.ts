"use client";

import { useSyncExternalStore } from "react";
import { useSession } from "@/lib/store/session";
import { apiAccessGateway } from "./api-gateway";
import { demoAccessGateway } from "./demo-gateway";
import type { AccessGateway } from "./gateway";

/**
 * Which side the access panel is talking to.
 *
 * The one place a screen learns whether it is connected. Everything else takes the
 * gateway and never asks, and a test replaces this module to hand in a fake.
 */
export function useAccessGateway(): AccessGateway {
  const { isConnected } = useSession();
  return isConnected ? apiAccessGateway : demoAccessGateway;
}

/* ------------------------------------------------- who is on a job, as it changes */

/**
 * A counter that goes up each time somebody is given access to a job or has it taken
 * away, so anything that offers those people (a panel's picker) asks again instead of
 * showing who was there when it loaded.
 */
let version = 0;
const listeners = new Set<() => void>();

export function accessChanged(): void {
  version += 1;
  for (const listener of listeners) listener();
}

export function useAccessVersion(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
    () => 0,
  );
}
