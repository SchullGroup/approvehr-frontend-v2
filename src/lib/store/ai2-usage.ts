"use client";

import { useSession } from "./session";
import { ai2Usage, type Ai2Usage } from "@/lib/api/ai2";
import { createSharedResource } from "@/lib/shared-resource";

/**
 * `GET /ai2/usage`, fetched once per organisation however many components
 * show the gauge. `refreshAi2Usage` is called after every completed turn in
 * `ai-chat.ts`/`ai2-chat.ts` so the gauge moves without a poll.
 */

const KEY = "org";

const usageResource = createSharedResource<Ai2Usage | null>(
  async (_key, signal) => {
    try {
      return await ai2Usage(signal);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        throw error;
      // Absent, not a claim about spend — the gauge just doesn't render.
      return null;
    }
  },
);

/** The organisation's usage this month, or `null` while offline, loading or unreadable. */
export function useAi2Usage(): Ai2Usage | null {
  const { isConnected } = useSession();
  return usageResource.use(isConnected ? KEY : null);
}

export function refreshAi2Usage(): void {
  usageResource.refresh(KEY);
}
