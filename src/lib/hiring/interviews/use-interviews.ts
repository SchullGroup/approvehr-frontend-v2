"use client";

import { useSession } from "@/lib/store/session";
import { apiInterviewsGateway } from "./api-gateway";
import { demoInterviewsGateway } from "./demo-gateway";
import type { InterviewsGateway } from "./gateway";

/**
 * Which side the interview screens are talking to.
 *
 * The one place a screen learns whether it is connected. Everything else takes the
 * gateway and never asks, and a test replaces this module to hand in a fake.
 */
export function useInterviewsGateway(): InterviewsGateway {
  const { isConnected } = useSession();
  return isConnected ? apiInterviewsGateway : demoInterviewsGateway;
}
