"use client";

import { useSession } from "@/lib/store/session";
import { apiScreeningGateway } from "./api-gateway";
import { demoScreeningGateway } from "./demo-gateway";
import type { ScreeningGateway } from "./gateway";

/**
 * Which side the screening screens are talking to.
 *
 * The one place a screen learns whether it is connected. Everything else takes the
 * gateway and never asks, and a test replaces this module to hand in a fake.
 */
export function useScreeningGateway(): ScreeningGateway {
  const { isConnected } = useSession();
  return isConnected ? apiScreeningGateway : demoScreeningGateway;
}
